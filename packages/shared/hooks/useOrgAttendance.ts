import { useCallback, useState } from 'react';
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
} from '@mytutorapp/shared/api/orgEngagementApi';

interface UseOrgAttendanceOptions {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgAttendance(opts?: UseOrgAttendanceOptions) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;
  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [sessions, setSessions] = useState<OrgAttendanceSession[]>([]);
  const [report, setReport] = useState<OrgAttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchSessions = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgAttendanceSession[];
      setLoading(true);
      try {
        const res = await listAttendanceSessions(backendUrl, token as string, orgId as string, params);
        setSessions(res || []);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const fetchSession = useCallback(
    async (sessionId: number) => {
      if (!ensure()) return null;
      return getAttendanceSession(backendUrl, token as string, orgId as string, sessionId);
    },
    [backendUrl, token, orgId],
  );

  const saveSession = useCallback(
    async (payload: Partial<OrgAttendanceSession>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createAttendanceSession(backendUrl, token as string, orgId as string, payload);
        setSessions((prev) => [created, ...prev]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const editSession = useCallback(
    async (sessionId: number, payload: Partial<OrgAttendanceSession>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const updated = await updateAttendanceSession(
          backendUrl,
          token as string,
          orgId as string,
          sessionId,
          payload,
        );
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const removeSession = useCallback(
    async (sessionId: number) => {
      if (!ensure()) return;
      await deleteAttendanceSession(backendUrl, token as string, orgId as string, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    },
    [backendUrl, token, orgId],
  );

  const saveEntries = useCallback(
    async (sessionId: number, entries: { learner_id: string; status: string; note?: string | null }[]) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const res = await upsertAttendanceEntries(backendUrl, token as string, orgId as string, sessionId, { entries });
        return res;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const fetchReport = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return null;
      setLoading(true);
      try {
        const data = await getAttendanceReport(backendUrl, token as string, orgId as string, params);
        setReport(data);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const downloadReportCsv = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return null;
      const blob = await downloadAttendanceReportCsv(backendUrl, token as string, orgId as string, params);
      if (typeof document !== 'undefined') {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'attendance-report.csv';
        link.click();
        window.URL.revokeObjectURL(url);
      }
      return blob;
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
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
    downloadReportCsv,
  };
}
