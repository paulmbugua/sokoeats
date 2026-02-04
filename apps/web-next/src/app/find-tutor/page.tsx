import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import FindTutorClient from './FindTutorClient';

const title = 'Find a Tutor | DayBreak';
const description = 'Discover tutors by subject, price, and availability.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/find-tutor') },
  openGraph: { type: 'website', url: siteUrl('/find-tutor'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function FindTutorPage() {
  return <FindTutorClient />;
}
