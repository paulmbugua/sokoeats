// apps/web/src/pages/org/OrgHomeRouter.web.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import SeoHead from '../../components/seo/SeoHead';

const MUST_CHANGE_KEY = 'org:mustChangePassword';

/**
 * We treat sessionStorage as the authority during the "first login / change password"
 * transition, because useOrg() can be briefly stale right after password update.
 *
 * - 'force'   => must change password
 * - 'allow'   => explicitly cleared; do NOT force even if stale user says true
 * - 'unknown' => fall back to useOrg() flags
 */
type MustChangeState = 'force' | 'allow' | 'unknown';

const readMustChangeState = (): MustChangeState => {
  if (typeof window === 'undefined') return 'unknown';
  try {
    const v = sessionStorage.getItem(MUST_CHANGE_KEY);

    // support both historical styles
    if (v === '1' || v === 'true') return 'force';
    if (v === '0' || v === 'false') return 'allow';

    return 'unknown';
  } catch {
    return 'unknown';
  }
};

const readReturnTo = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem('auth:returnTo') || '';
  } catch {
    return '';
  }
};

const isSafeFrom = (p: unknown): p is string =>
  typeof p === 'string' &&
  p.startsWith('/org') &&
  !p.includes('/org/change-password');

const OrgHomeRouter: React.FC = () => {
  const location = useLocation();
  const { orgToken } = useShopContext() as any;

  // useOrg shape can vary a bit, so cast loosely
  const orgState = (useOrg?.() ?? {}) as any;
  const { org, role, loading, isLoading } = orgState;

  const busy = typeof loading === 'boolean' ? loading : isLoading;

  // Not authenticated for org at all → go to org login
  if (!orgToken) {
    return (
      <Navigate
        to="/org/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // Still resolving org + role → show lightweight loader
  if (busy) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-darkTextSecondary">
        <SeoHead
          title="Institution Portal | DayBreak"
          description="Routing to your institution workspace."
          canonicalPath="/org"
          noindex
        />
        <h1 className="text-lg font-semibold text-gray-800 dark:text-darkTextPrimary">
          Institution Portal
        </h1>
        Checking your institution role…
      </div>
    );
  }

  // Token exists but no org found → send to login to recover
  if (!org) {
    return (
      <Navigate
        to="/org/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  const normalizedRole = (role || '').toString().toLowerCase();
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';

  // ✅ Must-change password state resolution
  const mustState = readMustChangeState();

  // If storage explicitly says force/allow, trust it.
  // Only if unknown do we fall back to useOrg() flags.
  const mustChangePassword =
    mustState === 'force'
      ? true
      : mustState === 'allow'
        ? false
        : orgState?.currentUser?.must_change_password === true ||
          orgState?.currentUser?.mustChangePassword === true;

  // 🔐 Force password change for learners & instructors on first login
  if (mustChangePassword && (isLearner || isInstructor)) {
    const saved = readReturnTo();
    const fallback = location.pathname + location.search;

    // Never set "from" to the change-password page (prevents self-loop)
    const from = isSafeFrom(saved) ? saved : isSafeFrom(fallback) ? fallback : '/org';

    return (
      <Navigate
        to="/org/change-password"
        replace
        state={{ from }}
      />
    );
  }

  // 🎓 Learners: respect saved deep-link (assignments), else learner home
  if (isLearner) {
    const saved = readReturnTo();
    if (saved && (/\/org\/join\//.test(saved) || /assignmentId=/.test(saved))) {
      return <Navigate to={saved} replace />;
    }
    return <Navigate to="/org/learn" replace />;
  }

  // 👩‍🏫 Instructors → instructor home
  if (isInstructor) {
    return <Navigate to="/org/instructor" replace />;
  }

  // 👑 Owners / admins only → org profile
  if (isOrgAdmin) {
    return (
      <Navigate
        to="/org/profile"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  // ❓ Any unknown/unsupported role → safest recovery path
  return (
    <Navigate
      to="/org/login"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
};

export default OrgHomeRouter;
