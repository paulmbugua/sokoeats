/* eslint-disable no-console */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

const processEnv = typeof process !== 'undefined' ? process.env : undefined;

// ✅ Next.js-safe in web-next and guarded for Vite/browser runtimes
const NEXT_PUBLIC = {
  FIREBASE_API_KEY: processEnv?.NEXT_PUBLIC_FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: processEnv?.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: processEnv?.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: processEnv?.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: processEnv?.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: processEnv?.NEXT_PUBLIC_FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: processEnv?.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Vite env (safe when running in Vite)
const viteEnv: Record<string, any> | undefined =
  typeof import.meta !== 'undefined' ? ((import.meta as any)?.env ?? undefined) : undefined;

export const getFirebaseEnv = (key: string) => {
  const envKey = String(key || '').trim();
  if (!envKey) return '';

  // ✅ Next (literal map)
  const nextValue = (NEXT_PUBLIC as any)[envKey];

  // ✅ Vite
  const viteValue = (viteEnv as any)?.[`VITE_${envKey}`] ?? processEnv?.[`VITE_${envKey}`];

  // ✅ Expo (best-effort)
  const expoValue = processEnv?.[`EXPO_PUBLIC_${envKey}`];

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

/**
 * ONLY returns an auth instance on the client.
 * NOTE: persistence is handled in firebaseAuthWeb.ts (Option A)
 */
export const getAuthOrThrow = async () => {
  if (typeof window === 'undefined') throw new Error('Firebase auth is unavailable during SSR.');

  const app = getFirebaseAppSafe();
  if (!app) throw new Error('Missing Firebase web config.');

  const { getAuth } = await import('firebase/auth');
  return getAuth(app);
};
