/* eslint-disable no-console */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
  useRef,
} from 'react';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import useAppQuery from '../hooks/useAppQuery';
import type {
  ShopContextValue as BaseShopContextValue,
  Profile,
  UserRole,
} from '@mytutorapp/shared/types/ShopContextTypes';

interface ShopContextProviderProps {
  children: ReactNode;
  backendUrl: string;
  storage?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
  };
  navigateFn?: (destination: string) => void;
}

interface ApiProfileMeResponse {
  profileExists: boolean;
  profile: Profile;
}

interface ApiUserMeResponse {
  email?: string | null;
  tokens?: number;
  userId?: string | number | null;
  role?: string | null;
}

/** Augment your existing context type with org/admin tokens and shared axios */
export type ShopContextValue = BaseShopContextValue & {
  /** Institution JWT (separate from user token) */
  orgToken: string;
  /** Set/Clear institution JWT (persists via storage when available) */
  setOrgToken: (t: string) => Promise<void> | void;
  /** Shared axios instance with guards & baseURL */
  http: AxiosInstance;
  /** Explicitly logout of institution session only */
  orgLogout: () => Promise<void>;

  /** NEW: admin session (separate JWT for /api/admin/*) */
  adminToken: string;
  setAdminToken: (t: string) => Promise<void> | void;
  adminLogout: () => Promise<void>;
};

export const ShopContext = createContext<ShopContextValue | undefined>(undefined);

const normalizeRole = (r: unknown): UserRole => {
  if (typeof r !== 'string') return null;
  const v = r.toLowerCase();
  if (v === 'student' || v === 'tutor' || v === 'admin' || v === 'superadmin') {
    return v as UserRole;
  }
  return null;
};

/** single-flight guard to avoid storms when many requests 401 at once */
let autoLogoutInFlight = false;
async function runLogoutOnce(fn: () => Promise<void>) {
  if (autoLogoutInFlight) return;
  autoLogoutInFlight = true;
  try {
    await fn();
  } finally {
    setTimeout(() => {
      autoLogoutInFlight = false;
    }, 300);
  }
}

/** Attach auth guards to an axios instance (supports user vs org vs admin sessions) */
function attachAuthGuards(
  http: AxiosInstance,
  getTokens: () => { token: string; orgToken: string; adminToken: string },
  onUserAuthFail: () => Promise<void>,
  onOrgAuthFail: () => Promise<void>,
  onAdminAuthFail: () => Promise<void>
) {
  http.interceptors.request.use((cfg) => {
    const { token, orgToken, adminToken } = getTokens();

    // compute pathname safely
    let path = '';
    try {
      const full = axios.getUri(cfg);
      path = full.startsWith('http') ? new URL(full).pathname : ((cfg.url ?? '') as string);
    } catch {
      path = (cfg.url ?? '') as string;
    }

    const wantsAdmin = path.startsWith('/api/admin');
    const wantsOrg = path.startsWith('/api/org'); // matches /api/org and /api/orgs
    const session = wantsAdmin ? 'admin' : wantsOrg ? 'org' : 'user';

    const useToken = wantsAdmin ? adminToken : wantsOrg ? orgToken : token;

    cfg.headers = cfg.headers ?? {};
    if (useToken) (cfg.headers as any).Authorization = `Bearer ${useToken}`;
    else delete (cfg.headers as any).Authorization;

    // scrub any stray custom auth header (prevents CORS preflight errors)
    if ((cfg.headers as any)['x-auth-token']) {
      delete (cfg.headers as any)['x-auth-token'];
    }

    (cfg as any).__session = session; // tell response interceptor which session it was
    return cfg;
  });

  http.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const status = error?.response?.status;
      let path = '';
      try {
        const full = axios.getUri(error?.config || {});
        path = full.startsWith('http')
          ? new URL(full).pathname
          : ((error?.config?.url ?? '') as string);
      } catch {
        path = (error?.config?.url ?? '') as string;
      }

      const session = (error?.config as any)?.__session as 'user' | 'org' | 'admin' | undefined;

      // Admin token will 401 on user endpoints; ignore those 401s.
      const ignoreUserHydrate401 =
        session === 'admin' && (path === '/api/user/me' || path === '/api/profile/me');

      if ((status === 401 || status === 403) && !ignoreUserHydrate401) {
        if (session === 'admin') await onAdminAuthFail();
        else if (session === 'org') await onOrgAuthFail();
        else await onUserAuthFail();
      }
      return Promise.reject(error);
    }
  );
}

