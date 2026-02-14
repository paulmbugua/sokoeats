import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { getAuthOrThrow, getFirebaseAppSafe } from './firebaseConfig';

export const buildGoogleProviderSelectAccount = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

export const getAuthSafe = async () => {
  if (typeof window === 'undefined') return null;

  const app = getFirebaseAppSafe();
  if (!app) return null;

  try {
    const { getAuth } = await import('firebase/auth');
    return getAuth(app);
  } catch {
    return null;
  }
};
export const signInGooglePopup = async () => {
  const auth = getAuthOrThrow();
  const provider = buildGoogleProviderSelectAccount();
  return signInWithPopup(auth, provider);
};

export const signInGoogleRedirect = async () => {
  const auth = getAuthOrThrow();
  const provider = buildGoogleProviderSelectAccount();
  return signInWithRedirect(auth, provider);
};

export const signOutCurrentUser = async () => {
  const auth = getAuthOrThrow();
  return signOut(auth);
};
