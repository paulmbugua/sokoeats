// packages/shared/hooks/useVerifyCertificate.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VerifyCertificateResponse } from '@mytutorapp/shared/types';
import {
  verifyCertificatePublic,
  verifyCertificateByNumberPublic,
} from '@mytutorapp/shared/api/certificatesApi';

type Opts = {
  backendUrl: string;
  certificateId?: string; // uuid
  certNo?: string; // "AB-12345678"
};

export function useVerifyCertificate(opts: Opts) {
  const { backendUrl, certificateId, certNo } = opts;

  const [data, setData] = useState<VerifyCertificateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const hasId = Boolean(certificateId && certificateId.trim());
    const hasNo = Boolean(certNo && certNo.trim());

    if (!backendUrl || (!hasId && !hasNo)) {
      if (!mounted.current) return;
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (!mounted.current) return;
    setLoading(true);
    setError(null);

    try {
      const res = hasNo
        ? await verifyCertificateByNumberPublic(backendUrl, String(certNo))
        : await verifyCertificatePublic(backendUrl, String(certificateId));

      if (!mounted.current) return;
      setData(res);
    } catch (e: any) {
      if (!mounted.current) return;
      setData(null);
      setError(e?.response?.data?.error || e?.message || 'Verification failed');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [backendUrl, certificateId, certNo]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
