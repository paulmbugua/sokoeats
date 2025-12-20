/* Web variant: localStorage (SSR-safe), in-memory fallback */
let cachedId: string | null = null;

const STORAGE_KEY = 'stable:device:id';

function genUUID(): string {
  try {
    // Prefer crypto UUID if available
    const rnd = (globalThis as any)?.crypto?.getRandomValues
      ? (() => {
          const buf = new Uint8Array(16);
          (globalThis as any).crypto.getRandomValues(buf);
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
        })()
      : null;
    if (rnd) return rnd;
  } catch {
    /* ignore */
  }
  return `rnd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    /* private mode / SSR */
  }
  return null;
}

/** Get or create a stable device ID (persisted in localStorage). */
export async function getStableDeviceId(forceRefresh = false): Promise<string> {
  if (cachedId && !forceRefresh) return cachedId;

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

  // Fallback: in-memory only
  cachedId = genUUID();
  return cachedId;
}

/** Best-effort sync accessor (works on Web/localStorage). */
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
  const ls = getLocalStorage();
  if (ls) {
    try {
      ls.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
