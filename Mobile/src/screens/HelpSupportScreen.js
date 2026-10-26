import { useRef, useState } from 'react';
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
import Icon from '../components/Icon';
import { INFO_COPY, ROUTES } from '../navigation/helpers';
import VoiceSearchButton from '../components/VoiceSearchButton';
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
    title: 'Account',
    subtitle: 'Login, profile, seller type, deletion',
    bg: 'photoPlusBackground',
    iconBg: 'gradientStart',
  },
  {
    key: 'selling',
    icon: 'pricetag-outline',
    title: 'Selling',
    subtitle: 'Posting, review, edits, featured',
    bg: 'supportPaymentsBg',
    iconBg: 'supportPaymentsIcon',
  },
  {
    key: 'buying',
    icon: 'wallet-outline',
    title: 'Buying & payments',
    subtitle: 'Chat, meetup, paying the seller',
    bg: 'supportSafetyBg',
    iconBg: 'supportSafetyIcon',
  },
  {
    key: 'safety',
    icon: 'shield-checkmark-outline',
    title: 'Safety & reports',
    subtitle: 'Stay safe, report or block',
    bg: 'supportReportBg',
    iconBg: 'supportReportIcon',
  },
];

const FAQS = [
  { key: 'login', topic: 'account', question: 'How do I sign up or log in?', answer: 'Enter your Nepal mobile number (+977) and type the OTP we send you. New users then add their name and choose how they want to sell. There is no password to remember.' },
  { key: 'free', topic: 'buying', question: 'Is KinBech free to use?', answer: 'Yes. Posting, browsing, chatting and calling are free, and KinBech takes no commission on your sales.' },
  { key: 'post', topic: 'selling', question: 'How do I post an item?', answer: 'Tap Sell in the bottom bar, add clear photos and fill in the details, then post. AI fill can read your photo and suggest the title, category and price for you to check.' },
  { key: 'pay', topic: 'buying', question: 'How do I pay for an item?', answer: 'KinBech does not take payments. You pay the seller directly when you meet: cash, eSewa, Khalti, IME Pay or bank transfer. Never pay before you have seen the item.' },
  { key: 'contact', topic: 'buying', question: 'How do I contact a seller?', answer: 'Open the item and tap Chat. You can also call from inside the chat. Your phone number stays hidden unless you turn on "Show phone number" in Settings → Privacy & Security.' },
  { key: 'safe', topic: 'safety', question: 'How do I stay safe while buying or selling?', answer: 'Meet in a busy public place, bring a friend for costly items, inspect the item before paying, and keep the conversation in KinBech chat. Never share an OTP or bank PIN with anyone.' },
  { key: 'delivery', topic: 'buying', question: 'Does KinBech deliver items?', answer: 'No. KinBech is for local deals: chat with the seller, agree on a place and time, and meet in person.' },
  { key: 'review', topic: 'selling', question: 'Why is my listing "In review"?', answer: 'Some items are checked by our team before they go live, for example certain categories or words. Profile → My Listings shows the reason, and you get a notification when it is approved.' },
  { key: 'edit', topic: 'selling', question: 'How do I edit, mark sold or delete a listing?', answer: 'Go to Profile → My Listings and open the options on the item. You can edit it, mark it as sold, or delete it.' },
  { key: 'featured', topic: 'selling', question: 'How do I get my listing Featured?', answer: 'Invite friends from Profile → Invite. Each friend who joins gives you one free boost. Open My Listings and tap Boost on a live listing (or tap it right after posting). It is marked Featured and shown higher to nearby buyers for 24 hours.' },
  { key: 'afterDeal', topic: 'buying', question: 'What should I do after a deal?', answer: 'Mark the deal as done in the chat and leave a review. Honest reviews help other buyers and build the seller\'s trust level.' },
  { key: 'report', topic: 'safety', question: 'How do I report or block someone?', answer: 'In a chat, tap the ⋮ menu. On a seller or shop page, tap the ••• button. Choose Report or Block. You can track your reports and unblock people in Settings → Privacy & Security.' },
  { key: 'profile', topic: 'account', question: 'How do I change my name, photo or area?', answer: 'Go to Profile → Edit Profile (store owners see Edit Store Profile). Saved meetup places are under Settings → Saved Addresses.' },
  { key: 'sellerType', topic: 'account', question: 'Can I sell as a shop and as an individual?', answer: 'Yes. In Settings → Seller Preference choose Individual, Shop or Both. A shop gets its own store page, QR code and sales stats.' },
  { key: 'verified', topic: 'selling', question: 'How does my shop get a verified badge?', answer: 'Open Settings → Business Verification, add your PAN/VAT number and upload business documents. The badge appears after our team reviews them.' },
  { key: 'delete', topic: 'account', question: 'How do I delete my account?', answer: 'Go to Settings → Privacy & Security. You can download a copy of your data there first, then delete your account.' },
];

