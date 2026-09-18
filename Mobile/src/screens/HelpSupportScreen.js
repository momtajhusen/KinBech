import { useState } from 'react';
import {
  Text,
  TextInput,
  View,
  Pressable,
  ScrollView,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { HELP_CATEGORY_COPY, INFO_COPY, ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

/**
 * Resolve color references (e.g., 'colors.iconBackground') to actual color values
 * @param {string} colorRef - Color reference string or direct color value
 * @param {object} colors - Theme colors object
 * @returns {string} Resolved color value
 */
function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

const CATEGORIES = [
  {
    key: 'account',
    icon: 'person-outline',
    title: 'Account Issues',
    subtitle: 'Profile, login, account settings & more',
    bg: 'photoPlusBackground',
    iconBg: 'gradientStart',
  },
  {
    key: 'payments',
    icon: 'wallet-outline',
    title: 'Payments',
    subtitle: 'Payments, refunds, transactions',
    bg: 'supportPaymentsBg',
    iconBg: 'supportPaymentsIcon',
  },
  {
    key: 'safety',
    icon: 'shield-checkmark-outline',
    title: 'Safety Tips',
    subtitle: 'Stay safe while buying & selling',
    bg: 'supportSafetyBg',
    iconBg: 'supportSafetyIcon',
  },
  {
    key: 'report',
    icon: 'warning-outline',
    title: 'Report a Problem',
    subtitle: 'Report scams, listings or other issues',
    bg: 'supportReportBg',
    iconBg: 'supportReportIcon',
  },
];

const FAQS = [
  { key: 'faq1', question: 'How do I create an account?', answer: 'Tap Sign Up on the welcome screen, enter your phone number, and verify the OTP sent to you. You can also sign up using your Google or Apple account.' },
  { key: 'faq2', question: 'How do I list an item for sale?', answer: 'Tap the + button on the home screen, add photos of your item, fill in details like title, description, price, and location, then submit your listing. Your item will be visible to buyers in your area.' },
  { key: 'faq3', question: 'How do I edit or delete my listing?', answer: 'Go to Profile > My Listings, select the item you want to modify, and choose Edit to update details or Delete to remove it permanently.' },
  { key: 'faq4', question: 'What payment methods do you support?', answer: 'We support cash on delivery for local meetups, mobile wallets like eSewa/Khalti, and bank transfers. Always complete transactions within the app for safety.' },
  { key: 'faq5', question: 'How do I report a suspicious user or item?', answer: 'Open the listing or user profile, tap the menu icon (•••), and select Report. Choose a reason and our team will review it within 24 hours.' },
  { key: 'faq6', question: 'Is KinBech free to use?', answer: 'Yes! KinBech is completely free for buyers. Sellers can list items for free, and we only charge a small fee when items are sold.' },
  { key: 'faq7', question: 'How do I stay safe while buying/selling?', answer: 'Always meet in public places, inspect items before payment, keep communication within the app, and never share personal information like bank details.' },
];

const POPULAR_ARTICLES = [
  {
    key: 'article1',
    icon: 'book-outline',
    title: 'Tips for Safe Buying & Selling',
    subtitle: 'Learn how to have a safe experience',
  },
];

export default function HelpSupportScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState(null);

  // Guard against undefined colors
  if (!colors) {
    return null;
  }

  // Resolve category colors
  const resolvedCategories = (CATEGORIES || []).map(cat => ({
    ...cat,
    bg: resolveColor(`colors.${cat.bg}`, colors),
    iconBg: resolveColor(`colors.${cat.iconBg}`, colors)
  }));

  const toggleFaq = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFaq((prev) => (prev === key ? null : key));
  };

  const filteredFaqs = search.trim() 
    ? FAQS.filter(faq => 
        faq.question.toLowerCase().includes(search.toLowerCase()) ||
        faq.answer.toLowerCase().includes(search.toLowerCase())
      )
    : FAQS;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
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
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <TextInput
            placeholder="Search for help topics..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </View>

        <View style={styles.categoryGrid}>
          {(resolvedCategories || []).map((cat) => (
            <Pressable
              key={cat.key}
              style={[styles.categoryCard, { backgroundColor: cat.bg }]}
              onPress={() => navigation.navigate(ROUTES.INFO, HELP_CATEGORY_COPY[cat.key])}
            >
              <View style={[styles.categoryIconCircle, { backgroundColor: cat.iconBg }]}>
                <Ionicons name={cat.icon} size={24} color={colors.white} />
              </View>
              <Text style={styles.categoryTitle}>{cat.title}</Text>
              <View style={styles.categoryBottomRow}>
                <Text style={styles.categorySubtitle}>{cat.subtitle}</Text>
                <View style={styles.categoryArrow}>
                  <Ionicons name="chevron-forward" size={18} color={colors.gradientStart} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeading}>Frequently Asked Questions</Text>
          <Pressable onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.AllFaqs)}>
            <Text style={styles.viewAll}>View all</Text>
          </Pressable>
        </View>

        <View style={styles.faqCard}>
          {filteredFaqs.length > 0 ? (
            (filteredFaqs || []).map((faq, index) => {
              const expanded = expandedFaq === faq.key;
              return (
                <View
                  key={faq.key}
                  style={[
                    styles.faqItem,
                    index === (filteredFaqs || []).length - 1 && styles.faqItemLast,
                  ]}
                >
                  <Pressable style={styles.faqHeader} onPress={() => toggleFaq(faq.key)}>
                    <View style={styles.faqQBadge}>
                      <Text style={styles.faqQBadgeText}>Q</Text>
                    </View>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <Ionicons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.text}
                    />
                  </Pressable>
                  {expanded && (
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.noResults}>
              <Ionicons name="search-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noResultsTitle}>No results found</Text>
              <Text style={styles.noResultsText}>Try different keywords</Text>
            </View>
          )}
        </View>

        <View style={styles.supportCard}>
          <View style={styles.supportIconWrap}>
            <Ionicons name="sparkles" size={16} color={colors.warningYellow} style={styles.sparkleTop} />
            <Ionicons name="sparkles" size={12} color={colors.gradientStart} style={styles.sparkleLeft} />
            <Ionicons name="sparkles" size={10} color={colors.gradientStart} style={styles.sparkleBottom} />
            <View style={styles.supportIconCircle}>
              <Ionicons name="headset-outline" size={40} color={colors.gradientStart} />
            </View>
          </View>
          <View style={styles.supportTextWrap}>
            <Text style={styles.supportTitle}>Still need help?</Text>
            <Text style={styles.supportBody}>
              Our support team is here to assist you 24/7.
            </Text>
            <Pressable onPress={() => navigation.navigate(ROUTES.CONTACT_US)}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.contactButton}
              >
                <Ionicons name="chatbubble-outline" size={16} color={colors.white} />
                <Text style={styles.contactButtonLabel}>Contact Support</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionHeading}>Popular Articles</Text>
        <View style={styles.articlesList}>
          {(POPULAR_ARTICLES || []).map((article) => (
            <Pressable
              key={article.key}
              style={styles.articleRow}
              onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.Article)}
            >
              <View style={styles.articleIconWrap}>
                <Ionicons name={article.icon} size={20} color={colors.gradientStart} />
              </View>
              <View style={styles.articleTextWrap}>
                <Text style={styles.articleTitle}>{article.title}</Text>
                <Text style={styles.articleSubtitle}>{article.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionHeading}>Legal & Policies</Text>
        <View style={styles.articlesList}>
          <Pressable style={styles.articleRow} onPress={() => navigation.navigate(ROUTES.LEGAL_HUB)}>
            <View style={styles.articleIconWrap}>
              <Ionicons name="library-outline" size={20} color={colors.gradientStart} />
            </View>
            <View style={styles.articleTextWrap}>
              <Text style={styles.articleTitle}>All legal documents</Text>
              <Text style={styles.articleSubtitle}>Privacy, terms, permissions, account deletion</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={styles.articleRow}
            onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'permissions' })}
          >
            <View style={styles.articleIconWrap}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.gradientStart} />
            </View>
            <View style={styles.articleTextWrap}>
              <Text style={styles.articleTitle}>App permissions & data use</Text>
              <Text style={styles.articleSubtitle}>What KinBech accesses on your device</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: -28,
    marginBottom: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  categoryCard: {
    width: '48%',
    borderRadius: 18,
    padding: 16,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  categoryBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  categorySubtitle: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    marginRight: 8,
  },
  categoryArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
    marginBottom: 12,
  },
  viewAll: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.link,
  },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 14,
  },
  faqItemLast: {
    borderBottomWidth: 0,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  faqQBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.photoPlusBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.link,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    paddingBottom: 16,
    paddingLeft: 38,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
  },
  supportIconWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleTop: {
    position: 'absolute',
    top: 0,
    right: 6,
  },
  sparkleLeft: {
    position: 'absolute',
    left: 0,
    top: 30,
  },
  sparkleBottom: {
    position: 'absolute',
    left: 8,
    bottom: 4,
  },
  supportTextWrap: {
    flex: 1,
    gap: 4,
  },
  supportTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  supportBody: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 10,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  contactButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  articlesList: {
    gap: 10,
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  articleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.photoPlusBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleTextWrap: {
    flex: 1,
    gap: 2,
  },
  articleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  articleSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noResultsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
  },
  noResultsText: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
});
