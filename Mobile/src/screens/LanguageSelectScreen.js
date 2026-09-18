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

const LANGUAGE_OPTIONS = [
  { key: 'English', title: 'English', subtitle: 'Default language', flag: '🇬🇧' },
  { key: 'Nepali', title: 'नेपाली (Nepali)', subtitle: 'मूल भाषा', flag: '🇳🇵' },
  { key: 'Hindi', title: 'हिन्दी (Hindi)', subtitle: 'हिंदी में बातचीत', flag: '🇮🇳' },
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
  flagCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flag: { fontSize: 18 },
  optionText: { flex: 1, gap: 2 },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  optionSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
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

export default function LanguageSelectScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const initial = useMemo(
    () => user?.preferences?.language || 'English',
    [user?.preferences?.language]
  );
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const handleSelect = async (key) => {
    setSelected(key);
    setSaving(true);
    try {
      const { data, error } = await api.updatePreferences({ language: key });
      if (error || !data?.user) {
        setSaving(false);
        setAlertConfig(
          showErrorAlert({
            title: 'Could not save language',
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
          title: 'Language Updated',
          message: `App language set to ${key}.`,
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
          title: 'Could not save language',
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
        <Text style={styles.headerTitle}>Language</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {LANGUAGE_OPTIONS.map((opt, idx) => {
            const isSel = selected === opt.key;
            return (
              <View key={opt.key}>
                {idx > 0 ? <View style={styles.optionDivider} /> : null}
                <Pressable
                  onPress={() => !saving && handleSelect(opt.key)}
                  style={styles.optionRow}
                  disabled={saving}
                >
                  <View style={styles.flagCircle}>
                    <Text style={styles.flag}>{opt.flag}</Text>
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionTitle}>{opt.title}</Text>
                    <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
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
            Your preferred language is used for SMS notifications and support communications. Full in-app translations are coming soon.
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
