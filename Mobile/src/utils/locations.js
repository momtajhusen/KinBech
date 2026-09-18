export const NEPAL_LOCATIONS = [
  { name: 'Kathmandu, Bagmati', lat: 27.7172, lng: 85.3240 },
  { name: 'Lalitpur, Bagmati', lat: 27.6728, lng: 85.3116 },
  { name: 'Bhaktapur, Bagmati', lat: 27.6717, lng: 85.4293 },
  { name: 'Kirtipur, Bagmati', lat: 27.6775, lng: 85.2825 },
  { name: 'Madhyapur Thimi, Bagmati', lat: 27.6739, lng: 85.3897 },
  { name: 'Tokha, Bagmati', lat: 27.7456, lng: 85.3344 },
  { name: 'Kageshwori, Bagmati', lat: 27.7350, lng: 85.3886 },
  { name: 'Gokarneshwor, Bagmati', lat: 27.7518, lng: 85.3617 },
  { name: 'Chandragiri, Bagmati', lat: 27.6833, lng: 85.2486 },
  { name: 'Budhanilkantha, Bagmati', lat: 27.7717, lng: 85.3606 },
  { name: 'Tarakeshwor, Bagmati', lat: 27.7958, lng: 85.3194 },
  { name: 'Nagarjun, Bagmati', lat: 27.7186, lng: 85.2575 },
  { name: 'Dakshinkali, Bagmati', lat: 27.6000, lng: 85.3000 },
  { name: 'Shankharapur, Bagmati', lat: 27.6569, lng: 85.4583 },
  { name: 'Pokhara, Gandaki', lat: 28.2096, lng: 83.9856 },
  { name: 'Lekhnath, Gandaki', lat: 28.2230, lng: 84.0264 },
  { name: 'Bharatpur, Bagmati', lat: 27.6866, lng: 84.4317 },
  { name: 'Ratnanagar, Bagmati', lat: 27.6739, lng: 84.5139 },
  { name: 'Birgunj, Madhesh', lat: 27.0147, lng: 84.8746 },
  { name: 'Butwal, Lumbini', lat: 27.6866, lng: 83.4322 },
  { name: 'Tilottama, Lumbini', lat: 27.6486, lng: 83.4797 },
  { name: 'Dhangadhi, Sudurpashchim', lat: 28.7033, lng: 80.5844 },
  { name: 'Nepalgunj, Lumbini', lat: 28.0500, lng: 81.6167 },
  { name: 'Itahari, Koshi', lat: 26.6658, lng: 87.2719 },
  { name: 'Biratnagar, Koshi', lat: 26.4541, lng: 87.2717 },
  { name: 'Dharan, Koshi', lat: 26.8144, lng: 87.2808 },
  { name: 'Janakpur, Madhesh', lat: 26.7288, lng: 85.9186 },
  { name: 'Hetauda, Bagmati', lat: 27.4244, lng: 85.0344 },
  { name: 'Dulegaunda, Gandaki', lat: 27.9944, lng: 84.1847 },
  { name: 'Tansen, Lumbini', lat: 27.8656, lng: 83.5444 },
  { name: 'Ghorahi, Lumbini', lat: 28.0600, lng: 82.4889 },
  { name: 'Chitwan, Bagmati', lat: 27.5291, lng: 84.3544 },
  { name: 'Banepa, Bagmati', lat: 27.6294, lng: 85.5217 },
  { name: 'Dhulikhel, Bagmati', lat: 27.6197, lng: 85.5594 },
  { name: 'Panauti, Bagmati', lat: 27.5858, lng: 85.5164 },
  { name: 'Bungamati, Bagmati', lat: 27.6472, lng: 85.2969 },
  { name: 'Thankot, Bagmati', lat: 27.6900, lng: 85.2600 },
  { name: 'Balaju, Bagmati', lat: 27.7278, lng: 85.3014 },
  { name: 'Kalanki, Bagmati', lat: 27.6975, lng: 85.2828 },
  { name: 'Maharajgunj, Bagmati', lat: 27.7375, lng: 85.3250 },
  { name: 'New Baneshwor, Bagmati', lat: 27.6897, lng: 85.3456 },
  { name: 'Thamel, Bagmati', lat: 27.7144, lng: 85.3125 },
  { name: 'Boudha, Bagmati', lat: 27.7225, lng: 85.3619 },
  { name: 'Patan, Bagmati', lat: 27.6717, lng: 85.3256 },
  { name: 'Baneswor, Bagmati', lat: 27.6903, lng: 85.3411 },
  { name: 'Pulchowk, Bagmati', lat: 27.6847, lng: 85.3169 },
  { name: 'Durbar Marg, Bagmati', lat: 27.7125, lng: 85.3208 },
];

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' || typeof lng2 !== 'number'
  ) return Infinity;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a1 = toRad(lat1);
  const a2 = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getLocationSuggestions(query, userCoords, limit = 6) {
  const q = (query || '').toString().trim().toLowerCase();

  let pool = NEPAL_LOCATIONS.slice();

  if (q) {
    pool = pool
      .map((loc) => {
        const name = loc.name.toLowerCase();
        const parts = q.split(/\s+/).filter(Boolean);
        let score = 0;
        if (name === q) score += 100;
        if (name.startsWith(q)) score += 60;
        for (const p of parts) {
          if (name.includes(p)) score += 20;
          const tokens = name.split(/[,\s]+/).filter(Boolean);
          if (tokens.some((t) => t.startsWith(p))) score += 10;
        }
        return { loc, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.loc);
  }

  if (userCoords?.lat != null && userCoords?.lng != null) {
    const ulat = Number(userCoords.lat);
    const ulng = Number(userCoords.lng);
    pool = pool
      .map((loc) => ({
        loc,
        distance: haversineKm(ulat, ulng, loc.lat, loc.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((x) => ({
        ...x.loc,
        distanceKm: x.distance,
      }));
  }

  return pool.slice(0, limit);
}

export function findNearestLocation(lat, lng) {
  if (lat == null || lng == null) return null;
  const list = getLocationSuggestions('', { lat, lng }, 1);
  return list[0] || null;
}

export function formatCityDistrict(addr, emptyFallback = '') {
  if (!addr) return emptyFallback;
  const city = addr.city || addr.subregion || addr.district || '';
  const district = addr.district || addr.subregion || '';
  const parts = [];
  if (city && city !== district) parts.push(city);
  if (district && !parts.includes(district)) parts.push(district);
  if (!parts.length) {
    const fallback = addr.region || addr.subregion || addr.city || emptyFallback;
    if (fallback) parts.push(fallback);
  }
  return parts.join(', ');
}

export function formatDistanceKm(km) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 50) return `${km.toFixed(1)} km away`;
  return '';
}
