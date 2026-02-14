import type { Metadata } from 'next';

import RobotTeachAdLanding from '@/legacy-pages/RobotTeachAdLanding.web';

export const metadata: Metadata = {
  title: 'RobotTeacher',
  description:
    'Learn with RobotTeacher on DayBreak: AI-generated lessons, narrated content, quizzes, and guided progress in one flow.',
};

export default function RobotTeacherLandingPage() {
  return <RobotTeachAdLanding />;
}
