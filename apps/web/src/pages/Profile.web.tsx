// apps/web/src/pages/Profile.web.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import RefundCenter from '../components/RefundCenter.web';
import { useShopContext } from '@mytutorapp/shared/context';
import { useCourses } from '@mytutorapp/shared/hooks';
import { useEnrollments } from '@mytutorapp/shared/hooks/useEnrollments';
import { useCourseProgress } from '@mytutorapp/shared/hooks/useCourseProgress';
import type { Course, Enrollment, CourseProgress } from '@mytutorapp/shared/types';

import PaymentWidget from '../components/PaymentWidget.web';
import ThemeToggle from '../components/ThemeToggle.web';
import DeleteAccount from '../components/DeleteAccount.web';
import useAppQuery from '@mytutorapp/shared/hooks/useAppQuery';
import * as accountApi from '@mytutorapp/shared/api';
import type { Transaction } from '@mytutorapp/shared/types';

import type { EarningsSummary } from '@mytutorapp/shared/types';
import { fetchEarningsSummary } from '@mytutorapp/shared/api/accountApi';

// Icons
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faHouse,
  faChalkboardUser,
  faUsers,
  faUser,
  faMessage,
  faBell,
  faVideo,
  faCoins,
  faWandMagicSparkles,
  faTriangleExclamation,
  faCertificate,
} from '@fortawesome/free-solid-svg-icons';

