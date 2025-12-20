// apps/mobile/src/screens/GoogleRedirectHandler.native.tsx
import React, { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = {
  onSuccess: (idToken: string) => Promise<void>;
  onFailure: (error?: Error) => void;
};

const REDIRECT_MARKER = 'auth:googleRedirect';
const BUSY_KEY = 'auth:busy';

// Toggle via ?debug=1 on the redirect URL or by setting any env flag in your app init
const isDebugUrl = (url?: string | null) => !!(url && url.includes('debug=1'));

const parseQuery = (url: string): Record<string, string> => {
  try {
    const q = url.split('?')[1] || '';
    const pairs = q.split('&').filter(Boolean);
    const entries = pairs.map((kv) => {
      const [kRaw, vRaw] = kv.split('=');
      const k = decodeURIComponent(kRaw ?? ''); // ← ensure string
      const v = decodeURIComponent(vRaw ?? ''); // ← ensure string
      return [k, v] as const;
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
};

const GoogleRedirectHandler: React.FC<Props> = ({ onSuccess, onFailure }) => {
  const doneRef = useRef(false);
  const debugRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timeoutId: any;
    let sub: { remove?: () => void } | undefined;

    const log = (...a: any[]) => {
      if (debugRef.current) {
        // eslint-disable-next-line no-console
        console.error('[GoogleRedirectHandler.native]', ...a);
      }
    };

    const clearBusy = async () => {
      try {
        await AsyncStorage.multiRemove([REDIRECT_MARKER, BUSY_KEY]);
      } catch {}
    };

    const complete = async (idToken: string) => {
      if (doneRef.current || !mounted) return;
      doneRef.current = true;
      try {
        await onSuccess(idToken);
      } finally {
        await clearBusy();
      }
    };

    const handleUrl = async (url: string | null) => {
      if (!mounted || !url || doneRef.current) return;

      if (isDebugUrl(url)) debugRef.current = true;
      log('Handling URL:', url);

      const hadMarker = (await AsyncStorage.getItem(REDIRECT_MARKER)) === '1';
      if (!hadMarker) {
        log('No redirect marker; ignoring URL.');
        return;
      }

      const q = parseQuery(url);
      const err = q.error || q.error_description;
      const idTok = q.id_token || q.idToken;
      const accessTok = q.access_token || q.accessToken;
      const code = q.code;

      try {
        if (err) {
          log('OAuth error:', err);
          await clearBusy();
          onFailure(new Error(err));
          return;
        }
        if (idTok) {
          await complete(idTok);
          return;
        }
        if (accessTok) {
          await complete(accessTok);
          return;
        }
        if (code) {
          await complete(`code:${code}`);
          return;
        }
        log('No usable token parameters in redirect URL.');
        await clearBusy();
        onFailure(new Error('No auth parameters found in redirect URL'));
      } catch (e: any) {
        log('Handler error:', e);
        await clearBusy();
        onFailure(e instanceof Error ? e : new Error('Auth handling error'));
      }
    };

    const armTimeout = async () => {
      const hadMarker = (await AsyncStorage.getItem(REDIRECT_MARKER)) === '1';
      if (!hadMarker) return;
      const timeoutMs = 15000;
      timeoutId = setTimeout(async () => {
        if (!mounted || doneRef.current) return;
        log('Timeout waiting for redirect completion');
        await clearBusy();
        onFailure(new Error('Google redirect did not complete in time'));
      }, timeoutMs);
    };

    (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && isDebugUrl(initialUrl)) debugRef.current = true;
      } catch {}

      await armTimeout();

      Linking.getInitialURL()
        .then((url) => handleUrl(url))
        .catch((e) => log('getInitialURL error:', e));

      sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    })();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      sub?.remove?.();
    };
  }, [onSuccess, onFailure]);

  return null;
};

export default GoogleRedirectHandler;
