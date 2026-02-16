'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getAuthSafe,
  getGoogleRedirectToken,
  signInGoogleRedirect,
  subscribeAuthToken,
} from '@mytutorapp/shared/utils/firebaseAuthWeb';
import { appUrl, siteUrl } from '@/lib/appOrigin';

type LoginMode = 'consumer' | 'institution';

type Props = {
  onSuccess: (idToken: string) => Promise<void>;
  onFailure: (error?: Error) => void;
};

const REDIRECT_MARKER = 'auth:googleRedirect';
const REDIRECT_STARTED = 'auth:googleRedirect:started';
const BUSY_KEY = 'auth:busy';

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

export default function GoogleRedirectHandler({ onSuccess, onFailure }: Props) {
  const doneRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const mode = (searchParams.get('mode') === 'institution' ? 'institution' : 'consumer') as LoginMode;
  const returnTo = useMemo(() => searchParams.get('returnTo') || '', [searchParams]);
  const loginRoute = mode === 'institution' ? siteUrl('/institutions/login') : siteUrl('/login');

  useEffect(() => {
    if (!mounted) return;

    let alive = true;

    const clearBusy = () => {
      sessionStorage.removeItem(REDIRECT_MARKER);
      sessionStorage.removeItem(BUSY_KEY);
      sessionStorage.removeItem(REDIRECT_STARTED);
    };

    const run = async () => {
      const hadMarker = sessionStorage.getItem(REDIRECT_MARKER) === '1';
      if (!hadMarker) {
        setError('No Google sign-in was in progress.');
        return;
      }

      if (sessionStorage.getItem(REDIRECT_STARTED) !== '1') {
        sessionStorage.setItem(REDIRECT_STARTED, '1');
        await signInGoogleRedirect();
        return;
      }

      const auth = await getAuthSafe();
      if (!auth) {
        const err = new Error('Missing Firebase web config');
        onFailure(err);
        setError(err.message);
        clearBusy();
        return;
      }

      const complete = async (idToken: string) => {
        if (!alive || doneRef.current) return;
        doneRef.current = true;
        try {
          await onSuccess(idToken);
          const target = returnTo || (mode === 'institution' ? '/org/profile' : '/');
          router.replace(canonicalize(target));
        } finally {
          clearBusy();
        }
      };

      try {
        const redirectToken = await getGoogleRedirectToken(auth);
        if (redirectToken) {
          await complete(redirectToken);
          return;
        }
      } catch (e: any) {
        setError(e?.message || 'Google sign-in failed.');
        onFailure(e instanceof Error ? e : undefined);
      }

      const unsub = await subscribeAuthToken(auth, async (idToken) => {
        if (doneRef.current || !alive) return;
        try {
          await complete(idToken);
        } catch (e: any) {
          setError(e?.message || 'Google sign-in failed.');
          onFailure(e instanceof Error ? e : undefined);
          clearBusy();
        }
      });

      const timeoutId = window.setTimeout(() => {
        if (!alive || doneRef.current) return;
        setError('Google sign-in did not complete. Please try again.');
        onFailure(new Error('Google redirect did not complete in time'));
        clearBusy();
      }, 15000);

      return () => {
        window.clearTimeout(timeoutId);
        unsub();
      };
    };

    let cleanup: (() => void) | undefined;
    void run().then((cb) => {
      cleanup = cb;
    });

    return () => {
      alive = false;
      cleanup?.();
    };
  }, [mode, mounted, onFailure, onSuccess, returnTo, router]);

  if (!mounted) return null;

  if (!error) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white/80 p-4 text-sm text-gray-700 dark:border-darkCard dark:bg-[#0f1821]/80 dark:text-darkTextSecondary">
        Completing Google sign-in…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
      <p>{error}</p>
      <button
        type="button"
        onClick={() => router.replace(loginRoute)}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
