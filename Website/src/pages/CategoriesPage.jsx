import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import { api } from '../services/api';
import { normalizeCategoriesResponse, resolveCategoryImageUrl } from '../utils/categories';
import {
  IconElectronics,
  IconFashion,
  IconFurniture,
  IconLaptop,
  IconMobile,
  IconShop,
  IconVehicle,
} from '../components/Icons';

const ICON_MAP = {
  Mobiles: IconMobile,
  Laptops: IconLaptop,
  Electronics: IconElectronics,
  Furniture: IconFurniture,
  Vehicles: IconVehicle,
  Fashion: IconFashion,
};

function CategoryBlock({ title, subtitle, items, type }) {
  return (
    <section className="page-block">
      <div className="page-block-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="page-category-grid">
        {items.map((cat) => {
          const Icon = ICON_MAP[cat.name] || IconShop;
          const color = cat.color || '#047857';
          return (
            <Link
              key={cat.id || cat.name}
              to={`/explore?category=${encodeURIComponent(cat.name)}`}
              className="page-category-card"
              style={{ '--cat-color': color }}
            >
              <div className="page-category-icon">
                {cat.imageUrl ? (
                  <img src={resolveCategoryImageUrl(cat.imageUrl)} alt="" />
                ) : (
                  <Icon width={24} height={24} />
                )}
              </div>
              <div>
                <h3>{cat.name}</h3>
                {cat.description ? <p>{cat.description}</p> : null}
              </div>
              <span className="page-category-arrow">→</span>
            </Link>
          );
        })}
      </div>
      <Link to={`/explore${type === 'shop' ? '' : ''}`} className="page-inline-cta">
        Browse all {type === 'shop' ? 'shops' : 'listings'} in Explore →
      </Link>
    </section>
  );
}

export default function CategoriesPage() {
  const [productCats, setProductCats] = useState([]);
  const [shopCats, setShopCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getCategories('product'),
      api.getCategories('shop'),
    ])
      .then(([prod, shop]) => {
        setProductCats(normalizeCategoriesResponse(prod, 'product'));
        setShopCats(normalizeCategoriesResponse(shop, 'shop'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell
      label="Categories"
      title="Browse by category"
      subtitle="From daily essentials to big purchases — find what you need nearby in Kathmandu, Pokhara, and across Nepal."
    >
      <div className="container">
        {loading ? <p className="page-loading">Loading categories…</p> : null}

        <CategoryBlock
          title="Product categories"
          subtitle="Items posted by individuals and shops — phones, furniture, vehicles, and more."
          items={productCats}
          type="product"
        />

        <CategoryBlock
          title="Shop categories"
          subtitle="Local businesses on KinBech — kirana, electronics, fashion, pharmacy, and more."
          items={shopCats}
          type="shop"
        />

        <section className="page-info-card">
          <h3>How categories work</h3>
          <ul>
            <li>Tap any category to open Explore with that filter applied.</li>
            <li>Categories are managed by KinBech admin and match the mobile app.</li>
            <li>Sellers pick a category when posting — buyers filter the same way.</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
