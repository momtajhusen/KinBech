import { useState, useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigateToTab, ROUTES, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
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

const NOTIFICATIONS = [];

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('all');
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.getNotifications();
    if (!error && data?.notifications) {
      setNotifications(
        (data.notifications || []).map((n) => ({
          ...n,
          id: n.id || n._id,
          body: n.body || n.message || '',
          time: n.createdAt ? new Date(n.createdAt).toLocaleString() : '',
          unread: n.unread !== false,
          icon: n.icon || 'notifications-outline',
        }))
      );
    }
    if (!silent) setLoading(false);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(() => loadNotifications({ silent: true }));

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Guard against undefined colors
  if (!colors) {
    return null;
  }

  // Resolve notification colors dynamically
  const resolvedNotifications = (notifications || []).map(notification => ({
    ...notification,
    iconBg: resolveColor(`colors.${notification.iconBg || 'iconBackground'}`, colors)
  }));

  const list = tab === 'unread' ? resolvedNotifications.filter((n) => n.unread) : resolvedNotifications;

  const openNotification = async (item) => {
    if (item.unread && item.id) {
      await api.markNotificationRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n))
      );
    }
    if (item.tab) {
      navigateToTab(navigation, item.tab);
      return;
    }
    if (item.route) {
      navigation.navigate(item.route, item.params);
    }
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable onPress={markAllRead} hitSlop={12}>
          <Text style={{ color: colors.onGradient, fontWeight: '700', fontSize: 13 }}>Read all</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.tabRow}>
        <Pressable style={styles.tabItem} onPress={() => setTab('all')}>
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All</Text>
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setTab('unread')}>
          <Text style={[styles.tabText, tab === 'unread' && styles.tabTextActive]}>
            Unread
          </Text>
        </Pressable>
      </View>
      <View style={styles.tabDivider}>
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.tabIndicator,
            tab === 'unread' && styles.tabIndicatorRight,
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, list.length === 0 && { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {list.length > 0 ? (
          (list || []).map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, item.unread && styles.cardUnread]}
              onPress={() => openNotification(item)}
            >
              <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
                <Ionicons name={item.icon} size={22} color={colors.onGradient} />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardTime}>{item.time}</Text>
                </View>
                <View style={styles.cardBottomRow}>
                  <Text style={styles.cardText}>{item.body}</Text>
                  {item.unread && <View style={styles.unreadDot} />}
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState
            compact
            icon="notifications-off-outline"
            title="No notifications"
            body="You’ll see updates about chats, listings, and offers here."
          />
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    marginLeft: 6,
    fontSize: 24,
    fontWeight: '800',
    color: colors.onGradient,
  },
  tabRow: {
    flexDirection: 'row',
    paddingTop: 18,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 12,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  tabDivider: {
    height: 3,
    backgroundColor: colors.border,
  },
  tabIndicator: {
    width: '50%',
    height: 3,
  },
  tabIndicatorRight: {
    marginLeft: '50%',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  cardUnread: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.surfaceMutedBorder,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  cardTime: {
    fontSize: 12,
    color: colors.textMuted,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  cardText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
    marginBottom: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
});
