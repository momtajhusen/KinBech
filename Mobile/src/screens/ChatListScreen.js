import { useCallback, useMemo, useState, useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import CallMinutesPill from '../components/CallMinutesPill';
import { ChatItemSkeleton } from '../components/SkeletonLoader';
import { PressableScale, enterUp } from '../components/Motion';
import { useVoiceScreen } from '../components/VoiceHost';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { requireCallSetup } from '../services/callReadiness';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useDisplayCurrency } from '../utils/currency';
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

function previewMeta(chat, colors) {
  const kind = chat.lastMessageKind || 'text';
  const text = String(chat.lastMessage || '').trim();
  if (!text) return { icon: null, color: null, text: 'No messages yet' };
  if (kind === 'call') {
    const status = chat.lastCallStatus;
    const missed = status === 'missed' || (status === 'cancelled' && !chat.lastMessageMine) || !status;
    return { icon: 'call', color: missed ? colors.error : colors.textMuted, text: text || 'Voice call' };
  }
  if (kind === 'voice') return { icon: 'mic-outline', color: null, text: 'Voice message' };
  if (chat.lastMessageMine) return { icon: 'checkmark-done', color: null, text };
  return { icon: null, color: null, text };
}

function needsReplyFrom(chat) {
  return Boolean(chat && String(chat.lastMessage || '').trim() && !chat.lastMessageMine);
}

function peopleFromChats(chats) {
  const byConversation = new Map();
  chats.forEach((chat) => {
    const userId = String(chat.otherUser?.id || chat.otherUser?._id || chat.id);
    const listingId = String(chat.listing?.id || chat.listing?._id || '');
    const key = `${userId}:${listingId || 'general'}`;
    const unread = Number(chat.unreadCount) || 0;
    const existing = byConversation.get(key);
    if (!existing) {
      byConversation.set(key, { ...chat, chatIds: [chat.id], unreadCount: unread });
      return;
    }
    existing.chatIds.push(chat.id);
    existing.unreadCount += unread;
  });
  return [...byConversation.values()].sort(
    (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
  );
}

function chatKey(chat) {
  return `${chat.otherUser?.id || chat.id}:${chat.listing?.id || chat.listing?._id || chat.id}`;
}

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'unread', label: 'Unread', test: (chat) => chat.unreadCount > 0 },
  { id: 'reply', label: 'Needs reply', test: needsReplyFrom },
  { id: 'buying', label: 'Buying', test: (chat) => chat.myRole === 'buyer', optional: true },
  { id: 'selling', label: 'Selling', test: (chat) => chat.myRole === 'seller', optional: true },
  { id: 'shops', label: 'Shops', test: (chat) => Boolean(chat.otherUser?.shop), optional: true },
  { id: 'blocked', label: 'Blocked', test: (chat) => Boolean(blockLabel(chat)), optional: true },
];

function blockLabel(chat) {
  const block = chat.block;
  if (block?.messages && block?.calls) return 'Blocked';
  if (block?.messages) return 'Messages blocked';
  if (block?.calls) return 'Calls blocked';
  return '';
}

const EMPTY_FILTER_TEXT = {
  unread: 'You have read every message.',
  reply: 'You are all caught up. Nobody is waiting on you.',
  buying: 'Chats about items you want to buy show up here.',
  selling: 'Chats from buyers on your listings show up here.',
  shops: 'Chats with shops show up here.',
  blocked: 'People you block show up here.',
};

