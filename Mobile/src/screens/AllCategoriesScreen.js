import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useCategories } from '../utils/categories';
import { getExploreMemory, getHomeListingsMemory, loadHomeListingsCache } from '../utils/homeListingsCache';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const COLS = 4;
const H_PAD = 16;
const GUTTER = 8;
const POPULAR_COUNT = 4;

function countByCategory(listings) {
  const counts = {};
  for (const item of listings || []) {
    const name = item?.category || item?.listing?.category;
    if (name) counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

function seedCounts() {
  const home = getHomeListingsMemory()?.listings || [];
  const explore = getExploreMemory()?.products || [];
  return countByCategory(home.length >= explore.length ? home : explore);
}

function PressScale({ style, children, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, tension: 320, friction: 12 }).start();
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable onPress={onPress} onPressIn={() => animate(0.96)} onPressOut={() => animate(1)} unstable_pressDelay={60}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

function CategoryIcon({ item, size, iconSize, styles, solid }) {
  const tint = item.tint;
  return (
    <View
      style={[
        styles.iconBox,
        { width: size, height: size, borderRadius: size * 0.32, backgroundColor: solid ? tint : `${tint}1F` },
      ]}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.iconImage} />
      ) : (
        <Ionicons name={item.icon} size={iconSize} color={solid ? '#FFFFFF' : tint} />
      )}
    </View>
  );
}

