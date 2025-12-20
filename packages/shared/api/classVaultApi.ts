// packages/shared/api/classVaultApi.ts

import axios from 'axios';
import type { RecordedVideo, VideoReview } from '@mytutorapp/shared/types';
import type { CreateRecordedVideoPayload } from '@mytutorapp/shared/hooks/useUploadClassVault';

const BASE_PATH = '/api/classvault';

export const fetchAllVideos = async (backendUrl: string): Promise<RecordedVideo[]> => {
  const res = await axios.get<RecordedVideo[]>(`${backendUrl}${BASE_PATH}`);
  return res.data;
};

export const fetchVideoById = async (backendUrl: string, id: number): Promise<RecordedVideo> => {
  const res = await axios.get<RecordedVideo>(`${backendUrl}${BASE_PATH}/${id}`);
  return res.data;
};

export const fetchVideoReviews = async (
  backendUrl: string,
  videoId: number
): Promise<VideoReview[]> => {
  // OLD: `${backendUrl}${BASE_PATH}/${videoId}/reviews`
  const res = await axios.get<VideoReview[]>(`${backendUrl}/api/reviews/videos/${videoId}`);
  return res.data;
};

/**
 * Submit a review for a recorded video.
 * Backend route expected: POST /api/reviews/videos/:videoId  { rating, comment? }
 */
export const submitVideoReview = async (
  backendUrl: string,
  token: string,
  videoId: number,
  payload: { rating: number; comment?: string }
): Promise<void> => {
  await axios.post(`${backendUrl}/api/reviews/videos/${videoId}`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const deleteVideoById = async (
  backendUrl: string,
  id: number,
  token: string
): Promise<void> => {
  await axios.delete(`${backendUrl}${BASE_PATH}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const fetchDownloadResources = async (
  backendUrl: string,
  videoId: number,
  token: string
): Promise<{ video_url: string; pdf_url: string }> => {
  const res = await axios.get<{ video_url: string; pdf_url: string }>(
    `${backendUrl}${BASE_PATH}/download/${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

// Two-step metadata submission: JSON-only endpoint
export const createVideoJson = async (
  backendUrl: string,
  token: string,
  data: CreateRecordedVideoPayload
): Promise<RecordedVideo> => {
  const res = await axios.post<RecordedVideo>(
    `${backendUrl}${BASE_PATH}`, // ← no `/json` suffix
    data,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const purchaseClassVault = async (
  backendUrl: string,
  videoId: number,
  token: string
): Promise<{ video_url: string; pdf_url: string }> => {
  const res = await axios.post<{ video_url: string; pdf_url: string }>(
    `${backendUrl}${BASE_PATH}/${videoId}/purchase`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const fetchPurchasedVideoIds = async (
  backendUrl: string,
  token: string
): Promise<number[]> => {
  const res = await axios.get<{ purchases: { class_id: number }[] }>(
    `${backendUrl}/api/classvault/purchases`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  // Map down to just the class IDs
  return res.data.purchases.map((p) => p.class_id);
};
