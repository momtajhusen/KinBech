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
  MetaChip,
  MetaRow,
  StatusPill,
  confirmAction,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { Float, Wiggle } from '../../components/Motion';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatDateTime, timeAgo } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const SCOPES = [
  { value: 'sellers', label: 'Sellers', icon: 'storefront' },
  { value: 'all', label: 'All users', icon: 'people' },
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
            <View>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarLetter}>{String(item.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {item.tester ? (
                <Wiggle angle={14} every={5000} style={styles.testerBadge}>
                  <Icon name="flask" size={10} color={colors.white} />
                </Wiggle>
              ) : null}
            </View>
            <View style={styles.flex1}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {item.tester ? <StatusPill status="reviewed" label="Tester" /> : null}
                {item.status !== 'active' ? <StatusPill status={item.status} /> : null}
              </View>
              <View style={styles.timeRow}>
                <Icon name="time-outline" size={11} color={colors.textMuted} />
                <Text style={styles.small}>
                  {item.tester
                    ? `Tester since ${formatDateTime(item.testerSince)}`
                    : item.lastActiveAt
                      ? `Active ${timeAgo(item.lastActiveAt)}`
                      : `Joined ${timeAgo(item.createdAt)}`}
                </Text>
              </View>
            </View>
          </View>
          <MetaRow>
            {item.phone ? <MetaChip icon="call" label={item.phone} /> : null}
            {item.shop?.name ? <MetaChip icon="storefront" tone="info" label={item.shop.name} /> : null}
            <MetaChip icon="pricetags" tone={item.activeListings ? 'success' : undefined} label={`${item.activeListings || 0}/${item.listings || 0} live`} />
          </MetaRow>
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
              icon="flask"
              title="Testers"
              subtitle={`${testerCount} tester${testerCount === 1 ? '' : 's'} · test posts stay hidden from the public`}
              onBack={() => navigation.goBack()}
            />
            <View style={styles.info}>
              <Float distance={2}>
                <Icon name="information-circle" size={16} color={colors.info} />
              </Float>
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  info: { flexDirection: 'row', gap: 8, marginTop: 14, marginHorizontal: 16, padding: 12, borderRadius: 18, backgroundColor: colors.pastelBlue, boxShadow: colors.clayTint },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  groupTitle: { marginTop: 10, marginBottom: 10, marginHorizontal: 20, fontSize: 10.5, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: colors.primary },
  testerBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: colors.info,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  small: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
});
