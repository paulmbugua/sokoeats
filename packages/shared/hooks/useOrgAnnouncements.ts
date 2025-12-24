import { useCallback, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgAnnouncement } from '@mytutorapp/shared/types';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementAgmPdf,
  getAnnouncementFeed,
  listAnnouncements,
  updateAnnouncement,
} from '@mytutorapp/shared/api/orgEngagementApi';

interface UseOrgAnnouncementsOptions {
  backendUrl?: string;
  token?: string | null; // can be user token OR orgToken
  orgId?: string | null;
}

export function useOrgAnnouncements(opts?: UseOrgAnnouncementsOptions) {
  const ctx = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctx?.backendUrl;

  // ✅ IMPORTANT: org portal uses orgToken (App.tsx guards org pages with orgToken)
  const token = (opts?.token ?? ctx?.orgToken ?? ctx?.token ?? null) as string | null;

  const orgId = (opts?.orgId ?? ctx?.orgId ?? null) as string | null;

  const [announcements, setAnnouncements] = useState<OrgAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ✅ Do NOT require backendUrl. orgEngagementApi falls back to env vars.
  const ensure = useCallback(() => Boolean(token && orgId), [token, orgId]);

  const debugSnapshot = useMemo(
    () => ({
      orgId,
      hasToken: Boolean(token),
      hasUserToken: Boolean(ctx?.token),
      hasOrgToken: Boolean(ctx?.orgToken),
      backendUrl: backendUrl || '(env fallback)',
    }),
    [orgId, token, ctx?.token, ctx?.orgToken, backendUrl],
  );

  const fetchAnnouncements = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [];
      setLoading(true);
      setError(null);
      try {
        const items = await listAnnouncements(backendUrl, token as string, orgId as string, params);
        setAnnouncements(items || []);
        return items || [];
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Unable to load announcements');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId, ensure],
  );

  const saveAnnouncement = useCallback(
    async (payload: Partial<OrgAnnouncement>) => {
      if (!ensure()) {
        console.warn('[useOrgAnnouncements] blocked publish: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const created = await createAnnouncement(backendUrl, token as string, orgId as string, payload);
        setAnnouncements((prev) => [created, ...(Array.isArray(prev) ? prev : [])]);
        setNotice('Published ✅');
        return created;
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Publish failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const editAnnouncement = useCallback(
    async (announcementId: number, payload: Partial<OrgAnnouncement>) => {
      if (!ensure()) {
        console.warn('[useOrgAnnouncements] blocked update: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const updated = await updateAnnouncement(
          backendUrl,
          token as string,
          orgId as string,
          announcementId,
          payload,
        );
        setAnnouncements((prev) => (prev || []).map((a: any) => (a.id === announcementId ? updated : a)));
        setNotice('Updated ✅');
        return updated;
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Update failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const removeAnnouncement = useCallback(
    async (announcementId: number) => {
      if (!ensure()) {
        console.warn('[useOrgAnnouncements] blocked delete: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return;
      }
      setError(null);
      setNotice(null);
      try {
        await deleteAnnouncement(backendUrl, token as string, orgId as string, announcementId);
        setAnnouncements((prev) => (prev || []).filter((a: any) => a.id !== announcementId));
        setNotice('Deleted ✅');
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'Delete failed');
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const downloadAgmPdf = useCallback(
    async (announcementId: number, fileName = 'agm.pdf') => {
      if (!ensure()) {
        console.warn('[useOrgAnnouncements] blocked pdf: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setError(null);
      try {
        const blob = await getAnnouncementAgmPdf(backendUrl, token as string, orgId as string, announcementId);
        if (typeof document !== 'undefined') {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          window.URL.revokeObjectURL(url);
        }
        return blob;
      } catch (e: any) {
        setError(e?.response?.data?.message || e?.message || 'PDF download failed');
        return null;
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const fetchFeed = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [];
      return getAnnouncementFeed(backendUrl, token as string, orgId as string, params);
    },
    [backendUrl, token, orgId, ensure],
  );

  return {
    backendUrl,
    orgId,
    announcements,
    loading,
    saving,
    error,
    notice,
    fetchAnnouncements,
    fetchFeed,
    saveAnnouncement,
    editAnnouncement,
    removeAnnouncement,
    downloadAgmPdf,
  };
}
