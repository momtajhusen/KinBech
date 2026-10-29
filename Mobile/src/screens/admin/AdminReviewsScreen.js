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
  showAdminError,
  useAdminList,
  useDebouncedValue,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
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
                <Icon key={n} name={n <= rating ? 'star' : 'star-outline'} size={14} color={colors.warning} />
              ))}
              <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </View>
          <StatusPill status={item.status} />
        </View>

        {item.review ? <Text style={styles.body}>{item.review}</Text> : <Text style={styles.noBody}>No written review</Text>}

        {item.tags?.length ? (
          <View style={styles.tags}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.target} numberOfLines={1}>
          {item.shopId?.name ? `Shop: ${item.shopId.name}` : 'Individual seller'}
          {item.listing?.title ? ` · ${item.listing.title}` : ''}
        </Text>

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
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen },
  name: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  time: { marginLeft: 8, fontSize: 11, color: colors.textMuted },
  body: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  noBody: { marginTop: 10, fontSize: 13, fontStyle: 'italic', color: colors.textMuted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surfaceMuted },
  tagText: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary },
  target: { marginTop: 8, fontSize: 12, fontWeight: '600', color: colors.textTertiary },
});
