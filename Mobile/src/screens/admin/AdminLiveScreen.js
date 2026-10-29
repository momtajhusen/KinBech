import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Ping, PressableScale, Pulse, Reanimated, Shimmer, SoftPop, enterCard, enterUp } from '../../components/Motion';
import {
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  CountUp,
  GrowBar,
  MetaChip,
  MetaRow,
  MiniStats,
  StatusPill,
  clayGreen,
  toneColors,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatCount, timeAgo } from '../../utils/admin';
import { KIND_TONE, liveDoing, liveDuration, screenInfo } from '../../utils/liveScreens';
import { resolveMediaUrl } from '../../utils/listing';

const POLL_MS = 5000;
const LIVE_PAGE = 30;
/** Pings arrive every 30s; anything quieter than this is shown as idle. */
const IDLE_AFTER_MS = 40 * 1000;

const PLATFORM_ICON = { android: 'logo-android', ios: 'logo-apple', web: 'globe' };

function clock(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AdminLiveScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [screenFilter, setScreenFilter] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const res = await api.adminLiveUsers();
    if (res.data?.summary) {
      setData({ ...res.data, fetchedAt: Date.now() });
      setStatus('ready');
      setError('');
    } else if (res.error) {
      setError(res.error);
      setStatus((prev) => (prev === 'ready' ? prev : 'error'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const poll = setInterval(load, POLL_MS);
      const tick = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(poll);
        clearInterval(tick);
      };
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const summary = data?.summary || {};
  const sessions = useMemo(() => (data?.sessions || []).map((s) => ({ ...s, id: s.key })), [data]);
  const byScreen = (data?.byScreen || []).slice(0, 6);
  const maxScreen = Math.max(1, ...byScreen.map((s) => s.count));

  const visible = sessions.filter((s) => {
    if (screenFilter && s.screen !== screenFilter) return false;
    if (filter === 'users') return !s.guest;
    if (filter === 'guests') return s.guest;
    if (filter === 'testers') return s.user?.isTester;
    return true;
  });

  const [shown, setShown] = useState(LIVE_PAGE);
  useEffect(() => { setShown(LIVE_PAGE); }, [filter, screenFilter]);

  const live = sessions.find((s) => s.key === selectedKey);
  const selected = live || (selectedKey ? snapshot : null);

  const open = (session) => {
    setSnapshot(session);
    setSelectedKey(session.key);
  };

  const list = {
    status,
    items: visible.slice(0, shown),
    total: visible.length,
    hasMore: shown < visible.length,
    error,
    refreshing,
    loadingMore: false,
    loadMore: () => setShown((n) => (n < visible.length ? n + LIVE_PAGE : n)),
    reload: (mode) => (mode === 'refresh' ? refresh() : load()),
  };

  const renderItem = ({ item }) => {
    const info = screenInfo(item.screen);
    const tone = toneColors(colors, KIND_TONE[info.kind]);
    const idle = now - new Date(item.lastSeenAt).getTime() > IDLE_AFTER_MS;
    const avatar = resolveMediaUrl(item.user?.avatarUrl);
    return (
      <AdminCard onPress={() => open(item)}>
        <View style={styles.row}>
          <View>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, item.guest ? styles.avatarGuest : styles.avatarEmpty]}>
                {item.guest ? (
                  <Icon name="person-outline" size={17} color={colors.textTertiary} />
                ) : (
                  <Text style={styles.avatarLetter}>{String(item.user?.name || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
            )}
            <View style={styles.presenceDot}>
              {idle ? <View style={styles.idleDot} /> : <Ping size={8} color={colors.success} />}
            </View>
          </View>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.guest ? 'Guest' : item.user?.name || item.user?.phone || 'User'}</Text>
              {item.user?.isTester ? <StatusPill status="reviewed" label="Tester" /> : null}
              {idle ? <StatusPill status="pending" label="Idle" /> : null}
            </View>
            <View style={styles.subRow}>
              <Icon name={PLATFORM_ICON[item.platform] || 'phone-portrait'} size={11} color={colors.textMuted} />
              <Text style={styles.sub} numberOfLines={1}>
                {[item.deviceName, item.appVersion ? `v${item.appVersion}` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          <View style={styles.timer}>
            <Icon name="time-outline" size={11} color={colors.primary} />
            <Text style={styles.timerText}>{liveDuration(item.screenSince, now)}</Text>
          </View>
        </View>

        <View style={[styles.doing, { backgroundColor: tone.bg }]}>
          <Pulse active={!idle} to={1.12} pause={1800} style={styles.doingIcon}>
            <Icon name={info.icon} size={15} color={tone.fg} />
          </Pulse>
          <View style={styles.flex1}>
            <Text style={[styles.doingLabel, { color: tone.fg }]}>{info.label.toUpperCase()}</Text>
            <Text style={styles.doingText} numberOfLines={2}>{liveDoing(item)}</Text>
          </View>
        </View>

        <MetaRow>
          <MetaChip icon="hourglass" label={`In app ${liveDuration(item.startedAt, now)}`} />
          <MetaChip icon="layers" label={`${item.screensCount} screen${item.screensCount === 1 ? '' : 's'}`} />
          {item.user?.location ? <MetaChip icon="location" label={item.user.location} /> : null}
          {item.user?.phone ? <MetaChip icon="call" tone="info" label={item.user.phone} /> : null}
          {now - new Date(item.startedAt).getTime() < 5 * 60 * 1000 ? <MetaChip icon="sparkles" tone="success" label="Just opened" /> : null}
        </MetaRow>
      </AdminCard>
    );
  };

  const header = (
    <>
      <AdminHeader
        icon="pulse"
        title="Live now"
        subtitle={data ? `Updates every 5s · checked ${liveDuration(data.fetchedAt, now)} ago` : 'Who is using the app right now'}
        onBack={() => navigation.goBack()}
      >
        <Reanimated.View entering={enterCard(0)} style={styles.hero}>
          <View style={styles.heroClip} pointerEvents="none">
            <Shimmer duration={2400} pause={2600} color="rgba(255,255,255,0.18)" />
          </View>
          <View style={styles.heroTop}>
            <Ping size={7} color="#B9F6CA" />
            <Text style={styles.heroEyebrow}>LIVE ON KINBECH</Text>
          </View>
          <View style={styles.heroMain}>
            <CountUp value={summary.live || 0} style={styles.heroValue} />
            <Text style={styles.heroLabel}>people in the app{'\n'}right now</Text>
          </View>
          <View style={styles.heroStats}>
            {[
              { icon: 'person', label: 'Signed in', value: summary.signedIn },
              { icon: 'eye', label: 'Guests', value: summary.guests },
              { icon: 'sparkles', label: 'New 5m', value: summary.newVisits },
              { icon: 'hourglass', label: 'Avg min', value: summary.avgMinutes },
            ].map((s) => (
              <View key={s.label} style={styles.heroStat}>
                <Icon name={s.icon} size={12} color="rgba(255,255,255,0.8)" />
                <CountUp value={s.value || 0} style={styles.heroStatValue} />
                <Text style={styles.heroStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </Reanimated.View>
      </AdminHeader>

      <MiniStats
        style={styles.activeStrip}
        items={[
          { label: 'Active 5 min', value: formatCount(summary.active5m), tone: 'success' },
          { label: 'Active 1 hour', value: formatCount(summary.active1h) },
          { label: 'Active today', value: formatCount(summary.activeToday) },
          { label: 'Testers live', value: summary.testers || 0, tone: summary.testers ? 'warning' : undefined },
        ]}
      />

      {byScreen.length ? (
        <>
          <View style={styles.sectionRow}>
            <View style={styles.sectionIcon}>
              <Icon name="map" size={13} color={colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Where they are</Text>
            <Text style={styles.sectionNote}>tap to filter</Text>
          </View>
          <View style={styles.panel}>
            {byScreen.map((s, i) => {
              const info = screenInfo(s.name);
              const tone = toneColors(colors, KIND_TONE[info.kind]);
              const active = screenFilter === s.name;
              return (
                <PressableScale
                  key={s.name}
                  onPress={() => setScreenFilter(active ? '' : s.name)}
                  scaleTo={0.97}
                  entering={enterUp(i, 40)}
                  contentStyle={[styles.screenRow, i < byScreen.length - 1 && styles.divider, active && styles.screenRowActive]}
                >
                  <View style={[styles.screenIcon, { backgroundColor: tone.bg }]}>
                    <Icon name={info.icon} size={14} color={tone.fg} />
                  </View>
                  <View style={styles.flex1}>
                    <View style={styles.screenHead}>
                      <Text style={styles.screenName} numberOfLines={1}>{info.label}</Text>
                      <Text style={styles.screenCount}>{s.count}</Text>
                    </View>
                    <View style={styles.screenTrack}>
                      <GrowBar
                        key={`${s.name}-${s.count}`}
                        axis="x"
                        delay={i * 60}
                        style={[styles.screenFill, { width: `${(s.count / maxScreen) * 100}%`, backgroundColor: tone.fg }]}
                      />
                    </View>
                  </View>
                  {active ? <Icon name="close-circle" size={16} color={colors.textMuted} /> : null}
                </PressableScale>
              );
            })}
          </View>
        </>
      ) : null}

      {data?.byPlatform?.length ? (
        <MetaRow style={styles.platformRow}>
          {data.byPlatform.map((p) => (
            <MetaChip key={p.name} icon={PLATFORM_ICON[p.name] || 'phone-portrait'} label={`${p.name} · ${p.count}`} />
          ))}
        </MetaRow>
      ) : null}

      <AdminChips
        options={[
          { value: 'all', label: 'All', icon: 'people', count: sessions.length },
          { value: 'users', label: 'Signed in', icon: 'person', count: summary.signedIn },
          { value: 'guests', label: 'Guests', icon: 'eye', count: summary.guests },
          { value: 'testers', label: 'Testers', icon: 'flask', count: summary.testers },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {screenFilter ? (
        <Pressable onPress={() => setScreenFilter('')} style={styles.filterNote}>
          <Icon name={screenInfo(screenFilter).icon} size={12} color={colors.primary} />
          <Text style={styles.filterNoteText}>Only on {screenInfo(screenFilter).label}</Text>
          <Icon name="close" size={12} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        header={header}
        emptyIcon="moon"
        emptyTitle={sessions.length ? 'Nobody matches this filter' : 'Nobody is in the app right now'}
        emptyBody="People show up here within a few seconds of opening the app. Staff accounts are not counted."
      />
      <LiveDetail
        session={selected}
        gone={Boolean(selectedKey) && !live}
        now={now}
        styles={styles}
        colors={colors}
        onClose={() => setSelectedKey('')}
        onOpenUser={(user) => {
          setSelectedKey('');
          navigation.navigate('AdminUserDetail', { userId: user.id, name: user.name });
        }}
      />
    </View>
  );
}

function LiveDetail({ session, gone, now, styles, colors, onClose, onOpenUser }) {
  const insets = useSafeAreaInsets();
  if (!session) return null;
  const info = screenInfo(session.screen);
  const tone = toneColors(colors, KIND_TONE[info.kind]);
  const user = session.user;
  const avatar = resolveMediaUrl(user?.avatarUrl);
  const trail = session.trail || [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.row}>
            <SoftPop>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.sheetAvatar} />
              ) : (
                <View style={[styles.sheetAvatar, session.guest ? styles.avatarGuest : styles.avatarEmpty]}>
                  {session.guest ? (
                    <Icon name="person-outline" size={22} color={colors.textTertiary} />
                  ) : (
                    <Text style={styles.avatarLetter}>{String(user?.name || '?').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
              )}
            </SoftPop>
            <View style={styles.flex1}>
              <Text style={styles.sheetName} numberOfLines={1}>{session.guest ? 'Guest (not signed in)' : user?.name || 'User'}</Text>
              <View style={styles.subRow}>
                {gone ? (
                  <>
                    <View style={styles.idleDot} />
                    <Text style={styles.sub}>Left the app · last seen {timeAgo(session.lastSeenAt)}</Text>
                  </>
                ) : (
                  <>
                    <Ping size={7} color={colors.success} />
                    <Text style={styles.sub}>Live · last ping {liveDuration(session.lastSeenAt, now)} ago</Text>
                  </>
                )}
              </View>
            </View>
            <PressableScale onPress={onClose} scaleTo={0.88} contentStyle={styles.closeBtn}>
              <Icon name="close" size={18} color={colors.text} />
            </PressableScale>
          </View>

          <Reanimated.View entering={enterUp(0, 0)} style={[styles.nowBox, { backgroundColor: tone.bg }]}>
            <Pulse active={!gone} to={1.1} style={styles.nowIcon}>
              <Icon name={info.icon} size={20} color={tone.fg} />
            </Pulse>
            <View style={styles.flex1}>
              <Text style={[styles.doingLabel, { color: tone.fg }]}>{gone ? 'LAST SCREEN' : 'RIGHT NOW'} · {info.label.toUpperCase()}</Text>
              <Text style={styles.nowText}>{liveDoing(session)}</Text>
              <Text style={styles.nowSub}>
                On this screen {liveDuration(session.screenSince, gone ? new Date(session.lastSeenAt).getTime() : now)} · since {clock(session.screenSince)}
              </Text>
            </View>
          </Reanimated.View>

          <MiniStats
            style={styles.sheetStats}
            items={[
              { label: 'In app', value: liveDuration(session.startedAt, gone ? new Date(session.lastSeenAt).getTime() : now) },
              { label: 'Screens', value: session.screensCount },
              user ? { label: 'Sold', value: user.soldCount } : null,
              user ? { label: 'Bought', value: user.boughtCount } : null,
            ]}
          />

          <MetaRow>
            {user?.phone ? <MetaChip icon="call" tone="info" label={user.phone} /> : null}
            {user?.location ? <MetaChip icon="location" label={user.location} /> : null}
            {user?.joinedAt ? <MetaChip icon="calendar" label={`Joined ${timeAgo(user.joinedAt)}`} /> : null}
            {user?.isTester ? <MetaChip icon="flask" tone="warning" label="Tester" /> : null}
            {user?.status && user.status !== 'active' ? <MetaChip icon="ban" tone="error" label={user.status} /> : null}
            <MetaChip icon={PLATFORM_ICON[session.platform] || 'phone-portrait'} label={session.deviceName || session.platform || 'Device'} />
            {session.appVersion ? <MetaChip icon="cube" label={`App v${session.appVersion}`} /> : null}
            {session.ip ? <MetaChip icon="globe" label={session.ip} /> : null}
            <MetaChip icon="time" label={`Opened ${clock(session.startedAt)}`} />
          </MetaRow>

          <View style={styles.sheetSection}>
            <Icon name="git-branch" size={14} color={colors.primary} />
            <Text style={styles.sheetSectionTitle}>Journey this visit</Text>
            <Text style={styles.sectionNote}>{trail.length} step{trail.length === 1 ? '' : 's'}</Text>
          </View>
          {trail.map((step, i) => {
            const stepInfo = screenInfo(step.screen);
            const stepTone = toneColors(colors, KIND_TONE[stepInfo.kind]);
            const end = i === 0 ? (gone ? new Date(session.lastSeenAt).getTime() : now) : new Date(trail[i - 1].at).getTime();
            return (
              <Reanimated.View key={`${step.at}-${i}`} entering={enterUp(i, 40)} style={styles.step}>
                <View style={styles.stepRail}>
                  {i === 0 && !gone ? (
                    <Ping size={9} color={stepTone.fg} style={styles.stepPing} />
                  ) : (
                    <View style={[styles.stepDot, { backgroundColor: stepTone.fg }]} />
                  )}
                  {i < trail.length - 1 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={[styles.stepIcon, { backgroundColor: stepTone.bg }]}>
                  <Icon name={stepInfo.icon} size={13} color={stepTone.fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.stepTitle} numberOfLines={1}>{stepInfo.label}</Text>
                  {step.label ? <Text style={styles.stepBody} numberOfLines={1}>{step.label}</Text> : null}
                </View>
                <View style={styles.stepTime}>
                  <Text style={styles.stepClock}>{clock(step.at)}</Text>
                  <Text style={styles.stepDur}>{liveDuration(step.at, end)}</Text>
                </View>
              </Reanimated.View>
            );
          })}

          {user ? (
            <View style={styles.sheetActions}>
              <PressableScale onPress={() => onOpenUser(user)} style={styles.flex1} contentStyle={[styles.sheetBtn, clayGreen(colors)]}>
                <Icon name="person" size={15} color={colors.white} />
                <Text style={[styles.sheetBtnText, { color: colors.white }]}>Open user</Text>
              </PressableScale>
              {user.phone ? (
                <PressableScale
                  onPress={() => Linking.openURL(`tel:${String(user.phone).replace(/\s+/g, '')}`)}
                  style={styles.flex1}
                  contentStyle={[styles.sheetBtn, styles.sheetBtnSoft]}
                >
                  <Icon name="call" size={15} color={colors.primary} />
                  <Text style={[styles.sheetBtnText, { color: colors.primary }]}>Call</Text>
                </PressableScale>
              ) : null}
            </View>
          ) : (
            <Text style={styles.guestNote}>Guests have not signed in, so there is no profile to open.</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },

  hero: { marginTop: 14, padding: 15, borderRadius: 24, ...clayGreen(colors) },
  heroClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)' },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  heroValue: { fontSize: 44, fontWeight: '900', letterSpacing: -1, color: colors.white },
  heroLabel: { fontSize: 12.5, lineHeight: 17, fontWeight: '800', color: 'rgba(255,255,255,0.88)' },
  heroStats: { flexDirection: 'row', marginTop: 12, paddingVertical: 9, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.12)' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { marginTop: 2, fontSize: 16, fontWeight: '900', color: colors.white },
  heroStatLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' },

  activeStrip: { marginHorizontal: 16, marginTop: 14 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10, marginHorizontal: 18 },
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
  sectionNote: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  panel: { marginHorizontal: 16, borderRadius: 20, backgroundColor: colors.card, boxShadow: colors.clay },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  screenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  screenRowActive: { backgroundColor: colors.backgroundSecondary },
  screenIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  screenHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  screenName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  screenCount: { fontSize: 13, fontWeight: '900', color: colors.text },
  screenTrack: { height: 6, marginTop: 5, borderRadius: 3, backgroundColor: colors.backgroundSecondary, overflow: 'hidden' },
  screenFill: { height: '100%', borderRadius: 3 },
  platformRow: { marginHorizontal: 16, marginTop: 4 },
  filterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginLeft: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayBadge,
  },
  filterNoteText: { fontSize: 11.5, fontWeight: '800', color: colors.primary },

  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceMuted },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  avatarGuest: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundSecondary, boxShadow: colors.clayPressed },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: colors.primary },
  presenceDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  idleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { flexShrink: 1, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayBadge,
  },
  timerText: { fontSize: 11, fontWeight: '900', color: colors.primary, fontVariant: ['tabular-nums'] },
  doing: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9, padding: 9, borderRadius: 14 },
  doingIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  doingLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  doingText: { marginTop: 1, fontSize: 12.5, fontWeight: '700', lineHeight: 17, color: colors.text },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    maxHeight: '86%',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, marginBottom: 12, borderRadius: 2, backgroundColor: colors.border },
  sheetAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceMuted },
  sheetName: { fontSize: 16, fontWeight: '900', color: colors.text },
  closeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, boxShadow: colors.claySoft },
  nowBox: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14, padding: 12, borderRadius: 18, boxShadow: colors.clayTint },
  nowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  nowText: { marginTop: 2, fontSize: 14, fontWeight: '800', lineHeight: 19, color: colors.text },
  nowSub: { marginTop: 3, fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  sheetStats: { marginTop: 12 },
  sheetSection: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 8 },
  sheetSectionTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: colors.text },
  step: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44 },
  stepRail: { width: 12, alignItems: 'center', alignSelf: 'stretch' },
  stepDot: { width: 8, height: 8, marginTop: 18, borderRadius: 4 },
  stepPing: { marginTop: 17 },
  stepLine: { flex: 1, width: 2, marginTop: 3, backgroundColor: colors.border },
  stepIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  stepBody: { marginTop: 1, fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  stepTime: { alignItems: 'flex-end' },
  stepClock: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  stepDur: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 16 },
  sheetBtnSoft: { backgroundColor: colors.card, boxShadow: colors.claySoft },
  sheetBtnText: { fontSize: 13.5, fontWeight: '800' },
  guestNote: { marginTop: 16, fontSize: 12, fontStyle: 'italic', color: colors.textMuted, textAlign: 'center' },
});
