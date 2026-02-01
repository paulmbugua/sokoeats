import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

export default function AiRobotTeacherRedirect() {
  redirect(appUrl('/robot-teach'));
}
