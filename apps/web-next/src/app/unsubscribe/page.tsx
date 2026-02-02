import type { Metadata } from 'next';
import Unsubscribe from '@/legacy-pages/Unsubscribe';
import { siteUrl } from '@/lib/site';

const title = 'Unsubscribe | DayBreak';
const description = 'Manage your communication preferences and unsubscribe from DayBreak updates.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/unsubscribe') },
  openGraph: {
    type: 'website',
    url: siteUrl('/unsubscribe'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function UnsubscribePage() {
  return <Unsubscribe />;
}
