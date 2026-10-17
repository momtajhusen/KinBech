import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice } from '../utils/listing';
import ScreenLoader from '../components/ScreenLoader';
import { NEPAL_LOCATIONS } from '../utils/locations';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const DEFAULT_CENTER = {
  latitude: NEPAL_LOCATIONS[0].lat,
  longitude: NEPAL_LOCATIONS[0].lng,
};

const RADIUS_OPTIONS = [2, 5, 10];
const TYPE_OPTIONS = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'products', label: 'Products', icon: 'cube-outline' },
  { key: 'shops', label: 'Shops', icon: 'storefront-outline' },
];

function markerColor(markerType, colors) {
  return markerType === 'shop' ? '#3B82F6' : colors.primary;
}

export default function MapExploreScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [mapSize, setMapSize] = useState({ width: 1, height: 1 });

  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(5);
  const [mapType, setMapType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, products: 0, shops: 0 });
  const [selected, setSelected] = useState(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const placeOnMap = useCallback((lat, lng) => {
    const latRadius = Math.max(radiusKm, 0.2) / 111;
    const lngRadius = latRadius / Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
    const x = ((Number(lng) - center.longitude) / (lngRadius * 2) + 0.5) * mapSize.width;
    const y = ((center.latitude - Number(lat)) / (latRadius * 2) + 0.5) * mapSize.height;
    return { x, y };
  }, [center.latitude, center.longitude, mapSize.height, mapSize.width, radiusKm]);

  const loadMapData = useCallback(async (coords, nextRadius = radiusKm, nextType = mapType) => {
    setLoading(true);
    const { data, error } = await api.getMapNearby({
      lat: coords.latitude,
      lng: coords.longitude,
      radius: nextRadius,
      type: nextType,
      limit: 100,
    });
    setLoading(false);
    if (error || !data) {
      setMarkers([]);
      setCounts({ total: 0, products: 0, shops: 0 });
      return;
    }
    setMarkers(data.markers || []);
    setCounts(data.counts || { total: 0, products: 0, shops: 0 });
  }, [radiusKm, mapType]);

  const resolveUserLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        return DEFAULT_CENTER;
      }
      setLocationDenied(false);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch {
      setLocationDenied(true);
      return DEFAULT_CENTER;
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const coords = await resolveUserLocation();
      if (!active) return;
      setCenter(coords);
      await loadMapData(coords, radiusKm, mapType);
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshFor = async (nextRadius, nextType) => {
    await loadMapData(center, nextRadius, nextType);
  };

  const recenter = async () => {
    const coords = await resolveUserLocation();
    setCenter(coords);
    setSelected(null);
    await loadMapData(coords, radiusKm, mapType);
  };

  const onMarkerPress = (marker) => {
    setSelected(marker);
  };

  const openSelected = () => {
    if (!selected) return;
    if (selected.markerType === 'product' && selected.listingId) {
      navigation.navigate(ROUTES.ITEM_DETAIL, { listingId: selected.listingId });
      return;
    }
    const sellerId = selected.shopId || selected.sellerId;
    if (sellerId) {
      navigation.navigate(ROUTES.SELLER_PROFILE, { seller: { id: sellerId, _id: sellerId } });
    }
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />

      <View
        style={styles.map}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) setMapSize({ width, height });
        }}
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <View
            key={`col-${index}`}
            style={[styles.gridCol, { left: (mapSize.width / 5) * index }]}
          />
        ))}
        {Array.from({ length: 8 }).map((_, index) => (
          <View
            key={`row-${index}`}
            style={[styles.gridRow, { top: (mapSize.height / 7) * index }]}
          />
        ))}
        <View
          style={[
            styles.mapRing,
            {
              width: Math.min(mapSize.width, mapSize.height) * 0.72,
              height: Math.min(mapSize.width, mapSize.height) * 0.72,
              borderRadius: Math.min(mapSize.width, mapSize.height) * 0.36,
              left: (mapSize.width - Math.min(mapSize.width, mapSize.height) * 0.72) / 2,
              top: (mapSize.height - Math.min(mapSize.width, mapSize.height) * 0.72) / 2,
            },
          ]}
        />
        <View style={styles.youPin}>
          <View style={styles.youDot} />
        </View>
        {markers.map((marker) => {
          const point = placeOnMap(marker.lat, marker.lng);
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
          if (point.x < 8 || point.y < 8 || point.x > mapSize.width - 8 || point.y > mapSize.height - 8) {
            return null;
          }
          const tint = markerColor(marker.markerType, colors);
          const active = selected?.id === marker.id;
          return (
            <Pressable
              key={marker.id}
              onPress={() => onMarkerPress(marker)}
              style={[
                styles.pin,
                { backgroundColor: tint, left: point.x - 17, top: point.y - 17 },
                active && styles.pinActive,
              ]}
            >
              <Ionicons
                name={marker.markerType === 'shop' ? 'storefront' : 'cube'}
                size={14}
                color="#fff"
              />
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.roundBtn} onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle}>Nearby Map</Text>
          <Text style={styles.topSubtitle}>
            {loading ? 'Loading…' : `${counts.total} within ${radiusKm} km`}
          </Text>
        </View>
        <Pressable style={styles.roundBtn} onPress={recenter} hitSlop={10} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <View style={styles.controls}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {RADIUS_OPTIONS.map((km) => {
            const active = radiusKm === km;
            return (
              <Pressable
                key={km}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  setRadiusKm(km);
                  refreshFor(km, mapType);
                }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{km} km</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((option) => {
            const active = mapType === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => {
                  setMapType(option.key);
                  refreshFor(radiusKm, option.key);
                }}
              >
                <Ionicons
                  name={option.icon}
                  size={14}
                  color={active ? colors.onPrimary : colors.textSecondary}
                />
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {locationDenied ? (
        <View style={[styles.banner, { bottom: selected ? 168 : insets.bottom + 16 }]}>
          <Ionicons name="location-outline" size={16} color={colors.warning} />
          <Text style={styles.bannerText}>Location off — showing Kathmandu area. Enable location for accurate nearby results.</Text>
        </View>
      ) : null}

      {selected ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetRow}>
            {selected.photo ? (
              <Image source={{ uri: selected.photo }} style={styles.sheetImage} />
            ) : (
              <View style={[styles.sheetImage, styles.sheetImageFallback]}>
                <Ionicons
                  name={selected.markerType === 'shop' ? 'storefront' : 'cube-outline'}
                  size={22}
                  color={colors.primary}
                />
              </View>
            )}
            <View style={styles.sheetBody}>
              <View style={styles.sheetBadgeRow}>
                <View
                  style={[
                    styles.sheetBadge,
                    {
                      backgroundColor:
                        selected.markerType === 'shop' ? '#3B82F622' : `${colors.primary}22`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetBadgeText,
                      { color: selected.markerType === 'shop' ? '#3B82F6' : colors.primary },
                    ]}
                  >
                    {selected.markerType === 'shop' ? 'Shop' : 'Product'}
                  </Text>
                </View>
                <Text style={styles.sheetDistance}>{selected.distanceKm} km</Text>
              </View>
              <Text style={styles.sheetTitle} numberOfLines={2}>{selected.title}</Text>
              <Text style={styles.sheetSubtitle} numberOfLines={1}>{selected.subtitle}</Text>
              {selected.markerType === 'product' ? (
                <Text style={styles.sheetPrice}>{formatPrice(selected.price)}</Text>
              ) : (
                <Text style={styles.sheetPrice}>
                  {selected.listingCount || 0} active listing{(selected.listingCount || 0) === 1 ? '' : 's'}
                </Text>
              )}
            </View>
          </View>
          <Pressable style={styles.sheetBtn} onPress={openSelected}>
            <Text style={styles.sheetBtnText}>
              {selected.markerType === 'product' ? 'View product' : 'View shop profile'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : null}
      {loading && markers.length === 0 ? <ScreenLoader overlay label="Loading map" /> : null}
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  gridCol: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.55,
  },
  mapRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.glow,
  },
  youPin: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 22,
    height: 22,
    marginLeft: -11,
    marginTop: -11,
    borderRadius: 11,
    backgroundColor: colors.glow,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryBright,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  topTitleWrap: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  topSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  controls: {
    position: 'absolute',
    top: 96,
    left: 12,
    right: 12,
    gap: 8,
  },
  chipRow: {
    gap: 8,
    paddingRight: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.onPrimary,
  },
  pin: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinActive: {
    transform: [{ scale: 1.12 }],
    borderColor: colors.warning,
  },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sheetImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: colors.background,
  },
  sheetImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetBody: {
    flex: 1,
    gap: 4,
  },
  sheetBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sheetBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  sheetDistance: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sheetPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 2,
  },
  sheetBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  sheetBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onPrimary,
  },
});
