import Script from 'next/script';
import type { Metadata } from 'next';
import VerifyCertificatePage from '@/components/VerifyCertificate.web';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const certId = params.id;
  const title = certId
    ? `Verify Certificate ${certId} | DayBreak`
    : 'Verify Certificate | DayBreak';
  const description = certId
    ? `Verify the authenticity of certificate ${certId} on DayBreak.`
    : 'Verify the authenticity of a DayBreak certificate by ID or number.';
  const canonical = siteUrl(`/verify/${certId}`);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/+$/, '') || '';
  const ogImage = backendUrl ? `${backendUrl}/api/certificates/${certId}/og` : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function VerifyById({ params }: { params: { id: string } }) {
  const certId = params.id;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Certificate Verification',
    description: `Verify the authenticity of certificate ${certId} on DayBreak.`,
    url: siteUrl(`/verify/${certId}`),
  };

  return (
    <>
      <VerifyCertificatePage />
      <Script
        id="ld-verify-id"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
