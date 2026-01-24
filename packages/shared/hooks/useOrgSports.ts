import { useCallback, useMemo, useState } from 'react';
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
  token?: string | null; // orgToken
  orgId?: string | null;
}

function errMsg(e: any) {
  return e?.response?.data?.message || e?.message || 'Request failed';
}

export function useOrgSports(opts?: UseOrgSportsOptions) {
  const ctx = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctx?.backendUrl;

  // ✅ org tools MUST use orgToken (same style as clubs)
  const token = (opts?.token ?? ctx?.orgToken ?? null) as string | null;

  const orgId = (opts?.orgId ?? ctx?.orgId ?? ctx?.org_id ?? null) as string | null;

  const [events, setEvents] = useState<OrgSportsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ✅ allow backendUrl env fallback in API
  const ensure = useCallback(() => Boolean(token && orgId), [token, orgId]);

  const debugSnapshot = useMemo(
    () => ({
      orgId,
      hasToken: Boolean(token),
      hasOrgToken: Boolean(ctx?.orgToken),
      backendUrl: backendUrl || '(env fallback)',
    }),
    [orgId, token, ctx?.orgToken, backendUrl],
  );

  const fetchEvents = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgSportsEvent[];
      setLoading(true);
      setError(null);
      try {
        const res = await listSportsEvents(backendUrl, token as string, orgId as string, params);
        setEvents(res || []);
        return res || [];
      } catch (e: any) {
        setError(errMsg(e));
        return [] as OrgSportsEvent[];
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId, ensure],
  );

  const saveEvent = useCallback(
    async (payload: Partial<OrgSportsEvent>) => {
      if (!ensure()) {
        console.warn('[useOrgSports] blocked save: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const created = await createSportsEvent(backendUrl, token as string, orgId as string, payload);
        setEvents((prev) => [created, ...(Array.isArray(prev) ? prev : [])]);
        setNotice('Saved ✅');
        return created;
      } catch (e: any) {
        setError(errMsg(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const editEvent = useCallback(
    async (eventId: number, payload: Partial<OrgSportsEvent>) => {
      if (!ensure()) {
        console.warn('[useOrgSports] blocked update: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const updated = await updateSportsEvent(backendUrl, token as string, orgId as string, eventId, payload);
        setEvents((prev) => (prev || []).map((e: any) => (e.id === eventId ? updated : e)));
        setNotice('Updated ✅');
        return updated;
      } catch (e: any) {
        setError(errMsg(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const removeEvent = useCallback(
    async (eventId: number) => {
      if (!ensure()) {
        console.warn('[useOrgSports] blocked delete: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return;
      }
      setError(null);
      setNotice(null);
      try {
        await deleteSportsEvent(backendUrl, token as string, orgId as string, eventId);
        setEvents((prev) => (prev || []).filter((e: any) => e.id !== eventId));
        setNotice('Deleted ✅');
      } catch (e: any) {
        setError(errMsg(e));
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  return {
    backendUrl,
    orgId,
    events,
    loading,
    saving,
    error,
    notice,
    fetchEvents,
    saveEvent,
    editEvent,
    removeEvent,
  };
}
