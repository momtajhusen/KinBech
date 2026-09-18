import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { toCardItem, toSellerCard } from '../utils/listing';
import { normalizeCategoriesResponse } from '../utils/categories';
import { useGeolocation } from '../hooks/useGeolocation';
import ProductCard from '../components/ProductCard';
import SellerCard from '../components/SellerCard';
import ExploreFilterBar from '../components/ExploreFilterBar';
import ExploreFilterSheet from '../components/ExploreFilterSheet';
import ExploreMobileRail from '../components/ExploreMobileRail';
import ExploreSidebar from '../components/ExploreSidebar';
import ExplorePagination from '../components/ExplorePagination';
import { IconSearch } from '../components/Icons';
import Footer from '../components/Footer';
import { BRAND_TAGLINE } from '../content/brand';

const PAGE_SIZE = 20;

const SEARCH_TABS = [
  { id: 'all', label: 'All' },
  { id: 'products', label: 'Products' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'stores', label: 'Stores' },
];

const DEFAULT_FILTERS = {
  sort: 'newest',
  condition: 'All',
  minPrice: '',
  maxPrice: '',
  radius: '',
  sellerType: 'all',
};

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="explore-grid explore-grid-dense">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" />
      ))}
    </div>
  );
}

function buildListingParams(geoParams, filters, category, query, page = 1) {
  const params = {
    ...geoParams,
    sort: filters.sort,
    page,
    limit: PAGE_SIZE,
  };
  if (category && category !== 'All') params.category = category;
  if (filters.condition && filters.condition !== 'All') params.condition = filters.condition;
  if (filters.minPrice) params.minPrice = filters.minPrice;
  if (filters.maxPrice) params.maxPrice = filters.maxPrice;
  if (filters.radius) params.radius = filters.radius;
  if (filters.sellerType && filters.sellerType !== 'all') params.sellerType = filters.sellerType;
  if (query?.trim()) params.q = query.trim();
  return params;
}

