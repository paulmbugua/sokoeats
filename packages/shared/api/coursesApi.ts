import axios from 'axios';
import type {
  Course,
  CoursePayload,
  Achievement,
  RecordedVideo, // ensure this exists in your shared types
} from '@mytutorapp/shared/types';

/* Helpers */
const auth = (token?: string) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});

const cleaned = (u: string) => u.replace(/\/+$/, '');
const dev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;

const stripSlash = (s: string) => (s || '').replace(/\/+$/, '');

/**
 * Safely GET a list resource. Accepts 200/404/500 and returns [] on non-200.
 * Also unwraps either `{data: T[]}` or raw `T[]`.
 */
async function safeGetList<T>(
  url: string,
  opts?: { params?: Record<string, any>; headers?: Record<string, string> }
): Promise<T[]> {
  const res = await axios.get(url, {
    ...opts,
    validateStatus: (s) =>
      (s >= 200 && s < 300) || s === 401 || s === 403 || s === 404 || s === 500,
  });

  if (res.status !== 200) {
    if (dev) console.debug('[safeGetList]', res.status, '→ [] @', url, res.data);
    return [];
  }
  const payload = (res.data as any)?.data ?? res.data;
  return Array.isArray(payload) ? (payload as T[]) : [];
}


/**
 * Try multiple fallback endpoints and return the first non-empty result.
 */
async function tryRoutes<T>(
  base: string,
  routes: string[],
  params?: Record<string, any>,
  headers?: Record<string, string>
): Promise<T[]> {
  for (const path of routes) {
    const list = await safeGetList<T>(`${cleaned(base)}${path}`, { params, headers });
    if (list.length) return list;
  }
  return [];
}

/* -------------------------
   Create / Read
------------------------- */

// Create Course
export const createCourse = async (
  backendUrl: string,
  payload: CoursePayload,
  token: string
): Promise<Course> => {
  const { data } = await axios.post<Course>(
    `${cleaned(backendUrl)}/api/courses`,
    payload,
    auth(token)
  );
  return data;
};

// Get All Courses (public-ish)
export const getCourses = async (backendUrl: string, token?: string): Promise<Course[]> => {
  const { data } = await axios.get<Course[]>(`${cleaned(backendUrl)}/api/courses`, auth(token));
  return data;
};

// Get Single Course
export async function getCourseById(
  backendUrl: string,
  courseId: string,
  token?: string
): Promise<Course | null> {
  const base = stripSlash(backendUrl);
  const url = `${base}/api/courses/${encodeURIComponent(courseId)}`;

  const res = await axios.get(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });

  if (res.status === 404) return null;
  return res.data as Course;
}

// Get my courses (requires auth)
export const getMyCourses = async (backendUrl: string, token: string): Promise<Course[]> => {
  const { data } = await axios.get<Course[]>(
    `${cleaned(backendUrl)}/api/courses/mine`,
    auth(token)
  );
  return data;
};

// Get courses for a specific tutor id (public/semi-public)
export const getTutorCourses = async (backendUrl: string, tutorId: number): Promise<Course[]> => {
  const { data } = await axios.get<Course[]>(`${cleaned(backendUrl)}/api/courses/tutor/${tutorId}`);
  return data;
};

/* -------------------------
   Update / Delete
------------------------- */

// Partial update (PATCH)
export const updateCourse = async (
  backendUrl: string,
  id: string,
  patch: Partial<Omit<CoursePayload, 'tutorId'> & { prerequisites?: string }>,
  token: string
): Promise<Course> => {
  const { data } = await axios.patch<Course>(
    `${cleaned(backendUrl)}/api/courses/${id}`,
    patch,
    auth(token)
  );
  return data;
};

// Delete
export const deleteCourse = async (
  backendUrl: string,
  id: string,
  token: string
): Promise<void> => {
  await axios.delete(`${cleaned(backendUrl)}/api/courses/${id}`, auth(token));
};

/* -------------------------
   Achievements
------------------------- */

export const getAchievements = async (
  backendUrl: string,
  studentId: number,
  token: string
): Promise<Achievement[]> => {
  const { data } = await axios.get<Achievement[]>(
    `${cleaned(backendUrl)}/api/achievements/${studentId}`,
    auth(token)
  );
  return data;
};

/* -------------------------
   Recommendations
------------------------- */

type RecQuery = {
  limit?: number;
  minCount?: number;
  subject?: string;
};

/**
 * Featured Courses
 * We try multiple paths to be resilient across backend variants:
 *   1) /api/courses/featured/courses
 *   2) /api/courses/recommendations/featured
 *   3) /api/courses/featured
 */
export const getFeaturedCourses = async (
  backendUrl: string,
  params?: { limit?: number; minCount?: number; subject?: string }
): Promise<Course[]> => {
  const base = cleaned(backendUrl);
  const routes = [
    '/api/courses/featured/courses',
    '/api/courses/recommendations/featured',
    '/api/courses/featured',
  ];
  return tryRoutes<Course>(base, routes, params);
};

/** Featured Videos */
export const getFeaturedVideos = async (
  backendUrl: string,
  params?: { limit?: number; minCount?: number; subject?: string }
): Promise<RecordedVideo[]> => {
  const base = cleaned(backendUrl);
  const routes = [
    '/api/courses/featured/videos',
    '/api/courses/recommendations/featured-videos',
    '/api/courses/featured_videos',
  ];
  return tryRoutes<RecordedVideo>(base, routes, params);
};

/** Recommended Courses */
export const getRecommendedCourses = async (
  backendUrl: string,
  params?: { limit?: number; minCount?: number },
  token?: string
): Promise<Course[]> => {
  const base = cleaned(backendUrl);
  const routes = ['/api/courses/recommendations', '/api/courses/suggested'];

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return tryRoutes<Course>(base, routes, params, headers);
};


export async function searchCoursesApi(backendUrl: string, params: Record<string, any>) {
  const base = (backendUrl || '').replace(/\/+$/, '');
  const { data } = await axios.get(`${base}/api/courses/search`, { params });
  return data;
}
