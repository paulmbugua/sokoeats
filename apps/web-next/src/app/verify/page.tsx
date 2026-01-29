import Script from 'next/script';
import type { Metadata } from 'next';
import VerifyCertificatePage from '@/components/VerifyCertificate.web';
import { siteUrl } from '@/lib/site';

const title = 'Verify Certificate | DayBreak';
const description = 'Verify the authenticity of a DayBreak certificate by ID or number.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/verify') },
  openGraph: {
    type: 'website',
    url: siteUrl('/verify'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Certificate Verification',
  description,
  url: siteUrl('/verify'),
};

export default function VerifyIndex() {
  return (
    <>
      <VerifyCertificatePage />
      <Script
        id="ld-verify"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
