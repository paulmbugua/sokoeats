// packages/shared/hooks/useCourseProgress.ts
import { useState, useEffect } from 'react';
import type { CourseProgress, UpdateProgressPayload } from '@mytutorapp/shared/types';
import {
  fetchCourseProgress,
  updateCourseProgress,
} from '@mytutorapp/shared/api/courseProgressApi'; // <-- path fix

export function useCourseProgress(backendUrl: string, courseId: string, token: string) {
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseId || !backendUrl || !token) return;
    setLoading(true);
    fetchCourseProgress(backendUrl, courseId, token)
      .then(setProgress)
      .catch((e: unknown) => {
        const msg = (e as any)?.response?.data ?? (e as any)?.message ?? e;
        console.warn('fetchCourseProgress error', msg);
      })
      .finally(() => setLoading(false));
  }, [backendUrl, courseId, token]);

  async function update(payload: UpdateProgressPayload) {
    try {
      const updated = await updateCourseProgress(backendUrl, payload, token);
      setProgress((prev) => {
        const ix = prev.findIndex((p) => p.week === updated.week);
        if (ix >= 0) {
          const copy = prev.slice();
          copy[ix] = updated;
          return copy;
        }
        return [...prev, updated]; // insert when starting a new week
      });
      return updated;
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data ?? (e as any)?.message ?? e;
      console.warn('updateCourseProgress error', msg);
      throw e;
    }
  }

  return { progress, loading, update };
}
