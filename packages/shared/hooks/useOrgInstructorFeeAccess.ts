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

  const membership = orgState?.membership ?? null;
  const primaryMembership = Array.isArray(membership) ? membership[0] : membership;
  const roleLower = (orgState?.role || '').toLowerCase();
  const tier = String(orgState?.org?.tier || orgState?.org?.plan || 'starter').toLowerCase();
  const isProTier = tier === 'pro' || tier === 'enterprise';
  const designatedFlag = (primaryMembership as any)?.can_access_fees === true;
  const eligible = roleLower === 'instructor' && isProTier && designatedFlag;

  const backendUrl = useMemo(
    () => (opts?.backendUrl ?? shop?.backendUrl ?? '').replace(/\/+$/, ''),
    [opts?.backendUrl, shop?.backendUrl],
  );
  const token = useMemo(
    () => opts?.token ?? shop?.orgToken ?? null,
    [opts?.token, shop?.orgToken],
  );
  const orgId = useMemo(
    () => opts?.orgId ?? orgState?.activeOrgId ?? shop?.orgId ?? null,
    [opts?.orgId, orgState?.activeOrgId, shop?.orgId],
  );

  const orgReady = Boolean((orgState?.orgChecked ?? false) && !orgState?.loading);
  const ready = Boolean(orgReady && backendUrl && token && orgId);
  const enabled = Boolean((opts?.enabled ?? true) && ready && eligible);

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

  const hasAccess = enabled ? feeAccessQuery.data?.hasAccess === true : false;
  const isDenied = (!eligible && ready) || (feeAccessQuery.isFetched && feeAccessQuery.data?.hasAccess === false);

  return {
    backendUrl,
    orgId,
    token,
    eligible,
    ready,
    status: feeAccessQuery.status,
    hasAccess,
    isDenied,
    isLoading: enabled && (feeAccessQuery.isLoading || feeAccessQuery.isFetching),
    refetch: feeAccessQuery.refetch,
    setFeeAccess: mutation.mutateAsync,
    saving: mutation.isPending,
    designatedInstructorId: enabled ? feeAccessQuery.data?.designatedInstructorId ?? null : null,
    updatedAt: enabled ? feeAccessQuery.data?.updatedAt ?? null : null,
    grantedByUserId: enabled ? feeAccessQuery.data?.grantedByUserId ?? null : null,
  };
}

export default useOrgInstructorFeeAccess;
