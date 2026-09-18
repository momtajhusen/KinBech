import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const CURRENCY_OPTIONS = [
  { key: 'NPR (₨)', title: 'नेपाली रुपैयाँ — Nepali Rupee', symbol: '₨', code: 'NPR', recommended: true },
  { key: 'INR (₹)', title: 'भारतीय रुपया — Indian Rupee', symbol: '₹', code: 'INR', recommended: false },
  { key: 'USD ($)', title: 'US Dollar', symbol: '$', code: 'USD', recommended: false },
];

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  optionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 18,
    opacity: 0.7,
  },
  symbolCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  optionText: { flex: 1, gap: 4 },
  optionTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionCodeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: colors.iconBackground,
  },
  optionCodeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: colors.pastelLime,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.statusActive,
    letterSpacing: 0.3,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.gradientStart,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.gradientStart,
  },
  hintCard: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
});

export default function CurrencySelectScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const initial = useMemo(
    () => user?.preferences?.currency || 'NPR (₨)',
    [user?.preferences?.currency]
  );
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const handleSelect = async (key) => {
    setSelected(key);
    setSaving(true);
    try {
      const { data, error } = await api.updatePreferences({ currency: key });
      if (error || !data?.user) {
        setSaving(false);
        setAlertConfig(
          showErrorAlert({
            title: 'Could not save currency',
            message: error || 'Please try again.',
            onConfirm: () => setAlertConfig(null),
          })
        );
        return;
      }
      if (data.token && data.user) {
        await saveSession(data.token, data.user);
      }
      setSaving(false);
      setAlertConfig(
        showSuccessAlert({
          title: 'Currency Updated',
          message: `All prices will be shown in ${key}.`,
          onConfirm: () => {
            setAlertConfig(null);
            navigation.goBack();
          },
        })
      );
    } catch (_) {
      setSaving(false);
      setAlertConfig(
        showErrorAlert({
          title: 'Could not save currency',
          message: 'Something went wrong. Please check your connection and try again.',
          onConfirm: () => setAlertConfig(null),
        })
      );
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
        <Text style={styles.headerTitle}>Currency</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {CURRENCY_OPTIONS.map((opt, idx) => {
            const isSel = selected === opt.key;
            return (
              <View key={opt.key}>
                {idx > 0 ? <View style={styles.optionDivider} /> : null}
                <Pressable
                  onPress={() => !saving && handleSelect(opt.key)}
                  style={styles.optionRow}
                  disabled={saving}
                >
                  <View style={styles.symbolCircle}>
                    <Text style={styles.symbolText}>{opt.symbol}</Text>
                  </View>
                  <View style={styles.optionText}>
                    <View style={styles.optionTopRow}>
                      <Text style={styles.optionTitle} numberOfLines={1}>
                        {opt.title}
                      </Text>
                      {opt.recommended ? (
                        <View style={styles.recommendedBadge}>
                          <Text style={styles.recommendedText}>RECOMMENDED</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.optionCodeBadge}>
                      <Text style={styles.optionCodeText}>{opt.code}</Text>
                    </View>
                  </View>
                  {saving && isSel ? (
                    <ActivityIndicator size="small" color={colors.gradientStart} />
                  ) : (
                    <View
                      style={[styles.radioOuter, isSel && styles.radioOuterSelected]}
                    >
                      {isSel && <View style={styles.radioInner} />}
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.hintCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.textTertiary} />
          <Text style={styles.hintText}>
            KinBech supports cross-border transactions between Nepal and India. Prices are converted using daily market rates where the original listing currency differs.
          </Text>
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
