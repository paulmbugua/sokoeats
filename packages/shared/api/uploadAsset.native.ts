// packages/shared/api/uploadAsset.native.ts
function resolveUploadedUrl(backendUrl: string, url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = backendUrl.replace(/\/$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

export async function uploadAsset(
  backendUrl: string,
  token: string,
  uriOrFile: string | { uri?: string; name?: string; type?: string; mimeType?: string },
  type: 'image' | 'video' | 'doc'
): Promise<string> {
  const base = backendUrl.replace(/\/$/, '');
  const endpoint = `${base}/api/profile/upload/${type}`;

  let uri: string | undefined;
  let name = `upload-${Date.now()}`;
  let mimeType = 'application/octet-stream';

  if (typeof uriOrFile === 'string') {
    uri = uriOrFile;
  } else if (uriOrFile && typeof uriOrFile === 'object') {
    const anyFile = uriOrFile as any;
    uri = anyFile.uri;
    if (anyFile.name) name = anyFile.name;
    if (anyFile.type || anyFile.mimeType) {
      mimeType = anyFile.type || anyFile.mimeType;
    }
  }

  if (!uri) {
    throw new Error('uploadAsset.native: missing file URI');
  }

  const form = new FormData();
  form.append('file', {
    uri,
    name,
    type: mimeType,
  } as any);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // DO NOT set Content-Type here: RN will set proper multipart boundaries
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) ${text}`);
  }

  let parsed: any = {};
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }

  const url: string | null = parsed?.url || parsed?.secure_url || parsed?.data?.url || null;

  if (!url || typeof url !== 'string') {
    throw new Error('Upload response missing url.');
  }

  // React Native Image requires absolute URLs; public R2 domains pass through unchanged.
  return resolveUploadedUrl(base, url);
}
