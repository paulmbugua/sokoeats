import { redirect } from 'next/navigation';
import { appUrl } from '@/lib/appOrigin';

export default function OrgLoginBridge() {
  redirect(appUrl('/org/login?next=/org'));
}