/* ---------- utils ---------- */
const FALLBACK_AVATAR = (n = 'You') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=223649&color=ffffff`;

const resolveAsset = (raw?: string, backendUrl?: string, fallbackName?: string) => {
  if (!raw) return FALLBACK_AVATAR(fallbackName ?? 'You');
  if (raw.startsWith('/') && backendUrl) return `${backendUrl.replace(/\/+$/, '')}${raw}`;
  return raw;
};

const toNum = (v: unknown, fb = 0): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string'
    ? Number(v) || fb
    : fb;

/** Return a string courseId if present in either shape, never "undefined". */
const getCourseId = (row: unknown): string | null => {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  const v = ((): unknown => {
    if (typeof o.courseId === 'string' || typeof o.courseId === 'number') return o.courseId;
    if (typeof o['course_id'] === 'string' || typeof o['course_id'] === 'number') return o['course_id'];
    return null;
  })();
  if (v === null || v === undefined) return null;
  return String(v);
};

/** Basic UUID check (accepts v1–v5). */
const isUuid = (s: string | null | undefined): s is string =>
  !!s && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(s);

/** Numeric ID check. */
const isNumericId = (s: unknown): boolean =>
  (typeof s === 'string' && /^\d+$/.test(s)) || (typeof s === 'number' && Number.isFinite(s));

/** Accept UUID or numeric. */
const isValidCourseId = (id: unknown): id is string =>
  typeof id === 'string' ? (isUuid(id) || /^\d+$/.test(id)) : (typeof id === 'number' && Number.isFinite(id));

/** Detect if payout is configured (supports current + legacy field names). */
const hasPayoutSetup = (prof?: any): boolean => {
  if (!prof) return false;
  const method = prof?.payout_method ?? prof?.payoutMethod;
  const currency = prof?.payout_currency ?? prof?.payoutCurrency;
  const wise = prof?.wise_email ?? prof?.wiseEmail;
  const mpesa = prof?.mpesa_phone_number ?? prof?.mpesaPhoneNumber;
  return Boolean(method || currency || wise || mpesa);
};

/* ---------- shapes ---------- */
type ProfileLike = {
  id?: string | number;
  user_id?: string | number;
  name?: string;
  role?: string;
  avatar?: string;
  photoUrl?: string;
  avatar_url?: string;
  gallery?: string[];
};

type EarningsSummaryLocal = { total: number; pending: number; available: number; currency?: string };

/* ---------- Student progress row ---------- */
const StudentProgressRow: React.FC<{
  courseId: string | null;
  title: string;
  backendUrl: string;
  token: string;
  fallbackPct?: number;
}> = ({ courseId, title, backendUrl, token, fallbackPct = 0 }) => {
  const validId = isValidCourseId(courseId ?? '');
  const courseIdForHook = validId ? String(courseId) : '';

  // Only load hook data if we have a valid ID; the hook can also bail internally if empty string.
  const { progress, loading } = useCourseProgress(backendUrl, courseIdForHook, token);

  const { fetchCourseById } = useCourses({ backendUrl, token });
  const [totalWeeks, setTotalWeeks] = useState<number>(0);

  useEffect(() => {
    if (!validId) {
      setTotalWeeks(0);
      return;
    }
    let ignore = false;
    fetchCourseById(courseIdForHook)
      .then((c: Course) => {
        if (!ignore) setTotalWeeks(Array.isArray(c?.syllabus) ? c.syllabus.length : 0);
      })
      .catch(() => setTotalWeeks(0));
    return () => {
      ignore = true;
    };
  }, [fetchCourseById, courseIdForHook, validId]);

  const pct = useMemo(() => {
    if (!validId) return Math.max(0, Math.min(100, Math.round(fallbackPct)));
    if (loading) return 0;
    const items: CourseProgress[] = Array.isArray(progress) ? progress : [];
    const completed = items.filter((p) => p.status === 'Completed').length;
    if (totalWeeks > 0) return Math.round((completed / totalWeeks) * 100);
    return Math.max(0, Math.min(100, Math.round(fallbackPct)));
  }, [progress, loading, totalWeeks, fallbackPct, validId]);

  const toHref = validId ? `/courses/${String(courseId)}/progress` : '#';

  return (
    <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium line-clamp-1">{title}</p>
        <span className="text-sm font-semibold">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#cedbe8] dark:bg-darkCard">
        <div className="h-full bg-[#3d99f5]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2">
        <Link
          to={toHref}
          className={`inline-flex h-8 px-3 rounded-lg ${
            validId ? 'bg-[#e7edf4] dark:bg-[#172534]' : 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
          } text-sm font-semibold`}
          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
            if (!validId) e.preventDefault();
          }}
          title={validId ? 'Open progress' : 'Missing/invalid course id'}
        >
          Open progress
        </Link>
      </div>
    </div>
  );
};

/* ---------------------------------- Page ---------------------------------- */
const ProfilePage: React.FC = () => {
  const nav = useNavigate();
  const {
    profile,
    backendUrl,
    userEmail, // may be null/undefined initially
    role: ctxRole, // role from context if available
    logout,
    language,
    tokens = 0,
    token,
    loadingProfile,
    refetchDetails,
    reftechDetails,
    refreshProfile,
    refreshWallet,
    setTokens: setCtxTokens,
  } = useShopContext() as any;

  // Fetch /api/user/me when we need email/role fallback
  const [meEmail, setMeEmail] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const needEmail = !userEmail;
    const needRole = !ctxRole && !(profile as ProfileLike | undefined)?.role;

    if (token && (needEmail || needRole)) {
      (async () => {
        try {
          setMeLoading(true);
          const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = (await r.json()) as { success?: boolean; email?: string; role?: string };
          if (!cancelled && j?.success) {
            if (j.email) setMeEmail(j.email);
            if (j.role) setMeRole(j.role);
          }
        } catch {
          // ignore; we’ll just keep existing fallbacks
        } finally {
          if (!cancelled) setMeLoading(false);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [backendUrl, token, userEmail, ctxRole, profile]);

  const p = (profile ?? {}) as ProfileLike;
  // Payout currency for tutor (USD/KES)
const payoutCurrency: 'USD' | 'KES' = React.useMemo(() => {
  const raw =
    (p as any)?.payoutCurrency ??
    (p as any)?.payout_currency ??
    (p as any)?.currency ?? // <— NEW: also look at generic "currency"
    'USD';

  const upper = String(raw).toUpperCase();
  return upper === 'KES' ? 'KES' : 'USD';
}, [p]);


  // Resolved identity
  const resolvedEmail = userEmail || meEmail || '';
  const resolvedRoleRaw = String(p.role || ctxRole || meRole || '').trim();
  const resolvedRole = resolvedRoleRaw || 'Member';

  const roleLower = resolvedRoleRaw.toLowerCase();
  const isStudent = roleLower === 'student' || roleLower === 'learner' || roleLower === 'pupil';
  const isTutor = roleLower === 'tutor';
  const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';

  // Role-aware "has profile"
  const hasTutorProfile = isTutor && Boolean(profile);
  const hasStudentProfile = isStudent; // any logged-in student is treated as having a profile
  const hasProfile = hasTutorProfile || hasStudentProfile;

  const canSeeEarnings = useMemo(() => isTutor && hasPayoutSetup(p), [isTutor, p]);

  const avatar = useMemo(
    () => resolveAsset(p.avatar ?? p.photoUrl ?? p.avatar_url ?? p.gallery?.[0], backendUrl, p.name || 'You'),
    [p.avatar, p.photoUrl, p.avatar_url, p.gallery, backendUrl, p.name]
  );

  /* identity form */
  const [name, setName] = useState<string>(p.name || '');
  const [email, setEmail] = useState<string>(resolvedEmail);
  const [phone, setPhone] = useState<string>('');
  const [tz, setTz] = useState<string>('');
  const [notif, setNotif] = useState<boolean>(true);
  const [openPayment, setOpenPayment] = useState(false);
  const [refreshingTokens, setRefreshingTokens] = useState(false); // NEW: tiny UX signal

  useEffect(() => setName(p.name || ''), [p.name]);
  useEffect(() => setEmail(resolvedEmail), [resolvedEmail]);

  const onEditOrCreateProfile = () => {
    if (isTutor) {
      // Tutor: create vs edit depends on whether they actually have a tutor profile
      nav(hasTutorProfile ? '/settings/manage' : '/settings/create');
    } else {
      // Student: always edit existing account/profile data
      nav('/settings/manage');
    }
  };

  const onLogout = async () => {
    try {
      await logout();
    } finally {
      nav('/', { replace: true });
    }
  };

    /* Transactions for earnings math ---------------------------------------- */
  const {
    data: transactions = [],
  } = useAppQuery<Transaction[], Error>(
    ['profileTransactions', token],
    () => accountApi.fetchTransactions(backendUrl, token!),
    { enabled: Boolean(token), refetchOnWindowFocus: false }
  );

  const { lifetimeByCurrency, pendingWithdrawalsByCurrency } = React.useMemo(() => {
    const sums: Record<string, number> = {};
    const pending: Record<string, number> = {};

    for (const tx of transactions) {
      const curr = String(tx.currency ?? 'USD').toUpperCase();
      const amt = Math.max(0, Number(tx.amount) || 0);

      if (tx.type?.toLowerCase().includes('earning')) {
        sums[curr] = (sums[curr] || 0) + amt;
      }

      if (tx.type === 'Withdrawal Request' && (tx.status || 'Pending') === 'Pending') {
        pending[curr] = (pending[curr] || 0) + amt;
      }
    }

    return { lifetimeByCurrency: sums, pendingWithdrawalsByCurrency: pending };
  }, [transactions]);

  const approxLifetime = lifetimeByCurrency[payoutCurrency] ?? 0;
  const approxPending  = pendingWithdrawalsByCurrency[payoutCurrency] ?? 0;
  const approxAvailable = Math.max(0, approxLifetime - approxPending);


    /* tutor earnings — use backend summary + tx fallback --------------------- */
  const {
    data: earningsRaw,
    isLoading: earningsLoading,
    error: earningsError,
  } = useAppQuery<EarningsSummary, AxiosError<{ message?: string }>>(
    ['profileEarningsSummary', token, canSeeEarnings],
    () => fetchEarningsSummary(backendUrl, token!),
    {
      enabled: Boolean(token && canSeeEarnings),
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (count, err) => {
        const status = err?.response?.status ?? 0;
        if ([401, 403, 404].includes(status)) return false;
        return count < 1;
      },
    }
  );

  const earnErr = React.useMemo(() => {
    if (!earningsError) return null;
    const ax = earningsError as AxiosError<{ message?: string }>;
    const status = ax.response?.status;
    if (status === 401) return 'Please log in again to view earnings.';
    if (status === 403) return 'Earnings are restricted for your account.';
    return ax.response?.data?.message || 'Failed to load earnings.';
  }, [earningsError]);

  const earn: EarningsSummaryLocal = React.useMemo(() => {
    if (!canSeeEarnings) {
      return { total: 0, pending: 0, available: 0, currency: payoutCurrency };
    }

    const raw = earningsRaw;
    const total =
      raw && raw.total && raw.total > 0 ? raw.total : approxLifetime;
    const pending =
      raw && raw.pending && raw.pending > 0 ? raw.pending : approxPending;
    const available =
      raw && raw.available && raw.available > 0 ? raw.available : approxAvailable;

    return {
      total,
      pending,
      available,
      currency: payoutCurrency,
    };
  }, [canSeeEarnings, earningsRaw, approxLifetime, approxPending, approxAvailable, payoutCurrency]);

  const earnLoading = earningsLoading;

  // Optional debug logs
  console.log('[ProfilePage] tutor earnings payoutCurrency', payoutCurrency);
  console.log('[ProfilePage] canSeeEarnings', canSeeEarnings);
  console.log('[ProfilePage] earningsRaw', earningsRaw);
  console.log('[ProfilePage] approxLifetime/pending/available', {
    approxLifetime,
    approxPending,
    approxAvailable,
  });
  console.log('[ProfilePage] normalized earn (Profile)', earn);


  const fmtMoney = useCallback(
    (n: number, c?: string) =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c || 'USD',
        maximumFractionDigits: 2,
      }).format(n),
    []
  );

  /* student enrollments → Progress list */
  const meId = (p.user_id ?? p.id) as string | number | undefined;
  const { enrollments, loading: enrLoading, error: enrError, fetchMine } = useEnrollments({
    backendUrl,
    token: token ?? '',
    studentId: (meId ?? 'me') as string | number,
  });

  useEffect(() => {
    if (isStudent) fetchMine().catch(() => {});
  }, [isStudent, fetchMine]);

  useEffect(() => {
    if (isAdmin) {
      try {
        sessionStorage.setItem('auth:returnTo', '/org/profile');
      } catch {}
      nav('/org/login', { replace: true });
    }
  }, [isAdmin, nav]);

  /** ─────────────────────────────────────────────────────────
   * NEW: Make token balance update immediately after purchase
   * 1) Try shopContext.refetchDetails / reftechDetails (typo)
   * 2) Try refreshWallet / refreshProfile
   * 3) Hard fallback: GET /api/account/balance and set via setTokens
   * 4) Also listen to an optional window "wallet:updated" event
   * ───────────────────────────────────────────────────────── */
  const refreshAccountState = useCallback(async () => {
    setRefreshingTokens(true);
    try {
      if (typeof refetchDetails === 'function') {
        await refetchDetails();
        return;
      }
      if (typeof reftechDetails === 'function') {
        await reftechDetails();
        return;
      }
      if (typeof refreshWallet === 'function') {
        await refreshWallet();
      }
      if (typeof refreshProfile === 'function') {
        await refreshProfile();
      }
      // Fallback: direct balance fetch -> setTokens
      if (typeof setCtxTokens === 'function' && token && backendUrl) {
        try {
          const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/account/balance`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (r.ok) {
            const j = await r.json();
            const bal =
              Number(j?.balance ?? j?.tokens ?? j?.data?.balance ?? j?.data?.tokens ?? NaN);
            if (Number.isFinite(bal)) setCtxTokens(bal);
          }
        } catch {
          /* ignore */
        }
      }
    } finally {
      setRefreshingTokens(false);
    }
  }, [refetchDetails, reftechDetails, refreshWallet, refreshProfile, setCtxTokens, token, backendUrl]);

  // When the payment sheet closes (regardless of success), refresh balances.
  const handlePaymentClose = useCallback(async () => {
    setOpenPayment(false);
    await refreshAccountState();
  }, [refreshAccountState]);

  useEffect(() => {
    const isOrgMode =
      typeof window !== 'undefined' && window.localStorage.getItem('auth:mode') === 'org';
    if (isOrgMode) nav('/org/profile', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional: if PaymentWidget dispatches a CustomEvent('wallet:updated', {detail:{balance}})
  useEffect(() => {
    const onWalletUpdated = (e: Event) => {
      const anyEvt = e as CustomEvent;
      const bal = Number(anyEvt?.detail?.balance);
      if (Number.isFinite(bal) && typeof setCtxTokens === 'function') {
        setCtxTokens(bal);
      }
    };
    window.addEventListener('wallet:updated', onWalletUpdated);
    return () => window.removeEventListener('wallet:updated', onWalletUpdated);
  }, [setCtxTokens]);

  const ctaLabel = loadingProfile
    ? 'Loading…'
    : isTutor
    ? hasTutorProfile
      ? 'Edit profile'
      : 'Create profile'
    : 'Edit profile';

  const shouldAnimate = isTutor && !hasTutorProfile && !loadingProfile; // highlight CTA if tutor missing profile

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-darkBg text-[#0d141c] dark:text-darkTextPrimary"
      style={{ fontFamily: `Manrope, "Noto Sans", sans-serif` }}
    >
      <div className="flex justify-center py-5 px-4 sm:px-6 lg:px-10">
        <div className="w-full max-w-[1200px] grid grid-cols-1 md:grid-cols-[20rem_1fr] gap-4">
          {/* Sidebar */}
          <aside className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 md:sticky md:top-24 self-start">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="size-12 rounded-full bg-cover bg-center ring-1 ring-gray-200 dark:ring-darkCard"
                style={{ backgroundImage: `url("${avatar}")` }}
              />
              <div>
                <div className="font-semibold">{p.name || 'You'}</div>
                <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                  {resolvedRole}
                </div>
              </div>
            </div>

            {/* Mobile: text-only; Large screens: icon + label with fixed icon column */}
            <nav className="flex flex-wrap md:grid gap-2 md:gap-2">
              <Link
                to="/"
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faHouse as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">Home</span>
                </span>
              </Link>

              <Link
                to="/account?tab=sessions"
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faChalkboardUser as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">My lessons</span>
                </span>
              </Link>

              <Link
                to={isStudent ? '/tutors' : '/students'}
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faUsers as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">{isStudent ? 'My tutors' : 'My students'}</span>
                </span>
              </Link>

              <Link
                to="/profile/me"
                className="px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faUser as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">My profile</span>
                </span>
              </Link>

              <Link
                to="/messages"
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faMessage as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">Messages</span>
                </span>
              </Link>

              <Link
                to="/notifications"
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faBell as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">Notifications</span>
                </span>
              </Link>
              <Link
                to="/results"
                className="px-3 py-2 rounded-xl hover:bg-[#e7edf4] dark:hover:bg-[#172534] text-sm"
                title="Print or download your certificate"
              >
                <span className="flex items-center">
                  <span className="hidden lg:inline-flex w-5 shrink-0 justify-center">
                    <FontAwesomeIcon icon={faCertificate as IconProp} aria-hidden />
                  </span>
                  <span className="lg:ml-2">Certificate print</span>
                </span>
              </Link>
            </nav>
          </aside>

          {/* Main */}
          <section>
            {/* Header */}
            <div className="flex items-center justify-between p-4">
              <h1 className="text-[28px] sm:text-[32px] font-bold">My profile</h1>
              <button
                onClick={onEditOrCreateProfile}
                disabled={loadingProfile}
                className={`md:hidden rounded-xl h-10 px-4 font-bold disabled:opacity-60 ${
                  shouldAnimate
                    ? 'animate-pulse bg-[#3d99f5] text-white shadow-lg shadow-blue-400/50'
                    : 'bg-[#e7edf4] dark:bg-[#172534]'
                }`}
              >
                {ctaLabel}
              </button>
            </div>

            {/* 🔔 Tutor missing-profile alert banner */}
            {isTutor && !hasTutorProfile && (
              <div className="mx-4 mb-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/40 dark:bg-[#241a06] dark:text-amber-200 p-4 flex items-start gap-3">
                <div className="mt-0.5">
                  <FontAwesomeIcon icon={faTriangleExclamation as IconProp} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">No tutor profile found</div>
                  <p className="text-sm mt-0.5">
                    You’re signed in as a tutor. Create your profile so students can discover and book you.
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={onEditOrCreateProfile}
                      className="inline-flex h-9 px-3 rounded-lg bg-amber-200/70 dark:bg-amber-500/20 font-semibold"
                    >
                      Create profile
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Identity */}
            <div className="px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className="h-24 w-24 rounded-full bg-cover bg-center ring-1 ring-[#cedbe8] dark:ring-darkCard"
                    style={{ backgroundImage: `url("${avatar}")` }}
                  />
                  <div>
                    <div className="text-[20px] sm:text-[22px] font-bold">{p.name || 'You'}</div>
                    <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                      {resolvedRole}
                    </div>
                    {/* Always show email (from context or /me fallback) */}
                    {resolvedEmail && (
                      <div className="text-xs text-[#49739c] dark:text-darkTextSecondary mt-0.5">
                        {resolvedEmail}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={onEditOrCreateProfile}
                  disabled={loadingProfile}
                  className={`hidden md:inline-flex rounded-xl h-10 px-4 font-bold disabled:opacity-60 ${
                    shouldAnimate
                      ? 'animate-pulse bg-[#3d99f5] text-white shadow-lg shadow-blue-400/50'
                      : 'bg-[#e7edf4] dark:bg-[#172534]'
                  }`}
                >
                  {ctaLabel}
                </button>
              </div>
              {isTutor && !hasTutorProfile && !loadingProfile && (
                <p className="mt-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
                  👉 Please create your tutor profile to get started!
                </p>
              )}
            </div>

            {/* Personal info */}
            <h2 className="px-4 pt-4 pb-2 text-[20px] sm:text-[22px] font-bold">Personal information</h2>
            <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col">
                <span className="pb-2 font-medium">Full name</span>
                <input
                  className="h-12 sm:h-14 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label className="flex flex-col">
                <span className="pb-2 font-medium">Email</span>
                <input
                  className="h-12 sm:h-14 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="flex flex-col">
                <span className="pb-2 font-medium">Phone number</span>
                <input
                  className="h-12 sm:h-14 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+0 000 000000"
                />
              </label>
              <label className="flex flex-col">
                <span className="pb-2 font-medium">Time zone</span>
                <input
                  className="h-12 sm:h-14 rounded-xl border border-[#cedbe8] dark:border-darkCard bg-slate-50 dark:bg-[#0f1821] px-3"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="Africa/Nairobi"
                />
              </label>
            </div>

            {/* Payments / Earnings */}
            <h2 className="px-4 pt-6 pb-2 text-[20px] sm:text-[22px] font-bold">
              {isTutor ? 'Tutor earnings' : 'Payment management'}
            </h2>
            <div className="mx-4">
              {isTutor ? (
                <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="font-medium">Earnings summary</div>

                    {/* Available highlight */}
                    <div className="rounded-xl p-4 bg-[#f6f9fc] dark:bg-[#0b1620] border border-[#cedbe8] dark:border-[#182430]">
                      {earnLoading ? (
                        <div className="text-sm text-[#49739c]">Loading…</div>
                      ) : !canSeeEarnings ? (
                        <div className="text-sm text-[#49739c]">
                          Set up your payout method to enable earnings.
                          <button
                            onClick={onEditOrCreateProfile}
                            className="ml-2 inline-flex h-8 px-2 rounded-md bg-amber-200/70 dark:bg-amber-500/20 text-xs font-semibold"
                          >
                            Open profile
                          </button>
                        </div>
                      ) : earnErr ? (
                        <div className="text-sm">
                          <span className="text-red-600">{earnErr}</span>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm text-[#49739c] dark:text-darkTextSecondary">
                            Available ({earn.currency || 'USD'})
                          </div>
                          <div className="text-3xl font-extrabold tracking-tight">
                            {fmtMoney(earn.available, earn.currency)}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Totals (compact) */}
                    {canSeeEarnings && !earnLoading && !earnErr && (
                      <div className="text-sm grid grid-cols-2 gap-3">
                        <div className="rounded-lg p-3 bg-[#e7edf4]/60 dark:bg-[#172534]">
                          <div className="text-[#49739c] dark:text-darkTextSecondary">Total earned</div>
                          <div className="font-semibold">{fmtMoney(earn.total, earn.currency)}</div>
                        </div>
                        <div className="rounded-lg p-3 bg-[#e7edf4]/60 dark:bg-[#172534]">
                          <div className="text-[#49739c] dark:text-darkTextSecondary">Pending</div>
                          <div className="font-semibold">{fmtMoney(earn.pending, earn.currency)}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 sm:self-start">
                    <Link
                      to="/account?tab=earnings"
                      className={`rounded-xl h-10 px-4 font-semibold flex items-center ${
                        canSeeEarnings
                          ? 'bg-[#e7edf4] dark:bg-[#172534]'
                          : 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                      }`}
                      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                        if (!canSeeEarnings) e.preventDefault();
                      }}
                      title={
                        canSeeEarnings ? 'Open detailed earnings view' : 'Set up payouts to view details'
                      }
                    >
                      View details
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-lg bg-[#e7edf4] dark:bg-[#172534]" />
                    <div>
                      <div className="font-medium">Session tokens</div>
                      <div className="text-sm text-[#49739c]">
                        Balance:{' '}
                        <span className="font-semibold">
                          {tokens}
                          {refreshingTokens && <span className="ml-2 opacity-60">(updating…)</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenPayment(true)}
                    className="rounded-xl h-10 px-4 bg-[#3d99f5] text-white font-semibold"
                  >
                    Buy tokens
                  </button>
                </div>
              )}
            </div>
            {!isTutor && (
              <PaymentWidget
                isOpen={openPayment}
                onClose={handlePaymentClose}
                title="Top up your tokens"
                showTutorPreview={false}
              />
            )}

            {/* Refund Center (students) */}
            {isStudent && (
              <div className="mx-4 mt-3">
                <RefundCenter backendUrl={backendUrl} token={token} />
              </div>
            )}

            {/* Progress Management (students) */}
            {isStudent && (
              <div className="px-4 pt-6">
                <h2 className="text-[20px] sm:text-[22px] font-bold mb-3">Learning progress</h2>

                {enrLoading && <div className="text-sm text-[#49739c]">Loading your courses…</div>}
                {!enrLoading && enrError && (
                  <div className="text-sm text-red-600">{String(enrError)}</div>
                )}

                {!enrLoading && !enrError && (
                  <div className="grid grid-cols-1 gap-3">
                    {enrollments.slice(0, 8).map((e: Enrollment) => {
                      const courseId = getCourseId(e); // SAFE extract
                      const maybeTitle = (e as unknown as Record<string, unknown>)['title'];
                      const title =
                        typeof maybeTitle === 'string' && maybeTitle.trim().length > 0
                          ? maybeTitle
                          : courseId
                          ? `Course #${courseId}`
                          : 'Course';
                      const fallbackPct = toNum((e as any).progress, 0);

                      return (
                        <StudentProgressRow
                          key={String((e as unknown as Record<string, unknown>).id ?? `${courseId}-${title}`)}
                          courseId={courseId}
                          title={title}
                          backendUrl={backendUrl}
                          token={token ?? ''}
                          fallbackPct={fallbackPct}
                        />
                      );
                    })}
                    {enrollments.length === 0 && (
                      <div className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-6">
                        <div className="text-base">You have no enrollments yet.</div>
                        <div className="text-sm text-[#49739c] mt-1">
                          Browse the catalog to get started.
                        </div>
                        <div className="mt-3">
                          <Link
                            to="/courses"
                            className="inline-flex h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] text-sm font-semibold"
                          >
                            Go to Catalog
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Courses section (after progress) */}
            <h2 className="px-4 pt-6 pb-2 text-[20px] sm:text-[22px] font-bold">Courses</h2>
            {isTutor ? (
              <div className="mx-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Video Vault */}
                <Link
                  to="/class-vault"
                  className="relative rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 dark:from-[#0e1823] dark:via-[#121d2a] dark:to-[#162233] p-4 hover:brightness-105 transition shadow-sm ring-1 ring-amber-200/50 dark:ring-amber-500/10"
                  title="Upload recorded lessons and earn while you sleep"
                >
                  <div className="absolute -top-2 -right-2">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold bg-amber-200/70 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 ring-1 ring-amber-300/60 dark:ring-amber-600/40">
                      <FontAwesomeIcon icon={faCoins as IconProp} />
                      Passive income
                    </span>
                  </div>
                  <p className="text-base font-semibold flex items-center gap-2">
                    <FontAwesomeIcon icon={faVideo as IconProp} />
                    Video Vault
                  </p>
                  <p className="text-[#8b5e00] dark:text-amber-200/90 text-sm mt-1">
                    Upload recorded classes & notes. Students purchase with tokens — you earn
                    automatically.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#fff] dark:bg-[#0f1821] ring-1 ring-amber-300/50 dark:ring-amber-600/30">
                    Go to Vault →
                  </div>
                </Link>

                {/* Create Course card */}
                <Link
                  to="/create-course"
                  className="relative rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-gradient-to-r from-indigo-50 via-blue-50 to-cyan-50 dark:from-[#0e1823] dark:via-[#111b29] dark:to-[#0d1722] p-4 hover:brightness-105 transition shadow-sm ring-1 ring-blue-200/50 dark:ring-blue-500/10"
                  title="Launch a full course with a guided builder"
                >
                  <div className="absolute -top-2 -right-2">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold bg-blue-200/70 dark:bg-blue-500/20 text-blue-900 dark:text-blue-200 ring-1 ring-blue-300/60 dark:ring-blue-600/40">
                      <FontAwesomeIcon icon={faWandMagicSparkles as IconProp} />
                      Most popular
                    </span>
                  </div>
                  <p className="text-base font-semibold flex items-center gap-2">
                    <FontAwesomeIcon icon={faWandMagicSparkles as IconProp} />
                    Create Course
                  </p>
                  <p className="text-[#0b3a70] dark:text-blue-200/90 text-sm mt-1">
                    Use our step-by-step builder to publish structured lessons, quizzes & certificates.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg bg-[#fff] dark:bg-[#0f1821] ring-1 ring-blue-300/50 dark:ring-blue-600/30">
                    Start Builder →
                  </div>
                </Link>

                {/* My Courses – fixed link */}
                <Link
                  to="/courses"
                  className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 hover:bg-[#f6f9fc]/60"
                >
                  <p className="text-base font-semibold">My Courses</p>
                  <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">
                    View, edit, update & delete
                  </p>
                </Link>

                <Link
                  to="/achievements"
                  className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 hover:bg-[#f6f9fc]/60"
                >
                  <p className="text-base font-semibold">Badges</p>
                  <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">
                    Your milestones
                  </p>
                </Link>
              </div>
            ) : (
              <div className="mx-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  to="/my-courses"
                  className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 hover:bg-[#f6f9fc]/60"
                >
                  <p className="text-base font-semibold">My Enrollments</p>
                  <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">
                    View & unenroll
                  </p>
                </Link>
                <Link
                  to="/achievements"
                  className="rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] p-4 hover:bg-[#f6f9fc]/60"
                >
                  <p className="text-base font-semibold">Badges</p>
                  <p className="text-[#49739c] dark:text-darkTextSecondary text-sm">
                    View your achievements
                  </p>
                </Link>
              </div>
            )}

            {/* App settings */}
            <h2 className="px-4 pt-6 pb-2 text-[20px] sm:text-[22px] font-bold">App settings</h2>
            <div className="mx-4 grid gap-3">
              <div className="flex items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]" />
                  <span>Notifications</span>
                </div>
                <label
                  className={`relative flex h-[31px] w-[51px] cursor-pointer items-center rounded-full p-0.5 ${
                    notif ? 'bg-[#3d99f5]' : 'bg-[#e7edf4] dark:bg-[#172534]'
                  }`}
                >
                  <div
                    className="h-full w-[27px] rounded-full bg-white transition-transform"
                    style={{ transform: notif ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                  <input
                    type="checkbox"
                    className="invisible absolute"
                    checked={notif}
                    onChange={() => setNotif((v) => !v)}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]" />
                  <span>Dark mode</span>
                </div>
                <ThemeToggle />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[#cedbe8] dark:border-darkCard bg-white dark:bg-[#0f1821] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-[#e7edf4] dark:bg-[#172534]" />
                  <span>Language</span>
                </div>
                <span>{language === 'FR' ? 'French' : 'English'}</span>
              </div>
            </div>

            {/* Logout + Delete Account — spaced apart */}
            <div className="px-4 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">

                <button
                  onClick={onLogout}
                  className="h-10 px-4 rounded-xl font-bold bg-[#e7edf4] dark:bg-[#172534]"
                >
                  Log out
                </button>

                <DeleteAccount
                  triggerClassName="h-9 px-3 rounded-lg font-semibold text-sm"
                  label="Delete Account"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
