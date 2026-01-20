// packages/shared/api/cloudinaryDirect.ts
import axios from 'axios';

type ProgressCb = (percent: number) => void;

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

export async function getDirectSignature(
  backendUrl: string,
  token: string,
  opts?: { resourceType?: 'image' | 'video'; folder?: string }
) {
  const res = await axios.post(
    `${backendUrl}/api/cloudinary/sign`,
    { resourceType: opts?.resourceType ?? 'image', folder: opts?.folder ?? 'class_vault' },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data as {
    cloudName: string;
    apiKey: string;
    timestamp: number;
    folder: string;
    signature: string;
    resourceType: 'image' | 'video';
  };
}

/**
 * Upload file directly to Cloudinary with progress.
 * Returns secure_url.
 */
export async function directUploadToCloudinary(
  file: File | Blob,
  cfg: {
    cloudName: string;
    apiKey: string;
    signature: string;
    timestamp: number;
    folder: string;
    resourceType: 'image' | 'video';
  },
  onProgress?: ProgressCb
): Promise<string> {
  const envCloudName = resolveCloudinaryEnvName();
  const cloudName = String(cfg.cloudName || envCloudName || '').trim();
  if (!cloudName) {
    throw new Error('Cloudinary is not configured. Please try again later.');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${cfg.resourceType}/upload`;

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', cfg.apiKey);
  form.append('timestamp', String(cfg.timestamp));
  form.append('folder', cfg.folder);
  form.append('signature', cfg.signature);

  // Use XHR for progress in the browser
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open('POST', endpoint);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (!data.secure_url) {
          return reject(new Error('Cloudinary upload failed: no secure_url'));
        }
        resolve(data.secure_url);
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error('Network error during Cloudinary upload'));
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        onProgress(pct);
      }
    };
    xhr.send(form);
  });

  return promise;
}
