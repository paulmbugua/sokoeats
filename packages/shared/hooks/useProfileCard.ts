// packages/shared/hooks/useProfileCard.ts

import { useShopContext } from '@mytutorapp/shared/context';
import useTutorReviews from './useTutorReviews';
import useAppQuery from './useAppQuery';
import type { TutorProfile, RatingStats } from '@mytutorapp/shared/types';
import { fetchTutorCertification as fetchTutorCertFromApi } from '@mytutorapp/shared/api';

interface CertificationData {
  status?: string;
  [key: string]: unknown;
}

interface UseProfileCardResult {
  ratingData: RatingStats;
  certification: CertificationData | null;
  showCertBadge: boolean;
}

export default function useProfileCard(
  tutor: TutorProfile, // ← now takes TutorProfile
  backendUrlArg?: string,
  tokenArg?: string
): UseProfileCardResult {
  // 1️⃣ get backendUrl & token from context (or override via args)
  const { backendUrl: ctxUrl, token: ctxToken } = useShopContext();
  const backendUrl = backendUrlArg ?? ctxUrl;
  const token = tokenArg ?? ctxToken;

  const tutorId = tutor.id;
  const isTutor = tutor.role === 'tutor';

  // 2️⃣ pull in our shared useTutorReviews hook
  const {
    reviews,
    avgRating,
    totalReviews,
    loading: reviewsLoading,
    error: reviewsError,
    refreshReviews,
  } = useTutorReviews(tutorId);

  console.log('[useProfileCard] useTutorReviews →', {
    avgRating,
    totalReviews,
    reviewsLength: reviews.length,
    reviewsError,
  });

  // 3️⃣ Tutor certification, default to null
  const { data: certification = null } = useAppQuery<CertificationData | null, Error>(
    ['tutorCertification', tutorId],
    async () => {
      const resp = await fetchTutorCertFromApi(backendUrl, token, tutorId);
      return (resp as { certification?: CertificationData }).certification ?? null;
    },
    {
      enabled: isTutor && Boolean(backendUrl) && Boolean(token),
      initialData: null,
      retry: false,
    }
  );

  // 4️⃣ Badge logic (now reading from TutorProfile.certified and/or fetched certification)
  const isCertifiedFlag = Boolean(tutor.certified);
  const isVerifiedStatus = certification?.status === 'Verified';
  const showCertBadge = isTutor && (isCertifiedFlag || isVerifiedStatus);

  // 5️⃣ return exactly the shape you expect
  const ratingData: RatingStats = {
    avgRating,
    totalReviews,
  };

  return {
    ratingData,
    certification,
    showCertBadge,
  };
}
