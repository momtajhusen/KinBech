import { useCallback, useState, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../components/EmptyState';
import ScreenLoader from '../components/ScreenLoader';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

function formatChatTime(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/^0/, '');
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function previewMeta(chat) {
  const kind = chat.lastMessageKind || 'text';
  const text = chat.lastMessage || 'Start the conversation';
  if (kind === 'call') return { icon: 'call-outline', text };
  if (kind === 'voice') return { icon: 'mic-outline', text };
  if (chat.lastMessageMine && chat.lastMessage) return { icon: null, text: `You: ${text}` };
  return { icon: null, text };
}

function ChatAvatar({ uri, name, colors, styles }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.avatarImage} />;
  }

  const initial = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export default function ChatListScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const hasAnimatedRef = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const revealList = useCallback(() => {
    if (hasAnimatedRef.current) {
      fadeAnim.setValue(1);
      return;
    }
    hasAnimatedRef.current = true;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const loadChats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.getChats();
    if (error) {
      console.error('Failed to load chats:', error);
      if (!hasLoadedRef.current) setChats([]);
    } else {
      setChats(data?.chats || []);
      hasLoadedRef.current = true;
      revealList();
    }
    if (!silent) setLoading(false);
  }, [revealList]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadChats({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadChats({ silent: hasLoadedRef.current });
    }, [loadChats])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ThemeStatusBar />
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <Text style={styles.subtitle}>
          {chats.length > 0
            ? `${chats.length} conversation${chats.length === 1 ? '' : 's'}`
            : 'Message sellers about items you like'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, chats.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {chats.length === 0 && !loading ? (
          <EmptyState
            compact
            icon="chatbubbles-outline"
            title="No conversations yet"
            body="Open an item and message the seller. Your chats will show up here."
          />
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {chats.map((chat, index) => {
              const name = chat.otherUser?.name || 'Seller';
              const listingTitle = chat.listing?.title;
              const listingPrice =
                chat.listing?.price != null ? formatPrice(chat.listing.price) : '';
              const avatarUri = resolveMediaUrl(chat.otherUser?.avatarUrl || '');
              const listingThumb = resolveMediaUrl(chat.listing?.photos?.[0] || '');
              const timeLabel = formatChatTime(chat.lastMessageAt);
              const preview = previewMeta(chat);

              return (
                <Pressable
                  key={chat.id}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  onPress={() =>
                    navigation.navigate(ROUTES.CHAT, {
                      chatId: chat.id,
                      name,
                      listing: chat.listing,
                      otherUserId: chat.otherUser?.id,
                      image: avatarUri || listingThumb,
                    })
                  }
                >
                  <ChatAvatar uri={avatarUri} name={name} colors={colors} styles={styles} />

                  <View style={[styles.body, index < chats.length - 1 && styles.bodyDivider]}>
                    <View style={styles.copy}>
                      <View style={styles.topRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
                      </View>

                      {listingTitle ? (
                        <Text style={styles.listingLine} numberOfLines={1}>
                          {listingTitle}
                          {listingPrice ? (
                            <Text style={styles.listingPrice}>{`  ${listingPrice}`}</Text>
                          ) : null}
                        </Text>
                      ) : null}

                      <View style={styles.previewRow}>
                        {preview.icon ? (
                          <Ionicons name={preview.icon} size={14} color={colors.textMuted} />
                        ) : null}
                        <Text style={styles.preview} numberOfLines={1}>
                          {preview.text}
                        </Text>
                      </View>
                    </View>

                    {listingThumb ? (
                      <Image source={{ uri: listingThumb }} style={styles.listingThumb} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>
      {loading && chats.length === 0 ? <ScreenLoader overlay label="Loading chats" /> : null}
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
  },
  list: {
    paddingBottom: 24,
  },
  listEmpty: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: colors.surface,
  },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.iconBackground || colors.background,
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.iconBackground || colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingRight: 16,
  },
  bodyDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  time: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  listingLine: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  listingPrice: {
    fontWeight: '700',
    color: colors.price || colors.primary,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textMuted,
  },
  listingThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.iconBackground || colors.background,
  },
});
