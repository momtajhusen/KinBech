import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { playNewMessageSound, setActiveChatId } from '../services/sounds';
import { dismissChatAlerts } from '../services/pushAlerts';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { uploadMediaUri } from '../utils/mediaUpload';
import VoiceCapture, { VoiceBubble } from '../components/VoiceMessage';
import { useKeyboardOverlap } from '../components/FormScroll';
import {
  CHAT_SAFETY_BANNER,
  EXTERNAL_LINK_WARNING,
  isTrustedChatUrl,
  messageHasExternalUrl,
  splitTextWithUrls,
} from '../utils/chatSafety';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

function formatTime(dateValue) {
  if (!dateValue) return '';
  return new Date(dateValue)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    .replace(/^0/, '');
}

function dayKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((start(new Date()) - start(date)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'long' });
  }
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

function buildChatRows(messages) {
  const rows = [];
  let lastDay = '';
  messages.forEach((message) => {
    const key = dayKey(message.createdAt);
    if (key && key !== lastDay) {
      rows.push({
        type: 'date',
        id: `day-${key}`,
        label: formatDayLabel(message.createdAt),
      });
      lastDay = key;
    }
    rows.push({ type: 'message', id: String(message.id), message });
  });
  return rows;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function callLogCopy(message) {
  const status = message.callStatus;
  const isMe = message.sender === 'me';
  const missed = status === 'missed' || (status === 'cancelled' && !isMe);
  const declined = status === 'rejected';
  if (missed) {
    return { title: 'Missed voice call', detail: 'No answer', tone: 'missed' };
  }
  if (declined) {
    return {
      title: 'Voice call',
      detail: isMe ? 'Declined' : 'You declined',
      tone: 'declined',
    };
  }
  if (status === 'cancelled') {
    return { title: 'Voice call', detail: 'Cancelled', tone: 'cancelled' };
  }
  return { title: 'Voice call', detail: message.durationLabel || '0:00', tone: 'answered' };
}

const VIEW_WINDOW_MS = 5000;

function mapMessage(message) {
  return {
    id: message.id,
    sender: message.mine ? 'me' : 'them',
    text: message.text,
    time: formatTime(message.createdAt),
    createdAt: message.createdAt,
    read: Boolean(message.viewedAt),
    viewedAt: message.viewedAt || null,
    edited: Boolean(message.editedAt),
    deleted: Boolean(message.deleted),
    kind: message.kind || 'text',
    callStatus: message.call?.status || '',
    durationLabel: formatDuration(message.call?.durationSec || message.audio?.durationSec),
    audioUrl: message.audio?.url ? resolveMediaUrl(message.audio.url) : '',
    reply: message.reply
      ? {
          id: message.reply.id,
          text: message.reply.text || '',
          mine: Boolean(message.reply.mine),
          deleted: Boolean(message.reply.deleted),
        }
      : null,
  };
}

function seenWindowOpen(message, now) {
  if (!message?.viewedAt) return true;
  return now - new Date(message.viewedAt).getTime() <= VIEW_WINDOW_MS;
}

function messagePowers(message, now) {
  if (!message || message.deleted) {
    return { copy: false, reply: false, edit: false, deleteMe: false, deleteAll: false };
  }
  const mine = message.sender === 'me';
  const open = seenWindowOpen(message, now);
  return {
    copy: message.kind === 'text',
    reply: message.kind !== 'call',
    edit: mine && open && message.kind === 'text',
    deleteAll: mine && !message.viewedAt && message.kind !== 'call',
    deleteMe: mine ? open : true,
  };
}

function SwipeReply({ enabled, onReply, mine, children }) {
  const drag = useRef(new Animated.Value(0)).current;
  const enabledRef = useRef(enabled);
  const replyRef = useRef(onReply);
  enabledRef.current = enabled;
  replyRef.current = onReply;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        enabledRef.current && gesture.dx > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderMove: (_, gesture) => {
        drag.setValue(Math.max(0, Math.min(68, gesture.dx)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (enabledRef.current && gesture.dx > 52) replyRef.current?.();
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
      },
    })
  ).current;

  return (
    <View style={[stylesSwipe.wrap, mine ? stylesSwipe.mine : stylesSwipe.theirs]}>
      <Animated.View
        style={[
          stylesSwipe.icon,
          {
            opacity: drag.interpolate({ inputRange: [0, 48], outputRange: [0, 1], extrapolate: 'clamp' }),
          },
        ]}
      >
        <Ionicons name="arrow-undo" size={18} color="#8696A0" />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: drag }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const stylesSwipe = {
  wrap: {
    maxWidth: '82%',
    position: 'relative',
    flexDirection: 'row',
  },
  theirs: { alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
  icon: {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
};

function Avatar({ size = 40, styles, imageUrl, name }) {
  const [failed, setFailed] = useState(false);
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const showImage = Boolean(imageUrl) && !failed;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {showImage ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.avatarImage}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.avatarLetter, { fontSize: Math.round(size * 0.42) }]}>{letter}</Text>
      )}
    </View>
  );
}

