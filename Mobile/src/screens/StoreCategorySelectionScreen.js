import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { VoiceSearchToggle, useVoiceSearchBox } from '../components/VoiceHost';
import { PressableScale, enterUp } from '../components/Motion';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useCategories } from '../utils/categories';

export default function StoreCategorySelectionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const shopCategories = useCategories('shop');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [query, setQuery] = useState('');

  const cardWidth = (width - 32 - 10) / 2;
  const matchesQuery = useVoiceSearchBox({
    label: 'Store categories to pick for my new shop',
    value: query,
    onChange: setQuery,
  });
  const visible = useMemo(
    () => shopCategories.filter((cat) => matchesQuery(cat.label, cat.description)),
    [shopCategories, matchesQuery]
  );
  const selectedMeta = shopCategories.find((cat) => cat.label === selectedCategory);

  const handleContinue = () => {
    if (!selectedCategory) return;
    // The seller mode is saved by CreateShop once the store exists.
    navigation.navigate(ROUTES.CREATE_SHOP, {
      category: selectedCategory,
      fromSettings: route.params?.fromSettings,
      preference: 'shop',
    });
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: insets.top }} />
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              {navigation.canGoBack() ? (
                <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
                  <Icon name="chevron-back" size={22} color={colors.onGradient} />
                </Pressable>
              ) : null}
              <View style={styles.headerBadge}>
                <Icon name="storefront" size={12} color={colors.onGradient} />
                <Text style={styles.headerBadgeText}>NEW STORE</Text>
              </View>
            </View>
            <Text style={styles.headerStep}>Step 1 of 2</Text>
          </View>
          <Text style={styles.title}>What does your shop sell?</Text>
          <Text style={styles.subtitle}>Pick the closest match. Buyers browse stores by this category on Explore.</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressSeg, styles.progressSegDone]} />
            <View style={styles.progressSeg} />
          </View>
          <View style={styles.stepRow}>
            <View style={styles.step}>
              <Icon name={selectedCategory ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={colors.onGradient} />
              <Text style={[styles.stepText, styles.stepTextDone]}>Category</Text>
            </View>
            <View style={styles.step}>
              <Icon name="ellipse-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.stepText}>Shop details</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.searchCard}>
          <Icon name="search" size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories, e.g. pharmacy"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Icon name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <VoiceSearchToggle size={30} />
        </View>

        {visible.length ? (
          <View style={styles.grid}>
            {visible.map((cat, index) => {
              const active = selectedCategory === cat.label;
              const tint = cat.tint || cat.color || colors.primary;
              return (
                <PressableScale
                  key={cat.label}
                  entering={enterUp(Math.min(index, 8))}
                  scaleTo={0.96}
                  style={{ width: cardWidth }}
                  contentStyle={[
                    styles.card,
                    active && { borderColor: tint, backgroundColor: `${tint}12` },
                  ]}
                  onPress={() => setSelectedCategory(cat.label)}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.cardIcon, { backgroundColor: active ? tint : `${tint}1F` }]}>
                      {cat.imageUrl ? (
                        <Image source={{ uri: cat.imageUrl }} style={styles.cardImage} />
                      ) : (
                        <Icon name={cat.icon || 'pricetag-outline'} size={22} color={active ? '#FFFFFF' : tint} />
                      )}
                    </View>
                    <View style={[styles.radio, active && { borderColor: tint, backgroundColor: tint }]}>
                      {active ? <Icon name="checkmark" size={11} color="#FFFFFF" /> : null}
                    </View>
                  </View>
                  <Text style={[styles.cardTitle, active && { color: tint }]} numberOfLines={2}>
                    {cat.label}
                  </Text>
                  {cat.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{cat.description}</Text>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="search" size={22} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No category matches “{query.trim()}”</Text>
            <Text style={styles.emptyText}>Try a shorter word, or pick the closest category from the list.</Text>
            <Pressable onPress={() => setQuery('')} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Show all categories</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.noteCard}>
          <Icon name="information-circle" size={20} color={colors.info} />
          <Text style={styles.noteText}>Not an exact fit? Choose the closest one. You can still post any product in your store.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {selectedMeta ? (
          <View style={styles.footerPicked}>
            <Icon name="checkmark-circle" size={14} color={selectedMeta.tint || colors.primary} />
            <Text style={styles.footerPickedText} numberOfLines={1}>{selectedMeta.label}</Text>
          </View>
        ) : null}
        <GradientButton
          title={selectedCategory ? 'Continue to shop details' : 'Pick a category'}
          icon={selectedCategory ? 'arrow-forward' : undefined}
          disabled={!selectedCategory}
          onPress={handleContinue}
        />
      </View>
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  header: {
    marginHorizontal: -16,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  headerBadgeText: { fontSize: 11.5, fontWeight: '800', color: colors.onGradient, letterSpacing: 0.3 },
  headerStep: { fontSize: 13, fontWeight: '800', color: colors.onGradient },
  title: { fontSize: 25, fontWeight: '800', color: colors.onGradient },
  subtitle: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: 'rgba(255,255,255,0.86)' },
  progressTrack: { flexDirection: 'row', gap: 5, marginTop: 16 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  progressSegDone: { backgroundColor: colors.onGradient },
  stepRow: { flexDirection: 'row', gap: 12, marginTop: 9 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  stepTextDone: { color: colors.onGradient },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    minHeight: 132,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: { width: 28, height: 28, borderRadius: 7 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  cardDesc: { marginTop: 3, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: 'center' },
  emptyText: { marginTop: 4, fontSize: 12.5, lineHeight: 18, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: `${colors.primary}1A`,
  },
  emptyBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${colors.info}14`,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerPicked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footerPickedText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
});
