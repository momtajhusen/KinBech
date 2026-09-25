import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice } from '../utils/listing';
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

function mapMessage(message) {
  return {
    id: message.id,
    sender: message.mine ? 'me' : 'them',
    text: message.text,
    time: formatTime(message.createdAt),
    read: true,
  };
}

function Avatar({ size = 36, colors, styles }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="person" size={size * 0.55} color={colors.onGradient} />
    </View>
  );
}

function MessageBody({ text, isMe, styles, onLinkPress }) {
  const parts = splitTextWithUrls(text);
  return (
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
  );
}

export default function ChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const contactName = route?.params?.name || 'Seller';
  const chatId = route?.params?.chatId;
  const listing = route?.params?.listing;
  const otherUserId = route?.params?.otherUserId;
  const listingId = listing?.id || listing?._id;
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [linkAlert, setLinkAlert] = useState(null);
  const [sendAlert, setSendAlert] = useState(null);

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    const { data } = await api.getMessages(chatId);
    setMessages((data?.messages || []).map(mapMessage));
  }, [chatId]);

  const { refreshing, onRefresh } = usePullRefresh(loadMessages);

  useEffect(() => {
    if (!chatId) return undefined;
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [chatId, loadMessages]);

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

  const sendMessage = useCallback(async (value) => {
    if (!value || !chatId) return;
    setDraft('');
    const { data, error } = await api.sendMessage(chatId, value);
    if (data?.message && typeof data.message === 'object') {
      setMessages((prev) => [...prev, mapMessage(data.message)]);
      return;
    }
    setDraft(value);
    const serverMsg =
      (typeof data?.message === 'string' && data.message) ||
      (typeof error === 'string' && error) ||
      'Could not send message. Please try again.';
    setSendAlert(
      showErrorAlert({
        title: 'Message not sent',
        message: serverMsg,
        onConfirm: () => setSendAlert(null),
      })
    );
  }, [chatId]);

  const send = async (text) => {
    const value = text.trim();
    if (!value || !chatId) return;

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

    await sendMessage(value);
  };

  const pinnedTitle = listing?.title || 'Listing';
  const pinnedPrice = listing?.price != null ? formatPrice(listing.price) : '';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
          </Pressable>

          <View style={styles.contactWrap}>
            <View>
              <Avatar size={44} colors={colors} styles={styles} />
              <View style={styles.onlineDot} />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactName}>{contactName}</Text>
              <Text style={styles.contactStatus}>Online</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable hitSlop={10} style={styles.iconBtn}>
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

        <View style={styles.pinnedStack}>
          <Pressable
            style={styles.pinnedCard}
            onPress={() =>
              listingId && openItemDetail(navigation, { listingId, item: listing, sharedId: listingId })
            }
          >
            <View style={styles.pinnedThumb}>
              <Ionicons
                name="phone-portrait-outline"
                size={26}
                color={colors.primary}
                sharedTransitionTag={listingId ? `item.${listingId}.photo` : undefined}
              />
            </View>
            <View style={styles.pinnedInfo}>
              <View style={styles.pinnedLabelRow}>
                <Ionicons name="pin-outline" size={13} color={colors.textMuted} />
                <Text style={styles.pinnedLabel}>Pinned Item</Text>
              </View>
              <Text
                style={styles.pinnedTitle}
                sharedTransitionTag={listingId ? `item.${listingId}.title` : undefined}
              >
                {pinnedTitle}
              </Text>
              <Text
                style={styles.pinnedPrice}
                sharedTransitionTag={listingId ? `item.${listingId}.price` : undefined}
              >
                {pinnedPrice}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
          {chatId ? (
            <Pressable
              style={styles.pinnedCard}
              onPress={() =>
                navigation.navigate(ROUTES.MEETUP, {
                  chatId,
                  seller: { name: contactName, id: otherUserId },
                  listing,
                })
              }
            >
              <View style={styles.pinnedThumb}>
                <Ionicons name="location-outline" size={26} color={colors.primary} />
              </View>
              <View style={styles.pinnedInfo}>
                <Text style={styles.pinnedTitle}>Confirm meetup</Text>
                <Text style={styles.pinnedLabel}>
                  {listing?.sellerType === 'shop'
                    ? 'Meet in a public place, then rate the shop'
                    : 'Meet in a public place and keep chat in the app'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.safetyBanner}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.safetyBannerText}>{CHAT_SAFETY_BANNER}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {messages.length === 0 ? (
          <EmptyState
            compact
            icon="chatbubble-ellipses-outline"
            title="Start the conversation"
            body="Send a message to connect with the seller. Keep chat in the app for safety."
          />
        ) : (
          <>
            <Text style={styles.dateSeparator}>Today</Text>

            {(messages || []).map((message) => {
              const isMe = message.sender === 'me';
              const hasExternal = messageHasExternalUrl(message.text);
              return (
                <View
                  key={message.id}
                  style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}
                >
                  {!isMe && <Avatar size={32} colors={colors} styles={styles} />}

                  <View style={[styles.bubbleCol, isMe ? styles.bubbleColMe : styles.bubbleColThem]}>
                    {isMe ? (
                      <LinearGradient
                        colors={colors.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.bubble, styles.bubbleMe]}
                      >
                        <MessageBody
                          text={message.text}
                          isMe
                          styles={styles}
                          onLinkPress={handleLinkPress}
                        />
                      </LinearGradient>
                    ) : (
                      <View style={[styles.bubble, styles.bubbleThem]}>
                        <MessageBody
                          text={message.text}
                          isMe={false}
                          styles={styles}
                          onLinkPress={handleLinkPress}
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

                    <View style={[styles.metaRow, isMe ? styles.metaRowMe : styles.metaRowThem]}>
                      <Text style={styles.metaTime}>{message.time}</Text>
                      {isMe && (
                        <Ionicons
                          name="checkmark-done"
                          size={15}
                          color={message.read ? colors.chatRead : colors.textMuted}
                          style={{ marginLeft: 4 }}
                        />
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={styles.quickRepliesWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickReplies}
        >
          {['Is it available?', 'Final price?', 'Where are you located?', 'Schedule meetup'].map(
            (reply) => (
              <Pressable
                key={reply}
                style={styles.chip}
                onPress={() => {
                  if (reply === 'Schedule meetup') {
                    navigation.navigate(ROUTES.MEETUP, {
                      name: contactName,
                      seller: { name: contactName },
                      listing,
                    });
                    return;
                  }
                  send(reply);
                }}
              >
                <Text style={styles.chipText}>{reply}</Text>
              </Pressable>
            )
          )}
        </ScrollView>
      </View>

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable hitSlop={10} style={styles.attachBtn}>
          <Ionicons name="attach" size={22} color={colors.textMuted} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor={colors.textTertiary}
          style={styles.textInput}
          multiline
        />
        <Pressable onPress={() => send(draft)} hitSlop={8}>
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendBtn}
          >
            <Ionicons name="send" size={18} color={colors.onGradient} />
          </LinearGradient>
        </Pressable>
      </View>

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
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginLeft: 12,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  contactStatus: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  pinnedStack: {
    gap: 8,
    marginBottom: -24,
  },
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pinnedThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.iconBackground || colors.background,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
    color: colors.textMuted,
  },
  pinnedTitle: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  pinnedPrice: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: colors.price,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 28,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.pastelOrange || colors.iconBackground || colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  safetyBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  messages: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  dateSeparator: {
    alignSelf: 'center',
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  messageRowThem: {
    justifyContent: 'flex-start',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  bubbleCol: {
    maxWidth: '78%',
  },
  bubbleColThem: {
    marginLeft: 8,
    alignItems: 'flex-start',
  },
  bubbleColMe: {
    alignItems: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  bubbleThem: {
    backgroundColor: colors.chatTheirs,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleTextThem: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
  },
  bubbleTextMe: {
    fontSize: 15,
    color: colors.onPrimary,
    lineHeight: 21,
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaRowThem: {
    marginLeft: 4,
  },
  metaRowMe: {
    marginRight: 4,
  },
  metaTime: {
    fontSize: 11,
    color: colors.textMuted,
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
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    backgroundColor: colors.surface,
  },
  attachBtn: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
