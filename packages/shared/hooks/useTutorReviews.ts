// /packages/shared/hooks/useTutorReviews.ts

import { useCallback } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import useAppQuery from './useAppQuery';
import type { RatingFormData } from '@mytutorapp/shared/types';
import { fetchTutorReviews } from '@mytutorapp/shared/api/tutorReviewsApi';

// 1) Shape of the JSON your controller returns
export interface TutorReviewsResponse {
  message: string;
  avgRating: string;
  totalReviews: string;
  reviews: Array<{
    id: string;
    tutorId: string;
    sessionId: string;
    rating: string;
    comment: string;
    createdAt: string;
    studentId: string;
    studentName: string;
  }>;
}

// 2) What your hook hands back to components
export interface UseTutorReviewsResult {
  reviews: RatingFormData[];
  avgRating: number;
  totalReviews: number;
  loading: boolean;
  error: string | null;
  refreshReviews: () => Promise<void>;
}

const useTutorReviews = (tutorId: string): UseTutorReviewsResult => {
  const { backendUrl } = useShopContext();

  const { data, isLoading, error, refetch } = useAppQuery<TutorReviewsResponse, Error>(
    ['tutorReviews', tutorId],
    // fetchTutorReviews is already typed to return TutorReviewsResponse
    () => fetchTutorReviews(backendUrl, tutorId),
    { enabled: Boolean(tutorId && backendUrl) }
  );

  // 3) Explicitly type `r` so TS knows its shape
  const reviews: RatingFormData[] = (data?.reviews ?? []).map(
    (r: TutorReviewsResponse['reviews'][number]) => ({
      id: r.id,
      tutorId: r.tutorId,
      sessionId: r.sessionId,
      rating: r.rating,
      comment: r.comment,
      studentName: r.studentName,
      createdAt: r.createdAt,
    })
  );

  const avgRating = data ? parseFloat(data.avgRating) : 0;
  const totalReviews = data ? parseInt(data.totalReviews, 10) : 0;

  const refreshReviews = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    reviews,
    avgRating,
    totalReviews,
    loading: isLoading,
    error: error?.message ?? null,
    refreshReviews,
  };
};

export default useTutorReviews;
