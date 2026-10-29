import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { Float, PressableScale, Pulse, Reanimated, SoftPop, enterCard, enterUp } from '../../components/Motion';
import { AdminHeader, toneColors } from '../../components/admin/AdminKit';
import { useAuth } from '../../context/AuthContext';
import { useAccountSwitch } from '../../hooks/useAccountSwitch';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { ROLE_LABELS } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const LINKS = [
  { route: 'AdminLive', label: 'Live now', body: 'Who is in the app right now and which screen', icon: 'pulse', tone: 'success' },
  { route: 'AdminScam', label: 'Scam monitor', body: 'Flagged chat messages: warn, restrict or strike', icon: 'warning', tone: 'error', countKey: 'scam-monitor' },
  { route: 'AdminTesters', label: 'Testers', body: 'Make tester, exit tester or delete test accounts', icon: 'flask', tone: 'info' },
  { route: 'AdminShops', label: 'Shops', body: 'Verify shops, suspend or reactivate', icon: 'storefront', tone: 'info', countKey: 'shop-verification' },
  { route: 'AdminPayments', label: 'Payments', body: 'Approve plan purchases', icon: 'wallet', tone: 'success', countKey: 'subscriptions' },
  { route: 'AdminSupport', label: 'Support tickets', body: 'Reply to user help requests', icon: 'headset', tone: 'warning', countKey: 'support' },
  { route: 'AdminReviews', label: 'Reviews', body: 'Approve or hide buyer reviews', icon: 'star', tone: 'warning' },
];

export default function AdminMoreScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { linked, switching, error: switchError, switchNow } = useAccountSwitch();
  const [counts, setCounts] = useState({});
  const [confirmLogout, setConfirmLogout] = useState(false);
  const avatar = resolveMediaUrl(user?.avatarUrl);

  useFocusEffect(
    useCallback(() => {
      api.adminNavCounts().then(({ data }) => {
        if (data?.counts) setCounts(data.counts);
      });
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <AdminHeader icon="apps" title="More" subtitle="Everything else on the platform">
          <Reanimated.View entering={enterCard(0)} style={styles.profile}>
            <SoftPop>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <Text style={styles.avatarLetter}>{String(user?.name || 'A').charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </SoftPop>
            <View style={styles.flex1}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.name || 'KinBech Admin'}</Text>
              <View style={styles.emailRow}>
                <Icon name="mail-outline" size={11} color={colors.textMuted} />
                <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || ''}</Text>
              </View>
            </View>
            <View style={styles.roleBadge}>
              <Icon name="shield-checkmark" size={11} color={colors.primary} />
              <Text style={styles.roleText}>{ROLE_LABELS[user?.role] || 'Admin'}</Text>
            </View>
          </Reanimated.View>
        </AdminHeader>

        <View style={styles.panel}>
          {LINKS.map((link, i) => {
            const tone = toneColors(colors, link.tone);
            const n = link.countKey ? counts[link.countKey] || 0 : 0;
            return (
              <PressableScale
                key={link.route}
                onPress={() => navigation.navigate(link.route)}
                scaleTo={0.97}
                entering={enterUp(i + 1, 45)}
                contentStyle={[styles.row, i < LINKS.length - 1 && styles.divider]}
              >
                <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                  <Icon name={link.icon} size={17} color={tone.fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowLabel}>{link.label}</Text>
                  <Text style={styles.rowBody} numberOfLines={1}>{link.body}</Text>
                </View>
                {n > 0 ? (
                  <Pulse style={[styles.count, { backgroundColor: tone.fg }]}>
                    <Text style={styles.countText}>{n > 99 ? '99+' : n}</Text>
                  </Pulse>
                ) : null}
                <Icon name="chevron-forward" size={16} color={colors.textMuted} />
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.info}>
          <Float distance={2}>
            <Icon name="information-circle" size={15} color={colors.textTertiary} />
          </Float>
          <Text style={styles.infoText}>
            Every action here is saved in the admin audit log. Admin settings, staff and the full error log stay on the website admin panel.
          </Text>
        </View>

        {linked ? (
          <PressableScale
            onPress={switchNow}
            disabled={switching}
            scaleTo={0.97}
            entering={enterUp(LINKS.length + 1, 45)}
            contentStyle={styles.switchCard}
          >
            <View style={[styles.rowIcon, { backgroundColor: colors.pastelGreen }]}>
              <Icon name="swap-horizontal" size={17} color={colors.primary} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.rowLabel}>Switch to seller account</Text>
              <Text style={styles.rowBody} numberOfLines={1}>
                {linked.name ? `${linked.name} · ` : ''}No need to log out
              </Text>
            </View>
            {switching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Icon name="chevron-forward" size={16} color={colors.textMuted} />
            )}
          </PressableScale>
        ) : null}
        {switchError ? <Text style={styles.switchError}>{switchError}</Text> : null}

        <PressableScale onPress={() => setConfirmLogout(true)} entering={enterUp(LINKS.length + 2, 45)} contentStyle={styles.logout}>
          <Icon name="log-out" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </PressableScale>
      </ScrollView>

      <LogoutConfirmModal
        visible={confirmLogout}
        userName={user?.name}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          await logout();
          setConfirmLogout(false);
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
        }}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 14,
    padding: 12,
    borderRadius: 22,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, experimental_backgroundImage: colors.greenGradient, boxShadow: colors.clayGreenShadow },
  avatarLetter: { fontSize: 17, fontWeight: '800', color: colors.white },
  profileName: { fontSize: 14.5, fontWeight: '900', color: colors.text },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  profileEmail: { flexShrink: 1, fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayBadge,
  },
  roleText: { fontSize: 10.5, fontWeight: '800', color: colors.primary },

  panel: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 11 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  rowLabel: { fontSize: 14, fontWeight: '900', color: colors.text },
  rowBody: { marginTop: 1, fontSize: 11.5, color: colors.textTertiary },
  count: { minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayBadge },
  countText: { fontSize: 11, fontWeight: '800', color: colors.white },

  info: { flexDirection: 'row', gap: 8, marginTop: 14, marginHorizontal: 20 },
  infoText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.textTertiary },

  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 18,
    marginHorizontal: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  switchError: { marginTop: 8, marginHorizontal: 20, fontSize: 12, fontWeight: '600', color: colors.error },

  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 18,
    backgroundColor: colors.pastelRed,
    boxShadow: colors.clayTint,
  },
  logoutText: { fontSize: 14, fontWeight: '800', color: colors.error },
});
