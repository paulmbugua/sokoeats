import { useCallback, useEffect, useState } from 'react';
import type {
  AICertificateSKU,
  AICertificateIssuance,
  Certificate,
} from '@mytutorapp/shared/types';
import {
  listAICertificates,
  issueAICertificate,
  generateCertificatePdf,
} from '@mytutorapp/shared/api';

interface UseAICertsOptions {
  backendUrl: string;
  /** Can be a normal user token OR an orgToken. May be undefined if not signed in. */
  token?: string | null;
  /** Default course context for this hook */
  courseId?: string;
}

export function useAICertificates({ backendUrl, token, courseId }: UseAICertsOptions) {
  const [skus, setSkus] = useState<AICertificateSKU[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const hasToken = Boolean(token);

  const refresh = useCallback(async () => {
    // If no auth yet (no user token or orgToken), just clear and skip API call.
    if (!hasToken) {
      setSkus([]);
      setError(null);
      return [] as AICertificateSKU[];
    }

    setLoading(true);
    setError(null);
    try {
      const items = await listAICertificates(backendUrl, token as string);
      setSkus(items);
      return items;
    } catch (e: any) {
      setError(e?.message || 'Failed to load certificates');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, hasToken]);

  // NOTE: now accepts an override courseId so callers can pass course?.id explicitly.
  const claim = useCallback(
    async (code: string, courseIdOverride?: string | null): Promise<AICertificateIssuance> => {
      if (!hasToken) {
        const err = new Error('Please sign in to claim this certificate.');
        setError(err.message);
        throw err;
      }

      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const cid = courseIdOverride ?? courseId;
        const out = await issueAICertificate(backendUrl, token as string, { code, courseId: cid });
        setMessage(
          out.debitedTokens === 0
            ? 'Claimed ✔ (covered by organization)'
            : `Claimed ✔ – ${out.debitedTokens} tokens deducted`
        );
        return out;
      } catch (e: any) {
        setError(e?.message || 'Failed to claim certificate');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, courseId, hasToken]
  );

  const generate = useCallback(async (): Promise<Certificate & { download_url?: string }> => {
    if (!courseId) {
      const err = new Error('courseId is required to generate');
      setError(err.message);
      throw err;
    }
    if (!hasToken) {
      const err = new Error('Please sign in to generate your certificate.');
      setError(err.message);
      throw err;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const doc = await generateCertificatePdf(backendUrl, token as string, { courseId });
      setMessage('Certificate generated ✔');
      return doc;
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to generate certificate';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, courseId, hasToken]);

  // Auto-refresh whenever backendUrl / token changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skus, loading, error, message, refresh, claim, generate };
}
