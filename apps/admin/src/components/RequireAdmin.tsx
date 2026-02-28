// apps/admin/src/components/RequireAdmin.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useShopContext } from '@myhandymanapp/shared/context';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, role, initializing } = useShopContext();
  const loc = useLocation();

  if (initializing) return null; // wait for token load

  // Allow superadmin too if you use that
  const isAdmin = role === 'admin' || role === 'superadmin';
  if (!token || !isAdmin) {
    return <Navigate to="/login" replace state={{ from: loc }} />;
  }
  return <>{children}</>;
}
