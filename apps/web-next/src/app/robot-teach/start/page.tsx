import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function RobotTeachStart() {
  redirect(ROUTES.robotTeacherLanding);
}
