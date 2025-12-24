import { useCallback, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgAttendanceReport, OrgAttendanceSession } from '@mytutorapp/shared/types';
import {
  createAttendanceSession,
  deleteAttendanceSession,
  downloadAttendanceReportCsv,
  getAttendanceReport,
  getAttendanceSession,
  listAttendanceSessions,
  upsertAttendanceEntries,
  updateAttendanceSession,
  clearAttendanceEntries,
} from '@mytutorapp/shared/api/orgEngagementApi';

function apiBaseFromEnv() {
  return (process.env.EXPO_PUBLIC_API_URL ||
    process.env.VITE_API_URL ||
    process.env.API_URL ||
    '').replace(/\/+$/, '');
}

interface UseOrgAttendanceOptions {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgAttendance(opts?: UseOrgAttendanceOptions) {
  const shop = useShopContext() as any;

  const ctxBackendUrl = shop?.backendUrl;
  const ctxToken = shop?.token;
  const ctxOrgToken = shop?.orgToken;
  const ctxOrgId = shop?.orgId;

  // ✅ stable normalized backendUrl
  const backendUrl = useMemo(() => {
    const raw = (opts?.backendUrl ?? ctxBackendUrl ?? apiBaseFromEnv() ?? '').trim();
    return raw ? raw.replace(/\/+$/, '') : '';
  }, [opts?.backendUrl, ctxBackendUrl]);

  // ✅ org pages should prefer orgToken (stable)
  const token = useMemo(() => {
    return opts?.token ?? ctxOrgToken ?? ctxToken ?? null;
  }, [opts?.token, ctxOrgToken, ctxToken]);

  const orgId = useMemo(() => {
    return opts?.orgId ?? ctxOrgId ?? null;
  }, [opts?.orgId, ctxOrgId]);

  const [sessions, setSessions] = useState<OrgAttendanceSession[]>([]);
  const [report, setReport] = useState<OrgAttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ✅ derived readiness (no setState, no effects)
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!backendUrl) m.push('backendUrl');
    if (!token) m.push('token/orgToken');
    if (!orgId) m.push('orgId');
    return m;
  }, [backendUrl, token, orgId]);

  const ready = missing.length === 0;

  // ✅ stable ensureOrThrow (don’t close over array deps in every callback)
  const ensureOrThrow = useCallback(
    (action: string) => {
      if (!ready) {
        // join here so consumers don’t accidentally depend on array identity
        throw new Error(`[Attendance] ${action} blocked: missing ${missing.join(', ')}`);
      }
    },
    [ready, missing],
  );

  const fetchSessions = useCallback(
    async (params?: Record<string, unknown>) => {
      ensureOrThrow('fetchSessions');
      setLoading(true);
      try {
        const res = await listAttendanceSessions(backendUrl, token as string, orgId as string, params);
        setSessions(Array.isArray(res) ? res : []);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const fetchSession = useCallback(
    async (sessionId: number) => {
      ensureOrThrow('fetchSession');
      return getAttendanceSession(backendUrl, token as string, orgId as string, sessionId);
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const saveSession = useCallback(
    async (payload: Partial<OrgAttendanceSession>) => {
      ensureOrThrow('saveSession');
      setSaving(true);
      try {
        const created = await createAttendanceSession(backendUrl, token as string, orgId as string, payload);
        // ✅ prepend if shape matches
        if (created) setSessions((prev) => [created as any, ...(prev || [])]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const editSession = useCallback(
    async (sessionId: number, payload: Partial<OrgAttendanceSession>) => {
      ensureOrThrow('editSession');
      setSaving(true);
      try {
        const updated = await updateAttendanceSession(backendUrl, token as string, orgId as string, sessionId, payload);
        if (updated) {
          setSessions((prev) => (prev || []).map((s) => ((s as any)?.id === sessionId ? (updated as any) : s)));
        }
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const removeSession = useCallback(
    async (sessionId: number) => {
      ensureOrThrow('removeSession');
      setSaving(true);
      try {
        await deleteAttendanceSession(backendUrl, token as string, orgId as string, sessionId);
        setSessions((prev) => (prev || []).filter((s) => (s as any)?.id !== sessionId));
      } finally {
        setSaving(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const clearEntries = useCallback(
    async (sessionId: number) => {
      ensureOrThrow('clearEntries');
      setSaving(true);
      try {
        return await clearAttendanceEntries(backendUrl, token as string, orgId as string, sessionId);
      } finally {
        setSaving(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const saveEntries = useCallback(
    async (sessionId: number, entries: { learner_id: string; status: string; note?: string | null }[]) => {
      ensureOrThrow('saveEntries');
      setSaving(true);
      try {
        return await upsertAttendanceEntries(backendUrl, token as string, orgId as string, sessionId, { entries });
      } finally {
        setSaving(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const fetchReport = useCallback(
    async (params?: Record<string, unknown>) => {
      ensureOrThrow('fetchReport');
      setLoading(true);
      try {
        const data = await getAttendanceReport(backendUrl, token as string, orgId as string, params);
        setReport(data || null);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  const downloadReportCsv = useCallback(
    async (params?: Record<string, unknown>) => {
      ensureOrThrow('downloadReportCsv');

      const blob = await downloadAttendanceReportCsv(backendUrl, token as string, orgId as string, params);

      // ✅ browser download helper
      if (typeof document !== 'undefined' && blob) {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'attendance-report.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }

      return blob;
    },
    [ensureOrThrow, backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    ready,
    missing,

    sessions,
    report,
    loading,
    saving,

    fetchSessions,
    fetchSession,
    saveSession,
    editSession,
    removeSession,
    saveEntries,
    fetchReport,
    clearEntries,
    downloadReportCsv,
  };
}