export default function AllCategoriesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState(seedCounts);
  const productCatalog = useCategories('product');
  const shopCatalog = useCategories('shop');
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  useEffect(() => {
    let cancelled = false;
    if (!Object.keys(counts).length) {
      loadHomeListingsCache().then((cache) => {
        if (!cancelled && cache?.listings?.length) setCounts(countByCategory(cache.listings));
      });
    }
    api.getListings({ page: 1, limit: 100 }).then(({ data }) => {
      if (!cancelled && data?.listings?.length) setCounts(countByCategory(data.listings));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(
    () =>
      productCatalog.map((category) => ({
        ...category,
        tint: category.tint || category.color || colors?.primary,
        count: counts[category.label] || 0,
      })),
    [productCatalog, counts, colors]
  );

  const storeTypes = useMemo(
    () =>
      shopCatalog.map((category) => ({
        ...category,
        tint: category.tint || category.color || colors?.primary,
      })),
    [shopCatalog, colors]
  );

  const needle = query.trim().toLowerCase();
  const matches = (item) =>
    !needle ||
    item.label.toLowerCase().includes(needle) ||
    String(item.description || '').toLowerCase().includes(needle);

  const filtered = categories.filter(matches);
  const filteredStores = storeTypes.filter(matches);
  const popular = needle
    ? []
    : [...categories].filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, POPULAR_COUNT);
  const totalItems = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const activeCount = categories.filter((c) => c.count > 0).length;

  if (!colors) {
    return null;
  }

  const tileWidth = Math.floor((windowWidth - H_PAD * 2 - GUTTER * (COLS - 1)) / COLS);
  const popularWidth = Math.floor((windowWidth - H_PAD * 2 - GUTTER) / 2);

  const openProducts = (label) =>
    navigation.navigate(ROUTES.MAIN_TABS, {
      screen: ROUTES.EXPLORE,
      params: { tab: 'products', category: label, ts: Date.now() },
    });

  const openStores = (label) =>
    navigation.navigate(ROUTES.MAIN_TABS, {
      screen: ROUTES.EXPLORE,
      params: { tab: 'sellers', category: label, ts: Date.now() },
    });

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn} hitSlop={10}>
            <Ionicons name="arrow-back" size={20} color={colors.onGradient} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>All categories</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {categories.length} categories · {totalItems} items · {activeCount} active
            </Text>
          </View>
          <Pressable onPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS)} style={styles.headerBtn} hitSlop={10}>
            <Ionicons name="search" size={19} color={colors.onGradient} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Find a category…"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.body,
          {
            opacity: intro,
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {popular.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: `${colors.danger}1F` }]}>
                  <Ionicons name="flame" size={14} color={colors.danger} />
                </View>
                <Text style={styles.sectionTitle}>Popular near you</Text>
              </View>
              <View style={styles.popularGrid}>
                {popular.map((item, index) => (
                  <PressScale key={item.label} style={{ width: popularWidth }} onPress={() => openProducts(item.label)}>
                    <LinearGradient
                      colors={[`${item.tint}33`, `${item.tint}0D`]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.popularCard, { borderColor: `${item.tint}40` }]}
                    >
                      <CategoryIcon item={item} size={34} iconSize={17} styles={styles} solid />
                      <View style={styles.popularCopy}>
                        <Text style={styles.popularName} numberOfLines={1}>{item.label}</Text>
                        <Text style={[styles.popularCount, { color: item.tint }]}>
                          {item.count} item{item.count === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <View style={[styles.rankPill, { backgroundColor: item.tint }]}>
                        <Text style={styles.rankText}>#{index + 1}</Text>
                      </View>
                    </LinearGradient>
                  </PressScale>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: `${colors.primary}1F` }]}>
                <Ionicons name="grid" size={13} color={colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>{needle ? 'Matching categories' : 'Browse products'}</Text>
              <Text style={styles.sectionMeta}>{filtered.length}</Text>
            </View>
            {filtered.length > 0 ? (
              <View style={styles.grid}>
                {filtered.map((item) => (
                  <PressScale key={item.label} style={{ width: tileWidth }} onPress={() => openProducts(item.label)}>
                    <View style={styles.tile}>
                      <CategoryIcon item={item} size={38} iconSize={19} styles={styles} />
                      <Text style={styles.tileLabel} numberOfLines={2}>{item.label}</Text>
                      <View style={[styles.tileCount, item.count > 0 && { backgroundColor: `${item.tint}1F` }]}>
                        <Text style={[styles.tileCountText, item.count > 0 && { color: item.tint }]}>
                          {item.count > 0 ? item.count : 'New'}
                        </Text>
                      </View>
                    </View>
                  </PressScale>
                ))}
              </View>
            ) : (
              <Text style={styles.noMatch}>No product category matches “{query.trim()}”.</Text>
            )}
          </View>

          {filteredStores.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: `${colors.info}1F` }]}>
                  <Ionicons name="storefront" size={13} color={colors.info} />
                </View>
                <Text style={styles.sectionTitle}>Shop by store type</Text>
                <Text style={styles.sectionMeta}>{filteredStores.length}</Text>
              </View>
              <View style={styles.storeList}>
                {filteredStores.map((item, index) => (
                  <Pressable
                    key={item.label}
                    style={({ pressed }) => [
                      styles.storeRow,
                      index === filteredStores.length - 1 && styles.storeRowLast,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => openStores(item.label)}
                  >
                    <CategoryIcon item={item} size={30} iconSize={15} styles={styles} />
                    <View style={styles.storeCopy}>
                      <Text style={styles.storeName} numberOfLines={1}>{item.label}</Text>
                      {item.description ? (
                        <Text style={styles.storeDesc} numberOfLines={1}>{item.description}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {needle && filtered.length === 0 && filteredStores.length === 0 ? (
            <EmptyState
              compact
              icon="search-outline"
              title="No categories found"
              body="Try a different word, or search all products instead."
              buttonLabel="Search products"
              onButtonPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS, { query: query.trim() })}
            />
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 34,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.onGradient,
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -24,
    marginHorizontal: H_PAD,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: H_PAD,
    paddingTop: 4,
  },
  section: {
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.text,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
  },
  popularCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  popularCopy: {
    flex: 1,
  },
  rankPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  rankText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  popularName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  popularCount: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GUTTER,
  },
  tile: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 13,
    minHeight: 26,
  },
  tileCount: {
    marginTop: 4,
    minWidth: 24,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: colors.iconBackground,
  },
  tileCountText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  noMatch: {
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  storeList: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  storeRowLast: {
    borderBottomWidth: 0,
  },
  storeCopy: {
    flex: 1,
  },
  storeName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  storeDesc: {
    fontSize: 11,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});
