import { useCallback, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import Icon from '../../components/Icon';
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
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { timeAgo, waitingFor } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'unverified', label: 'Not verified', icon: 'time', params: { isVerified: 'false', status: 'active' } },
  { value: 'verified', label: 'Verified', icon: 'shield-checkmark', params: { isVerified: 'true' } },
  { value: 'suspended', label: 'Suspended', icon: 'close-circle', params: { status: 'suspended' } },
  { value: 'all', label: 'All', icon: 'apps', params: {} },
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
    const ownerId = item.owner?._id || item.owner?.id;
    const docs = item.businessDocuments || [];
    const awaiting = item.verificationStatus === 'pending';
    return (
      <AdminCard>
        <View style={styles.row}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoEmpty]}>
              <Icon name="storefront" size={20} color={colors.primary} />
            </View>
          )}
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {item.isVerified ? <Icon name="checkmark-circle" size={14} color={colors.success} /> : null}
              <StatusPill status={item.status} />
            </View>
            <Pressable
              disabled={!ownerId}
              onPress={() => navigation.navigate('AdminUserDetail', { userId: String(ownerId), name: item.owner?.name })}
            >
              <Text style={styles.owner} numberOfLines={1}>
                {item.owner?.name || 'Unknown owner'}{item.owner?.phone ? ` · ${item.owner.phone}` : ''}
              </Text>
            </Pressable>
            <Text style={styles.meta} numberOfLines={1}>
              Opened {timeAgo(item.createdAt)}
              {awaiting && item.verificationSubmittedAt ? ` · waiting ${waitingFor(item.verificationSubmittedAt)}` : ''}
            </Text>
          </View>
        </View>

        <MetaRow>
          <MetaChip
            icon="shield-checkmark"
            label={item.isVerified ? 'Verified' : awaiting ? 'Verification requested' : item.verificationStatus === 'rejected' ? 'Rejected' : 'Not verified'}
            tone={item.isVerified ? 'success' : awaiting ? 'warning' : item.verificationStatus === 'rejected' ? 'error' : undefined}
          />
          <MetaChip icon="grid" label={item.category} />
          <MetaChip icon="location" label={item.location || item.address} />
          {item.phone ? <MetaChip icon="call" label={item.phone} /> : null}
          {item.panMasked ? <MetaChip icon="document-text" label={`PAN ${item.panMasked}`} /> : null}
          {item.vatMasked ? <MetaChip icon="document-text" label={`VAT ${item.vatMasked}`} /> : null}
          {docs.map((doc, i) => (
            <MetaChip
              key={`${doc.url}-${i}`}
              icon="open"
              label={doc.label || `Document ${i + 1}`}
              tone="info"
              onPress={doc.viewUrl ? () => Linking.openURL(resolveMediaUrl(doc.viewUrl)) : undefined}
            />
          ))}
        </MetaRow>

        <MiniStats
          items={[
            { label: 'Live items', value: item.listingsCount || 0, tone: item.listingsCount ? 'success' : undefined },
            { label: 'Rating', value: item.reviewCount ? `${Number(item.ratingAverage || 0).toFixed(1)}★` : '–' },
            { label: 'Reviews', value: item.reviewCount || 0 },
            { label: 'Followers', value: item.followersCount || 0 },
            { label: 'Docs', value: docs.length, tone: awaiting && !docs.length ? 'error' : undefined },
          ]}
        />

        {item.verificationNotes ? <Text style={styles.notes} numberOfLines={2}>Note: {item.verificationNotes}</Text> : null}

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
              icon="storefront"
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surfaceMuted },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  owner: { marginTop: 1, fontSize: 11.5, fontWeight: '800', color: colors.primary },
  meta: { marginTop: 1, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  notes: { marginTop: 8, fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
});
