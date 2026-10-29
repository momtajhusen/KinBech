import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Ping, PressableScale, Reanimated, SoftPop, Wiggle, enterCard, enterUp } from '../../components/Motion';
import {
  AdminHeader,
  CountUp,
  MetaChip,
  StatusPill,
  confirmAction,
  showAdminError,
  toneColors,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatDateTime, formatNpr, timeAgo, titleCase } from '../../utils/admin';
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
        <AdminHeader icon="person" title={initialName || 'User'} subtitle="User details" onBack={() => navigation.goBack()} />
        {error ? (
          <View style={styles.errorBox}>
            <Wiggle angle={8} every={2600}>
              <Icon name="cloud-offline" size={30} color={colors.error} />
            </Wiggle>
            <Text style={styles.errorText}>{error}</Text>
            <PressableScale onPress={load} contentStyle={styles.retryBtn}>
              <Icon name="refresh" size={15} color={colors.white} />
              <Text style={styles.retryText}>Try again</Text>
            </PressableScale>
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
    { label: 'Active', icon: 'checkmark-circle', value: stats.listings.active },
    { label: 'Pending', icon: 'time', value: stats.listings.pending },
    { label: 'Sold', icon: 'bag-check', value: stats.listings.sold },
    { label: 'Hidden', icon: 'eye-off', value: stats.listings.hidden },
    { label: 'Reports', icon: 'flag', value: stats.reports.against, danger: stats.reports.pending > 0 },
    { label: 'Filed', icon: 'document-text', value: stats.reports.filed },
    { label: 'Rating', icon: 'star', value: stats.rating.avg ? `${stats.rating.avg}★` : '–' },
    { label: 'Chats', icon: 'chatbubbles', value: stats.chats },
    { label: 'Scam flags', icon: 'warning', value: stats.scamFlags30d, danger: stats.scamFlags30d > 0 },
    { label: 'Deals', icon: 'cart', value: user.dealsCompleted },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <AdminHeader icon="person" title={user.name || 'No name'} subtitle={titleCase(user.role === 'user' ? 'App user' : user.role)} onBack={() => navigation.goBack()}>
          <Reanimated.View entering={enterCard(0)} style={styles.profile}>
            <SoftPop>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarLetter}>{String(user.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              {user.lastActiveAt && Date.now() - new Date(user.lastActiveAt).getTime() < 5 * 60 * 1000 ? (
                <Ping size={10} style={styles.onlineDot} />
              ) : null}
            </SoftPop>
            <View style={styles.flex1}>
              {user.phone ? <InfoLine styles={styles} colors={colors} icon="call" text={user.phone} strong /> : null}
              {user.email ? <InfoLine styles={styles} colors={colors} icon="mail" text={user.email} strong /> : null}
              {user.location ? <InfoLine styles={styles} colors={colors} icon="location" text={user.location} /> : null}
              <InfoLine styles={styles} colors={colors} icon="calendar" text={`Joined ${formatDateTime(user.joinedAt)}`} />
              {user.lastActiveAt ? <InfoLine styles={styles} colors={colors} icon="time" text={`Active ${timeAgo(user.lastActiveAt)}`} /> : null}
            </View>
            {user.phone ? (
              <PressableScale
                onPress={() => Linking.openURL(`tel:${String(user.phone).replace(/\s+/g, '')}`)}
                scaleTo={0.88}
                contentStyle={styles.callBtn}
              >
                <Icon name="call" size={17} color={colors.primary} />
              </PressableScale>
            ) : null}
          </Reanimated.View>
          <View style={styles.badges}>
            <StatusPill status={user.status} />
            {user.isTester ? <StatusPill status="reviewed" label="Tester" /> : null}
            <MetaChip icon="shield-checkmark" tone="info" label={`Trust: ${titleCase(user.trustTier)}${user.trustScore != null ? ` ${user.trustScore}` : ''}`} />
            {user.subscription ? <MetaChip icon="diamond" tone="success" label={`${user.subscription.name} · ${user.subscription.daysLeft}d left`} /> : null}
            {user.featuredCredits ? <MetaChip icon="rocket" tone="warning" label={`${user.featuredCredits} credits`} /> : null}
          </View>
        </AdminHeader>

        {notice ? (
          <PressableScale onPress={() => setNotice('')} entering={enterUp(0, 0)} contentStyle={styles.notice}>
            <SoftPop>
              <Icon name="checkmark-circle" size={16} color={colors.success} />
            </SoftPop>
            <Text style={styles.noticeText}>{notice}</Text>
            <Icon name="close" size={14} color={colors.textMuted} />
          </PressableScale>
        ) : null}

        {restrictions.suspended || restrictions.chatRestricted || deletion?.scheduledFor || deleted ? (
          <Reanimated.View entering={enterUp(1, 0)} style={styles.alertBox}>
            <Wiggle angle={10} every={4000} style={styles.alertIcon}>
              <Icon name="warning" size={16} color={colors.error} />
            </Wiggle>
            <View style={styles.alertBody}>
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
          </Reanimated.View>
        ) : null}

        {actions.length ? (
          <>
            <SectionTitle styles={styles} colors={colors} icon="flash" title="Actions" />
            <View style={styles.actionGrid}>
              {actions.map((action, i) => {
                const tone = toneColors(colors, action.tone);
                return (
                  <PressableScale
                    key={action.key}
                    disabled={Boolean(busy)}
                    onPress={() => run(action.key, action.run)}
                    entering={enterCard(i, 35)}
                    style={styles.actionSlot}
                    contentStyle={styles.actionTile}
                  >
                    <View style={[styles.actionIcon, { backgroundColor: tone.bg }]}>
                      {busy === action.key ? (
                        <ActivityIndicator size="small" color={tone.fg} />
                      ) : (
                        <Icon name={action.icon} size={16} color={tone.fg} />
                      )}
                    </View>
                    <Text style={styles.actionLabel} numberOfLines={2}>{action.label}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </>
        ) : !isAppUser ? (
          <Text style={styles.muted}>Staff accounts are managed from the website admin panel.</Text>
        ) : null}

        <SectionTitle styles={styles} colors={colors} icon="analytics" title="Numbers" />
        <View style={styles.statGrid}>
          {statCards.map((s, i) => (
            <Reanimated.View key={s.label} entering={enterUp(i, 30)} style={styles.stat}>
              <Icon name={`${s.icon}-outline`} size={13} color={s.danger ? colors.error : colors.textTertiary} />
              {typeof s.value === 'number' ? (
                <CountUp value={s.value} style={[styles.statValue, s.danger && styles.danger]} />
              ) : (
                <Text style={[styles.statValue, s.danger && styles.danger]}>{s.value ?? 0}</Text>
              )}
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </Reanimated.View>
          ))}
        </View>

        {restrictions.strikes.length ? (
          <Section title={`Strikes (${restrictions.strikes.length})`} icon="warning" styles={styles} colors={colors}>
            {restrictions.strikes.map((s, i) => (
              <Row key={i} styles={styles} colors={colors} icon="warning" tone="error" title={s.reason} meta={[formatDateTime(s.at), s.by].filter(Boolean).join(' · ')} />
            ))}
          </Section>
        ) : null}

        {data.listings.length ? (
          <Section title={`Listings (${stats.listings.total})`} icon="pricetags" styles={styles} colors={colors}>
            {data.listings.map((l) => {
              const photo = resolveMediaUrl(l.photo);
              return (
                <View key={l.id} style={styles.listingRow}>
                  {photo ? <Image source={{ uri: photo }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
                  <View style={styles.flex1}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{l.title}</Text>
                    <View style={styles.inlineMeta}>
                      <Text style={styles.price}>{formatNpr(l.price)}</Text>
                      <Icon name="eye-outline" size={11} color={colors.textMuted} />
                      <Text style={styles.rowMetaInline}>{l.views || 0}</Text>
                      <Icon name="time-outline" size={11} color={colors.textMuted} />
                      <Text style={styles.rowMetaInline}>{timeAgo(l.createdAt)}</Text>
                    </View>
                  </View>
                  <StatusPill status={l.status} />
                </View>
              );
            })}
          </Section>
        ) : null}

        {data.shops.length ? (
          <Section title="Shops" icon="storefront" styles={styles} colors={colors}>
            {data.shops.map((s) => (
              <Row
                key={s.id}
                styles={styles}
                colors={colors}
                icon={s.isVerified ? 'shield-checkmark' : 'storefront'}
                tone={s.isVerified ? 'success' : 'info'}
                title={s.name}
                meta={`Opened ${formatDateTime(s.createdAt)}`}
                right={<StatusPill status={s.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.reports.length ? (
          <Section title="Reports against this user" icon="flag" styles={styles} colors={colors}>
            {data.reports.map((r) => (
              <Row
                key={r.id}
                styles={styles}
                colors={colors}
                icon="flag"
                tone="error"
                title={titleCase(r.reason)}
                body={r.details}
                meta={`By ${r.reporter} · ${formatDateTime(r.createdAt)}`}
                right={<StatusPill status={r.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.tickets?.length ? (
          <Section title="Support tickets" icon="headset" styles={styles} colors={colors}>
            {data.tickets.map((t) => (
              <Row
                key={t.id}
                styles={styles}
                colors={colors}
                icon="chatbubble-ellipses"
                tone="info"
                title={t.subject}
                body={t.message}
                meta={formatDateTime(t.createdAt)}
                right={<StatusPill status={t.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.payments?.rows?.length ? (
          <Section title={`Plan payments · ${formatNpr(data.payments.paid)} paid`} icon="wallet" styles={styles} colors={colors}>
            {data.payments.rows.map((p) => (
              <Row
                key={p.id}
                styles={styles}
                colors={colors}
                icon="receipt"
                tone="success"
                title={`${p.planName} · ${formatNpr(p.price)}`}
                meta={`${p.methodLabel || p.method} · ${formatDateTime(p.createdAt)}`}
                right={<StatusPill status={p.status} />}
              />
            ))}
          </Section>
        ) : null}

        {data.audit?.length ? (
          <Section title="Admin history" icon="time" styles={styles} colors={colors}>
            {data.audit.slice(0, 10).map((a) => (
              <Row
                key={a.id}
                styles={styles}
                colors={colors}
                icon="shield-checkmark"
                tone="muted"
                title={a.summary || a.action}
                meta={[a.actorName, formatDateTime(a.createdAt)].filter(Boolean).join(' · ')}
              />
            ))}
          </Section>
        ) : null}
      </ScrollView>
      {prompt}
    </View>
  );
}

function SectionTitle({ styles, colors, icon, title }) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionIcon}>
        <Icon name={icon} size={13} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function Section({ title, icon, styles, colors, children }) {
  return (
    <>
      <SectionTitle styles={styles} colors={colors} icon={icon} title={title} />
      <Reanimated.View entering={enterUp(0, 0)} style={styles.panel}>{children}</Reanimated.View>
    </>
  );
}

function InfoLine({ styles, colors, icon, text, strong }) {
  return (
    <View style={styles.infoLine}>
      <Icon name={`${icon}-outline`} size={12} color={strong ? colors.textTertiary : colors.textMuted} />
      <Text style={strong ? styles.profileLine : styles.profileMuted} selectable={strong} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Row({ styles, colors, icon, tone, title, body, meta, right }) {
  const toned = toneColors(colors, tone || 'muted');
  return (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: toned.bg }]}>
          <Icon name={icon} size={13} color={toned.fg} />
        </View>
      ) : null}
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
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  loader: { marginTop: 60 },
  muted: { marginTop: 16, marginHorizontal: 18, fontSize: 13, color: colors.textMuted },
  danger: { color: colors.error },
  errorBox: { alignItems: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: colors.primary,
    experimental_backgroundImage: colors.greenGradient,
    boxShadow: colors.clayGreenShadow,
  },
  retryText: { color: colors.white, fontWeight: '800' },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12, borderRadius: 22, backgroundColor: colors.card, boxShadow: colors.clay },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, experimental_backgroundImage: colors.greenGradient, boxShadow: colors.clayGreenShadow },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: colors.white },
  onlineDot: { position: 'absolute', right: 1, bottom: 1 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  profileLine: { flexShrink: 1, fontSize: 13, fontWeight: '800', color: colors.text },
  profileMuted: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  callBtn: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, boxShadow: colors.claySoft },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayTint,
  },
  noticeText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  alertBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.pastelRed,
    boxShadow: colors.clayTint,
  },
  alertIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  alertBody: { flex: 1, gap: 3 },
  alertLine: { fontSize: 12.5, fontWeight: '800', color: colors.error },
  alertReason: { fontSize: 12, color: colors.textSecondary },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10, marginHorizontal: 18 },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayTint,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: colors.text },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  actionSlot: { width: '30%', flexGrow: 1 },
  actionTile: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: colors.card,
    boxShadow: colors.claySoft,
  },
  actionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  actionLabel: { fontSize: 11.5, fontWeight: '800', color: colors.text, textAlign: 'center' },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  stat: { width: '20%', alignItems: 'center', paddingVertical: 7 },
  statValue: { marginTop: 2, fontSize: 15, fontWeight: '900', color: colors.text },
  statLabel: { marginTop: 1, fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', color: colors.textMuted },

  panel: {
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  rowTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  rowBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: colors.textTertiary },
  rowMeta: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: colors.textMuted },
  inlineMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  price: { marginRight: 6, fontSize: 12, fontWeight: '900', color: colors.primary },
  rowMetaInline: { marginRight: 6, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  listingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  thumb: { width: 40, height: 40, borderRadius: 11 },
  thumbEmpty: { backgroundColor: colors.surfaceMuted },
});
