// apps/web/src/components/GoogleRedirectHandler.tsx
import React, { useEffect, useRef } from 'react';
import { auth } from '@mytutorapp/shared/utils/firebaseConfig';
import { getRedirectResult, onAuthStateChanged, getIdToken } from 'firebase/auth';

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

        const result = await getRedirectResult(auth);
        if (!mounted || doneRef.current) return;

        if (result?.user) {
          // ✅ Get a Firebase ID token (what your backend expects)
          const idToken = await getIdToken(result.user, /* forceRefresh */ true);
          await complete(idToken);
          return;
        }

        // No result yet — fall back to auth state listener below
        log('No redirect result; will rely on onAuthStateChanged');
      } catch (e: any) {
        // Don’t fail immediately; let the auth state fallback try.
        // Many transient cases end up succeeding via onAuthStateChanged.
        log('getRedirectResult error:', e);
      }
    })();

    // Fallback: if redirect result isn't available yet, rely on auth state
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!mounted || !u || !hadMarker || doneRef.current) return;
      try {
        const tok = await getIdToken(u, /* forceRefresh */ true);
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
