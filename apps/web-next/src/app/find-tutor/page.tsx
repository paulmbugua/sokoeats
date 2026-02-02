import type { Metadata } from 'next';
import FindTutor from '@/legacy-pages/FindTutor.web';
import { siteUrl } from '@/lib/site';

const title = 'Find a Tutor | DayBreak';
const description =
  'Browse expert tutors by subject, grade band, and availability to match your learning goals.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/find-tutor') },
  openGraph: {
    type: 'website',
    url: siteUrl('/find-tutor'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function FindTutorPage() {
  return <FindTutor />;
}
