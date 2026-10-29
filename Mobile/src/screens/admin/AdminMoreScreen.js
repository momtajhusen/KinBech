import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import LogoutConfirmModal from '../../components/LogoutConfirmModal';
import { AdminHeader, toneColors } from '../../components/admin/AdminKit';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { ROLE_LABELS } from '../../utils/admin';
import { resolveMediaUrl } from '../../utils/listing';

const LINKS = [
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
        <AdminHeader title="More" subtitle="Everything else on the platform">
          <View style={styles.profile}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.avatarLetter}>{String(user?.name || 'A').charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.flex1}>
              <Text style={styles.profileName} numberOfLines={1}>{user?.name || 'KinBech Admin'}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>{user?.email || ''}</Text>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{ROLE_LABELS[user?.role] || 'Admin'}</Text>
            </View>
          </View>
        </AdminHeader>

        <View style={styles.panel}>
          {LINKS.map((link, i) => {
            const tone = toneColors(colors, link.tone);
            const n = link.countKey ? counts[link.countKey] || 0 : 0;
            return (
              <Pressable
                key={link.route}
                onPress={() => navigation.navigate(link.route)}
                style={({ pressed }) => [styles.row, i < LINKS.length - 1 && styles.divider, pressed && styles.pressed]}
              >
                <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                  <Icon name={link.icon} size={19} color={tone.fg} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowLabel}>{link.label}</Text>
                  <Text style={styles.rowBody}>{link.body}</Text>
                </View>
                {n > 0 ? (
                  <View style={[styles.count, { backgroundColor: tone.fg }]}>
                    <Text style={styles.countText}>{n}</Text>
                  </View>
                ) : null}
                <Icon name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.info}>
          <Icon name="information-circle" size={16} color={colors.textTertiary} />
          <Text style={styles.infoText}>
            Every action here is saved in the admin audit log. Admin settings, staff and the full error log stay on the website admin panel.
          </Text>
        </View>

        <Pressable
          onPress={() => setConfirmLogout(true)}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Icon name="log-out" size={19} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
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
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  pressed: { opacity: 0.75 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: colors.white },
  profileName: { fontSize: 15.5, fontWeight: '800', color: colors.white },
  profileEmail: { marginTop: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.75)' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#A7F3D0' },
  roleText: { fontSize: 11, fontWeight: '800', color: '#064E3B' },

  panel: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  rowBody: { marginTop: 1, fontSize: 12.5, color: colors.textTertiary },
  count: { minWidth: 26, height: 22, paddingHorizontal: 7, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '800', color: colors.white },

  info: { flexDirection: 'row', gap: 8, marginTop: 16, marginHorizontal: 20 },
  infoText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textTertiary },

  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.pastelRed,
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: colors.error },
});
