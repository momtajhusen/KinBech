const { haversineDistanceKm } = require('./listing');

const ALLOWED_RADIUS_KM = [2, 5, 10, 25];

function parseGeoQuery(query = {}) {
  const lat = query.lat != null && query.lat !== '' ? Number(query.lat) : null;
  const lng = query.lng != null && query.lng !== '' ? Number(query.lng) : null;
  const requestedRadius = Number(query.radius);
  const radiusKm = ALLOWED_RADIUS_KM.includes(requestedRadius) ? requestedRadius : 5;

  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radiusKm,
  };
}

function readCoords(source) {
  if (!source) return null;
  const c = source.coordinates || source;
  const lat = Number(c.lat != null ? c.lat : c.latitude);
  const lng = Number(c.lng != null ? c.lng : c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceFrom(userLat, userLng, point) {
  if (userLat == null || userLng == null || !point) return null;
  const km = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
  return Number.isFinite(km) ? Math.round(km * 10) / 10 : null;
}

function withinRadius(userLat, userLng, point, radiusKm) {
  const distance = distanceFrom(userLat, userLng, point);
  if (distance == null) return false;
  return distance <= radiusKm;
}

function boundingDelta(radiusKm, lat) {
  const safeLat = Number.isFinite(lat) ? lat : 27.7172;
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.max(Math.cos((safeLat * Math.PI) / 180), 0.2));
  return { latDelta, lngDelta };
}

module.exports = {
  ALLOWED_RADIUS_KM,
  parseGeoQuery,
  readCoords,
  distanceFrom,
  withinRadius,
  boundingDelta,
};
