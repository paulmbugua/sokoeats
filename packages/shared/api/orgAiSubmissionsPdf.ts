// packages/shared/api/orgAiSubmissionsPdf.ts

export type OrgAiSubmissionsPdfParams = {
  classId?: string;
  from?: string;
  to?: string;
};

function buildUrl(backendUrl: string, orgId: string, params?: OrgAiSubmissionsPdfParams) {
  const base = String(backendUrl || '').replace(/\/+$/, '');
  const path = `/api/org/${encodeURIComponent(orgId)}/ai-submissions/pdf`;

  const qs: string[] = [];
  if (params?.classId) qs.push(`classId=${encodeURIComponent(params.classId)}`);
  if (params?.from) qs.push(`from=${encodeURIComponent(params.from)}`);
  if (params?.to) qs.push(`to=${encodeURIComponent(params.to)}`);

  return `${base}${path}${qs.length ? `?${qs.join('&')}` : ''}`;
}

function safeFilenamePart(value: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
}

/**
 * Minimal shape we need from expo-file-system/legacy.
 * (keeps this file platform-agnostic: no direct import from expo-file-system here)
 */
export type ExpoFileSystemLegacyLike = {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
  downloadAsync: (
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
  ) => Promise<{ uri?: string }>;
};

export type OrgAiSubmissionsPdfDownloadOptions = {
  /**
   * Pass `import * as FileSystem from 'expo-file-system/legacy'` from the native screen.
   * If present, the function returns a local file URI (string).
   */
  fileSystem?: ExpoFileSystemLegacyLike;

  /**
   * Optional filename override (".pdf" will be added if missing).
   */
  filename?: string;

  /**
   * Optional directory override. If not provided, uses cacheDirectory then documentDirectory.
   */
  directory?: string;
};

// Overloads: web (Blob) vs native (string URI)
export async function getOrgAiSubmissionsPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: OrgAiSubmissionsPdfParams,
): Promise<Blob>;

export async function getOrgAiSubmissionsPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  params: OrgAiSubmissionsPdfParams | undefined,
  opts: OrgAiSubmissionsPdfDownloadOptions & { fileSystem: ExpoFileSystemLegacyLike },
): Promise<string>;

export async function getOrgAiSubmissionsPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: OrgAiSubmissionsPdfParams,
  opts?: OrgAiSubmissionsPdfDownloadOptions,
): Promise<Blob | string> {
  const url = buildUrl(backendUrl, orgId, params);

  // ✅ Native path (Expo): download to local file using injected legacy FileSystem
  if (opts?.fileSystem) {
    const fs = opts.fileSystem;
    const baseDir = opts.directory || fs.cacheDirectory || fs.documentDirectory;

    if (!baseDir) throw new Error('File storage is not available on this device.');

    const classLabel = safeFilenamePart(params?.classId || 'all-classes');
    const stamp = new Date().toISOString().slice(0, 10);

    let filename =
      (opts.filename?.trim() ||
        `ai-quiz-results-${classLabel}-${stamp}.pdf`);

    if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

    const dest = `${baseDir}${filename}`;

    const res = await fs.downloadAsync(url, dest, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/pdf',
      },
    });

    if (!res?.uri) throw new Error('Failed to save PDF locally.');
    return res.uri;
  }

  // ✅ Web (and any environment without FileSystem): return Blob
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/pdf',
    },
  });

  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
