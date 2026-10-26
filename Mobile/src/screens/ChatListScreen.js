import { useCallback, useMemo, useState, useRef } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import { ChatItemSkeleton } from '../components/SkeletonLoader';
import { PressableScale, enterUp } from '../components/Motion';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
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

function waitingFor(dateValue) {
  const ms = Date.now() - new Date(dateValue || 0).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function callIconColor(chat) {
  const status = chat.lastCallStatus;
  const missed = status === 'missed' || (status === 'cancelled' && !chat.lastMessageMine) || !status;
  if (status === 'answered') return '#22C55E';
  if (missed) return '#EF4444';
  return '#F59E0B';
}

function previewMeta(chat) {
  const kind = chat.lastMessageKind || 'text';
  const text = String(chat.lastMessage || '').trim();
  if (!text) return { icon: null, color: null, text: 'No messages yet' };
  if (kind === 'call') {
    return { icon: 'call', color: callIconColor(chat), text: text || 'Voice call' };
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

function ChatAvatar({ uri, name, isShop, stateColor, styles, colors }) {
  const initial = String(name || 'S').trim().charAt(0).toUpperCase() || 'S';
  return (
    <View style={styles.avatarWrap}>
      {uri ? (
        <Image source={{ uri }} style={[styles.avatar, stateColor && { borderColor: stateColor }]} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, stateColor && { borderColor: stateColor }]}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
      {isShop ? (
        <View style={styles.avatarShop}>
          <Icon name="storefront" size={10} color="#fff" />
        </View>
      ) : null}
      {stateColor ? <View style={[styles.avatarDot, { backgroundColor: stateColor, borderColor: colors.surface }]} /> : null}
    </View>
  );
}

function ChatCard({ chat, index, styles, colors, onPress }) {
  const peerShop = chat.otherUser?.shop;
  const name = peerShop?.name || chat.otherUser?.name || 'Seller';
  const listingTitle = chat.listing?.title;
  const listingPrice = chat.listing?.price != null ? formatPrice(chat.listing.price) : '';
  const avatarUri = resolveMediaUrl(peerShop?.logo || chat.otherUser?.avatarUrl || '');
  const listingThumb = resolveMediaUrl(chat.listing?.photos?.[0] || '');
  const timeLabel = formatChatTime(chat.lastMessageAt);
  const preview = previewMeta(chat);
  const unread = Number(chat.unreadCount) || 0;
  const needsReply = needsReplyFrom(chat);
  const isNew = needsReply && (unread > 0 || chat.lastMessageViewed === false);
  const stateColor = isNew ? colors.primary : needsReply ? colors.warning : null;
  const mineText = chat.lastMessageMine && preview.icon !== 'call' && preview.icon !== 'mic-outline';
  const tickColor = chat.lastMessageViewed ? '#53BDEB' : colors.textMuted;
  const iconColor =
    preview.color || (preview.icon === 'checkmark-done' ? tickColor : needsReply ? colors.text : colors.textMuted);

  return (
    <PressableScale
      scaleTo={0.98}
      entering={enterUp(index, 40)}
      style={styles.cardWrap}
      contentStyle={[styles.card, isNew ? styles.cardNew : needsReply ? styles.cardWaiting : null]}
      onPress={() => onPress({ chat, name, image: avatarUri || listingThumb })}
    >
      {stateColor ? <View style={[styles.accent, { backgroundColor: stateColor }]} /> : null}

      <View style={styles.cardTop}>
        <ChatAvatar
          uri={avatarUri}
          name={name}
          isShop={Boolean(peerShop)}
          stateColor={stateColor}
          styles={styles}
          colors={colors}
        />

        <View style={styles.copy}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, needsReply && styles.nameStrong]} numberOfLines={1}>
              {name}
            </Text>
            {timeLabel ? (
              <Text style={[styles.time, stateColor && { color: stateColor, fontWeight: '800' }]}>{timeLabel}</Text>
            ) : null}
          </View>
          {listingTitle ? (
            <View style={styles.listingRow}>
              <Icon name="pricetag-outline" size={12} color={colors.textMuted} />
              <Text style={styles.listingTitle} numberOfLines={1}>
                {listingTitle}
              </Text>
            </View>
          ) : null}
          {listingPrice ? <Text style={styles.listingPrice}>{listingPrice}</Text> : null}
        </View>

        {listingThumb ? <Image source={{ uri: listingThumb }} style={styles.thumb} /> : null}
      </View>

      <View
        style={[
          styles.previewBox,
          needsReply && styles.previewBoxIncoming,
          isNew && { borderColor: `${colors.primary}55` },
        ]}
      >
        {preview.icon ? <Icon name={preview.icon} size={15} color={iconColor} /> : null}
        <Text
          style={[styles.preview, needsReply && styles.previewIncoming, isNew && styles.previewNew]}
          numberOfLines={1}
        >
          {mineText ? `You: ${preview.text}` : preview.text}
        </Text>
        {unread > 0 ? (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>{unread > 99 ? '99+' : unread} new</Text>
          </View>
        ) : needsReply ? (
          <View style={styles.replyPill}>
            <Icon name="return-down-back" size={12} color="#fff" />
            <Text style={styles.replyPillText}>Reply · {waitingFor(chat.lastMessageAt)}</Text>
          </View>
        ) : chat.lastMessageMine && preview.icon === 'checkmark-done' ? (
          <Text style={[styles.statusText, chat.lastMessageViewed && { color: '#53BDEB' }]}>
            {chat.lastMessageViewed ? 'Seen' : 'Sent'}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

function SectionTitle({ icon, color, title, count, styles }) {
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionIcon, { backgroundColor: `${color}22` }]}>
        <Icon name={icon} size={13} color={color} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionCount, { backgroundColor: `${color}22` }]}>
        <Text style={[styles.sectionCountText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

export default function ChatListScreen({ navigation }) {
  useDisplayCurrency();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const hasLoadedRef = useRef(false);
  const people = useMemo(() => peopleFromChats(chats), [chats]);
  const waiting = useMemo(() => people.filter(needsReplyFrom), [people]);
  const others = useMemo(() => people.filter((chat) => !needsReplyFrom(chat)), [people]);
  const showAwaitingOnly = onlyAwaiting && waiting.length > 0;

  const loadChats = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.getChats();
    if (error) {
      console.error('Failed to load chats:', error);
      if (!hasLoadedRef.current) setChats([]);
    } else {
      setChats(data?.chats || []);
      hasLoadedRef.current = true;
    }
    if (!silent) setLoading(false);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(() => loadChats({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadChats({ silent: hasLoadedRef.current });
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

  const renderCards = (list, offset = 0) =>
    list.map((chat, index) => (
      <ChatCard
        key={chatKey(chat)}
        chat={chat}
        index={offset + index}
        styles={styles}
        colors={colors}
        onPress={openChat}
      />
    ));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ThemeStatusBar />
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            {people.length > 0
              ? `${people.length} chat${people.length === 1 ? '' : 's'}`
              : 'Message sellers about items you like'}
          </Text>
          {waiting.length > 0 ? (
            <Pressable
              hitSlop={6}
              onPress={() => setOnlyAwaiting((value) => !value)}
              style={[styles.awaitingChip, showAwaitingOnly && styles.awaitingChipActive]}
            >
              <View style={[styles.awaitingDot, showAwaitingOnly && styles.awaitingDotActive]} />
              <Text style={[styles.awaitingText, showAwaitingOnly && styles.awaitingTextActive]}>
                {waiting.length} waiting for your reply
              </Text>
              {showAwaitingOnly ? <Icon name="close" size={13} color="#fff" /> : null}
            </Pressable>
          ) : people.length > 0 ? (
            <View style={styles.doneChip}>
              <Icon name="checkmark-done" size={13} color={colors.primary} />
              <Text style={styles.doneText}>All replied</Text>
            </View>
          ) : null}
        </View>
      </View>

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
        ) : (
          <View>
            {waiting.length > 0 ? (
              <>
                <SectionTitle
                  icon="return-down-back"
                  color={colors.warning}
                  title="Waiting for your reply"
                  count={waiting.length}
                  styles={styles}
                />
                {renderCards(waiting)}
              </>
            ) : null}
            {!showAwaitingOnly && others.length > 0 ? (
              <>
                {waiting.length > 0 ? (
                  <SectionTitle
                    icon="chatbubbles"
                    color={colors.textSecondary}
                    title="Other chats"
                    count={others.length}
                    styles={styles}
                  />
                ) : null}
                {renderCards(others, waiting.length)}
              </>
            ) : null}
          </View>
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
    paddingTop: 6,
    paddingBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
  },
  subtitleRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  awaitingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${colors.warning}1F`,
  },
  awaitingChipActive: {
    backgroundColor: colors.warning,
  },
  awaitingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  awaitingDotActive: {
    backgroundColor: '#fff',
  },
  awaitingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  awaitingTextActive: {
    color: '#fff',
  },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.glow,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  listEmpty: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  sectionCount: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardWrap: {
    marginBottom: 10,
  },
  card: {
    padding: 12,
    paddingLeft: 14,
    gap: 10,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardWaiting: {
    backgroundColor: `${colors.warning}10`,
    borderColor: `${colors.warning}66`,
  },
  cardNew: {
    backgroundColor: colors.glow,
    borderColor: `${colors.primary}88`,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 52,
    height: 52,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.iconBackground || colors.background,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  avatarShop: {
    position: 'absolute',
    left: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarDot: {
    position: 'absolute',
    right: -3,
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  nameStrong: {
    fontWeight: '800',
    color: colors.text,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listingTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  listingPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.price || colors.primary,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.iconBackground || colors.background,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  previewBoxIncoming: {
    borderColor: `${colors.warning}40`,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textMuted,
  },
  previewIncoming: {
    color: colors.text,
    fontWeight: '600',
  },
  previewNew: {
    fontWeight: '800',
  },
  newBadge: {
    paddingHorizontal: 9,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  replyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warning,
  },
  replyPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
