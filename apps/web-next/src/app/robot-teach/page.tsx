import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

export default function RobotTeachRedirect() {
  redirect(appUrl('/robot-teach'));
}
