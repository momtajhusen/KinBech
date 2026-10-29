import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { AdminHeader, StatusPill, confirmAction, showAdminError, toneColors, usePrompt } from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, formatNpr, titleCase } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const SUSPEND_DAYS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'Permanent' },
];
const CHAT_DAYS = SUSPEND_DAYS.filter((d) => d.value > 0);

export default function AdminUserDetailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { userId, name: initialName } = route.params || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [prompt, ask] = usePrompt();

  const load = useCallback(async () => {
    const res = await api.adminUserDetail(userId);
    if (res.data?.user) {
      setData(res.data);
      setError('');
    } else {
      setError(res.error || 'Could not load this user.');
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /** Runs one admin action, shows its result and reloads the page. */
  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key);
    try {
      const res = await fn();
      if (!res) return;
      if (res.error) {
        showAdminError(res.error);
        return;
      }
      if (res.message) setNotice(res.message);
      if (res.leave) {
        navigation.goBack();
        return;
      }
      await load();
    } finally {
      setBusy('');
    }
  };

  if (!data) {
    return (
      <View style={styles.container}>
        <AdminHeader title={initialName || 'User'} subtitle="User details" onBack={() => navigation.goBack()} />
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        )}
      </View>
    );
  }

  const { user, restrictions, deletion, stats } = data;
  const avatar = resolveMediaUrl(user.avatarUrl);
  const isAppUser = user.role === 'user';
  const deleted = Boolean(deletion?.deletedAt);
  const who = user.name || user.phone || 'this user';

  const moderate = (payload, message) => async () => {
    const res = await api.adminModerateUser(user.id, payload);
    return res.error ? res : { message: res.data?.summary || message };
  };

  const suspend = async () => {
    const answer = await ask({
      title: `Suspend ${who}`,
      message: 'They are signed out everywhere and cannot use KinBech until it ends.',
      choices: SUSPEND_DAYS,
      choiceInitial: 7,
      placeholder: 'Reason (the user sees this)',
      required: true,
      destructive: true,
      confirmText: 'Suspend',
      maxLength: 300,
    });
    if (!answer) return null;
    return moderate({ action: 'suspend', days: answer.choice, reason: answer.text })();
  };

  const restrictChat = async () => {
    const answer = await ask({
      title: `Restrict chat for ${who}`,
      message: 'They can browse but cannot send messages until it ends.',
      choices: CHAT_DAYS,
      choiceInitial: 3,
      placeholder: 'Reason (the user sees this)',
      required: true,
      destructive: true,
      confirmText: 'Restrict chat',
      maxLength: 300,
    });
    if (!answer) return null;
    return moderate({ action: 'restrict_chat', days: answer.choice, reason: answer.text })();
  };

  const strike = async () => {
    const reason = await ask({
      title: `Add a strike to ${who}`,
      message: `They have ${restrictions.strikes.length} strike${restrictions.strikes.length === 1 ? '' : 's'}. More strikes suspend the account automatically.`,
      placeholder: 'Reason for the strike',
      required: true,
      destructive: true,
      confirmText: 'Add strike',
      maxLength: 300,
    });
    if (reason === null) return null;
    const res = await api.adminStrikeUser(user.id, reason);
    if (res.error) return res;
    return { message: `Strike ${res.data?.strikes || ''} added${res.data?.action && res.data.action !== 'none' ? ` (${titleCase(res.data.action)})` : ''}` };
  };

  const setCredits = async () => {
    const text = await ask({
      title: 'Featured credits',
      message: 'Each credit boosts one listing to Featured for 24 hours.',
      keyboardType: 'number-pad',
      initial: String(user.featuredCredits || 0),
      required: true,
      confirmText: 'Save',
      maxLength: 4,
    });
    if (text === null) return null;
    return moderate({ action: 'set_credits', credits: Number(text) })();
  };

  const confirmed = (options, fn) => async () => ((await confirmAction(options)) ? fn() : null);

  const makeTester = confirmed(
    {
      title: `Make ${who} a tester?`,
      message: 'Their listings, shop and chats are hidden from the public. Only other testers see them.',
      confirmText: 'Make tester',
    },
    async () => {
      const res = await api.adminMakeTester(user.id);
      return res.error ? res : { message: res.data?.message || 'Now a tester' };
    }
  );

  const exitTester = confirmed(
    {
      title: `Take ${who} out of Tester mode?`,
      message: 'Listings and shops from before testing go public again. Everything created while testing (posts, chats, reviews) is deleted.',
      confirmText: 'Make public',
      destructive: true,
    },
    async () => {
      const res = await api.adminRestoreTester(user.id);
      if (res.error) return res;
      const r = res.data?.result || {};
      return {
        message: `${res.data?.message || 'Public again'}: ${r.listingsBack || 0} listings back, ${r.listingsDeleted || 0} test listings deleted.`,
      };
    }
  );

  const deleteTester = async () => {
    const ok = await confirmAction({
      title: `Delete ${who} for good?`,
      message: 'This deletes the account and all its listings, shops, chats, reviews, reports and photos. It cannot be undone.',
      confirmText: 'Continue',
      destructive: true,
    });
    if (!ok) return null;
    const typed = await ask({
      title: 'Type DELETE to confirm',
      message: `Everything from ${who} is removed permanently.`,
      placeholder: 'DELETE',
      required: true,
      destructive: true,
      confirmText: 'Delete forever',
      maxLength: 10,
    });
    if (typed === null) return null;
    if (typed.toUpperCase() !== 'DELETE') {
      Alert.alert('Not deleted', 'You need to type DELETE to confirm.');
      return null;
    }
    const res = await api.adminDeleteTester(user.id);
    if (res.error) return res;
    const r = res.data?.removed || {};
    Alert.alert('Deleted', `${res.data?.message || 'Deleted'} (${r.listings || 0} listings, ${r.shops || 0} shops, ${r.chats || 0} chats).`);
    return { leave: true };
  };

  const actions = !isAppUser || deleted
    ? []
    : [
        restrictions.suspended
          ? { key: 'reinstate', label: 'Reinstate', icon: 'refresh', tone: 'success', run: confirmed({ title: `Reinstate ${who}?`, message: 'They can sign in and use KinBech again.', confirmText: 'Reinstate' }, moderate({ action: 'reinstate' }, 'Reinstated')) }
          : { key: 'suspend', label: 'Suspend', icon: 'ban', tone: 'error', run: suspend },
        restrictions.chatRestricted
          ? { key: 'lift_chat', label: 'Lift chat limit', icon: 'chatbubbles', tone: 'success', run: moderate({ action: 'lift_chat' }, 'Chat restriction lifted') }
          : { key: 'restrict_chat', label: 'Restrict chat', icon: 'chatbubbles', tone: 'warning', run: restrictChat },
        { key: 'strike', label: 'Add strike', icon: 'warning', tone: 'error', run: strike },
        { key: 'force_logout', label: 'Sign out everywhere', icon: 'log-out', tone: 'info', run: confirmed({ title: 'Sign out everywhere?', message: `${who} has to sign in again on every device.`, confirmText: 'Sign out' }, moderate({ action: 'force_logout' }, 'Signed out')) },
        { key: 'credits', label: `Credits (${user.featuredCredits || 0})`, icon: 'rocket', tone: 'info', run: setCredits },
        user.isTester
          ? { key: 'exit_tester', label: 'Exit tester', icon: 'flask', tone: 'warning', run: exitTester }
          : { key: 'make_tester', label: 'Make tester', icon: 'flask', tone: 'info', run: makeTester },
        user.isTester ? { key: 'delete_tester', label: 'Delete tester', icon: 'trash', tone: 'error', run: deleteTester } : null,
        deletion?.scheduledFor
          ? { key: 'cancel_deletion', label: 'Cancel deletion', icon: 'arrow-undo', tone: 'success', run: confirmed({ title: 'Cancel account deletion?', message: 'Their listings and shops come back. They sign in again to use the app.', confirmText: 'Cancel deletion' }, async () => { const res = await api.adminCancelDeletion(user.id); return res.error ? res : { message: 'Deletion cancelled' }; }) }
          : null,
      ].filter(Boolean);

  const statCards = [
    { label: 'Active', value: stats.listings.active },
    { label: 'Pending', value: stats.listings.pending },
    { label: 'Sold', value: stats.listings.sold },
    { label: 'Hidden', value: stats.listings.hidden },
    { label: 'Reports', value: stats.reports.against, danger: stats.reports.pending > 0 },
    { label: 'Filed', value: stats.reports.filed },
    { label: 'Rating', value: stats.rating.avg ? `${stats.rating.avg}★` : '–' },
    { label: 'Chats', value: stats.chats },
    { label: 'Scam flags', value: stats.scamFlags30d, danger: stats.scamFlags30d > 0 },
    { label: 'Deals', value: user.dealsCompleted },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <AdminHeader title={user.name || 'No name'} subtitle={titleCase(user.role === 'user' ? 'App user' : user.role)} onBack={() => navigation.goBack()}>
          <View style={styles.profile}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{String(user.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.flex1}>
              {user.phone ? <Text style={styles.profileLine} selectable>{user.phone}</Text> : null}
              {user.email ? <Text style={styles.profileLine} selectable numberOfLines={1}>{user.email}</Text> : null}
              <Text style={styles.profileMuted} numberOfLines={1}>
                {[user.location, `Joined ${formatDateTime(user.joinedAt)}`].filter(Boolean).join(' · ')}
              </Text>
              {user.lastActiveAt ? <Text style={styles.profileMuted}>Last active {formatDateTime(user.lastActiveAt)}</Text> : null}
            </View>
            {user.phone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${String(user.phone).replace(/\s+/g, '')}`)}
                style={styles.callBtn}
                accessibilityLabel="Call user"
              >
                <Icon name="call" size={18} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.badges}>
            <StatusPill status={user.status} />
            {user.isTester ? <StatusPill status="reviewed" label="Tester" /> : null}
            <StatusPill status="none" label={`Trust: ${titleCase(user.trustTier)}${user.trustScore != null ? ` ${user.trustScore}` : ''}`} />
            {user.subscription ? <StatusPill status="active" label={`${user.subscription.name} · ${user.subscription.daysLeft}d left`} /> : null}
          </View>
        </AdminHeader>

        {notice ? (
          <Pressable onPress={() => setNotice('')} style={styles.notice}>
            <Icon name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}

        {restrictions.suspended || restrictions.chatRestricted || deletion?.scheduledFor || deleted ? (
          <View style={styles.alertBox}>
            {restrictions.suspended ? (
              <Text style={styles.alertLine}>
                Suspended {restrictions.suspendedUntil ? `until ${formatDateTime(restrictions.suspendedUntil)}` : 'permanently'}
              </Text>
            ) : null}
            {restrictions.chatRestricted ? (
              <Text style={styles.alertLine}>Chat restricted until {formatDateTime(restrictions.chatRestrictedUntil)}</Text>
            ) : null}
            {restrictions.restrictionReason ? <Text style={styles.alertReason}>Reason: {restrictions.restrictionReason}</Text> : null}
            {deleted ? <Text style={styles.alertLine}>Account deleted {formatDateTime(deletion.deletedAt)}</Text> : null}
            {!deleted && deletion?.scheduledFor ? (
              <Text style={styles.alertLine}>User asked to delete; scheduled for {formatDateTime(deletion.scheduledFor)}</Text>
            ) : null}
          </View>
        ) : null}

        {actions.length ? (
          <>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionGrid}>
              {actions.map((action) => {
                const tone = toneColors(colors, action.tone);
                return (
                  <Pressable
                    key={action.key}
                    disabled={Boolean(busy)}
                    onPress={() => run(action.key, action.run)}
                    style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: tone.bg }]}>
                      {busy === action.key ? (
                        <ActivityIndicator size="small" color={tone.fg} />
                      ) : (
                        <Icon name={action.icon} size={18} color={tone.fg} />
                      )}
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>{action.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : !isAppUser ? (
          <Text style={styles.muted}>Staff accounts are managed from the website admin panel.</Text>
        ) : null}

        <Text style={styles.sectionTitle}>Numbers</Text>
        <View style={styles.statGrid}>
          {statCards.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statValue, s.danger && styles.danger]}>{s.value ?? 0}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {restrictions.strikes.length ? (
          <Section title={`Strikes (${restrictions.strikes.length})`} styles={styles}>
            {restrictions.strikes.map((s, i) => (
              <Row key={i} styles={styles} title={s.reason} meta={[formatDateTime(s.at), s.by].filter(Boolean).join(' · ')} />
            ))}
          </Section>
        ) : null}

        {data.listings.length ? (
          <Section title={`Listings (${stats.listings.total})`} styles={styles}>
            {data.listings.map((l) => {
              const photo = resolveMediaUrl(l.photo);
              return (
                <View key={l.id} style={styles.listingRow}>
                  {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{l.title}</Text>
                    <Text style={styles.rowMeta}>{formatNpr(l.price)} · {l.views} views · {formatDateTime(l.createdAt)}</Text>
                  </View>
                  <StatusPill status={l.status} />
                </View>
              );
            })}
          </Section>
        ) : null}

        {data.shops.length ? (
          <Section title="Shops" styles={styles}>
            {data.shops.map((s) => (
              <Row
                key={s.id}
                styles={styles}
                title={`${s.name}${s.isVerified ? ' ✓' : ''}`}
                meta={`Opened ${formatDateTime(s.createdAt)}`}
                right={<StatusPill status={s.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.reports.length ? (
          <Section title="Reports against this user" styles={styles}>
            {data.reports.map((r) => (
              <Row
                key={r.id}
                styles={styles}
                title={titleCase(r.reason)}
                body={r.details}
                meta={`By ${r.reporter} · ${formatDateTime(r.createdAt)}`}
                right={<StatusPill status={r.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.tickets?.length ? (
          <Section title="Support tickets" styles={styles}>
            {data.tickets.map((t) => (
              <Row
                key={t.id}
                styles={styles}
                title={t.subject}
                body={t.message}
                meta={formatDateTime(t.createdAt)}
                right={<StatusPill status={t.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.payments?.rows?.length ? (
          <Section title={`Plan payments · ${formatNpr(data.payments.paid)} paid`} styles={styles}>
            {data.payments.rows.map((p) => (
              <Row
                key={p.id}
                styles={styles}
                title={`${p.planName} · ${formatNpr(p.price)}`}
                meta={`${p.methodLabel || p.method} · ${formatDateTime(p.createdAt)}`}
                right={<StatusPill status={p.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.audit?.length ? (
          <Section title="Admin history" styles={styles}>
            {data.audit.slice(0, 10).map((a) => (
              <Row key={a.id} styles={styles} title={a.summary || a.action} meta={[a.actorName, formatDateTime(a.createdAt)].filter(Boolean).join(' · ')} />
            ))}
          </Section>
        ) : null}
      </ScrollView>
      {prompt}
    </View>
  );
}

function Section({ title, styles, children }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.panel}>{children}</View>
    </>
  );
}

function Row({ styles, title, body, meta, right }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex1}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        {body ? <Text style={styles.rowBody} numberOfLines={3}>{body}</Text> : null}
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  pressed: { opacity: 0.75 },
  loader: { marginTop: 60 },
  muted: { marginTop: 16, marginHorizontal: 18, fontSize: 13, color: colors.textMuted },
  danger: { color: colors.error },
  errorBox: { alignItems: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.white, fontWeight: '800' },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: colors.white },
  profileLine: { fontSize: 13.5, fontWeight: '700', color: colors.white },
  profileMuted: { marginTop: 1, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.pastelGreen,
  },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  alertBox: { marginTop: 14, marginHorizontal: 16, padding: 12, borderRadius: 14, backgroundColor: colors.pastelRed, gap: 3 },
  alertLine: { fontSize: 13, fontWeight: '800', color: colors.error },
  alertReason: { fontSize: 12.5, color: colors.textSecondary },

  sectionTitle: { marginTop: 20, marginBottom: 10, marginHorizontal: 18, fontSize: 15.5, fontWeight: '800', color: colors.text },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  actionTile: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { width: '20%', alignItems: 'center', paddingVertical: 8 },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  statLabel: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },

  panel: {
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  rowBody: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: colors.textTertiary },
  rowMeta: { marginTop: 2, fontSize: 11.5, color: colors.textMuted },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbEmpty: { backgroundColor: colors.surfaceMuted },
});
