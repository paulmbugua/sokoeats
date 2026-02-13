import { Suspense } from 'react';
import InstitutionLogin from '@/legacy-pages/InstitutionLogin.web';

export const dynamic = 'force-dynamic';

export default function InstitutionLoginPage() {
  return (
    <Suspense fallback={null}>
      <InstitutionLogin />
    </Suspense>
  );
}
