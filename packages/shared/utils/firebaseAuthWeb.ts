import { getAuthOrThrow, getFirebaseAppSafe } from './firebaseConfig';

export const buildGoogleProviderSelectAccount = async () => {
  const { GoogleAuthProvider } = await import('firebase/auth');
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
  const auth = await getAuthOrThrow();
  const { signInWithPopup } = await import('firebase/auth');
  const provider = await buildGoogleProviderSelectAccount();
  return signInWithPopup(auth, provider);
};

export const signInGoogleRedirect = async () => {
  const auth = await getAuthOrThrow();
  const { signInWithRedirect } = await import('firebase/auth');
  const provider = await buildGoogleProviderSelectAccount();
  return signInWithRedirect(auth, provider);
};

export const signOutCurrentUser = async () => {
  const auth = await getAuthOrThrow();
  const { signOut } = await import('firebase/auth');
  return signOut(auth);
};


export const getGoogleRedirectToken = async (auth: any): Promise<string | null> => {
  const { getRedirectResult, getIdToken } = await import('firebase/auth');
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  return getIdToken(result.user, true);
};

export const subscribeAuthToken = async (
  auth: any,
  onToken: (idToken: string) => void | Promise<void>
) => {
  const { onAuthStateChanged, getIdToken } = await import('firebase/auth');
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const idToken = await getIdToken(user, true);
    await onToken(idToken);
  });
};
