import { useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigateToTab, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { resolveMediaUrl } from '../utils/listing';
import EmptyState from '../components/EmptyState';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const CATEGORIES = [
  {
    id: 'messages',
    emptyTitle: 'No messages yet',
    label: 'Messages',
    icon: 'chatbubble-ellipses',
    tone: 'primary',
    empty: 'Buyer and seller chats will show up here.',
  },
  {
    id: 'calls',
    emptyTitle: 'No calls yet',
    label: 'Calls',
    icon: 'call',
    tone: 'success',
    empty: 'Missed and recent voice calls will show up here.',
  },
  {
    id: 'meetups',
    emptyTitle: 'No meetups yet',
    label: 'Meetups',
    icon: 'location',
    tone: 'info',
    empty: 'Confirmed meetups with buyers and sellers appear here.',
  },
  {
    id: 'listings',
    emptyTitle: 'No listing updates',
    label: 'Listings',
    icon: 'pricetag',
    tone: 'warning',
    empty: 'Updates about your items and saved listings appear here.',
  },
  {
    id: 'offers',
    emptyTitle: 'No offers right now',
    label: 'Offers',
    icon: 'megaphone',
    tone: 'favorite',
    empty: 'Announcements and offers from KinBech appear here.',
  },
  {
    id: 'account',
    emptyTitle: 'No account alerts',
    label: 'Account',
    icon: 'shield-checkmark',
    tone: 'account',
    empty: 'Security and account alerts appear here.',
  },
];

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((cat) => [cat.id, cat]));
const ACCOUNT_TINT = '#7C3AED';
const MISSED_RE = /missed|no answer|declined/i;

function toneColor(colors, tone) {
  if (tone === 'account') return ACCOUNT_TINT;
  return colors[tone] || colors.primary;
}

function startOfDay(value) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function dayDiffOf(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
}

