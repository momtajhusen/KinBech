import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

export default function InviteFriendsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState(user?.referralCode || '');
  const [featuredCredits, setFeaturedCredits] = useState(user?.featuredCredits || 0);
  const [invitedCount, setInvitedCount] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [applyCode, setApplyCode] = useState('');
  const [alertConfig, setAlertConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getReferral();
    setLoading(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not load invite',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setReferralCode(data.referralCode || '');
    setFeaturedCredits(data.featuredCredits || 0);
    setInvitedCount(data.invitedCount || 0);
    setShareMessage(data.shareMessage || '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setAlertConfig(
      showSuccessAlert({
        title: 'Copied',
        message: `Code ${referralCode} copied. Share it with a friend.`,
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const shareInvite = async () => {
    try {
      await Share.share({
        message: shareMessage || `Join KinBech with my code ${referralCode}`,
      });
    } catch {
      /* ignore cancel */
    }
  };

  const handleApply = async () => {
    if (!applyCode.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Enter a code',
          message: 'Ask your friend for their KinBech invite code.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    const { data, error } = await api.applyReferral(applyCode.trim());
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not apply code',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    if (data?.user) {
      await refreshUser();
    }
    setApplyCode('');
    setAlertConfig(
      showSuccessAlert({
        title: 'Referral applied',
        message: data?.message || 'Thanks! Your friend earned a featured listing credit.',
        onConfirm: () => setAlertConfig(null),
      })
    );
    load();
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.onGradient} />
          </Pressable>
          <Text style={styles.headerTitle}>Invite friends</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.headerSubtitle}>
          Friend joins with your code → you get 1 day featured listing free.
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.creditCard}>
            <Ionicons name="sparkles" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.creditTitle}>{featuredCredits} featured credit(s)</Text>
              <Text style={styles.creditHint}>
                Use a credit after posting to boost your listing for 24 hours.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Your invite code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{referralCode || '—'}</Text>
            <Pressable onPress={copyCode} style={styles.copyBtn}>
              <Ionicons name="copy-outline" size={18} color={colors.primary} />
              <Text style={styles.copyText}>Copy</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>{invitedCount} friend(s) joined with your code</Text>

          <GradientButton
            title="Share invite"
            icon="share-social-outline"
            onPress={shareInvite}
            style={{ marginTop: 8 }}
          />

          {!user?.referredBy ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Have a friend’s code?</Text>
              <View style={styles.fieldCard}>
                <TextInput
                  value={applyCode}
                  onChangeText={setApplyCode}
                  placeholder="Enter invite code"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  style={styles.input}
                />
              </View>
              <Pressable style={styles.secondaryBtn} onPress={handleApply}>
                <Text style={styles.secondaryBtnText}>Apply code</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      )}

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingBottom: 18 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.onGradient },
  headerSubtitle: {
    fontSize: 13,
    color: colors.onGradient,
    opacity: 0.92,
    lineHeight: 18,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 10 },
  creditCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  creditTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  creditHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 8 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeText: { fontSize: 22, fontWeight: '900', letterSpacing: 2, color: colors.primary },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  copyText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  meta: { fontSize: 12, color: colors.textSecondary },
  fieldCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: { fontSize: 16, color: colors.text, paddingVertical: 4 },
  secondaryBtn: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.iconBackground,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '800', color: colors.primary },
});