function ChatAvatar({ uri, name, thumb, styles }) {
  const initial = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
  return (
    <View style={styles.avatarWrap}>
      {uri ? (
        <Image source={{ uri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
      {thumb && thumb !== uri ? <Image source={{ uri: thumb }} style={styles.avatarThumb} /> : null}
    </View>
  );
}

function ChatRow({ chat, index, styles, colors, onPress }) {
  const peerShop = chat.otherUser?.shop;
  const name = peerShop?.name || chat.otherUser?.name || 'Seller';
  const listingTitle = chat.listing?.title;
  const listingPrice = chat.listing?.price != null ? formatPrice(chat.listing.price) : '';
  const avatarUri = resolveMediaUrl(peerShop?.logo || chat.otherUser?.avatarUrl || '');
  const listingThumb = resolveMediaUrl(chat.listing?.photos?.[0] || '');
  const timeLabel = formatChatTime(chat.lastMessageAt);
  const preview = previewMeta(chat, colors);
  const unread = Number(chat.unreadCount) || 0;
  const needsReply = needsReplyFrom(chat);
  const blocked = blockLabel(chat);
  const mineText = chat.lastMessageMine && preview.icon !== 'call' && preview.icon !== 'mic-outline';
  const iconColor =
    preview.color ||
    (preview.icon === 'checkmark-done'
      ? chat.lastMessageViewed
        ? colors.chatRead
        : colors.textMuted
      : colors.textMuted);

  return (
    <PressableScale
      scaleTo={0.985}
      entering={enterUp(index, 30)}
      contentStyle={styles.row}
      onPress={() => onPress({ chat, name, image: avatarUri || listingThumb })}
    >
      <ChatAvatar uri={avatarUri} name={name} thumb={listingThumb} styles={styles} />

      <View style={styles.body}>
        <View style={styles.line}>
          <View style={styles.nameWrap}>
            <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
              {name}
            </Text>
            {peerShop ? <Icon name="storefront-outline" size={13} color={colors.textMuted} /> : null}
          </View>
          {timeLabel ? <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{timeLabel}</Text> : null}
        </View>

        {listingTitle ? (
          <Text style={styles.listing} numberOfLines={1}>
            {listingTitle}
            {listingPrice ? <Text style={styles.listingPrice}>{`  ·  ${listingPrice}`}</Text> : null}
          </Text>
        ) : null}

        <View style={styles.line}>
          <View style={styles.previewWrap}>
            {preview.icon ? <Icon name={preview.icon} size={15} color={iconColor} /> : null}
            <Text style={[styles.preview, unread > 0 && styles.previewUnread]} numberOfLines={1}>
              {mineText ? `You: ${preview.text}` : preview.text}
            </Text>
          </View>
          {blocked ? (
            <View style={styles.blockedTag}>
              <Icon name="ban" size={11} color={colors.error} />
              <Text style={styles.blockedTagText}>{blocked}</Text>
            </View>
          ) : unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : needsReply ? (
            <Text style={styles.replyHint}>Reply</Text>
          ) : null}
        </View>
      </View>
    </PressableScale>
  );
}

function FilterChip({ label, count, active, onPress, styles }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      {count > 0 ? (
        <View style={[styles.chipCount, active && styles.chipCountActive]}>
          <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ChatListScreen({ navigation }) {
  useDisplayCurrency();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterId, setFilterId] = useState('all');
  const [callAllowance, setCallAllowance] = useState(null);
  const hasLoadedRef = useRef(false);
  const people = useMemo(() => peopleFromChats(chats), [chats]);

  const filters = useMemo(
    () =>
      FILTERS.map((filter) => ({
        ...filter,
        count: filter.id === 'all' ? 0 : people.filter(filter.test).length,
      })).filter((filter) => !filter.optional || filter.count > 0 || filter.id === filterId),
    [people, filterId]
  );
  const activeFilter = filters.find((filter) => filter.id === filterId) || filters[0];
  const visible = useMemo(() => people.filter(activeFilter.test), [people, activeFilter]);
  const unreadTotal = useMemo(() => people.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0), [people]);

  const loadChats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.getChats();
    if (error) {
      console.error('Failed to load chats:', error);
      if (!hasLoadedRef.current) setChats([]);
    } else {
      setChats(data?.chats || []);
      setCallAllowance(data?.callAllowance || null);
      hasLoadedRef.current = true;
    }
    if (!silent) setLoading(false);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(() => loadChats({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadChats({ silent: hasLoadedRef.current });
      requireCallSetup().catch(() => {});
    }, [loadChats])
  );

  const openChat = ({ chat, name, image }) => {
    navigation.navigate(ROUTES.CHAT, {
      chatId: chat.chatIds[0],
      chatIds: chat.chatIds,
      name,
      listing: chat.listing,
      otherUserId: chat.otherUser?.id,
      image,
    });
  };

  const voiceChats = visible.slice(0, 8);
  const chatName = (chat) => chat.otherUser?.shop?.name || chat.otherUser?.name || 'Seller';
  useVoiceScreen({
    getCurrent: () => ({
      screen: {
        about: [
          voiceChats.length
            ? `The numbered items are the buyer's chats (${unreadTotal} unread messages in total).`
            : 'The buyer has no chats yet.',
        ],
        items: voiceChats.map((chat) => ({
          title: `${chatName(chat)}${chat.listing?.title ? ` about ${chat.listing.title}` : ''}${chat.unreadCount ? `, ${chat.unreadCount} unread` : ''}`,
        })),
      },
    }),
    onTurn: (turn) => {
      if (turn?.action !== 'open_item') return undefined;
      const chat = voiceChats[(turn.pick || 0) - 1];
      if (!chat) return null;
      const image = resolveMediaUrl(chat.otherUser?.shop?.logo || chat.otherUser?.avatarUrl || '');
      return { act: () => openChat({ chat, name: chatName(chat), image }) };
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ThemeStatusBar />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Chats</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {people.length === 0
              ? 'Message sellers about items you like'
              : unreadTotal > 0
                ? `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}`
                : `${people.length} conversation${people.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        <CallMinutesPill allowance={callAllowance} />
      </View>

      {people.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {filters.map((filter) => (
              <FilterChip
                key={filter.id}
                label={filter.label}
                count={filter.count}
                active={filter.id === activeFilter.id}
                onPress={() => setFilterId(filter.id)}
                styles={styles}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.list, people.length === 0 && styles.listEmpty]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {people.length === 0 && loading ? (
          <View>
            {[0, 1, 2, 3, 4, 5].map((i) => <ChatItemSkeleton key={i} />)}
          </View>
        ) : people.length === 0 ? (
          <EmptyState
            compact
            icon="chatbubbles-outline"
            title="No conversations yet"
            body="Open an item and message the seller. Your chats will show up here."
          />
        ) : visible.length === 0 ? (
          <View style={styles.filterEmpty}>
            <View style={styles.filterEmptyIcon}>
              <Icon name="checkmark-done" size={22} color={colors.primary} />
            </View>
            <Text style={styles.filterEmptyTitle}>Nothing here</Text>
            <Text style={styles.filterEmptyBody}>{EMPTY_FILTER_TEXT[activeFilter.id]}</Text>
            <Pressable hitSlop={8} onPress={() => setFilterId('all')}>
              <Text style={styles.filterEmptyLink}>Show all chats</Text>
            </Pressable>
          </View>
        ) : (
          visible.map((chat, index) => (
            <ChatRow
              key={chatKey(chat)}
              chat={chat}
              index={index}
              styles={styles}
              colors={colors}
              onPress={openChat}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const AVATAR = 54;

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
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
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  chipCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glow,
  },
  chipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  chipCountTextActive: {
    color: colors.onPrimary,
  },
  list: {
    paddingBottom: 28,
  },
  listEmpty: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 16,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.iconBackground,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glow,
  },
  avatarInitial: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.primary,
  },
  avatarThumb: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.iconBackground,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingVertical: 13,
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  nameUnread: {
    fontWeight: '800',
  },
  time: {
    fontSize: 12,
    color: colors.textMuted,
  },
  timeUnread: {
    color: colors.primary,
    fontWeight: '700',
  },
  listing: {
    fontSize: 12.5,
    color: colors.textMuted,
  },
  listingPrice: {
    fontWeight: '700',
    color: colors.price,
  },
  previewWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: '600',
  },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  blockedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.dangerBackground,
  },
  blockedTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
  },
  replyHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  filterEmpty: {
    alignItems: 'center',
    paddingTop: 64,
    paddingHorizontal: 40,
    gap: 6,
  },
  filterEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glow,
    marginBottom: 6,
  },
  filterEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  filterEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: colors.textMuted,
  },
  filterEmptyLink: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
});
