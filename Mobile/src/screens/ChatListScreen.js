import { useCallback, useState, useRef } from 'react';
import { Image, Pressable, ScrollView, Text, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../components/EmptyState';
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
  const chatItemAnims = useRef(new Map()).current;

  const getChatItemAnim = useCallback((chatId) => {
    if (!chatItemAnims.has(chatId)) {
      chatItemAnims.set(chatId, new Animated.Value(1));
    }
    return chatItemAnims.get(chatId);
  }, [chatItemAnims]);

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
          <Animated.View style={[styles.listInner, { opacity: fadeAnim }]}>
            {chats.map((chat) => {
              const itemAnim = getChatItemAnim(chat.id);
              const name = chat.otherUser?.name || 'Seller';
              const listingTitle = chat.listing?.title;
              const listingPrice =
                chat.listing?.price != null ? formatPrice(chat.listing.price) : '';
              const avatarUri = resolveMediaUrl(
                chat.otherUser?.avatarUrl || chat.listing?.photos?.[0] || ''
              );
              const listingThumb = resolveMediaUrl(chat.listing?.photos?.[0] || '');
              const timeLabel = formatChatTime(chat.lastMessageAt);

              return (
                <Animated.View
                  key={chat.id}
                  style={[styles.cardWrap, { transform: [{ scale: itemAnim }] }]}
                >
                  <Pressable
                    style={styles.row}
                    onPress={() =>
                      navigation.navigate(ROUTES.CHAT, {
                        chatId: chat.id,
                        name,
                        listing: chat.listing,
                        otherUserId: chat.otherUser?.id,
                      })
                    }
                    onPressIn={() => {
                      Animated.spring(itemAnim, {
                        toValue: 0.985,
                        useNativeDriver: true,
                        tension: 300,
                        friction: 12,
                      }).start();
                    }}
                    onPressOut={() => {
                      Animated.spring(itemAnim, {
                        toValue: 1,
                        useNativeDriver: true,
                        tension: 300,
                        friction: 12,
                      }).start();
                    }}
                  >
                    <ChatAvatar
                      uri={avatarUri}
                      name={name}
                      colors={colors}
                      styles={styles}
                    />

                    <View style={styles.body}>
                      <View style={styles.topRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {name}
                        </Text>
                        {timeLabel ? (
                          <Text style={styles.time}>{timeLabel}</Text>
                        ) : null}
                      </View>

                      {listingTitle ? (
                        <Text style={styles.listingLine} numberOfLines={1}>
                          {listingTitle}
                          {listingPrice ? ` · ${listingPrice}` : ''}
                        </Text>
                      ) : null}

                      <Text style={styles.preview} numberOfLines={1}>
                        {chat.lastMessage || 'Start the conversation'}
                      </Text>
                    </View>

                    {listingThumb ? (
                      <Image source={{ uri: listingThumb }} style={styles.listingThumb} />
                    ) : (
                      <View style={styles.chevronWrap}>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </View>
                    )}
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>
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
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: colors.textMuted,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  listEmpty: {
    flexGrow: 1,
  },
  listInner: {
    gap: 12,
  },
  cardWrap: {
    borderRadius: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.iconBackground || colors.background,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.iconBackground || colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
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
    fontWeight: '600',
    color: colors.textMuted,
  },
  listingLine: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  preview: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  listingThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.iconBackground || colors.background,
  },
  chevronWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
