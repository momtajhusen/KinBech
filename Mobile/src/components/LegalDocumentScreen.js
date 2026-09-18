import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLegalDocument } from '../content/legalContent';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

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
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  docLastUpdated: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    lineHeight: 22,
  },
  sectionBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  footerBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
  },
  footerBody: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  missing: {
    padding: 24,
    alignItems: 'center',
  },
});

export default function LegalDocumentScreen({ navigation, route }) {
  const docKey = route?.params?.doc || 'privacy';
  const document = getLegalDocument(docKey);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  if (!document) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.missing}>
          <Text>Document not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle} numberOfLines={2}>{document.title}</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.docCard}>
          <Text style={styles.docLastUpdated}>Last updated: {document.lastUpdated}</Text>
          {document.sections.map((sec) => (
            <View key={sec.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              <Text style={styles.sectionBody}>{sec.body}</Text>
            </View>
          ))}
        </View>

        {document.footer ? (
          <View style={styles.footerBox}>
            <Text style={styles.footerTitle}>{document.footer.title}</Text>
            <Text style={styles.footerBody}>{document.footer.body}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
