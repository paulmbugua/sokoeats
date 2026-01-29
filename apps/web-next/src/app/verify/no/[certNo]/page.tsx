import Script from 'next/script';
import type { Metadata } from 'next';
import VerifyCertificatePage from '@/components/VerifyCertificate.web';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({ params }: { params: { certNo: string } }): Promise<Metadata> {
  const certNo = params.certNo;
  const title = certNo
    ? `Verify Certificate ${certNo} | DayBreak`
    : 'Verify Certificate | DayBreak';
  const description = certNo
    ? `Verify the authenticity of certificate ${certNo} on DayBreak.`
    : 'Verify the authenticity of a DayBreak certificate by ID or number.';
  const canonical = siteUrl(`/verify/no/${certNo}`);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      url: canonical,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function VerifyByNumber({ params }: { params: { certNo: string } }) {
  const certNo = params.certNo;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Certificate Verification',
    description: `Verify the authenticity of certificate ${certNo} on DayBreak.`,
    url: siteUrl(`/verify/no/${certNo}`),
  };

  return (
    <>
      <VerifyCertificatePage />
      <Script
        id="ld-verify-no"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
