import { useCallback, useEffect, useMemo, useState } from 'react';

type Status = 'Pending' | 'Verified' | 'All';

export type AdminCertificationRow = {
  id: number;
  profile_id: number;
  profile_name?: string | null;
  tutor_name?: string | null;
  status: Status | string;
  submitted_at?: string | null;
  verified_at?: string | null;
  profile_certified?: boolean;
  documents?: string[];
};

type Options = {
  initialStatus?: Status;
  limit?: number;
};

function backendBase() {
  return String(
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
      'http://localhost:4000',
  ).replace(/\/+$/, '');
}

function tokenFromStorage() {
  try {
    return localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('ekazi_web_token') || '';
  } catch {
    return '';
  }
}

export default function useAdminCertifications(options: Options = {}) {
  const [rows, setRows] = useState<AdminCertificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>(options.initialStatus || 'Pending');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = options.limit || 20;

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('status', status);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    if (query) p.set('q', query);
    return p;
  }, [status, limit, offset, query]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = tokenFromStorage();
      const response = await fetch(backendBase() + '/api/admin/certifications?' + params.toString(), {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (response.status === 404 || response.status === 501) {
        setRows([]);
        setTotal(0);
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || data?.error || 'Failed to load certifications');
      const nextRows = data?.rows || data?.certifications || [];
      setRows(nextRows);
      setTotal(Number(data?.total || data?.count || nextRows.length || 0));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load certifications';
      setError(message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateCertification = useCallback((profileId: number, patch: Partial<AdminCertificationRow>) => {
    setRows((prev) => prev.map((row) => (Number(row.profile_id) === Number(profileId) ? { ...row, ...patch } : row)));
  }, []);

  return {
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
  };
}