function formatNoticeTime(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  const dayDiff = dayDiffOf(dateValue);
  if (dayDiff === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/^0/, '');
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function dayGroup(dateValue) {
  const dayDiff = dayDiffOf(dateValue);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return 'This week';
  return 'Earlier';
}

function categoryOf(item) {
  if (item.category && CATEGORY_BY_ID[item.category]) return item.category;
  if (item.type === 'call' || item.icon === 'call-outline') return 'calls';
  if (item.type === 'chat') return 'messages';
  if (item.type === 'listing') return 'listings';
  if (item.type === 'promotion' || item.type === 'broadcast') return 'offers';
  if (/meetup/i.test(item.title || '') || item.icon === 'location-outline') return 'meetups';
  return 'account';
}

function buildEntries(list) {
  const entries = [];
  const threads = new Map();
  list.forEach((item) => {
    const category = categoryOf(item);
    const chatId = item.params?.chatId ? String(item.params.chatId) : '';
    const threadable = chatId && (category === 'messages' || category === 'calls');
    const key = threadable ? `${category}:${chatId}` : item.id;
    const existing = threadable ? threads.get(key) : null;
    if (existing) {
      existing.items.push(item);
      if (item.unread) existing.unread += 1;
      if (category === 'calls' && MISSED_RE.test(item.title || '')) existing.missed += 1;
      if (!existing.name && item.params?.name) existing.name = item.params.name;
      return;
    }
    const entry = {
      key,
      category,
      chatId,
      lead: item,
      items: [item],
      unread: item.unread ? 1 : 0,
      missed: category === 'calls' && MISSED_RE.test(item.title || '') ? 1 : 0,
      name: item.params?.name || '',
    };
    if (threadable) threads.set(key, entry);
    entries.push(entry);
  });
  return entries;
}

function entryTitle(entry) {
  const { lead, category } = entry;
  if (category === 'messages') return entry.name || lead.title || 'New message';
  if (category === 'calls') return entry.name || 'Voice call';
  return lead.title || 'Update';
}

function entryBody(entry) {
  const { lead, category } = entry;
  if (category === 'calls') {
    return lead.body && lead.title ? `${lead.title} · ${lead.body}` : lead.title || lead.body;
  }
  return lead.body;
}

function entryMeta(entry) {
  const count = entry.items.length;
  if (entry.category === 'messages') return count > 1 ? `${count} messages` : 'Message';
  if (entry.category === 'calls') {
    if (entry.missed) return `${entry.missed} missed`;
    return count > 1 ? `${count} calls` : 'Call';
  }
  return CATEGORY_BY_ID[entry.category]?.label || 'Update';
}

export default function NotificationsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const requestRef = useRef(0);
  const retryRef = useRef(null);

  const loadNotifications = useCallback(async ({ retry = true } = {}) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    clearTimeout(retryRef.current);
    const { data, error } = await api.getNotifications({
      category: category === 'all' ? undefined : category,
      unread: unreadOnly ? 1 : undefined,
      limit: 100,
      counts: 1,
    });
    if (requestId !== requestRef.current) return;
    if (error || !Array.isArray(data?.notifications)) {
      if (retry) {
        retryRef.current = setTimeout(() => loadNotifications({ retry: false }), 1500);
        return;
      }
      setLoading(false);
      setLoadFailed(true);
      return;
    }
    setLoading(false);
    setLoadFailed(false);
    setNotifications(data.notifications);
    setCounts(data.counts || {});
    setUnreadCount(data.unreadCount || 0);
  }, [category, unreadOnly]);

  const { refreshing, onRefresh } = usePullRefresh(loadNotifications);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      return () => clearTimeout(retryRef.current);
    }, [loadNotifications])
  );

  const retryLoad = () => {
    setLoading(true);
    setLoadFailed(false);
    loadNotifications();
  };

  const entries = useMemo(() => buildEntries(notifications), [notifications]);

  if (!colors) return null;

  const activeCat = CATEGORY_BY_ID[category];
  const scopeUnread = activeCat ? counts[category]?.unread || 0 : unreadCount;
  const totalCount = CATEGORIES.reduce((sum, cat) => sum + (counts[cat.id]?.total || 0), 0);

  const applyRead = (ids) => {
    const idSet = new Set(ids);
    const newlyRead = notifications.filter((n) => idSet.has(n.id) && n.unread);
    if (!newlyRead.length) return;
    setNotifications((prev) =>
      unreadOnly
        ? prev.filter((n) => !idSet.has(n.id))
        : prev.map((n) => (idSet.has(n.id) ? { ...n, unread: false } : n))
    );
    setUnreadCount((value) => Math.max(0, value - newlyRead.length));
    setCounts((prev) => {
      const next = { ...prev };
      newlyRead.forEach((n) => {
        const cat = categoryOf(n);
        if (next[cat]) next[cat] = { ...next[cat], unread: Math.max(0, next[cat].unread - 1) };
      });
      return next;
    });
  };

  const markEntryRead = async (entry) => {
    const ids = entry.items.filter((n) => n.unread).map((n) => n.id);
    if (!ids.length) return;
    applyRead(ids);
    if (ids.length === 1) await api.markNotificationRead(ids[0]);
    else await api.markAllNotificationsRead({ ids });
  };

  const openEntry = (entry) => {
    markEntryRead(entry);
    const item = entry.lead;
    if (item.tab) {
      navigateToTab(navigation, item.tab);
      return;
    }
    const chatId = entry.chatId || item.params?.chatId;
    if ((item.route === 'Call' || item.route === 'Chat') && chatId) {
      navigation.navigate(ROUTES.CHAT, { ...(item.params || {}), chatId, name: entry.name || item.params?.name });
      return;
    }
    if (item.route && item.route !== 'dashboard') navigation.navigate(item.route, item.params || undefined);
  };

  const callBack = (entry) => {
    markEntryRead(entry);
    navigation.navigate(ROUTES.CALL, {
      chatId: entry.chatId,
      name: entry.name || 'KinBech user',
      image: entry.items.find((n) => n.params?.image)?.params?.image || '',
    });
  };

  const removeEntry = async (entry) => {
    const ids = entry.items.map((n) => n.id);
    const idSet = new Set(ids);
    setSheet(null);
    setNotifications((prev) => prev.filter((n) => !idSet.has(n.id)));
    const unreadRemoved = entry.items.filter((n) => n.unread).length;
    setUnreadCount((value) => Math.max(0, value - unreadRemoved));
    setCounts((prev) => {
      const current = prev[entry.category];
      if (!current) return prev;
      return {
        ...prev,
        [entry.category]: {
          total: Math.max(0, current.total - ids.length),
          unread: Math.max(0, current.unread - unreadRemoved),
        },
      };
    });
    if (ids.length === 1) await api.deleteNotification(ids[0]);
    else await api.clearNotifications({ ids, onlyRead: false });
  };

  const markScopeRead = async () => {
    setSheet(null);
    if (!scopeUnread) return;
    applyRead(notifications.filter((n) => n.unread).map((n) => n.id));
    await api.markAllNotificationsRead(activeCat ? { category } : {});
    loadNotifications();
  };

  const clearRead = async () => {
    setSheet(null);
    await api.clearNotifications(activeCat ? { category } : {});
    loadNotifications();
  };

  const selectCategory = (id) => {
    setLoading(true);
    setNotifications([]);
    setCategory((current) => (current === id ? 'all' : id));
  };

  const toggleUnreadOnly = () => {
    setLoading(true);
    setNotifications([]);
    setUnreadOnly((value) => !value);
  };

  const renderTile = (cat) => {
    const tint = toneColor(colors, cat.tone);
    const stat = counts[cat.id] || { total: 0, unread: 0 };
    const active = category === cat.id;
    return (
      <Pressable
        key={cat.id}
        onPress={() => selectCategory(cat.id)}
        style={[
          styles.tile,
          active && { borderColor: tint, backgroundColor: `${tint}14` },
        ]}
      >
        <View style={[styles.tileIcon, { backgroundColor: `${tint}1F` }]}>
          <Icon name={cat.icon} size={18} color={tint} />
          {stat.unread > 0 ? (
            <View style={[styles.tileBadge, { backgroundColor: tint }]}>
              <Text style={styles.tileBadgeText}>{stat.unread > 99 ? '99+' : stat.unread}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileLabel, active && { color: tint }]} numberOfLines={1}>
          {cat.label}
        </Text>
        <Text style={styles.tileSub} numberOfLines={1}>
          {stat.unread > 0 ? `${stat.unread} new` : stat.total > 0 ? `${stat.total} total` : 'None'}
        </Text>
      </Pressable>
    );
  };

  const renderLeading = (entry, tint, cat) => {
    const photo = entry.lead.params?.image || entry.items.find((n) => n.params?.image)?.params?.image;
    const uri = photo ? resolveMediaUrl(photo) : '';
    if (uri) {
      return (
        <View style={styles.avatarWrap}>
          <Image source={{ uri }} style={styles.avatar} />
          <View style={[styles.avatarBadge, { backgroundColor: tint }]}>
            <Icon name={cat.icon} size={10} color="#fff" />
          </View>
        </View>
      );
    }
    const missedCall = entry.category === 'calls' && MISSED_RE.test(entry.lead.title || '');
    const iconTint = missedCall ? colors.danger : tint;
    return (
      <View style={[styles.iconCircle, { backgroundColor: `${iconTint}1F` }]}>
        <Icon
          name={missedCall ? 'call' : entry.lead.icon === 'warning-outline' ? 'warning' : cat.icon}
          size={20}
          color={iconTint}
          style={missedCall ? styles.missedIcon : null}
        />
      </View>
    );
  };

  const renderEntry = (entry) => {
    const cat = CATEGORY_BY_ID[entry.category] || CATEGORY_BY_ID.account;
    const tint = toneColor(colors, cat.tone);
    const lead = entry.lead;
    const unread = entry.unread > 0;
    const listingPhoto = lead.params?.listingImage ? resolveMediaUrl(lead.params.listingImage) : '';
    const missedLead = entry.category === 'calls' && MISSED_RE.test(lead.title || '');
    const canCallBack = entry.category === 'calls' && entry.chatId;
    const pillTint = entry.missed ? colors.danger : tint;
    const body = entryBody(entry);
    return (
      <Pressable
        key={entry.key}
        onPress={() => openEntry(entry)}
        onLongPress={() => setSheet({ type: 'entry', entry })}
        delayLongPress={300}
        style={({ pressed }) => [styles.card, unread && styles.cardUnread, pressed && styles.cardPressed]}
      >
        {unread ? <View style={[styles.unreadBar, { backgroundColor: tint }]} /> : null}
        {renderLeading(entry, tint, cat)}
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardTitle, unread && styles.cardTitleUnread]} numberOfLines={1}>
              {entryTitle(entry)}
            </Text>
            <Text style={[styles.cardTime, unread && { color: tint }]}>{formatNoticeTime(lead.createdAt)}</Text>
          </View>
          {body ? (
            <Text
              style={[styles.cardText, unread && styles.cardTextUnread, missedLead && { color: colors.danger }]}
              numberOfLines={2}
            >
              {body}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={[styles.kindPill, { backgroundColor: `${pillTint}1A` }]}>
              <Icon name={cat.icon} size={10} color={pillTint} />
              <Text style={[styles.kindText, { color: pillTint }]}>{entryMeta(entry)}</Text>
            </View>
            {lead.params?.listingTitle ? (
              <Text style={styles.metaListing} numberOfLines={1}>
                {lead.params.listingTitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.trailing}>
          {canCallBack ? (
            <Pressable
              onPress={() => callBack(entry)}
              hitSlop={6}
              style={[styles.callBtn, { backgroundColor: `${colors.success}1F` }]}
            >
              <Icon name="call" size={16} color={colors.success} />
            </Pressable>
          ) : listingPhoto ? (
            <Image source={{ uri: listingPhoto }} style={styles.listingThumb} />
          ) : null}
          {entry.unread > 1 ? (
            <View style={[styles.countBadge, { backgroundColor: tint }]}>
              <Text style={styles.countBadgeText}>{entry.unread > 99 ? '99+' : entry.unread}</Text>
            </View>
          ) : unread ? (
            <View style={[styles.unreadDot, { backgroundColor: tint }]} />
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderList = () => {
    if (loading && !entries.length) {
      return [0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.skeletonCard}>
          <View style={styles.skeletonCircle} />
          <View style={styles.cardBody}>
            <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            <View style={styles.skeletonLine} />
          </View>
        </View>
      ));
    }
    if (loadFailed && !entries.length) {
      return (
        <EmptyState
          compact
          icon="cloud-offline-outline"
          title="Couldn't load notifications"
          body="Check your internet connection and try again."
          buttonLabel="Retry"
          onButtonPress={retryLoad}
        />
      );
    }
    if (!entries.length) {
      return (
        <EmptyState
          compact
          icon={activeCat ? `${activeCat.icon}-outline` : 'notifications-off-outline'}
          title={unreadOnly ? 'All caught up' : activeCat ? activeCat.emptyTitle : 'No notifications yet'}
          body={
            unreadOnly
              ? 'You have no unread notifications here.'
              : activeCat?.empty || 'Messages, calls, meetups and updates show up here.'
          }
        />
      );
    }
    let lastGroup = '';
    return entries.map((entry) => {
      const group = dayGroup(entry.lead.createdAt);
      const showGroup = group !== lastGroup;
      lastGroup = group;
      return (
        <View key={entry.key}>
          {showGroup ? <Text style={styles.groupLabel}>{group}</Text> : null}
          {renderEntry(entry)}
        </View>
      );
    });
  };

  const sheetEntry = sheet?.type === 'entry' ? sheet.entry : null;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerBtn}>
          <Icon name="chevron-back" size={24} color={colors.onGradient} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>
            {unreadCount > 0 ? `${unreadCount} unread · ${totalCount} total` : 'You are all caught up'}
          </Text>
        </View>
        <Pressable
          onPress={markScopeRead}
          hitSlop={8}
          disabled={!scopeUnread}
          style={[styles.headerBtn, styles.headerBtnFilled, !scopeUnread && styles.headerBtnDisabled]}
        >
          <Icon name="checkmark-done" size={19} color={colors.onGradient} />
        </Pressable>
        <Pressable
          onPress={() => setSheet({ type: 'menu' })}
          hitSlop={8}
          style={[styles.headerBtn, styles.headerBtnFilled]}
        >
          <Icon name="ellipsis-horizontal" size={19} color={colors.onGradient} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerBand}
        />
        <View style={styles.gridCard}>
          <View style={styles.grid}>{CATEGORIES.map(renderTile)}</View>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.toolbarTitleWrap}>
            {activeCat ? (
              <Pressable onPress={() => selectCategory(category)} style={styles.scopeChip} hitSlop={6}>
                <Text style={styles.scopeChipText}>{activeCat.label}</Text>
                <Icon name="close" size={14} color={colors.primary} />
              </Pressable>
            ) : (
              <Text style={styles.toolbarTitle}>All notifications</Text>
            )}
          </View>
          <Pressable
            onPress={toggleUnreadOnly}
            style={[styles.togglePill, unreadOnly && styles.togglePillActive]}
          >
            <View style={[styles.toggleDot, unreadOnly && styles.toggleDotActive]} />
            <Text style={[styles.toggleText, unreadOnly && styles.toggleTextActive]}>
              Unread{scopeUnread ? ` · ${scopeUnread}` : ''}
            </Text>
          </Pressable>
        </View>

        <View style={styles.list}>{renderList()}</View>
        {entries.length > 0 ? (
          <Text style={styles.footerHint}>Long-press a notification for more options</Text>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(sheet)} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.sheetHandle} />
            {sheetEntry ? (
              <>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {entryTitle(sheetEntry)}
                </Text>
                <Text style={styles.sheetSub} numberOfLines={1}>
                  {entryMeta(sheetEntry)} · {formatNoticeTime(sheetEntry.lead.createdAt)}
                </Text>
                <SheetOption
                  styles={styles}
                  icon="open-outline"
                  label="Open"
                  color={colors.text}
                  onPress={() => {
                    setSheet(null);
                    openEntry(sheetEntry);
                  }}
                />
                {sheetEntry.category === 'calls' && sheetEntry.chatId ? (
                  <SheetOption
                    styles={styles}
                    icon="call-outline"
                    label="Call back"
                    color={colors.success}
                    onPress={() => {
                      setSheet(null);
                      callBack(sheetEntry);
                    }}
                  />
                ) : null}
                {sheetEntry.unread > 0 ? (
                  <SheetOption
                    styles={styles}
                    icon="checkmark-done-outline"
                    label="Mark as read"
                    color={colors.text}
                    onPress={() => {
                      setSheet(null);
                      markEntryRead(sheetEntry);
                    }}
                  />
                ) : null}
                <SheetOption
                  styles={styles}
                  icon="trash-outline"
                  label={sheetEntry.items.length > 1 ? `Delete ${sheetEntry.items.length} notifications` : 'Delete'}
                  color={colors.danger}
                  onPress={() => removeEntry(sheetEntry)}
                />
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>{activeCat ? activeCat.label : 'All notifications'}</Text>
                <Text style={styles.sheetSub}>
                  {scopeUnread ? `${scopeUnread} unread` : 'Nothing unread'}
                </Text>
                <SheetOption
                  styles={styles}
                  icon="checkmark-done-outline"
                  label="Mark all as read"
                  color={scopeUnread ? colors.text : colors.textMuted}
                  disabled={!scopeUnread}
                  onPress={markScopeRead}
                />
                <SheetOption
                  styles={styles}
                  icon="trash-outline"
                  label="Clear read notifications"
                  color={colors.danger}
                  onPress={clearRead}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SheetOption({ styles, icon, label, color, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.sheetOption, pressed && styles.cardPressed]}
    >
      <View style={[styles.sheetOptionIcon, { backgroundColor: `${color}14` }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.sheetOptionText, { color }]}>{label}</Text>
    </Pressable>
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
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  headerBand: {
    height: 36,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnFilled: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerBtnDisabled: {
    opacity: 0.45,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.onGradient,
  },
  headerSub: {
    marginTop: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
  },
  scroll: {
    paddingBottom: 32,
  },
  gridCard: {
    marginTop: -30,
    marginHorizontal: 14,
    padding: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  tile: {
    width: '32%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceMuted,
  },
  tileIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceMuted,
  },
  tileBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  tileSub: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  toolbarTitleWrap: {
    flex: 1,
    flexDirection: 'row',
  },
  toolbarTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: `${colors.primary}1A`,
  },
  scopeChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  togglePillActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}14`,
  },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
  },
  toggleDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.primary,
  },
  list: {
    paddingHorizontal: 14,
  },
  groupLabel: {
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 2,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardUnread: {
    backgroundColor: colors.surfaceMuted,
  },
  cardPressed: {
    opacity: 0.7,
  },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  avatarWrap: {
    width: 46,
    height: 46,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.iconBackground,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missedIcon: {
    transform: [{ rotate: '135deg' }],
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
  },
  cardTitleUnread: {
    fontWeight: '800',
  },
  cardTime: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  cardText: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  cardTextUnread: {
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  kindPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kindText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  metaListing: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  trailing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginLeft: 10,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skeletonCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    marginVertical: 4,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLineShort: {
    width: '45%',
  },
  footerHint: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 11,
    color: colors.textTertiary || colors.textMuted,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay || 'rgba(0,0,0,0.45)',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
    backgroundColor: colors.border,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  sheetSub: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  sheetOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
