import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import Reanimated, {
  Easing as SlideEasing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ActivityIndicator,
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
import { VoiceSearchToggle, useVoiceSearchBox } from '../components/VoiceHost';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useCategories } from '../utils/categories';
import { resolveMediaUrl } from '../utils/listing';
import { getExploreMemory, getHomeListingsMemory, loadHomeListingsCache } from '../utils/homeListingsCache';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const COLS = 4;
const H_PAD = 16;
const GUTTER = 8;
const POPULAR_COUNT = 4;
const TOP_SELLERS = 8;
const SHOP_TINT = '#3B82F6';
const PERSON_TINT = '#10B981';
const VERIFIED_TINT = '#8B5CF6';

const TABS = [
  { key: 'products', label: 'Products', icon: 'cube-outline' },
  { key: 'sellers', label: 'Sellers', icon: 'storefront-outline' },
];

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

function initials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isShop(seller) {
  return seller?.sellerType === 'shop' || Boolean(seller?.shopId);
}

const TAB_SLIDE = { duration: 240, easing: SlideEasing.bezier(0.22, 1, 0.36, 1) };

function SlidingTabs({ value, onChange, styles, colors }) {
  const [tabWidth, setTabWidth] = useState(0);
  const offset = useSharedValue(0);
  const indexOf = (key) => Math.max(0, TABS.findIndex((t) => t.key === key));

  useEffect(() => {
    if (tabWidth) offset.value = withTiming(indexOf(value) * tabWidth, TAB_SLIDE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tabWidth]);

  const sliderStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onLayout = (event) => {
    const next = Math.max(0, (event.nativeEvent.layout.width - 2 - 8) / TABS.length);
    offset.value = indexOf(value) * next;
    setTabWidth(next);
  };

  return (
    <View style={styles.tabsTrack} onLayout={onLayout}>
      {tabWidth ? (
        <Reanimated.View pointerEvents="none" style={[styles.tabSlider, { width: tabWidth }, sliderStyle]} />
      ) : null}
      {TABS.map((item) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            style={[styles.tabBtn, active && !tabWidth && styles.tabBtnActive]}
            onPress={() => active || onChange(item.key)}
          >
            <Icon name={item.icon} size={14} color={active ? colors.onPrimary : colors.textMuted} />
            <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
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
        <Icon name={item.icon} size={iconSize} color={solid ? '#FFFFFF' : tint} />
      )}
    </View>
  );
}

function Avatar({ name, url, size, shop, styles }) {
  const uri = resolveMediaUrl(url || '');
  const tint = shop ? SHOP_TINT : PERSON_TINT;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: shop ? size * 0.3 : size / 2, backgroundColor: `${tint}26` },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.iconImage} />
      ) : (
        <Text style={[styles.avatarText, { color: tint, fontSize: size * 0.36 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

function Faces({ faces, styles }) {
  return (
    <View style={styles.faces}>
      {faces.map((face, index) => (
        <View key={`${face.name}-${index}`} style={[styles.faceRing, index > 0 && styles.faceOverlap, { zIndex: 3 - index }]}>
          <Avatar name={face.name} url={face.avatarUrl} size={24} shop={face.type === 'shop'} styles={styles} />
        </View>
      ))}
    </View>
  );
}

function SellerRow({ seller, category, onPress, styles }) {
  const shop = isShop(seller);
  const tint = shop ? SHOP_TINT : PERSON_TINT;
  const items = Number(seller.listingCount) || 0;
  const meta = [
    `${items} item${items === 1 ? '' : 's'}${category ? ` in ${category}` : ''}`,
    seller.distance != null ? `${seller.distance} km` : '',
    seller.location || '',
  ].filter(Boolean);
  return (
    <Pressable style={({ pressed }) => [styles.sellerRow, pressed && styles.pressed]} onPress={onPress}>
      <View>
        <Avatar name={seller.name} url={seller.avatarUrl} size={46} shop={shop} styles={styles} />
        {seller.verificationKind === 'business' ? (
          <View style={styles.verifiedDot}>
            <Icon name="checkmark" size={10} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <View style={styles.sellerCopy}>
        <View style={styles.sellerNameRow}>
          <Text style={styles.sellerName} numberOfLines={1}>{seller.name}</Text>
          <View style={[styles.typePill, { backgroundColor: `${tint}1F` }]}>
            <Icon name={shop ? 'storefront' : 'person'} size={10} color={tint} />
            <Text style={[styles.typePillText, { color: tint }]}>{shop ? 'Shop' : 'Individual'}</Text>
          </View>
        </View>
        {shop && seller.rating > 0 ? (
          <View style={styles.ratingRow}>
            <Icon name="star" size={11} color="#F59E0B" />
            <Text style={styles.ratingText}>
              {seller.rating.toFixed(1)} ({seller.reviewsCount || 0})
            </Text>
          </View>
        ) : null}
        <Text style={styles.sellerMeta} numberOfLines={1}>{meta.join(' · ')}</Text>
      </View>
      <View style={[styles.rowChevron, { backgroundColor: `${tint}14` }]}>
        <Icon name="chevron-forward" size={15} color={tint} />
      </View>
    </Pressable>
  );
}

export default function AllCategoriesScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [tab, setTab] = useState(route?.params?.tab === 'sellers' ? 'sellers' : 'products');
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState(seedCounts);
  const [sellerStats, setSellerStats] = useState(null);
  const [topSellers, setTopSellers] = useState([]);
  const coordsRef = useRef({});
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
    api.getCategoryCounts().then(({ data }) => {
      if (!cancelled && data?.counts) setCounts(data.counts);
    });
    api.getSellerCategoryCounts().then(({ data }) => {
      if (!cancelled && data?.categories) setSellerStats(data);
    });
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const last = await Location.getLastKnownPositionAsync();
          if (last?.coords) coordsRef.current = { lat: last.coords.latitude, lng: last.coords.longitude };
        }
      } catch (_) {
        /* distance is optional */
      }
      const { data } = await api.getPopularSellers(coordsRef.current);
      if (!cancelled && Array.isArray(data?.sellers)) setTopSellers(data.sellers.slice(0, TOP_SELLERS));
    })();
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

  const sellerCategories = useMemo(() => {
    const byName = sellerStats?.categories || {};
    const known = new Map(categories.map((c) => [c.label, c]));
    return Object.entries(byName)
      .filter(([, info]) => info.sellers > 0)
      .map(([label, info]) => {
        const preset = known.get(label);
        return {
          label,
          icon: preset?.icon || 'pricetag-outline',
          imageUrl: preset?.imageUrl || '',
          tint: preset?.tint || colors?.primary,
          ...info,
        };
      })
      .sort((a, b) => b.sellers - a.sellers);
  }, [sellerStats, categories, colors]);

  const storeTypes = useMemo(
    () =>
      shopCatalog.map((category) => ({
        ...category,
        tint: category.tint || category.color || colors?.primary,
        shops: sellerStats?.storeTypes?.[category.label] || 0,
      })).sort((a, b) => b.shops - a.shops),
    [shopCatalog, sellerStats, colors]
  );

  const matchesQuery = useVoiceSearchBox({
    label: tab === 'products' ? 'Product category names' : 'Seller and store category names',
    value: query,
    onChange: setQuery,
  });
  const needle = query.trim().toLowerCase();
  const matches = (item) => matchesQuery(item.label, item.description);

  const filtered = categories.filter((c) => c.count > 0 && matches(c)).sort((a, b) => b.count - a.count);
  const filteredSellerCats = sellerCategories.filter(matches);
  const filteredStores = storeTypes.filter((s) => s.shops > 0 && matches(s));
  const popular = needle
    ? []
    : [...categories].filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, POPULAR_COUNT);
  const totalItems = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const activeCount = categories.filter((c) => c.count > 0).length;
  const totals = sellerStats?.totals;
  if (!colors) {
    return null;
  }

  const tileWidth = Math.floor((windowWidth - H_PAD * 2 - GUTTER * (COLS - 1)) / COLS);
  const halfWidth = Math.floor((windowWidth - H_PAD * 2 - GUTTER) / 2);

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

  const openSeller = (seller) => {
    if (isShop(seller)) {
      navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: seller.shopId || seller._id || seller.id });
      return;
    }
    navigation.navigate(ROUTES.SELLER_PROFILE, { seller, sellerId: seller._id || seller.id || seller.userId });
  };

  const headerSub =
    tab === 'products'
      ? `${activeCount} categories · ${totalItems} items`
      : totals
        ? `${totals.sellers} sellers · ${totals.shops} shops · ${sellerCategories.length} categories`
        : 'Find sellers by what they sell';

  const renderProducts = () => (
    <>
      {popular.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: `${colors.danger}1F` }]}>
              <Icon name="flame" size={14} color={colors.danger} />
            </View>
            <Text style={styles.sectionTitle}>Popular near you</Text>
          </View>
          <View style={styles.popularGrid}>
            {popular.map((item, index) => (
              <PressScale key={item.label} style={{ width: halfWidth }} onPress={() => openProducts(item.label)}>
                <LinearGradient
                  colors={[`${item.tint}33`, `${item.tint}0D`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.popularCard, { borderColor: `${item.tint}40` }]}
                >
                  <CategoryIcon item={item} size={34} iconSize={17} styles={styles} solid />
                  <View style={styles.flex1}>
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
            <Icon name="grid" size={13} color={colors.primary} />
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
                  <View style={[styles.tileCount, { backgroundColor: `${item.tint}1F` }]}>
                    <Text style={[styles.tileCountText, { color: item.tint }]}>{item.count}</Text>
                  </View>
                </View>
              </PressScale>
            ))}
          </View>
        ) : (
          <Text style={styles.noMatch}>
            {needle ? `No category with items matches “${query.trim()}”.` : 'No items posted yet.'}
          </Text>
        )}
      </View>

      {!needle ? (
        <Pressable style={({ pressed }) => [styles.switchCard, pressed && styles.pressed]} onPress={() => setTab('sellers')}>
          <View style={[styles.switchIcon, { backgroundColor: `${SHOP_TINT}1F` }]}>
            <Icon name="people" size={18} color={SHOP_TINT} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.switchTitle}>Looking for a seller instead?</Text>
            <Text style={styles.switchBody}>Find shops and people by the category they sell in.</Text>
          </View>
          <Icon name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {needle && filtered.length === 0 ? (
        <EmptyState
          compact
          icon="search-outline"
          title="No categories found"
          body="Try a different word, or search all products instead."
          buttonLabel="Search products"
          onButtonPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS, { query: query.trim() })}
        />
      ) : null}
    </>
  );

  const renderSellers = () => (
    <>
      {totals && !needle ? (
        <View style={styles.statsCard}>
          {[
            { key: 'sellers', icon: 'people', tint: colors.primary, value: totals.sellers, label: 'Sellers' },
            { key: 'shops', icon: 'storefront', tint: SHOP_TINT, value: totals.shops, label: 'Shops' },
            { key: 'people', icon: 'person', tint: PERSON_TINT, value: totals.individuals, label: 'Individuals' },
            { key: 'verified', icon: 'shield-checkmark', tint: VERIFIED_TINT, value: totals.verified, label: 'Verified' },
          ].map((stat) => (
            <View key={stat.key} style={styles.stat}>
              <View style={[styles.statIcon, { backgroundColor: `${stat.tint}1F` }]}>
                <Icon name={stat.icon} size={15} color={stat.tint} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{stat.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: `${SHOP_TINT}1F` }]}>
            <Icon name="people" size={13} color={SHOP_TINT} />
          </View>
          <Text style={styles.sectionTitle}>{needle ? 'Matching categories' : 'Find sellers by category'}</Text>
          <Text style={styles.sectionMeta}>{filteredSellerCats.length}</Text>
        </View>
        {!sellerStats ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : filteredSellerCats.length > 0 ? (
          <View style={styles.grid}>
            {filteredSellerCats.map((item) => (
              <PressScale key={item.label} style={{ width: halfWidth }} onPress={() => openStores(item.label)}>
                <View style={styles.sellerCat}>
                  <View style={styles.sellerCatTop}>
                    <CategoryIcon item={item} size={36} iconSize={18} styles={styles} />
                    <Faces faces={item.faces || []} styles={styles} />
                  </View>
                  <Text style={styles.sellerCatName} numberOfLines={1}>{item.label}</Text>
                  <Text style={[styles.sellerCatCount, { color: item.tint }]}>
                    {item.sellers} seller{item.sellers === 1 ? '' : 's'}
                  </Text>
                  <View style={styles.sellerCatSplit}>
                    {item.shops > 0 ? (
                      <View style={styles.splitItem}>
                        <Icon name="storefront" size={10} color={SHOP_TINT} />
                        <Text style={styles.splitText}>{item.shops}</Text>
                      </View>
                    ) : null}
                    {item.individuals > 0 ? (
                      <View style={styles.splitItem}>
                        <Icon name="person" size={10} color={PERSON_TINT} />
                        <Text style={styles.splitText}>{item.individuals}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.cardArrow, { backgroundColor: `${item.tint}1F` }]}>
                    <Icon name="arrow-forward" size={12} color={item.tint} />
                  </View>
                </View>
              </PressScale>
            ))}
          </View>
        ) : (
          <Text style={styles.noMatch}>
            {needle ? `No sellers in a category matching “${query.trim()}”.` : 'No sellers yet.'}
          </Text>
        )}
      </View>

      {!needle && topSellers.length ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#F59E0B1F' }]}>
              <Icon name="trophy" size={13} color="#F59E0B" />
            </View>
            <Text style={styles.sectionTitle}>Top sellers</Text>
          </View>
          <View style={styles.listCard}>
            {topSellers.map((seller, index) => (
              <View key={String(seller._id || seller.id)}>
                {index > 0 ? <View style={styles.rowDivider} /> : null}
                <SellerRow seller={seller} onPress={() => openSeller(seller)} styles={styles} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {filteredStores.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: `${colors.info}1F` }]}>
              <Icon name="storefront" size={13} color={colors.info} />
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
                <CategoryIcon item={item} size={32} iconSize={16} styles={styles} />
                <View style={styles.flex1}>
                  <Text style={styles.storeName} numberOfLines={1}>{item.label}</Text>
                  {item.description ? (
                    <Text style={styles.storeDesc} numberOfLines={1}>{item.description}</Text>
                  ) : null}
                </View>
                <View style={[styles.storeCount, { backgroundColor: `${item.tint}1F` }]}>
                  <Text style={[styles.tileCountText, { color: item.tint }]}>
                    {item.shops} shop{item.shops === 1 ? '' : 's'}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {needle && filteredSellerCats.length === 0 && filteredStores.length === 0 ? (
        <EmptyState
          compact
          icon="search-outline"
          title="No sellers found"
          body="Try a different word, or search sellers by name."
          buttonLabel="Search sellers"
          onButtonPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS, { query: query.trim() })}
        />
      ) : null}
    </>
  );

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
            <Icon name="arrow-back" size={20} color={colors.onGradient} />
          </Pressable>
          <View style={styles.flex1}>
            <Text style={styles.headerTitle}>All categories</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{headerSub}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS)} style={styles.headerBtn} hitSlop={10}>
            <Icon name="search" size={19} color={colors.onGradient} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.searchWrap}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'products' ? 'Find a category…' : 'Find sellers by category…'}
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
        <VoiceSearchToggle size={30} />
      </View>

      <SlidingTabs value={tab} onChange={setTab} styles={styles} colors={colors} />

      <Animated.View
        style={[
          styles.flex1,
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
          <Reanimated.View key={tab} entering={FadeIn.duration(220)}>
            {tab === 'products' ? renderProducts() : renderSellers()}
          </Reanimated.View>
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
  flex1: { flex: 1 },
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
  tabsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginHorizontal: H_PAD,
    padding: 4,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabBtnActive: { backgroundColor: '#059669' },
  tabSlider: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  tabBtnTextActive: { color: '#fff' },
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
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${SHOP_TINT}33`,
    backgroundColor: `${SHOP_TINT}0F`,
  },
  switchIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  switchBody: { marginTop: 2, fontSize: 12, color: colors.textMuted },

  statsCard: {
    flexDirection: 'row',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stat: { flex: 1, alignItems: 'center' },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { marginTop: 6, fontSize: 17, fontWeight: '900', color: colors.text },
  statLabel: { marginTop: 1, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  loadingBox: { paddingVertical: 24, alignItems: 'center' },

  sellerCat: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sellerCatTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sellerCatName: { marginTop: 10, fontSize: 13.5, fontWeight: '800', color: colors.text },
  sellerCatCount: { marginTop: 2, fontSize: 12, fontWeight: '800' },
  sellerCatSplit: { flexDirection: 'row', gap: 10, marginTop: 6 },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  splitText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  cardArrow: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faces: { flexDirection: 'row' },
  faceRing: { borderRadius: 14, borderWidth: 2, borderColor: colors.surface },
  faceOverlap: { marginLeft: -9 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontWeight: '900' },

  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  rowDivider: { height: 1, marginLeft: 70, backgroundColor: colors.border },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  verifiedDot: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: VERIFIED_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerCopy: { flex: 1 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sellerName: { flexShrink: 1, fontSize: 14.5, fontWeight: '800', color: colors.text },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 7,
  },
  typePillText: { fontSize: 10, fontWeight: '800' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
  sellerMeta: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  rowChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  storeCount: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  storeRowLast: {
    borderBottomWidth: 0,
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
