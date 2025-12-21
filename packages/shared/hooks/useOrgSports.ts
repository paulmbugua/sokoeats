import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgSportsEvent } from '@mytutorapp/shared/types';
import {
  createSportsEvent,
  deleteSportsEvent,
  listSportsEvents,
  updateSportsEvent,
} from '@mytutorapp/shared/api/orgEngagementApi';

interface UseOrgSportsOptions {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgSports(opts?: UseOrgSportsOptions) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;
  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [events, setEvents] = useState<OrgSportsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchEvents = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgSportsEvent[];
      setLoading(true);
      try {
        const res = await listSportsEvents(backendUrl, token as string, orgId as string, params);
        setEvents(res || []);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const saveEvent = useCallback(
    async (payload: Partial<OrgSportsEvent>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createSportsEvent(backendUrl, token as string, orgId as string, payload);
        setEvents((prev) => [created, ...prev]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const editEvent = useCallback(
    async (eventId: number, payload: Partial<OrgSportsEvent>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const updated = await updateSportsEvent(backendUrl, token as string, orgId as string, eventId, payload);
        setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const removeEvent = useCallback(
    async (eventId: number) => {
      if (!ensure()) return;
      await deleteSportsEvent(backendUrl, token as string, orgId as string, eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    events,
    loading,
    saving,
    fetchEvents,
    saveEvent,
    editEvent,
    removeEvent,
  };
}
