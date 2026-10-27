import { useCallback, useState } from 'react';
import Icon from '../components/Icon';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import HeroHeader, { HeroStat } from '../components/HeroHeader';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { timeAgo } from '../utils/listing';

const TINT = {
  protect: '#10B981',
  phone: '#10B981',
  city: '#3B82F6',
  device: '#8B5CF6',
  blocked: '#F43F5E',
  report: '#F59E0B',
  legal: '#6366F1',
  data: '#0EA5E9',
};

const STATUS_META = {
  pending: { label: 'Pending', icon: 'time-outline', tint: '#F59E0B' },
  reviewed: { label: 'In review', icon: 'eye-outline', tint: '#3B82F6' },
  resolved: { label: 'Resolved', icon: 'checkmark-circle', tint: '#10B981' },
  dismissed: { label: 'Dismissed', icon: 'close-circle-outline', tint: '#94A3B8' },
};

const REASON_META = {
  spam: { label: 'Spam', icon: 'mail-unread-outline' },
  'fake-listing': { label: 'Fake listing', icon: 'pricetag-outline' },
  inappropriate: { label: 'Inappropriate', icon: 'warning-outline' },
  'not-available': { label: 'Not available', icon: 'cube-outline' },
  scam: { label: 'Scam or fraud', icon: 'alert-circle-outline' },
  'no-show': { label: 'No-show', icon: 'calendar-outline' },
  other: { label: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
};

const LEGAL_LINKS = [
  { key: 'policy', label: 'Privacy Policy', hint: 'What we collect and why', icon: 'document-text-outline', tint: '#6366F1' },
  { key: 'permissions', label: 'App permissions & data use', hint: 'Camera, location, notifications', icon: 'key-outline', tint: '#F59E0B' },
  { key: 'hub', label: 'All legal & policy pages', hint: 'Terms, community rules and more', icon: 'library-outline', tint: '#14B8A6' },
];

function lastActiveLabel(date) {
  const ms = Date.now() - new Date(date || 0).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 10) return 'Active now';
  if (min < 60) return `Active ${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days} day${days === 1 ? '' : 's'} ago`;
}

