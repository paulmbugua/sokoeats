import axios from 'axios';
import type { UploadKind, PresignResponse, CompleteResponse } from '@mytutorapp/shared/types';

export type UploadPresignInput = {
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export async function requestUploadPresign(
  backendUrl: string,
  token: string,
  kind: UploadKind,
  input: UploadPresignInput
): Promise<PresignResponse> {
  const res = await axios.post(
    `${backendUrl}/api/uploads/presign`,
    { kind, ...input },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as PresignResponse;
}

export async function completeUpload(
  backendUrl: string,
  token: string,
  payload: { provider: 'r2'; bucket: string; objectPath: string; kind: UploadKind }
): Promise<CompleteResponse> {
  const res = await axios.post(`${backendUrl}/api/uploads/complete`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data as CompleteResponse;
}

export async function deleteUpload(
  backendUrl: string,
  token: string,
  payload: { provider?: 'r2'; bucket?: string; objectPath?: string; url?: string }
): Promise<void> {
  await axios.delete(`${backendUrl}/api/uploads`, {
    data: payload,
    headers: { Authorization: `Bearer ${token}` },
  });
}
