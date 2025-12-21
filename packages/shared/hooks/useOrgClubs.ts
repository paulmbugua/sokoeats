import { useCallback, useState } from 'react';
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
  token?: string | null;
  orgId?: string | null;
}

export function useOrgClubs(opts?: UseOrgClubsOptions) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;
  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [clubs, setClubs] = useState<OrgClub[]>([]);
  const [members, setMembers] = useState<OrgClubMembership[]>([]);
  const [myClubs, setMyClubs] = useState<OrgClub[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchClubs = useCallback(async () => {
    if (!ensure()) return [] as OrgClub[];
    setLoading(true);
    try {
      const res = await listClubs(backendUrl, token as string, orgId as string);
      setClubs(res || []);
      return res;
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, orgId]);

  const fetchMyClubs = useCallback(async () => {
    if (!ensure()) return [] as OrgClub[];
    const res = await getMyClubs(backendUrl, token as string, orgId as string);
    setMyClubs(res || []);
    return res;
  }, [backendUrl, token, orgId]);

  const fetchMembers = useCallback(
    async (clubId: number) => {
      if (!ensure()) return [] as OrgClubMembership[];
      const res = await listClubMembers(backendUrl, token as string, orgId as string, clubId);
      setMembers(res || []);
      return res;
    },
    [backendUrl, token, orgId],
  );

  const saveClub = useCallback(
    async (payload: Partial<OrgClub>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createClub(backendUrl, token as string, orgId as string, payload);
        setClubs((prev) => [created, ...prev]);
        return created;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const editClub = useCallback(
    async (clubId: number, payload: Partial<OrgClub>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const updated = await updateClub(backendUrl, token as string, orgId as string, clubId, payload);
        setClubs((prev) => prev.map((c) => (c.id === clubId ? updated : c)));
        return updated;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const removeClub = useCallback(
    async (clubId: number) => {
      if (!ensure()) return;
      await deleteClub(backendUrl, token as string, orgId as string, clubId);
      setClubs((prev) => prev.filter((c) => c.id !== clubId));
    },
    [backendUrl, token, orgId],
  );

  const enrollMember = useCallback(
    async (clubId: number, payload: { member_id: string; role?: string }) => {
      if (!ensure()) return null;
      const res = await enrollClubMember(backendUrl, token as string, orgId as string, clubId, payload);
      setMembers((prev) => [res, ...prev.filter((m) => m.member_id !== res.member_id)]);
      return res;
    },
    [backendUrl, token, orgId],
  );

  const unenrollMember = useCallback(
    async (clubId: number, payload: { member_id: string }) => {
      if (!ensure()) return null;
      const res = await unenrollClubMember(backendUrl, token as string, orgId as string, clubId, payload);
      setMembers((prev) => prev.filter((m) => m.member_id !== payload.member_id));
      return res;
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    clubs,
    myClubs,
    members,
    loading,
    saving,
    fetchClubs,
    fetchMyClubs,
    fetchMembers,
    saveClub,
    editClub,
    removeClub,
    enrollMember,
    unenrollMember,
  };
}
