import { useEffect, useMemo, useState, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { RefreshCw, Shield, Trash2, Key, UserCog, Search } from 'lucide-react';

type Role = 'student' | 'tutor' | 'admin' | 'superadmin' | null;

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  tokens: number;
  hasProfile: boolean;
  profileId: number | null;
};

type ListUsersResponse = {
  success: boolean;
  users: AdminUser[];
  total?: number;
  message?: string;
};

type BasicOk = { success: boolean; message?: string };
type RoleRes = { success: boolean; user?: AdminUser; message?: string };
type TokensRes = { success: boolean; tokens: number; message?: string };
type ImpersonateRes = { success: boolean; token: string; message?: string };

type ApiErrorBody = { message?: string; error?: string };

const ROLES: Role[] = ['student', 'tutor', 'admin', 'superadmin'];

function getAxiosMessage(e: unknown, fallback: string) {
  if (axios.isAxiosError(e)) {
    const ax = e as AxiosError<ApiErrorBody>;
    return ax.response?.data?.message || ax.response?.data?.error || ax.message || fallback;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}

export default function Users() {
  // ⬇️ Prefer adminToken; fall back to normal token for legacy paths
  const { backendUrl, adminToken, token, loginConsumer } = useShopContext();

  const base = useMemo(() => (backendUrl || '').replace(/\/+$/, ''), [backendUrl]);
  const authToken = adminToken || token || '';

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const [rows, setRows] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!base || !authToken) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await axios.get<ListUsersResponse>(`${base}/api/admin/users`, {
        headers: authHeaders,
        params: { q, limit: 100 },
      });
      if (!data?.success) throw new Error(data?.message || 'Request failed');
      setRows(data.users || []);
    } catch (e: unknown) {
      const msg = getAxiosMessage(e, 'Failed to fetch users');
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [base, authToken, authHeaders, q]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // Small debounce on search
  useEffect(() => {
    const t = window.setTimeout(() => void fetchUsers(), 300);
    return () => window.clearTimeout(t);
  }, [q, fetchUsers]);

  const withBusy =
    <R,>(id: number, fn: () => Promise<R>) =>
    async () => {
      setBusyId(id);
      try {
        await fn();
      } finally {
        setBusyId(null);
      }
    };

  const changeRole = (u: AdminUser, role: Role) =>
    withBusy(u.id, async () => {
      if (!role) return;
      try {
        const { data } = await axios.post<RoleRes>(
          `${base}/api/admin/users/role`,
          { userId: u.id, role },
          { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        if (!data.success) throw new Error(data.message || 'Failed to set role');
        setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, role } : r)));
        toast.success(`Role updated → ${role}`);
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to set role'));
      }
    });

  const addTokens = (u: AdminUser, delta: number) =>
    withBusy(u.id, async () => {
      try {
        const { data } = await axios.post<TokensRes>(
          `${base}/api/admin/users/tokens`,
          { userId: u.id, op: delta >= 0 ? 'add' : 'sub', amount: Math.abs(delta) },
          { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        if (!data.success) throw new Error(data.message || 'Failed to adjust tokens');
        setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, tokens: data.tokens } : r)));
        toast.success(`${delta >= 0 ? 'Added' : 'Removed'} ${Math.abs(delta)} token(s)`);
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to adjust tokens'));
      }
    });

  const setTokensExact = (u: AdminUser) => {
    const raw = window.prompt(`Set exact token balance for ${u.email}:`, String(u.tokens));
    if (raw == null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Invalid number');
      return;
    }
    void withBusy(u.id, async () => {
      try {
        const { data } = await axios.post<TokensRes>(
          `${base}/api/admin/users/tokens`,
          { userId: u.id, op: 'set', amount: value },
          { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        if (!data.success) throw new Error(data.message || 'Failed to set tokens');
        setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, tokens: data.tokens } : r)));
        toast.success(`Tokens set → ${value}`);
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to set tokens'));
      }
    })();
  };

  const resetPassword = (u: AdminUser) =>
    withBusy(u.id, async () => {
      try {
        const { data } = await axios.post<BasicOk>(
          `${base}/api/admin/users/${u.id}/reset-password`,
          {},
          { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        if (!data.success) throw new Error(data.message || 'Failed to trigger reset');
        toast.success(`OTP sent to ${u.email}`);
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to trigger reset'));
      }
    });

  const impersonate = (u: AdminUser) =>
    withBusy(u.id, async () => {
      if (!window.confirm(`Impersonate ${u.email}? You will stop being admin in this tab.`)) return;
      try {
        const { data } = await axios.post<ImpersonateRes>(
          `${base}/api/admin/users/${u.id}/impersonate`,
          {},
          { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
        );
        if (!data.success || !data.token) throw new Error(data.message || 'Failed to impersonate');
        await loginConsumer(data.token);
        toast.info(`Now impersonating ${u.email}`);
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to impersonate'));
      }
    });

  const deleteUser = (u: AdminUser) =>
    withBusy(u.id, async () => {
      if (!window.confirm(`Permanently delete ${u.email} and their profile?`)) return;
      try {
        await axios.delete(`${base}/api/admin/users/${u.id}`, { headers: authHeaders });
        setRows((prev) => prev.filter((r) => r.id !== u.id));
        toast.success('User deleted');
      } catch (e: unknown) {
        toast.error(getAxiosMessage(e, 'Failed to delete user'));
      }
    });

  return (
    <div className="space-y-4">
      {/* Header / toolbar (mobile friendly like Receipts) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="app-heading">Users</h3>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-[340px]">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-mutedGray" />
            <input
              className="input pl-8 w-full"
              placeholder="Search email or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <button
            className="chip flex items-center justify-center gap-2"
            onClick={() => void fetchUsers()}
            disabled={loading || !authToken}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Refresh</span>
          </button>
        </div>
      </div>

      {err && <div className="panel p-3 text-sm text-red-500">{err}</div>}
      {loading && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          Loading users…
        </div>
      )}
      {!loading && rows.length === 0 && !err && (
        <div className="panel p-4 text-sm text-mutedGray dark:text-darkTextSecondary">
          No users found.
        </div>
      )}

      {/* Table wrapper (same concept as Receipts) */}
      {!!rows.length && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-gray-100 dark:bg-white/10 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2">ID</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Role</th>
                <th className="text-left p-2">Tokens</th>
                <th className="text-left p-2">Profile</th>
                <th className="text-right p-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((u) => {
                const busy = busyId === u.id || !authToken;
                return (
                  <tr key={u.id} className="border-t border-gray-200 dark:border-white/10 align-top">
                    <td className="p-2">{u.id}</td>

                    <td className="p-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{u.email}</span>
                        {u.name ? (
                          <span className="text-xs text-mutedGray dark:text-darkTextSecondary">
                            {u.name}
                          </span>
                        ) : (
                          <span className="text-xs text-mutedGray dark:text-darkTextSecondary">—</span>
                        )}
                      </div>
                    </td>

                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        <select
                          className="input py-1 px-2"
                          value={u.role ?? ''}
                          onChange={(e) => void changeRole(u, (e.target.value || null) as Role)()}
                          disabled={busy}
                        >
                          <option value="">(none)</option>
                          {ROLES.map((r) => (
                            <option key={r ?? 'none'} value={r ?? ''}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="p-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{u.tokens}</span>
                        <button className="chip" disabled={busy} onClick={() => void addTokens(u, +10)()}>
                          +10
                        </button>
                        <button className="chip" disabled={busy} onClick={() => void addTokens(u, -10)()}>
                          –10
                        </button>
                        <button className="chip" disabled={busy} onClick={() => setTokensExact(u)}>
                          set
                        </button>
                      </div>
                    </td>

                    <td className="p-2">
                      {u.hasProfile && u.profileId ? (
                        <a
                          className="link"
                          href={`/profiles/${u.profileId}`}
                          onClick={(e) => e.preventDefault()}
                          title={`Profile #${u.profileId}`}
                        >
                          #{u.profileId}
                        </a>
                      ) : (
                        <span className="text-xs text-mutedGray dark:text-darkTextSecondary">—</span>
                      )}
                    </td>

                    <td className="p-2">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <button
                          className="chip flex items-center gap-1"
                          disabled={busy}
                          onClick={() => void resetPassword(u)()}
                          title="Send password reset OTP"
                        >
                          <Key className="w-4 h-4" /> <span className="hidden sm:inline">Reset</span>
                        </button>

                        <button
                          className="chip flex items-center gap-1"
                          disabled={busy}
                          onClick={() => void impersonate(u)()}
                          title="Impersonate this user"
                        >
                          <UserCog className="w-4 h-4" />{' '}
                          <span className="hidden sm:inline">Impersonate</span>
                        </button>

                        <button
                          className="chip flex items-center gap-1 text-red-600"
                          disabled={busy}
                          onClick={() => void deleteUser(u)()}
                          title="Delete user & profile"
                        >
                          <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
        Tip: search by email or name. Role changes and token edits are saved immediately. On small
        screens the table scrolls horizontally (like Receipts).
      </p>
    </div>
  );
}
