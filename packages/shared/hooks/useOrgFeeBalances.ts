import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { FeeBalanceRow } from '@mytutorapp/shared/types';
import { getFeeBalances } from '@mytutorapp/shared/api/orgFeesApi';

interface UseOrgFeeBalancesProps {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgFeeBalances(opts?: UseOrgFeeBalancesProps) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [balances, setBalances] = useState<FeeBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchBalances = useCallback(
    async (classLabel?: string | null) => {
      if (!ensure()) return;
      setLoading(true);
      try {
        const rows = await getFeeBalances(
          backendUrl,
          token as string,
          orgId as string,
          classLabel ? { class_label: classLabel } : undefined,
        );
        setBalances(rows || []);
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    balances,
    loading,
    fetchBalances,
  };
}
