import axios from 'axios';
import type { Achievement } from '@mytutorapp/shared/types';

export async function getMyAchievements(backendUrl: string, token: string): Promise<Achievement[]> {
  const res = await axios.get(`${backendUrl}/api/achievements/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getAchievementsByStudent(
  backendUrl: string,
  studentId: number,
  token: string
): Promise<Achievement[]> {
  const res = await axios.get(`${backendUrl}/api/achievements/${studentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

// Optional manual award
export async function awardAchievement(
  backendUrl: string,
  token: string,
  payload: {
    studentId: number;
    courseId?: string | null;
    ruleCode: string;
    title: string;
    iconUrl?: string;
  }
): Promise<Achievement | unknown> {
  const res = await axios.post(`${backendUrl}/api/achievements`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data as Achievement | unknown;
}
