/* eslint-disable no-console */
//packages/shared/utils/firebaseAuthWeb.ts
import {
  debugFirebaseWebConfig,
  getAuthOrThrow,
  getFirebaseAppSafe,
  getFirebaseMissingKeys,
  getWebFirebaseConfigOrNull,
} from './firebaseConfig';

/**
 * Ensures Firebase Auth persistence in the browser.
 * Safe for Next.js because it is client-guarded + uses dynamic imports.
 */
export const ensureBrowserPersistence = async () => {
  if (typeof window === 'undefined') return;

  const app = getFirebaseAppSafe();
  if (!app) return;

  try {
    const { getAuth, setPersistence, browserLocalPersistence } = await import('firebase/auth');
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    // Don’t hard-crash if persistence fails due to browser settings
    console.warn('[firebase] setPersistence failed:', e);
  }
};

/**
 * Build Google provider with "select_account".
 */
export const buildGoogleProviderSelectAccount = async () => {
  const { GoogleAuthProvider } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

/**
 * Get auth without throwing (null on SSR / missing config / import failure)
 * Also applies persistence best-effort.
 */
export const getAuthSafe = async () => {
  if (typeof window === 'undefined') return null;

  // best-effort persistence; do not block auth if it fails
  try {
    await ensureBrowserPersistence();
  } catch {}

  try {
    return await getAuthOrThrow();
  } catch {
    return null;
  }
};

export const signInGooglePopup = async () => {
  const auth = await getAuthOrThrow();
  try {
    await ensureBrowserPersistence();
  } catch {}

  const { signInWithPopup } = await import('firebase/auth');
  const provider = await buildGoogleProviderSelectAccount();
  return signInWithPopup(auth, provider);
};

export const signInGoogleRedirect = async () => {
  const auth = await getAuthOrThrow();
  try {
    await ensureBrowserPersistence();
  } catch {}

  const { signInWithRedirect } = await import('firebase/auth');
  const provider = await buildGoogleProviderSelectAccount();
  return signInWithRedirect(auth, provider);
};

export const signOutCurrentUser = async () => {
  const auth = await getAuthOrThrow();
  const { signOut } = await import('firebase/auth');
  return signOut(auth);
};

/**
 * After Google redirect, fetch idToken (force refresh).
 * Returns null when no redirect result (normal case).
 */
export const getGoogleRedirectToken = async (auth: any): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  try {
    const { getRedirectResult, getIdToken } = await import('firebase/auth');
    const result = await getRedirectResult(auth);
    if (!result?.user) return null;
    return getIdToken(result.user, true);
  } catch (e: any) {
    // Firebase throws "auth/no-auth-event" often when there is no redirect event; treat as null
    const msg = String(e?.code || e?.message || '');
    if (msg.includes('no-auth-event')) return null;
    return null;
  }
};

/**
 * Subscribe to auth user changes and push fresh idToken when user is present.
 * Returns the unsubscribe function from onAuthStateChanged.
 */
export const subscribeAuthToken = async (
  auth: any,
  onToken: (idToken: string) => void | Promise<void>
) => {
  const { onAuthStateChanged, getIdToken } = await import('firebase/auth');

  return onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
      const idToken = await getIdToken(user, true);
      await onToken(idToken);
    } catch (e) {
      console.warn('[firebase] subscribeAuthToken failed:', e);
    }
  });
};

export { debugFirebaseWebConfig, getFirebaseMissingKeys, getWebFirebaseConfigOrNull };
