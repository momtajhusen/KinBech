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
  MetaChip,
  MetaRow,
  StatusPill,
  showAdminError,
  useAdminList,
  useDebouncedValue,
} from '../../components/admin/AdminKit';
import { SoftPop } from '../../components/Motion';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatDateTime, timeAgo } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending', icon: 'time' },
  { value: 'approved', label: 'Approved', icon: 'checkmark-circle' },
  { value: 'rejected', label: 'Rejected', icon: 'eye-off' },
  { value: '', label: 'All', icon: 'apps' },
];

export default function AdminReviewsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminReviews({ status, q, page, limit: 20 });
    if (error) return { error };
    return {
      items: (data?.reviews || []).map((r) => ({ ...r, id: String(r._id || r.id) })),
      total: data?.total,
      totalPages: data?.totalPages,
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);

  const setReviewStatus = async (review, next) => {
    const { error } = await api.adminUpdateReview(review.id, next);
    if (error) {
      showAdminError(error);
      return;
    }
    if (status && status !== next) list.removeItem(review.id);
    else list.patchItem(review.id, { status: next });
  };

  const renderItem = ({ item }) => {
    const avatar = resolveMediaUrl(item.reviewer?.avatarUrl);
    const rating = Math.max(0, Math.min(5, Math.round(Number(item.rating) || 0)));
    return (
      <AdminCard>
        <View style={styles.row}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Icon name="person" size={18} color={colors.primary} />
            </View>
          )}
          <View style={styles.flex1}>
            <Text style={styles.name} numberOfLines={1}>{item.reviewer?.name || 'Buyer'}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <SoftPop key={n} index={n}>
                  <Icon name={n <= rating ? 'star' : 'star-outline'} size={13} color={colors.warning} />
                </SoftPop>
              ))}
              <Text style={styles.ratingText}>{rating}.0</Text>
              <Text style={styles.time}>· {timeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <StatusPill status={item.status} />
        </View>

        {item.review ? (
          <View style={styles.bodyBox}>
            <Icon name="chatbubble-outline" size={13} color={colors.textMuted} />
            <Text style={styles.body}>{item.review}</Text>
          </View>
        ) : (
          <Text style={styles.noBody}>No written review</Text>
        )}

        <MetaRow>
          {item.shopId?.name ? <MetaChip icon="storefront" tone="info" label={item.shopId.name} /> : <MetaChip icon="person" label="Individual seller" />}
          {item.listing?.title ? <MetaChip icon="pricetag" label={item.listing.title} /> : null}
          {(item.tags || []).map((tag) => <MetaChip key={tag} icon="checkmark" tone="success" label={tag} />)}
          <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
        </MetaRow>

        <AdminActions
          actions={[
            item.status !== 'approved' && { label: 'Approve', icon: 'checkmark-circle', tone: 'success', solid: true, onPress: () => setReviewStatus(item, 'approved') },
            item.status !== 'rejected' && { label: 'Hide', icon: 'eye-off', tone: 'error', onPress: () => setReviewStatus(item, 'rejected') },
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
        emptyIcon="star"
        emptyTitle="No reviews here"
        emptyBody="Buyer reviews of sellers show up in this list."
        header={
          <>
            <AdminHeader
              icon="star"
              title="Reviews"
              subtitle={`${list.total || 0} review${list.total === 1 ? '' : 's'}`}
              onBack={() => navigation.goBack()}
            />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search review text" />
            <AdminChips options={FILTERS} value={status} onChange={setStatus} />
          </>
        }
      />
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  name: { fontSize: 14, fontWeight: '800', color: colors.text },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  ratingText: { marginLeft: 5, fontSize: 11, fontWeight: '900', color: colors.warning },
  time: { marginLeft: 4, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  bodyBox: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    boxShadow: colors.clayPressed,
  },
  body: { flex: 1, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  noBody: { marginTop: 8, fontSize: 12.5, fontStyle: 'italic', color: colors.textMuted },
});
