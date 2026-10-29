import { useCallback, useState } from 'react';
import { Image, Text, View } from 'react-native';
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
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'unverified', label: 'Not verified', params: { isVerified: 'false', status: 'active' } },
  { value: 'verified', label: 'Verified', params: { isVerified: 'true' } },
  { value: 'suspended', label: 'Suspended', params: { status: 'suspended' } },
  { value: 'all', label: 'All', params: {} },
];

export default function AdminShopsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [filter, setFilter] = useState(route.params?.initial === 'pending' ? 'unverified' : 'all');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const params = FILTERS.find((f) => f.value === filter)?.params || {};
    const { data, error } = await api.adminShops({ ...params, q, page, limit: 20 });
    if (error) return { error };
    return {
      items: (data?.shops || []).map((s) => ({ ...s, id: String(s._id || s.id) })),
      total: data?.total,
      totalPages: data?.totalPages,
    };
  }, [filter, q]);

  const list = useAdminList(load, `${filter}|${q}`);

  const save = async (shop, payload, patch) => {
    const { error } = await api.adminUpdateShop(shop.id, payload);
    if (error) {
      showAdminError(error);
      return;
    }
    const next = { ...shop, ...patch };
    const matches =
      filter === 'all' ||
      (filter === 'unverified' && !next.isVerified && next.status === 'active') ||
      (filter === 'verified' && next.isVerified) ||
      (filter === 'suspended' && next.status === 'suspended');
    if (matches) list.patchItem(shop.id, patch);
    else list.removeItem(shop.id);
  };

  const verify = (shop) =>
    save(shop, { verificationStatus: 'approved' }, { isVerified: true, verificationStatus: 'approved' });

  const reject = async (shop) => {
    const reason = await ask({
      title: shop.isVerified ? 'Remove verified badge' : 'Reject verification',
      message: 'Tell the shop owner what is missing.',
      placeholder: 'e.g. PAN document is not readable',
      required: true,
      destructive: true,
      confirmText: shop.isVerified ? 'Remove badge' : 'Reject',
      maxLength: 300,
    });
    if (reason === null) return;
    await save(
      shop,
      { verificationStatus: 'rejected', verificationNotes: reason },
      { isVerified: false, verificationStatus: 'rejected', verificationNotes: reason }
    );
  };

  const toggleSuspend = async (shop) => {
    const suspending = shop.status !== 'suspended';
    const ok = await confirmAction({
      title: suspending ? 'Suspend this shop?' : 'Reactivate this shop?',
      message: suspending ? 'The shop and its listings stop showing to buyers.' : 'The shop shows to buyers again.',
      confirmText: suspending ? 'Suspend' : 'Reactivate',
      destructive: suspending,
    });
    if (!ok) return;
    const status = suspending ? 'suspended' : 'active';
    await save(shop, { status }, { status });
  };

  const renderItem = ({ item }) => {
    const logo = resolveMediaUrl(item.logo);
    return (
      <AdminCard>
        <View style={styles.row}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoEmpty]}>
              <Icon name="storefront" size={22} color={colors.primary} />
            </View>
          )}
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {item.isVerified ? <Icon name="checkmark-circle" size={16} color={colors.success} /> : null}
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {[item.category, item.location].filter(Boolean).join(' · ') || 'No category'}
            </Text>
            <Text style={styles.owner} numberOfLines={1}>
              Owner: {item.owner?.name || 'Unknown'}{item.owner?.phone ? ` · ${item.owner.phone}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.pills}>
          <StatusPill status={item.status} />
          <StatusPill
            status={item.verificationStatus || 'none'}
            label={item.isVerified ? 'Verified' : item.verificationStatus === 'pending' ? 'Verification requested' : item.verificationStatus === 'rejected' ? 'Verification rejected' : 'Not verified'}
          />
          <Text style={styles.small}>{item.listingsCount || 0} live items</Text>
          <Text style={[styles.small, styles.right]}>{formatDateTime(item.createdAt)}</Text>
        </View>

        {item.verificationNotes ? <Text style={styles.notes}>Note: {item.verificationNotes}</Text> : null}

        <AdminActions
          actions={[
            !item.isVerified && { label: 'Verify', icon: 'shield-checkmark', tone: 'success', solid: true, onPress: () => verify(item) },
            (item.isVerified || item.verificationStatus === 'pending') && {
              label: item.isVerified ? 'Remove badge' : 'Reject',
              icon: 'close-circle',
              tone: 'warning',
              onPress: () => reject(item),
            },
            {
              label: item.status === 'suspended' ? 'Reactivate' : 'Suspend',
              icon: item.status === 'suspended' ? 'refresh' : 'ban',
              tone: item.status === 'suspended' ? 'success' : 'error',
              onPress: () => toggleSuspend(item),
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
        emptyIcon="storefront"
        emptyTitle="No shops here"
        emptyBody="Try another filter or search by shop name."
        header={
          <>
            <AdminHeader
              title="Shops"
              subtitle={`${list.total || 0} shop${list.total === 1 ? '' : 's'}`}
              onBack={() => navigation.goBack()}
            />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search shop name" />
            <AdminChips options={FILTERS} value={filter} onChange={setFilter} />
          </>
        }
      />
      {prompt}
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.surfaceMuted },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { marginTop: 2, fontSize: 12.5, color: colors.textTertiary },
  owner: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  pills: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  small: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  right: { marginLeft: 'auto' },
  notes: { marginTop: 8, fontSize: 12.5, fontStyle: 'italic', color: colors.textTertiary },
});
