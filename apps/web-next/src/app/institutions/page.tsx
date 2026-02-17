import type { Metadata } from 'next';

import TrustBlock from '@/components/TrustBlock';
import StablePageShell from '@/components/layout/StablePageShell';
import InstitutionLanding from '@/legacy-pages/InstitutionLanding.web';

export const metadata: Metadata = {
  title: 'Institutions',
  description:
    'Institution portal overview for DayBreak Learner: onboarding, assignments, exams, attendance, fee management, and reporting workflows.',
};

export default function InstitutionPage() {
  return (
    <StablePageShell>
      <div className="px-4 pb-10 pt-4">
        <InstitutionLanding />
        <TrustBlock />
      </div>
    </StablePageShell>
  );
}
