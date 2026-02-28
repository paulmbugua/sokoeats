/* eslint-disable no-console */
export const AUTH_SESSION_KEY = 'myhandymanapp.auth.session.v1';

export type AuthMode = 'consumer' | 'org';

export type AuthSession = {
  mode: AuthMode;
  accessToken: string | null;
  updatedAt: number;
  userId?: string;
  email?: string;
};

type StorageAdapter = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
};

const memStore = new Map<string, string>();

const defaultStorage: StorageAdapter = {
  getItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // ignore
    }
    return memStore.get(key) ?? null;
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // ignore
    }
    memStore.set(key, value);
  },
  removeItem: (key) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch {
      // ignore
    }
    memStore.delete(key);
  },
};

let storageAdapter: StorageAdapter = defaultStorage;

export const setAuthSessionStorage = (adapter?: StorageAdapter) => {
  if (adapter) {
    storageAdapter = adapter;
  } else {
    storageAdapter = defaultStorage;
  }
};

const safeParse = (raw: string | null): AuthSession | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.mode !== 'consumer' && parsed.mode !== 'org') return null;
    return {
      mode: parsed.mode,
      accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
      userId: typeof parsed.userId === 'string' ? parsed.userId : undefined,
      email: typeof parsed.email === 'string' ? parsed.email : undefined,
    };
  } catch {
    return null;
  }
};

export const readSession = async (): Promise<AuthSession | null> => {
  const raw = await storageAdapter.getItem(AUTH_SESSION_KEY);
  return safeParse(typeof raw === 'string' ? raw : null);
};

export const writeSession = async (session: AuthSession): Promise<void> => {
  await storageAdapter.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
};

export const clearSession = async (): Promise<void> => {
  await storageAdapter.removeItem(AUTH_SESSION_KEY);
};

export const setConsumerSession = async (
  token: string,
  meta: Partial<AuthSession> = {}
): Promise<void> => {
  const session: AuthSession = {
    mode: 'consumer',
    accessToken: token,
    updatedAt: Date.now(),
    userId: meta.userId,
    email: meta.email,
  };
  await writeSession(session);
};

export const setOrgSession = async (
  token: string,
  meta: Partial<AuthSession> = {}
): Promise<void> => {
  const session: AuthSession = {
    mode: 'org',
    accessToken: token,
    updatedAt: Date.now(),
    userId: meta.userId,
    email: meta.email,
  };
  await writeSession(session);
};

export const getConsumerToken = async (): Promise<string | null> => {
  const session = await readSession();
  if (!session || session.mode !== 'consumer') return null;
  return session.accessToken || null;
};

export const getOrgToken = async (): Promise<string | null> => {
  const session = await readSession();
  if (!session || session.mode !== 'org') return null;
  return session.accessToken || null;
};

const LEGACY_KEYS = ['token', 'orgToken', 'authToken', 'auth:token'] as const;

const deleteLegacyKeys = async () => {
  await Promise.all(LEGACY_KEYS.map((key) => storageAdapter.removeItem(key)));
};

export const migrateLegacyTokens = async (): Promise<{
  migrated: boolean;
  mode?: AuthMode;
}> => {
  const [token, orgToken, authToken, authTokenAlt] = await Promise.all(
    LEGACY_KEYS.map((key) => storageAdapter.getItem(key))
  );
  const org = typeof orgToken === 'string' ? orgToken : null;
  const consumer = typeof token === 'string' ? token : null;
  const auth = typeof authToken === 'string' ? authToken : typeof authTokenAlt === 'string' ? authTokenAlt : null;

  if (org) {
    await setOrgSession(org);
    await deleteLegacyKeys();
    return { migrated: true, mode: 'org' };
  }

  if (consumer || auth) {
    await setConsumerSession(consumer || auth || '');
    await deleteLegacyKeys();
    return { migrated: true, mode: 'consumer' };
  }

  return { migrated: false };
};
