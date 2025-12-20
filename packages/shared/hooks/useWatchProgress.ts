// packages/shared/hooks/useWatchProgress.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';

export type WatchRow = {
  week: number;
  video_id: string;
  provider: string;
  completed: boolean;
  watched_seconds: number;
  duration_seconds: number;
};

export function useWatchProgress(courseId?: string) {
  const { backendUrl, token } = useShopContext();
  const [rows, setRows] = useState<WatchRow[]>([]);
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
      const r = await fetch(`${backendUrl}/api/progress/watch/${courseId}`, { headers });
      const j = await r.json();
      setRows(Array.isArray(j) ? j : []);
    } catch {
      /* noop */
    }
    setLoading(false);
  }, [backendUrl, courseId, headers]);

  const sendEvent = useCallback(
    async (payload: {
      week: number;
      provider: string;
      videoUrl?: string;
      videoId?: string;
      watchedSeconds: number;
      durationSeconds: number;
    }) => {
      if (!courseId) return;
      await fetch(`${backendUrl}/api/progress/watch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ courseId, ...payload }),
      }).catch(() => {});
      // optimistically refresh
      reload();
    },
    [backendUrl, courseId, headers, reload]
  );

  return { rows, loading, reload, sendEvent };
}
