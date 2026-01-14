import type { Certification, CertificationStatus } from '@mytutorapp/shared/types';

export interface CertificationData {
  status: CertificationStatus;
  documents?: string[];
}

export interface AdminCertificationsResponse {
  success: boolean;
  rows: Certification[];
  total?: number;
}

interface Base64File {
  name: string;
  type: string;
  base64: string;
}

// Fetch certification status (unchanged)
export const getCertificationStatus = async (
  backendUrl: string,
  token: string,
  profileId: string | number
): Promise<CertificationData | null> => {
  try {
    const response = await fetch(`${backendUrl}/api/profiles/${profileId}/certification/status`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(await response.text());
    const json = await response.json();
    return json.certification || null;
  } catch (err: any) {
    console.error('Error fetching certification status:', err.message || err);
    throw err;
  }
};

// Upload base64-encoded files via JSON
export const uploadCertificationDocuments = async (
  backendUrl: string,
  token: string,
  profileId: string | number,
  files: Base64File[]
): Promise<CertificationData> => {
  const endpoint = `${backendUrl}/api/profiles/${profileId}/certification`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return json.certification;
};

export const adminListCertifications = async (
  backendUrl: string,
  token: string,
  params?: {
    status?: CertificationStatus;
    q?: string;
    limit?: number;
    offset?: number;
  }
): Promise<AdminCertificationsResponse> => {
  const base = (backendUrl || '').replace(/\/+$/, '');
  const url = new URL(`${base}/api/certifications`);
  if (params?.status) url.searchParams.set('status', params.status);
  if (params?.q) url.searchParams.set('q', params.q);
  if (typeof params?.limit === 'number') url.searchParams.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') url.searchParams.set('offset', String(params.offset));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list certifications (${res.status}): ${text}`);
  }

  return res.json();
};

export const adminVerifyCertification = async (
  backendUrl: string,
  token: string,
  profileId: number | string
) => {
  const base = (backendUrl || '').replace(/\/+$/, '');
  const endpoint = `${base}/api/certifications/${profileId}/verify`;

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to verify certification (${res.status}): ${text}`);
  }

  return res.json();
};
