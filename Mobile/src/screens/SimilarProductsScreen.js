import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import EmptyState from '../components/EmptyState';
import FilterBottomSheet from '../components/FilterBottomSheet';
import LazyList, { LazyScrollProvider, useLazyScroll } from '../components/LazyList';
import { photoForAi } from '../hooks/useListingAiFill';
import { openItemDetail } from '../navigation/helpers';
import { api } from '../services/api';
import { formatMoney } from '../utils/currency';
import {
  attachDistanceToCard,
  cardPrice,
  categoryIcon,
  resolveMediaUrl,
  thumbUrl,
  toCardItem,
} from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const SORT_OPTIONS = [
  { label: 'Best match', key: 'match' },
  { label: 'Price: Low to High', key: 'price-low' },
  { label: 'Price: High to Low', key: 'price-high' },
  { label: 'Nearest First', key: 'distance' },
];

function matchLevel(score) {
  if (score >= 90) return { label: 'Exact match', tone: 'success' };
  if (score >= 75) return { label: 'Very close', tone: 'primary' };
  return { label: 'Similar', tone: 'warning' };
}

function priceStats(prices) {
  const sorted = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    low: sorted[0],
    high: sorted[sorted.length - 1],
    median: sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2),
  };
}

/** Where the seller's own price sits against what the same item sells for. */
function priceVerdict(price, stats) {
  if (!price || !stats) return null;
  if (price > stats.high * 1.1) return { text: 'Your price is higher than similar items', icon: 'trending-up', tone: 'warning' };
  if (price < stats.low * 0.9) return { text: 'Your price is lower than similar items', icon: 'trending-down', tone: 'info' };
  return { text: 'Your price is in the market range', icon: 'checkmark-circle', tone: 'success' };
}

