/* eslint-disable no-console */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

type WebFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket?: string;
  measurementId?: string;
};

type WebFirebaseConfigResult = {
  cfg: WebFirebaseConfig | null;
  missingKeys: string[];
};

type RequiredFirebaseKey =
  | 'apiKey'
  | 'authDomain'
  | 'projectId'
  | 'appId'
  | 'messagingSenderId';

type OptionalFirebaseKey = 'storageBucket' | 'measurementId';

type FirebaseKey = RequiredFirebaseKey | OptionalFirebaseKey;

const REQUIRED_WEB_KEYS: RequiredFirebaseKey[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
  'messagingSenderId',
];

const FIREBASE_ENV_MAP: Record<FirebaseKey, { next: string; vite: string; expo: string }> = {
  apiKey: {
    next: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    vite: 'VITE_FIREBASE_API_KEY',
    expo: 'EXPO_PUBLIC_FIREBASE_API_KEY',
  },
  authDomain: {
    next: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    vite: 'VITE_FIREBASE_AUTH_DOMAIN',
    expo: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  },
  projectId: {
    next: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    vite: 'VITE_FIREBASE_PROJECT_ID',
    expo: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  },
  appId: {
    next: 'NEXT_PUBLIC_FIREBASE_APP_ID',
    vite: 'VITE_FIREBASE_APP_ID',
    expo: 'EXPO_PUBLIC_FIREBASE_APP_ID',
  },
  messagingSenderId: {
    next: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    vite: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    expo: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  },
  storageBucket: {
    next: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    vite: 'VITE_FIREBASE_STORAGE_BUCKET',
    expo: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  },
  measurementId: {
    next: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
    vite: 'VITE_FIREBASE_MEASUREMENT_ID',
    expo: 'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
  },
};

const trimEnv = (value: unknown) => {
  const v = String(value ?? '').trim();
  if (!v || v === 'undefined' || v === 'null') return '';
  return v;
};

const getViteEnv = (): Record<string, unknown> => {
  try {
    return (import.meta as any)?.env || {};
  } catch {
    return {};
  }
};

const getEnvValueForKey = (key: FirebaseKey): string => {
  const names = FIREBASE_ENV_MAP[key];

  // Direct process.env access is required so Next client build can inline NEXT_PUBLIC_* values.
  const nextValue =
    names.next === 'NEXT_PUBLIC_FIREBASE_API_KEY'
      ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY
      : names.next === 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
        ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        : names.next === 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
          ? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
          : names.next === 'NEXT_PUBLIC_FIREBASE_APP_ID'
            ? process.env.NEXT_PUBLIC_FIREBASE_APP_ID
            : names.next === 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'
              ? process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
              : names.next === 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
                ? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
                : process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

  const viteEnv = getViteEnv();
  const viteValue = viteEnv[names.vite];
  const expoValue = (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[names.expo] : undefined);

  return trimEnv(nextValue ?? viteValue ?? expoValue);
};

const isBrowser = () => typeof window !== 'undefined';
const isDev = () => {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const viteMode = trimEnv(getViteEnv().MODE).toLowerCase();
  return nodeEnv !== 'production' || viteMode === 'development';
};

const maskValue = (value?: string) => {
  const safe = trimEnv(value);
  if (!safe) return '';
  return `${safe.slice(0, 6)}…(${safe.length})`;
};

let warnedMissingConfig = false;
let appInitFailed = false;
let appInstance: FirebaseApp | null = null;
let loggedSnapshot = false;

export const getWebFirebaseConfigOrNull = (): WebFirebaseConfigResult => {
  const apiKey = getEnvValueForKey('apiKey');
  const authDomain = getEnvValueForKey('authDomain');
  const projectId = getEnvValueForKey('projectId');
  const appId = getEnvValueForKey('appId');
  const messagingSenderId = getEnvValueForKey('messagingSenderId');
  const storageBucket = getEnvValueForKey('storageBucket');
  const measurementId = getEnvValueForKey('measurementId');

  const values: Record<RequiredFirebaseKey, string> = {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId,
  };

  const missingKeys = REQUIRED_WEB_KEYS.filter((key) => !trimEnv(values[key]));

  if (missingKeys.length > 0) {
    return { cfg: null, missingKeys };
  }

  return {
    cfg: {
      apiKey,
      authDomain,
      projectId,
      appId,
      messagingSenderId,
      storageBucket: storageBucket || undefined,
      measurementId: measurementId || undefined,
    },
    missingKeys: [],
  };
};

export const debugFirebaseWebConfig = (scope = 'firebase') => {
  if (!isDev()) return;

  const { cfg, missingKeys } = getWebFirebaseConfigOrNull();
  console.info(`[${scope}] firebase env snapshot`, {
    hasConfig: Boolean(cfg),
    missingKeys,
    runtime: {
      browser: isBrowser(),
      nodeEnv: process.env.NODE_ENV || '',
      viteMode: trimEnv(getViteEnv().MODE),
    },
    values: {
      apiKey: maskValue(cfg?.apiKey),
      authDomain: cfg?.authDomain || '',
      projectId: cfg?.projectId || '',
      appId: maskValue(cfg?.appId),
      messagingSenderId: maskValue(cfg?.messagingSenderId),
      storageBucket: cfg?.storageBucket || '',
      measurementId: maskValue(cfg?.measurementId),
    },
  });
};

const warnMissingConfigOnce = (missingKeys: string[]) => {
  if (warnedMissingConfig) return;
  warnedMissingConfig = true;
  console.warn(
    `[firebase] Missing Firebase web config: ${missingKeys.join(', ')}. ` +
      'Set NEXT_PUBLIC_FIREBASE_* (web-next), VITE_FIREBASE_* (web), or EXPO_PUBLIC_FIREBASE_* (mobile).'
  );
};

export const getFirebaseAppSafe = (): FirebaseApp | null => {
  if (!isBrowser()) return null;
  if (appInstance) return appInstance;
  if (appInitFailed) return null;

  const { cfg, missingKeys } = getWebFirebaseConfigOrNull();
  if (!cfg) {
    warnMissingConfigOnce(missingKeys);
    return null;
  }

  if (!loggedSnapshot) {
    debugFirebaseWebConfig('firebase');
    loggedSnapshot = true;
  }

  try {
    appInstance = getApps().length ? getApp() : initializeApp(cfg);
    return appInstance;
  } catch (error) {
    appInitFailed = true;
    console.warn('[firebase] initializeApp failed:', error);
    return null;
  }
};

export const getFirebaseMissingKeys = () => getWebFirebaseConfigOrNull().missingKeys;

export const getAuthOrThrow = async () => {
  if (!isBrowser()) throw new Error('Firebase auth is unavailable during SSR.');

  const { missingKeys } = getWebFirebaseConfigOrNull();
  const app = getFirebaseAppSafe();
  if (!app) {
    throw new Error(
      `Missing Firebase web config (${missingKeys.join(', ') || 'unknown'}). ` +
        'Please set NEXT_PUBLIC_FIREBASE_* (web-next) or VITE_FIREBASE_* (web).'
    );
  }

  const { getAuth } = await import('firebase/auth');
  return getAuth(app);
};
