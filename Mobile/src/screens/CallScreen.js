import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import {
  BackHandler,
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ping, PressableScale, Reanimated } from '../components/Motion';
import {
  AnimatedDots,
  CALL_PALETTE,
  CallAvatar,
  CallBackdrop,
  CallButton,
} from '../components/CallVisuals';
import { api } from '../services/api';
import { openItemDetail } from '../navigation/helpers';
import { formatDistanceLabel, formatPrice, resolveMediaUrl } from '../utils/listing';
import { haversineKm } from '../utils/locations';
import {
  declineIncomingCall,
  dismissIncomingCallNotification,
  isCallDeclined,
  setOngoingCallSpeaker,
  startOngoingCallService,
  stopOngoingCallService,
  subscribeOngoingCallHangUp,
} from '../services/callNotifications';
import { startIncomingRing, startOutgoingRing, stopCallSounds } from '../services/sounds';
import { dismissNativeIncomingUi } from '../services/callWatch';
import { callHaptic } from '../services/callHaptics';

function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function ensureMicrophonePermission() {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone',
      message: 'KinBech needs the microphone for this voice call.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export default function CallScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { name, image: rawImage, chatId } = route?.params || {};
  const image = resolveMediaUrl(rawImage || '');
  const [listing, setListing] = useState(route?.params?.listing || null);
  const [userCoords, setUserCoords] = useState(null);
  const incomingRef = useRef(Boolean(route?.params?.incoming));
  const isIncoming = incomingRef.current;
  const autoAnswer = Boolean(route?.params?.autoAnswer) && isIncoming && !isCallDeclined(chatId);
  const [shouldJoin, setShouldJoin] = useState(!isIncoming || autoAnswer);
  const [phase, setPhase] = useState(isIncoming && !autoAnswer ? 'incoming' : isIncoming ? 'connecting' : 'calling');
  const [callPlaced, setCallPlaced] = useState(false);
  const [detail, setDetail] = useState('');
  const [callDuration, setCallDuration] = useState('00:00');
  const [timeLeft, setTimeLeft] = useState(null);
  const maxSecondsRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const engineRef = useRef(null);
  const joinedRef = useRef(false);
  const closingRef = useRef(false);
  const closeFromRemoteRef = useRef(() => {});
  const isMutedRef = useRef(false);
  isMutedRef.current = isMuted;

  closeFromRemoteRef.current = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    stopCallSounds();
    callHaptic('remoteEnd');
    const engine = engineRef.current;
    if (engine && joinedRef.current) {
      try {
        engine.leaveChannel();
      } catch {
        /* already left */
      }
      joinedRef.current = false;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  const endForLimitRef = useRef(() => {});
  endForLimitRef.current = () => {
    if (closingRef.current || phase === 'failed') return;
    stopCallSounds();
    callHaptic('remoteEnd');
    if (chatId) api.endCall(chatId).catch(() => {});
    const engine = engineRef.current;
    if (engine && joinedRef.current) {
      try {
        engine.leaveChannel();
      } catch {
        /* already left */
      }
      joinedRef.current = false;
    }
    stopOngoingCallService();
    setPhase('failed');
    setDetail("Today's free call time is over. Calls open again at midnight.");
  };

  useEffect(() => {
    if (!chatId) return undefined;
    let cancelled = false;
    api.getMessages(chatId, { limit: 1 }).then(({ data }) => {
      if (!cancelled && data?.listing) setListing(data.listing);
    });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || !active) return;
        const last = await Location.getLastKnownPositionAsync();
        const position = last || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active || !position?.coords) return;
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {
        /* distance stays hidden */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isIncoming || !isCallDeclined(chatId)) return undefined;
    closeFromRemoteRef.current();
    return undefined;
  }, [chatId]);

  useEffect(() => {
    if (!isIncoming || !chatId) return undefined;
    dismissIncomingCallNotification(chatId);
    return undefined;
  }, [chatId, isIncoming]);

  useEffect(() => {
    if (!shouldJoin || (isIncoming && isCallDeclined(chatId))) return undefined;

    let cancelled = false;
    let agora;
    try {
      agora = require('react-native-agora');
    } catch {
      setPhase('failed');
      setDetail('Voice calling is still installing. Reopen the call after the app update finishes.');
      return undefined;
    }

    const {
      ChannelProfileType,
      ClientRoleType,
      createAgoraRtcEngine,
    } = agora;
    const engine = createAgoraRtcEngine();
    engineRef.current = engine;
    let accountId = '';
    let rejectionReported = false;
    // Agora rejected the App ID or token: the server switches new calls to the next account.
    const reportRejected = (reason) => {
      if (rejectionReported || !accountId) return;
      rejectionReported = true;
      api.reportCallFailure(chatId, { accountId, reason });
    };

    const handler = {
      onJoinChannelSuccess: () => {
        if (cancelled) return;
        joinedRef.current = true;
        startOngoingCallService({ chatId, callerName: name, callerImage: image });
        if (!isIncoming) return;
        setPhase((current) => (current === 'connected' ? current : 'connecting'));
      },
      onUserJoined: () => {
        if (cancelled) return;
        setPhase('connected');
      },
      onUserOffline: () => {
        if (cancelled) return;
        closeFromRemoteRef.current();
      },
      onError: (errorCode) => {
        if (cancelled || joinedRef.current) return;
        if ([101, 110].includes(errorCode)) reportRejected(`error:${errorCode}`);
        setPhase('failed');
        setDetail(`Agora could not start the call (${errorCode}).`);
      },
      onConnectionStateChanged: (_connection, _state, reason) => {
        if (cancelled) return;
        // The server sizes the token to today's remaining call time.
        if (reason === 9 && maxSecondsRef.current) {
          endForLimitRef.current();
          return;
        }
        if (![6, 8].includes(reason)) return;
        reportRejected(`reason:${reason}`);
        if (joinedRef.current) return;
        setPhase('failed');
        setDetail('Voice calling is busy right now. Please try again in a moment.');
      },
    };

    const startCall = async () => {
      if (!chatId) {
        setPhase('failed');
        setDetail('Open a chat before starting a voice call.');
        return;
      }

      if (isIncoming && isCallDeclined(chatId)) return;
      const allowed = await ensureMicrophonePermission();
      if (cancelled || (isIncoming && isCallDeclined(chatId))) return;
      if (!allowed) {
        setPhase('failed');
        setDetail('Allow microphone access to place a voice call.');
        return;
      }

      const { data, error } = await api.createCall(chatId, { join: isIncoming });
      if (cancelled || (isIncoming && isCallDeclined(chatId))) return;
      if (error || !data?.token || !data?.appId || !data?.channel) {
        if (/declined/i.test(error || '')) {
          closeFromRemoteRef.current();
          return;
        }
        setPhase('failed');
        setDetail(error || 'Could not start the Agora call.');
        return;
      }
      if (!isIncoming) setCallPlaced(true);
      accountId = data.accountId || '';
      maxSecondsRef.current = data.maxSeconds > 0 ? data.maxSeconds : null;
      setTimeLeft(maxSecondsRef.current);

      engine.registerEventHandler(handler);
      const initialized = engine.initialize({
        appId: data.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      if (initialized < 0) {
        setPhase('failed');
        setDetail('Agora voice engine could not start.');
        return;
      }

      engine.enableAudio();
      engine.setDefaultAudioRouteToSpeakerphone(false);
      const joined = engine.joinChannel(data.token, data.channel, data.uid, {
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        publishMicrophoneTrack: true,
        publishCameraTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: false,
      });
      if (joined < 0) {
        setPhase('failed');
        setDetail('Could not join the voice channel.');
      }
    };

    startCall().catch((error) => {
      if (cancelled) return;
      setPhase('failed');
      setDetail(error?.message || 'Could not start the voice call.');
    });

    return () => {
      cancelled = true;
      stopOngoingCallService();
      try {
        engine.unregisterEventHandler(handler);
        if (joinedRef.current) engine.leaveChannel();
        engine.release();
      } catch {
        /* engine may already be released */
      }
      engineRef.current = null;
      joinedRef.current = false;
    };
  }, [chatId, isIncoming, shouldJoin]);

  useEffect(() => {
    if (!chatId || isIncoming || !callPlaced) return undefined;
    if (phase !== 'calling' && phase !== 'ringing' && phase !== 'connected') return undefined;
    const timer = setInterval(async () => {
      const { data, error } = await api.getCallStatus(chatId);
      if (error) return;
      if (data?.status === 'ended') {
        closeFromRemoteRef.current();
        return;
      }
      if (data?.status === 'active') {
        setPhase('connected');
        return;
      }
      setPhase((current) => {
        if (current === 'connected') return current;
        if (data?.status === 'ringing') return 'ringing';
        if (current === 'ringing') return current;
        return 'calling';
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [callPlaced, chatId, isIncoming, phase]);

  useEffect(() => {
    if (!chatId || !isIncoming || phase !== 'incoming') return undefined;
    const mark = () => {
      api.markCallDelivered(chatId).catch(() => {});
    };
    mark();
    const timer = setInterval(mark, 1000);
    return () => clearInterval(timer);
  }, [chatId, isIncoming, phase]);

  useEffect(() => {
    if (!chatId || phase !== 'incoming') return undefined;
    const timer = setInterval(async () => {
      if (isCallDeclined(chatId)) {
        closeFromRemoteRef.current();
        return;
      }
      const { data, error } = await api.getIncomingCall();
      if (error) return;
      if (!data?.call || String(data.call.chatId) !== String(chatId)) {
        closeFromRemoteRef.current();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [chatId, phase]);

  useEffect(() => {
    if (phase === 'incoming') {
      dismissNativeIncomingUi();
      startIncomingRing();
      return () => stopCallSounds();
    }
    dismissNativeIncomingUi();
    if (phase === 'ringing' && !isIncoming) {
      engineRef.current?.muteLocalAudioStream(true);
      startOutgoingRing();
      return () => {
        stopCallSounds();
        if (!isMutedRef.current) engineRef.current?.muteLocalAudioStream(false);
      };
    }
    stopCallSounds();
    return undefined;
  }, [phase, isIncoming]);

  useEffect(() => {
    if (phase !== 'connected') return undefined;
    let seconds = 0;
    const interval = setInterval(() => {
      seconds += 1;
      setCallDuration(formatDuration(seconds));
      const max = maxSecondsRef.current;
      if (!max) return;
      setTimeLeft(Math.max(0, max - seconds));
      if (seconds >= max) endForLimitRef.current();
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const lastPhaseRef = useRef(phase);
  useEffect(() => {
    if (lastPhaseRef.current === phase) return;
    lastPhaseRef.current = phase;
    if (phase === 'connected') callHaptic('connected');
    else if (phase === 'failed') callHaptic('failed');
    else if (phase === 'ringing' && !isIncoming) callHaptic('ringing');
  }, [phase, isIncoming]);

  const answerCall = () => {
    callHaptic('answer');
    setPhase('connecting');
    setShouldJoin(true);
  };

  const endCall = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    stopCallSounds();
    callHaptic(phase === 'incoming' ? 'decline' : 'end');
    if (chatId) {
      if (isIncoming) declineIncomingCall(chatId);
      else api.endCall(chatId).catch(() => {});
    }
    const engine = engineRef.current;
    if (engine && joinedRef.current) {
      try {
        engine.leaveChannel();
      } catch {
        /* already left */
      }
      joinedRef.current = false;
    }
    navigation.goBack();
  };

  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;
  const answerCallRef = useRef(answerCall);
  answerCallRef.current = answerCall;
  const finishedRef = useRef(false);
  finishedRef.current = phase === 'failed' || phase === 'ended';

  useEffect(() => subscribeOngoingCallHangUp(chatId, () => endCallRef.current()), [chatId]);

  useEffect(() => {
    if (route?.params?.autoAnswer && isIncoming && phase === 'incoming' && !isCallDeclined(chatId)) {
      answerCallRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.autoAnswer]);

  // Leaving this screen leaves the voice channel, so Back must not end a live call by accident.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => navigation.isFocused() && !finishedRef.current
    );
    return () => subscription.remove();
  }, [navigation]);

  const toggleMute = () => {
    const next = !isMuted;
    callHaptic(next ? 'toggleOn' : 'toggleOff');
    setIsMuted(next);
    engineRef.current?.muteLocalAudioStream(next);
  };

  const toggleSpeaker = () => {
    const next = !isSpeakerOn;
    callHaptic(next ? 'toggleOn' : 'toggleOff');
    setIsSpeakerOn(next);
    engineRef.current?.setEnableSpeakerphone(next);
    setOngoingCallSpeaker(next);
  };

  const listingId = listing?.id || listing?._id;
  const listingPhoto = listing?.photos?.[0] ? resolveMediaUrl(listing.photos[0]) : '';
  const listingPrice = listing?.price != null && listing?.price !== '' ? formatPrice(listing.price) : '';
  const listingPlace = String(listing?.location || '').trim();
  const listingLat = Number(listing?.coordinates?.lat);
  const listingLng = Number(listing?.coordinates?.lng);
  const distanceLabel =
    userCoords && Number.isFinite(listingLat) && Number.isFinite(listingLng)
      ? formatDistanceLabel(haversineKm(userCoords.lat, userCoords.lng, listingLat, listingLng))
      : '';

  const openListing = () => {
    if (!listingId) return;
    openItemDetail(navigation, {
      listingId,
      item: listing,
      sharedId: listingId,
    });
  };

  const connected = phase === 'connected';
  const finished = phase === 'failed' || phase === 'ended';
  const dotted = ['incoming', 'calling', 'ringing', 'connecting'].includes(phase);

  const statusLabel =
    phase === 'incoming'
      ? 'Incoming call'
      : phase === 'ringing'
        ? 'Ringing'
        : phase === 'calling'
          ? 'Calling'
          : phase === 'ended'
            ? 'The other person left the call'
            : phase === 'failed'
              ? detail || 'Call failed'
              : 'Connecting';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <CallBackdrop />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale onPress={endCall} hitSlop={12} contentStyle={styles.headerBtn}>
          <Icon name="chevron-down" size={26} color={CALL_PALETTE.text} />
        </PressableScale>
        <Reanimated.View entering={FadeInDown.duration(420)} style={styles.brandPill}>
          <Text style={styles.brandText}>KinBech · Voice call</Text>
        </Reanimated.View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <CallAvatar image={image} name={name} waving={!finished} />

        <Reanimated.Text entering={FadeInDown.delay(140).duration(420)} style={styles.name} numberOfLines={1}>
          {name || 'Unknown'}
        </Reanimated.Text>

        <Reanimated.View key={phase} entering={FadeIn.duration(280)} style={styles.statusRow}>
          {connected ? (
            <View style={styles.timerWrap}>
              <View style={styles.timerPill}>
                <Ping size={6} color="#4ADE80" />
                <Text style={styles.timer}>{callDuration}</Text>
              </View>
              {timeLeft != null ? (
                <Text style={[styles.timeLeft, timeLeft <= 60 && styles.timeLeftLow]}>
                  {`${formatDuration(timeLeft)} call time left today`}
                </Text>
              ) : null}
            </View>
          ) : (
            <AnimatedDots
              text={statusLabel}
              active={dotted}
              style={[styles.status, finished && styles.statusError]}
            />
          )}
        </Reanimated.View>

        {listing?.title ? (
          <Reanimated.View entering={FadeInDown.delay(280).duration(460)} style={styles.itemCard}>
            <View style={styles.itemTop}>
              {listingPhoto ? (
                <Image source={{ uri: listingPhoto }} style={styles.itemPhoto} />
              ) : (
                <View style={styles.itemPhotoFallback}>
                  <Icon name="image-outline" size={22} color={CALL_PALETTE.faint} />
                </View>
              )}
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle} numberOfLines={2}>{listing.title}</Text>
                {listingPrice ? <Text style={styles.itemPrice}>{listingPrice}</Text> : null}
              </View>
              <Pressable style={styles.detailsBtn} onPress={openListing}>
                <Text style={styles.detailsBtnText}>View</Text>
                <Icon name="chevron-forward" size={14} color="#064E3B" />
              </Pressable>
            </View>
            {listingPlace || distanceLabel ? (
              <View style={styles.itemMeta}>
                <Icon name="location-outline" size={14} color={CALL_PALETTE.faint} />
                <Text style={styles.itemPlace} numberOfLines={1}>
                  {listingPlace || 'Location'}
                </Text>
                {distanceLabel ? <Text style={styles.itemDistance}>{distanceLabel}</Text> : null}
              </View>
            ) : null}
          </Reanimated.View>
        ) : null}
      </View>

      <Reanimated.View
        entering={FadeInUp.delay(200).duration(480)}
        style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}
      >
        {phase === 'incoming' ? (
          <View style={styles.incomingRow}>
            <View style={styles.answerCol}>
              <CallButton tone="decline" icon="call" iconRotate={135} label="Decline" size={76} onPress={endCall} />
            </View>
            <View style={styles.answerCol}>
              <CallButton tone="answer" icon="call" label="Answer" size={76} onPress={answerCall} />
            </View>
          </View>
        ) : (
          <View style={styles.panel}>
            {finished ? null : (
              <View style={styles.panelCol}>
                <CallButton
                  icon={isMuted ? 'mic-off' : 'mic'}
                  label={isMuted ? 'Unmute' : 'Mute'}
                  active={isMuted}
                  size={58}
                  onPress={toggleMute}
                />
              </View>
            )}
            {finished ? null : (
              <View style={styles.panelCol}>
                <CallButton
                  icon={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                  label="Speaker"
                  active={isSpeakerOn}
                  size={58}
                  onPress={toggleSpeaker}
                />
              </View>
            )}
            <View style={styles.panelCol}>
              <CallButton
                tone="decline"
                icon={finished ? 'close' : 'call'}
                iconRotate={finished ? 0 : 135}
                label={finished ? 'Close' : 'End call'}
                size={58}
                onPress={endCall}
              />
            </View>
          </View>
        )}
      </Reanimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CALL_PALETTE.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CALL_PALETTE.glass,
    borderWidth: 1,
    borderColor: CALL_PALETTE.glassBorder,
  },
  headerSpacer: {
    width: 44,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: CALL_PALETTE.glass,
    borderWidth: 1,
    borderColor: CALL_PALETTE.glassBorder,
  },
  brandText: {
    fontSize: 13,
    fontWeight: '500',
    color: CALL_PALETTE.muted,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  name: {
    marginTop: 4,
    maxWidth: '100%',
    fontSize: 30,
    fontWeight: '800',
    color: CALL_PALETTE.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  statusRow: {
    marginTop: 10,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    fontSize: 16,
    fontWeight: '600',
    color: CALL_PALETTE.muted,
    textAlign: 'center',
  },
  statusError: {
    color: CALL_PALETTE.danger,
  },
  timerWrap: {
    alignItems: 'center',
    gap: 8,
  },
  timeLeft: {
    fontSize: 12.5,
    fontWeight: '600',
    color: CALL_PALETTE.faint,
    fontVariant: ['tabular-nums'],
  },
  timeLeftLow: {
    color: '#FBBF24',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.35)',
  },
  timer: {
    fontSize: 16,
    fontWeight: '700',
    color: CALL_PALETTE.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  itemCard: {
    marginTop: 26,
    width: '100%',
    gap: 10,
    padding: 12,
    borderRadius: 22,
    backgroundColor: CALL_PALETTE.glass,
    borderWidth: 1,
    borderColor: CALL_PALETTE.glassBorder,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemPhoto: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemPhotoFallback: {
    width: 54,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: CALL_PALETTE.text,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: CALL_PALETTE.mint,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  itemPlace: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: CALL_PALETTE.muted,
  },
  itemDistance: {
    flexShrink: 0,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '800',
    color: CALL_PALETTE.mint,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CALL_PALETTE.mint,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  controls: {
    paddingHorizontal: 24,
  },
  incomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 16,
  },
  answerCol: {
    flex: 1,
    alignItems: 'center',
  },
  panel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 6,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  panelCol: {
    flex: 1,
    alignItems: 'center',
  },
});
