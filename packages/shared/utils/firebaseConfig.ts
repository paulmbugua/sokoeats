/* eslint-disable no-console */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const hasProcessEnv = typeof process !== 'undefined' && !!process.env;
const viteEnv: Record<string, any> | undefined =
  typeof import.meta !== 'undefined' ? (import.meta as any).env : undefined;

const readProcessEnv = (key: string) => (hasProcessEnv ? process.env[key] : undefined);

export const getFirebaseEnv = (key: string) => {
  const envKey = String(key || '').trim();
  if (!envKey) return '';
  const nextValue = readProcessEnv(`NEXT_PUBLIC_${envKey}`);
  const viteValue = viteEnv?.[`VITE_${envKey}`] ?? readProcessEnv(`VITE_${envKey}`);
  const expoValue = readProcessEnv(`EXPO_PUBLIC_${envKey}`);
  return String(nextValue ?? viteValue ?? expoValue ?? '').trim();
};

export const firebaseEnv = {
  apiKey: getFirebaseEnv('FIREBASE_API_KEY'),
  authDomain: getFirebaseEnv('FIREBASE_AUTH_DOMAIN'),
  projectId: getFirebaseEnv('FIREBASE_PROJECT_ID') || 'mytutorapp-d3c91',
  storageBucket: getFirebaseEnv('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getFirebaseEnv('FIREBASE_MESSAGING_SENDER_ID'),
  appId: getFirebaseEnv('FIREBASE_APP_ID'),
  measurementId: getFirebaseEnv('FIREBASE_MEASUREMENT_ID'),
};

const firebaseConfig = {
  apiKey: firebaseEnv.apiKey,
  authDomain: firebaseEnv.authDomain || `${firebaseEnv.projectId}.firebaseapp.com`,
  projectId: firebaseEnv.projectId,
  storageBucket: firebaseEnv.storageBucket || `${firebaseEnv.projectId}.appspot.com`,
  messagingSenderId: firebaseEnv.messagingSenderId,
  appId: firebaseEnv.appId,
  measurementId: firebaseEnv.measurementId || undefined,
};

let warnedMissingApiKey = false;
let appInitFailed = false;
let appInstance: FirebaseApp | null = null;

const warnMissingApiKeyOnce = () => {
  if (warnedMissingApiKey) return;
  warnedMissingApiKey = true;
  console.warn(
    '[firebase] Missing FIREBASE_API_KEY. Set NEXT_PUBLIC_FIREBASE_* (web-next), VITE_FIREBASE_* (web), or EXPO_PUBLIC_FIREBASE_* (mobile). Firebase app/auth disabled.'
  );
};

export const getFirebaseAppSafe = (): FirebaseApp | null => {
  if (appInstance) return appInstance;
  if (appInitFailed) return null;

  if (!firebaseConfig.apiKey) {
    warnMissingApiKeyOnce();
    return null;
  }

  try {
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
    return appInstance;
  } catch (error) {
    appInitFailed = true;
    console.warn('[firebase] initializeApp failed:', error);
    return null;
  }
};

export const getAuthOrThrow = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Firebase auth is unavailable during SSR.');
  }

  const app = getFirebaseAppSafe();
  if (!app) {
    throw new Error('Missing Firebase web config.');
  }

  const { getAuth } = await import('firebase/auth');
  return getAuth(app);
};

export async function ensureBrowserPersistence() {
  if (typeof window === 'undefined') return;

  const app = getFirebaseAppSafe();
  if (!app) return;

  try {
    const { getAuth, setPersistence, browserLocalPersistence, inMemoryPersistence } = await import(
      'firebase/auth'
    );
    const auth = getAuth(app);
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {
      await setPersistence(auth, inMemoryPersistence);
    }
  } catch (error) {
    console.warn('[firebase] ensureBrowserPersistence failed:', error);
  }
}

/**
 * Env requirements:
 * - apps/web-next: NEXT_PUBLIC_FIREBASE_API_KEY (+ other NEXT_PUBLIC_FIREBASE_* vars)
 * - apps/web (Vite): VITE_FIREBASE_API_KEY (+ other VITE_FIREBASE_* vars)
 * - apps/mobile (Expo): EXPO_PUBLIC_FIREBASE_API_KEY (+ other EXPO_PUBLIC_FIREBASE_* vars)
 */
