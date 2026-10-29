import { lazy, Suspense, useLayoutEffect } from 'react';
import { Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import AmbientBackground from './components/AmbientBackground';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const ListingDetailPage = lazy(() => import('./pages/ListingDetailPage'));
const SellerProfilePage = lazy(() => import('./pages/SellerProfilePage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const SellersPage = lazy(() => import('./pages/SellersPage'));
const SafetyPage = lazy(() => import('./pages/SafetyPage'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const DownloadPage = lazy(() => import('./pages/DownloadPage'));
const LegalHubPage = lazy(() => import('./pages/LegalHubPage'));
const LegalDocumentPage = lazy(() => import('./pages/LegalDocumentPage'));
const HumanCheckPage = lazy(() => import('./pages/HumanCheckPage'));
const SecurityPolicyPage = lazy(() => import('./pages/SecurityPolicyPage'));

// Back/forward (POP) keeps the browser's own scroll restore; query changes on one page do not jump.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === 'POP') return;
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash, navigationType]);

  return null;
}

function PageLoading() {
  return (
    <div className="page-main page-loading" aria-busy="true" aria-label="Loading">
      <span className="explore-spinner" />
    </div>
  );
}

function PublicSite() {
  useLayoutEffect(() => {
    document.documentElement.classList.add('kb-public');
    return () => document.documentElement.classList.remove('kb-public');
  }, []);

  return (
    <>
      <ScrollToTop />
      <AmbientBackground />
      <Navbar />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<main className="page-main"><LandingPage /></main>} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/listing/:id" element={<ListingDetailPage />} />
          <Route path="/seller/:id" element={<SellerProfilePage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/sellers" element={<SellersPage />} />
          <Route path="/safety" element={<SafetyPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/legal" element={<LegalHubPage />} />
          <Route path="/legal/:docId" element={<LegalDocumentPage />} />
          <Route path="/human-check" element={<HumanCheckPage />} />
          <Route path="/security" element={<SecurityPolicyPage />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={(
          <Suspense fallback={<div className="page-main" style={{ padding: 48, textAlign: 'center' }}>Loading admin…</div>}>
            <AdminApp />
          </Suspense>
        )}
      />
      <Route path="/*" element={<PublicSite />} />
    </Routes>
  );
}
