// packages/shared/api/courseProgressApi.ts
import axios from 'axios';
import type { CourseProgress, UpdateProgressPayload } from '@mytutorapp/shared/types';

export async function fetchCourseProgress(
  backendUrl: string,
  courseId: string,
  token: string
): Promise<CourseProgress[]> {
  const res = await axios.get(`${backendUrl}/api/course-progress/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (res.data || []).map((r: any) => ({
    week: r.week,
    status: r.status,
    score: r.score ?? null,
    notes: r.notes ?? null,
    updated_at: r.updated_at ?? null,
  })) as CourseProgress[];
}

export async function updateCourseProgress(
  backendUrl: string,
  payload: UpdateProgressPayload,
  token: string
): Promise<CourseProgress> {
  const { courseId, ...body } = payload; // body: { week, status, score?, notes? }
  const res = await axios.post(`${backendUrl}/api/course-progress/${courseId}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const r = res.data?.updated;
  return {
    week: r.week,
    status: r.status,
    score: r.score ?? null,
    notes: r.notes ?? null,
    updated_at: r.updated_at ?? null,
  };
}
