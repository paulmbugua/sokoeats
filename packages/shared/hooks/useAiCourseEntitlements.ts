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
      const normalized = (rows || []).map((row) => {
        const lessonCap =
          typeof (row as any).lesson_cap === 'number'
            ? (row as any).lesson_cap
            : typeof row.max_lessons === 'number'
              ? row.max_lessons
              : 60;

        return {
          ...row,
          purchased: row.purchased ?? true,
          tier: row.tier || 'standard',
          courseId: row.courseId || (row as any).course_id,
          course_id: row.course_id || (row as any).courseId,
          lesson_cap: lessonCap,
          max_lessons: lessonCap,
          lessons_used: row.lessons_used ?? (row as any).lessons_used ?? 0,
        } as AiCourseCertificateEntitlement;
      });
      setItems(normalized);
      return normalized;
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
