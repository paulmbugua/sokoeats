// packages/shared/hooks/useOrgProTools.ts
import { useMemo } from 'react';
import { useOrg } from './useOrg';

export function useOrgProTools() {
  const orgState = (useOrg?.() ?? {}) as any;
  const tier: string = (orgState?.org?.tier || orgState?.org?.plan || 'starter').toLowerCase();

  const isPro = tier === 'pro' || tier === 'enterprise';
  const upgradeCta = isPro
    ? null
    : {
        headline: 'Upgrade to unlock org tools',
        body: 'Attendance, balances, newsletters, and announcements are included in Pro and Enterprise plans.',
      };

  return useMemo(
    () => ({
      ...orgState,
      isPro,
      upgradeCta,
    }),
    [orgState, isPro, upgradeCta],
  );
}
