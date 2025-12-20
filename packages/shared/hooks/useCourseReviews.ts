// packages/shared/hooks/useCourseReviews.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCourseReviews,
  postCourseReview,
  CourseReviewsResponse,
} from '@mytutorapp/shared/api/reviewsApi';

export function useCourseReviews(
  backendUrl: string,
  courseId?: string,
  opts?: { myStudentId?: string; token?: string }
) {
  const [data, setData] = useState<CourseReviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const myId = opts?.myStudentId ?? '';

  const load = useCallback(async () => {
    if (!backendUrl || !courseId) return;
    setLoading(true);
    try {
      const resp = await getCourseReviews(backendUrl, courseId);
      setData(resp);
    } catch (e) {
      // swallow; page can still render
      // console.warn('getCourseReviews failed', e);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasMyReview = useMemo(() => {
    if (!myId || !data?.reviews?.length) return false;
    return data.reviews.some((r) => String(r.studentId) === String(myId));
  }, [data, myId]);

  const submit = useCallback(
    async (rating: number, comment?: string) => {
      if (!backendUrl || !courseId || !opts?.token) throw new Error('Missing auth or params');
      setPosting(true);
      try {
        await postCourseReview(backendUrl, courseId, opts.token, { rating, comment });
        await load(); // refresh
      } finally {
        setPosting(false);
      }
    },
    [backendUrl, courseId, opts?.token, load]
  );

  return {
    data, // { avgRating, totalReviews, reviews[] }
    avg: data?.avgRating ?? 0,
    count: data?.totalReviews ?? 0,
    reviews: data?.reviews ?? [],
    hasMyReview,
    loading,
    posting,
    reload: load,
    submit,
  };
}
