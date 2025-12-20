// packages/shared/utils/firebaseConfig.ts
/* eslint-disable no-console */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth';

// Default to your project’s domain unless a custom one is explicitly requested
const PROJECT_DEFAULT_AUTH_DOMAIN = 'mytutorapp-d3c91.firebaseapp.com';

/** Safe env accessor that works in Vite (web), Expo (RN), SSR/Node */
function getEnv(key: string): string | undefined {
  // Vite (web)
  const viteEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) || undefined;
  if (viteEnv && key in viteEnv) return String((viteEnv as any)[key]);

  // Expo public envs typically live under EXPO_PUBLIC_*
  const g: any = globalThis as any;
  if (g?.expo?.env && key in g.expo.env) return String(g.expo.env[key]);

  // Optional window injection e.g. window.__ENV__ = { ... }
  if (typeof window !== 'undefined' && (window as any).__ENV__?.[key] != null) {
    return String((window as any).__ENV__[key]);
  }

  // Node/SSR (guarded so browser doesn’t throw)
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    return String(process.env[key] as string);
  }

  return undefined;
}

/** Helper: prefer plain, then VITE_, then EXPO_PUBLIC_ */
const pick = (k: string) => getEnv(k) ?? getEnv(`VITE_${k}`) ?? getEnv(`EXPO_PUBLIC_${k}`);

const MODE = getEnv('MODE') || getEnv('NODE_ENV') || 'development';
const PROD = getEnv('PROD') === 'true' || MODE === 'production';

// Core Firebase config — pick from either Vite or Expo public vars
const apiKey = pick('FIREBASE_API_KEY') || '';
const projectId = pick('FIREBASE_PROJECT_ID') || 'mytutorapp-d3c91';
const appId = pick('FIREBASE_APP_ID') || '';
const messagingSenderId = pick('FIREBASE_MESSAGING_SENDER_ID') || '';
const storageBucket = pick('FIREBASE_STORAGE_BUCKET') || `${projectId}.appspot.com`;

// Optional custom auth domain toggle (VITE_USE_CUSTOM_AUTH_DOMAIN=1)
const USE_CUSTOM =
  PROD && (getEnv('VITE_USE_CUSTOM_AUTH_DOMAIN') === '1' || pick('USE_CUSTOM_AUTH_DOMAIN') === '1');
const ENV_AUTH_DOMAIN = (pick('FIREBASE_AUTH_DOMAIN') || '').trim();

const authDomain = USE_CUSTOM && ENV_AUTH_DOMAIN ? ENV_AUTH_DOMAIN : PROJECT_DEFAULT_AUTH_DOMAIN;

if (PROD && USE_CUSTOM && !ENV_AUTH_DOMAIN && typeof window !== 'undefined') {
  console.warn(
    '[firebase] Custom auth domain requested but FIREBASE_AUTH_DOMAIN is empty. Falling back to project domain.'
  );
}

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  appId,
  messagingSenderId,
  storageBucket,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const provider = googleProvider;
/** Call on web to keep auth in localStorage; safe-guarded for RN/server */
export async function ensureBrowserPersistence() {
  if (typeof window !== 'undefined') {
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (e) {
      console.warn('[firebase] setPersistence failed:', e);
    }
  }
}
