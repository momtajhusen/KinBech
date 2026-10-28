import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import { FeedbackHost } from './components/Feedback';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LiveActivity from './pages/LiveActivity';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Support from './pages/Support';
import ContactCenter from './pages/ContactCenter';
import TestAccounts from './pages/TestAccounts';
import ScamMonitor from './pages/ScamMonitor';
import FraudSignals from './pages/FraudSignals';
import ShopVerification from './pages/ShopVerification';
import Listings from './pages/Listings';
import PendingReview from './pages/PendingReview';
import Shops from './pages/Shops';
import Reports from './pages/Reports';
import Trust from './pages/Trust';
import Reviews from './pages/Reviews';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import RestrictedKeywords from './pages/RestrictedKeywords';
import ErrorLog from './pages/ErrorLog';
import AiModels from './pages/AiModels';
import CallAccounts from './pages/CallAccounts';
import Subscriptions from './pages/Subscriptions';
import ChangePassword from './pages/ChangePassword';
import Activity from './pages/Activity';
import Security from './pages/Security';
import { adminPath } from './routes';
import { PAGE_SCOPES, canAccess, firstAllowedPath } from './utils/access';
import './admin.css';
import './admin-clay.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to={adminPath('login')} replace />;
  if (user.mustChangePassword) return <ChangePassword />;
  if (user.twoFactorSetupRequired) return <Security forced />;
  return children;
}

function NoAccess() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2>No access</h2>
      <p>Your admin role can&apos;t open this page. Ask a super admin if you need it.</p>
    </div>
  );
}

/** Render a page only when the admin's role has its RBAC scope. */
function Scoped({ page, children }) {
  const { user } = useAuth();
  if (canAccess(user, PAGE_SCOPES[page])) return children;
  const fallback = firstAllowedPath(user);
  if (fallback && fallback !== adminPath(page)) return <Navigate to={fallback} replace />;
  return <NoAccess />;
}

const PAGES = [
  ['dashboard', Dashboard],
  ['live-activity', LiveActivity],
  ['users', Users],
  ['support', Support],
  ['contact-center', ContactCenter],
  ['testers', TestAccounts],
  ['shops', Shops],
  ['shop-verification', ShopVerification],
  ['pending-review', PendingReview],
  ['listings', Listings],
  ['categories', Categories],
  ['restricted-keywords', RestrictedKeywords],
  ['reports', Reports],
  ['trust', Trust],
  ['scam-monitor', ScamMonitor],
  ['fraud-signals', FraudSignals],
  ['error-log', ErrorLog],
  ['reviews', Reviews],
  ['notifications', Notifications],
  ['ai-models', AiModels],
  ['voice-calls', CallAccounts],
  ['subscriptions', Subscriptions],
  ['settings', Settings],
  ['activity', Activity],
];

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (user) return <Navigate to={adminPath('dashboard')} replace />;
  return children;
}

export default function AdminApp() {
  return (
    <AdminThemeProvider>
      <FeedbackHost />
      <AuthProvider>
        <Routes>
          <Route
            path="login"
            element={(
              <PublicRoute>
                <Login />
              </PublicRoute>
            )}
          />
          <Route
            path="/"
            element={(
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            )}
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            {PAGES.map(([page, Page]) => (
              <Route
                key={page}
                path={page}
                element={(
                  <Scoped page={page}>
                    <Page />
                  </Scoped>
                )}
              />
            ))}
            <Route
              path="users/:userId"
              element={(
                <Scoped page="users">
                  <UserDetail />
                </Scoped>
              )}
            />
            <Route path="account-security" element={<Security />} />
          </Route>
          <Route path="*" element={<Navigate to={adminPath('login')} replace />} />
        </Routes>
      </AuthProvider>
    </AdminThemeProvider>
  );
}
