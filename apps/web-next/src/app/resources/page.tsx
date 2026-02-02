import type { Metadata } from 'next';
import Resources from '@/legacy-pages/Resources.web';
import { siteUrl } from '@/lib/site';

const title = 'Learning Resources | DayBreak';
const description = 'Explore free and premium learning resources, videos, notes, and tutor-made content.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/resources') },
  openGraph: {
    type: 'website',
    url: siteUrl('/resources'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function ResourcesPage() {
  return <Resources />;
}
