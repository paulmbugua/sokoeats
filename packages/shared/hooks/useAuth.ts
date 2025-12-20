// packages/shared/hooks/useAuth.ts
import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import * as api from '@mytutorapp/shared/api';

import type {
  AuthPayload,
  RegisterPayload,
  UpdateRolePayload,
  AuthResponse,
} from '@mytutorapp/shared/types';

export interface UseLoginOptions {
  alertFn?: (message: string) => void;
  navigateFn?: (destination?: string) => void; // web: path, native: screen name (after alias)
}

/* ------------------------------- Env & routes ------------------------------- */
// Detect React Native vs Web; RN needs screen names, Web uses paths.
const isNative = typeof navigator !== 'undefined' && (navigator as any)?.product === 'ReactNative';

// Map web-style paths to native screen names (extend as your stack grows).
function routeAlias(input?: string): string | undefined {
  if (!input) return input;
  if (!isNative) return input; // keep raw paths on web

  switch (input.toLowerCase()) {
    case '/':
    case '/landing':
    case 'landing':
      return 'Landing';
    case '/home':
    case 'home':
      return 'Home';
    case '/login':
    case 'login':
      return 'Login';
    case '/robot':
    case '/robot-tutor':
    case 'robottutor':
      return 'RobotTutor';
    case '/find-tutor':
    case 'findtutor':
      return 'FindTutor';
    case '/courses':
      return 'Courses';
    case '/account':
    case '/me':
    case '/profile/me':
      return 'Account';
    default:
      return 'Home';
  }
}

/* ------------------------- Safe, cross-platform storage ------------------------- */

const memStore = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      (globalThis as any).localStorage
    ) {
      return (globalThis as any).localStorage.getItem(key);
    }
  } catch {}
  return memStore.get(key) ?? null;
}
function storageSet(key: string, value: string | null): void {
  try {
    if (
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      (globalThis as any).localStorage
    ) {
      if (value === null) (globalThis as any).localStorage.removeItem(key);
      else (globalThis as any).localStorage.setItem(key, value);
      return;
    }
  } catch {}
  if (value === null) memStore.delete(key);
  else memStore.set(key, value);
}

/* ----------------------------- Local flags/keys ----------------------------- */

const NEED_ROLE_FLAG = 'auth:needsRole';
const PENDING_JWT_KEY = 'auth:pendingJwt';

function setNeedRoleFlag(on: boolean) {
  storageSet(NEED_ROLE_FLAG, on ? '1' : null);
}
function getNeedRoleFlag(): boolean {
  return storageGet(NEED_ROLE_FLAG) === '1';
}
function setPendingJwt(jwt: string | null) {
  storageSet(PENDING_JWT_KEY, jwt);
}
function getPendingJwt(): string | null {
  return storageGet(PENDING_JWT_KEY);
}
function clearAuthFlags() {
  setNeedRoleFlag(false);
  setPendingJwt(null);
}

/* --------------------------- Invite return-to helpers --------------------------- */

const RETURN_TO_KEY = 'auth:returnTo';

/** Turn absolute URL → path, drop hash, keep query. */
function normalizeToPath(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  try {
    // Absolute URL
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      return `${u.pathname}${u.search || ''}`;
    }
  } catch {
    /* fall through to treat as path */
  }
  return s;
}

/** Collapse any invite child route to its base: `/org/join/:code` */
function inviteBase(pathish?: string | null): string | null {
  const p = normalizeToPath(pathish);
  if (!p) return null;
  // Accept: /org/join/ABC, /org/join/ABC/, /org/join/ABC/login, with optional query
  const m = p.match(/^\/org\/join\/([^/?#]+)(?:\/(?:login|signup))?(?:\?.*)?$/i);
  return m ? `/org/join/${m[1]}` : null;
}

function readReturnTo(): string | null {
  // sessionStorage first (set by OrgInviteLanding)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(RETURN_TO_KEY);
      if (raw) return normalizeToPath(raw);
    }
  } catch {}
  // fallback local store
  return normalizeToPath(storageGet(RETURN_TO_KEY));
}

function clearReturnTo() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    }
  } catch {}
  storageSet(RETURN_TO_KEY, null);
}

/** Is the saved returnTo pointing at an org invite (any variant)? */
function isInviteReturn(path?: string | null): boolean {
  return inviteBase(path) !== null;
}

/** Next destination after successful auth, honoring any generic returnTo */
function nextAfterAuth(defaultPath: string): string {
  const saved = readReturnTo();
  clearReturnTo();
  return saved || defaultPath;
}

/* --------------------------------- Hook ---------------------------------- */

