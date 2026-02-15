'use client';

import React, { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { useRouter } from 'next/navigation';
import { signInGooglePopup } from '@mytutorapp/shared/utils/firebaseAuthWeb';
import { siteUrl } from '@/lib/appOrigin';

type LoginMode = 'consumer' | 'institution';

const REDIRECT_MARKER = 'auth:googleRedirect';
const REDIRECT_STARTED = 'auth:googleRedirect:started';
const BUSY_KEY = 'auth:busy';

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
    console.log('[google-login] startRedirectFlow()', { mode, returnTo });

    try {
      sessionStorage.setItem(REDIRECT_MARKER, '1');
      sessionStorage.setItem(BUSY_KEY, '1');
      sessionStorage.removeItem(REDIRECT_STARTED);

      console.log('[google-login] session markers set', {
        [REDIRECT_MARKER]: sessionStorage.getItem(REDIRECT_MARKER),
        [BUSY_KEY]: sessionStorage.getItem(BUSY_KEY),
        [REDIRECT_STARTED]: sessionStorage.getItem(REDIRECT_STARTED),
      });
    } catch (e) {
      console.warn('[google-login] sessionStorage failed (private mode?)', e);
    }

    const params = new URLSearchParams({ provider: 'google', mode });
    if (returnTo) params.set('returnTo', returnTo);

    const redirectUrl = siteUrl(`/auth/google/callback?${params.toString()}`);
    console.log('[google-login] redirecting to:', redirectUrl);

    router.replace(redirectUrl);
  };

  const handleGoogleLogin = async () => {
    console.log('[google-login] click', {
      mode,
      returnTo,
      isClient: typeof window !== 'undefined',
    });

    // Check what Next bundled for client-side env (presence only).
    // If apiKey=false here, web-next is NOT loading the env file at build time.
    console.log('[google-login] env presence', {
      apiKey: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      authDomain: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
      projectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
      appId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
      senderId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    });

    try {
      setLoading(true);
      console.log('[google-login] loading=true');

      try {
        console.log('[google-login] calling signInGooglePopup()');
        const result = await signInGooglePopup();
        console.log('[google-login] signInGooglePopup() resolved', {
          hasUser: Boolean(result?.user),
          uid: result?.user?.uid,
          email: result?.user?.email,
          providerData: result?.user?.providerData?.map((p) => p?.providerId),
        });

        if (!result?.user) throw new Error('Missing Firebase web config');

        console.log('[google-login] fetching idToken...');
        const idToken = await result.user.getIdToken(true);
        console.log('[google-login] got idToken (length only)', {
          len: idToken?.length,
        });

        console.log('[google-login] calling onSuccess(idToken)');
        await onSuccess(idToken);

        console.log('[google-login] success, loading=false');
        setLoading(false);
        return;
      } catch (e: any) {
        // This block is specifically for popup failures / unsupported env fallback to redirect
        const code = e?.code || '';
        const message = e?.message || String(e);
        console.warn('[google-login] popup attempt failed', { code, message, e });

        const popupBlocked =
          code === 'auth/popup-blocked' ||
          code === 'auth/cancelled-popup-request' ||
          code === 'auth/popup-closed-by-user';

        const unsupported =
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/operation-not-allowed';

        // A very common misconfig: unauthorized domain / bad authDomain
        // These errors matter because they indicate Firebase Auth settings issue.
        const likelyDomainIssue =
          code === 'auth/unauthorized-domain' ||
          /unauthorized domain/i.test(message) ||
          /authDomain/i.test(message);

        if (likelyDomainIssue) {
          console.warn(
            '[google-login] likely Firebase Auth domain/authorized-domains issue',
            { code, message }
          );
        }

        console.log('[google-login] decision flags', {
          popupBlocked,
          unsupported,
          likelyDomainIssue,
        });

        if (popupBlocked || unsupported) {
          console.log('[google-login] falling back to redirect flow');
          startRedirectFlow();
          return;
        }

        // Anything else: rethrow to outer catch
        throw e;
      }
    } catch (err) {
      console.error('[google-login] hard failure (outer catch)', err);

      try {
        sessionStorage.removeItem(REDIRECT_MARKER);
        sessionStorage.removeItem(BUSY_KEY);
        sessionStorage.removeItem(REDIRECT_STARTED);

        console.log('[google-login] cleared session markers');
      } catch (e) {
        console.warn('[google-login] failed to clear session markers', e);
      }

      setLoading(false);
      console.log('[google-login] loading=false');

      onFailure?.(err instanceof Error ? err : undefined);
      alert('Failed to start Google sign-in.');
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