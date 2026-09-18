import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

/**
 * Resolve color references (e.g., 'colors.iconBackground') to actual color values
 * @param {string} colorRef - Color reference string or direct color value
 * @param {object} colors - Theme colors object
 * @returns {string} Resolved color value
 */
function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

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

  const send = async (text) => {
    const value = text.trim();
    if (!value || !chatId) return;
    setDraft('');
    const { data } = await api.sendMessage(chatId, value);
    if (data?.message) {
      setMessages((prev) => [...prev, mapMessage(data.message)]);
    }
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
            <Pressable hitSlop={10} style={styles.iconBtn} onPress={() => navigation.navigate(ROUTES.REPORT_BLOCK, { userId: otherUserId })}>
              <Ionicons name="ellipsis-vertical" size={22} color={colors.onGradient} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.pinnedCard}
          onPress={() => listingId && openItemDetail(navigation, { listingId, item: listing, sharedId: listingId })}
        >
          <View style={styles.pinnedThumb}>
            <Ionicons name="phone-portrait-outline" size={26} color={colors.primary} sharedTransitionTag={listingId ? `item.${listingId}.photo` : undefined} />
          </View>
          <View style={styles.pinnedInfo}>
            <View style={styles.pinnedLabelRow}>
              <Ionicons name="pin-outline" size={13} color={colors.textMuted} />
              <Text style={styles.pinnedLabel}>Pinned Item</Text>
            </View>
            <Text style={styles.pinnedTitle} sharedTransitionTag={listingId ? `item.${listingId}.title` : undefined}>{pinnedTitle}</Text>
            <Text style={styles.pinnedPrice} sharedTransitionTag={listingId ? `item.${listingId}.price` : undefined}>{pinnedPrice}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        {chatId ? (
          <Pressable
            style={[styles.pinnedCard, { marginTop: 8 }]}
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
      </LinearGradient>

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
                        <Text style={styles.bubbleTextMe}>{message.text}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.bubble, styles.bubbleThem]}>
                        <Text style={styles.bubbleTextThem}>{message.text}</Text>
                      </View>
                    )}

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
          {(['Is it available?', 'Final price?', 'Where are you located?', 'Schedule meetup'] || []).map((reply) => (
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
          ))}
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
  pinnedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: -30,
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
    backgroundColor: 'colors.iconBackground',
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
  messages: {
    paddingHorizontal: 16,
    paddingTop: 46,
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
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyIconWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 13,
    color: colors.primary,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 12,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
