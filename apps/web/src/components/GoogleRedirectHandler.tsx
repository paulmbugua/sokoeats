// apps/web/src/components/GoogleRedirectHandler.tsx
import React, { useEffect, useRef } from 'react';
import { getRedirectResult, onAuthStateChanged, getIdToken } from 'firebase/auth';
import { getAuthOrThrow } from '@mytutorapp/shared/utils/firebaseConfig';

type Props = {
  onSuccess: (idToken: string) => Promise<void>;
  onFailure: (error?: Error) => void;
};

const REDIRECT_MARKER = 'auth:googleRedirect';
const BUSY_KEY = 'auth:busy';

const DEBUG =
  import.meta.env.VITE_DEBUG_ERRORS === '1' ||
  new URLSearchParams(window.location.search).has('debug');

const GoogleRedirectHandler: React.FC<Props> = ({ onSuccess, onFailure }) => {
  const doneRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // ✅ Avoid TS2345 by never using nullable auth
    let auth: ReturnType<typeof getAuthOrThrow> | null = null;
    try {
      auth = getAuthOrThrow();
    } catch (e) {
      // If auth isn't available (bad config), don't crash the app
      if (DEBUG) console.error('[GoogleRedirectHandler] getAuthOrThrow failed:', e);
      onFailure(e instanceof Error ? e : undefined);
      return () => {
        mounted = false;
      };
    }

    const hadMarker = sessionStorage.getItem(REDIRECT_MARKER) === '1';

    const log = (...a: any[]) => {
      if (DEBUG) console.error('[GoogleRedirectHandler]', ...a);
    };

    const clearBusy = () => {
      sessionStorage.removeItem(REDIRECT_MARKER);
      sessionStorage.removeItem(BUSY_KEY);
    };

    const complete = async (idToken: string) => {
      if (doneRef.current || !mounted) return;
      doneRef.current = true;
      try {
        await onSuccess(idToken);
      } finally {
        clearBusy();
      }
    };

    // ---- Fail-fast timeout so spinner can’t hang forever ----
    const timeoutMs = 15000;
    const timeoutId = window.setTimeout(() => {
      if (!mounted || !hadMarker || doneRef.current) return;
      log('Timeout waiting for redirect completion');
      clearBusy();
      onFailure(new Error('Google redirect did not complete in time'));
    }, timeoutMs);

    // Try to finalize via the redirect result first
    (async () => {
      try {
        if (!hadMarker) return;

        const result = await getRedirectResult(auth!);
        if (!mounted || doneRef.current) return;

        if (result?.user) {
          const idToken = await getIdToken(result.user, true);
          await complete(idToken);
          return;
        }

        log('No redirect result; will rely on onAuthStateChanged');
      } catch (e: any) {
        // Don’t fail immediately; auth-state fallback often succeeds
        log('getRedirectResult error:', e);
      }
    })();

    // Fallback: rely on auth state
    const unsub = onAuthStateChanged(auth!, async (u) => {
      if (!mounted || !u || !hadMarker || doneRef.current) return;
      try {
        const tok = await getIdToken(u, true);
        await complete(tok);
      } catch (e: any) {
        if (!mounted || doneRef.current) return;
        log('onAuthStateChanged error:', e);
        onFailure(e instanceof Error ? e : undefined);
        clearBusy();
      }
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      unsub();
    };
  }, [onSuccess, onFailure]);

  return null;
};

export default GoogleRedirectHandler;
