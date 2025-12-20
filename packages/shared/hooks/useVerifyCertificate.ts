import { useCallback, useEffect, useState } from 'react';
import type { VerifyCertificateResponse } from '@mytutorapp/shared/types';
import { verifyCertificatePublic } from '@mytutorapp/shared/api';

export function useVerifyCertificate(opts: { backendUrl: string; certificateId: string }) {
  const { backendUrl, certificateId } = opts;
  const [data, setData] = useState<VerifyCertificateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await verifyCertificatePublic(backendUrl, certificateId);
      setData(res);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, certificateId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
