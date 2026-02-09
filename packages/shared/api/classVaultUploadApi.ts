// packages/shared/api/classVaultUploadApi.ts
import { completeUpload, requestUploadPresign } from './uploadApi';

export interface UploadResult {
  url: string;
}

// Either a browser File or an RN asset
type Asset = File | { uri: string; name?: string; type?: string };

/**
 * Asset types we support for ClassVault.
 * - video: full recording
 * - pdf: attached resource
 * - thumbnail: still preview image
 * - preview: short teaser video
 */
export type ClassVaultAssetType = 'video' | 'pdf' | 'thumbnail' | 'preview';

function defaultName(type: ClassVaultAssetType) {
  switch (type) {
    case 'thumbnail':
      return 'thumbnail.jpg';
    case 'preview':
      return 'preview.mp4';
    case 'video':
      return 'upload.mp4';
    case 'pdf':
      return 'upload.pdf';
  }
}

function defaultMime(type: ClassVaultAssetType) {
  switch (type) {
    case 'thumbnail':
      return 'image/jpeg';
    case 'preview':
    case 'video':
      return 'video/mp4';
    case 'pdf':
      return 'application/pdf';
  }
}

/** Direct signed upload to R2 for both Web and React Native. */
export const uploadClassVaultAsset = async (
  backendUrl: string,
  token: string,
  file: Asset,
  type: ClassVaultAssetType,
  onProgress?: (percent: number) => void
): Promise<UploadResult> => {
  const isBrowserFile =
    typeof window !== 'undefined' && typeof File !== 'undefined' && file instanceof File;

  const nameGuess = (() => {
    if (isBrowserFile) return (file as File).name || defaultName(type);
    const rn = file as { uri: string; name?: string };
    if (rn?.name) return rn.name;
    return defaultName(type);
  })();

  const mimeGuess =
    (isBrowserFile ? (file as File).type : (file as any).type) || defaultMime(type);

  const payload = isBrowserFile
    ? { data: file as File, sizeBytes: (file as File).size }
    : await (async () => {
        const uri = (file as { uri: string }).uri;
        const resp = await fetch(uri);
        if (!resp.ok) throw new Error(`Failed to read file (${resp.status})`);
        const blob = await resp.blob();
        return { data: blob, sizeBytes: blob.size };
      })();

  const presign = await requestUploadPresign(backendUrl, token, type, {
    filename: nameGuess,
    contentType: mimeGuess,
    sizeBytes: payload.sizeBytes,
  });

  const uploadRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { ...(presign.headers || {}), 'Content-Type': mimeGuess },
    body: payload.data as any,
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status})`);
  }

  const { url } = await completeUpload(backendUrl, token, {
    provider: 'r2',
    bucket: presign.bucket,
    objectPath: presign.objectPath,
    kind: type,
  });

  if (onProgress) onProgress(100);
  return { url };
};
