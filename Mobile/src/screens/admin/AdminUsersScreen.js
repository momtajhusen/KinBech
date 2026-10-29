import { useCallback, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import {
  AdminActions,
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  AdminSearch,
  MetaChip,
  MetaRow,
  MiniStats,
  StatusPill,
  confirmAction,
  showAdminError,
  useAdminList,
  useDebouncedValue,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles } from '../../components/admin/adminTheme';
import { formatDateTime, timeAgo, titleCase } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const STATUS_FILTERS = [
  { value: '', label: 'Any status', icon: 'apps' },
  { value: 'active', label: 'Active', icon: 'checkmark-circle' },
  { value: 'suspended', label: 'Suspended', icon: 'close-circle' },
  { value: 'strikes', label: 'Has strikes', icon: 'warning' },
  { value: 'chat_locked', label: 'Chat locked', icon: 'lock-closed' },
];

const SORTS = [
  { value: 'newest', label: 'Newest', icon: 'sparkles' },
  { value: 'recently_active', label: 'Recently active', icon: 'time' },
  { value: 'active_listings', label: 'Most ads', icon: 'pricetags' },
  { value: 'most_sold', label: 'Top sellers', icon: 'trophy' },
  { value: 'most_bought', label: 'Top buyers', icon: 'cart' },
  { value: 'top_rated', label: 'Top rated', icon: 'star' },
  { value: 'trust', label: 'Trust score', icon: 'shield-checkmark' },
  { value: 'oldest', label: 'Oldest', icon: 'calendar' },
];

const TYPE_LABELS = { buyer: 'Buyer', individual: 'Seller', shop: 'Shop', both: 'Seller + Shop' };

export default function AdminUsersScreen({ navigation }) {
  const styles = useThemedStyles(createStyles);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminUsers({ type, status, sort, q, page, limit: 20 });
    if (error) return { error };
    return {
      items: (data?.users || []).map((u) => ({ ...u, id: String(u.id || u._id) })),
      total: data?.total,
      totalPages: data?.totalPages,
      extra: data?.counts || null,
    };
  }, [type, status, sort, q]);

  const list = useAdminList(load, `${type}|${status}|${sort}|${q}`);
  const counts = list.extra || {};

  const typeOptions = [
    { value: '', label: 'All', icon: 'people', count: counts.all },
    { value: 'buyer', label: 'Buyers', icon: 'cart', count: counts.buyer },
    { value: 'individual', label: 'Sellers', icon: 'person', count: counts.individual },
    { value: 'shop', label: 'Shops', icon: 'storefront', count: counts.shop },
  ];

  const changeStatus = async (user, action) => {
    const ok = await confirmAction({
      title: action === 'suspend' ? 'Suspend this user?' : 'Reinstate this user?',
      message:
        action === 'suspend'
          ? `${user.name || 'This user'} will be signed out on every device and cannot use KinBech until reinstated.`
          : `${user.name || 'This user'} can sign in and use KinBech again.`,
      confirmText: action === 'suspend' ? 'Suspend' : 'Reinstate',
      destructive: action === 'suspend',
    });
    if (!ok) return;
    const { error } = await api.adminUpdateUserStatus(user.id, action);
    if (error) {
      showAdminError(error);
      return;
    }
    const nextStatus = action === 'suspend' ? 'suspended' : 'active';
    if (status && status !== nextStatus && status !== 'strikes' && status !== 'chat_locked') list.removeItem(user.id);
    else list.patchItem(user.id, { status: nextStatus });
  };

  const renderItem = ({ item }) => {
    const avatar = resolveMediaUrl(item.avatarUrl);
    const listings = item.listings || {};
    const suspended = item.status === 'suspended';
    const online = item.lastActiveAt && Date.now() - new Date(item.lastActiveAt).getTime() < 10 * 60 * 1000;
    return (
      <AdminCard onPress={() => navigation.navigate('AdminUserDetail', { userId: item.id, name: item.name })}>
        <View style={styles.row}>
          <View>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{String(item.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            {online ? <View style={styles.onlineDot} /> : null}
          </View>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name || 'No name'}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.contact} numberOfLines={1}>
              {[item.phone, item.email].filter(Boolean).join(' · ') || 'No contact'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {online ? 'Online now' : item.lastActiveAt ? `Seen ${timeAgo(item.lastActiveAt)}` : 'Never active'}
              {item.joinDate ? ` · joined ${timeAgo(item.joinDate)}` : ''}
            </Text>
          </View>
        </View>

        <MetaRow>
          <MetaChip icon={item.type === 'buyer' ? 'bag-handle' : item.type === 'individual' ? 'person' : 'storefront'} label={TYPE_LABELS[item.type] || titleCase(item.type)} tone="info" />
          {item.isTester ? <MetaChip icon="flask" label="Tester" tone="warning" /> : null}
          {item.plan ? <MetaChip icon="diamond" label={item.plan.name} tone="success" /> : null}
          {item.trustTier ? <MetaChip icon="shield-checkmark" label={`${titleCase(item.trustTier)}${item.trustScore != null ? ` · ${item.trustScore}` : ''}`} /> : null}
          {!item.profileComplete ? <MetaChip icon="person-circle" label="Profile incomplete" tone="warning" /> : null}
          {item.chatRestricted ? <MetaChip icon="chatbubble" label="Chat locked" tone="error" /> : null}
          {item.deletionScheduledFor ? <MetaChip icon="trash" label={`Deleting ${formatDateTime(item.deletionScheduledFor)}`} tone="error" /> : null}
          {item.suspendedUntil && suspended ? <MetaChip icon="time" label={`Until ${formatDateTime(item.suspendedUntil)}`} tone="error" /> : null}
          <MetaChip icon="location" label={item.location} />
          {item.shop?.name ? (
            <MetaChip
              icon="storefront"
              label={`${item.shop.name}${item.shop.isVerified ? ' ✓' : ''}${item.shop.followersCount ? ` · ${item.shop.followersCount} followers` : ''}`}
              tone={item.shop.isVerified ? 'success' : undefined}
            />
          ) : null}
          {listings.lastPostedAt ? <MetaChip icon="add-circle" label={`Posted ${timeAgo(listings.lastPostedAt)}`} /> : null}
        </MetaRow>

        <MiniStats
          items={[
            { label: 'Active', value: listings.active, tone: listings.active ? 'success' : undefined },
            { label: 'Pending', value: listings.pending, tone: listings.pending ? 'warning' : undefined },
            { label: 'Sold', value: item.soldCount ?? listings.sold },
            { label: 'Bought', value: item.boughtCount },
            { label: 'Rating', value: item.reviewCount ? `${Number(item.ratingAverage || 0).toFixed(1)}★` : '–' },
            { label: 'Strikes', value: item.strikes || 0, tone: item.strikes > 0 ? 'error' : undefined },
          ]}
        />

        <AdminActions
          actions={[
            item.phone && {
              label: 'Call',
              icon: 'call',
              tone: 'info',
              onPress: () => Linking.openURL(`tel:${String(item.phone).replace(/\s+/g, '')}`),
            },
            suspended
              ? { label: 'Reinstate', icon: 'refresh', tone: 'success', solid: true, onPress: () => changeStatus(item, 'reinstate') }
              : { label: 'Suspend', icon: 'ban', tone: 'error', onPress: () => changeStatus(item, 'suspend') },
            {
              label: 'More actions',
              icon: 'chevron-forward',
              tone: 'muted',
              onPress: () => navigation.navigate('AdminUserDetail', { userId: item.id, name: item.name }),
            },
          ]}
        />
      </AdminCard>
    );
  };

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="people"
        emptyTitle="No users found"
        emptyBody="Try another filter or search by name, phone or email."
        header={
          <>
            <AdminHeader icon="people" title="Users" subtitle={`${list.total || 0} user${list.total === 1 ? '' : 's'}`} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or email" />
            <AdminChips options={typeOptions} value={type} onChange={setType} />
            <AdminChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
            <AdminChips options={SORTS} value={sort} onChange={setSort} />
          </>
        }
      />
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  avatarLetter: { fontSize: 17, fontWeight: '800', color: colors.primary },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: colors.success,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  contact: { marginTop: 1, fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
  meta: { marginTop: 1, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
});
