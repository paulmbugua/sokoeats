export type UploadAssetKind = 'image' | 'video' | 'doc';

function resolveUploadedUrl(backendUrl: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = backendUrl.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

export async function uploadAsset(
  backendUrl: string,
  token: string,
  uriOrFile: string | File,
  type: UploadAssetKind
): Promise<string> {
  const endpoint = `${backendUrl}/api/profile/upload/${type}`;

  const formData = new FormData();

  const blobOrFile =
    uriOrFile instanceof File
      ? uriOrFile
      : await fetch(uriOrFile, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error(`Failed to read asset (${r.status})`);
          return r.blob();
        });

  const filename =
    uriOrFile instanceof File
      ? uriOrFile.name
      : type === 'video'
        ? 'upload.mp4'
        : type === 'doc'
          ? 'upload.pdf'
          : 'upload.jpg';

  (formData.append as (name: string, value: Blob, fileName?: string) => void)(
    'file',
    blobOrFile as Blob,
    filename,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) ${text}`);
  }

  const json = await res.json().catch(() => ({}));
  if (!json?.url || typeof json.url !== 'string') {
    throw new Error('Upload response missing url.');
  }

  return resolveUploadedUrl(backendUrl, json.url);
}