const useAuth = (options?: UseLoginOptions) => {
  const { alertFn, navigateFn } = options || {};
  const nav = (to?: string) => {
    if (navigateFn) navigateFn(routeAlias(to));
  };

  // Read context once, then safely pluck optional fields (avoids TS error 2339)
  const shop = useShopContext() as unknown as {
    setToken: (t: string) => void;
    backendUrl: string;
    token?: string;
    // setProfile might not exist on some builds; treat as optional
    setProfile?: (p: unknown | null) => void;
  };
  const { setToken, backendUrl, token } = shop;
  const setProfile = shop.setProfile; // optional

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  /** GOOGLE FLOW */
  const handleGoogleLoginSuccess = useCallback(
    async (idToken: string) => {
      try {
        const resp: AuthResponse = await api.googleLogin(backendUrl, idToken);
        const jwt = resp?.token;
        const role = (resp as Partial<{ role: string | null }>).role ?? null;

        if (!jwt) {
          throw new Error('No JWT returned from googleLogin');
        }

        // Invite-aware: if we came from /org/join/:code[/login], go back there
        const saved = readReturnTo();
        const backToInvite = inviteBase(saved);

        if (backToInvite) {
          setToken(jwt);
          clearAuthFlags();
          nav(backToInvite); // back to Accept & Join
          return;
        }

        if (role) {
          setToken(jwt);
          clearAuthFlags();
          nav(nextAfterAuth('/home')); // honors any generic returnTo fallback
          return;
        }

        setPendingJwt(jwt);
        setNeedRoleFlag(true);
        nav('/profile/me'); // -> 'Account' on native
      } catch (e: unknown) {
        clearAuthFlags();
        const msg = e instanceof Error ? e.message : 'Google authentication failed';
        alertFn?.(msg);
        throw e;
      }
    },
    [backendUrl, setToken, alertFn]
  );

  const handleGoogleLoginFailure = useCallback(
    (error?: Error) => {
      clearAuthFlags();
      alertFn?.(error?.message || 'Google sign-in failed');
    },
    [alertFn]
  );

  /** Complete role selection using the pending JWT */
  const completeRole = useCallback(
    async (payload: UpdateRolePayload) => {
      const pending = getPendingJwt();
      if (!pending) throw new Error('Missing pending JWT');
      await api.updateRole(backendUrl, payload, pending);
      setToken(pending);
      clearAuthFlags();

      // If the user arrived via invite (and had to pick a role), return to invite base
      const saved = readReturnTo();
      const backToInvite = inviteBase(saved);
      nav(backToInvite || '/home');
      clearReturnTo();
    },
    [backendUrl, setToken]
  );

  /** EMAIL/PASSWORD FLOWS */
  const loginWithEmail = useCallback(
    async (payload: AuthPayload): Promise<AuthResponse> => {
      const resp = await api.login(backendUrl, payload);
      if (resp?.token) {
        const saved = readReturnTo();
        const backToInvite = inviteBase(saved);

        setToken(resp.token);

        // Safely persist profile if the API included it (no unsafe Record cast)
        const maybeProfile = (resp as unknown as { profile?: unknown }).profile;
        if (typeof maybeProfile !== 'undefined') {
          setProfile?.(maybeProfile ?? null);
        }

        clearAuthFlags();
        if (backToInvite) {
          nav(backToInvite);
        } else {
          nav(nextAfterAuth('/home'));
        }
      }
      return resp;
    },
    [backendUrl, setToken, setProfile]
  );

  const registerWithEmail = useCallback(
    async (payload: RegisterPayload): Promise<AuthResponse> => {
      const resp = await api.register(backendUrl, payload);
      if (resp?.token) {
        const saved = readReturnTo();
        const backToInvite = inviteBase(saved);

        setToken(resp.token);

        const maybeProfile = (resp as unknown as { profile?: unknown }).profile;
        if (typeof maybeProfile !== 'undefined') {
          setProfile?.(maybeProfile ?? null);
        }

        clearAuthFlags();
        if (backToInvite) {
          nav(backToInvite);
        } else {
          nav(nextAfterAuth('/home'));
        }
      }
      return resp;
    },
    [backendUrl, setToken, setProfile]
  );

  const sendResetOTP = useCallback(
    async (email: string): Promise<AuthResponse> => {
      return api.requestOTP(backendUrl, email);
    },
    [backendUrl]
  );

  const resetPasswordWithOTP = useCallback(
    async (email: string, otp: string, newPassword: string): Promise<AuthResponse> => {
      return api.verifyOTP(backendUrl, email, otp, newPassword);
    },
    [backendUrl]
  );

  /** Logout */
  const logout = useCallback(() => {
    setToken(''); // ShopContext treats empty as logged out
    setProfile?.(null);
    clearAuthFlags();
    clearReturnTo();
    nav('/login'); // -> 'Login' on native
  }, [setToken, setProfile]);

  /** Helpers */
  const isRoleModalNeeded = useCallback(() => getNeedRoleFlag(), []);
  const getPendingJwtForDebug = useCallback(() => getPendingJwt(), []);

  /** DELETE ACCOUNT */
  const handleDeleteAccount = useCallback(async () => {
    if (!backendUrl || !token) {
      setDeleteError(new Error('Missing API base or auth token.'));
      return;
    }

    const base = backendUrl.replace(/\/+$/, '');
    const hit = async (path: string) =>
      fetch(`${base}${path}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

    try {
      setIsDeleting(true);
      setDeleteError(null);

      // try /me first, then /account
      let res = await hit('/api/user/me');
      if (res.status === 404) {
        res = await hit('/api/user/account');
      }
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { message?: string };
          if (typeof j?.message === 'string') message = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      logout();
      nav('/'); // -> 'Landing' on native
      alertFn?.('Your account was deleted.');
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e : new Error('Delete failed'));
    } finally {
      setIsDeleting(false);
    }
  }, [backendUrl, token, logout, alertFn]);

  return {
    // Google
    handleGoogleLoginSuccess,
    handleGoogleLoginFailure,
    completeRole,

    // Email/password
    loginWithEmail,
    registerWithEmail,
    sendResetOTP,
    resetPasswordWithOTP,

    // Session
    logout,

    // UI helpers
    isRoleModalNeeded,
    getPendingJwt: getPendingJwtForDebug,
    clearAuthFlags,

    // Deletion
    handleDeleteAccount,
    isDeleting,
    deleteError,
  };
};

export default useAuth;
