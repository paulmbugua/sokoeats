export async function adminVerifyCertification(backendUrl: string, token: string, profileId: number) {
  const base = String(backendUrl || '').replace(/\/+$/, '');
  const response = await fetch(base + '/api/admin/certifications/' + encodeURIComponent(String(profileId)) + '/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'Failed to verify certification');
  return data;
}