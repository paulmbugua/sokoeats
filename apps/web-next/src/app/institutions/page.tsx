import type { Metadata } from 'next';

import InstitutionLanding from '@/legacy-pages/InstitutionLanding.web';

export const metadata: Metadata = {
  title: 'Institutions',
  description:
    'Institution portal overview for DayBreak: onboarding, assignments, exams, attendance, fee management, and reporting workflows.',
};

export default function InstitutionPage() {
  return <InstitutionLanding />;
}