const ShopContextProvider: React.FC<ShopContextProviderProps> = ({
  children,
  backendUrl,
  storage,
  navigateFn,
}) => {
  const queryClient = useQueryClient();

  // ── Local state ───────────────────────────────────────────────────────────
  const [token, setTokenState] = useState<string>(''); // user (student/tutor) token
  const [orgToken, setOrgTokenState] = useState<string>(''); // institution token
  const [adminToken, setAdminTokenState] = useState<string>(''); // admin token
  const [initializing, setInitializing] = useState<boolean>(true);

  const [language, setLanguage] = useState<'EN' | 'FR'>('EN');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tokens, setTokens] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>(null);

  // ---- Shared axios instance (one per provider) ----
  const httpRef = useRef<AxiosInstance>(
    axios.create({
      baseURL: backendUrl,
      timeout: 20000,
    })
  );

  // Keep baseURL updated if prop changes (rare)
  useEffect(() => {
    httpRef.current.defaults.baseURL = backendUrl;
  }, [backendUrl]);

  // Keep the latest tokens available to interceptors
  const tokensRef = useRef<{ token: string; orgToken: string; adminToken: string }>({
    token: '',
    orgToken: '',
    adminToken: '',
  });
  useEffect(() => {
    tokensRef.current.token = token;
  }, [token]);
  useEffect(() => {
    tokensRef.current.orgToken = orgToken;
  }, [orgToken]);
  useEffect(() => {
    tokensRef.current.adminToken = adminToken;
  }, [adminToken]);

  // ── Logout helpers ────────────────────────────────────────────────────────
  const doAutoUserLogout = useCallback(async () => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
    } catch {}
    setTokenState('');
    setUserEmail(null);
    setUserId(null);
    setRole(null);
    try {
      await storage?.removeItem('token');
      await storage?.removeItem('role');
    } catch {}
    delete httpRef.current.defaults.headers.common.Authorization;
    if (navigateFn) navigateFn('/login');
  }, [navigateFn, queryClient, storage]);

  const doAutoOrgLogout = useCallback(async () => {
    setOrgTokenState('');
    try {
      await storage?.removeItem('orgToken');
      await storage?.removeItem('auth:mode');
    } catch {}
  }, [storage]);

  const doAutoAdminLogout = useCallback(async () => {
    setAdminTokenState('');
    try {
      await storage?.removeItem('adminToken');
    } catch {}
    // No redirect; admin app can handle route guards itself
  }, [storage]);

  const orgLogout = useCallback(async (): Promise<void> => {
    await runLogoutOnce(doAutoOrgLogout);
  }, [doAutoOrgLogout]);

  const adminLogout = useCallback(async (): Promise<void> => {
    await runLogoutOnce(doAutoAdminLogout);
  }, [doAutoAdminLogout]);

  // Attach guards once
  useEffect(() => {
    attachAuthGuards(
      httpRef.current,
      () => tokensRef.current,
      () => runLogoutOnce(doAutoUserLogout),
      () => runLogoutOnce(doAutoOrgLogout),
      () => runLogoutOnce(doAutoAdminLogout)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist / load tokens & role once ─────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [t, r, ot, at] = await Promise.all([
          storage?.getItem('token'),
          storage?.getItem('role'),
          storage?.getItem('orgToken'),
          storage?.getItem('adminToken'),
        ]);

        if (t && t.split('.').length === 3) {
          setTokenState(t);
          // default Authorization should be user token only
          httpRef.current.defaults.headers.common.Authorization = `Bearer ${t}`;
        } else if (t) {
          await storage?.removeItem('token');
        }

        if (ot && ot.split('.').length === 3) {
          setOrgTokenState(ot);
        } else if (ot) {
          await storage?.removeItem('orgToken');
        }

        if (at && at.split('.').length === 3) {
          setAdminTokenState(at);
        } else if (at) {
          await storage?.removeItem('adminToken');
        }

        if (r) setRole(normalizeRole(r));
      } finally {
        setInitializing(false);
      }
    })();
  }, [storage]);

  // ── Set / clear user token (writes to storage) ────────────────────────────
  const setToken = useCallback(
    async (newToken: string): Promise<void> => {
      setTokenState(newToken);
      if (newToken) {
        httpRef.current.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        await storage?.setItem('token', newToken);
      } else {
        delete httpRef.current.defaults.headers.common.Authorization;
        await storage?.removeItem('token');
        await storage?.removeItem('role');
      }
    },
    [storage]
  );

  // ── Set / clear institution token (writes to storage) ─────────────────────
  const setOrgToken = useCallback(
    async (newOrgToken: string): Promise<void> => {
      if (typeof newOrgToken !== 'string' || newOrgToken.split('.').length !== 3) {
        console.warn('[ShopContext] setOrgToken ignored non-JWT value');
        return;
      }
      setOrgTokenState(newOrgToken);
      await storage?.setItem('orgToken', newOrgToken);
      await storage?.setItem('auth:mode', 'org').catch(() => {});
    },
    [storage]
  );

  // ── Set / clear admin token (writes to storage) ───────────────────────────
  const setAdminToken = useCallback(
    async (newAdminToken: string): Promise<void> => {
      setAdminTokenState(newAdminToken);
      if (newAdminToken) {
        await storage?.setItem('adminToken', newAdminToken);
      } else {
        await storage?.removeItem('adminToken');
      }
    },
    [storage]
  );

  // Public user logout (does not touch org or admin sessions)
  const logout = useCallback(async (): Promise<void> => {
    await runLogoutOnce(doAutoUserLogout);
  }, [doAutoUserLogout]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'EN' ? 'FR' : 'EN'));
  }, []);

 // ── React Query: fetch /api/profile/me (user profile) ─────────────────────
