const SHOP_CATEGORIES = [
  'Mobiles',
  'Laptops',
  'Electronics',
  'Furniture',
  'Vehicles',
  'Clothing',
  'Grocery',
  'Other',
];

function mapShopCategory(raw) {
  const value = String(raw || '').trim();
  return value || 'Other';
}

module.exports = { SHOP_CATEGORIES, mapShopCategory };
