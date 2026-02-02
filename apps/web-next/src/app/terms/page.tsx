import type { Metadata } from 'next';
import TermsOfService from '@/legacy-pages/TermsOfService';
import { siteUrl } from '@/lib/site';

const title = 'Terms of Service | DayBreak';
const description = 'Review DayBreak terms, user responsibilities, and service conditions.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/terms') },
  openGraph: {
    type: 'website',
    url: siteUrl('/terms'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function TermsPage() {
  return <TermsOfService />;
}
