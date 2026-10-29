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
  MetaChip,
  MetaRow,
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import {
  LISTING_HOLD_REASONS,
  LISTING_REJECT_REASONS,
  formatDateTime,
  formatNpr,
  timeAgo,
  titleCase,
  waitingFor,
} from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending', icon: 'time' },
  { value: 'reported', label: 'Reported', icon: 'flag' },
  { value: 'active', label: 'Active', icon: 'checkmark-circle' },
  { value: 'sold', label: 'Sold', icon: 'bag-check' },
  { value: 'removed', label: 'Removed', icon: 'trash' },
  { value: 'all', label: 'All', icon: 'apps' },
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
        message: 'Tap one or more reasons, or type your own. The seller sees this.',
        presets: nextStatus === 'pending' ? LISTING_HOLD_REASONS : LISTING_REJECT_REASONS,
        placeholder: 'Or type a reason, or add detail',
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

    const photoCount = item.photos?.length || 0;
    const isShop = item.sellerType === 'shop' || Boolean(item.shopId?.name);
    const waiting = item.status === 'pending' ? waitingFor(item.heldAt || item.createdAt) : '';
    const openSeller = sellerId
      ? () => navigation.navigate('AdminUserDetail', { userId: sellerId, name: item.seller?.name })
      : undefined;

    return (
      <AdminCard>
        <View style={styles.row}>
          {photo ? (
            <Pressable onPress={() => setViewer(photo)}>
              <Image source={{ uri: photo }} style={styles.photo} />
              {photoCount > 1 ? (
                <View style={styles.photoCount}>
                  <Icon name="images" size={9} color={colors.white} />
                  <Text style={styles.photoCountText}>{photoCount}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Icon name="image-outline" size={20} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.flex1}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <StatusPill status={item.status} />
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatNpr(item.price)}</Text>
              {waiting ? <Text style={styles.waiting}>waiting {waiting}</Text> : null}
            </View>
            <Pressable onPress={openSeller} disabled={!openSeller} style={styles.sellerRow} hitSlop={4}>
              <Icon name={isShop ? 'storefront' : 'person'} size={11} color={colors.primary} />
              <Text style={styles.seller} numberOfLines={1}>{sellerName}</Text>
              {item.verified ? <Icon name="checkmark-circle" size={12} color={colors.success} /> : null}
              <Text style={styles.time} numberOfLines={1}>· {timeAgo(item.createdAt)}</Text>
            </Pressable>
          </View>
        </View>

        <MetaRow>
          {item.reportsCount ? <MetaChip icon="flag" label={`${item.reportsCount} report${item.reportsCount === 1 ? '' : 's'}`} tone="error" /> : null}
          {item.isFeatured ? <MetaChip icon="flash" label="Featured" tone="warning" /> : null}
          {item.verificationLabel && item.verified ? <MetaChip icon="shield-checkmark" label={item.verificationLabel} tone="success" /> : null}
          <MetaChip icon="grid" label={item.category} />
          <MetaChip icon="sparkles" label={item.condition ? titleCase(item.condition) : ''} />
          <MetaChip icon="location" label={item.location} />
          <MetaChip icon="eye" label={`${item.views || 0} views`} />
          <MetaChip icon={isShop ? 'storefront' : 'person'} label={isShop ? 'Shop' : 'Individual'} />
          {item.listingKind === 'stock' ? <MetaChip icon="cube" label={item.stockState ? `Stock · ${titleCase(item.stockState)}` : 'Stock item'} /> : null}
          {item.meetupOption ? <MetaChip icon="walk" label={titleCase(item.meetupOption)} /> : null}
          {item.autoSold ? <MetaChip icon="time" label="Auto sold" tone="info" /> : null}
          {item.autoHiddenReason ? <MetaChip icon="eye-off" label={item.autoHiddenReason} tone="muted" /> : null}
          <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
        </MetaRow>

        {photoCount > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {item.photos.map((url, i) => (
              <Pressable key={`${url}-${i}`} onPress={() => setViewer(resolveMediaUrl(url))}>
                <Image source={{ uri: resolveMediaUrl(url) }} style={styles.stripPhoto} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {item.description ? (
          <Text style={styles.description} numberOfLines={item.status === 'pending' ? 5 : 2}>{item.description}</Text>
        ) : null}

        {item.moderationReason ? (
          <View style={styles.reasonBox}>
            <Icon name="information-circle" size={13} color={colors.warning} />
            <Text style={styles.reasonText}>{item.moderationReason}</Text>
          </View>
        ) : null}
        {item.matchedKeywords?.length ? (
          <MetaRow>
            {item.matchedKeywords.map((word) => <MetaChip key={word} icon="alert-circle" label={word} tone="error" />)}
          </MetaRow>
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
            <AdminHeader icon="pricetags" title="Listings" subtitle={`${list.total || 0} listing${list.total === 1 ? '' : 's'}`} />
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', gap: 11 },
  photo: { width: 64, height: 64, borderRadius: 15, backgroundColor: colors.surfaceMuted },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoCount: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  photoCountText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 13.5, fontWeight: '800', color: colors.text, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  price: { fontSize: 14.5, fontWeight: '900', color: colors.primary },
  waiting: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 10,
    fontWeight: '900',
    color: colors.warning,
    backgroundColor: colors.pastelOrange,
  },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  seller: { flexShrink: 1, fontSize: 11.5, fontWeight: '800', color: colors.primary },
  time: { flexShrink: 0, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  description: { marginTop: 8, fontSize: 12.5, lineHeight: 17, color: colors.textTertiary },
  reasonBox: { flexDirection: 'row', gap: 6, marginTop: 9, padding: 9, borderRadius: 13, backgroundColor: colors.pastelOrange, boxShadow: colors.clayTint },
  reasonText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  strip: { gap: 8, marginTop: 10 },
  stripPhoto: { width: 58, height: 58, borderRadius: 13, backgroundColor: colors.surfaceMuted },
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
