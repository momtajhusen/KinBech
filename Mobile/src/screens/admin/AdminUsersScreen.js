import { useCallback, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import Icon from '../../components/Icon';
import {
  AdminActions,
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  AdminSearch,
  StatusPill,
  confirmAction,
  showAdminError,
  useAdminList,
  useDebouncedValue,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, titleCase } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const STATUS_FILTERS = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'strikes', label: 'Has strikes' },
  { value: 'chat_locked', label: 'Chat locked' },
];

const TYPE_LABELS = { buyer: 'Buyer', individual: 'Seller', shop: 'Shop', both: 'Seller + Shop' };

export default function AdminUsersScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminUsers({ type, status, q, page, limit: 20 });
    if (error) return { error };
    return {
      items: (data?.users || []).map((u) => ({ ...u, id: String(u.id || u._id) })),
      total: data?.total,
      totalPages: data?.totalPages,
      extra: data?.counts || null,
    };
  }, [type, status, q]);

  const list = useAdminList(load, `${type}|${status}|${q}`);
  const counts = list.extra || {};

  const typeOptions = [
    { value: '', label: 'All', count: counts.all },
    { value: 'buyer', label: 'Buyers', count: counts.buyer },
    { value: 'individual', label: 'Sellers', count: counts.individual },
    { value: 'shop', label: 'Shops', count: counts.shop },
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
    return (
      <AdminCard onPress={() => navigation.navigate('AdminUserDetail', { userId: item.id, name: item.name })}>
        <View style={styles.row}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.avatarLetter}>{String(item.name || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name || 'No name'}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.contact} numberOfLines={1}>
              {[item.phone, item.email].filter(Boolean).join(' · ') || 'No contact'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[TYPE_LABELS[item.type] || titleCase(item.type), item.location, item.joinDate ? `Joined ${formatDateTime(item.joinDate)}` : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat styles={styles} label="Active" value={listings.active} />
          <Stat styles={styles} label="Pending" value={listings.pending} />
          <Stat styles={styles} label="Sold" value={listings.sold} />
          <Stat
            styles={styles}
            label="Rating"
            value={item.reviewCount ? `${Number(item.ratingAverage || 0).toFixed(1)}★` : '–'}
          />
          <Stat styles={styles} label="Strikes" value={item.strikes || 0} danger={item.strikes > 0} />
        </View>

        {item.shop?.name ? (
          <View style={styles.shopRow}>
            <Icon name="storefront" size={14} color={colors.primary} />
            <Text style={styles.shopName} numberOfLines={1}>{item.shop.name}</Text>
            {item.shop.isVerified ? <Icon name="checkmark-circle" size={14} color={colors.success} /> : null}
          </View>
        ) : null}

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
            <AdminHeader title="Users" subtitle={`${list.total || 0} user${list.total === 1 ? '' : 's'}`} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or email" />
            <AdminChips options={typeOptions} value={type} onChange={setType} />
            <AdminChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
          </>
        }
      />
    </View>
  );
}

function Stat({ styles, label, value, danger }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, danger && styles.statDanger]}>{value ?? 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen },
  avatarLetter: { fontSize: 19, fontWeight: '800', color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  contact: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  meta: { marginTop: 2, fontSize: 11.5, color: colors.textMuted },
  statsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 14, fontWeight: '800', color: colors.text },
  statDanger: { color: colors.error },
  statLabel: { marginTop: 1, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  shopName: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
