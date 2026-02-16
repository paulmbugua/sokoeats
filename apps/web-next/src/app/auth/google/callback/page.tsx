'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useAuth from '@mytutorapp/shared/hooks/useAuth';
import useInstitutionAuth from '@mytutorapp/shared/hooks/useInstitutionAuth';
import GoogleRedirectHandler from '@/legacy-pages/GoogleRedirectHandler';
import { appUrl, siteUrl } from '@/lib/appOrigin';
import { trackLogin } from '@/analytics/ga4';

const isNextRoute = (href: string) => {
  const [path] = href.split(/[?#]/);
  return (
    path === '/' ||
    path === '/login' ||
    path === '/institutions/login' ||
    path === '/org/profile' ||
    path === '/profile/me' ||
    path === '/find-tutor' ||
    path === '/resources' ||
    path === '/courses' ||
    path === '/help' ||
    path.startsWith('/oer') ||
    path.startsWith('/verify') ||
    path.startsWith('/profile/')
  );
};

const canonicalize = (href: string) => (isNextRoute(href) ? siteUrl(href) : appUrl(href));

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = useMemo(
    () => (searchParams.get('mode') === 'institution' ? 'institution' : 'consumer'),
    [searchParams]
  );

  const navigateFn = useCallback(
    (dest?: string) => {
      router.replace(canonicalize(dest || '/'));
    },
    [router]
  );

  const consumerAuth = useAuth({
    alertFn: (msg) => console.log('[auth]', msg),
    navigateFn,
  });

  const institutionAuth = useInstitutionAuth({
    alertFn: (msg) => console.log('[org-auth]', msg),
    navigateFn,
  });

  const onSuccess = useCallback(
    async (idToken: string) => {
      if (mode === 'institution') {
        await institutionAuth.handleGoogleLoginSuccess(idToken);
        trackLogin('google', { mode: 'org', kind: 'institution' });
        return;
      }

      await consumerAuth.handleGoogleLoginSuccess(idToken);
      trackLogin('google', { mode: 'consumer' });
    },
    [mode, institutionAuth, consumerAuth]
  );

  const onFailure = useCallback(
    (error?: Error) => {
      if (mode === 'institution') {
        institutionAuth.handleGoogleLoginFailure(error);
        return;
      }
      consumerAuth.handleGoogleLoginFailure(error);
    },
    [mode, institutionAuth, consumerAuth]
  );

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-12">
      <GoogleRedirectHandler onSuccess={onSuccess} onFailure={onFailure} />
    </main>
  );
}
