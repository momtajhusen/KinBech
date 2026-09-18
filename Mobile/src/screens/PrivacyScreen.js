import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { LEGAL_COMPANY } from '../content/legalContent';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const STATUS_LABELS = {
  pending: 'Pending',
  reviewed: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const REASON_LABELS = {
  spam: 'Spam',
  'fake-listing': 'Fake Listing',
  inappropriate: 'Inappropriate',
  other: 'Other',
};

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  sectionCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 18,
    opacity: 0.7,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  blockedAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  blockedAvatarImg: { width: '100%', height: '100%' },
  blockedAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  blockedInfo: { flex: 1, gap: 2 },
  blockedName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  blockedPhone: {
    fontSize: 12,
    color: colors.textMuted,
  },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unblockBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  reportRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
  },
  reportTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  reportUserRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reportUserImg: { width: '100%', height: '100%' },
  reportUserPlaceholder: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  reportUserText: { flex: 1, gap: 2 },
  reportUserName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  reportListing: {
    fontSize: 12,
    color: colors.textMuted,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 12,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  switchBody: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  linkRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    paddingRight: 8,
  },
});

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusColor(status, colors) {
  switch (status) {
    case 'resolved':
      return { bg: colors.pastelLime, text: colors.statusActive };
    case 'dismissed':
      return { bg: colors.iconBackground, text: colors.textMuted };
    case 'reviewed':
      return { bg: colors.pastelIndigo, text: colors.primary };
    case 'pending':
    default:
      return { bg: colors.pastelCyan, text: colors.statusPending };
  }
}

