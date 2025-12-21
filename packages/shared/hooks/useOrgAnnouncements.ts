import { useCallback, useState } from 'react';
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
  token?: string | null;
  orgId?: string | null;
}

export function useOrgAnnouncements(opts?: UseOrgAnnouncementsOptions) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;
  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [announcements, setAnnouncements] = useState<OrgAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchAnnouncements = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgAnnouncement[];
      setLoading(true);
      try {
        const res = await listAnnouncements(backendUrl, token as string, orgId as string, params);
        setAnnouncements(res || []);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const fetchFeed = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgAnnouncement[];
      return getAnnouncementFeed(backendUrl, token as string, orgId as string, params);
    },
    [backendUrl, token, orgId],
  );

  const saveAnnouncement = useCallback(
    async (payload: Partial<OrgAnnouncement>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createAnnouncement(backendUrl, token as string, orgId as string, payload);
        setAnnouncements((prev) => [created, ...prev]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const editAnnouncement = useCallback(
    async (announcementId: number, payload: Partial<OrgAnnouncement>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const updated = await updateAnnouncement(
          backendUrl,
          token as string,
          orgId as string,
          announcementId,
          payload,
        );
        setAnnouncements((prev) => prev.map((a) => (a.id === announcementId ? updated : a)));
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const removeAnnouncement = useCallback(
    async (announcementId: number) => {
      if (!ensure()) return;
      await deleteAnnouncement(backendUrl, token as string, orgId as string, announcementId);
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcementId));
    },
    [backendUrl, token, orgId],
  );

  const downloadAgmPdf = useCallback(
    async (announcementId: number, fileName = 'agm.pdf') => {
      if (!ensure()) return null;
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
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    announcements,
    loading,
    saving,
    fetchAnnouncements,
    fetchFeed,
    saveAnnouncement,
    editAnnouncement,
    removeAnnouncement,
    downloadAgmPdf,
  };
}
