import Script from 'next/script';
import type { Metadata, Viewport } from 'next';
import Landing from '@/legacy-pages/Landing.web';
import { landingDescription, landingJsonLd, landingOgImage, landingTitle } from '@/lib/landingSeo';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: landingTitle,
  description: landingDescription,
  alternates: { canonical: siteUrl('/') },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl('/'),
    title: landingTitle,
    description: landingDescription,
    siteName: 'DayBreak',
    locale: 'en_US',
    images: [{ url: landingOgImage }],
  },
  twitter: {
    card: 'summary_large_image',
    title: landingTitle,
    description: landingDescription,
    images: [landingOgImage],
  },
};

export const viewport: Viewport = {
  themeColor: '#111827',
};

export default function LandingPage() {
  return (
    <>
      <Landing />
      <Script
        id="ld-org"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.organization) }}
      />
      <Script
        id="ld-website"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.website) }}
      />
      <Script
        id="ld-howto"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.howTo) }}
      />
      <Script
        id="ld-faq"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.faq) }}
      />
      <Script
        id="ld-breadcrumb"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.breadcrumb) }}
      />
      <Script
        id="ld-institution-service"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.institutionService) }}
      />
      <Script
        id="ld-webapp"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd.webApp) }}
      />
    </>
  );
}
