import { useCallback, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { VoiceSearchToggle, useVoiceSearchBox } from '../components/VoiceHost';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { navigateToTab, openItemDetail, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import { attachDistanceToCard, categoryIcon, formatPrice, resolveMediaUrl, thumbUrl } from '../utils/listing';
import { useDisplayCurrency } from '../utils/currency';
import { getHomePlace } from '../utils/homeListingsCache';
import LazyList, { LazyScrollProvider, useLazyScroll } from '../components/LazyList';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useWishlist } from '../context/WishlistContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const GRID_GAP = 10;
const GRID_IMAGE_RATIO = 0.82;

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'unavailable', label: 'Sold / gone' },
];

const SORT_OPTIONS = [
  { key: 'recent', label: 'Recently saved', icon: 'time-outline' },
  { key: 'oldest', label: 'Saved first', icon: 'hourglass-outline' },
  { key: 'priceLow', label: 'Price: low to high', icon: 'trending-up-outline' },
  { key: 'priceHigh', label: 'Price: high to low', icon: 'trending-down-outline' },
  { key: 'nearest', label: 'Nearest first', icon: 'navigate-outline' },
];

const SELLER_TYPES = [
  { key: 'all', label: 'Any seller' },
  { key: 'individual', label: 'Individuals' },
  { key: 'shop', label: 'Stores' },
];

