// packages/shared/src/utils/deviceId.ts
/* Cross-platform stable device ID
   - React Native: AsyncStorage
   - Web: localStorage
   - Fallback: in-memory (session) cache
*/
let cachedId: string | null = null;

const STORAGE_KEY = 'stable:device:id';

// Best-available UUID v4 (uses crypto if present, else Math.random)
function genUUID(): string {
  const cryptoAny: any =
    (typeof globalThis !== 'undefined' && (globalThis.crypto || (globalThis as any).msCrypto)) ||
    undefined;

  if (cryptoAny && typeof cryptoAny.getRandomValues === 'function') {
    const buf = new Uint8Array(16);
    cryptoAny.getRandomValues(buf);
    // RFC4122 v4
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < buf.length; i++) hex.push((buf[i] + 0x100).toString(16).slice(1));
    return (
      hex[0] +
      hex[1] +
      hex[2] +
      hex[3] +
      '-' +
      hex[4] +
      hex[5] +
      '-' +
      hex[6] +
      hex[7] +
      '-' +
      hex[8] +
      hex[9] +
      '-' +
      hex[10] +
      hex[11] +
      hex[12] +
      hex[13] +
      hex[14] +
      hex[15]
    );
  }
  // Non-crypto fallback
  return `rnd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Detect React Native (no window/document)
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// Lazy load AsyncStorage if we're on RN and the package is available.
// We use dynamic require to avoid bundler issues on Web/Node.
async function getAsyncStorage(): Promise<{
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
} | null> {
  if (!isReactNative) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage') as {
      default?: { getItem: any; setItem: any };
      getItem?: any;
      setItem?: any;
    };
    const store = (mod?.default ?? mod) as any;
    if (store?.getItem && store?.setItem) {
      return store as {
        getItem(k: string): Promise<string | null>;
        setItem(k: string, v: string): Promise<void>;
      };
    }
  } catch {
    /* ignore — not available */
  }
  return null;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* SSR / restricted storage */
  }
  return null;
}

/** Get or create a stable device ID (persisted on the platform store). */
export async function getStableDeviceId(forceRefresh = false): Promise<string> {
  if (cachedId && !forceRefresh) return cachedId;

  // 1) Try RN AsyncStorage
  const asyncStorage = await getAsyncStorage();
  if (asyncStorage) {
    try {
      if (!forceRefresh) {
        const existing = await asyncStorage.getItem(STORAGE_KEY);
        if (existing) {
          cachedId = existing;
          return existing;
        }
      }
      const fresh = genUUID();
      await asyncStorage.setItem(STORAGE_KEY, fresh);
      cachedId = fresh;
      return fresh;
    } catch {
      /* fall through */
    }
  }

  // 2) Try Web localStorage
  const ls = getLocalStorage();
  if (ls) {
    try {
      if (!forceRefresh) {
        const existing = ls.getItem(STORAGE_KEY);
        if (existing) {
          cachedId = existing;
          return existing;
        }
      }
      const fresh = genUUID();
      ls.setItem(STORAGE_KEY, fresh);
      cachedId = fresh;
      return fresh;
    } catch {
      /* fall through */
    }
  }

  // 3) Fallback in-memory only (last resort; not persisted)
  cachedId = genUUID();
  return cachedId;
}

/** Best-effort sync accessor (works on Web with localStorage; on RN returns cached or null). */
export function getStableDeviceIdSync(): string | null {
  if (cachedId) return cachedId;
  const ls = getLocalStorage();
  if (ls) {
    try {
      const existing = ls.getItem(STORAGE_KEY);
      if (existing) {
        cachedId = existing;
        return existing;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Clear the stored device ID (useful for testing). */
export async function resetStableDeviceId(): Promise<void> {
  cachedId = null;
  const asyncStorage = await getAsyncStorage();
  if (asyncStorage) {
    try {
      await asyncStorage.setItem(STORAGE_KEY, '');
    } catch {
      /* ignore */
    }
  }
  const ls = getLocalStorage();
  if (ls) {
    try {
      ls.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
