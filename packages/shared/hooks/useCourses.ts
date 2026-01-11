// packages/shared/hooks/useCourses.ts
import { useState, useCallback } from 'react';
import axios from 'axios';
import {
  createCourse,
  getCourses,
  getCourseById,
  getAchievements,
  getMyCourses,
  getTutorCourses,
  updateCourse,
  deleteCourse,
  getFeaturedCourses,
  getRecommendedCourses,
  getFeaturedVideos,
} from '@mytutorapp/shared/api';
import type {
  Course,
  CoursePayload,
  Achievement,
  RecordedVideo,
} from '@mytutorapp/shared/types';

interface UseCoursesProps {
  backendUrl: string;
  token?: string;
}

function useCourses(opts: UseCoursesProps) {
  const { backendUrl, token } = opts;

  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [featuredCourses, setFeaturedCourses] = useState<Course[]>([]);
  const [recommendedCourses, setRecommendedCourses] = useState<Course[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<RecordedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------
     Lists / Read
  --------------------------- */

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourses(backendUrl, token);
      setCourses(data);
      return data;
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.message ??
            err.message ??
            'Failed to fetch courses')
        : 'Failed to fetch courses';
      setError(msg);
      if (axios.isAxiosError(err)) {
        console.error('[useCourses] fetchCourses error', {
          url: `${backendUrl}/api/courses`,
          status: err.response?.status,
          data: err.response?.data,
          message: err.message,
        });
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  const fetchMyCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!token) throw new Error('Unauthorized');
      const data = await getMyCourses(backendUrl, token);
      setCourses(data);
      return data;
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.message ??
            err.message ??
            'Failed to fetch my courses')
        : 'Failed to fetch my courses';
      setError(msg);
      if (axios.isAxiosError(err)) {
        console.error('[useCourses] fetchMyCourses error', {
          url: `${backendUrl}/api/courses/mine`,
          status: err.response?.status,
          data: err.response?.data,
          message: err.message,
        });
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  const fetchTutorCourses = useCallback(
    async (tutorId: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getTutorCourses(backendUrl, tutorId);
        setCourses(data);
        return data;
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.message ??
              err.message ??
              'Failed to fetch tutor courses')
          : 'Failed to fetch tutor courses';
        setError(msg);
        if (axios.isAxiosError(err)) {
          console.error('[useCourses] fetchTutorCourses error', {
            url: `${backendUrl}/api/courses/tutor/${tutorId}`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl]
  );

  /**
   * ✅ Updated:
   * - getCourseById now returns `Course | null` (404/private -> null)
   * - we should NOT treat that as an error
   */
  const fetchCourseById = useCallback(
    async (id: string): Promise<Course | null> => {
      setLoading(true);
      setError(null);
      try {
        const data = await getCourseById(backendUrl, id, token);
        setSelectedCourse(data);
        return data;
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.message ??
              err.message ??
              'Failed to fetch course')
          : 'Failed to fetch course';
        setError(msg);

        if (axios.isAxiosError(err)) {
          console.error('[useCourses] fetchCourseById error', {
            url: `${backendUrl}/api/courses/${id}`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  /* ---------------------------
     Recommendations (do NOT throw)
     Quietly return [] on failure; also avoid spamming console on 400.
  --------------------------- */

  function logNon400(prefix: string, url: string, err: any) {
    if (!axios.isAxiosError(err)) return console.error(prefix, err);
    const status = err.response?.status;
    if (status === 400) {
      console.debug(prefix, { url, status, data: err.response?.data });
    } else {
      console.error(prefix, {
        url,
        status,
        data: err.response?.data,
        message: err.message,
      });
    }
  }

  const fetchFeaturedCourses = useCallback(
    async (opts?: { limit?: number; minCount?: number; subject?: string }) => {
      try {
        const data = await getFeaturedCourses(backendUrl, opts);
        setFeaturedCourses(data);
        return data;
      } catch (err: unknown) {
        logNon400(
          '[useCourses] fetchFeaturedCourses error',
          `${backendUrl}/api/courses/featured/courses`,
          err
        );
        setFeaturedCourses([]);
        return [];
      }
    },
    [backendUrl]
  );

  /**
   * ✅ Updated:
   * - pass token so backend can personalize recommendations (anyAuthOptional)
   * - still do NOT throw; return []
   */
  const fetchRecommendedCourses = useCallback(
    async (opts?: { limit?: number; minCount?: number }) => {
      try {
        const data = await getRecommendedCourses(backendUrl, opts, token);
        setRecommendedCourses(data);
        return data;
      } catch (err: unknown) {
        logNon400(
          '[useCourses] fetchRecommendedCourses error',
          `${backendUrl}/api/courses/recommendations`,
          err
        );
        setRecommendedCourses([]);
        return [];
      }
    },
    [backendUrl, token]
  );

  const fetchFeaturedVideos = useCallback(
    async (opts?: { limit?: number; minCount?: number; subject?: string }) => {
      try {
        const data = await getFeaturedVideos(backendUrl, opts);
        setFeaturedVideos(data);
        return data;
      } catch (err: unknown) {
        logNon400(
          '[useCourses] fetchFeaturedVideos error',
          `${backendUrl}/api/courses/featured/videos`,
          err
        );
        setFeaturedVideos([]);
        return [];
      }
    },
    [backendUrl]
  );

  /* ---------------------------
     Create / Update / Delete
  --------------------------- */

  const addCourse = useCallback(
    async (payload: CoursePayload) => {
      setLoading(true);
      setError(null);
      try {
        if (!token) throw new Error('Unauthorized');

        console.groupCollapsed(
          `%c[useCourses] POST ${backendUrl}/api/courses`,
          'color:#2563eb;font-weight:bold;'
        );
        console.log('tokenPreview', token ? `${token.slice(0, 6)}…` : '(none)');
        console.log('payload', payload);
        console.log('payload (JSON)', JSON.stringify(payload, null, 2));
        console.groupEnd();

        const created = await createCourse(backendUrl, payload, token);
        setCourses((prev) => [...prev, created]);
        return created;
      } catch (err: unknown) {
        let msg = 'Failed to create course';
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 404) {
            msg =
              'Create-course endpoint not found (404). Verify POST /api/courses and backendUrl.';
          } else {
            msg = err.response?.data?.message ?? err.message ?? msg;
          }
          console.error('[useCourses] addCourse error', {
            url: `${backendUrl}/api/courses`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  const editCourse = useCallback(
    async (
      id: string,
      patch: Partial<Omit<CoursePayload, 'tutorId'> & { prerequisites?: string }>
    ) => {
      setLoading(true);
      setError(null);
      try {
        if (!token) throw new Error('Unauthorized');
        const updated = await updateCourse(backendUrl, id, patch, token);
        setCourses((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
        setSelectedCourse((prev) =>
          prev && prev.id === updated.id ? { ...prev, ...updated } : prev
        );
        return updated;
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.message ??
              err.message ??
              'Failed to update course')
          : 'Failed to update course';
        setError(msg);
        if (axios.isAxiosError(err)) {
          console.error('[useCourses] editCourse error', {
            url: `${backendUrl}/api/courses/${id}`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  const removeCourse = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);

      // optimistic remove
      const prev = courses;
      setCourses((cur) => cur.filter((c) => c.id !== id));

      try {
        if (!token) throw new Error('Unauthorized');
        await deleteCourse(backendUrl, id, token);
      } catch (err: unknown) {
        // revert on failure
        setCourses(prev);

        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.message ??
              err.message ??
              'Failed to delete course')
          : 'Failed to delete course';
        setError(msg);

        if (axios.isAxiosError(err)) {
          console.error('[useCourses] removeCourse error', {
            url: `${backendUrl}/api/courses/${id}`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, courses]
  );

  /* ---------------------------
     Achievements
  --------------------------- */

  const fetchAchievements = useCallback(
    async (studentId: number) => {
      setLoading(true);
      setError(null);
      try {
        if (!token) throw new Error('Unauthorized');
        const data = await getAchievements(backendUrl, studentId, token);
        setAchievements(data);
        return data;
      } catch (err: unknown) {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.message ??
              err.message ??
              'Failed to fetch achievements')
          : 'Failed to fetch achievements';
        setError(msg);
        if (axios.isAxiosError(err)) {
          console.error('[useCourses] fetchAchievements error', {
            url: `${backendUrl}/api/achievements/${studentId}`,
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
          });
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token]
  );

  return {
    // state
    courses,
    selectedCourse,
    achievements,
    featuredCourses,
    recommendedCourses,
    featuredVideos,
    loading,
    error,

    // read
    fetchCourses,
    fetchMyCourses,
    fetchTutorCourses,
    fetchCourseById,

    // recommendations
    fetchFeaturedCourses,
    fetchRecommendedCourses,
    fetchFeaturedVideos,

    // write
    addCourse,
    editCourse,
    removeCourse,

    // other
    fetchAchievements,
  };
}

export default useCourses;
export { useCourses };
