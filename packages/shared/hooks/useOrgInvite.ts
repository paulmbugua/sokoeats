// packages/shared/hooks/useOrgInvite.ts
import { useEffect, useState } from 'react';
import { resolveOrgInvite } from '@mytutorapp/shared/api'; // keep your existing re-export path
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgInviteInfo } from '@mytutorapp/shared/types';

type InviteKind = 'unknown' | 'assignment' | 'membership';

export function useOrgInvite(code?: string) {
  const { backendUrl } = useShopContext();
  const [kind, setKind] = useState<InviteKind>('unknown');
  const [data, setData] = useState<OrgInviteInfo | null>(null); // assignment meta when resolvable
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!code) {
        setKind('unknown');
        setData(null);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      try {
        // Try as ASSIGNMENT invite first (GET /api/orgs/invite/:code)
        const info = await resolveOrgInvite(backendUrl, code);
        if (cancelled) return;
        setKind('assignment');
        setData(info ?? null);
      } catch (e: any) {
        if (cancelled) return;
        // If 404, it's most likely a MEMBERSHIP invite (no GET resolver for those)
        const status = e?.response?.status;
        if (status === 404) {
          setKind('membership');
          setData(null);
          setError('');
        } else {
          setKind('unknown');
          setData(null);
          setError(e?.response?.data?.message || e?.message || 'Failed to resolve invite.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, code]);

  return { kind, data, error, loading };
}
