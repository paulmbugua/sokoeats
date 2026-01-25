// packages/shared/api/classVaultUploadApi.ts
import axios from 'axios';
import { completeUpload, requestUploadPresign } from './uploadApi';

export interface UploadResult {
  url: string;
}

function resolveCloudinaryEnvName() {
  const rawWeb =
    typeof import.meta !== 'undefined'
      ? ((import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME as string | undefined)
      : undefined;
  const rawMobile =
    typeof process !== 'undefined'
      ? (process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME as string | undefined)
      : undefined;

  const webTrim = typeof rawWeb === 'string' ? rawWeb.trim() : '';
  const mobileTrim = typeof rawMobile === 'string' ? rawMobile.trim() : '';

  if (rawWeb && !webTrim) {
    throw new Error('Cloudinary configuration is invalid. Please try again later.');
  }
  if (rawMobile && !mobileTrim) {
    throw new Error('Cloudinary configuration is invalid. Please try again later.');
  }

  return webTrim || mobileTrim || '';
}

// Either a browser File or an RN asset
type Asset = File | { uri: string; name?: string; type?: string };

type UploadOpts = {
  /** Cloudinary folder. Defaults to 'class_vault' for backward compatibility. */
  folder?: string;
};

/**
 * Asset types we support for ClassVault.
 * - video: Cloudinary resource_type 'video'
 * - pdf: Cloudinary resource_type 'raw'
 * - thumbnail: Cloudinary resource_type 'image'  ✅ needed for Notes cards in public listings
 * - preview: Cloudinary resource_type 'video' (short teaser)
 */
export type ClassVaultAssetType = 'video' | 'pdf' | 'thumbnail' | 'preview';

function resolveResourceType(type: ClassVaultAssetType): 'video' | 'image' | 'raw' {
  if (type === 'pdf') return 'raw';
  if (type === 'thumbnail') return 'image';
  // preview behaves like video
  return 'video';
}

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

/**
 * Direct signed upload to Cloudinary for both Web and React Native.
 * - PDFs: resource_type 'raw'
 * - Videos/Previews: R2 presigned PUT
 * - Thumbnails: resource_type 'image'
 */
export const uploadClassVaultAsset = async (
  backendUrl: string,
  token: string,
  file: Asset,
  type: ClassVaultAssetType,
  onProgress?: (percent: number) => void,
  opts?: UploadOpts
): Promise<UploadResult> => {
  const isR2Kind = type === 'video' || type === 'preview';
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

  if (isR2Kind) {
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

    if (presign.provider !== 'r2') {
      throw new Error('R2 upload is not available. Please try again later.');
    }

    await axios.put(presign.uploadUrl, payload.data, {
      headers: { ...(presign.headers || {}), 'Content-Type': mimeGuess },
      onUploadProgress: (e) => {
        if (!onProgress) return;
        const pct = e.total ? Math.round((e.loaded * 100) / e.total) : 0;
        onProgress(pct);
      },
    });

    const { url } = await completeUpload(backendUrl, token, {
      provider: 'r2',
      bucket: presign.bucket,
      objectPath: presign.objectPath,
      kind: type,
    });

    return { url };
  }

  const resourceType = resolveResourceType(type);
  const folder = opts?.folder ?? 'class_vault';

  // 1) Ask backend for a signed upload (keeps API secret server-side)
  const sign = await axios
    .post(
      `${backendUrl}/api/cloudinary/sign`,
      { resourceType, folder },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    .then(
      (r) =>
        r.data as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          folder: string;
          signature: string;
          resourceType: 'video' | 'image' | 'raw';
        }
    );

  const envCloudName = resolveCloudinaryEnvName();
  const cloudName = String(sign.cloudName || envCloudName || '').trim();
  if (!cloudName) {
    throw new Error('Cloudinary is not configured. Please try again later.');
  }

  // 2) Cloudinary upload URL
  const cloudUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${sign.resourceType}/upload`;

  // 3) Build FormData
  const form = new FormData();
  form.append(
    'file',
    isBrowserFile
      ? (file as File)
      : ({
          uri: (file as any).uri,
          name: nameGuess,
          type: mimeGuess,
        } as any)
  );
  form.append('api_key', sign.apiKey);
  form.append('timestamp', String(sign.timestamp));
  form.append('folder', sign.folder);
  form.append('signature', sign.signature);

  // 4) Send with progress:
  // - Web: axios (has progress)
  // - RN: XMLHttpRequest (RN axios has no upload progress)
  const isRN = typeof document === 'undefined';

  if (!isRN) {
    // Web
    const res = await axios.post(cloudUrl, form, {
      onUploadProgress: (e) => {
        if (!onProgress) return;
        const pct = e.lengthComputable ? Math.round((e.loaded * 100) / (e.total || 1)) : 0;
        onProgress(pct);
      },
    });
    return { url: res.data.secure_url };
  }

  // React Native
  const xhr = new XMLHttpRequest();
  const result = await new Promise<UploadResult>((resolve, reject) => {
    xhr.open('POST', cloudUrl);

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      const pct = e.lengthComputable ? Math.round((e.loaded * 100) / (e.total || 1)) : 0;
      onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve({ url: json.secure_url });
        } catch {
          reject(new Error('Invalid JSON from Cloudinary'));
        }
      } else {
        reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network request failed'));
    xhr.send(form);
  });

  return result;
};
