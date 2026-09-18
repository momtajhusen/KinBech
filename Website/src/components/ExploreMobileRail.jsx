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

function CategoryIcon({ cat }) {
  const Icon = ICON_MAP[cat.name] || IconShop;
  const color = cat.color || '#047857';
  if (cat.imageUrl) {
    return (
      <img
        src={resolveCategoryImageUrl(cat.imageUrl)}
        alt=""
        className="explore-rail-icon-img"
      />
    );
  }
  return (
    <span className="explore-rail-icon" style={{ '--cat-color': color }}>
      <Icon width={16} height={16} />
    </span>
  );
}

export default function ExploreMobileRail({
  categories,
  category,
  categoryCounts,
  onCategoryChange,
  countsLoading,
}) {
  const getCount = (name) => {
    if (name === 'All') return categoryCounts?.total ?? 0;
    return categoryCounts?.counts?.[name] ?? 0;
  };

  return (
    <aside className="explore-mobile-rail" aria-label="Categories">
      <div className="explore-mobile-rail-scroll">
        {categories.map((cat) => {
          const active = category === cat.name;
          const count = getCount(cat.name);
          return (
            <button
              key={cat.id || cat.name}
              type="button"
              className={`explore-rail-item${active ? ' active' : ''}`}
              onClick={() => onCategoryChange(cat.name)}
              aria-current={active ? 'true' : undefined}
            >
              {active ? <span className="explore-rail-indicator" aria-hidden /> : null}
              <CategoryIcon cat={cat} />
              <span className="explore-rail-label">{cat.name}</span>
              <span className="explore-rail-count">
                {countsLoading ? '…' : count}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
