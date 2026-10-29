import { useCallback, useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';
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

const SCOPES = [
  { value: 'sellers', label: 'Sellers' },
  { value: 'all', label: 'All users' },
];

export default function AdminTestersScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [scope, setScope] = useState('sellers');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminTesters({ scope, q, page, limit: 25 });
    if (error) return { error };
    const testers = page === 1 ? (data?.testers || []).map((u) => ({ ...u, id: String(u.id), tester: true })) : [];
    const sellers = (data?.sellers || []).map((u) => ({ ...u, id: String(u.id) }));
    return {
      items: [...testers, ...sellers],
      total: data?.total,
      totalPages: data?.totalPages,
      extra: { testers: page === 1 ? testers.length : undefined },
    };
  }, [scope, q]);

  const list = useAdminList(load, `${scope}|${q}`);
  const testerCount = list.items.filter((u) => u.tester).length;

  const makeTester = async (user) => {
    const ok = await confirmAction({
      title: `Make ${user.name} a tester?`,
      message: 'Their listings, shop and chats are hidden from the public. Only other testers see them. You can make them public again later.',
      confirmText: 'Make tester',
    });
    if (!ok) return;
    const { data, error } = await api.adminMakeTester(user.id);
    if (error) {
      showAdminError(error);
      return;
    }
    Alert.alert('Tester mode on', data?.message || `${user.name} is now a tester`);
    list.reload('refresh');
  };

  const exitTester = async (user) => {
    const plan = user.restore || {};
    const ok = await confirmAction({
      title: `Make ${user.name} public again?`,
      message:
        `${plan.listingsBack || 0} listing(s) and ${plan.shopsBack || 0} shop(s) from before testing go public again.\n` +
        `${plan.listingsDropped || 0} test listing(s), ${plan.shopsDropped || 0} test shop(s) and chats from testing are deleted.`,
      confirmText: 'Exit tester',
      destructive: true,
    });
    if (!ok) return;
    const { data, error } = await api.adminRestoreTester(user.id);
    if (error) {
      showAdminError(error);
      return;
    }
    const r = data?.result || {};
    Alert.alert('Back to public', `${data?.message || 'Done'}\n${r.listingsBack || 0} listings back, ${r.listingsDeleted || 0} test listings deleted.`);
    list.reload('refresh');
  };

  const deleteTester = async (user) => {
    const ok = await confirmAction({
      title: `Delete ${user.name} for good?`,
      message: 'The account and every listing, shop, chat, review, report and photo it has are deleted. This cannot be undone.',
      confirmText: 'Continue',
      destructive: true,
    });
    if (!ok) return;
    const typed = await ask({
      title: 'Type DELETE to confirm',
      message: `${user.name} and all their data are removed permanently.`,
      placeholder: 'DELETE',
      required: true,
      destructive: true,
      confirmText: 'Delete forever',
      maxLength: 10,
    });
    if (typed === null) return;
    if (typed.toUpperCase() !== 'DELETE') {
      Alert.alert('Not deleted', 'You need to type DELETE to confirm.');
      return;
    }
    const { data, error } = await api.adminDeleteTester(user.id);
    if (error) {
      showAdminError(error);
      return;
    }
    const r = data?.removed || {};
    Alert.alert('Deleted', `${data?.message || 'Deleted'}\n${r.listings || 0} listings, ${r.shops || 0} shops, ${r.chats || 0} chats, ${r.files || 0} files.`);
    list.removeItem(user.id);
  };

  const renderItem = ({ item, index }) => {
    const avatar = resolveMediaUrl(item.avatarUrl);
    const firstSeller = !item.tester && (index === 0 || list.items[index - 1]?.tester);
    return (
      <>
        {firstSeller ? <Text style={styles.groupTitle}>{scope === 'all' ? 'All users' : 'Sellers'} · tap to open</Text> : null}
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
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {item.tester ? <StatusPill status="reviewed" label="Tester" /> : null}
                {item.status !== 'active' ? <StatusPill status={item.status} /> : null}
              </View>
              <Text style={styles.meta} numberOfLines={1}>
                {[item.phone, item.shop?.name, `${item.activeListings}/${item.listings} live`].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.small}>
                {item.tester
                  ? `Tester since ${formatDateTime(item.testerSince)}`
                  : item.lastActiveAt
                    ? `Active ${formatDateTime(item.lastActiveAt)}`
                    : `Joined ${formatDateTime(item.createdAt)}`}
              </Text>
            </View>
          </View>
          <AdminActions
            actions={
              item.tester
                ? [
                    { label: 'Exit tester', icon: 'exit', tone: 'warning', onPress: () => exitTester(item) },
                    { label: 'Delete', icon: 'trash', tone: 'error', onPress: () => deleteTester(item) },
                  ]
                : [{ label: 'Make tester', icon: 'flask', tone: 'info', onPress: () => makeTester(item) }]
            }
          />
        </AdminCard>
      </>
    );
  };

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="flask"
        emptyTitle="Nobody found"
        emptyBody="Search by name or phone, or switch to All users."
        header={
          <>
            <AdminHeader
              title="Testers"
              subtitle={`${testerCount} tester${testerCount === 1 ? '' : 's'} · test posts stay hidden from the public`}
              onBack={() => navigation.goBack()}
            />
            <View style={styles.info}>
              <Icon name="information-circle" size={16} color={colors.info} />
              <Text style={styles.infoText}>
                Testers only see each other. Exit tester brings old listings back and deletes test data. Delete removes the whole account.
              </Text>
            </View>
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name or phone" />
            <AdminChips options={SCOPES} value={scope} onChange={setScope} />
            {testerCount ? <Text style={styles.groupTitle}>Current testers</Text> : null}
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
  info: { flexDirection: 'row', gap: 8, marginTop: 14, marginHorizontal: 16, padding: 12, borderRadius: 14, backgroundColor: colors.pastelBlue },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  groupTitle: { marginTop: 6, marginBottom: 8, marginHorizontal: 18, fontSize: 13, fontWeight: '800', color: colors.textTertiary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary },
  small: { marginTop: 2, fontSize: 11.5, color: colors.textMuted },
});
