import { useCallback, useEffect, useState } from 'react';
import { AiCourseCertificateEntitlement } from '@mytutorapp/shared/types';
import { listMyAiCourses } from '@mytutorapp/shared/api';

interface Options {
  backendUrl: string;
  token?: string | null;
}

export function useAiCourseEntitlements({ backendUrl, token }: Options) {
  const [items, setItems] = useState<AiCourseCertificateEntitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setItems([]);
      return [] as AiCourseCertificateEntitlement[];
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listMyAiCourses(backendUrl, token);
      setItems(rows);
      return rows;
    } catch (e: any) {
      const msg = e?.message || 'Failed to load AI course entitlements';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
