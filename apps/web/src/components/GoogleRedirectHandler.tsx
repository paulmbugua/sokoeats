// apps/web/src/components/GoogleRedirectHandler.tsx
import React, { useEffect, useRef } from 'react';
import { getAuthSafe } from '@mytutorapp/shared/utils/firebaseAuthWeb';

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

    const run = async () => {
      const auth = await getAuthSafe();
      if (!auth) {
        const err = new Error('Missing Firebase web config');
        if (DEBUG) console.error('[GoogleRedirectHandler] auth unavailable');
        onFailure(err);
        return () => undefined;
      }

      const { getRedirectResult, onAuthStateChanged, getIdToken } = await import('firebase/auth');
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

      const timeoutId = window.setTimeout(() => {
        if (!mounted || !hadMarker || doneRef.current) return;
        log('Timeout waiting for redirect completion');
        clearBusy();
        onFailure(new Error('Google redirect did not complete in time'));
      }, 15000);

      (async () => {
        try {
          if (!hadMarker) return;
          const result = await getRedirectResult(auth);
          if (!mounted || doneRef.current) return;
          if (result?.user) {
            const idToken = await getIdToken(result.user, true);
            await complete(idToken);
            return;
          }
          log('No redirect result; will rely on onAuthStateChanged');
        } catch (e: any) {
          log('getRedirectResult error:', e);
        }
      })();

      const unsub = onAuthStateChanged(auth, async (u) => {
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
    };

    let cleanup: (() => void) | undefined;
    void run().then((fn) => {
      cleanup = fn;
    });

    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [onSuccess, onFailure]);

  return null;
};

export default GoogleRedirectHandler;
