export interface CertificationData {
  status: string;
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
  profileId: string
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
  profileId: string,
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
