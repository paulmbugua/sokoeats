// packages/shared/api/profileCardApi.ts

import axios from 'axios';

/**
 * Certification data shape used specifically by the profile-card API.
 */
export interface ProfileCardCertificationData {
  status?: string;
  [key: string]: unknown;
}

/**
 * Fetch average rating and total reviews for a tutor.
 */
export const fetchTutorReviews = async (
  backendUrl: string,
  tutorId: string
): Promise<{ avgRating: number; totalReviews: number }> => {
  const response = await axios.get<{ avgRating: number; totalReviews: number }>(
    `${backendUrl}/api/reviews?tutorId=${tutorId}`
  );
  return response.data;
};

/**
 * Fetch certification status for a tutor’s profile.
 * Returns the `certification` object or `null` if none exists.
 */
export const fetchTutorCertification = async (
  backendUrl: string,
  token: string,
  profileId: string
): Promise<ProfileCardCertificationData | null> => {
  const response = await axios.get<{
    certification?: ProfileCardCertificationData;
    certified?: boolean;
  }>(`${backendUrl}/api/profiles/${profileId}/certification/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return response.data.certification ?? null;
};
