import type { Auth } from 'firebase/auth';
import { getFirebaseAppSafe } from './firebaseConfig';

let warnedUnavailable = false;

const warnUnavailableOnce = () => {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  // eslint-disable-next-line no-console
  console.warn('[firebase] Web auth unavailable (SSR or missing Firebase web env config).');
};

export const getAuthSafe = async (): Promise<Auth | null> => {
  if (typeof window === 'undefined') return null;

  const app = getFirebaseAppSafe();
  if (!app) {
    warnUnavailableOnce();
    return null;
  }

  try {
    const { getAuth } = await import('firebase/auth');
    return getAuth(app);
  } catch (error) {
    warnUnavailableOnce();
    // eslint-disable-next-line no-console
    console.warn('[firebase] getAuth failed:', error);
    return null;
  }
};

const getGoogleProvider = async () => {
  const { GoogleAuthProvider } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

export const signInGooglePopup = async () => {
  const auth = await getAuthSafe();
  if (!auth) return null;
  const { signInWithPopup } = await import('firebase/auth');
  const provider = await getGoogleProvider();
  return signInWithPopup(auth, provider);
};

export const signInGoogleRedirect = async () => {
  const auth = await getAuthSafe();
  if (!auth) return null;
  const { signInWithRedirect } = await import('firebase/auth');
  const provider = await getGoogleProvider();
  await signInWithRedirect(auth, provider);
  return true;
};

export const signOutCurrentUser = async () => {
  const auth = await getAuthSafe();
  if (!auth) return null;
  const { signOut } = await import('firebase/auth');
  return signOut(auth);
};
