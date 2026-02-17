import { Suspense } from 'react';
import TrustBlock from '@/components/TrustBlock';
import StablePageShell from '@/components/layout/StablePageShell';
import InstitutionLogin from '@/legacy-pages/InstitutionLogin.web';

export const dynamic = 'force-dynamic';

export default function InstitutionLoginPage() {
  return (
    <StablePageShell>
      <div className="px-4 pb-10 pt-4">
        <Suspense fallback={null}>
          <InstitutionLogin />
        </Suspense>
        <TrustBlock />
      </div>
    </StablePageShell>
  );
}
