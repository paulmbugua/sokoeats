// packages/shared/src/hooks/useOrgClassLabels.ts
import { useQuery } from '@tanstack/react-query';
import { apiListOrgClassLabels } from '../api/orgApi';
import { useShopContext } from '../context';

export function useOrgClassLabels(orgId?: string, enabled = true) {
  const shop = (useShopContext?.() ?? {}) as any;
  const backendUrl: string = shop?.backendUrl || shop?.apiUrl || '';
  const orgToken: string | undefined = shop?.orgToken;

  return useQuery({
    queryKey: ['org-class-labels', orgId],
    enabled: Boolean(enabled && backendUrl && orgId),
    queryFn: async () => apiListOrgClassLabels(backendUrl, String(orgId), orgToken),
    staleTime: 60_000,
  });
}
