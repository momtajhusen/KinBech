import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  Image,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { openItemDetail } from '../navigation/helpers';
import { formatDistanceLabel, formatPrice, resolveMediaUrl } from '../utils/listing';
import { haversineKm } from '../utils/locations';
import {
  declineIncomingCall,
  dismissIncomingCallNotification,
  isCallDeclined,
} from '../services/callNotifications';
import { startIncomingRing, startOutgoingRing, stopCallSounds } from '../services/sounds';
import { dismissNativeIncomingUi } from '../services/callWatch';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { name, image, chatId } = route?.params || {};
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

    const handler = {
      onJoinChannelSuccess: () => {
        if (cancelled) return;
        joinedRef.current = true;
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
        setPhase('failed');
        setDetail(`Agora could not start the call (${errorCode}).`);
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
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const answerCall = () => {
    setPhase('connecting');
    setShouldJoin(true);
  };

  const endCall = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    stopCallSounds();
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

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    engineRef.current?.muteLocalAudioStream(next);
  };

  const toggleSpeaker = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    engineRef.current?.setEnableSpeakerphone(next);
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

  const headerLabel =
    phase === 'incoming'
      ? 'Incoming call'
      : phase === 'connected'
        ? 'Connected'
        : phase === 'ringing'
          ? 'Ringing'
          : phase === 'calling'
            ? 'Calling'
            : phase === 'ended'
              ? 'Call ended'
              : phase === 'failed'
                ? 'Call failed'
                : 'Connecting';

  const statusLabel =
    phase === 'incoming'
      ? 'Answer to join the call'
      : phase === 'connected'
        ? callDuration
        : phase === 'ringing'
          ? 'Ringing'
          : phase === 'calling'
            ? 'Calling'
            : phase === 'ended'
              ? 'The other person left the call'
              : phase === 'failed'
                ? detail
                : 'Connecting';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.headerContent}>
          <Pressable onPress={endCall} hitSlop={12} style={styles.backBtn}>
            <View style={styles.backBtnInner}>
              <Icon name="arrow-down" size={24} color={colors.onGradient} />
            </View>
          </Pressable>

          <View style={styles.headerInfo}>
            <View style={styles.callStatusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.headerStatus}>{headerLabel}</Text>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Pressable hitSlop={15} style={styles.headerActionBtn}>
              <Icon name="ellipsis-vertical" size={24} color={colors.onGradient} />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              {image ? (
                <Image source={{ uri: image }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{name?.charAt(0)?.toUpperCase() || 'U'}</Text>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.name}>{name || 'Unknown'}</Text>
        <Text style={styles.status}>{statusLabel}</Text>

        {listing?.title ? (
          <View style={styles.itemCard}>
            <View style={styles.itemTop}>
              {listingPhoto ? (
                <Image source={{ uri: listingPhoto }} style={styles.itemPhoto} />
              ) : (
                <View style={styles.itemPhotoFallback}>
                  <Icon name="image-outline" size={22} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle} numberOfLines={2}>{listing.title}</Text>
                {listingPrice ? <Text style={styles.itemPrice}>{listingPrice}</Text> : null}
              </View>
              <Pressable style={styles.detailsBtn} onPress={openListing}>
                <Text style={styles.detailsBtnText}>View details</Text>
              </Pressable>
            </View>
            {listingPlace || distanceLabel ? (
              <View style={styles.itemMeta}>
                <Icon name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.itemPlace} numberOfLines={1}>
                  {listingPlace || 'Location'}
                </Text>
                {distanceLabel ? <Text style={styles.itemDistance}>{distanceLabel}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 40 }]}>
        {phase === 'incoming' ? (
          <View style={styles.endCallRow}>
            <View style={styles.incomingAction}>
              <Pressable style={styles.endCallBtn} onPress={endCall}>
                <Icon name="call" size={32} color={colors.onGradient} />
              </Pressable>
              <Text style={styles.controlLabel}>Decline</Text>
            </View>
            <View style={styles.incomingAction}>
              <Pressable style={styles.answerBtn} onPress={answerCall}>
                <Icon name="call" size={32} color={colors.onGradient} />
              </Pressable>
              <Text style={styles.controlLabel}>Answer</Text>
            </View>
          </View>
        ) : null}
        {phase === 'incoming' ? null : (
        <>
        <View style={styles.controlRow}>
          <Pressable
            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
            onPress={toggleMute}
          >
            <View
              style={[
                styles.controlBtnInner,
                isMuted && { backgroundColor: colors.primary },
              ]}
            >
              <Icon
                name={isMuted ? 'mic-off' : 'mic'}
                size={26}
                color={isMuted ? colors.onPrimary : colors.text}
              />
            </View>
            <Text style={styles.controlLabel}>Mute</Text>
          </Pressable>

          <Pressable
            style={[styles.controlBtn, isSpeakerOn && styles.controlBtnActive]}
            onPress={toggleSpeaker}
          >
            <View
              style={[
                styles.controlBtnInner,
                isSpeakerOn && { backgroundColor: colors.primary },
              ]}
            >
              <Icon
                name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
                size={26}
                color={isSpeakerOn ? colors.onPrimary : colors.text}
              />
            </View>
            <Text style={styles.controlLabel}>Speaker</Text>
          </Pressable>
        </View>

        <View style={styles.endCallRow}>
          <Pressable style={styles.endCallBtn} onPress={endCall}>
            <Icon name="call" size={32} color={colors.onGradient} />
          </Pressable>
        </View>
        </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  callStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  statusDotPulse: {
    shadowColor: '#4ade80',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  headerStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onGradient,
  },
  headerRight: {
    width: 50,
    alignItems: 'flex-end',
  },
  headerActionBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 32,
  },
  avatarRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.iconBackground || colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.text,
  },
  name: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  status: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '500',
  },
  itemCard: {
    marginTop: 28,
    width: '100%',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemPhoto: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  itemPhotoFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryBright || colors.primary,
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
    color: colors.text,
  },
  itemDistance: {
    flexShrink: 0,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  detailsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  controls: {
    paddingHorizontal: 20,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 40,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 8,
  },
  controlBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: {
    opacity: 1,
  },
  controlLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
  },
  endCallRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 48,
  },
  incomingAction: {
    alignItems: 'center',
    gap: 8,
  },
  answerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3b30',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
