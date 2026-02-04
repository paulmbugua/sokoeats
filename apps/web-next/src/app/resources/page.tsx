import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import ResourcesClient from './ResourcesClient';

const title = 'Resources | DayBreak';
const description = 'Browse tutor-led courses and free OER books.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/resources') },
  openGraph: { type: 'website', url: siteUrl('/resources'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function ResourcesPage() {
  return <ResourcesClient />;
}
