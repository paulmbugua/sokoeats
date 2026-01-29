import type { Metadata } from 'next';
import MyCourses from '@/pages/MyCourses.web';
import { siteUrl } from '@/lib/site';

const title = 'Courses Catalog | DayBreak';
const description = 'Browse DayBreak courses and start learning with AI-guided lessons and tutor support.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/courses') },
  openGraph: {
    type: 'website',
    url: siteUrl('/courses'),
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function CoursesPage() {
  return <MyCourses />;
}
