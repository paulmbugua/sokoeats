import axios from 'axios';
import type {
  Certificate,
  VerifyCertificateResponse,
  CertificateRecord,
  AiCourseCertificateEntitlement,
} from '@mytutorapp/shared/types';

export async function verifyCertificatePublic(
  backendUrl: string,
  certificateId: string
): Promise<VerifyCertificateResponse> {
  const res = await axios.get<VerifyCertificateResponse>(
    `${backendUrl}/api/certificates/verify/${certificateId}`
  );
  return res.data;
}

export async function getEligibility(
  backendUrl: string,
  token: string,
  courseId: string
): Promise<{ eligible: boolean; reason?: string | null }> {
  const res = await axios.get(`${backendUrl}/api/certificates/eligibility/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function listMyCertificates(backendUrl: string, token: string) {
  const { data } = await axios.get<CertificateRecord[]>(`${backendUrl}/api/certificates/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function generateCertificate(
  backendUrl: string,
  token: string,
  courseId: string
): Promise<Certificate> {
  const res = await axios.post(
    `${backendUrl}/api/certificates/generate`,
    { courseId },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
}

export async function getMyCertificates(backendUrl: string, token: string): Promise<Certificate[]> {
  const res = await axios.get(`${backendUrl}/api/certificates/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function getCertificateById(
  backendUrl: string,
  token: string,
  id: string
): Promise<Certificate> {
  const res = await axios.get(`${backendUrl}/api/certificates/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

export async function listMyAiCourses(
  backendUrl: string,
  token: string,
): Promise<AiCourseCertificateEntitlement[]> {
  const res = await axios.get(`${backendUrl}/api/certificates/my-ai-courses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data?.items || [];
}

/** Convenience: secure, owner-checked download route (CERT) */
export function getCertificateDownloadUrl(backendUrl: string, id: string) {
  return `${backendUrl.replace(/\/+$/, '')}/api/certificates/${id}/download`;
}

/** Programmatic download via server streaming (CERT, stays in same tab) */
export async function downloadCertificateFile(
  backendUrl: string,
  token: string,
  id: string,
  suggestedName = `certificate-${id}.pdf`
) {
  const url = getCertificateDownloadUrl(backendUrl, id);
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/pdf',
    },
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

/** Convenience: secure, owner-checked download route (TRANSCRIPT) */
export function getTranscriptDownloadUrl(backendUrl: string, id: string) {
  return `${backendUrl.replace(/\/+$/, '')}/api/transcripts/${id}/download`;
}

/** Programmatic download via server streaming (TRANSCRIPT, same tab, uses auth header) */
export async function downloadTranscriptFile(
  backendUrl: string,
  token: string,
  id: string,
  suggestedName = `transcript-${id}.pdf`
) {
  const url = getTranscriptDownloadUrl(backendUrl, id);
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: 'application/pdf',
    },
  });
  if (!res.ok) throw new Error(`Transcript download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}
