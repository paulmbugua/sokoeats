import { useQuery } from '@tanstack/react-query';
import { useShopContext } from '../context/ShopContext';
import { apiListOrgNewsletters } from '../api/orgProApi';

export function useOrgNewsletters(orgId?: string) {
  const shop = (useShopContext?.() ?? {}) as any;
  const backendUrl: string = shop?.backendUrl || shop?.apiUrl || '';
  const orgToken: string | undefined = shop?.orgToken;

  return useQuery({
    queryKey: ['org-newsletters', orgId],
    enabled: Boolean(orgId && backendUrl && orgToken),
    queryFn: async () => {
      return apiListOrgNewsletters(backendUrl, String(orgId), orgToken);
    },
  });
}
