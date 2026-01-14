import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useShopContext } from '@mytutorapp/shared/context/ShopContext';
import { adminVerifyCertification } from '@mytutorapp/shared/api/certificationApi';
import { useAdminCertifications } from '@mytutorapp/shared/hooks';

const STATUS_TABS = ['Pending', 'Verified', 'All'] as const;

export default function Certifications() {
  const { backendUrl, adminToken, token } = useShopContext();
  const authToken = adminToken || token || '';

  const {
    rows,
    loading,
    error,
    total,
    status,
    setStatus,
    query,
    setQuery,
    limit,
    offset,
    setOffset,
    refresh,
    updateCertification,
  } = useAdminCertifications({ initialStatus: 'Pending', limit: 20 });

  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, setQuery, setOffset]);

  useEffect(() => {
    setOffset(0);
  }, [status, setOffset]);

  const page = Math.floor(offset / limit) + 1;
  const totalPages = total ? Math.max(1, Math.ceil(total / limit)) : undefined;

  const onVerify = async (profileId: number) => {
    if (!backendUrl || !authToken) return;
    updateCertification(profileId, {
      status: 'Verified',
      verified_at: new Date().toISOString(),
      profile_certified: true,
    });
    toast.success('Certification verified');
    try {
      await adminVerifyCertification(backendUrl, authToken, profileId);
      await refresh();
    } catch (err: any) {
      const msg = err?.message || 'Failed to verify certification';
      toast.error(msg);
      await refresh();
    }
  };

  const hasRows = rows.length > 0;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white">Certifications</h1>
        <p className="text-sm text-mutedGray dark:text-darkTextSecondary">
          Review and verify tutor certification documents.
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => {
            const active = status === tab;
            return (
              <button
                key={tab}
                onClick={() => setStatus(tab)}
                className={`px-3 py-1.5 rounded-full text-sm border transition ${
                  active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 text-gray-600 dark:text-darkTextSecondary dark:border-darkCard hover:bg-gray-50 dark:hover:bg-white/10'
                }`}
              >
                {tab}
              </button>
            );
          })}

          <div className="ml-auto">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tutor or profile id…"
              className="w-64 rounded-lg border border-gray-300 dark:border-darkCard bg-white dark:bg-darkCard px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-darkCard bg-white dark:bg-[#0f1821]">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-darkCard text-xs uppercase text-gray-500 dark:text-darkTextSecondary">
              <tr>
                <th className="px-4 py-3 text-left">Tutor</th>
                <th className="px-4 py-3 text-left">Profile ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Submitted</th>
                <th className="px-4 py-3 text-left">Documents</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Loading certifications…
                  </td>
                </tr>
              )}
              {!loading && !hasRows && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No certifications found.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 dark:border-white/10">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-white">
                      {row.profile_name || row.tutor_name || 'Tutor'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-darkTextSecondary">
                      {row.profile_id}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          row.status === 'Verified'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-darkTextSecondary">
                      {row.submitted_at
                        ? new Date(row.submitted_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.documents?.length ? (
                        <ul className="space-y-1">
                          {row.documents.map((doc, i) => (
                            <li key={`${row.id}-doc-${i}`}>
                              <a
                                href={doc}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-600 hover:underline"
                              >
                                Document {i + 1}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-gray-400">No documents</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === 'Pending' ? (
                        <button
                          onClick={() => onVerify(Number(row.profile_id))}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        >
                          Verify
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">Verified</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-darkTextSecondary">
          <span>
            Page {page}
            {totalPages ? ` of ${totalPages}` : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-darkCard disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={typeof totalPages === 'number' ? page >= totalPages : rows.length < limit}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-darkCard disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
