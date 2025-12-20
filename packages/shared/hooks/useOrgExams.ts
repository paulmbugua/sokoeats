import { useCallback, useState } from 'react';
import type {
  OrgExamConfig,
  OrgExamResultRow,
  OrgExamStudentCard,
  OrgExamAnalyticsRow,
} from '@mytutorapp/shared/types';
import {
  getOrgExamConfig,
  saveOrgExamConfig,
  getOrgExamSheet,
  saveOrgExamSheet,
  getOrgExamStudentCard,
  sendOrgExamStudentCardEmail,
  getOrgExamAnalytics,
  aiTransformOrgExamConfig,
} from '@mytutorapp/shared/api/orgExamsApi';

interface UseOrgExamsProps {
  backendUrl: string;
  token?: string | null;
  orgId?: string;
}

export function useOrgExams({ backendUrl, token, orgId }: UseOrgExamsProps) {
  const [config, setConfig] = useState<OrgExamConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [sheetRows, setSheetRows] = useState<OrgExamResultRow[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [analytics, setAnalytics] = useState<OrgExamAnalyticsRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [configAiLoading, setConfigAiLoading] = useState(false);

  const ensure = () => backendUrl && token && orgId;

  const fetchConfig = useCallback(async () => {
    if (!ensure()) return;
    setConfigLoading(true);
    try {
      const c = await getOrgExamConfig(backendUrl, token!, orgId!);
      setConfig(c);
    } finally {
      setConfigLoading(false);
    }
  }, [backendUrl, token, orgId]);

  const saveConfig = useCallback(
    async (next: OrgExamConfig) => {
      if (!ensure()) return;
      const saved = await saveOrgExamConfig(backendUrl, token!, orgId!, next);
      setConfig(saved); // 🔁 now uses canonical config from server
    },
    [backendUrl, token, orgId]
  );

  const fetchSheet = useCallback(
    async (sessionId: string, classLabel?: string) => {
      if (!ensure()) return;
      setSheetLoading(true);
      try {
        const rows = await getOrgExamSheet(backendUrl, token!, orgId!, sessionId, classLabel);
        setSheetRows(rows);
      } finally {
        setSheetLoading(false);
      }
    },
    [backendUrl, token, orgId]
  );

  const saveSheet = useCallback(
    async (sessionId: string, classLabel: string | undefined, rows: OrgExamResultRow[]) => {
      if (!ensure()) return;
      setSavingSheet(true);
      try {
        await saveOrgExamSheet(backendUrl, token!, orgId!, { sessionId, classLabel, rows });
        setSheetRows(rows);
      } finally {
        setSavingSheet(false);
      }
    },
    [backendUrl, token, orgId]
  );

  const fetchStudentCard = useCallback(
    async (sessionId: string, studentId: number): Promise<OrgExamStudentCard | null> => {
      if (!ensure()) return null;
      return await getOrgExamStudentCard(backendUrl, token!, orgId!, sessionId, studentId);
    },
    [backendUrl, token, orgId]
  );

  const emailStudentCard = useCallback(
    async (sessionId: string, studentId: number, toOverride?: string) => {
      if (!ensure()) return { ok: false } as { ok: boolean; to?: string };
      return await sendOrgExamStudentCardEmail(
        backendUrl,
        token!,
        orgId!,
        sessionId,
        studentId,
        toOverride
      );
    },
    [backendUrl, token, orgId]
  );

  const previewConfigWithAi = useCallback(
    async (current: OrgExamConfig, instructions: string): Promise<OrgExamConfig> => {
      if (!ensure()) return current;
      if (!instructions.trim()) return current;

      setConfigAiLoading(true);
      try {
        const next = await aiTransformOrgExamConfig(backendUrl, token!, orgId!, {
          config: current,
          instructions,
        });
        return next;
      } finally {
        setConfigAiLoading(false);
      }
    },
    [backendUrl, token, orgId]
  );

  const fetchAnalytics = useCallback(
    async (sessionId: string) => {
      if (!ensure()) return;
      setAnalyticsLoading(true);
      try {
        const rows = await getOrgExamAnalytics(backendUrl, token!, orgId!, sessionId);
        setAnalytics(rows);
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [backendUrl, token, orgId]
  );

  // in useOrgExams

  const downloadStudentCardPdf = useCallback(
    async (sessionId: string, studentId: number, fileName?: string): Promise<string | null> => {
      if (!ensure()) return null;

      const params = new URLSearchParams();
      params.set('sessionId', sessionId);
      if (token) params.set('token', token); // ⬅️ pass JWT via query

      const url = `${backendUrl}/api/orgs/${orgId}/exams/student/${studentId}/card.pdf?${params.toString()}`;

      // Web-only: actually perform the download
      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (!res.ok) {
            if (typeof alert === 'function') {
              alert(`Failed to download PDF (HTTP ${res.status})`);
            } else {
              console.error('Failed to download PDF', res.status);
            }
            return url;
          }

          const blob = await res.blob();
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName || 'exam-report.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(blobUrl);
        } catch (e: any) {
          console.error(e);
          if (typeof alert === 'function') {
            alert(e?.message || 'Failed to download PDF');
          }
        }
      }

      // Native (& web callers if they want) can open this URL directly
      return url;
    },
    [backendUrl, token, orgId]
  );

  const downloadClassReportPdf = useCallback(
    async (sessionId: string, classLabel: string, fileName: string): Promise<string | null> => {
      if (!ensure()) return null;
      if (!sessionId || !orgId) {
        console.error('Missing sessionId or orgId for class report download');
        return null;
      }

      const params = new URLSearchParams();
      if (classLabel) params.set('classLabel', classLabel);
      params.set('format', 'booklet'); // 📘
      if (token) params.set('token', token); // ⬅️ JWT

      const url = `${backendUrl}/api/orgs/${orgId}/exams/sessions/${sessionId}/class-report.pdf?${params.toString()}`;

      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        try {
          const resp = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            const msg = text || 'Failed to download class report';
            if (typeof alert === 'function') {
              alert(msg);
            } else {
              console.error(msg);
            }
            return url;
          }

          const blob = await resp.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(downloadUrl);
        } catch (e: any) {
          console.error('Failed to download class report', e);
          if (typeof alert === 'function') {
            alert(e?.message || 'Failed to download class report');
          }
        }
      }

      return url;
    },
    [backendUrl, orgId, token]
  );

  return {
    // config
    config,
    configLoading,
    fetchConfig,
    saveConfig,
    configAiLoading,
    previewConfigWithAi,

    // sheet
    sheetRows,
    sheetLoading,
    savingSheet,
    fetchSheet,
    saveSheet,

    // analytics & reports
    analytics,
    analyticsLoading,
    fetchAnalytics,
    fetchStudentCard,
    emailStudentCard,
    downloadStudentCardPdf,
    downloadClassReportPdf,
  };
}
