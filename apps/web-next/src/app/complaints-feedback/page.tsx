import type { Metadata } from 'next';
import ComplaintsFeedback from '@/legacy-pages/ComplaintsFeedback';
import { siteUrl } from '@/lib/site';

const title = 'Complaints & Feedback | DayBreak';
const description = 'Learn how to share feedback or submit a complaint with DayBreak support.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/complaints-feedback') },
  openGraph: {
    type: 'website',
    url: siteUrl('/complaints-feedback'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function ComplaintsFeedbackPage() {
  return <ComplaintsFeedback />;
}
