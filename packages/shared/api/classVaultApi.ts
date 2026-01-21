// packages/shared/api/classVaultApi.ts

import axios from 'axios';
import type { RecordedVideo, VideoReview } from '@mytutorapp/shared/types';
import type { CreateRecordedVideoPayload } from '@mytutorapp/shared/hooks/useUploadClassVault';

const BASE_PATH = '/api/classvault';

export type PurchaseClassVaultResponse = {
  message?: string;
  purchase?: any;
  resources?: { video_url?: string | null; pdf_url?: string | null };
  tokens?: number;
  accrual?: any;
};

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
): Promise<{ video_url?: string | null; pdf_url?: string | null }> => {
  const res = await axios.get<{ video_url?: string | null; pdf_url?: string | null }>(
    `${backendUrl}${BASE_PATH}/download/${videoId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

// Two-step metadata submission: JSON-only endpoint
// Backend returns: { success: true, video: RecordedVideo }
export const createVideoJson = async (
  backendUrl: string,
  token: string,
  data: CreateRecordedVideoPayload
): Promise<RecordedVideo> => {
  const res = await axios.post<{ success: boolean; video: RecordedVideo }>(
    `${backendUrl}${BASE_PATH}`,
    data,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.video;
};

export const purchaseClassVault = async (
  backendUrl: string,
  videoId: number,
  token: string
): Promise<PurchaseClassVaultResponse> => {
  const res = await axios.post<PurchaseClassVaultResponse>(
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
    `${backendUrl}${BASE_PATH}/purchases`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data.purchases.map((p) => p.class_id);
};

export const updateVideoById = async (
  backendUrl: string,
  id: number,
  token: string,
  data: Partial<CreateRecordedVideoPayload>
): Promise<RecordedVideo> => {
  const res = await axios.put<{ success: boolean; video: RecordedVideo }>(
    `${backendUrl}${BASE_PATH}/${id}`,
    data,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data.video;
};