const FAQ_PREVIEW = 6;

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
  const [topic, setTopic] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef(null);
  const faqTopRef = useRef(0);

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

  const query = search.trim().toLowerCase();
  const matchingFaqs = FAQS.filter((faq) => {
    if (topic && faq.topic !== topic) return false;
    if (!query) return true;
    return faq.question.toLowerCase().includes(query) || faq.answer.toLowerCase().includes(query);
  });
  const collapsible = !topic && !query && matchingFaqs.length > FAQ_PREVIEW;
  const filteredFaqs = collapsible && !showAll ? matchingFaqs.slice(0, FAQ_PREVIEW) : matchingFaqs;
  const activeTopic = CATEGORIES.find((cat) => cat.key === topic);

  const pickTopic = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTopic((prev) => (prev === key ? null : key));
    setExpandedFaq(null);
    scrollRef.current?.scrollTo({ y: Math.max(0, faqTopRef.current - 12), animated: true });
  };

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
          <Icon name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color={colors.textMuted} />
          <TextInput
            placeholder="Search for help topics..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <VoiceSearchButton color={colors.textMuted} onResult={(text) => setSearch(text)} />
        </View>

        <View style={styles.categoryGrid}>
          {(resolvedCategories || []).map((cat) => (
            <Pressable
              key={cat.key}
              style={[
                styles.categoryCard,
                { backgroundColor: cat.bg },
                topic === cat.key && { borderColor: cat.iconBg },
              ]}
              onPress={() => pickTopic(cat.key)}
            >
              <View style={[styles.categoryIconCircle, { backgroundColor: cat.iconBg }]}>
                <Icon name={cat.icon} size={24} color={colors.white} />
              </View>
              <Text style={styles.categoryTitle}>{cat.title}</Text>
              <View style={styles.categoryBottomRow}>
                <Text style={styles.categorySubtitle}>{cat.subtitle}</Text>
                <View style={styles.categoryArrow}>
                  <Icon name="chevron-forward" size={18} color={colors.gradientStart} />
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <View
          style={styles.sectionHeaderRow}
          onLayout={(event) => {
            faqTopRef.current = event.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.sectionHeading}>
            {activeTopic ? activeTopic.title : 'Frequently Asked Questions'}
          </Text>
          {activeTopic ? (
            <Pressable onPress={() => pickTopic(topic)} hitSlop={8}>
              <Text style={styles.viewAll}>All topics</Text>
            </Pressable>
          ) : null}
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
                    <Icon
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
              <Icon name="search-outline" size={48} color={colors.textMuted} />
              <Text style={styles.noResultsTitle}>No results found</Text>
              <Text style={styles.noResultsText}>Try different keywords</Text>
            </View>
          )}
          {collapsible ? (
            <Pressable
              style={styles.showMore}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setShowAll((prev) => !prev);
              }}
            >
              <Text style={styles.viewAll}>
                {showAll ? 'Show less' : `View all ${matchingFaqs.length} questions`}
              </Text>
              <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={colors.link} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.supportCard}>
          <View style={styles.supportIconWrap}>
            <Icon name="sparkles" size={16} color={colors.warningYellow} style={styles.sparkleTop} />
            <Icon name="sparkles" size={12} color={colors.gradientStart} style={styles.sparkleLeft} />
            <Icon name="sparkles" size={10} color={colors.gradientStart} style={styles.sparkleBottom} />
            <View style={styles.supportIconCircle}>
              <Icon name="headset-outline" size={40} color={colors.gradientStart} />
            </View>
          </View>
          <View style={styles.supportTextWrap}>
            <Text style={styles.supportTitle}>Still need help?</Text>
            <Text style={styles.supportBody}>
              Send our team a ticket and track whether it is open or resolved.
            </Text>
            <Pressable onPress={() => navigation.navigate(ROUTES.CONTACT_US)}>
              <LinearGradient
                colors={[colors.gradientStart, colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.contactButton}
              >
                <Icon name="chatbubble-outline" size={16} color={colors.white} />
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
                <Icon name={article.icon} size={20} color={colors.gradientStart} />
              </View>
              <View style={styles.articleTextWrap}>
                <Text style={styles.articleTitle}>{article.title}</Text>
                <Text style={styles.articleSubtitle}>{article.subtitle}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionHeading}>Legal & Policies</Text>
        <View style={styles.articlesList}>
          <Pressable style={styles.articleRow} onPress={() => navigation.navigate(ROUTES.LEGAL_HUB)}>
            <View style={styles.articleIconWrap}>
              <Icon name="library-outline" size={20} color={colors.gradientStart} />
            </View>
            <View style={styles.articleTextWrap}>
              <Text style={styles.articleTitle}>All legal documents</Text>
              <Text style={styles.articleSubtitle}>Privacy, terms, permissions, account deletion</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable
            style={styles.articleRow}
            onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'permissions' })}
          >
            <View style={styles.articleIconWrap}>
              <Icon name="phone-portrait-outline" size={20} color={colors.gradientStart} />
            </View>
            <View style={styles.articleTextWrap}>
              <Text style={styles.articleTitle}>App permissions & data use</Text>
              <Text style={styles.articleSubtitle}>What KinBech accesses on your device</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textMuted} />
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
    borderWidth: 2,
    borderColor: 'transparent',
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
  showMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
