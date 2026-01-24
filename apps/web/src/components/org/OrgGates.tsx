import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import Spinner from '../Spinner.web';

const MUST_CHANGE_KEY = 'org:mustChangePassword';

const readMustChangePassword = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MUST_CHANGE_KEY) === '1';
  } catch {
    return false;
  }
};

const writeMustChangePassword = (v: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    if (v) sessionStorage.setItem(MUST_CHANGE_KEY, '1');
    else sessionStorage.removeItem(MUST_CHANGE_KEY);
  } catch {
    /* noop */
  }
};

interface GateProps {
  children: ReactNode;
}

export const OrgAuthGate: React.FC<GateProps> = ({ children }) => {
  const { hydrated, orgToken } = useShopContext() as any;
  const location = useLocation();

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500 dark:text-darkTextSecondary">
        <Spinner />
        <span className="ml-3">Preparing your session…</span>
      </div>
    );
  }

  if (!orgToken) {
    return <Navigate to="/org/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export const OrgGate: React.FC<GateProps> = ({ children }) => {
  const location = useLocation();
  const { orgToken } = useShopContext() as any;
  const orgState = (useOrg?.() ?? {}) as any;

  const loading =
    orgState.loading ||
    orgState.isLoading ||
    orgState.loadingMembership ||
    orgState.loadingOrg ||
    !orgState.orgChecked;

  const mustChangeSession = readMustChangePassword();
  const mustChangeServer =
    orgState?.currentUser?.must_change_password === true ||
    orgState?.currentUser?.mustChangePassword === true;
  const mustChangePassword = mustChangeSession || mustChangeServer;

  // Keep session flag in sync with server truth so refreshes continue to enforce.
  if (mustChangePassword && !mustChangeSession) writeMustChangePassword(true);
  if (!mustChangePassword && mustChangeSession && !loading) writeMustChangePassword(false);

  if (!orgToken) {
    return <Navigate to="/org/login" replace state={{ from: location }} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500 dark:text-darkTextSecondary">
        <Spinner />
        <span className="ml-3">Loading your institution portal…</span>
      </div>
    );
  }

  if (!orgState.org) {
    return <Navigate to="/org/login" replace state={{ from: location }} />;
  }

  if (
    mustChangePassword &&
    location.pathname !== '/org/change-password' &&
    !location.pathname.startsWith('/org/change-password')
  ) {
    return <Navigate to="/org/change-password" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default OrgGate;
