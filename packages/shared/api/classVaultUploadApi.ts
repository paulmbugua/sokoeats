// packages/shared/api/classVaultUploadApi.ts
import axios from 'axios';

export interface UploadResult {
  url: string;
}

// Either a browser File or an RN asset
type Asset = File | { uri: string; name?: string; type?: string };

type UploadOpts = {
  /** Cloudinary folder. Defaults to 'class_vault' for backward compatibility. */
  folder?: string;
};

/**
 * Direct signed upload to Cloudinary for both Web and React Native.
 * - PDFs: resource_type 'raw'
 * - Videos: resource_type 'video'
 */
export const uploadClassVaultAsset = async (
  backendUrl: string,
  token: string,
  file: Asset,
  type: 'video' | 'pdf',
  onProgress?: (percent: number) => void,
  opts?: UploadOpts
): Promise<UploadResult> => {
  const resourceType = type === 'video' ? 'video' : 'raw';
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

  // 2) Cloudinary upload URL
  const cloudUrl = `https://api.cloudinary.com/v1_1/${sign.cloudName}/${sign.resourceType}/upload`;

  // 3) Build FormData
  const isBrowserFile =
    typeof window !== 'undefined' && typeof File !== 'undefined' && file instanceof File;

  const nameGuess = (() => {
    if (isBrowserFile)
      return (file as File).name || (type === 'video' ? 'upload.mp4' : 'upload.pdf');
    const rn = file as { uri: string; name?: string };
    if (rn?.name) return rn.name;
    return type === 'video' ? 'upload.mp4' : 'upload.pdf';
  })();

  const mimeGuess =
    (isBrowserFile ? (file as File).type : (file as any).type) ||
    (type === 'video' ? 'video/mp4' : 'application/pdf');

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
  const isRN = typeof document === 'undefined'; // crude but works across Expo/Native

  if (!isRN) {
    // Web
    const res = await axios.post(cloudUrl, form, {
      onUploadProgress: (e) => {
        if (!onProgress) return;
        const pct = e.lengthComputable ? Math.round((e.loaded * 100) / (e.total || 1)) : 0;
        onProgress(pct);
      },
    });
    // Cloudinary returns { secure_url, ... }
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
