import type { Metadata } from 'next';
import CourseDetails from '@/legacy-pages/CourseDetails.web';
import { siteUrl } from '@/lib/site';

const title = 'Course Details | DayBreak';
const description = 'View course details, reviews, and enrollment options on DayBreak.';

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
};

export default function CourseDetailsPage() {
  return <CourseDetails />;
}
