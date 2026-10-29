import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Icon from '../../components/Icon';
import {
  AdminActions,
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  AdminSearch,
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, formatNpr } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reported', label: 'Reported' },
  { value: 'active', label: 'Active' },
  { value: 'sold', label: 'Sold' },
  { value: 'removed', label: 'Removed' },
  { value: 'all', label: 'All' },
];

export default function AdminListingsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [viewer, setViewer] = useState('');
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminListings({
      status,
      q,
      page,
      limit: 20,
      ...(status === 'pending' ? { sort: 'oldest' } : {}),
    });
    if (error) return { error };
    return {
      items: (data?.listings || []).map((l) => ({ ...l, id: String(l.id || l._id) })),
      total: data?.total,
      totalPages: data?.totalPages,
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);

  const setListingStatus = async (listing, nextStatus) => {
    let reason = '';
    if (nextStatus === 'rejected' || nextStatus === 'removed' || nextStatus === 'pending') {
      const titles = { rejected: 'Reject listing', removed: 'Remove listing', pending: 'Hold for review' };
      const text = await ask({
        title: titles[nextStatus],
        message: 'The seller sees this reason.',
        placeholder: 'e.g. Photos do not match the item',
        required: nextStatus !== 'pending',
        destructive: nextStatus !== 'pending',
        confirmText: nextStatus === 'pending' ? 'Hold' : nextStatus === 'rejected' ? 'Reject' : 'Remove',
        maxLength: 300,
      });
      if (text === null) return;
      reason = text;
    }
    const { data, error } = await api.adminUpdateListing(listing.id, { status: nextStatus, ...(reason ? { reason } : {}) });
    if (error) {
      showAdminError(error);
      return;
    }
    const saved = data?.listing?.status || (nextStatus === 'rejected' ? 'removed' : nextStatus);
    const stillMatches = status === 'all' || status === 'reported' || status === saved;
    if (stillMatches) {
      const fresh = data?.listing || {};
      list.patchItem(listing.id, {
        status: saved,
        moderationReason: fresh.moderationReason ?? reason,
        matchedKeywords: fresh.matchedKeywords ?? listing.matchedKeywords,
      });
    }
    else list.removeItem(listing.id);
  };

  const renderItem = ({ item }) => {
    const photo = resolveMediaUrl(item.photos?.[0]);
    const sellerName = item.shopId?.name || item.seller?.name || 'Seller';
    const sellerId = String(item.seller?.id || item.seller?._id || (typeof item.seller === 'string' ? item.seller : ''));
    const actions =
      item.status === 'pending'
        ? [
            { label: 'Approve', icon: 'checkmark-circle', tone: 'success', solid: true, onPress: () => setListingStatus(item, 'active') },
            { label: 'Reject', icon: 'close-circle', tone: 'error', onPress: () => setListingStatus(item, 'rejected') },
          ]
        : item.status === 'active'
          ? [
              { label: 'Hold', icon: 'pause-circle', tone: 'warning', onPress: () => setListingStatus(item, 'pending') },
              { label: 'Remove', icon: 'trash', tone: 'error', onPress: () => setListingStatus(item, 'removed') },
            ]
          : item.status === 'removed' || item.status === 'hidden'
            ? [{ label: 'Restore', icon: 'refresh', tone: 'success', onPress: () => setListingStatus(item, 'active') }]
            : [];

    return (
      <AdminCard>
        <View style={styles.row}>
          {photo ? (
            <Pressable onPress={() => setViewer(photo)}>
              <Image source={{ uri: photo }} style={styles.photo} />
            </Pressable>
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Icon name="image-outline" size={22} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.flex1}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.price}>{formatNpr(item.price)}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {[item.category, item.condition, item.location].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        {item.photos?.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {item.photos.map((url, i) => (
              <Pressable key={`${url}-${i}`} onPress={() => setViewer(resolveMediaUrl(url))}>
                <Image source={{ uri: resolveMediaUrl(url) }} style={styles.stripPhoto} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.infoRow}>
          <Pressable
            style={styles.infoItem}
            disabled={!sellerId}
            onPress={() => navigation.navigate('AdminUserDetail', { userId: sellerId, name: item.seller?.name })}
          >
            <Icon name={item.shopId?.name ? 'storefront' : 'person'} size={13} color={colors.primary} />
            <Text style={[styles.infoText, styles.link]} numberOfLines={1}>{sellerName}</Text>
          </Pressable>
          <View style={styles.infoItem}>
            <Icon name="eye" size={13} color={colors.textTertiary} />
            <Text style={styles.infoText}>{item.views || 0}</Text>
          </View>
          {item.reportsCount ? (
            <View style={[styles.infoItem, styles.reportBadge]}>
              <Icon name="flag" size={12} color={colors.error} />
              <Text style={[styles.infoText, styles.reportText]}>{item.reportsCount}</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
        </View>

        {item.description ? (
          <Text style={styles.description} numberOfLines={item.status === 'pending' ? 8 : 3}>{item.description}</Text>
        ) : null}

        {item.moderationReason ? (
          <View style={styles.reasonBox}>
            <Icon name="information-circle" size={14} color={colors.warning} />
            <Text style={styles.reasonText}>{item.moderationReason}</Text>
          </View>
        ) : null}
        {item.matchedKeywords?.length ? (
          <Text style={styles.keywords}>Flagged words: {item.matchedKeywords.join(', ')}</Text>
        ) : null}

        <AdminActions actions={actions} />
      </AdminCard>
    );
  };

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="pricetags"
        emptyTitle={status === 'pending' ? 'Review queue is clear' : 'No listings here'}
        emptyBody={status === 'pending' ? 'New listings that need a check show up here.' : 'Try another filter or search.'}
        header={
          <>
            <AdminHeader title="Listings" subtitle={`${list.total || 0} listing${list.total === 1 ? '' : 's'}`} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search title or description" />
            <AdminChips options={FILTERS} value={status} onChange={setStatus} />
          </>
        }
      />
      {prompt}
      <Modal visible={Boolean(viewer)} transparent animationType="fade" onRequestClose={() => setViewer('')}>
        <Pressable style={styles.viewer} onPress={() => setViewer('')}>
          {viewer ? <Image source={{ uri: viewer }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <View style={styles.viewerClose}>
            <Icon name="close" size={22} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  photo: { width: 76, height: 76, borderRadius: 14, backgroundColor: colors.surfaceMuted },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.text, lineHeight: 19 },
  price: { marginTop: 4, fontSize: 15, fontWeight: '800', color: colors.primary },
  meta: { marginTop: 3, fontSize: 12, color: colors.textTertiary },
  infoRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '45%' },
  infoText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  reportBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.pastelRed },
  reportText: { color: colors.error },
  time: { marginLeft: 'auto', fontSize: 11, color: colors.textMuted },
  description: { marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.textTertiary },
  reasonBox: { flexDirection: 'row', gap: 6, marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: colors.pastelOrange },
  reasonText: { flex: 1, fontSize: 12.5, color: colors.textSecondary },
  keywords: { marginTop: 6, fontSize: 12, fontWeight: '600', color: colors.error },
  link: { color: colors.primary },
  strip: { gap: 8, marginTop: 10 },
  stripPhoto: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.92)' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
