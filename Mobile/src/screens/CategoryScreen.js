import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSharedTransition } from '../context/SharedTransitionContext';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { attachDistanceToCard, toCardItem } from '../utils/listing';
import EmptyState from '../components/EmptyState';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useCategories, mergeSidebarCategories } from '../utils/categories';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const SIDEBAR_WIDTH = 92;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;

export default function CategoryScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();
  const initialCategory = route?.params?.category;
  const productCategories = useCategories('product');
  const shopCategories = useCategories('shop');

  const [allListings, setAllListings] = useState([]);
  const [allStores, setAllStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeTab, setActiveTab] = useState('products');
  const paneAnim = useRef(new Animated.Value(0)).current;
  const cardAnims = useRef(new Map()).current;
  const sidebarItemAnims = useRef(new Map()).current;

  const triggerPaneAnim = useCallback(() => {
    paneAnim.stopAnimation();
    paneAnim.setValue(0);
    Animated.timing(paneAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [paneAnim]);

  const getCardAnim = useCallback((id) => {
    if (!cardAnims.has(id)) {
      cardAnims.set(id, new Animated.Value(1));
    }
    return cardAnims.get(id);
  }, [cardAnims]);

  const getSidebarItemAnim = useCallback((label) => {
    if (!sidebarItemAnims.has(label)) {
      sidebarItemAnims.set(label, new Animated.Value(1));
    }
    return sidebarItemAnims.get(label);
  }, [sidebarItemAnims]);

  const triggerCardsAnim = useCallback((itemIds) => {
    const toClean = [];
    for (const [id, val] of cardAnims.entries()) {
      if (!itemIds.includes(id)) toClean.push(id);
      else val.stopAnimation();
    }
    for (const id of toClean) cardAnims.delete(id);

    Animated.stagger(35,
      itemIds.map((id, i) => {
        const anim = getCardAnim(id);
        anim.setValue(0);
        return Animated.timing(anim, {
          toValue: 1,
          duration: 260 + Math.min(i * 10, 120),
          easing: Easing.out(Easing.back(1.15)),
          useNativeDriver: true,
        });
      })
    ).start();
  }, [cardAnims, getCardAnim]);

  const handleCategoryChange = useCallback((label) => {
    setActiveCategory((curr) => {
      if (curr === label) return curr;
      return label;
    });
  }, []);

  useEffect(() => {
    if (activeCategory == null || loading) return;
    triggerPaneAnim();
    const ids = items.map((it) => it.id);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    triggerCardsAnim(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, loading]);

  const loadData = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true);
    let coords = { lat: null, lng: null };
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }).catch(() => null);
        if (loc?.coords) {
          coords = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          };
        }
      }
    } catch (e) {
      // ignore
    }

    const locParams =
      coords.lat != null && coords.lng != null
        ? { lat: coords.lat, lng: coords.lng, page: 1, limit: 40 }
        : { page: 1, limit: 40 };

    const { data: listingsData, error: listingsError } = await api.getListings(locParams);
    if (listingsError) {
      console.error('Failed to load listings:', listingsError);
      setAllListings([]);
    } else {
      const raw = (listingsData?.listings || []).map(toCardItem).filter(Boolean);
      const withDistance = raw.map((it) => attachDistanceToCard(it, coords, user?.id));
      setAllListings(withDistance);
    }

    const { data: storesData, error: storesError } = await api.getAllShops(locParams);
    if (storesError) {
      console.error('Failed to load stores:', storesError);
      setAllStores([]);
    } else {
      setAllStores(storesData?.shops || []);
    }

    setLoading(false);
  }, [user?.id]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadData({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const categories = useMemo(() => {
    // Always add "All" option at the top
    const allOption = { 
      label: 'All', 
      icon: activeTab === 'products' ? 'grid-outline' : 'storefront-outline', 
      tint: '#F59E0B',
      count: activeTab === 'products' ? allListings.length : allStores.length
    };

    if (activeTab === 'products') {
      const found = {};
      for (const it of allListings) {
        const name = it.category || it.listing?.category;
        if (name) found[name] = (found[name] || 0) + 1;
      }
      return mergeSidebarCategories(productCategories, found, allOption);
    }

    const found = {};
    for (const store of allStores) {
      const name = store.category;
      if (name) found[name] = (found[name] || 0) + 1;
    }
    return mergeSidebarCategories(shopCategories, found, allOption);
  }, [allListings, allStores, activeTab, productCategories, shopCategories]);

  useEffect(() => {
    if (activeCategory != null) return;
    if (initialCategory && categories.find((c) => c.label === initialCategory)) {
      setActiveCategory(initialCategory);
    } else if (categories.length > 0) {
      setActiveCategory('All');
    }
  }, [categories, initialCategory, activeCategory]);

  const items = useMemo(() => {
    if (!activeCategory) return [];
    if (activeTab === 'products') {
      if (activeCategory === 'All') return allListings;
      return allListings.filter(
        (it) => (it.category || it.listing?.category) === activeCategory
      );
    } else {
      if (activeCategory === 'All') return allStores;
      return allStores.filter(
        (store) => store.category === activeCategory
      );
    }
  }, [allListings, allStores, activeCategory, activeTab]);

  // Debug logging
  useEffect(() => {
    console.log('CategoryScreen Debug:', {
      activeCategory,
      activeTab,
      allListingsLength: allListings.length,
      allStoresLength: allStores.length,
      itemsLength: items.length,
      categoriesLength: categories.length
    });
  }, [activeCategory, activeTab, allListings.length, allStores.length, items.length, categories.length]);

  const activeMeta = categories.find((c) => c.label === activeCategory);
  const paneWidth = Math.max(windowWidth - SIDEBAR_WIDTH, 160);
  const cardWidth = Math.floor((paneWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2);
  const photoHeight = Math.round(cardWidth * 0.85);

  const { tryBeginNavigation } = useSharedTransition();

  const openItem = (item) =>
    tryBeginNavigation(item.id, () =>
      openItemDetail(navigation, { listingId: item.id, item: item.listing, sharedId: item.id })
    );

  if (!colors) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primary }]} edges={['top']}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <Pressable
          style={styles.backBtn}
          hitSlop={10}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={colors.onGradient} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeMeta?.label || 'Categories'}
        </Text>
        <Pressable
          style={styles.searchBtn}
          hitSlop={10}
          onPress={() =>
            navigation.navigate(ROUTES.SEARCH_RESULTS, {
              category: activeCategory,
            })
          }
        >
          <Ionicons name="search" size={20} color={colors.onGradient} />
        </Pressable>
      </View>

      <View style={styles.tabsContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'products' && styles.tabActive]}
          onPress={() => setActiveTab('products')}
        >
          <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>
            Products
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'stores' && styles.tabActive]}
          onPress={() => setActiveTab('stores')}
        >
          <Text style={[styles.tabText, activeTab === 'stores' && styles.tabTextActive]}>
            Sellers & Stores
          </Text>
        </Pressable>
      </View>

      <View style={[styles.splitWrap, { backgroundColor: colors.background }]}>
          <View style={styles.split}>
            <View style={[styles.sidebar, { backgroundColor: colors.iconBackground }]}>
              <ScrollView
                contentContainerStyle={styles.sidebarContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {categories.map((cat) => {
                  const isActive = cat.label === activeCategory;
                  const itemAnim = getSidebarItemAnim(cat.label);
                  return (
                    <Animated.View key={cat.label} style={{ transform: [{ scale: itemAnim }] }}>
                      <Pressable
                        style={[
                          styles.sideItem,
                          isActive && { backgroundColor: colors.background },
                        ]}
                        onPress={() => {
                          // Micro-animation for press
                          Animated.sequence([
                            Animated.timing(itemAnim, {
                              toValue: 0.95,
                              duration: 50,
                              useNativeDriver: true,
                            }),
                            Animated.timing(itemAnim, {
                              toValue: 1,
                              duration: 150,
                              useNativeDriver: true,
                            }),
                          ]).start();
                          handleCategoryChange(cat.label);
                        }}
                      >
                        {isActive && (
                          <View
                            style={[styles.sideIndicator, { backgroundColor: colors.primary }]}
                          />
                        )}
                        <View
                          style={[
                            styles.sideIcon,
                            {
                              backgroundColor: isActive
                                ? `${cat.tint}1F`
                                : colors.surface,
                            },
                          ]}
                        >
                          {cat.imageUrl ? (
                            <Image source={{ uri: cat.imageUrl }} style={{ width: 18, height: 18, borderRadius: 4 }} />
                          ) : (
                            <Ionicons
                              name={cat.icon}
                              size={18}
                              color={isActive ? cat.tint : colors.textMuted}
                            />
                          )}
                        </View>
                        <Text
                          numberOfLines={2}
                          style={[
                            styles.sideLabel,
                            isActive && {
                              color: colors.text,
                              fontWeight: '800',
                            },
                          ]}
                        >
                          {cat.label}
                        </Text>
                        <Text style={styles.sideCount}>
                          {cat.count || 0}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>

            <Animated.View
              style={[
                styles.itemsPane,
                {
                  backgroundColor: colors.surface,
                  opacity: paneAnim,
                  transform: [
                    {
                      translateY: paneAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [14, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.itemsHeader}>
                <Text style={styles.itemsHeaderTitle} numberOfLines={1}>
                  {activeMeta?.label || 'Items'}
                </Text>
                <View style={styles.itemsBadge}>
                  <Text style={styles.itemsBadgeText}>{items.length}</Text>
                </View>
              </View>

              {items.length === 0 ? (
                <ScrollView
                  contentContainerStyle={{ flexGrow: 1 }}
                  showsVerticalScrollIndicator={false}
                  refreshControl={refreshControl(colors, refreshing, onRefresh)}
                >
                  <EmptyState
                    compact
                    icon={activeTab === 'products' ? 'cube-outline' : 'storefront-outline'}
                    title={activeTab === 'products' ? 'No items yet' : 'No stores yet'}
                    body={activeTab === 'products' ? 'Nothing in this category right now. Check back after sellers post.' : 'No stores in this category right now.'}
                  />
                </ScrollView>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.itemsGridWrap}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  refreshControl={refreshControl(colors, refreshing, onRefresh)}
                >
                  {activeTab === 'products' ? (
                    <View style={styles.itemsGrid}>
                      {items.map((it) => {
                        const a = getCardAnim(it.id);
                        return (
                          <Animated.View
                            key={it.id}
                            style={{
                              opacity: a,
                              transform: [
                                {
                                  translateY: a.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [18, 0],
                                  }),
                                },
                                {
                                  scale: a.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.94, 1],
                                  }),
                                },
                              ],
                            }}
                          >
                            <Pressable
                              style={[
                                styles.itemCard,
                                {
                                  width: cardWidth,
                                  backgroundColor: colors.surface,
                                  marginBottom: GRID_GUTTER,
                                },
                              ]}
                              onPress={() => openItem(it)}
                            >
                          <View
                            style={[
                              styles.itemPhoto,
                              {
                                height: photoHeight,
                                backgroundColor: colors.iconBackground,
                              },
                            ]}
                          >
                            {it.photo ? (
                              <Image
                                source={{ uri: it.photo }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                                sharedTransitionTag={`item.${it.id}.photo`}
                              />
                            ) : (
                              <Ionicons
                                name={it.icon || 'cube-outline'}
                                size={28}
                                color={colors.textMuted}
                                sharedTransitionTag={`item.${it.id}.photo`}
                              />
                            )}
                          </View>
                          <View style={styles.itemBody}>
                            <Text numberOfLines={2} style={styles.itemTitle} sharedTransitionTag={`item.${it.id}.title`}>
                              {it.title}
                            </Text>
                            <Text numberOfLines={1} style={styles.itemPrice} sharedTransitionTag={`item.${it.id}.price`}>
                              {it.price}
                            </Text>
                            <View style={styles.itemMeta}>
                              {it.distanceLabel ? (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons
                                    name="navigate"
                                    size={9}
                                    color={colors.textMuted}
                                  />
                                  <Text numberOfLines={1} style={styles.itemMetaText}>
                                    {it.distanceLabel}
                                  </Text>
                                </View>
                              ) : null}
                              {it.views != null && Number(it.views) >= 0 ? (
                                <View style={styles.itemMetaItem}>
                                  <Ionicons
                                    name="eye"
                                    size={9}
                                    color={colors.textMuted}
                                  />
                                  <Text numberOfLines={1} style={styles.itemMetaText}>
                                    {it.views >= 1000
                                      ? `${(it.views / 1000).toFixed(1)}k`
                                      : it.views}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.storesList}>
                      {items.map((store) => {
                        const a = getCardAnim(store._id);
                        return (
                          <Animated.View
                            key={store._id}
                            style={{
                              opacity: a,
                              transform: [
                                {
                                  translateY: a.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [18, 0],
                                  }),
                                },
                              ],
                            }}
                          >
                            <Pressable
                              style={styles.storeCard}
                              onPress={() =>
                                navigation.navigate(ROUTES.SHOP_PROFILE, {
                                  shopId: store._id || store.id,
                                })
                              }
                            >
                              <View style={styles.storeHeader}>
                                <View style={styles.storeAvatar}>
                                  {store.logo || store.avatarUrl ? (
                                    <Image
                                      source={{ uri: store.logo || store.avatarUrl }}
                                      style={{ width: '100%', height: '100%' }}
                                      resizeMode="cover"
                                    />
                                  ) : (
                                    <Ionicons name="storefront" size={24} color={colors.primary} />
                                  )}
                                </View>
                                <View style={styles.storeInfo}>
                                  <Text style={styles.storeName} numberOfLines={1}>
                                    {store.name}
                                  </Text>
                                  <View style={styles.storeMeta}>
                                    <View style={styles.storeRating}>
                                      <Ionicons name="star" size={12} color="#F59E0B" />
                                      <Text style={styles.storeRatingText}>
                                        {Number(store.ratingAverage || store.rating || 0).toFixed(1)}
                                      </Text>
                                    </View>
                                    {store.location && (
                                      <Text style={styles.storeLocation} numberOfLines={1}>
                                        {store.location}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                              </View>
                              {store.description && (
                                <Text style={styles.storeDescription} numberOfLines={2}>
                                  {store.description}
                                </Text>
                              )}
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              )}
            </Animated.View>
          </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.onGradient,
    textAlign: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  splitWrap: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
  },
  sidebarContent: {
    paddingVertical: 6,
    paddingBottom: 24,
  },
  sideItem: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 4,
    minHeight: 90,
  },
  sideIndicator: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  sideIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 12,
  },
  sideCount: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  itemsPane: {
    flex: 1,
    flexDirection: 'column',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemsHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  itemsBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemsBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
  itemsEmptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  itemsEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  itemsEmptyTitle: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
  },
  storesList: {
    padding: 12,
    gap: 8,
  },
  storeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  storeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storeRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  storeLocation: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  storeDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  itemsEmptySub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  itemsGridWrap: {
    paddingBottom: 24,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingTop: GRID_PADDING,
    justifyContent: 'space-between',
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  itemPhoto: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    padding: 8,
    gap: 2,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 15,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.price,
    marginTop: 2,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  itemMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  itemMetaText: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