export default function PrivacyScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const [blocked, setBlocked] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [unblockingId, setUnblockingId] = useState(null);
  const [showPhone, setShowPhone] = useState(Boolean(user?.preferences?.showPhone));
  const [showLocation, setShowLocation] = useState(user?.preferences?.showLocation !== false);
  const [prefSaving, setPrefSaving] = useState(false);

  const loadBlocked = useCallback(async () => {
    setBlockedLoading(true);
    try {
      const { data, error } = await api.getBlockedUsers();
      if (error) {
        // silent, show empty
      }
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
    const [blockedRes, reportsRes] = await Promise.all([
      api.getBlockedUsers(),
      api.getMyReports(),
    ]);
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
    }, [loadBlocked, loadReports])
  );

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

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconCircle, { backgroundColor: colors.pastelIndigo }]}>
              <Ionicons name="eye-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Profile visibility</Text>
              <Text style={styles.cardSubtitle}>Control what other users can see</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Show phone number</Text>
              <Text style={styles.switchBody}>
                Off by default. Only enable if you want buyers to call you outside the app.
              </Text>
            </View>
            <Switch
              value={showPhone}
              disabled={prefSaving}
              onValueChange={(value) => {
                setShowPhone(value);
                updateVisibility({ showPhone: value }, () => setShowPhone(!value));
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Show city on listings</Text>
              <Text style={styles.switchBody}>
                Lets nearby buyers see your area. Your exact address stays private.
              </Text>
            </View>
            <Switch
              value={showLocation}
              disabled={prefSaving}
              onValueChange={(value) => {
                setShowLocation(value);
                updateVisibility({ showLocation: value }, () => setShowLocation(!value));
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconCircle, { backgroundColor: colors.pastelIndigo }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Blocked Users</Text>
              <Text style={styles.cardSubtitle}>Users you have blocked from KinBech</Text>
            </View>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCountText}>{blocked.length}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          {blockedLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : blocked.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="shield-outline" size={28} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptyBody}>
                When you block someone, they will no longer be able to see your listings or send you messages.
              </Text>
            </View>
          ) : (
            blocked.map((u, idx) => (
              <View key={u.id}>
                {idx > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.blockedRow}>
                  <View style={styles.blockedAvatar}>
                    {u.avatarUrl ? (
                      <Image source={{ uri: u.avatarUrl }} style={styles.blockedAvatarImg} />
                    ) : (
                      <Text style={styles.blockedAvatarText}>{initials(u.name)}</Text>
                    )}
                  </View>
                  <View style={styles.blockedInfo}>
                    <Text style={styles.blockedName}>{u.name || 'Unknown User'}</Text>
                    <Text style={styles.blockedPhone}>{u.phone || ''}</Text>
                  </View>
                  <Pressable
                    onPress={() => handleUnblock(u.id, u.name)}
                    style={styles.unblockBtn}
                    disabled={unblockingId === u.id}
                  >
                    {unblockingId === u.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.unblockBtnText}>Unblock</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconCircle, { backgroundColor: colors.pastelCyan }]}>
              <Ionicons name="flag-outline" size={18} color={colors.info} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Your Reports</Text>
              <Text style={styles.cardSubtitle}>Recent reports you have submitted</Text>
            </View>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCountText}>{reports.length}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          {reportsLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="flag" size={28} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No reports submitted</Text>
              <Text style={styles.emptyBody}>
                You can report listings, messages, or users that violate KinBech community guidelines.
              </Text>
            </View>
          ) : (
            reports.map((r, idx) => {
              const sc = statusColor(r.status, colors);
              return (
                <View key={r._id || String(idx)}>
                  {idx > 0 ? <View style={styles.divider} /> : null}
                  <View style={styles.reportRow}>
                    <View style={styles.reportTop}>
                      <View style={styles.reportUserRow}>
                        <View style={styles.reportUserAvatar}>
                          {r.reportedUser?.avatarUrl ? (
                            <Image
                              source={{ uri: r.reportedUser.avatarUrl }}
                              style={styles.reportUserImg}
                            />
                          ) : (
                            <Text style={styles.reportUserPlaceholder}>
                              {initials(r.reportedUser?.name)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.reportUserText}>
                          <Text style={styles.reportUserName}>
                            {r.reportedUser?.name || 'Unknown User'}
                          </Text>
                          <Text style={styles.reportListing}>
                            {r.reportedListing?.title || 'No listing attached'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.badgesRow}>
                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: colors.iconBackground },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: colors.text }]}>
                          {REASON_LABELS[r.reason] || r.reason || 'Report'}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.badgeText, { color: sc.text }]}>
                          {STATUS_LABELS[r.status] || r.status || 'Pending'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconCircle, { backgroundColor: colors.pastelIndigo }]}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>Legal documents</Text>
              <Text style={styles.cardSubtitle}>Privacy, permissions & account deletion</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.linkRow} onPress={() => navigation.navigate(ROUTES.PRIVACY_POLICY)}>
            <Text style={styles.linkRowText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'permissions' })}
          >
            <Text style={styles.linkRowText}>App Permissions & Data Use</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.linkRow} onPress={() => navigation.navigate(ROUTES.LEGAL_HUB)}>
            <Text style={styles.linkRowText}>All legal & policy pages</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <View style={[styles.card, { borderColor: colors.dangerBackground }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconCircle, { backgroundColor: colors.dangerBackground }]}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={[styles.cardTitle, { color: colors.danger }]}>Delete account</Text>
              <Text style={styles.cardSubtitle}>Permanently remove your KinBech account & data</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'accountDeletion' })}
          >
            <Text style={styles.linkRowText}>Read Account Deletion Policy</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.linkRow}
            onPress={() => {
              Alert.alert(
                'Request account deletion',
                `Email ${LEGAL_COMPANY.privacyEmail} with your registered phone number and name. We process requests within 30 days. In-app self-delete is coming in the next update.`,
                [{ text: 'OK' }],
              );
            }}
          >
            <Text style={[styles.linkRowText, { color: colors.danger, fontWeight: '800' }]}>
              Request deletion by email
            </Text>
            <Ionicons name="mail-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </ScrollView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}
