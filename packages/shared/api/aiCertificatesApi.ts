import axios from 'axios';
import type {
  AICertificateSKU,
  AICertificateIssuance,
  Certificate,
} from '@mytutorapp/shared/types';

/** List available AI certificate SKUs (token-priced) */
export async function listAICertificates(
  backendUrl: string,
  token: string
): Promise<AICertificateSKU[]> {
  const res = await axios.get(`${backendUrl}/api/ai/certificates`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // backend shape: { ok: true, data: [...] }
  if (!res.data?.ok) throw new Error(res.data?.message || 'Failed to load certificates');
  return res.data.data as AICertificateSKU[];
}

/** Claim/issue a certificate by spending tokens (no external checkout fees) */
export async function issueAICertificate(
  backendUrl: string,
  token: string,
  payload: { code: string; courseId?: string }
): Promise<AICertificateIssuance> {
  const res = await axios.post(`${backendUrl}/api/ai/certificates/issue`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.data?.ok) throw new Error(res.data?.message || 'Failed to claim certificate');
  const { issuanceId, createdAt, debitedTokens } = res.data;
  return { issuanceId, createdAt, debitedTokens };
}

/** Generate the actual certificate PDF (will 402 if not yet issued when gating is on) */
export async function generateCertificatePdf(
  backendUrl: string,
  token: string,
  payload: { courseId: string }
): Promise<Certificate & { download_url?: string }> {
  const res = await axios.post(`${backendUrl}/api/certificates/generate`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}
