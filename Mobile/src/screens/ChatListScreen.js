import { useCallback, useState, useRef, useEffect } from 'react';
import { Pressable, ScrollView, Text, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import EmptyState from '../components/EmptyState';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

export default function ChatListScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const chatItemAnims = useRef(new Map()).current;

  const getChatItemAnim = useCallback((chatId) => {
    if (!chatItemAnims.has(chatId)) {
      chatItemAnims.set(chatId, new Animated.Value(1));
    }
    return chatItemAnims.get(chatId);
  }, [chatItemAnims]);

  const loadChats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.getChats();
    if (error) {
      console.error('Failed to load chats:', error);
      setChats([]);
    } else {
      setChats(data?.chats || []);
    }
    if (!silent) setLoading(false);
    if (!silent) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [fadeAnim]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadChats({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadChats();
      return () => {
        fadeAnim.setValue(0);
      };
    }, [loadChats, fadeAnim])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ThemeStatusBar />
      <Text style={styles.title}>Chats</Text>
      <ScrollView
        contentContainerStyle={[styles.list, chats.length === 0 && { flexGrow: 1 }]}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {chats.length === 0 ? (
          <EmptyState
            compact
            icon="chatbubbles-outline"
            title="No conversations yet"
            body="Open an item and message the seller. Your chats will show up here."
          />
        ) : (
          <Animated.View style={{ opacity: fadeAnim }}>
            {chats.map((chat) => {
              const itemAnim = getChatItemAnim(chat.id);
              return (
                <Animated.View key={chat.id} style={{ transform: [{ scale: itemAnim }] }}>
                  <Pressable
                    style={styles.row}
                    onPress={() =>
                      navigation.navigate(ROUTES.CHAT, {
                        chatId: chat.id,
                        name: chat.otherUser?.name || 'Seller',
                        listing: chat.listing,
                        otherUserId: chat.otherUser?.id,
                      })
                    }
                    onPressIn={() => {
                      Animated.spring(itemAnim, {
                        toValue: 0.97,
                        useNativeDriver: true,
                        tension: 300,
                        friction: 10,
                      }).start();
                    }}
                    onPressOut={() => {
                      Animated.spring(itemAnim, {
                        toValue: 1,
                        useNativeDriver: true,
                        tension: 300,
                        friction: 10,
                      }).start();
                    }}
                  >
                    <View style={styles.avatar}>
                      <Ionicons name="person" size={22} color={colors.primary} />
                    </View>
                    <View style={styles.body}>
                      <View style={styles.topRow}>
                        <Text style={styles.name}>{chat.otherUser?.name || 'Seller'}</Text>
                      </View>
                      <Text style={styles.preview} numberOfLines={1}>
                        {chat.lastMessage || 'Start the conversation'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
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
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  preview: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 32,
    marginTop: 20,
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

