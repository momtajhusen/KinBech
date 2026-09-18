import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEGAL_COMPANY, LEGAL_LAST_UPDATED, LEGAL_LINKS } from '../content/legalContent';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.onGradient },
  content: { padding: 16 },
  intro: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  introTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6 },
  introBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSubtitle: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  meta: { marginTop: 16, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});

export default function LegalHubScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
        </Pressable>
        <Text style={styles.headerTitle}>Legal & Policies</Text>
        <View style={styles.back} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Play Store & user transparency</Text>
          <Text style={styles.introBody}>
            These documents explain how KinBech uses your data, which device permissions we request, community rules, and how to delete your account — as required for Google Play and your privacy rights.
          </Text>
        </View>

        <View style={styles.card}>
          {LEGAL_LINKS.map((item, index) => (
            <Pressable
              key={item.key}
              style={[styles.row, index < LEGAL_LINKS.length - 1 && styles.rowBorder]}
              onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: item.key })}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={item.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.meta}>
          {LEGAL_COMPANY.name}{'\n'}
          {LEGAL_COMPANY.address}{'\n'}
          Last updated: {LEGAL_LAST_UPDATED}{'\n'}
          {LEGAL_COMPANY.supportEmail}
        </Text>
      </ScrollView>
    </View>
  );
}
