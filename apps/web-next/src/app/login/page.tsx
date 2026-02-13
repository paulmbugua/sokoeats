import { Suspense } from 'react';
import LoginPage from '@/legacy-pages/LoginPage.web';

export const dynamic = 'force-dynamic';

export default function LoginPageRoute() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
