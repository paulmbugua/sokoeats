// packages/shared/hooks/useOrgClubs.ts
import { useCallback, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgClub, OrgClubMembership } from '@mytutorapp/shared/types';
import {
  createClub,
  deleteClub,
  enrollClubMember,
  getMyClubs,
  listClubMembers,
  listClubs,
  unenrollClubMember,
  updateClub,
} from '@mytutorapp/shared/api/orgEngagementApi';

interface UseOrgClubsOptions {
  backendUrl?: string;
  token?: string | null; // orgToken
  orgId?: string | null;
}

function errMsg(e: any) {
  return e?.response?.data?.message || e?.message || 'Request failed';
}

export function useOrgClubs(opts?: UseOrgClubsOptions) {
  const ctx = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctx?.backendUrl;

  // ✅ org portal pages require orgToken
  const token = (opts?.token ?? ctx?.orgToken ?? null) as string | null;

  const orgId = (opts?.orgId ?? ctx?.orgId ?? ctx?.org_id ?? null) as string | null;

  const [clubs, setClubs] = useState<OrgClub[]>([]);
  const [members, setMembers] = useState<OrgClubMembership[]>([]);
  const [myClubs, setMyClubs] = useState<OrgClub[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ✅ Do NOT require backendUrl (orgEngagementApi falls back to env)
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

  const fetchClubs = useCallback(async () => {
    if (!ensure()) return [] as OrgClub[];
    setLoading(true);
    setError(null);
    try {
      const res = await listClubs(backendUrl, token as string, orgId as string);
      setClubs(res || []);
      return res || [];
    } catch (e: any) {
      setError(errMsg(e));
      return [] as OrgClub[];
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, orgId, ensure]);

  const fetchMyClubs = useCallback(async () => {
    if (!ensure()) return [] as OrgClub[];
    setError(null);
    try {
      const res = await getMyClubs(backendUrl, token as string, orgId as string);
      setMyClubs(res || []);
      return res || [];
    } catch (e: any) {
      setError(errMsg(e));
      return [] as OrgClub[];
    }
  }, [backendUrl, token, orgId, ensure]);

 const fetchMembers = useCallback(
  async (clubId: number) => {
    if (!ensure()) return [] as OrgClubMembership[];
    setLoading(true);
    setError(null);
    try {
      const res: any = await listClubMembers(backendUrl, token as string, orgId as string, clubId);

      const rows: any[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.members)
          ? res.members
          : Array.isArray(res?.items)
            ? res.items
            : [];

      setMembers(rows as any);
      return rows as any;
    } catch (e: any) {
      setError(errMsg(e));
      return [] as OrgClubMembership[];
    } finally {
      setLoading(false);
    }
  },
  [backendUrl, token, orgId, ensure],
);


  const saveClub = useCallback(
    async (payload: Partial<OrgClub>) => {
      if (!ensure()) {
        console.warn('[useOrgClubs] blocked save: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const created = await createClub(backendUrl, token as string, orgId as string, payload);
        setClubs((prev) => [created, ...(Array.isArray(prev) ? prev : [])]);
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

  const editClub = useCallback(
    async (clubId: number, payload: Partial<OrgClub>) => {
      if (!ensure()) {
        console.warn('[useOrgClubs] blocked update: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const updated = await updateClub(backendUrl, token as string, orgId as string, clubId, payload);
        setClubs((prev) => (prev || []).map((c: any) => (c.id === clubId ? updated : c)));
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

  const removeClub = useCallback(
    async (clubId: number) => {
      if (!ensure()) {
        console.warn('[useOrgClubs] blocked delete: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return;
      }
      setError(null);
      setNotice(null);
      try {
        await deleteClub(backendUrl, token as string, orgId as string, clubId);
        setClubs((prev) => (prev || []).filter((c: any) => c.id !== clubId));
        setNotice('Deleted ✅');
      } catch (e: any) {
        setError(errMsg(e));
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const enrollMember = useCallback(
    async (clubId: number, payload: { member_id: string; role?: string }) => {
      if (!ensure()) {
        console.warn('[useOrgClubs] blocked enroll: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const res = await enrollClubMember(backendUrl, token as string, orgId as string, clubId, payload);
        setMembers((prev) => [res, ...(prev || []).filter((m: any) => m.member_id !== res.member_id)]);
        setNotice('Enrolled ✅');
        return res;
      } catch (e: any) {
        setError(errMsg(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  const unenrollMember = useCallback(
    async (clubId: number, payload: { member_id: string }) => {
      if (!ensure()) {
        console.warn('[useOrgClubs] blocked unenroll: missing context', debugSnapshot);
        setError('Missing org/session context (orgId, token).');
        return null;
      }
      setSaving(true);
      setError(null);
      setNotice(null);
      try {
        const res = await unenrollClubMember(backendUrl, token as string, orgId as string, clubId, payload);
        setMembers((prev) => (prev || []).filter((m: any) => String(m.member_id) !== String(payload.member_id)));
        setNotice('Removed ✅');
        return res;
      } catch (e: any) {
        setError(errMsg(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId, ensure, debugSnapshot],
  );

  return {
    backendUrl,
    orgId,
    clubs,
    myClubs,
    members,
    loading,
    saving,
    error,
    notice,
    fetchClubs,
    fetchMyClubs,
    fetchMembers,
    saveClub,
    editClub,
    removeClub,
    enrollMember,
    unenrollMember,
    clearError: () => setError(null),
  };
}
