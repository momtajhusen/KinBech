import { useCallback, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Icon from '../../components/Icon';
import { PressableScale, Wiggle } from '../../components/Motion';
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
import { LISTING_REJECT_REASONS, formatDateTime, formatNpr, timeAgo, titleCase, waitingFor } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const FILTERS = [
  { value: 'pending', label: 'Pending', icon: 'time' },
  { value: 'reviewed', label: 'Reviewed', icon: 'eye' },
  { value: 'resolved', label: 'Resolved', icon: 'checkmark-circle' },
  { value: 'dismissed', label: 'Dismissed', icon: 'close-circle' },
  { value: '', label: 'All', icon: 'apps' },
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
      message: `"${listing.title}" is hidden from buyers. Tap reasons or type your own; the seller sees this.`,
      presets: LISTING_REJECT_REASONS,
      placeholder: 'Or type a reason, or add detail',
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
    const against = item.reportedUser;
    const open = item.status === 'pending' || item.status === 'reviewed';
    return (
      <AdminCard>
        <View style={styles.topRow}>
          <Wiggle angle={open ? 10 : 0} every={4500} style={styles.reasonIcon}>
            <Icon name="flag" size={14} color={colors.error} />
          </Wiggle>
          <View style={styles.flex1}>
            <Text style={styles.reason} numberOfLines={1}>{titleCase(item.reason)}</Text>
            <Text style={styles.time}>
              {timeAgo(item.createdAt)}
              {open ? ` · open ${waitingFor(item.createdAt)}` : ''}
            </Text>
          </View>
          <StatusPill status={item.status} />
        </View>

        {item.details ? <Text style={styles.details} numberOfLines={4}>{item.details}</Text> : null}

        <View style={styles.people}>
          <PressableScale onPress={() => openUser(item.reporter)} style={styles.flex1} contentStyle={styles.person}>
            <View style={styles.personHead}>
              <Icon name="person-outline" size={10} color={colors.textMuted} />
              <Text style={styles.personLabel}>REPORTER</Text>
            </View>
            <Text style={styles.personName} numberOfLines={1}>{item.reporter?.name || 'Unknown'}</Text>
          </PressableScale>
          <Icon name="arrow-forward" size={14} color={colors.textMuted} />
          <PressableScale onPress={() => openUser(against)} style={styles.flex1} contentStyle={styles.person}>
            <View style={styles.personHead}>
              <Icon name="alert-circle-outline" size={10} color={colors.error} />
              <Text style={styles.personLabel}>AGAINST</Text>
            </View>
            <Text style={[styles.personName, styles.link]} numberOfLines={1}>{against?.name || 'Unknown'}</Text>
          </PressableScale>
        </View>

        <MetaRow>
          {item.reportsAgainstUser > 1 ? <MetaChip icon="flag" label={`${item.reportsAgainstUser} reports on user`} tone="error" /> : null}
          {against?.strikes ? <MetaChip icon="alert-circle" label={`${against.strikes} strike${against.strikes === 1 ? '' : 's'}`} tone="warning" /> : null}
          {against?.status === 'suspended' ? <MetaChip icon="ban" label="Suspended" tone="error" /> : null}
          {listing && item.reportsAgainstListing > 1 ? <MetaChip icon="pricetags" label={`${item.reportsAgainstListing} reports on ad`} tone="error" /> : null}
          <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
        </MetaRow>

        {listing ? (
          <View style={styles.listing}>
            {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
            <View style={styles.flex1}>
              <Text style={styles.listingTitle} numberOfLines={1}>{listing.title}</Text>
              {listing.price != null ? <Text style={styles.listingPrice}>{formatNpr(listing.price)}</Text> : null}
            </View>
            {listing.status ? <StatusPill status={listing.status} /> : null}
          </View>
        ) : null}

        {item.notes ? <Text style={styles.notes} numberOfLines={2}>Note: {item.notes}</Text> : null}

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
            <AdminHeader icon="flag" title="Reports" subtitle={`${list.total || 0} ${status || 'total'} report${list.total === 1 ? '' : 's'}`} />
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reasonIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelRed, boxShadow: colors.clayTint },
  reason: { fontSize: 14, fontWeight: '800', color: colors.text },
  time: { marginTop: 1, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  details: { marginTop: 8, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  people: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  person: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.backgroundSecondary, boxShadow: colors.clayPressed },
  personLabel: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8, color: colors.textMuted },
  personName: { marginTop: 1, fontSize: 12.5, fontWeight: '800', color: colors.text },
  link: { color: colors.primary },
  listing: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9, padding: 8, borderRadius: 14, backgroundColor: colors.backgroundSecondary, boxShadow: colors.clayPressed },
  thumb: { width: 38, height: 38, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.border },
  listingTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  listingPrice: { marginTop: 1, fontSize: 11.5, fontWeight: '900', color: colors.primary },
  notes: { marginTop: 8, fontSize: 12, fontStyle: 'italic', color: colors.textTertiary },
});
