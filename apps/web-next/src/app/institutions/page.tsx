import Script from 'next/script';
import type { Metadata } from 'next';

import TrustBlock from '@/components/TrustBlock';
import StablePageShell from '@/components/layout/StablePageShell';
import InstitutionLanding from '@/legacy-pages/InstitutionLanding.web';
import { siteUrl } from '@/lib/site';

const title = 'Institutions | DayBreak';
const description =
  'Institution portal overview for DayBreak Learner: onboarding, assignments, exams, attendance, fee management, and reporting workflows.';

const institutionsJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'DayBreak for Institutions',
  serviceType: 'Institutional E-Learning Platform',
  url: siteUrl('/institutions'),
  provider: {
    '@type': 'EducationalOrganization',
    name: 'DayBreak',
    url: siteUrl('/'),
  },
  areaServed: 'Worldwide',
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/institutions') },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', url: siteUrl('/institutions'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function InstitutionPage() {
  return (
    <>
      <StablePageShell>
        <div className="px-4 pb-10 pt-4">
          <InstitutionLanding />
          <TrustBlock />
        </div>
      </StablePageShell>
      <Script
        id="ld-institutions-service"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(institutionsJsonLd) }}
      />
    </>
  );
}
