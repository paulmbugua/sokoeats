// apps/admin/src/pages/AdminLogin.tsx
import React, { useRef, useState, useEffect } from 'react';
import axios, { AxiosError } from 'axios';
import { useShopContext } from '@myhandymanapp/shared/context/ShopContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ShieldCheck,
  Lock,
  Activity,
  Server,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { APP_BACKEND_URL } from '../config';

type AdminLoginResponse = {
  token: string;
  role?: 'admin' | 'superadmin';
  message?: string;
};

type TryResult = { ok: true; data: AdminLoginResponse } | { ok: false; error: string };

/* ----------------------------- DEBUG HELPERS ----------------------------- */
// Toggle: add ?debug=1 to the URL or localStorage.setItem('adminDebug','1')
const DEBUG: boolean = (() => {
  try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.has('debug')) return true;
    if (localStorage.getItem('adminDebug') === '1') return true;
  } catch {}
  return true; // set to false if you want silence by default
})();

const maskEmail = (e: string) => {
  if (!e) return '';
  const [name, domain = ''] = e.split('@');
  const head = (name || '').slice(0, 2) || '*';
  return `${head}***@${domain}`;
};

const shortToken = (t?: string) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : '');

function msgFromAxios(e: unknown): string {
  const err = e as AxiosError<any>;
  return (
    (err?.response?.data?.message as string) ||
    (err?.response?.data as string) ||
    err?.message ||
    'Request failed'
  );
}

function logAxiosError(label: string, e: unknown) {
  if (!DEBUG) return;
  const err = e as AxiosError<any>;
  console.group(`[AdminLogin] ${label} ERROR`);
  console.log('message:', err?.message);
  // @ts-ignore
  console.log('code:', err?.code);
  if (err?.config) {
    const { url, method, baseURL, headers } = err.config as any;
    console.log('request:', { url, method, baseURL, headers });
  }
  if (err?.response) {
    const { status, statusText, data, headers } = err.response as any;
    console.log('response:', { status, statusText, data, headers });
  } else if ((err as any)?.request) {
    console.log(
      'No response (network/CORS?). If status is 0 or "Network Error", check:\n' +
        '- Backend is running and reachable\n' +
        '- Exact backend URL (protocol/host/port) matches CORS allowlist\n' +
        '- HTTPS vs HTTP mismatch'
    );
  }
  console.groupEnd();
}

function logAttemptStart(name: string, info: Record<string, unknown> = {}) {
  if (!DEBUG) return;
  console.groupCollapsed(`[AdminLogin] Attempt → ${name}`);
  console.table(info);
  console.time(`[AdminLogin] ${name} time`);
}

function logAttemptEnd(name: string, result: Record<string, unknown> = {}) {
  if (!DEBUG) return;
  console.timeEnd(`[AdminLogin] ${name} time`);
  console.table(result);
  console.groupEnd();
}

/* --------------------------- LOGIN SEQUENCE --------------------------- */
/** Try admin-first, then fallback */
const tryAdminFirst = async (base: string, email: string, password: string): Promise<TryResult> => {
  // 1) ENV/bootstrap superadmin/admin
  {
    const label = 'admin-env-login';
    logAttemptStart(label, { url: `${base}/api/auth/admin-env-login`, email: maskEmail(email) });
    try {
      const { data } = await axios.post<AdminLoginResponse>(`${base}/api/auth/admin-env-login`, {
        email,
        password,
      });
      logAttemptEnd(label, { ok: true, tokenPreview: shortToken(data?.token), role: data?.role });
      if (data?.token) return { ok: true, data };
    } catch (e) {
      logAxiosError(label, e);
      console.warn('[admin-env-login] 401/err:', msgFromAxios(e));
      logAttemptEnd(label, { ok: false });
    }
  }

  // 2) Admin DB login (if implemented)
  {
    const label = 'admin/login';
    logAttemptStart(label, { url: `${base}/api/admin/login`, email: maskEmail(email) });
    try {
      const { data } = await axios.post<AdminLoginResponse>(`${base}/api/admin/login`, {
        email,
        password,
      });
      logAttemptEnd(label, { ok: true, tokenPreview: shortToken(data?.token), role: data?.role });
      if (data?.token) return { ok: true, data };
    } catch (e) {
      logAxiosError(label, e);
      console.warn('[admin/login] 401/err:', msgFromAxios(e));
      logAttemptEnd(label, { ok: false });
    }
  }

  // 3) OPTIONAL fallback: elevated DB user via /auth/login
  {
    const label = 'auth/login';
    logAttemptStart(label, { url: `${base}/api/auth/login`, email: maskEmail(email) });
    try {
      const { data } = await axios.post<AdminLoginResponse>(`${base}/api/auth/login`, {
        email,
        password,
      });
      logAttemptEnd(label, { ok: true, tokenPreview: shortToken(data?.token), role: data?.role });
      if (data?.token) return { ok: true, data };
    } catch (e) {
      logAxiosError(label, e);
      console.warn('[auth/login] 401/err:', msgFromAxios(e));
      logAttemptEnd(label, { ok: false });
    }
  }

  return { ok: false, error: 'Invalid credentials (all admin login methods returned 401).' };
};

