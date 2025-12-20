import { useEffect, useState, useCallback } from 'react';
import type { Achievement } from '@mytutorapp/shared/types';
import {
  getMyAchievements,
  getAchievementsByStudent,
  awardAchievement as apiAward,
} from '@mytutorapp/shared/api';

interface UseAchievementsOptions {
  backendUrl: string;
  token: string;
  studentId?: number; // if omitted, load current user
}

export function useAchievements({ backendUrl, token, studentId }: UseAchievementsOptions) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAchievements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = studentId
        ? await getAchievementsByStudent(backendUrl, studentId, token)
        : await getMyAchievements(backendUrl, token);
      setAchievements(data);
      return data;
    } catch (e: any) {
      setError(e.message || 'Failed to load achievements');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, studentId]);

  const award = useCallback(
    async (payload: {
      studentId: number;
      courseId?: string | null;
      ruleCode: string;
      title: string;
      iconUrl?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiAward(backendUrl, token, payload);
        // refresh
        await fetchAchievements();
        return res;
      } catch (e: any) {
        setError(e.message || 'Failed to award achievement');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, fetchAchievements]
  );

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  return { achievements, loading, error, refetch: fetchAchievements, award };
}
