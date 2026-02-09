export function buildCertificateOgImageUrl(
  publicBaseUrl: string,
  certificateId: string,
  opts?: {
    brandUrl?: string;
    student?: string;
    course?: string;
  }
) {
  const base = String(publicBaseUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  // TODO: pre-render OG images server-side for richer overlays.
  return `${base}/certificates/${certificateId}.jpg`;
}
