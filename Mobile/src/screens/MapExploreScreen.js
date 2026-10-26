import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Easing, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Icon from '../components/Icon';
import ScreenLoader from '../components/ScreenLoader';
import { PressableScale, Reanimated } from '../components/Motion';
import {
  APPROX_TINT,
  PreviewMap,
  SHOP_TINT,
  STREET_MAP_READY,
  StreetMap,
  distanceKmBetween,
} from '../components/NearbyMapViews';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { NEPAL_LOCATIONS } from '../utils/locations';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const DEFAULT_CENTER = {
  latitude: NEPAL_LOCATIONS[0].lat,
  longitude: NEPAL_LOCATIONS[0].lng,
};

const RADIUS_OPTIONS = [2, 5, 10, 25];
const TYPE_OPTIONS = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'products', label: 'Products', icon: 'cube-outline' },
  { key: 'shops', label: 'Shops', icon: 'storefront-outline' },
];
const TAB_SLIDE = { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const EMPTY_COUNTS = { total: 0, products: 0, shops: 0, exact: 0, approx: 0, area: 0 };
const MAX_CARDS = 60;

const PRECISION_META = {
  exact: { icon: 'locate', label: 'Exact spot', tint: '#10B981' },
  approx: { icon: 'radio-button-on', label: 'Approx. ~400 m', tint: APPROX_TINT },
  area: { icon: 'map-outline', label: 'Area only', tint: '#94A3B8' },
};

function gpsQuality(accuracy) {
  if (accuracy == null) return null;
  if (accuracy <= 25) return { label: 'Precise', tint: '#10B981' };
  if (accuracy <= 100) return { label: 'Good', tint: '#3B82F6' };
  return { label: 'Weak signal', tint: APPROX_TINT };
}

function formatDistance(km, approximate) {
  if (km == null) return '';
  const prefix = approximate ? '~' : '';
  if (km < 1) return `${prefix}${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${prefix}${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function positionToCoords(position) {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

function TypeTabs({ value, onChange, styles, colors }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, TYPE_OPTIONS.findIndex((option) => option.key === value));
  const segment = width ? (width - 8) / TYPE_OPTIONS.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(index * segment, TAB_SLIDE);
  }, [index, segment, offset]);

  const sliderStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View style={styles.tabsTrack} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {segment ? <Reanimated.View style={[styles.tabsSlider, { width: segment }, sliderStyle]} /> : null}
      {TYPE_OPTIONS.map((option) => {
        const active = option.key === value;
        return (
          <Pressable key={option.key} style={styles.tab} onPress={() => onChange(option.key)}>
            <Icon name={option.icon} size={15} color={active ? '#fff' : colors.textSecondary} />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MapButton({ icon, onPress, styles, colors, busy, active }) {
  return (
    <PressableScale scaleTo={0.9} onPress={onPress} disabled={busy} contentStyle={[styles.mapBtn, active && styles.mapBtnActive]}>
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Icon name={icon} size={20} color={active ? '#fff' : colors.text} />
      )}
    </PressableScale>
  );
}

function PlaceCard({ marker, active, width, styles, colors, onPress, distanceLabel }) {
  const isShop = marker.markerType === 'shop';
  const tint = isShop ? SHOP_TINT : colors.primary;
  const precision = PRECISION_META[marker.precision] || PRECISION_META.area;
  const photo = marker.photo ? resolveMediaUrl(marker.photo) : '';
  return (
    <Pressable style={[styles.card, { width }, active && { borderColor: tint }]} onPress={onPress}>
      <View style={styles.cardMedia}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Icon name={isShop ? 'storefront' : 'cube-outline'} size={26} color={tint} />
          </View>
        )}
        <View style={[styles.cardType, { backgroundColor: tint }]}>
          <Icon name={isShop ? 'storefront' : 'cube'} size={10} color="#fff" />
          <Text style={styles.cardTypeText}>{isShop ? 'Shop' : 'Item'}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{marker.title}</Text>
        <View style={styles.cardMetaRow}>
          {isShop && marker.verified ? <Icon name="checkmark-circle" size={13} color={SHOP_TINT} /> : null}
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {marker.subtitle}
            {!isShop && marker.category ? ` · ${marker.category}` : ''}
          </Text>
        </View>
        <View style={styles.cardFooter}>
          <Text style={[styles.cardPrice, isShop && { color: SHOP_TINT }]} numberOfLines={1}>
            {isShop
              ? `${marker.listingCount || 0} listing${(marker.listingCount || 0) === 1 ? '' : 's'}`
              : formatPrice(marker.price)}
          </Text>
          <View style={styles.distancePill}>
            <Icon name="navigate" size={11} color={colors.primary} />
            <Text style={styles.distanceText}>{distanceLabel}</Text>
          </View>
        </View>
        <View style={[styles.precisionChip, { backgroundColor: `${precision.tint}1F` }]}>
          <Icon name={precision.icon} size={11} color={precision.tint} />
          <Text style={[styles.precisionText, { color: precision.tint }]}>{precision.label}</Text>
        </View>
      </View>
      <View style={[styles.cardGo, { backgroundColor: tint }]}>
        <Icon name="chevron-forward" size={16} color="#fff" />
      </View>
    </Pressable>
  );
}

export default function MapExploreScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  const mapRef = useRef(null);
  const listRef = useRef(null);
  const requestRef = useRef(0);
  const radiusRef = useRef(5);
  const typeRef = useRef('all');

  const [ready, setReady] = useState(false);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [userCoords, setUserCoords] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationState, setLocationState] = useState('pending');
  const [locating, setLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [placeType, setPlaceType] = useState('all');
  const [mapStyle, setMapStyle] = useState('standard');
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [selectedId, setSelectedId] = useState(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [pendingArea, setPendingArea] = useState(null);

  const cardWidth = Math.min(windowWidth - 56, 380);
  const cardGap = 10;
  const sidePad = (windowWidth - cardWidth) / 2;
  const headerHeight = insets.top + 150;
  const footerHeight = insets.bottom + 150;

  const loadMapData = useCallback(async (coords, nextRadius = radiusRef.current, nextType = typeRef.current) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    const { data, error } = await api.getMapNearby({
      lat: coords.latitude,
      lng: coords.longitude,
      radius: nextRadius,
      type: nextType,
      limit: 100,
    });
    if (requestRef.current !== requestId) return;
    setLoading(false);
    if (error || !data) {
      setMarkers([]);
      setCounts(EMPTY_COUNTS);
      return;
    }
    setMarkers(data.markers || []);
    setCounts({ ...EMPTY_COUNTS, ...(data.counts || {}) });
  }, []);

  const applyFix = useCallback((position, { load = true } = {}) => {
    const coords = positionToCoords(position);
    setUserCoords(coords);
    setGpsAccuracy(position.coords.accuracy ?? null);
    setLocationState('ok');
    setCenter(coords);
    setPendingArea(null);
    if (load) {
      setSelectedId(null);
      mapRef.current?.fit(coords, radiusRef.current);
      loadMapData(coords);
    }
    return coords;
  }, [loadMapData]);

  const fallBackToDefault = useCallback((state) => {
    setLocationState(state);
    setCenter(DEFAULT_CENTER);
    setReady(true);
    loadMapData(DEFAULT_CENTER);
  }, [loadMapData]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync().catch(() => null);
      if (!alive) return;
      if (permission?.status !== 'granted') {
        fallBackToDefault(permission?.canAskAgain === false ? 'blocked' : 'denied');
        return;
      }
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 1000 }).catch(() => null);
      if (!alive) return;
      if (last) {
        applyFix(last);
        setReady(true);
      }
      setLocating(true);
      const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
      if (!alive) return;
      setLocating(false);
      if (fresh) {
        const moved = last ? distanceKmBetween(positionToCoords(last), positionToCoords(fresh)) > 0.15 : true;
        applyFix(fresh, { load: moved });
        setReady(true);
      } else if (!last) {
        fallBackToDefault('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyFix, fallBackToDefault]);

  const locateMe = useCallback(async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationState(permission.canAskAgain === false ? 'blocked' : 'denied');
        if (permission.canAskAgain === false) Linking.openSettings().catch(() => {});
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      applyFix(position);
    } catch {
      setLocationState('error');
    } finally {
      setLocating(false);
    }
  }, [applyFix]);

  const changeRadius = (km) => {
    if (km === radiusKm) return;
    radiusRef.current = km;
    setRadiusKm(km);
    setSelectedId(null);
    mapRef.current?.fit(center, km);
    loadMapData(center, km);
  };

  const changeType = (key) => {
    if (key === placeType) return;
    typeRef.current = key;
    setPlaceType(key);
    setSelectedId(null);
    loadMapData(center, radiusKm, key);
  };

  const searchThisArea = () => {
    if (!pendingArea) return;
    const coords = { latitude: pendingArea.latitude, longitude: pendingArea.longitude };
    setCenter(coords);
    setPendingArea(null);
    setSelectedId(null);
    loadMapData(coords);
  };

  const onRegionSettled = useCallback((region) => {
    const moved = distanceKmBetween(center, region);
    setPendingArea(moved != null && moved > Math.max(0.4, radiusKm * 0.35) ? region : null);
  }, [center, radiusKm]);

  const origin = userCoords || center;
  const cards = useMemo(() => {
    return markers
      .map((marker) => ({
        marker,
        distance: distanceKmBetween(origin, { latitude: marker.lat, longitude: marker.lng }),
      }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, MAX_CARDS);
  }, [markers, origin]);

  const selected = useMemo(
    () => markers.find((marker) => marker.id === selectedId) || null,
    [markers, selectedId],
  );

  const selectMarker = useCallback((marker, { fromList = false } = {}) => {
    if (!marker) {
      setSelectedId(null);
      return;
    }
    setSelectedId(marker.id);
    setLegendOpen(false);
    mapRef.current?.focus(marker);
    if (!fromList) {
      const index = cards.findIndex((card) => card.marker.id === marker.id);
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true });
    }
  }, [cards]);

  const onCardsSettled = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + cardGap));
    const card = cards[clampIndex(index, cards.length)];
    if (card && card.marker.id !== selectedId) selectMarker(card.marker, { fromList: true });
  };

  const openMarker = (marker) => {
    if (marker.markerType === 'product' && marker.listingId) {
      navigation.navigate(ROUTES.ITEM_DETAIL, { listingId: marker.listingId });
      return;
    }
    const sellerId = marker.shopId || marker.sellerId;
    if (sellerId) navigation.navigate(ROUTES.SELLER_PROFILE, { seller: { id: sellerId, _id: sellerId } });
  };

  const quality = gpsQuality(locationState === 'ok' ? gpsAccuracy : null);
  const nextRadius = RADIUS_OPTIONS.find((km) => km > radiusKm);
  const locationOff = locationState === 'denied' || locationState === 'blocked' || locationState === 'error';
  const mapPadding = { top: headerHeight, bottom: footerHeight, left: 0, right: 0 };

  const subtitle = loading
    ? 'Finding places near you…'
    : `${counts.products} item${counts.products === 1 ? '' : 's'} · ${counts.shops} shop${counts.shops === 1 ? '' : 's'} within ${radiusKm} km`;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />

      {ready ? (
        STREET_MAP_READY ? (
          <StreetMap
            ref={mapRef}
            center={center}
            radiusKm={radiusKm}
            markers={markers}
            selected={selected}
            onSelect={selectMarker}
            onRegionSettled={onRegionSettled}
            mapType={mapStyle}
            isDark={isDark}
            colors={colors}
            padding={mapPadding}
          />
        ) : (
          <PreviewMap
            ref={mapRef}
            center={center}
            radiusKm={radiusKm}
            markers={markers}
            selected={selected}
            onSelect={selectMarker}
            onRegionSettled={onRegionSettled}
            userCoords={userCoords}
            gpsAccuracy={gpsAccuracy}
            isDark={isDark}
            colors={colors}
            padding={mapPadding}
          />
        )
      ) : null}

      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <PressableScale scaleTo={0.9} hitSlop={8} onPress={() => navigation.goBack()} contentStyle={styles.roundBtn}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </PressableScale>
          <View style={styles.titleCard}>
            <View style={styles.titleTop}>
              <Text style={styles.title}>Nearby Map</Text>
              {quality ? (
                <View style={[styles.gpsChip, { backgroundColor: `${quality.tint}1F` }]}>
                  <View style={[styles.gpsDot, { backgroundColor: quality.tint }]} />
                  <Text style={[styles.gpsText, { color: quality.tint }]}>
                    GPS ±{Math.max(1, Math.round(gpsAccuracy))} m
                  </Text>
                </View>
              ) : locationOff ? (
                <View style={[styles.gpsChip, { backgroundColor: `${colors.warning}1F` }]}>
                  <Icon name="location-outline" size={11} color={colors.warning} />
                  <Text style={[styles.gpsText, { color: colors.warning }]}>Location off</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <PressableScale
            scaleTo={0.9}
            hitSlop={8}
            onPress={() => setLegendOpen((open) => !open)}
            contentStyle={[styles.roundBtn, legendOpen && styles.roundBtnActive]}
          >
            <Icon name="information-circle-outline" size={21} color={legendOpen ? '#fff' : colors.text} />
          </PressableScale>
        </View>

        <TypeTabs value={placeType} onChange={changeType} styles={styles} colors={colors} />

        <View style={styles.radiusRow}>
          <Icon name="scan-outline" size={15} color={colors.textSecondary} />
          {RADIUS_OPTIONS.map((km) => {
            const active = radiusKm === km;
            return (
              <Pressable key={km} style={[styles.radiusChip, active && styles.radiusChipActive]} onPress={() => changeRadius(km)}>
                <Text style={[styles.radiusText, active && styles.radiusTextActive]}>{km} km</Text>
              </Pressable>
            );
          })}
        </View>

        {legendOpen ? (
          <Reanimated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(150)} style={styles.legend}>
            <Text style={styles.legendTitle}>How accurate are these pins?</Text>
            {[
              { key: 'exact', note: 'Shops share their real address', count: counts.exact },
              { key: 'approx', note: 'People selling from home stay private', count: counts.approx },
              { key: 'area', note: 'Only the town or area is known', count: counts.area },
            ].map((row) => {
              const meta = PRECISION_META[row.key];
              return (
                <View key={row.key} style={styles.legendRow}>
                  <View style={[styles.legendIcon, { backgroundColor: `${meta.tint}1F` }]}>
                    <Icon name={meta.icon} size={15} color={meta.tint} />
                  </View>
                  <View style={styles.legendCopy}>
                    <Text style={styles.legendLabel}>{meta.label}</Text>
                    <Text style={styles.legendNote}>{row.note}</Text>
                  </View>
                  <Text style={[styles.legendCount, { color: meta.tint }]}>{row.count}</Text>
                </View>
              );
            })}
            <View style={styles.legendDivider} />
            <View style={styles.legendRow}>
              <View style={[styles.legendIcon, { backgroundColor: 'rgba(59,130,246,0.14)' }]}>
                <Icon name="navigate" size={15} color="#3B82F6" />
              </View>
              <View style={styles.legendCopy}>
                <Text style={styles.legendLabel}>Your location</Text>
                <Text style={styles.legendNote}>
                  {quality
                    ? `${quality.label} · within ${Math.round(gpsAccuracy)} m`
                    : locationOff
                      ? 'Turn on location for distances from you'
                      : 'Getting a GPS fix…'}
                </Text>
              </View>
            </View>
            <Text style={styles.legendHint}>Solid pins are exact. Hollow pins show an approximate spot.</Text>
          </Reanimated.View>
        ) : null}

        {pendingArea && !legendOpen ? (
          <Reanimated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.areaWrap}>
            <PressableScale scaleTo={0.94} onPress={searchThisArea} contentStyle={styles.areaBtn}>
              <Icon name="search" size={15} color="#fff" />
              <Text style={styles.areaText}>Search this area</Text>
            </PressableScale>
          </Reanimated.View>
        ) : null}

        {loading && ready && markers.length > 0 ? (
          <View style={styles.updating}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.updatingText}>Updating</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.mapControls, { top: headerHeight + 12 }]} pointerEvents="box-none">
        {STREET_MAP_READY ? (
          <MapButton
            icon="layers"
            active={mapStyle !== 'standard'}
            onPress={() => setMapStyle((style) => (style === 'standard' ? 'hybrid' : 'standard'))}
            styles={styles}
            colors={colors}
          />
        ) : null}
        <View style={styles.zoomGroup}>
          <PressableScale scaleTo={0.9} onPress={() => mapRef.current?.zoomBy(0.5)} contentStyle={styles.zoomBtn}>
            <Icon name="add" size={22} color={colors.text} />
          </PressableScale>
          <View style={styles.zoomDivider} />
          <PressableScale scaleTo={0.9} onPress={() => mapRef.current?.zoomBy(2)} contentStyle={styles.zoomBtn}>
            <Icon name="remove" size={22} color={colors.text} />
          </PressableScale>
        </View>
        <MapButton icon="locate" busy={locating} onPress={locateMe} styles={styles} colors={colors} />
        <MapButton icon="scan-outline" onPress={() => mapRef.current?.fit(center, radiusKm)} styles={styles} colors={colors} />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
        {locationOff ? (
          <Reanimated.View entering={FadeInDown.duration(240)} style={styles.banner}>
            <View style={styles.bannerIcon}>
              <Icon name="location-outline" size={18} color={colors.warning} />
            </View>
            <Text style={styles.bannerText}>
              Showing Kathmandu. Turn on location for exact distances from you.
            </Text>
            <PressableScale scaleTo={0.94} onPress={locateMe} contentStyle={styles.bannerBtn}>
              <Text style={styles.bannerBtnText}>Turn on</Text>
            </PressableScale>
          </Reanimated.View>
        ) : null}

        {ready && !loading && cards.length === 0 ? (
          <Reanimated.View entering={FadeInDown.duration(240)} style={[styles.empty, { width: windowWidth - 24 }]}>
            <View style={styles.emptyIcon}>
              <Icon name="map-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Nothing within {radiusKm} km yet</Text>
              <Text style={styles.emptyText}>
                {nextRadius ? 'Widen the circle to see more sellers.' : 'Check back soon as new sellers join.'}
              </Text>
            </View>
            {nextRadius ? (
              <PressableScale scaleTo={0.94} onPress={() => changeRadius(nextRadius)} contentStyle={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>{nextRadius} km</Text>
              </PressableScale>
            ) : null}
          </Reanimated.View>
        ) : null}

        {cards.length > 0 ? (
          <FlatList
            ref={listRef}
            data={cards}
            horizontal
            keyExtractor={(card) => card.marker.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + cardGap}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: sidePad, gap: cardGap }}
            getItemLayout={(_, index) => ({
              length: cardWidth + cardGap,
              offset: (cardWidth + cardGap) * index,
              index,
            })}
            onMomentumScrollEnd={onCardsSettled}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item }) => (
              <PlaceCard
                marker={item.marker}
                active={item.marker.id === selectedId}
                width={cardWidth}
                styles={styles}
                colors={colors}
                distanceLabel={formatDistance(item.distance, item.marker.precision !== 'exact')}
                onPress={() => {
                  if (item.marker.id === selectedId) openMarker(item.marker);
                  else selectMarker(item.marker);
                }}
              />
            )}
          />
        ) : null}
      </View>

      {!ready ? <ScreenLoader overlay label="Finding your location" /> : null}
    </View>
  );
}

function clampIndex(index, length) {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  roundBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  titleCard: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...shadow,
  },
  titleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  gpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  gpsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '800',
  },
  tabsTrack: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  tabsSlider: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  radiusChipActive: {
    backgroundColor: colors.primary,
  },
  radiusText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  radiusTextActive: {
    color: '#fff',
  },
  legend: {
    marginTop: 2,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    ...shadow,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendCopy: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  legendNote: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textSecondary,
  },
  legendCount: {
    fontSize: 15,
    fontWeight: '900',
  },
  legendDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  legendHint: {
    fontSize: 11,
    color: colors.textMuted,
  },
  areaWrap: {
    alignSelf: 'center',
  },
  areaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.primary,
    ...shadow,
  },
  areaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  updating: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  updatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  mapControls: {
    position: 'absolute',
    right: 12,
    gap: 10,
    alignItems: 'center',
  },
  mapBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  mapBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  zoomGroup: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    marginHorizontal: 8,
    backgroundColor: colors.border,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 8,
  },
  banner: {
    marginHorizontal: 12,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.warning}1F`,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  bannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  bannerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glow,
  },
  emptyCopy: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  emptyText: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadow,
  },
  cardMedia: {
    width: 92,
    height: 104,
  },
  cardImage: {
    width: 92,
    height: 104,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  cardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardType: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardTypeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  cardBody: {
    flex: 1,
    gap: 4,
    paddingRight: 24,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    color: colors.text,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardSubtitle: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardPrice: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.glow,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  precisionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  precisionText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardGo: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