const isOrgMode = Boolean(orgToken);

const {
  data: queryData,
  isLoading: loadingProfile,
  refetch,
} = useAppQuery<Profile | null, Error>(
  ['profile', token, adminToken, orgToken], // optional add orgToken to key
  async () => {
    const res = await httpRef.current.get<ApiProfileMeResponse>('/api/profile/me');
    return res.data.profileExists ? res.data.profile : null;
  },
  {
    enabled: Boolean(token) && !adminToken && !isOrgMode, // ✅ skip user hydrate in org mode
    retry: false,
  }
);


  const profile: Profile | null = queryData ?? null;

  const refreshProfile = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  // ── Fetch /api/user/me (user details) ─────────────────────────────────────
  const fetchUserDetails = useCallback(async (): Promise<void> => {
    const { data } = await httpRef.current.get<ApiUserMeResponse>('/api/user/me');

    const incomingEmail = data.email ?? null;
    if (incomingEmail !== userEmail) setUserEmail(incomingEmail);

    const incomingTokens = data.tokens ?? 0;
    if (incomingTokens !== tokens) setTokens(incomingTokens);

    const incomingUserId = data.userId != null ? String(data.userId) : null;
    if (incomingUserId !== userId) setUserId(incomingUserId);

    const incomingRole = normalizeRole(data.role ?? null);
    if (incomingRole !== role) setRole(incomingRole);

    // persist role for reloads
    if (storage) {
      if (incomingRole) {
        await storage.setItem('role', incomingRole);
      } else {
        await storage.removeItem('role');
      }
    }
  }, [userEmail, tokens, userId, role, storage]);

  useEffect(() => {
  if (!token || adminToken || isOrgMode) return; // ✅ skip when org logged in
  void fetchUserDetails().catch((e) => console.error(e));
}, [token, adminToken, isOrgMode, fetchUserDetails]);


  const refreshUserDetails = useCallback(async (): Promise<void> => {
    await fetchUserDetails();
  }, [fetchUserDetails]);

  // ── Compose and provide context value ─────────────────────────────────────
  const value = useMemo<ShopContextValue>(
    () => ({
      // existing
      backendUrl,
      token,
      initializing,
      userId,
      language,
      setToken,
      toggleLanguage,
      logout,
      userEmail,
      tokens,
      setTokens,
      loadingProfile,
      profile,
      refreshProfile,
      refreshUserDetails,
      role,

      // org
      orgToken,
      setOrgToken,
      orgLogout,

      // axios
      http: httpRef.current,

      // admin
      adminToken,
      setAdminToken,
      adminLogout,
    }),
    [
      backendUrl,
      token,
      initializing,
      userId,
      language,
      setToken,
      toggleLanguage,
      logout,
      userEmail,
      tokens,
      loadingProfile,
      profile,
      refreshProfile,
      refreshUserDetails,
      role,
      orgToken,
      setOrgToken,
      orgLogout,
      adminToken,
      setAdminToken,
      adminLogout,
    ]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;

};

export const useShopContext = (): ShopContextValue => {
  const ctx = useContext(ShopContext);
  if (!ctx) {
    throw new Error('useShopContext must be used within a ShopContextProvider');
  }
  return ctx;
};

export default ShopContextProvider;
