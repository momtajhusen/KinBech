import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Circle, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from 'react-native-maps';
import Icon from './Icon';

export const SHOP_TINT = '#3B82F6';
export const APPROX_TINT = '#F59E0B';

const mapsConfig = Constants.expoConfig?.extra?.maps || {};

// Android Google Maps crashes without an API key in the native manifest.
export const STREET_MAP_READY = Platform.OS === 'ios' || Boolean(mapsConfig.android);
const MAP_PROVIDER = Platform.OS === 'android' || mapsConfig.iosGoogle ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

const MIN_DELTA = 0.0025;
const MAX_DELTA = 4;

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d2433' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a96a8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#151b26' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f3b33' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3546' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a4560' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f2a40' }] },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function distanceKmBetween(a, b) {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function regionFor(center, km) {
  const latitudeDelta = clamp((km * 2.4) / 111, MIN_DELTA, MAX_DELTA);
  const cos = Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta,
    longitudeDelta: latitudeDelta / cos,
  };
}

export function shortPrice(price) {
  const value = Number(price) || 0;
  if (value >= 10000000) return `${+(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `${+(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function markerTint(marker, colors) {
  return marker.markerType === 'shop' ? SHOP_TINT : colors.primary;
}

export function MapPin({ marker, active, colors }) {
  const tint = markerTint(marker, colors);
  const solid = marker.precision === 'exact' || active;
  const isShop = marker.markerType === 'shop';
  const label = isShop ? (marker.listingCount ? String(marker.listingCount) : '') : `Rs ${shortPrice(marker.price)}`;
  const fg = solid ? '#fff' : tint;
  return (
    <View style={pinStyles.wrap}>
      <View
        style={[
          pinStyles.head,
          { backgroundColor: solid ? tint : colors.surface, borderColor: tint },
          active && pinStyles.headActive,
        ]}
      >
        <Icon name={isShop ? 'storefront' : 'cube'} size={active ? 14 : 12} color={fg} />
        {label ? (
          <Text style={[pinStyles.label, { color: fg }, active && pinStyles.labelActive]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
      <View style={[pinStyles.tail, { borderTopColor: tint }]} />
    </View>
  );
}

function ClusterPin({ count, colors }) {
  return (
    <View style={[pinStyles.cluster, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
      <Text style={pinStyles.clusterText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function groupMarkers(markers, keyFor) {
  const groups = new Map();
  for (const marker of markers) {
    const key = keyFor(marker);
    if (key == null) continue;
    const group = groups.get(key);
    if (group) group.items.push(marker);
    else groups.set(key, { id: `g-${key}`, items: [marker] });
  }
  return [...groups.values()].map((group) => {
    const lat = group.items.reduce((sum, m) => sum + m.lat, 0) / group.items.length;
    const lng = group.items.reduce((sum, m) => sum + m.lng, 0) / group.items.length;
    return { ...group, lat, lng };
  });
}

function spanKm(items) {
  let max = 0;
  for (const a of items) {
    for (const b of items) {
      const d = distanceKmBetween({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });
      if (d > max) max = d;
    }
  }
  return max;
}

export const StreetMap = forwardRef(function StreetMap(
  { center, radiusKm, markers, selected, onSelect, onRegionSettled, mapType, isDark, colors, padding },
  ref,
) {
  const mapRef = useRef(null);
  const regionRef = useRef(regionFor(center, radiusKm));
  const [cellDelta, setCellDelta] = useState(() => 2 ** Math.round(Math.log2(regionRef.current.latitudeDelta)));
  const [trackViews, setTrackViews] = useState(true);

  const selectedId = selected?.id || null;

  useEffect(() => {
    setTrackViews(true);
    const timer = setTimeout(() => setTrackViews(false), 800);
    return () => clearTimeout(timer);
  }, [markers, selectedId, cellDelta, isDark]);

  useImperativeHandle(ref, () => ({
    zoomBy(factor) {
      const region = regionRef.current;
      const latitudeDelta = clamp(region.latitudeDelta * factor, MIN_DELTA, MAX_DELTA);
      mapRef.current?.animateToRegion(
        { ...region, latitudeDelta, longitudeDelta: (region.longitudeDelta / region.latitudeDelta) * latitudeDelta },
        260,
      );
    },
    fit(nextCenter, km) {
      mapRef.current?.animateToRegion(regionFor(nextCenter, km), 450);
    },
    focus(marker) {
      const region = regionRef.current;
      const latitudeDelta = Math.min(region.latitudeDelta, 0.03);
      const cos = Math.max(0.2, Math.cos((marker.lat * Math.PI) / 180));
      mapRef.current?.animateToRegion(
        { latitude: marker.lat, longitude: marker.lng, latitudeDelta, longitudeDelta: latitudeDelta / cos },
        380,
      );
    },
  }), []);

  const groups = useMemo(() => {
    const cell = cellDelta / 9;
    return groupMarkers(markers, (m) => `${Math.floor(m.lat / cell)}:${Math.floor(m.lng / cell)}`);
  }, [markers, cellDelta]);

  const pressGroup = (group) => {
    if (group.items.length === 1 || spanKm(group.items) < 0.05 || regionRef.current.latitudeDelta <= MIN_DELTA * 1.5) {
      onSelect(group.items[0]);
      return;
    }
    mapRef.current?.fitToCoordinates(
      group.items.map((m) => ({ latitude: m.lat, longitude: m.lng })),
      { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true },
    );
  };

  const showSelectedArea = selected && selected.precision && selected.precision !== 'exact';

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={MAP_PROVIDER}
      initialRegion={regionRef.current}
      customMapStyle={isDark && MAP_PROVIDER === PROVIDER_GOOGLE ? DARK_MAP_STYLE : []}
      userInterfaceStyle={isDark ? 'dark' : 'light'}
      mapType={mapType}
      mapPadding={padding}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      showsIndoors={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      onPress={(event) => {
        if (event?.nativeEvent?.action === 'marker-press') return;
        onSelect(null);
      }}
      onRegionChangeComplete={(region, details) => {
        regionRef.current = region;
        setCellDelta(2 ** Math.round(Math.log2(region.latitudeDelta)));
        if (details?.isGesture !== false) onRegionSettled?.(region);
      }}
    >
      <Circle
        center={{ latitude: center.latitude, longitude: center.longitude }}
        radius={radiusKm * 1000}
        strokeColor={colors.primary}
        strokeWidth={2}
        fillColor={colors.glow}
      />
      {showSelectedArea ? (
        <Circle
          center={{ latitude: selected.lat, longitude: selected.lng }}
          radius={selected.accuracyM || 400}
          strokeColor={APPROX_TINT}
          strokeWidth={1.5}
          fillColor="rgba(245, 158, 11, 0.14)"
          lineDashPattern={[6, 6]}
        />
      ) : null}
      {groups.map((group) => {
        if (group.items.length > 1) {
          return (
            <Marker
              key={group.id}
              coordinate={{ latitude: group.lat, longitude: group.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={trackViews}
              onPress={() => pressGroup(group)}
            >
              <ClusterPin count={group.items.length} colors={colors} />
            </Marker>
          );
        }
        const marker = group.items[0];
        const active = marker.id === selectedId;
        return (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={active ? 10 : 1}
            tracksViewChanges={trackViews}
            onPress={() => onSelect(marker)}
          >
            <MapPin marker={marker} active={active} colors={colors} />
          </Marker>
        );
      })}
    </MapView>
  );
});

const TILE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 19;
const MAX_TILE_ZOOM = 19;
const SCALE_STEPS_M = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

// Keyless public tile servers block apps, so tiles come from a keyed provider template, e.g.
// https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}@2x.png?key=YOUR_KEY
const TILE_TEMPLATE = process.env.EXPO_PUBLIC_MAP_TILES_URL || '';
const TILE_TEMPLATE_DARK = process.env.EXPO_PUBLIC_MAP_TILES_DARK_URL || TILE_TEMPLATE;
const TILE_CREDIT = process.env.EXPO_PUBLIC_MAP_TILES_CREDIT || '© OpenStreetMap contributors';
export const TILE_MAP_READY = Boolean(TILE_TEMPLATE);

function tileUrl(z, x, y, isDark) {
  const template = isDark ? TILE_TEMPLATE_DARK : TILE_TEMPLATE;
  if (!template) return '';
  return template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

function worldPoint(lat, lng, zoom) {
  const scale = TILE * 2 ** zoom;
  const sin = clamp(Math.sin((lat * Math.PI) / 180), -0.9999, 0.9999);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToCoords(x, y, zoom) {
  const scale = TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return {
    latitude: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    longitude: (x / scale) * 360 - 180,
  };
}

function metersPerPixel(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function zoomForKm(lat, km, px) {
  return clamp(Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180) * px) / (km * 1000)), MIN_ZOOM, MAX_ZOOM);
}

/** OpenStreetMap tile map used until the Google Maps key ships in the native build. */
export const PreviewMap = forwardRef(function PreviewMap(
  { center, radiusKm, markers, selected, onSelect, onRegionSettled, userCoords, gpsAccuracy, isDark, colors, padding },
  ref,
) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ latitude: center.latitude, longitude: center.longitude, zoom: null });
  const pan = useRef(new Animated.ValueXY()).current;
  const pinch = useRef(new Animated.Value(1)).current;
  const gestureRef = useRef({ startDist: 0, scale: 1 });
  const liveRef = useRef(null);

  const top = padding?.top || 0;
  const bottom = padding?.bottom || 0;
  const visibleHeight = Math.max(80, size.height - top - bottom);
  const fitPx = Math.max(80, Math.min(size.width, visibleHeight)) / 2;
  const cx = size.width / 2;
  const cy = top + visibleHeight / 2;
  const zoom = view.zoom ?? (size.width ? zoomForKm(view.latitude, radiusKm * 1.15, fitPx) : 12);

  useEffect(() => {
    liveRef.current = { view, zoom, cx, cy, width: size.width, height: size.height, onRegionSettled };
  });

  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    pinch.setValue(1);
  }, [view, pan, pinch]);

  useImperativeHandle(ref, () => ({
    zoomBy(factor) {
      setView((current) => ({ ...current, zoom: clamp(zoom - Math.log2(factor), MIN_ZOOM, MAX_ZOOM) }));
    },
    fit(nextCenter, km) {
      setView({
        latitude: nextCenter.latitude,
        longitude: nextCenter.longitude,
        zoom: zoomForKm(nextCenter.latitude, km * 1.15, fitPx),
      });
    },
    focus(marker) {
      setView({ latitude: marker.lat, longitude: marker.lng, zoom: Math.max(zoom, 15) });
    },
  }), [zoom, fitPx]);

  const responder = useMemo(() => {
    const finish = (dx, dy) => {
      const live = liveRef.current;
      if (!live) return;
      const scale = gestureRef.current.scale || 1;
      const ox = live.width / 2;
      const oy = live.height / 2;
      const qx = ox + (live.cx - ox - dx) / scale;
      const qy = oy + (live.cy - oy - dy) / scale;
      const base = worldPoint(live.view.latitude, live.view.longitude, live.zoom);
      const coords = worldToCoords(base.x + (qx - live.cx), base.y + (qy - live.cy), live.zoom);
      const nextZoom = clamp(live.zoom + Math.log2(scale), MIN_ZOOM, MAX_ZOOM);
      gestureRef.current = { startDist: 0, scale: 1 };
      setView({ ...coords, zoom: nextZoom });
      live.onRegionSettled?.(coords);
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        g.numberActiveTouches > 1 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        gestureRef.current = { startDist: 0, scale: 1 };
      },
      onPanResponderMove: (event, g) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (!gestureRef.current.startDist) gestureRef.current.startDist = dist;
          const scale = clamp(dist / gestureRef.current.startDist, 0.25, 4);
          gestureRef.current.scale = scale;
          pinch.setValue(scale);
        }
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => finish(g.dx, g.dy),
      onPanResponderTerminate: (_, g) => finish(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
    });
  }, [pan, pinch]);

  const centerPx = worldPoint(view.latitude, view.longitude, zoom);
  const project = (lat, lng) => {
    const p = worldPoint(lat, lng, zoom);
    return { x: cx + p.x - centerPx.x, y: cy + p.y - centerPx.y };
  };

  const tiles = [];
  if (size.width) {
    const tz = clamp(Math.floor(zoom), MIN_ZOOM, MAX_TILE_ZOOM);
    const tileScale = 2 ** (zoom - tz);
    const tileSize = TILE * tileScale;
    const base = worldPoint(view.latitude, view.longitude, tz);
    const count = 2 ** tz;
    const minX = Math.floor((base.x - cx / tileScale) / TILE) - 1;
    const maxX = Math.floor((base.x + (size.width - cx) / tileScale) / TILE) + 1;
    const minY = Math.floor((base.y - cy / tileScale) / TILE) - 1;
    const maxY = Math.floor((base.y + (size.height - cy) / tileScale) / TILE) + 1;
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = Math.max(0, minY); y <= Math.min(count - 1, maxY); y += 1) {
        const wrapped = ((x % count) + count) % count;
        tiles.push({
          key: `${tz}/${x}/${y}`,
          uri: tileUrl(tz, wrapped, y, isDark),
          left: cx + (x * TILE - base.x) * tileScale,
          top: cy + (y * TILE - base.y) * tileScale,
          size: tileSize + 0.5,
        });
      }
    }
  }

  const mpp = metersPerPixel(view.latitude, zoom);
  const pxPerKm = 1000 / mpp;

  const groups = useMemo(() => {
    if (!size.width) return [];
    const cellPx = 40;
    const z = zoom;
    const c = worldPoint(view.latitude, view.longitude, z);
    return groupMarkers(markers, (m) => {
      const p = worldPoint(m.lat, m.lng, z);
      const x = cx + p.x - c.x;
      const y = cy + p.y - c.y;
      if (x < -60 || y < -60 || x > size.width + 60 || y > size.height + 60) return null;
      return `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    });
  }, [markers, zoom, view.latitude, view.longitude, cx, cy, size.width, size.height]);

  const circle = (point, radiusPx, style) => (
    <View
      pointerEvents="none"
      style={[
        style,
        { width: radiusPx * 2, height: radiusPx * 2, borderRadius: radiusPx, left: point.x - radiusPx, top: point.y - radiusPx },
      ]}
    />
  );

  const searchPoint = project(center.latitude, center.longitude);
  const user = userCoords ? project(userCoords.latitude, userCoords.longitude) : null;
  const accuracyPx = gpsAccuracy ? Math.max(10, gpsAccuracy / mpp) : 0;
  const selectedPoint = selected ? project(selected.lat, selected.lng) : null;
  const selectedAreaPx = selected && selected.precision !== 'exact' ? Math.max(14, (selected.accuracyM || 400) / mpp) : 0;

  const scaleMeters = [...SCALE_STEPS_M].reverse().find((m) => m / mpp <= 96) || SCALE_STEPS_M[0];
  const scaleLabel = scaleMeters >= 1000 ? `${scaleMeters / 1000} km` : `${scaleMeters} m`;

  const pressGroup = (group) => {
    if (group.items.length === 1 || spanKm(group.items) < 0.05 || zoom >= MAX_ZOOM - 0.5) {
      onSelect(group.items[0]);
      return;
    }
    setView({ latitude: group.lat, longitude: group.lng, zoom: clamp(zoom + 1.5, MIN_ZOOM, MAX_ZOOM) });
  };

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: TILE_MAP_READY ? (isDark ? '#1d2433' : '#f2efe9') : colors.background },
      ]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) setSize({ width, height });
      }}
      {...responder.panHandlers}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: pinch }] },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)}>
          {tiles.map((tile) =>
            tile.uri ? (
              <Image
                key={tile.key}
                source={{ uri: tile.uri }}
                fadeDuration={120}
                style={[previewStyles.tile, { left: tile.left, top: tile.top, width: tile.size, height: tile.size }]}
              />
            ) : (
              <View
                key={tile.key}
                style={[
                  previewStyles.tile,
                  previewStyles.gridTile,
                  { left: tile.left, top: tile.top, width: tile.size, height: tile.size, borderColor: colors.border },
                ]}
              />
            ),
          )}
        </Pressable>
        {circle(searchPoint, radiusKm * pxPerKm, [previewStyles.radius, { borderColor: colors.primary }])}
        {selectedPoint && selectedAreaPx ? circle(selectedPoint, selectedAreaPx, previewStyles.area) : null}
        {user ? (
          <>
            {accuracyPx ? circle(user, accuracyPx, previewStyles.accuracy) : null}
            {circle(user, 9, previewStyles.userDot)}
          </>
        ) : null}
        {groups.map((group) => {
          const point = project(group.lat, group.lng);
          if (group.items.length > 1) {
            return (
              <Pressable
                key={group.id}
                hitSlop={6}
                onPress={() => pressGroup(group)}
                style={[previewStyles.abs, { left: point.x - 17, top: point.y - 17 }]}
              >
                <ClusterPin count={group.items.length} colors={colors} />
              </Pressable>
            );
          }
          const marker = group.items[0];
          const active = marker.id === selected?.id;
          return (
            <Pressable
              key={marker.id}
              hitSlop={6}
              onPress={() => onSelect(marker)}
              style={[
                previewStyles.abs,
                { left: point.x - 50, top: point.y - (active ? 39 : 33), width: 100, alignItems: 'center', zIndex: active ? 5 : 1 },
              ]}
            >
              <MapPin marker={marker} active={active} colors={colors} />
            </Pressable>
          );
        })}
      </Animated.View>

      <View pointerEvents="none" style={[previewStyles.scale, { bottom: bottom + 8 }]}>
        <View style={[previewStyles.scaleBar, { width: scaleMeters / mpp }]} />
        <Text style={previewStyles.scaleText}>{scaleLabel}</Text>
      </View>
      {TILE_MAP_READY ? (
        <Text pointerEvents="none" style={[previewStyles.credit, { bottom: bottom + 8 }]}>
          {TILE_CREDIT}
        </Text>
      ) : null}
    </View>
  );
});

const pinStyles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 28,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    borderWidth: 2,
    justifyContent: 'center',
  },
  headActive: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    maxWidth: 70,
  },
  labelActive: {
    fontSize: 13,
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  cluster: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
});

const previewStyles = StyleSheet.create({
  abs: {
    position: 'absolute',
  },
  tile: {
    position: 'absolute',
  },
  gridTile: {
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.7,
  },
  radius: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'rgba(4, 120, 87, 0.10)',
  },
  area: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: APPROX_TINT,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
  },
  accuracy: {
    position: 'absolute',
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
  },
  userDot: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#3B82F6',
  },
  scale: {
    position: 'absolute',
    left: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  scaleBar: {
    height: 4,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#1f2937',
  },
  scaleText: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    color: '#1f2937',
  },
  credit: {
    position: 'absolute',
    right: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 9,
    color: '#374151',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});
