import type { Metadata } from 'next';
import AntiSpamPolicy from '@/legacy-pages/AntiSpamPolicy';
import { siteUrl } from '@/lib/site';

const title = 'Anti-Spam Policy | DayBreak';
const description = 'Review DayBreak’s commitment to responsible communication and anti-spam practices.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/anti-spam-policy') },
  openGraph: {
    type: 'website',
    url: siteUrl('/anti-spam-policy'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function AntiSpamPolicyPage() {
  return <AntiSpamPolicy />;
}
