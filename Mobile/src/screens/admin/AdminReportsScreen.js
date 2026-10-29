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
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, titleCase } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: '', label: 'All' },
];

export default function AdminReportsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminReports({ status, q, page, limit: 20 });
    if (error) return { error };
    return {
      items: (data?.reports || []).map((r) => ({ ...r, id: String(r._id || r.id) })),
      total: data?.total,
      totalPages: data?.totalPages,
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);

  const update = async (report, nextStatus) => {
    let notes;
    if (nextStatus !== 'reviewed') {
      notes = await ask({
        title: nextStatus === 'resolved' ? 'Resolve report' : 'Dismiss report',
        message: 'Add a note for the team (optional).',
        placeholder: 'What did you do?',
        confirmText: nextStatus === 'resolved' ? 'Resolve' : 'Dismiss',
      });
      if (notes === null) return;
    }
    const { error } = await api.adminUpdateReport(report.id, { status: nextStatus, ...(notes ? { notes } : {}) });
    if (error) {
      showAdminError(error);
      return;
    }
    if (status && status !== nextStatus) list.removeItem(report.id);
    else list.patchItem(report.id, { status: nextStatus, notes: notes || report.notes });
  };

  const removeListing = async (report) => {
    const listing = report.reportedListing;
    const reason = await ask({
      title: 'Remove reported listing',
      message: `"${listing.title}" is hidden from buyers. The seller sees this reason.`,
      placeholder: 'e.g. Fake listing reported by buyers',
      initial: titleCase(report.reason),
      required: true,
      destructive: true,
      confirmText: 'Remove',
      maxLength: 300,
    });
    if (reason === null) return;
    const listingId = String(listing._id || listing.id);
    const { error } = await api.adminUpdateListing(listingId, { status: 'removed', reason });
    if (error) {
      showAdminError(error);
      return;
    }
    const notes = `Listing removed: ${reason}`;
    const res = await api.adminUpdateReport(report.id, { status: 'resolved', notes });
    if (res.error) {
      showAdminError(res.error);
      list.patchItem(report.id, { reportedListing: { ...listing, status: 'removed' } });
      return;
    }
    if (status && status !== 'resolved') {
      list.removeItem(report.id);
      return;
    }
    list.patchItem(report.id, { status: 'resolved', notes, reportedListing: { ...listing, status: 'removed' } });
  };

  const openUser = (person) => {
    const userId = person?._id || person?.id;
    if (userId) navigation.navigate('AdminUserDetail', { userId: String(userId), name: person.name });
  };

  const renderItem = ({ item }) => {
    const listing = item.reportedListing;
    const photo = resolveMediaUrl(listing?.photos?.[0]);
    return (
      <AdminCard>
        <View style={styles.topRow}>
          <View style={styles.reasonIcon}>
            <Icon name="flag" size={16} color={colors.error} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.reason}>{titleCase(item.reason)}</Text>
            <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
          </View>
          <StatusPill status={item.status} />
        </View>

        {item.details ? <Text style={styles.details}>{item.details}</Text> : null}

        <View style={styles.people}>
          <Text style={styles.meta} onPress={() => openUser(item.reporter)}>
            <Text style={styles.metaLabel}>By </Text>{item.reporter?.name || 'Unknown'}
          </Text>
          <Icon name="arrow-forward" size={13} color={colors.textMuted} />
          <Text style={[styles.meta, styles.link]} onPress={() => openUser(item.reportedUser)}>
            <Text style={styles.metaLabel}>Against </Text>{item.reportedUser?.name || 'Unknown'}
          </Text>
        </View>

        {listing ? (
          <View style={styles.listing}>
            {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
            <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
            {listing.status ? <StatusPill status={listing.status} /> : null}
          </View>
        ) : null}

        {item.notes ? <Text style={styles.notes}>Note: {item.notes}</Text> : null}

        <AdminActions
          actions={[
            item.status !== 'resolved' && { label: 'Resolve', icon: 'checkmark-circle', tone: 'success', solid: true, onPress: () => update(item, 'resolved') },
            listing && listing.status !== 'removed' && { label: 'Remove listing', icon: 'trash', tone: 'error', onPress: () => removeListing(item) },
            item.reportedUser && { label: 'User', icon: 'person', tone: 'info', onPress: () => openUser(item.reportedUser) },
            item.status === 'pending' && { label: 'Reviewed', icon: 'eye', tone: 'info', onPress: () => update(item, 'reviewed') },
            item.status !== 'dismissed' && { label: 'Dismiss', icon: 'close-circle', tone: 'muted', onPress: () => update(item, 'dismissed') },
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
        emptyIcon="flag"
        emptyTitle="No reports here"
        emptyBody="User reports about listings and people show up in this list."
        header={
          <>
            <AdminHeader title="Reports" subtitle={`${list.total || 0} ${status || 'total'} report${list.total === 1 ? '' : 's'}`} />
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search reason, user or listing" />
            <AdminChips options={FILTERS} value={status} onChange={setStatus} />
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelRed },
  reason: { fontSize: 15, fontWeight: '800', color: colors.text },
  time: { marginTop: 1, fontSize: 11.5, color: colors.textMuted },
  details: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  people: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  meta: { fontSize: 13, fontWeight: '700', color: colors.text },
  metaLabel: { fontWeight: '600', color: colors.textMuted },
  link: { color: colors.primary },
  listing: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 8, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.border },
  listingTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  notes: { marginTop: 8, fontSize: 12.5, fontStyle: 'italic', color: colors.textTertiary },
});
