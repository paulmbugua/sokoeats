import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

export default function LoginBridge() {
  redirect(appUrl('/login'));
}
