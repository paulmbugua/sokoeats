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

export async function getOrgAiSubmissionsPdf(
  backendUrl: string,
  token: string,
  orgId: string,
  params?: OrgAiSubmissionsPdfParams,
): Promise<Blob> {
  const url = buildUrl(backendUrl, orgId, params);
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/pdf',
    },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}
