'use client';

import React, { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { useRouter } from 'next/navigation';
import {
  debugFirebaseWebConfig,
  getWebFirebaseConfigOrNull,
  signInGooglePopup,
} from '@mytutorapp/shared/utils/firebaseAuthWeb';
import { siteUrl } from '@/lib/appOrigin';

type LoginMode = 'consumer' | 'institution';

const REDIRECT_MARKER = 'auth:googleRedirect';
const REDIRECT_STARTED = 'auth:googleRedirect:started';
const BUSY_KEY = 'auth:busy';
const CONFIG_MISSING_MESSAGE =
  'Auth is temporarily unavailable (missing web config). Please contact support@daybreaklearner.com.';

export default function CustomGoogleButtonLogin({
  onSuccess,
  onFailure,
  mode = 'consumer',
  returnTo,
}: {
  onSuccess: (idToken: string) => Promise<void>;
  onFailure: (error?: Error) => void;
  mode?: LoginMode;
  returnTo?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const startRedirectFlow = () => {
    try {
      sessionStorage.setItem(REDIRECT_MARKER, '1');
      sessionStorage.setItem(BUSY_KEY, '1');
      sessionStorage.removeItem(REDIRECT_STARTED);
    } catch (e) {
      console.warn('[google-login] sessionStorage failed (private mode?)', e);
    }

    const params = new URLSearchParams({ provider: 'google', mode });
    if (returnTo) params.set('returnTo', returnTo);

    router.replace(siteUrl(`/auth/google/callback?${params.toString()}`));
  };

  const handleGoogleLogin = async () => {
    debugFirebaseWebConfig('google-login');
    const { cfg, missingKeys } = getWebFirebaseConfigOrNull();
    console.log('[google-login] firebase env resolver', {
      hasConfig: Boolean(cfg),
      missingKeys,
    });

    if (!cfg) {
      const err = new Error(`Missing Firebase web config (${missingKeys.join(', ')})`);
      onFailure?.(err);
      alert(CONFIG_MISSING_MESSAGE);
      return;
    }

    try {
      setLoading(true);
      try {
        const result = await signInGooglePopup();
        if (!result?.user) throw new Error('Missing Firebase web config');
        const idToken = await result.user.getIdToken(true);
        await onSuccess(idToken);
        setLoading(false);
        return;
      } catch (e: any) {
        const code = e?.code || '';
        const message = e?.message || String(e);
        const popupBlocked =
          code === 'auth/popup-blocked' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/popup-closed-by-user';

        const unsupported =
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/operation-not-allowed';

        const likelyDomainIssue =
          code === 'auth/unauthorized-domain' ||
          /unauthorized domain/i.test(message) ||
          /authDomain/i.test(message);

        if (likelyDomainIssue) {
          console.warn('[google-login] likely Firebase Auth domain/authorized-domains issue', {
            code,
            message,
          });
        }

        if (popupBlocked || unsupported) {
          startRedirectFlow();
          return;
        }

        throw e;
      }
    } catch (err) {
      console.error('[google-login] hard failure', err);

      try {
        sessionStorage.removeItem(REDIRECT_MARKER);
        sessionStorage.removeItem(BUSY_KEY);
        sessionStorage.removeItem(REDIRECT_STARTED);
      } catch (e) {
        console.warn('[google-login] failed to clear session markers', e);
      }

      setLoading(false);

      onFailure?.(err instanceof Error ? err : undefined);
      const message = err instanceof Error ? err.message : '';
      alert(message.includes('Missing Firebase web config') ? CONFIG_MISSING_MESSAGE : 'Failed to start Google sign-in.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-3 rounded-xl h-11 px-5
                  bg-primary text-white font-semibold shadow-sm hover:shadow transition
                  active:translate-y-[1px] ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <FcGoogle className="w-5 h-5 bg-white rounded-full p-[2px]" />
      {loading ? 'Signing in…' : 'Continue with Google'}
    </button>
  );
}
