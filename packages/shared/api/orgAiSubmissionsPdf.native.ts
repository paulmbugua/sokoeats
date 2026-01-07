import * as FileSystem from 'expo-file-system';

export type OrgAiSubmissionsPdfParams = {
  classId?: string;
  from?: string;
  to?: string;
};

function buildUrl(backendUrl: string, orgId: string, params?: OrgAiSubmissionsPdfParams) {
  const url = new URL(
    `${backendUrl.replace(/\/+$/, '')}/api/org/${encodeURIComponent(orgId)}/ai-submissions/pdf`,
  );
  if (params?.classId) url.searchParams.set('classId', params.classId);
  if (params?.from) url.searchParams.set('from', params.from);
  if (params?.to) url.searchParams.set('to', params.to);
  return url.toString();
}

function safeFilenamePart(value: string) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export async function getOrgAiSubmissionsPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: OrgAiSubmissionsPdfParams,
): Promise<string> {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) throw new Error('File storage is not available on this device.');

  const url = buildUrl(backendUrl, orgId, params);
  const classLabel = safeFilenamePart(params?.classId || 'all-classes');
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `ai-quiz-results-${classLabel}-${stamp}.pdf`;
  const dest = `${baseDir}${filename}`;

  const res = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res?.uri) throw new Error('Failed to save PDF locally.');
  return res.uri;
}