function deviceIcon(session) {
  if (session.platform === 'web' || session.kind === 'admin') return 'desktop-outline';
  return 'phone-portrait-outline';
}

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Section({ styles, colors, index, icon, tint, title, subtitle, count, danger, children }) {
  return (
    <Reanimated.View entering={enterUp(index)} style={[styles.card, danger && styles.cardDanger]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: danger ? colors.dangerBackground : `${tint}1F` }]}>
          <Icon name={icon} size={19} color={danger ? colors.danger : tint} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.cardTitle, danger && { color: colors.danger }]}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {count != null ? (
          <View style={[styles.countPill, { backgroundColor: `${tint}1F` }]}>
            <Text style={[styles.countText, { color: tint }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </Reanimated.View>
  );
}

function EmptyNote({ styles, icon, tint, title, body }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyRing, { borderColor: `${tint}33` }]}>
        <View style={[styles.emptyIcon, { backgroundColor: `${tint}1F` }]}>
          <Icon name={icon} size={24} color={tint} />
        </View>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

export default function PrivacyScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession, logout } = useAuth();
  const [blocked, setBlocked] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [unblockingId, setUnblockingId] = useState(null);
  const [showPhone, setShowPhone] = useState(Boolean(user?.preferences?.showPhone));
  const [showLocation, setShowLocation] = useState(user?.preferences?.showLocation !== false);
  const [prefSaving, setPrefSaving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const { data } = await api.getSessions();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (_) {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadBlocked = useCallback(async () => {
    setBlockedLoading(true);
    try {
      const { data } = await api.getBlockedUsers();
      setBlocked(Array.isArray(data?.users) ? data.users : []);
    } catch (_) {
      setBlocked([]);
    } finally {
      setBlockedLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const { data, error } = await api.getMyReports();
      if (error) {
        setReports([]);
      } else {
        setReports(Array.isArray(data?.reports) ? data.reports.slice(0, 10) : []);
      }
    } catch (_) {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(async () => {
    const [blockedRes, reportsRes, sessionsRes] = await Promise.all([
      api.getBlockedUsers(),
      api.getMyReports(),
      api.getSessions(),
    ]);
    setSessions(Array.isArray(sessionsRes.data?.sessions) ? sessionsRes.data.sessions : []);
    setBlocked(Array.isArray(blockedRes.data?.users) ? blockedRes.data.users : []);
    if (reportsRes.error) {
      setReports([]);
    } else {
      setReports(Array.isArray(reportsRes.data?.reports) ? reportsRes.data.reports.slice(0, 10) : []);
    }
  });

  useFocusEffect(
    useCallback(() => {
      loadBlocked();
      loadReports();
      loadSessions();
    }, [loadBlocked, loadReports, loadSessions])
  );

  const handleRevokeSession = (session) => {
    Alert.alert(
      'Sign out this device?',
      `${session.deviceName || 'This device'} will need to log in again with OTP.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setRevokingId(session.id);
            const { error } = await api.revokeSession(session.id);
            setRevokingId(null);
            if (error) {
              setAlertConfig(
                showErrorAlert({
                  title: 'Could not sign out device',
                  message: error,
                  onConfirm: () => setAlertConfig(null),
                })
              );
              return;
            }
            setSessions((prev) => prev.filter((s) => s.id !== session.id));
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    setExporting(true);
    const { data, error } = await api.exportMyData();
    if (error || !data) {
      setExporting(false);
      setAlertConfig(
        showErrorAlert({
          title: 'Could not download your data',
          message: error || 'Please try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    try {
      const file = new File(Paths.cache, `kinbech-my-data-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Save your KinBech data',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Saved', 'Your data file was saved to app storage.');
      }
    } catch {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not save the file',
          message: 'Please check your storage and try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
    } finally {
      setExporting(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleting(true);
    const { data, error } = await api.deleteAccount();
    setDeleting(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not delete account',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    Alert.alert(
      'Account deletion scheduled',
      data?.message || 'Your account will be deleted in 30 days. Sign in again before then to cancel.',
      [
        {
          text: 'OK',
          onPress: async () => {
            await logout();
            navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_TABS }] });
          },
        },
      ],
      { cancelable: false }
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'You will be signed out on every device and your listings and shop will be hidden right away. ' +
        'After 30 days your account is permanently deleted. Sign in again before then to cancel.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDeleteAccount },
      ]
    );
  };

  const handleUnblock = (userId, userName) => {
    Alert.alert(
      'Unblock User?',
      `${userName || 'This user'} will be able to see your listings and message you again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            setUnblockingId(userId);
            try {
              const { error } = await api.unblockUser(userId);
              if (error) {
                setAlertConfig(
                  showErrorAlert({
                    title: 'Could not unblock',
                    message: error,
                    onConfirm: () => setAlertConfig(null),
                  })
                );
              } else {
                setBlocked((prev) => prev.filter((u) => u.id !== userId));
                setAlertConfig(
                  showSuccessAlert({
                    title: 'User Unblocked',
                    message: 'This user has been removed from your blocked list.',
                    onConfirm: () => setAlertConfig(null),
                  })
                );
              }
            } catch (_) {
              setAlertConfig(
                showErrorAlert({
                  title: 'Could not unblock',
                  message: 'Something went wrong. Please try again.',
                  onConfirm: () => setAlertConfig(null),
                })
              );
            } finally {
              setUnblockingId(null);
            }
          },
        },
      ]
    );
  };

  const updateVisibility = async (payload, rollback) => {
    setPrefSaving(true);
    const { data, error } = await api.updatePreferences(payload);
    setPrefSaving(false);
    if (error || !data?.user) {
      rollback();
      setAlertConfig(
        showErrorAlert({
          title: 'Could not update',
          message: error || 'Please try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    if (data.token) {
      await saveSession(data.token, data.user);
    }
  };

  const openLegal = (key) => {
    if (key === 'policy') navigation.navigate(ROUTES.PRIVACY_POLICY);
    else if (key === 'permissions') navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'permissions' });
    else navigation.navigate(ROUTES.LEGAL_HUB);
  };

  const otherDevices = sessions.filter((s) => !s.current).length;
  const checks = [
    {
      key: 'phone',
      icon: showPhone ? 'call' : 'call-outline',
      title: 'Phone number',
      value: showPhone ? 'Visible to buyers' : 'Hidden, chat only',
      ok: !showPhone,
    },
    {
      key: 'address',
      icon: 'home-outline',
      title: 'Exact address',
      value: 'Never shown on KinBech',
      ok: true,
    },
    {
      key: 'devices',
      icon: 'phone-portrait-outline',
      title: 'Signed-in devices',
      value: otherDevices === 0 ? 'Only this device' : `${otherDevices} other device${otherDevices === 1 ? '' : 's'}, review below`,
      ok: otherDevices === 0,
    },
    {
      key: 'otp',
      icon: 'keypad-outline',
      title: 'Login',
      value: 'OTP needed on every new device',
      ok: true,
    },
  ];
  const okCount = checks.filter((c) => c.ok).length;
  const level =
    okCount === checks.length
      ? { label: 'Strong', tint: '#10B981' }
      : okCount >= checks.length - 1
        ? { label: 'Good', tint: '#3B82F6' }
        : { label: 'Needs a look', tint: '#F59E0B' };

  const previewLine = [
    showLocation && user?.location ? user.location : 'Area hidden',
    showPhone && user?.phone ? user.phone : 'Phone hidden',
  ];

  const toggleRows = [
    {
      key: 'phone',
      icon: 'call',
      tint: TINT.phone,
      title: 'Show phone number',
      body: 'Off by default. Covers your personal and store phone/WhatsApp. Turn on only if you want buyers to call you outside the app.',
      value: showPhone,
      onChange: (value) => {
        setShowPhone(value);
        updateVisibility({ showPhone: value }, () => setShowPhone(!value));
      },
    },
    {
      key: 'city',
      icon: 'location',
      tint: TINT.city,
      title: 'Show city on listings',
      body: 'Lets nearby buyers see your area. Your exact address stays private.',
      value: showLocation,
      onChange: (value) => {
        setShowLocation(value);
        updateVisibility({ showLocation: value }, () => setShowLocation(!value));
      },
    },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="shield-checkmark"
        title="Privacy & Security"
        subtitle="Choose what people see and keep your account safe"
        onBack={() => navigation.goBack()}
      >
        <View style={styles.statRow}>
          <HeroStat icon="phone-portrait-outline" value={sessions.length} label="Devices" />
          <HeroStat icon="ban-outline" value={blocked.length} label="Blocked" />
          <HeroStat icon="flag-outline" value={reports.length} label="Reports" />
        </View>
      </HeroHeader>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <Section
          styles={styles}
          colors={colors}
          index={0}
          icon="shield-half-outline"
          tint={level.tint}
          title="Account protection"
          subtitle={`${okCount} of ${checks.length} checks look good`}
        >
          <View style={styles.levelWrap}>
            <View style={styles.levelBar}>
              {checks.map((c, i) => (
                <View
                  key={c.key}
                  style={[styles.levelSeg, { backgroundColor: i < okCount ? level.tint : colors.border }]}
                />
              ))}
            </View>
            <View style={[styles.levelPill, { backgroundColor: `${level.tint}1F` }]}>
              <Text style={[styles.levelText, { color: level.tint }]}>{level.label}</Text>
            </View>
          </View>
          <View style={styles.checkList}>
            {checks.map((c) => {
              const tone = c.ok ? TINT.protect : '#F59E0B';
              return (
                <View key={c.key} style={styles.checkRow}>
                  <View style={[styles.checkIcon, { backgroundColor: `${tone}1A` }]}>
                    <Icon name={c.icon} size={16} color={tone} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.checkTitle}>{c.title}</Text>
                    <Text style={styles.checkValue}>{c.value}</Text>
                  </View>
                  <Icon name={c.ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={tone} />
                </View>
              );
            })}
          </View>
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={1}
          icon="eye-outline"
          tint={TINT.city}
          title="Profile visibility"
          subtitle="Control what other people can see"
        >
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>What buyers see</Text>
            <View style={styles.previewRow}>
              <View style={styles.previewAvatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.previewInitials}>{initials(user?.name)}</Text>
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.previewName} numberOfLines={1}>{user?.name || 'You'}</Text>
                <View style={styles.previewMeta}>
                  <Icon
                    name={showLocation ? 'location' : 'location-outline'}
                    size={12}
                    color={showLocation ? TINT.city : colors.textMuted}
                  />
                  <Text style={styles.previewMetaText} numberOfLines={1}>{previewLine[0]}</Text>
                  <View style={styles.previewDot} />
                  <Icon
                    name={showPhone ? 'call' : 'eye-off-outline'}
                    size={12}
                    color={showPhone ? TINT.phone : colors.textMuted}
                  />
                  <Text style={styles.previewMetaText} numberOfLines={1}>{previewLine[1]}</Text>
                </View>
              </View>
            </View>
          </View>
          {toggleRows.map((row) => (
            <View key={row.key} style={styles.toggleRow}>
              <View style={[styles.rowIcon, { backgroundColor: `${row.tint}1F` }]}>
                <Icon name={row.icon} size={18} color={row.tint} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowBody}>{row.body}</Text>
              </View>
              <Switch
                value={row.value}
                disabled={prefSaving}
                onValueChange={row.onChange}
                trackColor={{ false: colors.border, true: row.tint }}
                thumbColor={colors.white}
              />
            </View>
          ))}
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={2}
          icon="phone-portrait-outline"
          tint={TINT.device}
          title="Signed-in devices"
          subtitle="Sign out any device you don't recognise"
          count={sessions.length}
        >
          {sessionsLoading && sessions.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={TINT.device} />
            </View>
          ) : sessions.length === 0 ? (
            <EmptyNote
              styles={styles}
              icon="phone-portrait-outline"
              tint={TINT.device}
              title="No devices listed yet"
              body="Device list appears after your next login on each phone."
            />
          ) : (
            sessions.map((s) => (
              <View key={s.id} style={[styles.itemRow, s.current && styles.itemRowCurrent]}>
                <View style={[styles.itemIcon, { backgroundColor: s.current ? `${TINT.protect}1F` : `${TINT.device}1A` }]}>
                  <Icon name={deviceIcon(s)} size={20} color={s.current ? TINT.protect : TINT.device} />
                </View>
                <View style={styles.flex1}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.itemName, styles.shrink]} numberOfLines={1}>
                      {s.deviceName || 'Unknown device'}
                    </Text>
                    {s.current ? (
                      <View style={[styles.tag, { backgroundColor: `${TINT.protect}1F` }]}>
                        <View style={[styles.liveDot, { backgroundColor: TINT.protect }]} />
                        <Text style={[styles.tagText, { color: TINT.protect }]}>This device</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {[s.current ? 'Active now' : lastActiveLabel(s.lastSeenAt), s.appVersion ? `v${s.appVersion}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {s.current ? null : (
                  <Pressable
                    onPress={() => handleRevokeSession(s)}
                    style={[styles.chipBtn, styles.chipBtnDanger]}
                    disabled={revokingId === s.id}
                    hitSlop={6}
                  >
                    {revokingId === s.id ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <>
                        <Icon name="log-out-outline" size={14} color={colors.danger} />
                        <Text style={[styles.chipBtnText, { color: colors.danger }]}>Sign out</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            ))
          )}
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={3}
          icon="ban-outline"
          tint={TINT.blocked}
          title="Blocked users"
          subtitle="They can't message you or see your listings"
          count={blocked.length}
        >
          {blockedLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={TINT.blocked} />
            </View>
          ) : blocked.length === 0 ? (
            <EmptyNote
              styles={styles}
              icon="shield-outline"
              tint={TINT.blocked}
              title="No blocked users"
              body="Block someone from the chat ⋮ menu or their profile. They won't be able to message you."
            />
          ) : (
            blocked.map((u) => (
              <View key={u.id} style={styles.itemRow}>
                <View style={styles.avatar}>
                  {u.avatarUrl ? (
                    <Image source={{ uri: u.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <Text style={styles.avatarText}>{initials(u.name)}</Text>
                  )}
                  <View style={styles.avatarBadge}>
                    <Icon name="ban" size={10} color={colors.white} />
                  </View>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.itemName} numberOfLines={1}>{u.name || 'Unknown User'}</Text>
                  {u.phone ? <Text style={styles.itemMeta}>{u.phone}</Text> : null}
                </View>
                <Pressable
                  onPress={() => handleUnblock(u.id, u.name)}
                  style={styles.chipBtn}
                  disabled={unblockingId === u.id}
                  hitSlop={6}
                >
                  {unblockingId === u.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Icon name="lock-open-outline" size={14} color={colors.primary} />
                      <Text style={styles.chipBtnText}>Unblock</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={4}
          icon="flag-outline"
          tint={TINT.report}
          title="Your reports"
          subtitle="Our team reviews every report"
          count={reports.length}
        >
          {reportsLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={TINT.report} />
            </View>
          ) : reports.length === 0 ? (
            <EmptyNote
              styles={styles}
              icon="flag"
              tint={TINT.report}
              title="No reports submitted"
              body="You can report listings, messages or people that break KinBech community rules."
            />
          ) : (
            reports.map((r, idx) => {
              const status = STATUS_META[r.status] || STATUS_META.pending;
              const reason = REASON_META[r.reason] || { label: r.reason || 'Report', icon: 'flag-outline' };
              const target = r.reportedUser?.name || r.reportedListing?.title || 'Report';
              return (
                <View key={r._id || String(idx)} style={styles.reportRow}>
                  <View style={styles.reportTop}>
                    <View style={styles.avatarSmall}>
                      {r.reportedUser?.avatarUrl ? (
                        <Image source={{ uri: r.reportedUser.avatarUrl }} style={styles.avatarImg} />
                      ) : r.reportedUser ? (
                        <Text style={styles.avatarSmallText}>{initials(r.reportedUser.name)}</Text>
                      ) : (
                        <Icon name="pricetag-outline" size={16} color={colors.textSecondary} />
                      )}
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.itemName} numberOfLines={1}>{target}</Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>
                        {r.reportedUser && r.reportedListing?.title ? r.reportedListing.title : 'No listing attached'}
                      </Text>
                    </View>
                    {r.createdAt ? (
                      <Text style={styles.reportDate}>{timeAgo(r.createdAt).replace(/^Posted /, '')}</Text>
                    ) : null}
                  </View>
                  <View style={styles.tagRow}>
                    <View style={[styles.tag, { backgroundColor: colors.iconBackground }]}>
                      <Icon name={reason.icon} size={12} color={colors.textSecondary} />
                      <Text style={[styles.tagText, { color: colors.textSecondary }]}>{reason.label}</Text>
                    </View>
                    <View style={[styles.tag, { backgroundColor: `${status.tint}1F` }]}>
                      <Icon name={status.icon} size={12} color={status.tint} />
                      <Text style={[styles.tagText, { color: status.tint }]}>{status.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={5}
          icon="document-text-outline"
          tint={TINT.legal}
          title="Legal documents"
          subtitle="Privacy, permissions and your rights"
        >
          {LEGAL_LINKS.map((link) => (
            <PressableScale key={link.key} scaleTo={0.98} contentStyle={styles.linkRow} onPress={() => openLegal(link.key)}>
              <View style={[styles.rowIcon, { backgroundColor: `${link.tint}1F` }]}>
                <Icon name={link.icon} size={18} color={link.tint} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>{link.label}</Text>
                <Text style={styles.rowBody}>{link.hint}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableScale>
          ))}
        </Section>

        <Section
          styles={styles}
          colors={colors}
          index={6}
          icon="server-outline"
          tint={TINT.data}
          title="Your data"
          subtitle="Get a copy or remove your account"
        >
          <PressableScale scaleTo={0.98} contentStyle={styles.linkRow} onPress={handleExportData} disabled={exporting}>
            <View style={[styles.rowIcon, { backgroundColor: `${TINT.data}1F` }]}>
              <Icon name="cloud-download-outline" size={18} color={TINT.data} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.rowTitle}>Download my data</Text>
              <Text style={styles.rowBody}>Profile, listings and chats as a JSON file</Text>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={TINT.data} />
            ) : (
              <Icon name="download-outline" size={18} color={TINT.data} />
            )}
          </PressableScale>
          <PressableScale
            scaleTo={0.98}
            contentStyle={styles.linkRow}
            onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'accountDeletion' })}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.iconBackground }]}>
              <Icon name="information-circle-outline" size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.rowTitle}>Account deletion policy</Text>
              <Text style={styles.rowBody}>What happens to your data and when</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </PressableScale>

          <View style={styles.dangerZone}>
            <View style={styles.dangerHead}>
              <Icon name="warning" size={16} color={colors.danger} />
              <Text style={styles.dangerTitle}>Delete account</Text>
            </View>
            <Text style={styles.dangerBody}>
              Your listings and shop are hidden right away. Sign in within 30 days to cancel, after that everything is
              permanently deleted.
            </Text>
            <PressableScale contentStyle={styles.dangerBtn} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <>
                  <Icon name="trash-outline" size={17} color={colors.danger} />
                  <Text style={styles.dangerBtnText}>Delete my account</Text>
                </>
              )}
            </PressableScale>
          </View>
        </Section>

        <Reanimated.View entering={enterUp(7)} style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Icon name="lock-closed" size={18} color={TINT.protect} />
          </View>
          <Text style={styles.tipText}>
            KinBech will never ask for your OTP. Don't share it with anyone, even if they say they're from support.
          </Text>
        </Reanimated.View>
      </ScrollView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  shrink: { flexShrink: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  cardDanger: { borderColor: colors.dangerBackground },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  cardSubtitle: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  countPill: {
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    alignItems: 'center',
  },
  countText: { fontSize: 12.5, fontWeight: '900' },

  levelWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  levelBar: { flex: 1, flexDirection: 'row', gap: 5 },
  levelSeg: { flex: 1, height: 7, borderRadius: 4 },
  levelPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  levelText: { fontSize: 12, fontWeight: '900' },
  checkList: { paddingHorizontal: 10, paddingTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 6, paddingVertical: 9 },
  checkIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  checkValue: { marginTop: 1, fontSize: 12, color: colors.textMuted },

  preview: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.iconBackground,
  },
  previewLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  previewInitials: { fontSize: 14, fontWeight: '900', color: colors.text },
  previewName: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  previewMetaText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  previewDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textMuted, marginHorizontal: 3 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  rowBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },

  loadingWrap: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { paddingTop: 10, paddingBottom: 14, paddingHorizontal: 24, alignItems: 'center' },
  emptyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text, marginBottom: 4 },
  emptyBody: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 14,
  },
  itemRowCurrent: { backgroundColor: colors.iconBackground },
  itemIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  itemMeta: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
  },
  tagText: { fontSize: 11, fontWeight: '800' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 48 },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  chipBtnDanger: { backgroundColor: colors.deleteBg },
  chipBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%', borderRadius: 999 },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.text },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: TINT.blocked,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportRow: { marginHorizontal: 10, paddingHorizontal: 8, paddingVertical: 10, gap: 8 },
  reportTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallText: { fontSize: 13, fontWeight: '800', color: colors.text },
  reportDate: { fontSize: 11, color: colors.textMuted },

  dangerZone: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.dangerBackground,
  },
  dangerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dangerTitle: { fontSize: 14, fontWeight: '900', color: colors.danger },
  dangerBody: { marginTop: 6, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  dangerBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '900', color: colors.danger },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${TINT.protect}33`,
    backgroundColor: `${TINT.protect}12`,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${TINT.protect}1F`,
  },
  tipText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
});
