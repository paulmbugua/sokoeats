import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

export default function RobotTeachStart() {
  redirect(appUrl('/robot-teach'));
}
