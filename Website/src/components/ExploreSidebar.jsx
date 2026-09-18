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
        className="explore-sidebar-cat-img"
      />
    );
  }
  return (
    <span className="explore-sidebar-cat-icon" style={{ '--cat-color': color }}>
      <Icon width={18} height={18} />
    </span>
  );
}

export default function ExploreSidebar({
  categories,
  category,
  categoryCounts,
  onCategoryChange,
  resultTotal,
  countsLoading,
  className = '',
}) {
  const getCount = (name) => {
    if (name === 'All') return categoryCounts?.total ?? 0;
    return categoryCounts?.counts?.[name] ?? 0;
  };

  return (
    <aside className={`explore-sidebar ${className}`.trim()}>
      <div className="explore-sidebar-card">
        <div className="explore-sidebar-head">
          <h2>Categories</h2>
        </div>

        <ul className="explore-sidebar-categories">
          {categories.map((cat) => {
            const active = category === cat.name;
            const count = getCount(cat.name);
            return (
              <li key={cat.id || cat.name}>
                <button
                  type="button"
                  className={`explore-sidebar-cat${active ? ' active' : ''}`}
                  onClick={() => onCategoryChange(cat.name)}
                >
                  <CategoryIcon cat={cat} />
                  <span className="explore-sidebar-cat-name">{cat.name}</span>
                  <span className="explore-sidebar-cat-count">
                    {countsLoading ? '…' : count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="explore-sidebar-foot">
          {countsLoading ? (
            <span className="explore-sidebar-foot-loading">Updating…</span>
          ) : (
            <span>{resultTotal ?? 0} listing{(resultTotal ?? 0) === 1 ? '' : 's'} shown</span>
          )}
        </div>
      </div>
    </aside>
  );
}
