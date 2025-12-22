export async function apiGetMyFeeStructure(backendUrl: string, token: string, orgId: string) {
  const r = await fetch(`${backendUrl}/api/orgs/${encodeURIComponent(orgId)}/fees/learner/structure`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function apiGetMyFeeStatement(backendUrl: string, token: string, orgId: string) {
  const r = await fetch(`${backendUrl}/api/orgs/${encodeURIComponent(orgId)}/fees/learner/statement`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchPdf(url: string, token: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return r.blob();
}

export async function apiDownloadMyFeeStructurePdf(backendUrl: string, token: string, orgId: string) {
  return fetchPdf(`${backendUrl}/api/orgs/${encodeURIComponent(orgId)}/fees/learner/structure.pdf`, token);
}

export async function apiDownloadMyFeeStatementPdf(backendUrl: string, token: string, orgId: string) {
  return fetchPdf(`${backendUrl}/api/orgs/${encodeURIComponent(orgId)}/fees/learner/statement.pdf`, token);
}
