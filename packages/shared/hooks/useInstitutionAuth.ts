import { useShopContext } from '@mytutorapp/shared/context';
import {
  institutionLogin,
  institutionRegister,
  institutionGoogleLogin,
  institutionRequestReset,
  institutionVerifyReset,
  type InstitutionLoginResp,
  type InstitutionGoogleResp,
} from '@mytutorapp/shared/api/institutionAuth';
import { bootstrapOrg, getMyOrgOrBootstrap } from '@mytutorapp/shared/api/orgApi';

type AuthResp = InstitutionLoginResp | InstitutionGoogleResp;

type Options = {
  alertFn?: (msg: string) => void;
  navigateFn?: (dest?: string) => void;
  onAuthMeta?: (meta: {
    mustChangePassword: boolean;
    dest: string;
    token: string;
    raw?: AuthResp;
  }) => void | Promise<void>;
};

const hasWindow = () => typeof window !== 'undefined';
const MUST_CHANGE_KEY = 'org:mustChangePassword';

const computeMustChange = (resp: AuthResp | undefined): boolean =>
  resp?.mustChangePassword === true ||
  (resp as any)?.must_change_password === true ||
  (resp as any)?.data?.mustChangePassword === true;

// ── Safe storage helpers (web only) ─────────────────────────────────────────
const safeSetLocal = (k: string, v: string) => {
  if (!hasWindow()) return;
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const safeRemoveLocal = (k: string) => {
  if (!hasWindow()) return;
  try {
    localStorage.removeItem(k);
  } catch {}
};
const safeGetSession = (k: string): string => {
  if (!hasWindow()) return '';
  try {
    return sessionStorage.getItem(k) || '';
  } catch {
    return '';
  }
};
const safeSetSession = (k: string, v: string) => {
  if (!hasWindow()) return;
  try {
    sessionStorage.setItem(k, v);
  } catch {}
};
const safeRemoveSession = (k: string) => {
  if (!hasWindow()) return;
  try {
    sessionStorage.removeItem(k);
  } catch {}
};

// Prefer hard reload so providers (e.g., useOrg) re-read storage
const hardNavigate = (target: string) => {
  if (!hasWindow()) return;
  safeRemoveSession('auth:returnTo');
  safeRemoveSession('auth:returnTo:org');
  window.location.assign(target);
};

export default function useInstitutionAuth(opts: Options = {}) {
  const { backendUrl, setOrgToken } = useShopContext();
  const alertFn = opts.alertFn ?? ((m: string) => console.log('[inst-auth]', m));

  const readReturnTo = (): string =>
    safeGetSession('auth:returnTo') ||
    safeGetSession('auth:returnTo:org') ||
    '/org/profile';

  const applyOrgToken = async (t?: string, meta?: { mustChangePassword?: boolean; rawResp?: AuthResp }) => {
    if (!t) return;

    // 0) Clear stale keys first (web)
    safeRemoveLocal('org:activeId');
    safeRemoveLocal('org:role');
    safeRemoveLocal('auth:orgId');

    // 🔐 Web-only: remember must-change in sessionStorage (native handles in screen)
    if (hasWindow()) {
      if (meta?.mustChangePassword) safeSetSession(MUST_CHANGE_KEY, '1');
      else safeRemoveSession(MUST_CHANGE_KEY);
    }

    // 1) Put org JWT into context
    await setOrgToken?.(t);

    // 2) Flip into org UI mode (web)
    safeSetLocal('auth:mode', 'org');

    // 3) Ensure org exists AND fetch my_role
    try {
      try {
        await bootstrapOrg(backendUrl, t);
      } catch (e: unknown) {
        console.warn('[inst-auth] bootstrapOrg non-fatal:', e);
      }

      const org = await getMyOrgOrBootstrap(backendUrl, t);

      if (org?.id) {
        safeSetLocal('org:activeId', org.id);
        safeSetLocal('auth:orgId', org.id);
      }
      if (org?.my_role) {
        safeSetLocal('org:role', String(org.my_role).toLowerCase());
      }
    } catch (e: unknown) {
      console.warn('[inst-auth] getMyOrgOrBootstrap failed:', e);
    }

    // 4) Choose destination
    const baseTarget = readReturnTo() || '/org/profile';
    const dest = meta?.mustChangePassword ? '/org/change-password' : baseTarget;

    // ✅ Let native screen persist anything before navigation
    try {
      await opts.onAuthMeta?.({
        mustChangePassword: !!meta?.mustChangePassword,
        dest,
        token: t,
        raw: meta?.rawResp,
      });
    } catch {}

    try {
      opts.navigateFn?.(dest);
    } finally {
      hardNavigate(dest); // no-op on native
    }
  };

  return {
    async loginWithEmail({ email, password }: { email: string; password: string }): Promise<InstitutionLoginResp> {
      const res = await institutionLogin(backendUrl, email, password);
      if (!res.success || !res.token) throw new Error(res.message || 'Login failed');

      const mustChange = computeMustChange(res);
      await applyOrgToken(res.token, { mustChangePassword: mustChange, rawResp: res });

      return res;
    },

    async registerWithEmail({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }): Promise<InstitutionLoginResp> {
      const res = await institutionRegister(backendUrl, name, email, password);
      if (!res.success || !res.token) throw new Error(res.message || 'Sign up failed');

      const mustChange = computeMustChange(res);
      await applyOrgToken(res.token, { mustChangePassword: mustChange, rawResp: res });

      return res;
    },

    async handleGoogleLoginSuccess(
      googleCredential: string,
      prefName?: string
    ): Promise<InstitutionGoogleResp> {
      const res = await institutionGoogleLogin(backendUrl, googleCredential, prefName);
      if (!res.success || !res.token) throw new Error(res.message || 'Google sign-in failed');

      const mustChange = computeMustChange(res);
      await applyOrgToken(res.token, { mustChangePassword: mustChange, rawResp: res });

      return res;
    },

    handleGoogleLoginFailure(err?: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      alertFn(msg);
    },

    async sendResetOTP(email: string) {
      const r = await institutionRequestReset(backendUrl, email);
      if (!r?.success) throw new Error(r?.message || 'Failed to send OTP');
      return r;
    },

    async resetPasswordWithOTP(email: string, otp: string, newPassword: string) {
      const r = await institutionVerifyReset(backendUrl, email, otp, newPassword);
      if (!r?.success) throw new Error(r?.message || 'Failed to reset password');
      return r;
    },
  };
}
