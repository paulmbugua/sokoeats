// /packages/shared/api/tutorReviewsApi.ts
import axios from 'axios';
import type { TutorReviewsResponse } from '@mytutorapp/shared/hooks/useTutorReviews';

/**
 * Fetch all reviews for a given tutor.
 */
export async function fetchTutorReviews(
  backendUrl: string,
  tutorId: string
): Promise<TutorReviewsResponse> {
  const response = await axios.get<TutorReviewsResponse>(
    `${backendUrl}/api/reviews?tutorId=${tutorId}`
  );
  return response.data;
}