/* ------------------------------ COMPONENT ------------------------------ */
export default function AdminLogin() {
  const { backendUrl, setAdminToken } = useShopContext();
  const effectiveBackendUrl = backendUrl || APP_BACKEND_URL;
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [showPw, setShowPw] = useState<boolean>(false);
  const nav = useNavigate();
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (DEBUG) {
      console.groupCollapsed('[AdminLogin] Context/Env');
      console.log('backendUrl:', effectiveBackendUrl);
      console.log('NODE_ENV:', import.meta?.env?.MODE);
      console.groupEnd();
    }
  }, [effectiveBackendUrl]);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();

    if (!effectiveBackendUrl) {
      toast.error('Backend URL is not configured.');
      if (DEBUG) console.error('[AdminLogin] Missing backendUrl in context');
      return;
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast.error('Please enter your email and password.');
      if (DEBUG) console.warn('[AdminLogin] Missing email or password');
      return;
    }

    try {
      setBusy(true);
      const base = effectiveBackendUrl.replace(/\/+$/, '');

      if (DEBUG) {
        console.group('[AdminLogin] Submit');
        console.log('base:', base);
        console.log('email:', maskEmail(trimmedEmail));
        console.groupEnd();
        console.time('[AdminLogin] total login time');
      }

      const result = await tryAdminFirst(base, trimmedEmail, password);

      if (!result.ok || !result.data?.token) {
        throw new Error(result.ok ? 'Login failed' : result.error);
      }

      // If the backend doesn’t return role for admin login, default to 'admin'
      const role = result.data.role || 'admin';

      // Save dedicated admin JWT (ShopContext will attach it only for /api/admin/*)
      await setAdminToken(result.data.token);

      // Keep local route-guard happy
      localStorage.setItem('role', role);

      if (DEBUG) {
        console.group('[AdminLogin] Success');
        console.log('role:', role);
        console.log('tokenPreview:', shortToken(result.data.token));
        console.groupEnd();
        console.timeEnd('[AdminLogin] total login time');
      }

      toast.success(`Welcome back (${role})!`);
      nav('/approvals', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Login failed';
      toast.error(msg);
      if (DEBUG) logAxiosError('final-catch', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[100vh] flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-50 to-white dark:from-[#0B0E14] dark:to-[#0B0E14]">
      {/* Theme toggle - top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Shell */}
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-6 md:gap-8 items-stretch">
        {/* Left: Login panel */}
        <form
          onSubmit={onSubmit}
          className="panel p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100/70 dark:border-darkCard bg-white/80 dark:bg-darkCard/70 backdrop-blur"
          aria-label="Admin login form"
        >
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-violet-600 dark:text-violet-400" />
              <h2 className="app-heading">Admin Console</h2>
            </div>
            <p className="text-sm text-mutedGray dark:text-darkTextSecondary mt-1">
              Sign in with your Ekazi administrator credentials to approve providers, review requests, bookings, payments, and support cases.
            </p>
          </div>

          <label className="block mb-4">
            <span className="text-sm">Email</span>
            <input
              ref={emailRef}
              className="input mt-1"
              type="email"
              placeholder="admin@ekazi.co.ke"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </label>

          <label className="block mb-2">
            <span className="text-sm">Password</span>
            <div className="relative mt-1">
              <input
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                placeholder="********"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
              />
              <button
                type="button"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                onClick={() => setShowPw((s) => !s)}
                className="absolute inset-y-0 right-2 flex items-center justify-center px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between mb-6">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" className="accent-violet-600" disabled />
              <span className="text-mutedGray dark:text-darkTextSecondary">
                Remember this device
              </span>
            </label>
            <span className="text-xs text-mutedGray dark:text-darkTextSecondary opacity-70">
              Restricted to Ekazi staff
            </span>
          </div>

          <button
            className="btn w-full flex items-center justify-center gap-2"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-gray-100 dark:border-darkCard p-3">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4 text-emerald-600" />
                Secure
              </div>
              <p className="mt-1 text-mutedGray dark:text-darkTextSecondary">
                TLS, hashed credentials, and rate limits protect Ekazi admin access.
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-darkCard p-3">
              <div className="flex items-center gap-2 font-medium">
                <Activity className="w-4 h-4 text-amber-600" />
                Audited
              </div>
              <p className="mt-1 text-mutedGray dark:text-darkTextSecondary">
                Approvals, suspensions, and payment actions are logged by admin user.
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 dark:border-darkCard p-3">
              <div className="flex items-center gap-2 font-medium">
                <Server className="w-4 h-4 text-sky-600" />
                Resilient
              </div>
              <p className="mt-1 text-mutedGray dark:text-darkTextSecondary">
                Operational dashboards track marketplace health and review queues.
              </p>
            </div>
          </div>
        </form>

        {/* Right: brand / context panel */}
        <aside className="hidden md:flex panel p-8 rounded-2xl shadow-lg border border-gray-100/70 dark:border-darkCard bg-white/60 dark:bg-darkCard/60 backdrop-blur flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white">
              Ekazi Admin
            </h3>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Manage Kenyan provider approvals, client requests, bookings, cancellations, commissions, and marketplace trust. Only authorized Ekazi staff are permitted.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-gray-700 dark:text-darkTextPrimary">
              <li className="flex items-center gap-2">
                <span className="chip chip-active">Approvals</span>
                Verify provider IDs, profile photos, certificates, and good conduct documents.
              </li>
              <li className="flex items-center gap-2">
                <span className="chip">Requests</span>
                Monitor client jobs, quote activity, locations, and service categories.
              </li>
              <li className="flex items-center gap-2">
                <span className="chip">Bookings</span>
                Review accepted jobs, cancellations, contacts, and service progress.
              </li>
              <li className="flex items-center gap-2">
                <span className="chip">Trust</span>
                Audit user status, ratings, suspensions, and support escalations.
              </li>
            </ul>
          </div>

          <div className="mt-8 text-xs text-mutedGray dark:text-darkTextSecondary">
            By continuing, you agree to Ekazi administrative access policy. All access attempts and sensitive actions are monitored.
          </div>
        </aside>
      </div>
    </div>
  );
}
