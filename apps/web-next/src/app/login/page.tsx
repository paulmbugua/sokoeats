'use client';

import dynamic from 'next/dynamic';

const LoginPage = dynamic(() => import('@/legacy-pages/LoginPage.web'), {
  ssr: false,
  loading: () => null,
});

export default function LoginPageRoute() {
  return <LoginPage />;
}
