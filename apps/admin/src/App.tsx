// apps/admin/src/App.tsx
import React, { useCallback } from 'react';
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useNavigate, // ✅ import useNavigate
} from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import PackagesCreate from './pages/PackagesCreate';
import PackagesManage from './pages/PackagesManage';
import Transactions from './pages/Transactions';
import Receipts from './pages/Receipts';
import Users from './pages/Users';
import AdminLogin from './pages/AdminLogin';
import OpenStaxIngest from './pages/OpenStaxIngest';
import Certifications from './pages/Certifications';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider } from '@mytutorapp/shared/hooks';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { Loader2 } from 'lucide-react';
import YouTubeIngest from './pages/YouTubeIngest';

/** Small full-screen splash while auth is rehydrating */
function AuthSplash() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-sm text-mutedGray dark:text-darkTextSecondary">
      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
      Checking admin access…
    </div>
  );
}

/** Observe <html class="dark"> changes so we can sync Toastify theme */
function useIsDark(): boolean {
  const [isDark, setIsDark] = React.useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );
  React.useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

type Role = 'student' | 'tutor' | 'admin' | 'superadmin' | null;

// Simple role ranking helper
const roleRank: Record<string, number> = {
  student: 0,
  tutor: 1,
  admin: 2,
  superadmin: 3,
};
function hasRoleAtLeast(current: Role, required: 'admin' | 'superadmin') {
  if (!current) return false;
  return (roleRank[current] ?? -1) >= roleRank[required];
}

/**
 * Guard: prefer adminToken, avoid infinite splash.
 * - Show splash ONLY while provider is initializing AND there is no token yet.
 * - If we have an adminToken but no role yet, infer 'admin' to avoid deadlock.
 * - LocalStorage role is a soft fallback for hard refreshes.
 */
function RequireRole({
  minRole,
  children,
}: {
  minRole: 'admin' | 'superadmin';
  children: React.ReactNode;
}) {
  const { initializing, token, adminToken, role } = useShopContext();
  const loc = useLocation();

  // Prefer admin token for admin routes
  const effectiveToken = adminToken || token || '';

  // Soft fallback for role on hard refreshes
  const lsRole = (typeof window !== 'undefined' && (localStorage.getItem('role') || '')) || '';

  // If adminToken exists but role not populated yet, infer 'admin'
  const effectiveRole: Role =
    (role as Role) || (adminToken ? 'admin' : null) || ((lsRole || null) as Role);

  // While provider is hydrating AND we have no token yet → splash
  if (initializing && !effectiveToken) {
    return <AuthSplash />;
  }

  // No token at all → login
  if (!effectiveToken) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }

  // Token exists but role unknown: allow through; backend will enforce 401/403 if needed
  if (!effectiveRole) {
    return <>{children}</>;
  }

  // Role known but insufficient → login
  if (!hasRoleAtLeast(effectiveRole, minRole)) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }

  return <>{children}</>;
}

/** Shell shown for all authenticated admin pages */
function AdminShell() {
  const { logout, setAdminToken } = useShopContext();
  const isDark = useIsDark();
  const nav = useNavigate();

  const onLogout = useCallback(async () => {
    await Promise.all([logout(), setAdminToken('')]);
    localStorage.removeItem('role'); // optional
    nav('/login', { replace: true });
  }, [nav, logout, setAdminToken]);

  return (
    <div className="app-body min-h-screen">
      <ToastContainer theme={isDark ? 'dark' : 'light'} />
      <Navbar onLogout={onLogout} />
      <hr className="border-gray-200 dark:border-darkCard" />
      <div className="flex w-full">
        <Sidebar />
        <main className="w-[70%] mx-auto ml-[max(5vw,25px)] my-8 text-gray-600 dark:text-darkTextPrimary text-base">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LoginChrome() {
  const isDark = useIsDark();
  return (
    <div className="app-body min-h-screen">
      <ToastContainer theme={isDark ? 'dark' : 'light'} />
      <AdminLogin />
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ThemeProvider applyToDocument storageKey="theme">
      <Routes>
        {/* Public login route (no admin chrome) */}
        <Route path="/login" element={<LoginChrome />} />

        {/* Protected admin routes (admin or superadmin) */}
        <Route
          element={
            <RequireRole minRole="admin">
              <AdminShell />
            </RequireRole>
          }
        >
          <Route path="/" element={<Navigate to="/packages" replace />} />
          <Route path="/oer/openstax-ingest" element={<OpenStaxIngest />} />
          <Route path="/packages/create" element={<PackagesCreate />} />
          <Route path="/packages" element={<PackagesManage />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/users" element={<Users />} />
          <Route path="/certifications" element={<Certifications />} />
          <Route path="/oer/youtube-ingest" element={<YouTubeIngest />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/packages" replace />} />
      </Routes>
    </ThemeProvider>
  );
};

export default App;
