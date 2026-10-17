const PLACES = [
  { name: 'Kathmandu, Bagmati', lat: 27.7172, lng: 85.324 },
  { name: 'Lalitpur, Bagmati', lat: 27.6728, lng: 85.3116 },
  { name: 'Bhaktapur, Bagmati', lat: 27.6717, lng: 85.4293 },
  { name: 'Kirtipur, Bagmati', lat: 27.6775, lng: 85.2825 },
  { name: 'Madhyapur Thimi, Bagmati', lat: 27.6739, lng: 85.3897 },
  { name: 'Tokha, Bagmati', lat: 27.7456, lng: 85.3344 },
  { name: 'Kageshwori, Bagmati', lat: 27.735, lng: 85.3886 },
  { name: 'Gokarneshwor, Bagmati', lat: 27.7518, lng: 85.3617 },
  { name: 'Chandragiri, Bagmati', lat: 27.6833, lng: 85.2486 },
  { name: 'Budhanilkantha, Bagmati', lat: 27.7717, lng: 85.3606 },
  { name: 'Tarakeshwor, Bagmati', lat: 27.7958, lng: 85.3194 },
  { name: 'Nagarjun, Bagmati', lat: 27.7186, lng: 85.2575 },
  { name: 'Dakshinkali, Bagmati', lat: 27.6, lng: 85.3 },
  { name: 'Shankharapur, Bagmati', lat: 27.6569, lng: 85.4583 },
  { name: 'Pokhara, Gandaki', lat: 28.2096, lng: 83.9856 },
  { name: 'Lekhnath, Gandaki', lat: 28.223, lng: 84.0264 },
  { name: 'Bharatpur, Bagmati', lat: 27.6866, lng: 84.4317 },
  { name: 'Ratnanagar, Bagmati', lat: 27.6739, lng: 84.5139 },
  { name: 'Birgunj, Madhesh', lat: 27.0147, lng: 84.8746 },
  { name: 'Butwal, Lumbini', lat: 27.6866, lng: 83.4322 },
  { name: 'Tilottama, Lumbini', lat: 27.6486, lng: 83.4797 },
  { name: 'Dhangadhi, Sudurpashchim', lat: 28.7033, lng: 80.5844 },
  { name: 'Nepalgunj, Lumbini', lat: 28.05, lng: 81.6167 },
  { name: 'Itahari, Koshi', lat: 26.6658, lng: 87.2719 },
  { name: 'Biratnagar, Koshi', lat: 26.4541, lng: 87.2717 },
  { name: 'Dharan, Koshi', lat: 26.8144, lng: 87.2808 },
  { name: 'Janakpur, Madhesh', lat: 26.7288, lng: 85.9186 },
  { name: 'Hetauda, Bagmati', lat: 27.4244, lng: 85.0344 },
  { name: 'Dulegaunda, Gandaki', lat: 27.9944, lng: 84.1847 },
  { name: 'Tansen, Lumbini', lat: 27.8656, lng: 83.5444 },
  { name: 'Ghorahi, Lumbini', lat: 28.06, lng: 82.4889 },
  { name: 'Chitwan, Bagmati', lat: 27.5291, lng: 84.3544 },
  { name: 'Banepa, Bagmati', lat: 27.6294, lng: 85.5217 },
  { name: 'Dhulikhel, Bagmati', lat: 27.6197, lng: 85.5594 },
  { name: 'Panauti, Bagmati', lat: 27.5858, lng: 85.5164 },
  { name: 'Bungamati, Bagmati', lat: 27.6472, lng: 85.2969 },
  { name: 'Thankot, Bagmati', lat: 27.69, lng: 85.26 },
  { name: 'Balaju, Bagmati', lat: 27.7278, lng: 85.3014 },
  { name: 'Kalanki, Bagmati', lat: 27.6975, lng: 85.2828 },
  { name: 'Maharajgunj, Bagmati', lat: 27.7375, lng: 85.325 },
  { name: 'New Baneshwor, Bagmati', lat: 27.6897, lng: 85.3456 },
  { name: 'Thamel, Bagmati', lat: 27.7144, lng: 85.3125 },
  { name: 'Boudha, Bagmati', lat: 27.7225, lng: 85.3619 },
  { name: 'Patan, Bagmati', lat: 27.6717, lng: 85.3256 },
  { name: 'Baneswor, Bagmati', lat: 27.6903, lng: 85.3411 },
  { name: 'Pulchowk, Bagmati', lat: 27.6847, lng: 85.3169 },
  { name: 'Durbar Marg, Bagmati', lat: 27.7125, lng: 85.3208 },
];

function placeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function coordsForPlaceName(name) {
  const raw = placeKey(name);
  if (!raw) return null;
  const exact = PLACES.find((loc) => placeKey(loc.name) === raw);
  if (exact) return { lat: exact.lat, lng: exact.lng };
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const matches = PLACES.filter((loc) => {
    const known = placeKey(loc.name).split(',')[0].trim();
    return parts.some((part) => part === known) || raw.startsWith(`${known} `);
  });
  if (!matches.length) return null;
  matches.sort((a, b) => placeKey(b.name).length - placeKey(a.name).length);
  return { lat: matches[0].lat, lng: matches[0].lng };
}

module.exports = { coordsForPlaceName };
