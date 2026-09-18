import { resolveCategoryImageUrl } from '../utils/categories';
import {
  IconElectronics,
  IconFashion,
  IconFurniture,
  IconLaptop,
  IconMobile,
  IconShop,
  IconVehicle,
} from './Icons';

const ICON_MAP = {
  Mobiles: IconMobile,
  Laptops: IconLaptop,
  Electronics: IconElectronics,
  Furniture: IconFurniture,
  Vehicles: IconVehicle,
  Fashion: IconFashion,
};

function CategoryIcon({ cat, small }) {
  const Icon = ICON_MAP[cat.name] || IconShop;
  const color = cat.color || '#047857';
  if (cat.imageUrl) {
    return (
      <img
        src={resolveCategoryImageUrl(cat.imageUrl)}
        alt=""
        className={`explore-cat-rail-img${small ? ' small' : ''}`}
      />
    );
  }
  return (
    <span className="explore-cat-rail-icon" style={{ '--cat-color': color }}>
      <Icon width={small ? 14 : 16} height={small ? 14 : 16} />
    </span>
  );
}

export default function ExploreCategoryRail({
  categories,
  category,
  categoryCounts,
  onCategoryChange,
  loading,
}) {
  const getCount = (name) => {
    if (name === 'All') return categoryCounts.total ?? 0;
    return categoryCounts.counts?.[name] ?? 0;
  };

  return (
    <div className="explore-category-rail-wrap">
      <div className="explore-category-rail" role="tablist" aria-label="Categories">
        {categories.map((cat) => {
          const active = category === cat.name;
          const count = getCount(cat.name);
          return (
            <button
              key={cat.id || cat.name}
              type="button"
              role="tab"
              aria-selected={active}
              className={`explore-cat-rail-item${active ? ' active' : ''}`}
              onClick={() => onCategoryChange(cat.name)}
            >
              <CategoryIcon cat={cat} small />
              <span className="explore-cat-rail-label">{cat.name}</span>
              <span className="explore-cat-rail-count">
                {loading ? '…' : count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
