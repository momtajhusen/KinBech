import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import AmbientBackground from './components/AmbientBackground';
import Navbar from './components/Navbar';

const AdminApp = lazy(() => import('./admin/AdminApp'));
import LandingPage from './pages/LandingPage';
import ExplorePage from './pages/ExplorePage';
import MapPage from './pages/MapPage';
import ListingDetailPage from './pages/ListingDetailPage';
import SellerProfilePage from './pages/SellerProfilePage';
import CategoriesPage from './pages/CategoriesPage';
import FeaturesPage from './pages/FeaturesPage';
import HowItWorksPage from './pages/HowItWorksPage';
import SellersPage from './pages/SellersPage';
import SafetyPage from './pages/SafetyPage';
import FaqPage from './pages/FaqPage';
import DownloadPage from './pages/DownloadPage';
import LegalHubPage from './pages/LegalHubPage';
import LegalDocumentPage from './pages/LegalDocumentPage';

function PublicSite() {
  return (
    <>
      <AmbientBackground />
      <Navbar />
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
      </Routes>
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
