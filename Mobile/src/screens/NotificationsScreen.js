import { useState, useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigateToTab, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'messages', label: 'Messages' },
  { id: 'calls', label: 'Calls' },
];

function formatNoticeTime(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((start(new Date()) - start(date)) / 86400000);
  const clock = date
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    .replace(/^0/, '');
  if (dayDiff === 0) return clock;
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function dayGroup(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((start(new Date()) - start(date)) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return 'Earlier';
}

function noticeMeta(item, colors) {
  const title = `${item.title || ''} ${item.body || ''}`;
  const isCall = item.type === 'call' || item.icon === 'call-outline' || /call/i.test(item.title || '');
  const missed = /missed|declined|no answer|cancelled/i.test(title);
  if (isCall) {
    return {
      label: missed ? 'Missed call' : 'Call',
      icon: 'call',
      tint: missed ? '#DC2626' : '#16A34A',
      bg: missed ? '#FEE2E2' : '#DCFCE7',
    };
  }
  if (item.type === 'chat') {
    return {
      label: 'Message',
      icon: 'chatbubble-ellipses',
      tint: colors.primary,
      bg: colors.pastelPurple || '#EDE9FE',
    };
  }
  if (item.type === 'listing') {
    return {
      label: 'Listing',
      icon: 'pricetag',
      tint: '#2563EB',
      bg: colors.pastelBlue || '#DBEAFE',
    };
  }
  if (item.type === 'promotion' || item.type === 'broadcast') {
    return {
      label: 'Announcement',
      icon: 'megaphone',
      tint: '#D97706',
      bg: colors.pastelOrange || '#FFEDD5',
    };
  }
  if (/meetup/i.test(item.title || '')) {
    return {
      label: 'Meetup',
      icon: 'location',
      tint: '#0F766E',
      bg: colors.pastelCyan || '#CCFBF1',
    };
  }
  return {
    label: 'Update',
    icon: 'notifications',
    tint: colors.primary,
    bg: colors.pastelIndigo || colors.iconBackground,
  };
}

function isCallItem(item) {
  return item.type === 'call' || item.icon === 'call-outline' || /call/i.test(item.title || '');
}

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    const { data, error } = await api.getNotifications();
    if (error || !data?.notifications) return;
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount || data.notifications.filter((item) => item.unread).length);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(loadNotifications);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  if (!colors) return null;

  const list = notifications.filter((item) => {
    if (tab === 'unread') return item.unread;
    if (tab === 'messages') return item.type === 'chat';
    if (tab === 'calls') return isCallItem(item);
    return true;
  });

  const openNotification = async (item) => {
    if (item.unread && item.id) {
      await api.markNotificationRead(item.id);
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    if (item.tab) {
      navigateToTab(navigation, item.tab);
      return;
    }
    if ((item.route === 'Call' || item.route === 'Chat') && item.params?.chatId) {
      navigation.navigate(ROUTES.CHAT, item.params);
      return;
    }
    if (item.route) navigation.navigate(item.route, item.params || undefined);
  };

  const markAllRead = async () => {
    await api.markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    setUnreadCount(0);
  };

  let lastGroup = '';

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
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>
            {unreadCount > 0 ? `${unreadCount} new` : 'Messages, calls, and updates'}
          </Text>
        </View>
        <Pressable onPress={markAllRead} hitSlop={12} disabled={unreadCount === 0}>
          <Text style={[styles.readAll, unreadCount === 0 && styles.readAllDisabled]}>Read all</Text>
        </Pressable>
      </LinearGradient>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((filter) => {
          const active = tab === filter.id;
          return (
            <Pressable
              key={filter.id}
              onPress={() => setTab(filter.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={[styles.list, list.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {list.length > 0 ? (
          list.map((item) => {
            const meta = noticeMeta(item, colors);
            const group = dayGroup(item.createdAt);
            const showGroup = group !== lastGroup;
            lastGroup = group;
            return (
              <View key={item.id}>
                {showGroup ? <Text style={styles.groupLabel}>{group}</Text> : null}
                <Pressable
                  style={[styles.card, item.unread && styles.cardUnread]}
                  onPress={() => openNotification(item)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.tint} />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <Text style={[styles.kind, { color: meta.tint }]}>{meta.label}</Text>
                      <Text style={styles.cardTime}>{formatNoticeTime(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.body ? (
                      <Text style={styles.cardText} numberOfLines={2}>
                        {item.body}
                      </Text>
                    ) : null}
                  </View>
                  {item.unread ? <View style={styles.unreadDot} /> : null}
                </Pressable>
              </View>
            );
          })
        ) : (
          <EmptyState
            compact
            icon="notifications-off-outline"
            title={tab === 'all' ? 'No notifications' : 'Nothing in this filter'}
            body="Messages, calls, missed calls, and meetup updates show up here."
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
    paddingBottom: 18,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
  },
  readAll: {
    color: colors.onGradient,
    fontWeight: '700',
    fontSize: 13,
  },
  readAllDisabled: {
    opacity: 0.45,
  },
  filters: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.onPrimary || '#fff',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  listEmpty: {
    flexGrow: 1,
  },
  groupLabel: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  cardUnread: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    alignItems: 'center',
    gap: 8,
  },
  kind: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  cardTitle: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  cardText: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
});