function buildCountParams(geoParams, filters, query) {
  const params = { ...geoParams };
  if (filters.condition && filters.condition !== 'All') params.condition = filters.condition;
  if (filters.minPrice) params.minPrice = filters.minPrice;
  if (filters.maxPrice) params.maxPrice = filters.maxPrice;
  if (filters.sellerType && filters.sellerType !== 'all') params.sellerType = filters.sellerType;
  if (query?.trim()) params.q = query.trim();
  return params;
}

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const { coords, status: geoStatus } = useGeolocation();

  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState(params.get('q') || '');
  const [searchTab, setSearchTab] = useState('all');
  const [category, setCategory] = useState(params.get('category') || 'All');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [categories, setCategories] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({ counts: {}, total: 0 });
  const [countsLoading, setCountsLoading] = useState(true);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [listings, setListings] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [featured, setFeatured] = useState([]);
  const [popular, setPopular] = useState([]);
  const [nearby, setNearby] = useState([]);
  const [searchListings, setSearchListings] = useState([]);
  const [searchSellers, setSearchSellers] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [error, setError] = useState('');

  const sellersLoadedRef = useRef(false);
  const filterKey = useMemo(
    () => JSON.stringify({ filters, category, geoParams: coords, query: query.trim(), isSearch: query.trim().length > 0 }),
    [filters, category, coords, query],
  );

  const geoParams = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng } : {}),
    [coords],
  );

  const isSearchMode = query.trim().length > 0;

  useEffect(() => {
    const cat = params.get('category');
    if (cat) setCategory(cat);
    const q = params.get('q');
    if (q != null) setQuery(q);
  }, [params]);

  useEffect(() => {
    api.getCategories('product').then((res) => {
      const list = normalizeCategoriesResponse(res, 'product');
      setCategories([{ name: 'All', id: 'all' }, ...list]);
    }).catch(() => {});
  }, []);

  const countFilterKey = useMemo(
    () => JSON.stringify({ filters, geoParams: coords, query: query.trim() }),
    [filters, coords, query],
  );

  useEffect(() => {
    let cancelled = false;
    setCountsLoading(true);
    api.getCategoryCounts(buildCountParams(geoParams, filters, query.trim()))
      .then((res) => {
        if (!cancelled) {
          setCategoryCounts({ counts: res.counts || {}, total: res.total ?? 0 });
        }
      })
      .catch(() => {
        if (!cancelled) setCategoryCounts({ counts: {}, total: 0 });
      })
      .finally(() => {
        if (!cancelled) setCountsLoading(false);
      });
    return () => { cancelled = true; };
  }, [countFilterKey, geoParams, filters, query]);

  const fetchListings = useCallback(async (pageNum, append = false) => {
    const requestParams = buildListingParams(geoParams, filters, category, '', pageNum);
    const res = await api.getListings(requestParams);
    const items = (res.listings || []).map(toCardItem).filter(Boolean);
    setListings((prev) => (append ? [...prev, ...items] : items));
    setTotal(res.total ?? items.length);
    setPage(res.page ?? pageNum);
    setTotalPages(res.totalPages ?? 1);
    setHasMore(Boolean(res.hasMore));
    return res;
  }, [geoParams, filters, category]);

  const fetchSearchListings = useCallback(async (pageNum, append = false) => {
    const q = query.trim();
    const requestParams = buildListingParams(
      geoParams,
      { ...filters, sort: 'relevance' },
      category,
      q,
      pageNum,
    );
    const res = await api.searchListings(requestParams);
    const items = (res.listings || []).map(toCardItem).filter(Boolean);
    setSearchListings((prev) => (append ? [...prev, ...items] : items));
    setSearchTotal(res.total ?? items.length);
    setSearchPage(res.page ?? pageNum);
    setSearchTotalPages(res.totalPages ?? 1);
    setSearchHasMore(Boolean(res.hasMore));
    return res;
  }, [geoParams, filters, category, query]);

  const loadSellers = useCallback(async () => {
    setSellersLoading(true);
    try {
      const [featRes, popRes, nearRes] = await Promise.all([
        api.getFeaturedSellers(geoParams),
        api.getPopularSellers(geoParams),
        api.getNearbySellers(geoParams),
      ]);
      setFeatured((featRes.sellers || []).map(toSellerCard).filter(Boolean));
      setPopular((popRes.sellers || []).map(toSellerCard).filter(Boolean));
      setNearby((nearRes.sellers || []).map(toSellerCard).filter(Boolean));
      sellersLoadedRef.current = true;
    } catch (e) {
      setError(e.message || 'Could not load sellers.');
    } finally {
      setSellersLoading(false);
    }
  }, [geoParams]);

  useEffect(() => {
    if (isSearchMode) return undefined;

    let cancelled = false;
    setLoading(true);
    setError('');
    setPage(1);

    fetchListings(1, false)
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load listings. Please try again in a moment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [filterKey, isSearchMode, fetchListings]);

  useEffect(() => {
    if (!isSearchMode) return undefined;

    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      setSearchPage(1);
      try {
        const q = query.trim();
        const type = searchTab === 'products' ? 'products' : searchTab;
        const tasks = [];

        if (searchTab === 'all' || searchTab === 'products') {
          tasks.push(fetchSearchListings(1, false));
        } else {
          setSearchListings([]);
          setSearchTotal(0);
          setSearchHasMore(false);
        }

        if (searchTab === 'all' || searchTab === 'sellers' || searchTab === 'stores') {
          tasks.push(
            api.searchSellers({ q, type, ...geoParams, category: category !== 'All' ? category : undefined })
              .then((r) => setSearchSellers((r.sellers || []).map(toSellerCard).filter(Boolean))),
          );
        } else {
          setSearchSellers([]);
        }

        await Promise.all(tasks);
      } catch (e) {
        setError(e.message || 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, searchTab, category, filters, geoParams, isSearchMode, fetchSearchListings]);

  useEffect(() => {
    if (tab === 'sellers' && !isSearchMode && !sellersLoadedRef.current) {
      loadSellers();
    }
  }, [tab, isSearchMode, loadSellers]);

  useEffect(() => {
    sellersLoadedRef.current = false;
  }, [geoParams]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (category !== 'All') n += 1;
    if (filters.condition !== 'All') n += 1;
    if (filters.minPrice) n += 1;
    if (filters.maxPrice) n += 1;
    if (filters.radius) n += 1;
    if (filters.sellerType !== 'all') n += 1;
    if (filters.sort !== 'newest') n += 1;
    return n;
  }, [category, filters]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleCategoryChange = (name) => {
    setCategory(name);
    setTab('products');
    const next = new URLSearchParams(params);
    if (name !== 'All') next.set('category', name);
    else next.delete('category');
    setParams(next);
  };

  const clearFilters = () => {
    setCategory('All');
    setFilters(DEFAULT_FILTERS);
    const next = new URLSearchParams(params);
    next.delete('category');
    setParams(next);
  };

  const onSearchSubmit = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (query.trim()) next.set('q', query.trim());
    else next.delete('q');
    if (category !== 'All') next.set('category', category);
    else next.delete('category');
    setParams(next);
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchListings(page + 1, true);
    } catch (e) {
      setError(e.message || 'Could not load more listings.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearchLoadMore = async () => {
    if (!searchHasMore || searchLoadingMore) return;
    setSearchLoadingMore(true);
    try {
      await fetchSearchListings(searchPage + 1, true);
    } catch (e) {
      setError(e.message || 'Could not load more results.');
    } finally {
      setSearchLoadingMore(false);
    }
  };

  const showProductsChrome = tab === 'products' || isSearchMode;
  const filterBarProps = {
    sort: filters.sort,
    onSortChange: (v) => updateFilter('sort', v),
    condition: filters.condition,
    onConditionChange: (v) => updateFilter('condition', v),
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    onMinPriceChange: (v) => updateFilter('minPrice', v),
    onMaxPriceChange: (v) => updateFilter('maxPrice', v),
    radius: filters.radius,
    onRadiusChange: (v) => updateFilter('radius', v),
    sellerType: filters.sellerType,
    onSellerTypeChange: (v) => updateFilter('sellerType', v),
    activeFilterCount,
    onClearFilters: clearFilters,
  };

  const renderSection = (title, items, horizontal = true) => {
    if (!items.length) return null;
    return (
      <section className="explore-section">
        <div className="explore-section-head">
          <h2>{title}</h2>
          <span className="explore-section-count">{items.length}</span>
        </div>
        <div className={horizontal ? 'explore-carousel' : 'explore-grid explore-grid-dense'}>
          {items.map((s) => (
            <SellerCard key={s.id} seller={s} />
          ))}
        </div>
      </section>
    );
  };

  const displayListings = isSearchMode ? searchListings : listings;

  const resultsTitle = !isSearchMode && tab === 'products'
    ? (category !== 'All' ? category : 'All products')
    : !isSearchMode && tab === 'sellers'
      ? 'Sellers near you'
      : isSearchMode
        ? 'Search results'
        : 'All listings';

  const resultsMeta = isSearchMode
    ? `${searchTotal + searchSellers.length} results`
    : tab === 'products'
      ? (loading ? 'Loading…' : `${total} items`)
      : '';

  return (
    <div className="explore-page">
      <header className="explore-header explore-header-compact">
        <div className="container explore-header-mobile">
          <Link to="/" className="explore-back explore-back-mobile">← Home</Link>
          <h1>Explore</h1>
          <p className="explore-header-sub">{BRAND_TAGLINE}</p>
          <div className="explore-header-desktop">
            <div className="explore-header-bar">
              <div className="explore-header-title">
                <Link to="/" className="explore-back">← Home</Link>
                <h1>Explore</h1>
              </div>
              <form className="explore-search-form explore-search-form-inline" onSubmit={onSearchSubmit}>
                <div className="explore-search">
                  <IconSearch width={18} height={18} />
                  <input
                    type="search"
                    placeholder="Search phones, furniture, shops…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query ? (
                    <button type="button" className="explore-search-clear" onClick={() => setQuery('')}>×</button>
                  ) : null}
                </div>
              </form>
              {geoStatus === 'denied' ? (
                <span className="explore-geo-hint">Enable location</span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="container explore-search-float">
        <form className="explore-search-form" onSubmit={onSearchSubmit}>
          <div className="explore-search">
            <IconSearch width={18} height={18} />
            <input
              type="search"
              placeholder="Search sellers, stores or products…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button type="button" className="explore-search-clear" onClick={() => setQuery('')}>×</button>
            ) : null}
          </div>
        </form>
        {geoStatus === 'denied' ? (
          <span className="explore-geo-hint explore-geo-hint-float">Enable location</span>
        ) : null}
      </div>

      <div className="explore-body">
        <div className="container explore-body-inner">
          <div className="explore-toolbar explore-toolbar-top">
            <div className="explore-mobile-bar">
              {isSearchMode ? (
                <div className="explore-search-tabs explore-segmented-tabs">
                  {SEARCH_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={searchTab === t.id ? 'active' : ''}
                      onClick={() => setSearchTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="explore-main-tabs explore-segmented-tabs">
                  <button type="button" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products</button>
                  <button type="button" className={tab === 'sellers' ? 'active' : ''} onClick={() => setTab('sellers')}>Sellers</button>
                </div>
              )}
              {showProductsChrome ? (
                <button
                  type="button"
                  className={`explore-filter-btn${activeFilterCount > 0 ? ' active' : ''}`}
                  onClick={() => setFilterSheetOpen(true)}
                  aria-label="Open filters"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {activeFilterCount > 0 ? (
                    <span className="explore-filter-btn-badge">{activeFilterCount}</span>
                  ) : null}
                </button>
              ) : null}
            </div>

            <div className="explore-desktop-bar">
              <div className="explore-toolbar-head">
                <div className="explore-toolbar-left">
                  {!isSearchMode && tab === 'products' ? (
                    <h2 className="explore-content-title">
                      {category !== 'All' ? category : 'All listings'}
                      {!loading ? (
                        <span className="explore-section-count"> ({total})</span>
                      ) : null}
                    </h2>
                  ) : null}
                  {!isSearchMode && tab === 'sellers' ? (
                    <h2 className="explore-content-title">Sellers near you</h2>
                  ) : null}
                  {isSearchMode && !searching ? (
                    <h2 className="explore-content-title">
                      Search results
                      <span className="explore-section-count"> ({searchTotal + searchSellers.length})</span>
                    </h2>
                  ) : null}
                </div>

                <div className="explore-toolbar-right">
                  <Link to="/map" className="btn btn-outline explore-map-link">
                    Map view
                  </Link>
                  {isSearchMode ? (
                    <div className="explore-search-tabs">
                      {SEARCH_TABS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={searchTab === t.id ? 'active' : ''}
                          onClick={() => setSearchTab(t.id)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="explore-main-tabs">
                      <button type="button" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products</button>
                      <button type="button" className={tab === 'sellers' ? 'active' : ''} onClick={() => setTab('sellers')}>Sellers</button>
                    </div>
                  )}
                </div>
              </div>

              {showProductsChrome ? (
                <div className="explore-toolbar-controls">
                  <ExploreFilterBar {...filterBarProps} />
                </div>
              ) : null}
            </div>
          </div>

          <div className={`explore-layout${showProductsChrome ? '' : ' explore-layout--full'}`}>
            {showProductsChrome ? (
              <>
                <ExploreMobileRail
                  categories={categories}
                  category={category}
                  categoryCounts={categoryCounts}
                  countsLoading={countsLoading}
                  onCategoryChange={handleCategoryChange}
                />
                <ExploreSidebar
                  categories={categories}
                  category={category}
                  categoryCounts={categoryCounts}
                  countsLoading={countsLoading}
                  onCategoryChange={handleCategoryChange}
                  resultTotal={isSearchMode ? searchTotal : total}
                  className="explore-sidebar-desktop"
                />
              </>
            ) : null}

            <div className="explore-content">
            {showProductsChrome && tab === 'products' && !isSearchMode ? (
              <div className="explore-results-bar explore-mobile-only">
                <h2 className="explore-results-title">{resultsTitle}</h2>
                <span className="explore-results-meta">{resultsMeta}</span>
              </div>
            ) : null}
            {activeFilterCount > 0 ? (
              <div className="explore-active-filters">
                {category !== 'All' ? (
                  <button type="button" onClick={() => handleCategoryChange('All')}>{category} ×</button>
                ) : null}
                {filters.condition !== 'All' ? (
                  <button type="button" onClick={() => updateFilter('condition', 'All')}>{filters.condition} ×</button>
                ) : null}
                {filters.sellerType !== 'all' ? (
                  <button type="button" onClick={() => updateFilter('sellerType', 'all')}>
                    {filters.sellerType === 'shop' ? 'Shops' : 'Individuals'} ×
                  </button>
                ) : null}
                {filters.radius ? (
                  <button type="button" onClick={() => updateFilter('radius', '')}>
                    Within {filters.radius} km ×
                  </button>
                ) : null}
                {(filters.minPrice || filters.maxPrice) ? (
                  <button type="button" onClick={() => { updateFilter('minPrice', ''); updateFilter('maxPrice', ''); }}>
                    NPR {filters.minPrice || '0'}–{filters.maxPrice || '∞'} ×
                  </button>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div className="explore-error">
                <p>{error}</p>
                <button type="button" className="btn btn-primary" onClick={() => fetchListings(1, false)}>Retry</button>
              </div>
            ) : null}

            {loading && !isSearchMode && tab === 'products' ? <SkeletonGrid /> : null}
            {searching && isSearchMode ? <SkeletonGrid /> : null}
            {sellersLoading && tab === 'sellers' ? <SkeletonGrid count={4} /> : null}

            {!loading && !searching && !error && isSearchMode ? (
              <>
                {(searchTab === 'all' || searchTab === 'products') && displayListings.length ? (
                  <section className="explore-section explore-section-compact">
                    <div className="explore-grid explore-grid-dense">
                      {displayListings.map((item) => (
                        <ProductCard key={item.id} item={item} />
                      ))}
                    </div>
                    <ExplorePagination
                      shown={displayListings.length}
                      total={searchTotal}
                      page={searchPage}
                      totalPages={searchTotalPages}
                      hasMore={searchHasMore}
                      loading={searchLoadingMore}
                      onLoadMore={handleSearchLoadMore}
                      label="results"
                    />
                  </section>
                ) : null}
                {(searchTab === 'all' || searchTab === 'sellers' || searchTab === 'stores') && searchSellers.length ? (
                  <section className="explore-section">
                    <h2>Sellers ({searchSellers.length})</h2>
                    <div className="explore-carousel">
                      {searchSellers.map((s) => (
                        <SellerCard key={s.id} seller={s} />
                      ))}
                    </div>
                  </section>
                ) : null}
                {!displayListings.length && !searchSellers.length ? (
                  <div className="explore-empty">
                    <h3>No results</h3>
                    <p>Try a different search or adjust filters above.</p>
                    <button type="button" className="btn btn-outline" onClick={clearFilters}>Clear filters</button>
                  </div>
                ) : null}
              </>
            ) : null}

            {!loading && !error && !isSearchMode && tab === 'products' ? (
              <section className="explore-section explore-section-compact">
                {displayListings.length ? (
                  <>
                    <div className="explore-grid explore-grid-dense">
                      {displayListings.map((item) => (
                        <ProductCard key={item.id} item={item} />
                      ))}
                    </div>
                    <ExplorePagination
                      shown={displayListings.length}
                      total={total}
                      page={page}
                      totalPages={totalPages}
                      hasMore={hasMore}
                      loading={loadingMore}
                      onLoadMore={handleLoadMore}
                    />
                  </>
                ) : (
                  <div className="explore-empty">
                    <h3>No listings found</h3>
                    <p>Try another category or loosen your filters.</p>
                    <button type="button" className="btn btn-outline" onClick={clearFilters}>Clear filters</button>
                  </div>
                )}
              </section>
            ) : null}

            {!sellersLoading && !error && !isSearchMode && tab === 'sellers' ? (
              <>
                {renderSection('Featured near you', featured)}
                {renderSection('Popular sellers', popular)}
                {renderSection('Sellers near you', nearby)}
                {!featured.length && !popular.length && !nearby.length ? (
                  <div className="explore-empty">
                    <h3>No sellers yet</h3>
                    <p>Shops and sellers will appear here.</p>
                  </div>
                ) : null}
              </>
            ) : null}
            </div>
          </div>
        </div>
      </div>

      <ExploreFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filterBarProps={filterBarProps}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
      />

      <Footer />
    </div>
  );
}
