// apps/web/src/pages/org/OrgHomeRouter.web.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

const MUST_CHANGE_KEY = 'org:mustChangePassword';

const readMustChangePassword = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MUST_CHANGE_KEY) === '1';
  } catch {
    return false;
  }
};

const OrgHomeRouter: React.FC = () => {
  const location = useLocation();
  const { orgToken } = useShopContext() as any;

  // useOrg shape can vary a bit, so cast loosely
  const orgState = (useOrg?.() ?? {}) as any;
  const { org, role, loading, isLoading } = orgState;

  const busy = typeof loading === 'boolean' ? loading : isLoading;
  const mustChangePassword =
    readMustChangePassword() ||
    orgState?.currentUser?.must_change_password === true ||
    orgState?.currentUser?.mustChangePassword === true;

  // Not authenticated for org at all → go to org login
  if (!orgToken) {
    return (
      <Navigate to="/org/login" replace state={{ from: location.pathname + location.search }} />
    );
  }

  // Still resolving org + role → show lightweight loader
  if (busy) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-gray-500 dark:text-darkTextSecondary">
        Checking your institution role…
      </div>
    );
  }

  // Token exists but no org found → send to login to recover
  if (!org) {
    return (
      <Navigate to="/org/login" replace state={{ from: location.pathname + location.search }} />
    );
  }

  const normalizedRole = (role || '').toString().toLowerCase();
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';

  // 🔐 Force password change for learners & instructors on first login
  if (mustChangePassword && (isLearner || isInstructor)) {
    const saved = (() => {
      try {
        return sessionStorage.getItem('auth:returnTo') || '';
      } catch {
        return '';
      }
    })();

    return (
      <Navigate
        to="/org/change-password"
        replace
        state={{
          from: saved || location.pathname + location.search,
        }}
      />
    );
  }

  // 🎓 Learners: respect saved deep-link (assignments), else learner home
  if (isLearner) {
    const saved = (() => {
      try {
        return sessionStorage.getItem('auth:returnTo') || '';
      } catch {
        return '';
      }
    })();

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
      <Navigate to="/org/profile" replace state={{ from: location.pathname + location.search }} />
    );
  }

  // ❓ Any unknown/unsupported role → never show Org Profile;
  // send them back to org login to recover safely.
  return <Navigate to="/org/login" replace state={{ from: location.pathname + location.search }} />;
};

export default OrgHomeRouter;
