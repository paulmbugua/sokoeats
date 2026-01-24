import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { RefreshCw, Shield, Trash2, Key, UserCog } from 'lucide-react';

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
};

const ROLES: Role[] = ['student', 'tutor', 'admin', 'superadmin'];

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
      if (!data?.success) throw new Error('Request failed');
      setRows(data.users || []);
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message || (e as Error)?.message || 'Failed to fetch users';
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
    const t = setTimeout(() => void fetchUsers(), 300);
    return () => clearTimeout(t);
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
      const { data } = await axios.post<{ success: boolean; user: AdminUser }>(
        `${base}/api/admin/users/role`,
        { userId: u.id, role },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      if (!data.success) throw new Error('Failed to set role');
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, role } : r)));
      toast.success(`Role updated → ${role}`);
    });

  const addTokens = (u: AdminUser, delta: number) =>
    withBusy(u.id, async () => {
      const { data } = await axios.post<{ success: boolean; tokens: number }>(
        `${base}/api/admin/users/tokens`,
        { userId: u.id, op: delta >= 0 ? 'add' : 'sub', amount: Math.abs(delta) },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      if (!data.success) throw new Error('Failed to adjust tokens');
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, tokens: data.tokens } : r)));
      toast.success(`${delta >= 0 ? 'Added' : 'Removed'} ${Math.abs(delta)} token(s)`);
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
      const { data } = await axios.post<{ success: boolean; tokens: number }>(
        `${base}/api/admin/users/tokens`,
        { userId: u.id, op: 'set', amount: value },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      if (!data.success) throw new Error('Failed to set tokens');
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, tokens: data.tokens } : r)));
      toast.success(`Tokens set → ${value}`);
    })();
  };

  const resetPassword = (u: AdminUser) =>
    withBusy(u.id, async () => {
      const { data } = await axios.post<{ success: boolean }>(
        `${base}/api/admin/users/${u.id}/reset-password`,
        {},
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      if (!data.success) throw new Error('Failed to trigger reset');
      toast.success(`OTP sent to ${u.email}`);
    });

  const impersonate = (u: AdminUser) =>
    withBusy(u.id, async () => {
      if (!window.confirm(`Impersonate ${u.email}? You will stop being admin in this tab.`)) return;
      const { data } = await axios.post<{ success: boolean; token: string }>(
        `${base}/api/admin/users/${u.id}/impersonate`,
        {},
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );
      if (!data.success || !data.token) throw new Error('Failed to impersonate');
      await loginConsumer(data.token); // switch this tab to the user's token
      toast.info(`Now impersonating ${u.email}`);
    });

  const deleteUser = (u: AdminUser) =>
    withBusy(u.id, async () => {
      if (!window.confirm(`Permanently delete ${u.email} and their profile?`)) return;
      await axios.delete(`${base}/api/admin/users/${u.id}`, {
        headers: authHeaders,
      });
      setRows((prev) => prev.filter((r) => r.id !== u.id));
      toast.success('User deleted');
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="app-heading">Users</h3>
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder="Search email or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="chip flex items-center gap-2"
            onClick={() => void fetchUsers()}
            disabled={loading || !authToken}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
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

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 dark:bg-white/10">
            <tr>
              <th className="text-left p-3">ID</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Tokens</th>
              <th className="text-left p-3">Profile</th>
              <th className="text-left p-3 w-[1%] whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-gray-200 dark:border-white/10 align-middle">
                <td className="p-3">{u.id}</td>
                <td className="p-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{u.email}</span>
                    {u.name ? (
                      <span className="text-xs text-mutedGray dark:text-darkTextSecondary">
                        {u.name}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <select
                      className="input py-1 px-2"
                      value={u.role ?? ''}
                      onChange={(e) => void changeRole(u, (e.target.value || null) as Role)()}
                      disabled={busyId === u.id || !authToken}
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
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{u.tokens}</span>
                    <button
                      className="chip"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => void addTokens(u, +10)()}
                    >
                      +10
                    </button>
                    <button
                      className="chip"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => void addTokens(u, -10)()}
                    >
                      –10
                    </button>
                    <button
                      className="chip"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => setTokensExact(u)}
                    >
                      set
                    </button>
                  </div>
                </td>
                <td className="p-3">
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
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="chip flex items-center gap-1"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => void resetPassword(u)()}
                      title="Send password reset OTP"
                    >
                      <Key className="w-4 h-4" /> Reset
                    </button>
                    <button
                      className="chip flex items-center gap-1"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => void impersonate(u)()}
                      title="Impersonate this user"
                    >
                      <UserCog className="w-4 h-4" /> Impersonate
                    </button>
                    <button
                      className="chip flex items-center gap-1 text-red-600"
                      disabled={busyId === u.id || !authToken}
                      onClick={() => void deleteUser(u)()}
                      title="Delete user & profile"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
        Tip: use the search box for email or name. Role changes and token edits are saved
        immediately.
      </p>
    </div>
  );
}
