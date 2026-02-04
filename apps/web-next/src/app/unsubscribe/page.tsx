import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import UnsubscribeClient from './UnsubscribeClient';

const title = 'Unsubscribe | DayBreak';
const description = 'Manage your email preferences and unsubscribe from communications.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/unsubscribe') },
  openGraph: { type: 'website', url: siteUrl('/unsubscribe'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function UnsubscribePage() {
  return <UnsubscribeClient />;
}
