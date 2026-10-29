import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { toCardItem, toSellerCard } from '../utils/listing';
import { normalizeCategoriesResponse } from '../utils/categories';
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  formatNpr,
  readFilters,
  sortOptions,
  writeFilters,
} from '../utils/exploreFilters';
import { useGeolocation } from '../hooks/useGeolocation';
import ProductCard from '../components/ProductCard';
import SellerCard from '../components/SellerCard';
import ExploreFilterBar from '../components/ExploreFilterBar';
import ExploreFilterSheet from '../components/ExploreFilterSheet';
import ExploreMobileRail from '../components/ExploreMobileRail';
import ExploreSidebar from '../components/ExploreSidebar';
import ExplorePagination from '../components/ExplorePagination';
import ExploreRefinePanel from '../components/ExploreRefinePanel';
import ExploreSearchBox from '../components/ExploreSearchBox';
import { IconLocation, IconMobile } from '../components/Icons';
import Footer from '../components/Footer';
import SiteImage from '../components/SiteImage';
import Breadcrumb from '../components/Breadcrumb';
import { BRAND_TAGLINE } from '../content/brand';

const PAGE_SIZE = 24;
const DENSITY_KEY = 'kb-explore-density';

const SEARCH_TABS = [
  { id: 'all', label: 'All' },
  { id: 'products', label: 'Products' },
  { id: 'sellers', label: 'Sellers' },
  { id: 'stores', label: 'Stores' },
];

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SkeletonGrid({ count = 12, compact = false }) {
  return (
    <div className={`explore-grid-v2${compact ? ' is-compact' : ''}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="explore-skeleton">
          <span className="explore-skeleton-img" />
          <span className="explore-skeleton-line" />
          <span className="explore-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

function buildListingParams({ geo, filters, category, q, page }) {
  const hasGeo = geo.lat != null;
  let sort = filters.sort || (q ? 'relevance' : 'newest');
  if (sort === 'distance' && !hasGeo) sort = q ? 'relevance' : 'newest';
  const params = { ...geo, sort, page, limit: PAGE_SIZE };
  if (category !== 'All') params.category = category;
  if (filters.condition !== 'All') params.condition = filters.condition;
  if (filters.minPrice) params.minPrice = filters.minPrice;
  if (filters.maxPrice) params.maxPrice = filters.maxPrice;
  if (filters.radius && hasGeo) params.radius = filters.radius;
  if (filters.sellerType !== 'all') params.sellerType = filters.sellerType;
  if (q) params.q = q;
  return params;
}

function fetchFeed(request, page) {
  const params = buildListingParams({ ...request, page });
  return (request.q ? api.searchListings(params) : api.getListings(params)).then((res) => {
    const items = (res.listings || []).map(toCardItem).filter(Boolean);
    return {
      items,
      total: res.total ?? items.length,
      page: res.page ?? page,
      hasMore: Boolean(res.hasMore),
    };
  });
}

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const { coords, status: geoStatus } = useGeolocation();
  const hasLocation = Boolean(coords);

  const category = params.get('category') || 'All';
  const q = (params.get('q') || '').trim();
  const filters = useMemo(() => readFilters(params), [params]);
  const isSearch = q.length > 0;

  const [query, setQuery] = useState(q);
  const writtenQueryRef = useRef(q);
  const debouncedQuery = useDebounced(query.trim(), 320);

  const [tab, setTab] = useState('products');
  const [searchTab, setSearchTab] = useState('all');
  const [density, setDensity] = useState(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) || 'comfort';
    } catch {
      return 'comfort';
    }
  });
  const compact = density === 'compact';

  const [categories, setCategories] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({ counts: {}, total: 0 });
  const [countsReady, setCountsReady] = useState(false);
  const [countsLoading, setCountsLoading] = useState(true);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [feed, setFeed] = useState({ items: [], total: 0, page: 1, hasMore: false });
  const [feedStatus, setFeedStatus] = useState('loading');
  const [feedError, setFeedError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const feedReqRef = useRef(0);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const loadingMoreRef = useRef(false);

  const [searchSellers, setSearchSellers] = useState([]);
  const [sellerGroups, setSellerGroups] = useState({ featured: [], popular: [], nearby: [] });
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellersError, setSellersError] = useState('');
  const [shopCategories, setShopCategories] = useState([]);
  const [sellerCounts, setSellerCounts] = useState({ counts: {}, total: 0 });
  const [sellerCountsStatus, setSellerCountsStatus] = useState('loading');
  const [sellerCategory, setSellerCategory] = useState('All');
  const [categorySellers, setCategorySellers] = useState({ status: 'idle', items: [], error: '' });

  const [showTop, setShowTop] = useState(false);
  const resultsRef = useRef(null);

  const geo = useMemo(() => (coords ? { lat: coords.lat, lng: coords.lng } : {}), [coords]);

  // Typing writes ?q= after a short pause; back/forward and links write the box.
  useEffect(() => {
    if (q !== writtenQueryRef.current) {
      writtenQueryRef.current = q;
      setQuery(q);
    }
  }, [q]);

  const commitQuery = useCallback((text) => {
    const value = (text ?? '').trim();
    writtenQueryRef.current = value;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('q', value);
      else next.delete('q');
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (debouncedQuery !== writtenQueryRef.current) commitQuery(debouncedQuery);
  }, [debouncedQuery, commitQuery]);

  const scrollToResults = useCallback(() => {
    const node = resultsRef.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top + window.scrollY - 96;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }, []);

  const setFilter = useCallback((key, value) => {
    setParams((prev) => writeFilters(prev, { ...readFilters(prev), [key]: value }), { replace: true });
    scrollToResults();
  }, [setParams, scrollToResults]);

  const setPrice = useCallback((minPrice, maxPrice) => {
    setParams((prev) => writeFilters(prev, { ...readFilters(prev), minPrice, maxPrice }), { replace: true });
    scrollToResults();
  }, [setParams, scrollToResults]);

  const setCategory = useCallback((name) => {
    setTab('products');
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (name && name !== 'All') next.set('category', name);
      else next.delete('category');
      return next;
    });
    scrollToResults();
  }, [setParams, scrollToResults]);

  const pickSellerCategory = useCallback((name) => {
    setSellerCategory(name || 'All');
    scrollToResults();
  }, [scrollToResults]);

  const clearFilters = useCallback(() => {
    setParams((prev) => {
      const next = writeFilters(prev, DEFAULT_FILTERS);
      next.delete('category');
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    api.getCategories('product').then((res) => {
      const list = normalizeCategoriesResponse(res, 'product');
      setCategories([{ name: 'All', id: 'all' }, ...list]);
    }).catch(() => {});
    api.getCategories('shop').then((res) => {
      setShopCategories(normalizeCategoriesResponse(res, 'shop'));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* private mode */
    }
  }, [density]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const countKey = JSON.stringify({ q, filters, geo });
  useEffect(() => {
    const { q: cq, filters: cf, geo: cg } = JSON.parse(countKey);
    const countParams = buildListingParams({ geo: cg, filters: cf, category: 'All', q: cq, page: 1 });
    delete countParams.sort;
    delete countParams.page;
    delete countParams.limit;
    let cancelled = false;
    setCountsLoading(true);
    api.getCategoryCounts(countParams)
      .then((res) => {
        if (cancelled) return;
        setCategoryCounts({ counts: res.counts || {}, total: res.total ?? 0 });
        setCountsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCategoryCounts({ counts: {}, total: 0 });
        setCountsReady(false);
      })
      .finally(() => {
        if (!cancelled) setCountsLoading(false);
      });
    return () => { cancelled = true; };
  }, [countKey]);

  const wantsProducts = isSearch ? searchTab === 'all' || searchTab === 'products' : tab === 'products';
  const feedKey = JSON.stringify({ q, category, filters, geo, reloadTick });

  useEffect(() => {
    if (!wantsProducts) return;
    const request = JSON.parse(feedKey);
    const id = ++feedReqRef.current;
    setFeedStatus(feedRef.current.items.length ? 'refreshing' : 'loading');
    setFeedError('');
    fetchFeed(request, 1)
      .then((next) => {
        if (id !== feedReqRef.current) return;
        setFeed(next);
        setFeedStatus('ready');
      })
      .catch((e) => {
        if (id !== feedReqRef.current) return;
        setFeedError(e.message || 'Could not load listings. Please try again in a moment.');
        setFeedStatus('error');
      });
  }, [feedKey, wantsProducts]);

  const loadMore = useCallback(async () => {
    const current = feedRef.current;
    if (!current.hasMore || loadingMoreRef.current) return;
    const id = feedReqRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const next = await fetchFeed(JSON.parse(feedKey), current.page + 1);
      if (id !== feedReqRef.current) return;
      setFeed((prev) => {
        const seen = new Set(prev.items.map((item) => item.id));
        return {
          items: [...prev.items, ...next.items.filter((item) => !seen.has(item.id))],
          total: next.total,
          page: next.page,
          hasMore: next.hasMore,
        };
      });
    } catch {
      /* the Load more button stays for a manual retry */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [feedKey]);

  useEffect(() => {
    if (!isSearch || searchTab === 'products') {
      setSearchSellers([]);
      return undefined;
    }
    let cancelled = false;
    api.searchSellers({ q, type: searchTab, ...geo, category: category !== 'All' ? category : undefined })
      .then((r) => {
        if (!cancelled) setSearchSellers((r.sellers || []).map(toSellerCard).filter(Boolean));
      })
      .catch(() => {
        if (!cancelled) setSearchSellers([]);
      });
    return () => { cancelled = true; };
  }, [isSearch, q, searchTab, category, geo]);

  const wantsSellerTab = !isSearch && tab === 'sellers';

  // Store types and the product categories sellers list in, merged like the app.
  useEffect(() => {
    if (!wantsSellerTab) return undefined;
    let cancelled = false;
    api.getSellerCategoryCounts()
      .then((res) => {
        if (cancelled) return;
        const counts = {};
        const bump = (name, n) => {
          if (name) counts[name] = Math.max(counts[name] || 0, Number(n) || 0);
        };
        Object.entries(res.categories || {}).forEach(([name, v]) => bump(name, v?.sellers));
        Object.entries(res.storeTypes || {}).forEach(([name, n]) => bump(name, n));
        setSellerCounts({ counts, total: res.totals?.sellers ?? 0 });
        setSellerCountsStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setSellerCountsStatus('error');
      });
    return () => { cancelled = true; };
  }, [wantsSellerTab]);

  useEffect(() => {
    if (!wantsSellerTab || sellerCategory === 'All') return undefined;
    let cancelled = false;
    setCategorySellers({ status: 'loading', items: [], error: '' });
    api.getSellers({ category: sellerCategory, ...geo })
      .then((res) => {
        if (cancelled) return;
        const items = (res.sellers || [])
          .map(toSellerCard)
          .filter((s) => s && (s.listingCount > 0 || s.category === sellerCategory))
          .sort((a, b) => (b.listingCount || 0) - (a.listingCount || 0));
        setCategorySellers({ status: 'ready', items, error: '' });
      })
      .catch((e) => {
        if (!cancelled) setCategorySellers({ status: 'error', items: [], error: e.message || 'Could not load sellers.' });
      });
    return () => { cancelled = true; };
  }, [wantsSellerTab, sellerCategory, geo]);

  useEffect(() => {
    if (!wantsSellerTab || sellerCategory !== 'All') return undefined;
    let cancelled = false;
    setSellersLoading(true);
    setSellersError('');
    Promise.all([
      api.getFeaturedSellers(geo),
      api.getPopularSellers(geo),
      api.getNearbySellers(geo),
    ])
      .then(([featRes, popRes, nearRes]) => {
        if (cancelled) return;
        setSellerGroups({
          featured: (featRes.sellers || []).map(toSellerCard).filter(Boolean),
          popular: (popRes.sellers || []).map(toSellerCard).filter(Boolean),
          nearby: (nearRes.sellers || []).map(toSellerCard).filter(Boolean),
        });
      })
      .catch((e) => {
        if (!cancelled) setSellersError(e.message || 'Could not load sellers.');
      })
      .finally(() => {
        if (!cancelled) setSellersLoading(false);
      });
    return () => { cancelled = true; };
  }, [wantsSellerTab, sellerCategory, geo]);

  const activeFilterCount = countActiveFilters(filters, category);
  const sorts = sortOptions(isSearch);
  const showProductsChrome = tab === 'products' || isSearch;

  // Until counts arrive (or if they fail) keep every category so the list never comes up empty.
  const visibleCategories = useMemo(() => {
    if (!countsReady) return categories;
    return categories.filter((cat) => (
      cat.name === 'All' || cat.name === category || (categoryCounts.counts?.[cat.name] ?? 0) > 0
    ));
  }, [categories, category, categoryCounts, countsReady]);

  const sellerCategoryList = useMemo(() => {
    const seen = new Set(['All']);
    const list = [{ name: 'All', id: 'all-sellers' }];
    const add = (cat) => {
      if (!cat?.name || seen.has(cat.name)) return;
      seen.add(cat.name);
      list.push(cat);
    };
    shopCategories.forEach(add);
    categories.forEach(add);
    Object.keys(sellerCounts.counts).forEach((name) => add({ name, id: `seller-${name}` }));
    if (sellerCountsStatus !== 'ready') return list;
    return list.filter((cat) => (
      cat.name === 'All' || cat.name === sellerCategory || (sellerCounts.counts[cat.name] ?? 0) > 0
    ));
  }, [shopCategories, categories, sellerCounts, sellerCountsStatus, sellerCategory]);

  const sellersShown = useMemo(() => {
    if (sellerCategory !== 'All') return categorySellers.items.length;
    const ids = new Set([...sellerGroups.featured, ...sellerGroups.popular, ...sellerGroups.nearby].map((s) => s.id));
    return ids.size;
  }, [sellerCategory, categorySellers, sellerGroups]);

  const quickCategories = useMemo(() => (
    Object.entries(categoryCounts.counts || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name)
  ), [categoryCounts]);

  const activeChips = [];
  if (category !== 'All') activeChips.push({ key: 'cat', label: category, clear: () => setCategory('All') });
  if (filters.condition !== 'All') activeChips.push({ key: 'cond', label: filters.condition, clear: () => setFilter('condition', 'All') });
  if (filters.sellerType !== 'all') {
    activeChips.push({ key: 'seller', label: filters.sellerType === 'shop' ? 'Shops' : 'Individuals', clear: () => setFilter('sellerType', 'all') });
  }
  if (filters.radius) activeChips.push({ key: 'radius', label: `Within ${filters.radius} km`, clear: () => setFilter('radius', '') });
  if (filters.minPrice || filters.maxPrice) {
    const label = filters.minPrice && filters.maxPrice
      ? `Rs ${formatNpr(filters.minPrice)} – ${formatNpr(filters.maxPrice)}`
      : filters.minPrice ? `Rs ${formatNpr(filters.minPrice)}+` : `Under Rs ${formatNpr(filters.maxPrice)}`;
    activeChips.push({ key: 'price', label, clear: () => setPrice('', '') });
  }
  if (filters.sort) {
    activeChips.push({ key: 'sort', label: sorts.find((s) => s.value === filters.sort)?.label || filters.sort, clear: () => setFilter('sort', '') });
  }

  const refineProps = {
    filters,
    onFilterChange: setFilter,
    onPriceChange: setPrice,
    hasLocation,
    isSearch,
    activeFilterCount,
    onClearFilters: clearFilters,
  };

  const title = isSearch
    ? <>Results for <q className="explore-title-query">{q}</q></>
    : tab === 'sellers'
      ? sellerCategory !== 'All' ? `${sellerCategory} sellers` : 'Sellers near you'
      : category !== 'All' ? category : 'All products';
  const sellersBusy = sellerCategory === 'All' ? sellersLoading : categorySellers.status === 'loading';
  const countLabel = wantsSellerTab
    ? sellersBusy ? '' : `${sellersShown} seller${sellersShown === 1 ? '' : 's'}`
    : feedStatus === 'loading' ? '' : `${feed.total.toLocaleString('en-IN')} item${feed.total === 1 ? '' : 's'}`;

  const navProps = wantsSellerTab
    ? {
      categories: sellerCategoryList,
      category: sellerCategory,
      categoryCounts: sellerCounts,
      countsLoading: sellerCountsStatus === 'loading',
      onCategoryChange: pickSellerCategory,
    }
    : {
      categories: visibleCategories,
      category,
      categoryCounts,
      countsLoading,
      onCategoryChange: setCategory,
    };
  const busy = feedStatus === 'refreshing';

  const renderTabs = (className = '') => (isSearch ? (
    <div className={`explore-search-tabs ${className}`.trim()}>
      {SEARCH_TABS.map((t) => (
        <button key={t.id} type="button" className={searchTab === t.id ? 'active' : ''} onClick={() => setSearchTab(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  ) : (
    <div className={`explore-main-tabs ${className}`.trim()}>
      <button type="button" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Products</button>
      <button type="button" className={tab === 'sellers' ? 'active' : ''} onClick={() => setTab('sellers')}>Sellers</button>
    </div>
  ));

  const renderSellerSection = (heading, items) => (items.length ? (
    <section className="explore-section" key={heading}>
      <div className="explore-section-head">
        <h2>{heading}</h2>
        <span className="explore-section-count">{items.length}</span>
      </div>
      <div className="explore-seller-grid">
        {items.map((s) => <SellerCard key={s.id} seller={s} />)}
      </div>
    </section>
  ) : null);

  const empty = (heading, text) => (
    <div className="explore-empty">
      <SiteImage name="explore-empty" className="empty-art" />
      <h3>{heading}</h3>
      <p>{text}</p>
      {activeFilterCount > 0 || isSearch ? (
        <div className="explore-empty-actions">
          {activeFilterCount > 0 ? <button type="button" className="btn btn-primary" onClick={clearFilters}>Clear filters</button> : null}
          {isSearch ? <button type="button" className="btn btn-outline" onClick={() => { setQuery(''); commitQuery(''); }}>Clear search</button> : null}
        </div>
      ) : null}
    </div>
  );

  const productGrid = (
    <section className="explore-section explore-section-compact">
      {feedStatus === 'loading' ? <SkeletonGrid compact={compact} count={compact ? 18 : 12} /> : null}
      {feedStatus === 'error' ? (
        <div className="explore-error">
          <p>{feedError}</p>
          <button type="button" className="btn btn-primary" onClick={() => setReloadTick((n) => n + 1)}>Try again</button>
        </div>
      ) : null}
      {(feedStatus === 'ready' || busy) && feed.items.length ? (
        <>
          <div className={`explore-grid-v2${compact ? ' is-compact' : ''}${busy ? ' is-busy' : ''}`}>
            {feed.items.map((item, i) => (
              <ProductCard key={item.id} item={item} style={{ '--i': i % PAGE_SIZE }} />
            ))}
          </div>
          <ExplorePagination
            shown={feed.items.length}
            total={feed.total}
            hasMore={feed.hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
            label={isSearch ? 'results' : 'listings'}
          />
        </>
      ) : null}
      {feedStatus === 'ready' && !feed.items.length && !(isSearch && searchSellers.length)
        ? empty(isSearch ? 'No matching items' : 'No listings found', isSearch
          ? 'Try a shorter word, a different spelling, or fewer filters.'
          : 'Try another category or loosen your filters.')
        : null}
    </section>
  );

  return (
    <div className="explore-page explore-v2">
      <header className="explore-header explore-header-compact explore-hero-v2">
        <div className="container explore-wide explore-hero-row">
          <div className="explore-hero-copy">
            <Breadcrumb trail={[{ label: 'Explore' }]} className="kb-crumbs--slab" />
            <h1>Explore <span className="ne-inline ne-inline--slab" lang="ne">· नजिकैका सामान</span></h1>
            <p className="explore-header-sub">
              {countsLoading || !categoryCounts.total
                ? BRAND_TAGLINE
                : `${categoryCounts.total.toLocaleString('en-IN')} item${categoryCounts.total === 1 ? '' : 's'} for sale${hasLocation ? ' around you' : ' across Nepal'}`}
            </p>
          </div>
          <div className="explore-hero-search">
            <ExploreSearchBox
              value={query}
              onChange={setQuery}
              onSubmit={commitQuery}
              onPickCategory={setCategory}
            />
            <div className="explore-hero-meta">
              {quickCategories.length ? (
                <div className="explore-quick-cats" aria-label="Popular categories">
                  {quickCategories.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={category === name ? 'active' : ''}
                      onClick={() => setCategory(category === name ? 'All' : name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
              <span className={`explore-geo-pill${hasLocation ? ' is-on' : ''}`}>
                <IconLocation width={13} height={13} />
                {hasLocation ? 'Near you' : geoStatus === 'loading' ? 'Locating…' : 'Location off'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="explore-body">
        <div className="container explore-wide explore-body-inner">
          <div className="explore-toolbar explore-toolbar-top">
            <div className="explore-mobile-bar">
              {renderTabs('explore-segmented-tabs')}
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
                  {activeFilterCount > 0 ? <span className="explore-filter-btn-badge">{activeFilterCount}</span> : null}
                </button>
              ) : null}
            </div>
          </div>

          <div className={`explore-layout explore-layout-v2${showProductsChrome ? '' : ' explore-layout--no-rail'}`}>
            <ExploreMobileRail {...navProps} />
            <ExploreSidebar
              {...navProps}
              title={wantsSellerTab ? 'Store categories' : 'Categories'}
              resultTotal={wantsSellerTab ? sellersShown : feed.total}
              resultNoun={wantsSellerTab ? 'seller' : 'listing'}
              className="explore-sidebar-desktop"
            />

            <div className="explore-content" ref={resultsRef}>
              <div className="explore-results-head">
                <div className="explore-results-title-wrap">
                  <h2 className="explore-results-title-v2">{title}</h2>
                  {countLabel ? <span className="explore-results-count">{countLabel}</span> : null}
                  {busy ? <span className="explore-spinner explore-spinner--inline" aria-label="Updating" /> : null}
                </div>
                <div className="explore-results-actions">
                  {renderTabs('explore-results-tabs')}
                  {showProductsChrome ? (
                    <>
                      <label className={`explore-sort${filters.sort ? ' is-set' : ''}`}>
                        <span>Sort</span>
                        <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort by">
                          {sorts.map((o) => (
                            <option key={o.value} value={o.value} disabled={o.needsLocation && !hasLocation}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="explore-density" role="group" aria-label="Card size">
                        <button type="button" className={!compact ? 'active' : ''} onClick={() => setDensity('comfort')} aria-label="Large cards" title="Large cards">
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="1" y="1" width="6" height="6" rx="1.6" /><rect x="9" y="1" width="6" height="6" rx="1.6" /><rect x="1" y="9" width="6" height="6" rx="1.6" /><rect x="9" y="9" width="6" height="6" rx="1.6" /></svg>
                        </button>
                        <button type="button" className={compact ? 'active' : ''} onClick={() => setDensity('compact')} aria-label="Small cards" title="Small cards">
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><rect x="1" y="1" width="4" height="4" rx="1" /><rect x="6" y="1" width="4" height="4" rx="1" /><rect x="11" y="1" width="4" height="4" rx="1" /><rect x="1" y="6" width="4" height="4" rx="1" /><rect x="6" y="6" width="4" height="4" rx="1" /><rect x="11" y="6" width="4" height="4" rx="1" /><rect x="1" y="11" width="4" height="4" rx="1" /><rect x="6" y="11" width="4" height="4" rx="1" /><rect x="11" y="11" width="4" height="4" rx="1" /></svg>
                        </button>
                      </div>
                    </>
                  ) : null}
                  <Link to="/map" className="explore-map-btn">
                    <IconLocation width={15} height={15} />
                    Map
                  </Link>
                </div>
              </div>

              {showProductsChrome ? (
                <div className="explore-toolbar-filters">
                  <ExploreFilterBar {...refineProps} />
                </div>
              ) : null}

              {showProductsChrome && activeChips.length ? (
                <div className="explore-active-filters explore-active-filters-v2">
                  {activeChips.map((chip) => (
                    <button key={chip.key} type="button" onClick={chip.clear} aria-label={`Remove ${chip.label}`}>
                      {chip.label}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                  {activeChips.length > 1 ? (
                    <button type="button" className="explore-chip-clear" onClick={clearFilters}>Clear all</button>
                  ) : null}
                </div>
              ) : null}

              {isSearch ? (
                <>
                  {wantsProducts ? productGrid : null}
                  {searchTab !== 'products' && searchSellers.length ? (
                    <section className="explore-section">
                      <div className="explore-section-head">
                        <h2>{searchTab === 'stores' ? 'Stores' : 'Sellers & stores'}</h2>
                        <span className="explore-section-count">{searchSellers.length}</span>
                      </div>
                      <div className="explore-seller-grid">
                        {searchSellers.map((s) => <SellerCard key={s.id} seller={s} />)}
                      </div>
                    </section>
                  ) : null}
                  {!wantsProducts && !searchSellers.length
                    ? empty('No sellers found', 'Try another name or search for products instead.')
                    : null}
                </>
              ) : tab === 'products' ? productGrid : sellerCategory !== 'All' ? (
                <>
                  {categorySellers.status === 'loading' ? <SkeletonGrid count={6} /> : null}
                  {categorySellers.status === 'error' ? <div className="explore-error"><p>{categorySellers.error}</p></div> : null}
                  {categorySellers.status === 'ready' && categorySellers.items.length ? (
                    <section className="explore-section">
                      <div className="explore-seller-grid">
                        {categorySellers.items.map((s) => <SellerCard key={s.id} seller={s} />)}
                      </div>
                    </section>
                  ) : null}
                  {categorySellers.status === 'ready' && !categorySellers.items.length ? (
                    <div className="explore-empty">
                      <SiteImage name="explore-empty" className="empty-art" />
                      <h3>No {sellerCategory} sellers yet</h3>
                      <p>Try another category, or see every seller near you.</p>
                      <div className="explore-empty-actions">
                        <button type="button" className="btn btn-primary" onClick={() => pickSellerCategory('All')}>All sellers</button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  {sellersLoading ? <SkeletonGrid count={6} /> : null}
                  {sellersError ? <div className="explore-error"><p>{sellersError}</p></div> : null}
                  {!sellersLoading && !sellersError ? (
                    <>
                      {renderSellerSection('Featured near you', sellerGroups.featured)}
                      {renderSellerSection('Popular sellers', sellerGroups.popular)}
                      {renderSellerSection('Sellers near you', sellerGroups.nearby)}
                      {!sellerGroups.featured.length && !sellerGroups.popular.length && !sellerGroups.nearby.length
                        ? empty('No sellers yet', 'Shops and sellers will appear here.')
                        : null}
                    </>
                  ) : null}
                </>
              )}
            </div>

            {showProductsChrome ? (
              <aside className="explore-refine-rail">
                <ExploreRefinePanel {...refineProps} />
                <Link to="/map" className="explore-rail-card explore-rail-card--map">
                  <IconLocation width={20} height={20} />
                  <span>
                    <strong>See items on the map</strong>
                    <small>Find what&apos;s for sale on your street</small>
                  </span>
                </Link>
                <Link to="/download" className="explore-rail-card explore-rail-card--sell">
                  <IconMobile width={20} height={20} />
                  <span>
                    <strong>Have something to sell?</strong>
                    <small>Post it free in the KinBech app</small>
                  </span>
                </Link>
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`explore-to-top${showTop ? ' is-visible' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <ExploreFilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        refineProps={refineProps}
        resultLabel={feedStatus === 'ready' ? `Show ${feed.total.toLocaleString('en-IN')} result${feed.total === 1 ? '' : 's'}` : 'Show results'}
      />

      <Footer />
    </div>
  );
}