function digits(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

// A voice search's order, as this screen's sort.
const VOICE_SORTS = { 'price-low': 'priceLow', 'price-high': 'priceHigh', nearby: 'nearest', newest: 'recent' };

function sortItems(items, sortBy) {
  const list = [...items];
  if (sortBy === 'oldest') return list.sort((a, b) => a.savedOrder - b.savedOrder);
  if (sortBy === 'priceLow') return list.sort((a, b) => a.priceValue - b.priceValue);
  if (sortBy === 'priceHigh') return list.sort((a, b) => b.priceValue - a.priceValue);
  if (sortBy === 'nearest') {
    return list.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }
  return list.sort((a, b) => b.savedOrder - a.savedOrder);
}

export default function WishlistScreen({ navigation }) {
  useDisplayCurrency();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { toggle, refresh } = useWishlist();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [category, setCategory] = useState('all');
  const [sellerType, setSellerType] = useState('all');
  const [condition, setCondition] = useState('all');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sheetOpen, setSheetOpen] = useState(false);

  const gridCardWidth = (windowWidth - 32 - GRID_GAP) / 2;

  const loadWishlist = useCallback(async () => {
    refresh();
    const { data, error } = await api.getWishlist();
    setLoaded(true);
    if (error) {
      console.error('Failed to load wishlist:', error);
      setItems([]);
      return;
    }
    const userCoords = getHomePlace()?.coords || null;
    setItems(
      (data?.listings || []).map((listing, index) => {
        const isShop = listing.sellerType === 'shop' || Boolean(listing.shopId?.name);
        return attachDistanceToCard(
          {
            id: listing.id,
            title: listing.title,
            priceValue: Number(listing.price) || 0,
            price: formatPrice(listing.price),
            category: listing.category || '',
            condition: listing.condition || '',
            location: listing.location || '',
            status: listing.status || 'active',
            isShop,
            sellerName: isShop ? listing.shopId?.name || listing.seller?.name : listing.seller?.name,
            sellerImage: resolveMediaUrl((isShop ? listing.shopId?.logo : listing.seller?.avatarUrl) || ''),
            verified: Boolean(listing.verified),
            featured: Boolean(listing.isFeatured),
            icon: categoryIcon(listing.category),
            photo: resolveMediaUrl(listing.photos?.[0] || ''),
            savedOrder: index,
            listing,
          },
          userCoords
        );
      })
    );
  }, [refresh]);

  const { refreshing, onRefresh } = usePullRefresh(loadWishlist);

  useFocusEffect(
    useCallback(() => {
      loadWishlist();
    }, [loadWishlist])
  );

  const removeItem = async (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await toggle(id);
  };

  const counts = useMemo(() => {
    const available = items.filter((item) => item.status === 'active').length;
    return { all: items.length, available, unavailable: items.length - available };
  }, [items]);

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    [items]
  );
  const conditions = useMemo(
    () => [...new Set(items.map((item) => item.condition).filter(Boolean))],
    [items]
  );
  const hasDistance = items.some((item) => item.distanceKm != null);

  const matchesQuery = useVoiceSearchBox({
    value: query,
    onChange: setQuery,
    onFilters: (search) => {
      setSortBy(VOICE_SORTS[search.sort] || 'recent');
      setCondition(search.condition || 'all');
      setMinPrice(search.minPrice ? String(search.minPrice) : '');
      setMaxPrice(search.maxPrice ? String(search.maxPrice) : '');
    },
  });

  const filtered = useMemo(() => {
    const min = Number(digits(minPrice)) || 0;
    const max = Number(digits(maxPrice)) || 0;
    const list = items.filter((item) => {
      if (status === 'available' && item.status !== 'active') return false;
      if (status === 'unavailable' && item.status === 'active') return false;
      if (category !== 'all' && item.category !== category) return false;
      if (condition !== 'all' && item.condition !== condition) return false;
      if (sellerType === 'shop' && !item.isShop) return false;
      if (sellerType === 'individual' && item.isShop) return false;
      if (min && item.priceValue < min) return false;
      if (max && item.priceValue > max) return false;
      return matchesQuery(item.title, item.category, item.location, item.sellerName);
    });
    return sortItems(list, sortBy);
  }, [items, matchesQuery, status, category, condition, sellerType, minPrice, maxPrice, sortBy]);

  const lazyScroll = useLazyScroll();

  const extraFilters =
    (sortBy !== 'recent' ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (condition !== 'all' ? 1 : 0) +
    (sellerType !== 'all' ? 1 : 0) +
    (digits(minPrice) || digits(maxPrice) ? 1 : 0);
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sortBy)?.label || 'Recently saved';

  const resetFilters = () => {
    setSortBy('recent');
    setCategory('all');
    setCondition('all');
    setSellerType('all');
    setMinPrice('');
    setMaxPrice('');
  };

  const openItem = (item) =>
    openItemDetail(navigation, { listingId: item.id, item: item.listing, sharedId: item.id });

  if (!colors) return null;

  const unavailableLabel = (item) => (item.status === 'sold' ? 'SOLD' : 'NOT AVAILABLE');

  const renderGridCard = (item) => {
    const gone = item.status !== 'active';
    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.gridCard, { width: gridCardWidth }, pressed && styles.pressed]}
        onPress={() => openItem(item)}
      >
        <View style={[styles.gridImageWrap, { height: Math.round(gridCardWidth * GRID_IMAGE_RATIO) }]}>
          {item.photo ? (
            <Image source={{ uri: thumbUrl(item.photo, 400) }} resizeMethod="resize" style={styles.fill} resizeMode="cover" />
          ) : (
            <View style={[styles.fill, styles.center]}>
              <Icon name={item.icon} size={34} color={colors.primary} />
            </View>
          )}
          {gone ? (
            <View style={styles.goneVeil}>
              <Text style={styles.goneVeilText}>{unavailableLabel(item)}</Text>
            </View>
          ) : null}
          {item.featured && !gone ? (
            <View style={styles.featuredTag}>
              <Icon name="flash" size={9} color={colors.white} />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          ) : null}
          <Pressable style={styles.heartBtn} hitSlop={8} onPress={() => removeItem(item.id)} accessibilityLabel="Remove from saved">
            <Icon name="heart" size={15} color={colors.danger} />
          </Pressable>
        </View>

        <View style={styles.gridBody}>
          <Text style={[styles.gridTitle, gone && styles.textGone]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.gridPrice, gone && styles.priceGone]}>{formatPrice(item.priceValue)}</Text>
          <View style={styles.gridMetaRow}>
            {item.condition ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.condition}</Text>
              </View>
            ) : null}
            {item.distanceLabel || item.location ? (
              <View style={styles.metaItem}>
                <Icon name={item.distanceLabel ? 'navigate-outline' : 'location-outline'} size={11} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.distanceLabel || item.location}
                </Text>
              </View>
            ) : null}
          </View>
          {item.sellerName ? (
            <View style={styles.sellerRow}>
              <View style={[styles.sellerAvatar, item.isShop && styles.sellerAvatarShop]}>
                {item.sellerImage ? (
                  <Image source={{ uri: thumbUrl(item.sellerImage, 200) }} resizeMethod="resize" style={styles.fill} />
                ) : (
                  <Icon name={item.isShop ? 'storefront' : 'person'} size={9} color={colors.textMuted} />
                )}
              </View>
              <Text style={styles.sellerName} numberOfLines={1}>{item.sellerName}</Text>
              {item.verified ? <Icon name="checkmark-circle" size={11} color={colors.info} /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderListCard = (item) => {
    const gone = item.status !== 'active';
    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}
        onPress={() => openItem(item)}
      >
        <View style={styles.listImageWrap}>
          {item.photo ? (
            <Image source={{ uri: thumbUrl(item.photo, 200) }} resizeMethod="resize" style={styles.fill} resizeMode="cover" />
          ) : (
            <View style={[styles.fill, styles.center]}>
              <Icon name={item.icon} size={28} color={colors.primary} />
            </View>
          )}
          {gone ? (
            <View style={styles.goneVeil}>
              <Text style={[styles.goneVeilText, styles.goneVeilTextSmall]}>{unavailableLabel(item)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.listInfo}>
          <Text style={[styles.listTitle, gone && styles.textGone]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.listPrice, gone && styles.priceGone]}>{formatPrice(item.priceValue)}</Text>
          <View style={styles.gridMetaRow}>
            {item.category ? (
              <View style={styles.tag}>
                <Text style={styles.tagText} numberOfLines={1}>{item.category}</Text>
              </View>
            ) : null}
            {item.condition ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.condition}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.listMetaRow}>
            {item.sellerName ? (
              <View style={[styles.metaItem, styles.shrink]}>
                <Icon name={item.isShop ? 'storefront-outline' : 'person-outline'} size={11} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.sellerName}</Text>
              </View>
            ) : null}
            {item.distanceLabel || item.location ? (
              <View style={[styles.metaItem, styles.shrink]}>
                <Icon name={item.distanceLabel ? 'navigate-outline' : 'location-outline'} size={11} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>{item.distanceLabel || item.location}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable style={styles.listHeart} hitSlop={8} onPress={() => removeItem(item.id)} accessibilityLabel="Remove from saved">
          <Icon name="heart" size={16} color={colors.danger} />
        </Pressable>
      </Pressable>
    );
  };

  const filtersActive = Boolean(query.trim()) || extraFilters > 0 || status !== 'all';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fill}
          pointerEvents="none"
        />
        <View style={styles.headerGlow} pointerEvents="none" />
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
            <Icon name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Saved Items</Text>
            <Text style={styles.headerSubtitle}>
              {counts.all} saved · {counts.available} available
            </Text>
          </View>
          <Pressable onPress={() => navigateToTab(navigation, TABS.EXPLORE)} hitSlop={10} style={styles.navBtn}>
            <Icon name="compass-outline" size={19} color={colors.white} />
          </Pressable>
        </View>
      </View>

      {items.length > 0 ? (
        <View style={styles.filterBar}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search saved items"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Icon name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
              <VoiceSearchToggle size={28} />
            </View>
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={({ pressed }) => [styles.filterBtn, extraFilters > 0 && styles.filterBtnActive, pressed && styles.pressed]}
              accessibilityLabel="Sort and filter"
            >
              <Icon name="options-outline" size={18} color={extraFilters > 0 ? colors.white : colors.text} />
              {extraFilters > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{extraFilters}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {STATUS_FILTERS.map((filter) => {
              const selected = status === filter.key;
              return (
                <Pressable key={filter.key} onPress={() => setStatus(filter.key)} style={[styles.chip, selected && styles.chipActive]}>
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{filter.label}</Text>
                  <View style={[styles.chipCount, selected && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, selected && styles.chipCountTextActive]}>{counts[filter.key]}</Text>
                  </View>
                </Pressable>
              );
            })}
            {SELLER_TYPES.slice(1).map((type) => {
              const selected = sellerType === type.key;
              return (
                <Pressable
                  key={type.key}
                  onPress={() => setSellerType(selected ? 'all' : type.key)}
                  style={[styles.chip, selected && styles.chipActive]}
                >
                  <Icon
                    name={type.key === 'shop' ? 'storefront-outline' : 'person-outline'}
                    size={12}
                    color={selected ? colors.white : colors.textSecondary}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{type.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.resultsRow}>
            <View style={styles.resultsLeft}>
              <Text style={styles.resultsText}>
                {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
              </Text>
              <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} style={styles.sortLink}>
                <Icon name="swap-vertical" size={13} color={colors.textSecondary} />
                <Text style={styles.sortLinkText} numberOfLines={1}>{sortLabel}</Text>
              </Pressable>
            </View>
            <View style={styles.viewToggle}>
              {[
                { key: 'grid', icon: 'grid' },
                { key: 'list', icon: 'list' },
              ].map((option) => {
                const selected = viewMode === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setViewMode(option.key)}
                    style={[styles.viewToggleBtn, selected && styles.viewToggleBtnActive]}
                    accessibilityLabel={option.key === 'list' ? 'List view' : 'Card view'}
                  >
                    <Icon
                      name={selected ? option.icon : `${option.icon}-outline`}
                      size={15}
                      color={selected ? colors.white : colors.textSecondary}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      <LazyScrollProvider value={lazyScroll.value}>
      <ScrollView
        ref={lazyScroll.scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        scrollEventThrottle={50}
        onScroll={lazyScroll.onScroll}
        onContentSizeChange={lazyScroll.onContentSizeChange}
      >
        {items.length === 0 ? (
          loaded ? (
            <EmptyState
              compact
              icon="heart-outline"
              title="No saved items yet"
              body="Tap the heart on a listing to keep it here."
              buttonLabel="Explore items"
              onButtonPress={() => navigateToTab(navigation, TABS.EXPLORE)}
            />
          ) : (
            <View style={styles.grid}>
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} width={gridCardWidth} />
              ))}
            </View>
          )
        ) : filtered.length === 0 ? (
          <View style={styles.noMatch}>
            <View style={styles.noMatchIcon}>
              <Icon name="search-outline" size={26} color={colors.textMuted} />
            </View>
            <Text style={styles.noMatchTitle}>No matching items</Text>
            <Text style={styles.noMatchText}>Try another word or clear the filters.</Text>
            {filtersActive ? (
              <Pressable
                style={styles.noMatchBtn}
                onPress={() => {
                  resetFilters();
                  setQuery('');
                  setStatus('all');
                }}
              >
                <Text style={styles.noMatchBtnText}>Clear filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : viewMode === 'grid' ? (
          <LazyList data={filtered} columns={2} gap={GRID_GAP} estimatedRowHeight={Math.round(gridCardWidth * GRID_IMAGE_RATIO) + 110} renderItem={renderGridCard} />
        ) : (
          <LazyList data={filtered} gap={10} estimatedRowHeight={120} renderItem={renderListCard} />
        )}
      </ScrollView>
      </LazyScrollProvider>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Sort & filter</Text>
            <Pressable onPress={resetFilters} hitSlop={8} disabled={extraFilters === 0}>
              <Text style={[styles.sheetReset, extraFilters === 0 && styles.sheetResetDisabled]}>Reset</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetSection}>Sort by</Text>
            <View style={styles.sortList}>
              {SORT_OPTIONS.filter((option) => option.key !== 'nearest' || hasDistance).map((option) => {
                const selected = sortBy === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setSortBy(option.key)}
                    style={[styles.sortOption, selected && styles.sortOptionActive]}
                  >
                    <Icon name={option.icon} size={16} color={selected ? colors.gradientStart : colors.textSecondary} />
                    <Text style={[styles.sortOptionText, selected && styles.sortOptionTextActive]}>{option.label}</Text>
                    <Icon
                      name={selected ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={selected ? colors.gradientStart : colors.textTertiary}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sheetSection}>Price (NPR)</Text>
            <View style={styles.priceRow}>
              <TextInput
                value={minPrice}
                onChangeText={(text) => setMinPrice(digits(text))}
                placeholder="Min"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={styles.priceInput}
              />
              <View style={styles.priceDash} />
              <TextInput
                value={maxPrice}
                onChangeText={(text) => setMaxPrice(digits(text))}
                placeholder="Max"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                style={styles.priceInput}
              />
            </View>

            <Text style={styles.sheetSection}>Seller</Text>
            <View style={styles.wrapChips}>
              {SELLER_TYPES.map((type) => {
                const selected = sellerType === type.key;
                return (
                  <Pressable key={type.key} onPress={() => setSellerType(type.key)} style={[styles.chip, selected && styles.chipActive]}>
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{type.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {categories.length > 1 ? (
              <>
                <Text style={styles.sheetSection}>Category</Text>
                <View style={styles.wrapChips}>
                  {['all', ...categories].map((name) => {
                    const selected = category === name;
                    return (
                      <Pressable key={name} onPress={() => setCategory(name)} style={[styles.chip, selected && styles.chipActive]}>
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {name === 'all' ? 'All categories' : name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {conditions.length > 1 ? (
              <>
                <Text style={styles.sheetSection}>Condition</Text>
                <View style={styles.wrapChips}>
                  {['all', ...conditions].map((name) => {
                    const selected = condition === name;
                    return (
                      <Pressable key={name} onPress={() => setCondition(name)} style={[styles.chip, selected && styles.chipActive]}>
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                          {name === 'all' ? 'Any condition' : name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
          <Pressable style={styles.sheetDone} onPress={() => setSheetOpen(false)}>
            <Text style={styles.sheetDoneText}>
              Show {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.gradientStart,
  },
  headerGlow: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.8)',
  },
  filterBar: {
    paddingTop: 12,
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.background,
  },
  filterBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: colors.white,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
  },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    alignItems: 'center',
    backgroundColor: colors.iconBackground,
  },
  chipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  chipCountText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipCountTextActive: {
    color: colors.white,
  },
  resultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  resultsLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultsText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  sortLink: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewToggle: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggleBtn: {
    width: 32,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleBtnActive: {
    backgroundColor: colors.gradientStart,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 2,
    flexGrow: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  gridImageWrap: {
    width: '100%',
    backgroundColor: colors.iconBackground,
  },
  goneVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17,24,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goneVeilText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.white,
  },
  goneVeilTextSmall: {
    fontSize: 9.5,
    letterSpacing: 1,
    textAlign: 'center',
  },
  featuredTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: colors.warning,
  },
  featuredText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  gridBody: {
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 9,
    gap: 3,
  },
  gridTitle: {
    minHeight: 32,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 16,
    color: colors.text,
  },
  gridPrice: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.price,
  },
  textGone: {
    color: colors.textSecondary,
  },
  priceGone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  gridMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    maxWidth: 120,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: colors.iconBackground,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shrink: {
    flexShrink: 1,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  sellerAvatarShop: {
    borderRadius: 5,
  },
  sellerName: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  list: {
    gap: 10,
  },
  listCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  listImageWrap: {
    width: 92,
    height: 92,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
  },
  listInfo: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    paddingRight: 28,
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
    color: colors.text,
  },
  listPrice: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.price,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  listHeart: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBackground,
  },
  noMatch: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  noMatchIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
    marginBottom: 12,
  },
  noMatchTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  noMatchText: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  noMatchBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.gradientStart,
  },
  noMatchBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.white,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '82%',
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sheetReset: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  sheetResetDisabled: {
    color: colors.textMuted,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetSection: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  sortList: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sortOptionActive: {
    backgroundColor: `${colors.gradientStart}12`,
  },
  sortOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  sortOptionTextActive: {
    color: colors.gradientStart,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    fontSize: 14,
    color: colors.text,
  },
  priceDash: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.textTertiary,
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetDone: {
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
  },
  sheetDoneText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
});
