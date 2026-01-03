// packages/shared/hooks/useOrgInstructorFeeAccess.ts
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useShopContext } from '@mytutorapp/shared/context';
import { getOrgFeeAccessStatus, setOrgInstructorFeeAccess } from '@mytutorapp/shared/api/orgApi';
import { useOrg } from './useOrg';

interface UseOrgInstructorFeeAccessOptions {
  backendUrl?: string | null;
  token?: string | null;
  orgId?: string | null;
  enabled?: boolean;
}

export function useOrgInstructorFeeAccess(opts?: UseOrgInstructorFeeAccessOptions) {
  const shop = useShopContext() as any;
  const orgState = (useOrg?.() ?? {}) as any;
  const queryClient = useQueryClient();

  const backendUrl = useMemo(
    () => (opts?.backendUrl ?? shop?.backendUrl ?? '').replace(/\/+$/, ''),
    [opts?.backendUrl, shop?.backendUrl],
  );
  const token = useMemo(
    () => opts?.token ?? shop?.orgToken ?? shop?.token ?? null,
    [opts?.token, shop?.orgToken, shop?.token],
  );
  const orgId = useMemo(
    () => opts?.orgId ?? orgState?.activeOrgId ?? shop?.orgId ?? null,
    [opts?.orgId, orgState?.activeOrgId, shop?.orgId],
  );

  const orgReady = Boolean((orgState?.orgChecked ?? false) && !orgState?.loading);
  const enabled = Boolean((opts?.enabled ?? true) && backendUrl && token && orgId && orgReady);

  const feeAccessQuery = useQuery({
    queryKey: ['orgFeeAccess', orgId],
    enabled,
    queryFn: () => getOrgFeeAccessStatus(backendUrl, token as string, orgId as string),
    staleTime: 60_000,
    gcTime: 300_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ instructorUserId, enabled: nextEnabled }: { instructorUserId: string | number; enabled: boolean }) => {
      if (!backendUrl || !token || !orgId) throw new Error('Missing fee access context');
      return setOrgInstructorFeeAccess(backendUrl, token as string, orgId as string, instructorUserId, nextEnabled);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgFeeAccess', orgId] });
      queryClient.invalidateQueries({ queryKey: ['orgRoster'] });
    },
  });

  const hasAccess = feeAccessQuery.data?.hasAccess === true;
  const isDenied = feeAccessQuery.isFetched && feeAccessQuery.data?.hasAccess === false;

  return {
    backendUrl,
    orgId,
    token,
    ready: enabled,
    status: feeAccessQuery.status,
    hasAccess,
    isDenied,
    isLoading: feeAccessQuery.isLoading || feeAccessQuery.isFetching,
    refetch: feeAccessQuery.refetch,
    setFeeAccess: mutation.mutateAsync,
    saving: mutation.isPending,
    designatedInstructorId: feeAccessQuery.data?.designatedInstructorId ?? null,
    updatedAt: feeAccessQuery.data?.updatedAt ?? null,
    grantedByUserId: feeAccessQuery.data?.grantedByUserId ?? null,
  };
}

export default useOrgInstructorFeeAccess;
