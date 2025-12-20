import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';

export type ReadRow = {
  week: number;
  source_url: string;
  scrolled_pct: number;
  seconds_active: number;
  words_read: number;
  total_words: number;
  completed: boolean;
};

export function useReadProgress(courseId?: string) {
  const { backendUrl, token } = useShopContext();
  const [rows, setRows] = useState<ReadRow[]>([]);
  const [loading, setLoading] = useState(false);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  const reload = useCallback(async () => {
    if (!courseId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${backendUrl}/api/progress/read/${courseId}`, { headers });
      const j = await r.json();
      setRows(Array.isArray(j) ? j : []);
    } catch {}
    setLoading(false);
  }, [backendUrl, courseId, headers]);

  const sendEvent = useCallback(
    async (payload: {
      week: number;
      sourceUrl: string;
      wordsRead?: number;
      totalWords?: number;
      scrolledPct?: number; // 0..1
      secondsActive?: number;
    }) => {
      if (!courseId) return;
      await fetch(`${backendUrl}/api/progress/read`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ courseId, ...payload }),
      }).catch(() => {});
      reload();
    },
    [backendUrl, courseId, headers, reload]
  );

  return { rows, loading, reload, sendEvent };
}