/** Prefers what the server already has (the AI-read cover, a stored upload); only a fresh local photo is sent. */
async function similarPayload(photoUri, photoKey) {
  if (photoKey) return { photoKey };
  const uri = String(photoUri || '');
  if (uri.startsWith('/uploads/') || (/^https?:\/\//i.test(uri) && uri.includes('/uploads/'))) {
    return { photoUrl: uri };
  }
  const prepared = await photoForAi(uri);
  if (!prepared?.base64) throw new Error('Could not read that photo');
  return { image: prepared.base64, mimeType: 'image/jpeg' };
}

/** Before posting: the same product from other sellers (matched by AI from the cover photo) and its market price. */
export default function SimilarProductsScreen({ navigation, route }) {
  const { photoUri, photoKey, excludeId, title = '', category = '', description = '', price } = route.params || {};
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const lazyScroll = useLazyScroll();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(null);
  const requestId = useRef(0);
  const myPrice = Number(String(price ?? '').replace(/[^\d.]/g, '')) || 0;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setStatus('loading');
    setError('');
    try {
      if (!photoUri) throw new Error('Add a cover photo first');
      const query = { title, category, description, ...(excludeId ? { excludeId } : {}) };
      let res = await api.findSimilarProducts({ ...(await similarPayload(photoUri, photoKey)), ...query });
      if (photoKey && res.data?.code === 'PHOTO_EXPIRED' && id === requestId.current) {
        res = await api.findSimilarProducts({ ...(await similarPayload(photoUri)), ...query });
      }
      const { data, error: apiError } = res;
      if (id !== requestId.current) return;
      if (apiError || !data) throw new Error(apiError || 'Could not find similar products');
      setResult(data);
      setFilters(null);
      setStatus('done');
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err?.message || 'Could not find similar products');
      setStatus('error');
    }
  }, [photoUri, photoKey, excludeId, title, category, description]);

  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status: perm }) => (perm === 'granted' ? Location.getLastKnownPositionAsync() : null))
      .then((last) => {
        if (last?.coords) setUserCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
      })
      .catch(() => {});
  }, []);

  const cards = useMemo(
    () =>
      (result?.listings || []).map((listing) => ({
        ...attachDistanceToCard(toCardItem(listing), userCoords),
        condition: listing.condition || '',
        amount: Number(listing.price) || 0,
        match: listing.match || {},
        own: Boolean(listing.own),
      })),
    [result, userCoords]
  );

  const priceBounds = useMemo(() => {
    const prices = cards.map((card) => card.amount).filter((p) => p > 0);
    if (!prices.length) return [0, 1000];
    const lo = Math.floor(Math.min(...prices) / 100) * 100;
    const hi = Math.ceil(Math.max(...prices) / 100) * 100;
    return [lo, hi > lo ? hi : lo + 100];
  }, [cards]);

  const categoryChoices = useMemo(
    () =>
      [...new Set(cards.map((card) => card.category).filter(Boolean))].map((label) => ({
        label,
        icon: categoryIcon(label),
      })),
    [cards]
  );

  const shown = useMemo(() => {
    const f = filters;
    let list = cards;
    if (f) {
      list = list.filter((card) => {
        if (card.amount && (card.amount < f.priceMin || card.amount > f.priceMax)) return false;
        if (f.category && f.category !== 'All' && card.category !== f.category) return false;
        if (f.condition && f.condition !== 'All' && card.condition !== f.condition) return false;
        if (f.radiusKm != null && (card.distanceKm == null || card.distanceKm > f.radiusKm)) return false;
        return true;
      });
    }
    const key = f?.sortKey || 'match';
    const sorted = [...list];
    if (key === 'price-low') sorted.sort((a, b) => a.amount - b.amount);
    else if (key === 'price-high') sorted.sort((a, b) => b.amount - a.amount);
    else if (key === 'distance') sorted.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    else sorted.sort((a, b) => (b.match.score || 0) - (a.match.score || 0));
    return sorted;
  }, [cards, filters]);

  const stats = useMemo(() => priceStats(shown.filter((card) => !card.own).map((card) => card.amount)), [shown]);
  const ownCount = shown.filter((card) => card.own).length;
  const otherCount = shown.length - ownCount;
  const verdict = priceVerdict(myPrice, stats);

  const activeChips = useMemo(() => {
    if (!filters) return [];
    const chips = [];
    if (filters.priceMin > priceBounds[0] || filters.priceMax < priceBounds[1]) {
      chips.push(`${formatMoney(filters.priceMin)} – ${formatMoney(filters.priceMax)}`);
    }
    if (filters.category && filters.category !== 'All') chips.push(filters.category);
    if (filters.condition && filters.condition !== 'All') chips.push(filters.condition);
    if (filters.radiusKm != null) chips.push(`Within ${filters.radiusKm} km`);
    if (filters.sortKey && filters.sortKey !== 'match') chips.push(filters.sortBy);
    return chips;
  }, [filters, priceBounds]);

  const source = result?.source;
  const readChips = source
    ? [source.brand, source.model, source.color, ...(source.details || [])].filter(Boolean).slice(0, 6)
    : [];

  const toneColor = (tone) => colors[tone] || colors.primary;

  const renderRow = (item) => {
    const isShop = item.sellerType === 'shop';
    const level = matchLevel(item.match.score || 0);
    const tint = toneColor(level.tone);
    const place = [String(item.location || '').split(',')[0].trim(), item.distanceLabel].filter(Boolean).join(' · ');
    return (
      <Pressable
        key={`similar-${item.id}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => openItemDetail(navigation, { listingId: item.id, item: item.listing, sharedId: item.id })}
      >
        <View style={styles.thumb}>
          {item.photo ? (
            <Image source={{ uri: thumbUrl(item.photo, 200) }} resizeMethod="resize" style={styles.thumbImg} />
          ) : (
            <Icon name={item.icon || 'cube-outline'} size={28} color={colors.textTertiary} />
          )}
          <View style={[styles.scoreTag, { backgroundColor: tint }]}>
            <Text style={styles.scoreText}>{item.match.score}%</Text>
          </View>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.tagRow}>
            <View style={[styles.levelTag, { backgroundColor: `${tint}1A` }]}>
              <Icon name="sparkles" size={10} color={tint} />
              <Text style={[styles.levelText, { color: tint }]}>{level.label}</Text>
            </View>
            {item.own ? (
              <View style={[styles.levelTag, styles.ownTag]}>
                <Icon name="person" size={10} color={colors.info} />
                <Text style={[styles.levelText, { color: colors.info }]}>Your listing</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.rowPrice}>{cardPrice(item)}</Text>
          <View style={styles.metaItem}>
            <Icon name={isShop ? 'storefront-outline' : 'person-outline'} size={12} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.own ? 'You' : item.sellerName}
              {item.condition ? ` · ${item.condition}` : ''}
            </Text>
          </View>
          {place ? (
            <View style={styles.metaItem}>
              <Icon name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
          {item.match.note ? <Text style={styles.note} numberOfLines={1}>{item.match.note}</Text> : null}
        </View>
      </Pressable>
    );
  };

  const header = (
    <LinearGradient
      colors={colors.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 8 }]}
    >
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerBtn}>
        <Icon name="arrow-back" size={20} color={colors.onGradient} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Similar products</Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {status === 'done' ? `${cards.length} match${cards.length === 1 ? '' : 'es'} · ` : ''}What this sells for nearby
        </Text>
      </View>
      {status === 'done' && cards.length > 0 ? (
        <Pressable onPress={() => setFilterOpen(true)} hitSlop={8} style={styles.filterBtn}>
          <Icon name="options-outline" size={15} color={colors.onGradient} />
          <Text style={styles.filterText}>Filter</Text>
          {activeChips.length ? <View style={styles.filterDot} /> : null}
        </Pressable>
      ) : null}
    </LinearGradient>
  );

  const sourceCard = (
    <View style={styles.sourceCard}>
      <View style={styles.sourceThumb}>
        {photoUri ? (
          <Image source={{ uri: resolveMediaUrl(photoUri) }} style={styles.thumbImg} />
        ) : (
          <Icon name="image-outline" size={26} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.sourceBody}>
        <Text style={styles.sourceLabel}>Your item</Text>
        <Text style={styles.sourceTitle} numberOfLines={2}>{title || source?.product || 'Cover photo'}</Text>
        {myPrice > 0 ? <Text style={styles.sourcePrice}>{formatMoney(myPrice)}</Text> : null}
        {status === 'done' && (source?.product || readChips.length) ? (
          <View style={styles.readRow}>
            <Icon name="sparkles" size={11} color={colors.primary} />
            <Text style={styles.readText} numberOfLines={2}>
              AI sees: {[source?.product, ...readChips].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        {header}
        <View style={styles.content}>
          {sourceCard}
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingTitle}>Matching your photo…</Text>
            <Text style={styles.loadingBody}>AI is comparing product, brand, model and colour with listings on KinBech.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        {header}
        <EmptyState icon="cloud-offline-outline" title="Could not match right now" body={error} buttonLabel="Try again" onButtonPress={load} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      {header}
      <LazyScrollProvider value={lazyScroll.value}>
        <ScrollView
          ref={lazyScroll.scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          scrollEventThrottle={50}
          onScroll={lazyScroll.onScroll}
          onContentSizeChange={lazyScroll.onContentSizeChange}
        >
          {sourceCard}

          {cards.length === 0 ? (
            <EmptyState
              compact
              icon="search-outline"
              title="No exact matches yet"
              body="Nobody nearby is selling this product right now. You may be the first, so set a fair price and post."
            />
          ) : (
            <>
              <View style={styles.marketCard}>
                <Text style={styles.marketLabel}>Market price{activeChips.length ? ' (filtered)' : ''}</Text>
                {stats ? (
                  <>
                    <Text style={styles.marketRange}>
                      {stats.low === stats.high
                        ? formatMoney(stats.low)
                        : `${formatMoney(stats.low)} – ${formatMoney(stats.high)}`}
                    </Text>
                    <Text style={styles.marketMeta}>
                      Typical {formatMoney(stats.median)} · from {stats.count} listing{stats.count === 1 ? '' : 's'}
                    </Text>
                    {verdict ? (
                      <View style={[styles.verdict, { backgroundColor: `${toneColor(verdict.tone)}1A` }]}>
                        <Icon name={verdict.icon} size={14} color={toneColor(verdict.tone)} />
                        <Text style={[styles.verdictText, { color: toneColor(verdict.tone) }]}>{verdict.text}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.marketMeta}>
                    {ownCount ? 'Only your own listings so far. No other sellers to compare with yet.' : 'No listings match these filters.'}
                  </Text>
                )}
              </View>

              {activeChips.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {activeChips.map((chip) => (
                    <Pressable key={chip} style={[styles.chip, styles.chipActive]} onPress={() => setFilterOpen(true)}>
                      <Text style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>{chip}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.clearChip} onPress={() => setFilters(null)}>
                    <Text style={styles.clearChipText}>Clear</Text>
                  </Pressable>
                </ScrollView>
              ) : null}

              <Text style={styles.sectionTitle}>
                {otherCount} other seller{otherCount === 1 ? '' : 's'} selling this
                {ownCount ? ` · ${ownCount} yours` : ''}
              </Text>
              <LazyList data={shown} gap={10} estimatedRowHeight={130} renderItem={renderRow} />
            </>
          )}
        </ScrollView>
      </LazyScrollProvider>

      <FilterBottomSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFilterOpen(false);
        }}
        initial={filters}
        priceBounds={priceBounds}
        categoryChoices={categoryChoices}
        sortOptions={SORT_OPTIONS}
      />
    </View>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
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
    fontSize: 20,
    fontWeight: '900',
    color: colors.onGradient,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onGradient,
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 12,
  },
  sourceCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceThumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBody: {
    flex: 1,
    gap: 3,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  sourceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  sourcePrice: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.price,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 2,
  },
  readText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  loadingBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  loadingBody: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    color: colors.textMuted,
  },
  marketCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  marketLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  marketRange: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.price,
  },
  marketMeta: {
    fontSize: 12,
    color: colors.textMuted,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  verdictText: {
    fontSize: 12,
    fontWeight: '800',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    height: 34,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    maxWidth: 160,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  clearChip: {
    height: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  scoreTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  scoreText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  rowBody: {
    flex: 1,
    gap: 4,
    paddingVertical: 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ownTag: {
    backgroundColor: `${colors.info}1A`,
  },
  levelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  rowPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.price,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  note: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.textTertiary,
  },
});
