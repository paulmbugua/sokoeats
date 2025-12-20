export function buildCertificateOgImageUrl(
  cloudName: string,
  certificateId: string,
  opts?: {
    brandPublicId?: string; // e.g. 'branding/logo'
    student?: string;
    course?: string;
  }
) {
  const base = `https://res.cloudinary.com/${cloudName}/image/upload`;
  // Start from PDF page 1 as an image, size 1200x630 (OpenGraph)
  const transforms = ['pg_1', 'w_1200,h_630,c_fill'];

  // Optional logo overlay top-left
  if (opts?.brandPublicId) {
    transforms.push(`l_${opts.brandPublicId.replace(/\//g, ':')},w_180,g_north_west,x_40,y_40`);
  }

  // Optional student text (bottom-left)
  if (opts?.student) {
    const txt = encodeURIComponent(opts.student);
    transforms.push(`l_text:Arial_48_bold:${txt},g_south_west,x_40,y_120,co_rgb:0D141C`);
  }

  // Optional course text (bottom-left, under student)
  if (opts?.course) {
    const txt = encodeURIComponent(opts.course);
    transforms.push(`l_text:Arial_36:${txt},g_south_west,x_40,y_60,co_rgb:49739C`);
  }

  return `${base}/${transforms.join('/')}/certificates:${certificateId}.pdf.jpg`;
}
