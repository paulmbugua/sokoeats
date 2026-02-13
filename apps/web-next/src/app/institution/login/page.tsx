'use client';

import dynamic from 'next/dynamic';

const InstitutionLogin = dynamic(() => import('@/legacy-pages/InstitutionLogin.web'), {
  ssr: false,
  loading: () => null,
});

export default function InstitutionLoginPage() {
  return <InstitutionLogin />;
}