function CallLogBubble({ message, styles, onPress }) {
  const copy = callLogCopy(message);
  const missed = copy.tone === 'missed';
  const iconColor = missed ? '#EF4444' : copy.tone === 'answered' ? '#22C55E' : '#F59E0B';
  return (
    <Pressable onPress={onPress} style={styles.callLog}>
      <View style={[styles.callLogIcon, { backgroundColor: iconColor }]}>
        <Ionicons
          name="call"
          size={16}
          color="#FFFFFF"
          style={copy.tone === 'answered' ? undefined : styles.callLogIconHangup}
        />
      </View>
      <View style={styles.callLogText}>
        <Text style={styles.callLogTitle}>{copy.title}</Text>
        <Text style={styles.callLogDetail}>{copy.detail}</Text>
      </View>
    </Pressable>
  );
}

function presenceLabel(presence) {
  if (!presence) return '';
  if (presence.typing) return 'typing...';
  if (presence.online) return 'online';
  if (!presence.lastSeenAt) return '';
  const date = new Date(presence.lastSeenAt);
  if (Number.isNaN(date.getTime())) return '';
  const time = formatTime(date);
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((start(new Date()) - start(date)) / 86400000);
  if (diffDays === 0) return time;
  if (diffDays === 1) return `yesterday ${time}`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function MessageBody({ text, isMe, styles, onLinkPress, time, read, edited }) {
  const parts = splitTextWithUrls(text);
  return (
    <View>
      <View style={styles.textWrap}>
      <Text style={isMe ? styles.bubbleTextMe : styles.bubbleTextThem}>
        {parts.map((part, index) => {
          if (part.type !== 'url') {
            return <Text key={`t-${index}`}>{part.value}</Text>;
          }
          return (
            <Text
              key={`u-${index}`}
              style={isMe ? styles.linkMe : styles.linkThem}
              onPress={() => onLinkPress?.(part.href, isTrustedChatUrl(part.href))}
            >
              {part.value}
            </Text>
          );
        })}
      </Text>
      </View>
      <View style={styles.timeRow}>
        {edited ? <Text style={styles.editedLabel}>edited</Text> : null}
        <Text style={styles.timeLabel}>{time}</Text>
        {isMe ? (
          <Ionicons
            name="checkmark-done"
            size={15}
            color={read ? '#53BDEB' : 'rgba(233,237,239,0.7)'}
          />
        ) : null}
      </View>
    </View>
  );
}

export default function ChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const contactName = route?.params?.name || 'Seller';
  const chatId = route?.params?.chatId;
  const listing = route?.params?.listing;
  const otherUserId = route?.params?.otherUserId;
  const contactImage = route?.params?.image;
  const listingId = listing?.id || listing?._id;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [linkAlert, setLinkAlert] = useState(null);
  const [sendAlert, setSendAlert] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);
  const [presence, setPresence] = useState(null);
  const [recording, setRecording] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuMessage, setMenuMessage] = useState(null);
  const [menuMode, setMenuMode] = useState('actions');
  const [now, setNow] = useState(Date.now());
  const [recordMs, setRecordMs] = useState(0);
  const [sendingVoice, setSendingVoice] = useState(false);
  const captureRef = useRef(null);
  const [peer, setPeer] = useState(null);
  const [chatListing, setChatListing] = useState(null);
  const typingSentAtRef = useRef(0);
  const typingStopRef = useRef(null);
  const seenMessageIdsRef = useRef(new Set());
  const messagesReadyRef = useRef(false);
  const listRef = useRef(null);
  const lastMessageIdRef = useRef('');
  const stickToBottomRef = useRef(true);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 60);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const { data } = await api.getMessages(chatId);
    const next = (data?.messages || []).map(mapMessage);
    const freshText = next.filter(
      (message) =>
        message.sender === 'them' &&
        message.kind !== 'call' &&
        !seenMessageIdsRef.current.has(String(message.id))
    );
    next.forEach((message) => seenMessageIdsRef.current.add(String(message.id)));
    if (messagesReadyRef.current && freshText.length > 0) {
      const newest = freshText[freshText.length - 1];
      playNewMessageSound(chatId, newest.createdAt);
    }
    messagesReadyRef.current = true;
    setMessages(next);
    if (data?.presence) setPresence(data.presence);
    if (data?.peer) setPeer(data.peer);
    if (data?.listing) setChatListing(data.listing);
  }, [chatId]);

  const { refreshing, onRefresh } = usePullRefresh(loadMessages);

  useEffect(() => {
    seenMessageIdsRef.current = new Set();
    messagesReadyRef.current = false;
    lastMessageIdRef.current = '';
    if (!chatId) return undefined;
    loadMessages();
    const interval = setInterval(loadMessages, 2000);
    return () => clearInterval(interval);
  }, [chatId, loadMessages]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const id = String(last.id);
    if (id === lastMessageIdRef.current) return;
    const isFirst = lastMessageIdRef.current === '';
    lastMessageIdRef.current = id;
    stickToBottomRef.current = true;
    scrollToLatest(!isFirst);
  }, [messages, scrollToLatest]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSub = Keyboard.addListener(showEvent, () => {
      if (stickToBottomRef.current) scrollToLatest(true);
    });
    return () => showSub.remove();
  }, [scrollToLatest]);

  useFocusEffect(
    useCallback(() => {
      setActiveChatId(chatId);
      dismissChatAlerts(chatId);
      loadMessages();
      return () => setActiveChatId('');
    }, [chatId, loadMessages])
  );

  const startCall = () => {
    if (!chatId) {
      setAlertConfig(
        showErrorAlert({
          title: 'Call unavailable',
          message: 'Open a chat before starting a voice call.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    navigation.navigate(ROUTES.CALL, {
      chatId,
      name: peer?.name || contactName,
      image: resolveMediaUrl(peer?.avatarUrl || '') || contactImage,
      listing: shownListing
        ? {
            id: pinnedId,
            title: pinnedTitle || shownListing.title || '',
            price: shownListing.price,
            photos: shownListing.photos || [],
          }
        : undefined,
    });
  };

  const openExternalLink = useCallback(async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleLinkPress = useCallback((url, trusted) => {
    if (trusted) {
      openExternalLink(url);
      return;
    }
    setLinkAlert({
      mode: 'open',
      url,
      title: EXTERNAL_LINK_WARNING.title,
      message: `${EXTERNAL_LINK_WARNING.message}\n\n${url}`,
    });
  }, [openExternalLink]);

  const onDraftChange = (text) => {
    setDraft(text);
    if (!chatId) return;
    const active = Boolean(text.trim());
    const now = Date.now();
    if (active && now - typingSentAtRef.current > 2000) {
      typingSentAtRef.current = now;
      api.setTyping(chatId, true).catch(() => {});
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => {
      api.setTyping(chatId, false).catch(() => {});
    }, active ? 2500 : 0);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sendMessage = useCallback(async (value, replyId) => {
    if (!value || !chatId) return;
    setDraft('');
    setReplyingTo(null);
    api.setTyping(chatId, false).catch(() => {});
    const { data, error } = await api.sendMessage(chatId, value, { replyTo: replyId || undefined });
    if (data?.message && typeof data.message === 'object') {
      setMessages((prev) => [...prev, mapMessage(data.message)]);
      return;
    }
    setDraft(value);
    const serverMsg =
      (typeof data?.message === 'string' && data.message) ||
      (typeof error === 'string' && error) ||
      'Could not send message. Please try again.';
    setAlertConfig(
      showErrorAlert({
        title: 'Message not sent',
        message: serverMsg,
        onConfirm: () => setAlertConfig(null),
      })
    );
  }, [chatId]);

  const saveEdit = async (value) => {
    if (!editing || !chatId) return;
    setDraft('');
    const { data, error } = await api.editMessage(chatId, editing.id, value);
    if (data?.message && typeof data.message === 'object') {
      const next = mapMessage(data.message);
      setMessages((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      setEditing(null);
      return;
    }
    setDraft(value);
    setAlertConfig(
      showErrorAlert({
        title: 'Could not edit',
        message:
          (typeof data?.message === 'string' && data.message) ||
          (typeof error === 'string' && error) ||
          'This message can no longer be edited.',
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const send = async (text) => {
    const value = text.trim();
    if (!value || !chatId) return;
    if (editing) {
      await saveEdit(value);
      return;
    }

    if (messageHasExternalUrl(value)) {
      setLinkAlert({
        mode: 'send',
        pendingSend: value,
        title: 'Sending an external link',
        message:
          'You are about to send a link outside KinBech. Reminder: KinBech support never asks for passwords, OTP codes, or bank details in chat. Continue only if this link is safe.',
      });
      return;
    }

    await sendMessage(value, replyingTo?.id);
  };

  const beginReply = (message) => {
    if (!message || message.deleted) return;
    setEditing(null);
    setMenuMessage(null);
    setReplyingTo(message);
  };

  const beginEdit = (message) => {
    setReplyingTo(null);
    setMenuMessage(null);
    setEditing(message);
    setDraft(message.text || '');
  };

  const copyMessage = async (message) => {
    setMenuMessage(null);
    if (!message?.text) return;
    await Clipboard.setStringAsync(message.text);
  };

  const removeMessage = async (message, scope) => {
    setMenuMessage(null);
    if (!chatId || !message) return;
    const { data, error } = await api.deleteMessage(chatId, message.id, scope);
    if (error || (data?.message && typeof data.message === 'string' && !data.id)) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not delete',
          message: (typeof data?.message === 'string' && data.message) || error || 'Try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    if (scope === 'me') {
      setMessages((prev) => prev.filter((item) => item.id !== message.id));
      return;
    }
    if (data?.message && typeof data.message === 'object') {
      const next = mapMessage(data.message);
      setMessages((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    }
  };

  const showVoiceError = (message) => {
    setRecording(false);
    setRecordMs(0);
    setSendingVoice(false);
    setAlertConfig(
      showErrorAlert({
        title: 'Voice message',
        message,
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const handleMic = () => {
    if (recording || sendingVoice || editing) return;
    setRecordMs(0);
    setRecording(true);
  };

  const cancelRecording = async () => {
    try {
      await captureRef.current?.cancel();
    } catch {
      /* already stopped */
    }
    setRecording(false);
    setRecordMs(0);
  };

  const sendRecording = async () => {
    if (!chatId || !captureRef.current || sendingVoice) return;
    setSendingVoice(true);
    try {
      const result = await captureRef.current.finish();
      setRecording(false);
      if (!result?.uri) {
        showVoiceError('Recording is too short. Record a little longer, then tap send.');
        return;
      }
      const uploaded = await uploadMediaUri(result.uri, 'voice');
      if (uploaded.error || !uploaded.url) {
        showVoiceError(uploaded.error || 'Could not upload the voice message.');
        return;
      }
      const { data, error } = await api.sendVoiceMessage(chatId, {
        audioUrl: uploaded.url,
        durationSec: result.durationSec,
        replyTo: replyingTo?.id,
      });
      if (data?.message && typeof data.message === 'object') {
        setReplyingTo(null);
        setMessages((prev) => [...prev, mapMessage(data.message)]);
        return;
      }
      const serverMsg =
        (typeof data?.message === 'string' && data.message) ||
        (typeof error === 'string' && error) ||
        'Could not send the voice message.';
      showVoiceError(serverMsg);
    } catch (error) {
      showVoiceError(error?.message || 'Could not send the voice message.');
    } finally {
      setSendingVoice(false);
      setRecordMs(0);
    }
  };

  const shownListing = chatListing || listing;
  const shownName = peer?.name || contactName;
  const shownImage = resolveMediaUrl(peer?.avatarUrl || '') || contactImage || '';
  const pinnedTitle = shownListing?.title || '';
  const pinnedPrice = shownListing?.price != null ? formatPrice(shownListing.price) : '';
  const pinnedImage = shownListing?.photos?.[0] ? resolveMediaUrl(shownListing.photos[0]) : '';
  const pinnedId = shownListing?.id || shownListing?._id || listingId;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
          </Pressable>

          <View style={styles.contactWrap}>
            <Avatar size={42} styles={styles} imageUrl={shownImage} name={shownName} />
            <View style={styles.contactText}>
              <Text style={styles.contactName} numberOfLines={1}>{shownName}</Text>
              <Text
                style={[
                  styles.contactStatus,
                  (presence?.online || presence?.typing) && styles.contactStatusLive,
                ]}
                numberOfLines={1}
              >
                {presenceLabel(presence)}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              hitSlop={10}
              style={styles.iconBtn}
              onPress={startCall}
            >
              <Ionicons name="call-outline" size={22} color={colors.onGradient} />
            </Pressable>
            <Pressable
              hitSlop={10}
              style={styles.iconBtn}
              onPress={() => navigation.navigate(ROUTES.REPORT_BLOCK, { userId: otherUserId })}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={colors.onGradient} />
            </Pressable>
          </View>
        </View>

        {pinnedTitle || pinnedImage ? (
          <View style={styles.pinnedStack}>
            <Pressable
              style={styles.pinnedCard}
              onPress={() =>
                pinnedId &&
                openItemDetail(navigation, {
                  listingId: pinnedId,
                  item: shownListing,
                  sharedId: pinnedId,
                })
              }
            >
              <View style={styles.pinnedThumb}>
                {pinnedImage ? (
                  <Image
                    source={{ uri: pinnedImage }}
                    style={styles.pinnedThumbImage}
                    sharedTransitionTag={pinnedId ? `item.${pinnedId}.photo` : undefined}
                  />
                ) : (
                  <Ionicons name="image-outline" size={22} color="#8696A0" />
                )}
              </View>
              <View style={styles.pinnedInfo}>
                <Text style={styles.pinnedLabel}>Pinned item</Text>
                <Text
                  style={styles.pinnedTitle}
                  numberOfLines={1}
                  sharedTransitionTag={pinnedId ? `item.${pinnedId}.title` : undefined}
                >
                  {pinnedTitle || 'Item'}
                </Text>
                {pinnedPrice ? (
                  <Text
                    style={styles.pinnedPrice}
                    sharedTransitionTag={pinnedId ? `item.${pinnedId}.price` : undefined}
                  >
                    {pinnedPrice}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8696A0" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.safetyBanner}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.safetyBannerText}>{CHAT_SAFETY_BANNER}</Text>
      </View>

      <ScrollView
        ref={listRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          stickToBottomRef.current = distanceFromBottom < 80;
        }}
        onContentSizeChange={() => {
          if (stickToBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            compact
            icon="chatbubble-ellipses-outline"
            title="Start the conversation"
            body="Send a message to connect with the seller. Keep chat in the app for safety."
          />
        ) : (
          buildChatRows(messages).map((row) => {
            if (row.type === 'date') {
              return (
                <View key={row.id} style={styles.dateChip}>
                  <Text style={styles.dateChipText}>{row.label}</Text>
                </View>
              );
            }

            const message = row.message;
            const isMe = message.sender === 'me';
            const isCall = message.kind === 'call';
            const isVoice = message.kind === 'voice';
            const powers = messagePowers(message, now);
            const hasExternal = !message.deleted && !isCall && !isVoice && messageHasExternalUrl(message.text);
            const quote = message.reply ? (
              <View style={styles.quote}>
                <View style={styles.quoteBar} />
                <View style={styles.quoteBody}>
                  <Text style={styles.quoteName}>{message.reply.mine ? 'You' : shownName}</Text>
                  <Text style={styles.quoteText} numberOfLines={2}>{message.reply.text}</Text>
                </View>
              </View>
            ) : null;
            return (
              <View
                key={row.id}
                style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}
              >
                <SwipeReply enabled={powers.reply} mine={isMe} onReply={() => beginReply(message)}>
                <Pressable
                  onLongPress={() => {
                    if (!powers.copy && !powers.reply && !powers.edit && !powers.deleteMe && !powers.deleteAll) return;
                    setMenuMode('actions');
                    setMenuMessage(message);
                  }}
                  delayLongPress={280}
                >
                <View style={[styles.bubbleCol, isMe ? styles.bubbleColMe : styles.bubbleColThem]}>
                  {message.deleted ? (
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, styles.deletedBubble]}>
                      <View style={styles.deletedRow}>
                        <Ionicons name="ban" size={14} color="rgba(233,237,239,0.65)" />
                        <Text style={styles.deletedText}>
                          {isMe ? 'You deleted this message' : 'This message was deleted'}
                        </Text>
                      </View>
                      <View style={styles.timeRow}>
                        <Text style={styles.timeLabel}>{message.time}</Text>
                      </View>
                    </View>
                  ) : isCall ? (
                    <View
                      style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleThem,
                        styles.callBubble,
                      ]}
                    >
                      {quote}
                      <CallLogBubble message={message} styles={styles} onPress={startCall} />
                      <View style={styles.timeRow}>
                        <Text style={styles.timeLabel}>{message.time}</Text>
                      </View>
                    </View>
                  ) : isVoice ? (
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                      {quote}
                      <VoiceBubble
                        uri={message.audioUrl}
                        durationLabel={message.durationLabel}
                        styles={styles}
                      />
                      <View style={styles.timeRow}>
                        <Text style={styles.timeLabel}>{message.time}</Text>
                        {isMe ? (
                          <Ionicons
                            name="checkmark-done"
                            size={15}
                            color={message.read ? '#53BDEB' : 'rgba(233,237,239,0.7)'}
                          />
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                      {quote}
                      <MessageBody
                        text={message.text}
                        isMe={isMe}
                        styles={styles}
                        onLinkPress={handleLinkPress}
                        time={message.time}
                        read={message.read}
                        edited={message.edited}
                      />
                    </View>
                  )}

                  {hasExternal ? (
                    <View
                      style={[
                        styles.linkWarning,
                        isMe ? styles.linkWarningMe : styles.linkWarningThem,
                      ]}
                    >
                      <Ionicons
                        name="warning-outline"
                        size={12}
                        color={colors.warning || '#D97706'}
                      />
                      <Text style={styles.linkWarningText}>
                        External link — tap carefully. Official support never asks for personal
                        details here.
                      </Text>
                    </View>
                  ) : null}
                </View>
                </Pressable>
                </SwipeReply>
              </View>
            );
          })
        )}
        {presence?.typing ? (
          <View style={[styles.messageRow, styles.messageRowThem]}>
            <View style={[styles.bubble, styles.bubbleThem, styles.typingBubble]}>
              <Text style={styles.typingText}>typing...</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {editing || replyingTo ? (
        <View style={styles.composeBanner}>
          <View style={styles.composeBannerBar} />
          <View style={styles.composeBannerText}>
            <Text style={styles.composeBannerTitle}>
              {editing ? 'Edit message' : `Replying to ${replyingTo.sender === 'me' ? 'yourself' : shownName}`}
            </Text>
            <Text style={styles.composeBannerBody} numberOfLines={1}>
              {editing ? editing.text : replyingTo.text || (replyingTo.kind === 'voice' ? 'Voice message' : 'Message')}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => {
              if (editing) {
                setEditing(null);
                setDraft('');
              } else {
                setReplyingTo(null);
              }
            }}
          >
            <Ionicons name="close" size={20} color="#8696A0" />
          </Pressable>
        </View>
      ) : null}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(insets.bottom, 6) + (Platform.OS === 'android' ? keyboardOverlap : 0) },
        ]}
      >
        <View style={styles.inputPill}>
          {recording ? (
            <>
              <Pressable onPress={cancelRecording} hitSlop={10} disabled={sendingVoice}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </Pressable>
              <View style={styles.recordMeta}>
                <View style={styles.recordDot} />
                <Text style={styles.recordTime}>{formatDuration(recordMs / 1000)}</Text>
                <Text style={styles.recordHint}>{sendingVoice ? 'Sending…' : 'Recording'}</Text>
              </View>
            </>
          ) : (
            <TextInput
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Message"
              placeholderTextColor="#8696A0"
              style={styles.textInput}
              multiline
              enablesReturnKeyAutomatically
            />
          )}
        </View>
        <Pressable
          hitSlop={8}
          style={styles.roundBtn}
          disabled={sendingVoice}
          onPress={recording ? sendRecording : draft.trim() || editing ? () => send(draft) : handleMic}
        >
          {sendingVoice ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name={recording || draft.trim() || editing ? 'send' : 'mic'} size={22} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
      {recording ? (
        <VoiceCapture
          captureRef={captureRef}
          onTick={setRecordMs}
          onFailed={showVoiceError}
        />
      ) : null}

      <Modal
        visible={Boolean(menuMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuMessage(null)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuMessage(null)}>
          <Pressable style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={() => {}}>
            {menuMessage && menuMode === 'delete' ? (
              <>
                <Text style={styles.menuTitle}>Delete message</Text>
                {messagePowers(menuMessage, now).deleteAll ? (
                  <Pressable style={styles.menuRow} onPress={() => removeMessage(menuMessage, 'everyone')}>
                    <Ionicons name="trash" size={20} color="#EF4444" />
                    <Text style={styles.menuDanger}>Delete for everyone</Text>
                  </Pressable>
                ) : null}
                {messagePowers(menuMessage, now).deleteMe ? (
                  <Pressable style={styles.menuRow} onPress={() => removeMessage(menuMessage, 'me')}>
                    <Ionicons name="trash-outline" size={20} color="#E9EDEF" />
                    <Text style={styles.menuLabel}>Delete for me</Text>
                  </Pressable>
                ) : null}
              </>
            ) : menuMessage ? (
              <>
                {messagePowers(menuMessage, now).reply ? (
                  <Pressable style={styles.menuRow} onPress={() => beginReply(menuMessage)}>
                    <Ionicons name="arrow-undo" size={20} color="#E9EDEF" />
                    <Text style={styles.menuLabel}>Reply</Text>
                  </Pressable>
                ) : null}
                {messagePowers(menuMessage, now).copy ? (
                  <Pressable style={styles.menuRow} onPress={() => copyMessage(menuMessage)}>
                    <Ionicons name="copy-outline" size={20} color="#E9EDEF" />
                    <Text style={styles.menuLabel}>Copy</Text>
                  </Pressable>
                ) : null}
                {messagePowers(menuMessage, now).edit ? (
                  <Pressable style={styles.menuRow} onPress={() => beginEdit(menuMessage)}>
                    <Ionicons name="pencil" size={20} color="#E9EDEF" />
                    <Text style={styles.menuLabel}>Edit</Text>
                  </Pressable>
                ) : null}
                {messagePowers(menuMessage, now).deleteMe || messagePowers(menuMessage, now).deleteAll ? (
                  <Pressable style={styles.menuRow} onPress={() => setMenuMode('delete')}>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={styles.menuDanger}>Delete</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <AlertModal
        visible={Boolean(linkAlert)}
        onClose={() => setLinkAlert(null)}
        type="warning"
        title={linkAlert?.title || EXTERNAL_LINK_WARNING.title}
        message={linkAlert?.message || EXTERNAL_LINK_WARNING.message}
        primaryButton={{
          text:
            linkAlert?.mode === 'send'
              ? 'Send anyway'
              : EXTERNAL_LINK_WARNING.openLabel,
          onPress: () => {
            const pending = linkAlert;
            if (pending?.mode === 'send' && pending.pendingSend) {
              sendMessage(pending.pendingSend);
              return;
            }
            if (pending?.url) {
              openExternalLink(pending.url);
            }
          },
        }}
        secondaryButton={{
          text: EXTERNAL_LINK_WARNING.cancelLabel,
          onPress: () => setLinkAlert(null),
        }}
      />

      <AlertModal
        visible={Boolean(sendAlert)}
        onClose={() => setSendAlert(null)}
        {...(sendAlert || {})}
      />

      <AlertModal
        visible={Boolean(alertConfig)}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  header: {
    paddingHorizontal: 4,
    paddingBottom: 6,
    backgroundColor: '#1F2C34',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  avatar: {
    backgroundColor: '#6B7C85',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.chatOnline,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  contactText: {
    flex: 1,
    marginLeft: 8,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E9EDEF',
  },
  contactStatus: {
    marginTop: 1,
    fontSize: 12,
    color: '#8696A0',
  },
  contactStatusLive: {
    color: '#25D366',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  pinnedStack: {
    marginHorizontal: 8,
    marginBottom: 8,
  },
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111B21',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pinnedThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#1F2C34',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinnedThumbImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  pinnedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pinnedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinnedLabel: {
    fontSize: 11,
    color: '#8696A0',
  },
  pinnedTitle: {
    marginTop: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#E9EDEF',
  },
  pinnedPrice: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#25D366',
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 6,
    marginHorizontal: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#182229',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  safetyBannerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: '#8696A0',
    fontWeight: '600',
  },
  messages: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  dateChip: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#182229',
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8696A0',
  },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 3,
  },
  messageRowThem: {
    justifyContent: 'flex-start',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleCol: {},
  bubbleColThem: {
    marginLeft: 6,
  },
  bubbleColMe: {},
  bubble: {
    paddingHorizontal: 9,
    paddingTop: 6,
    paddingBottom: 4,
    borderRadius: 8,
  },
  bubbleThem: {
    backgroundColor: '#1F2C34',
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: '#005C4B',
    borderBottomRightRadius: 4,
  },
  textWrap: {
    flexDirection: 'row',
  },
  bubbleTextThem: {
    fontSize: 16.5,
    color: '#E9EDEF',
    lineHeight: 22,
  },
  bubbleTextMe: {
    fontSize: 16.5,
    color: '#E9EDEF',
    lineHeight: 22,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 2,
  },
  timeLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(233,237,239,0.65)',
  },
  editedLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(233,237,239,0.55)',
    fontStyle: 'italic',
    marginRight: 4,
  },
  quote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
    minWidth: 140,
  },
  quoteBar: {
    width: 4,
    backgroundColor: '#06CF9C',
  },
  quoteBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quoteName: {
    color: '#06CF9C',
    fontSize: 13,
    fontWeight: '700',
  },
  quoteText: {
    color: 'rgba(233,237,239,0.8)',
    fontSize: 13,
    marginTop: 1,
  },
  deletedBubble: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(233,237,239,0.18)',
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deletedText: {
    color: 'rgba(233,237,239,0.7)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  composeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    marginBottom: 4,
    paddingRight: 10,
    borderRadius: 10,
    backgroundColor: '#1F2C34',
    overflow: 'hidden',
  },
  composeBannerBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#06CF9C',
  },
  composeBannerText: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  composeBannerTitle: {
    color: '#06CF9C',
    fontSize: 13,
    fontWeight: '700',
  },
  composeBannerBody: {
    color: '#E9EDEF',
    fontSize: 13,
    marginTop: 2,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#233138',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
  },
  menuTitle: {
    color: '#8696A0',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  menuLabel: {
    color: '#E9EDEF',
    fontSize: 16,
  },
  menuDanger: {
    color: '#EF4444',
    fontSize: 16,
  },
  callBubble: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    minWidth: 200,
  },
  typingBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingText: {
    color: '#8696A0',
    fontSize: 14,
    fontStyle: 'italic',
  },
  callLog: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  callLogIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callLogIconHangup: {
    transform: [{ rotate: '135deg' }],
  },
  callLogText: {
    flexShrink: 1,
  },
  callLogTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E9EDEF',
  },
  callLogDetail: {
    marginTop: 1,
    fontSize: 13,
    color: 'rgba(233,237,239,0.65)',
  },
  callTimeThem: {
    fontSize: 11,
    color: 'rgba(233,237,239,0.6)',
    marginLeft: 6,
    marginBottom: 1,
  },
  callTimeMe: {
    fontSize: 11,
    color: 'rgba(233,237,239,0.7)',
    marginLeft: 6,
    marginBottom: 1,
  },
  linkThem: {
    color: colors.primary,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  linkMe: {
    color: colors.onPrimary,
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  linkWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 6,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.pastelOrange || colors.iconBackground || colors.surface,
  },
  linkWarningMe: {
    alignSelf: 'flex-end',
  },
  linkWarningThem: {
    alignSelf: 'flex-start',
  },
  linkWarningText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  bubbleTimeRow: {
    position: 'absolute',
    right: 6,
    bottom: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bubbleTimeThem: {
    fontSize: 11,
    color: 'rgba(233,237,239,0.55)',
  },
  bubbleTimeMe: {
    fontSize: 11,
    color: 'rgba(233,237,239,0.7)',
  },
  quickRepliesWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 10,
  },
  quickReplies: {
    paddingHorizontal: 16,
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingTop: 6,
    gap: 6,
    backgroundColor: '#0B141A',
  },
  inputPill: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 24,
    backgroundColor: '#1F2C34',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputIcon: {
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#E9EDEF',
    paddingVertical: 6,
    maxHeight: 96,
  },
  recordMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordTime: {
    color: '#E9EDEF',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 42,
  },
  recordHint: {
    color: '#8696A0',
    fontSize: 14,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 180,
    paddingVertical: 2,
  },
  voicePlay: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  voiceBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(233,237,239,0.75)',
  },
  voiceDuration: {
    color: 'rgba(233,237,239,0.8)',
    fontSize: 12,
    minWidth: 32,
    textAlign: 'right',
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  micBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
