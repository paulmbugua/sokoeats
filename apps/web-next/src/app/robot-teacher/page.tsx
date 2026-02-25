import type { Metadata } from 'next';

import RobotTeachAdLanding from '@/legacy-pages/RobotTeachAdLanding.web';
import { siteUrl } from '@/lib/site';

const title = 'RobotTeacher | DayBreak';
const description =
  'Learn with RobotTeacher on DayBreak: AI-generated lessons, narrated content, quizzes, and guided progress in one flow.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl('/robot-teacher') },
  robots: { index: true, follow: true },
  openGraph: { type: 'website', url: siteUrl('/robot-teacher'), title, description },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RobotTeacherLandingPage() {
  return <RobotTeachAdLanding />;
}
