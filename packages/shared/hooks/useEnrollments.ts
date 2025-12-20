import { useCallback, useState } from 'react';
import axios from 'axios';
import {
  createEnrollment,
  getEnrollmentsByStudent,
  getEnrollmentsByCourse,
  deleteEnrollment,
  purchaseCourse,
} from '@mytutorapp/shared/api';
import type { Enrollment, CoursePurchaseResponse } from '@mytutorapp/shared/types';
import { useShopContext } from '@mytutorapp/shared/context';

export interface UseEnrollmentsProps {
  backendUrl: string;
  token: string;
  /** Optional, only required if you call fetchMine() */
  studentId?: string | number;
}

/** Safely read a possible snake_case field without using `any` */
function readSnakeCourseId(obj: unknown): string | undefined {
  if (obj && typeof obj === 'object' && 'course_id' in obj) {
    const v = (obj as { course_id?: unknown }).course_id;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Normalize Enrollment → courseId as string for comparisons */
function courseIdOf(e: Enrollment): string {
  return readSnakeCourseId(e) ?? String(e.courseId);
}

/** Coerce to whole tokens (server stores tokens as ints) */
function toTokens(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Map server row (snake_case) or already-camel to Enrollment */
function toEnrollment(raw: unknown): Enrollment {
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? '');
  const courseId = String(r.courseId ?? r.course_id ?? '');
  const studentId = Number(r.studentId ?? r.student_id ?? 0);
  const status = (r.status as Enrollment['status']) ?? 'active';
  const progress = Number(r.progress ?? 0);
  const startedAt = String(r.startedAt ?? r.started_at ?? '');
  const completedAt = r.completedAt ?? r.completed_at;

  return {
    id,
    courseId,
    studentId,
    status,
    progress,
    startedAt,
    ...(completedAt ? { completedAt: String(completedAt) } : {}),
  };
}

export function useEnrollments({ backendUrl, token, studentId }: UseEnrollmentsProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tokens: walletTokens, setTokens } = useShopContext();

  /** Create a new enrollment for a course (no purchase) */
  const enroll = useCallback(
    async (courseId: string): Promise<Enrollment> => {
      setLoading(true);
      setError(null);
      try {
        const createdRaw = await createEnrollment(backendUrl, courseId, token);
        const created = toEnrollment(createdRaw);

        setEnrollments((prev) => {
          const exists = prev.some((e) => courseIdOf(e) === String(courseId));
          return exists ? prev : [created, ...prev];
        });
        return created;
      } catch (e: unknown) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data?.message ?? e.message ?? 'Failed to enroll')
          : 'Failed to enroll';
        setError(msg);

        // eslint-disable-next-line no-console
        if (axios.isAxiosError(e))
          console.error('[useEnrollments] enroll error', {
            status: e.response?.status,
            data: e.response?.data,
            message: e.message,
          });
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  /**
   * Purchase a course with tokens and enroll (server handles deduction + enrollment).
   * - `expectedPriceTokens` lets us pre-check and do optimistic balance updates.
   * - On success, merges returned enrollment (or falls back to createEnrollment).
   */
  const purchaseCourseAndEnroll = useCallback(
    async (
      courseId: string,
      expectedPriceTokens?: number
    ): Promise<{ enrollment?: Enrollment; server?: CoursePurchaseResponse }> => {
      setLoading(true);
      setError(null);

      const cost = typeof expectedPriceTokens === 'number' ? toTokens(expectedPriceTokens) : null;

      // Client-side precheck
      if (cost !== null && walletTokens < cost) {
        const msg = `Insufficient tokens. Need ${cost - walletTokens} more.`;
        setError(msg);
        setLoading(false);
        throw new Error(msg);
      }

      // Optimistic balance deduction
      if (cost !== null && setTokens) {
        setTokens((t) => t - cost);
      }

      try {
        const resp = await purchaseCourse(backendUrl, courseId, token);

        // Sync wallet using server's authoritative tokens field
        if (typeof resp.tokens === 'number' && setTokens) {
          setTokens(resp.tokens);
        }

        // Merge returned enrollment if present
        const incoming = resp.enrollment ? toEnrollment(resp.enrollment) : undefined;
        if (incoming) {
          setEnrollments((prev) => {
            const exists = prev.some(
              (e) => String(e.id) === String(incoming.id) || courseIdOf(e) === courseId
            );
            return exists ? prev : [incoming, ...prev];
          });
          return { enrollment: incoming, server: resp };
        }

        // Fallback: create enrollment if server didn’t return one
        const createdRaw = await createEnrollment(backendUrl, courseId, token);
        const created = toEnrollment(createdRaw);
        setEnrollments((prev) => {
          const exists = prev.some((e) => courseIdOf(e) === courseId);
          return exists ? prev : [created, ...prev];
        });
        return { enrollment: created, server: resp };
      } catch (e) {
        // Roll back optimistic deduction if server call failed
        if (cost !== null && setTokens) {
          setTokens((t) => t + cost);
        }

        const msg = axios.isAxiosError(e)
          ? (e.response?.data?.message ?? e.message ?? 'Failed to purchase course')
          : 'Failed to purchase course';
        setError(msg);

        // eslint-disable-next-line no-console
        if (axios.isAxiosError(e))
          console.error('[useEnrollments] purchaseCourseAndEnroll error', {
            status: e.response?.status,
            data: e.response?.data,
            message: e.message,
          });
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, walletTokens, setTokens]
  );

  /** Fetch the current student’s enrollments */
  const fetchMine = useCallback(async (): Promise<Enrollment[]> => {
    if (studentId === undefined || studentId === null) {
      setError('Missing studentId for fetchMine()');
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getEnrollmentsByStudent(backendUrl, studentId, token);
      const normalized = data.map(toEnrollment);
      setEnrollments(normalized);
      return normalized;
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e)
        ? (e.response?.data?.message ?? e.message ?? 'Failed to fetch enrollments')
        : 'Failed to fetch enrollments';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, studentId]);

  /** Fetch enrollments for a specific course (tutor view) */
  const fetchByCourse = useCallback(
    async (courseId: string): Promise<Enrollment[]> => {
      setLoading(true);
      setError(null);
      try {
        const data = await getEnrollmentsByCourse(backendUrl, courseId, token);
        const normalized = data.map(toEnrollment);
        setEnrollments(normalized);
        return normalized;
      } catch (e: unknown) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data?.message ?? e.message ?? 'Failed to fetch course enrollments')
          : 'Failed to fetch course enrollments';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  /** Cancel an enrollment by id */
  const cancel = useCallback(
    async (enrollmentId: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        await deleteEnrollment(backendUrl, enrollmentId, token);
        setEnrollments((prev) => prev.filter((e) => String(e.id) !== String(enrollmentId)));
      } catch (e: unknown) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data?.message ?? e.message ?? 'Failed to cancel enrollment')
          : 'Failed to cancel enrollment';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  return {
    enrollments,
    loading,
    error,
    setError, // optional for UI
    setEnrollments, // optional manual cache updates

    enroll, // POST /api/enrollments
    purchaseCourseAndEnroll, // POST /api/courses/:id/purchase (+ auto-enroll)
    fetchMine, // GET  /api/enrollments/student/:studentId
    fetchByCourse, // GET  /api/enrollments/course/:courseId
    cancel, // DELETE /api/enrollments/:id
  };
}
