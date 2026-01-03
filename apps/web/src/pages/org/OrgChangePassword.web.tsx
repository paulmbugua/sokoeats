import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useShopContext } from '@mytutorapp/shared/context';
import { institutionChangePassword } from '@mytutorapp/shared/api/institutionAuth';

const MUST_CHANGE_KEY = 'org:mustChangePassword';

const OrgChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { backendUrl, orgToken } = useShopContext() as any;
  const queryClient = useQueryClient();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Mirror native: decide where to go after success
  // Also defend against "from" accidentally being change-password itself.
  const safeFrom = useMemo(() => {
    const rawFrom = (location.state as any)?.from;
    const ok =
      typeof rawFrom === 'string' &&
      rawFrom.startsWith('/org') &&
      !rawFrom.includes('/org/change-password');

    return ok ? rawFrom : '/org';
  }, [location.state]);

  if (!orgToken) {
    return <p className="p-6 text-sm text-red-500">Session expired. Please log in again.</p>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    try {
      setBusy(true);

      // 1) Change password
      await institutionChangePassword(backendUrl, orgToken, currentPassword, newPassword);

      /**
       * 2) IMPORTANT:
       * Do NOT "remove" the must-change flag here.
       * Instead, explicitly set it to "0" so OrgHomeRouter trusts it over stale useOrg().
       * (OrgHomeRouter treats '0'/'false' as allow, '1'/'true' as force.)
       */
      try {
        sessionStorage.setItem(MUST_CHANGE_KEY, '0');
        localStorage.setItem(MUST_CHANGE_KEY, '0');

        // Clear any old deep-link after we've successfully handled the forced flow
        sessionStorage.removeItem('auth:returnTo');
      } catch {
        /* ignore */
      }

      // 3) Optimistically flip cached membership so guards stop bouncing you
      queryClient.setQueryData(['orgMembership', backendUrl, orgToken], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          mustChangePassword: false,
          must_change_password: false,
        };
      });

      // 4) Kick off refetches, but NEVER block navigation on them
      void Promise.allSettled([
        queryClient.refetchQueries({
          queryKey: ['orgMembership', backendUrl, orgToken],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: ['orgEntity', backendUrl, orgToken],
          exact: true,
        }),
      ]);

      setSuccess(true);

      // 5) Mirror native: redirect after a short delay
      setTimeout(() => {
        navigate(safeFrom, { replace: true });

        // If anything still fights navigation, hard redirect (rare after fixes):
        // window.location.replace(safeFrom);
      }, 800);
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white/90 dark:bg-[#0f1821] shadow-lg ring-1 ring-gray-200 dark:ring-darkCard p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-center mb-2">Update your password</h1>
        <p className="text-xs text-center text-gray-500 dark:text-darkTextSecondary mb-4">
          For security, your institution asked you to change the temporary password before using the
          portal.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 px-3 py-2 text-sm">
            Password updated. Redirecting…
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            className="input"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            className="input"
            placeholder="New password (min. 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <input
            type="password"
            className="input"
            placeholder="Confirm new password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={busy}
            className={`inline-flex w-full items-center justify-center rounded-xl h-11 px-5 bg-indigo-600 text-white font-semibold shadow-sm hover:shadow transition active:translate-y-[1px] ${
              busy ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {busy ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default OrgChangePassword;
