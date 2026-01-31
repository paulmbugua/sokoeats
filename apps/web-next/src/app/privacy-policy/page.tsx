import type { Metadata } from 'next';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import { siteUrl } from '@/lib/site';

const title = 'Privacy Policy | DayBreak';
const description = 'Learn how DayBreak collects, uses, and protects your information.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/privacy-policy') },
  openGraph: {
    type: 'website',
    url: siteUrl('/privacy-policy'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicy />;
}
