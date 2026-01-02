import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import Spinner from '../Spinner.web';

interface GateProps {
  children: ReactNode;
}

export const OrgAuthGate: React.FC<GateProps> = ({ children }) => {
  const { initializing, orgToken } = useShopContext() as any;
  const location = useLocation();

  if (initializing) {
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

  return <>{children}</>;
};

export default OrgGate;
