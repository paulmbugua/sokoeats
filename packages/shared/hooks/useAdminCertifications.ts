import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import { adminListCertifications } from '@mytutorapp/shared/api/certificationApi';
import type { Certification, CertificationStatus } from '@mytutorapp/shared/types';

type StatusFilter = CertificationStatus | 'All';

type UseAdminCertificationsOptions = {
  initialStatus?: StatusFilter;
  initialQuery?: string;
  limit?: number;
  offset?: number;
};

export default function useAdminCertifications(options?: UseAdminCertificationsOptions) {
  const { backendUrl, adminToken, token } = useShopContext();
  const authToken = adminToken || token || '';

  const [rows, setRows] = useState<Certification[]>([]);
  const [status, setStatus] = useState<StatusFilter>(options?.initialStatus ?? 'Pending');
  const [query, setQuery] = useState(options?.initialQuery ?? '');
  const [limit, setLimit] = useState(options?.limit ?? 20);
  const [offset, setOffset] = useState(options?.offset ?? 0);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      status: status === 'All' ? undefined : status,
      q: query || undefined,
      limit,
      offset,
    }),
    [status, query, limit, offset]
  );

  const refresh = useCallback(async () => {
    if (!backendUrl || !authToken) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await adminListCertifications(backendUrl, authToken, params);
      setRows(resp.rows || []);
      setTotal(resp.total);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load certifications';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, authToken, params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateCertification = useCallback(
    (profileId: number, patch: Partial<Certification>) => {
      setRows((prev) =>
        prev.map((row) =>
          row.profile_id === profileId
            ? {
                ...row,
                ...patch,
              }
            : row
        )
      );
    },
    []
  );

  return {
    rows,
    loading,
    error,
    total,
    status,
    setStatus,
    query,
    setQuery,
    limit,
    setLimit,
    offset,
    setOffset,
    refresh,
    updateCertification,
  };
}
