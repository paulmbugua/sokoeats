// apps/web/src/pages/org/OrgToolsClubs.web.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgClubs } from '@mytutorapp/shared/hooks/useOrgClubs';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { getMyClubs as apiGetMyClubs } from '@mytutorapp/shared/api/orgEngagementApi';

// ✅ reuse the same smooth helpers Fees uses
import type { LearnerLite } from './OrgFees.shared';
import { pickAdmissionCode, pickFeeLearnerRef, pickLearnerName } from './OrgFees.shared';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}




function isUuid(v: any) {
  const s = String(v || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function safeCount(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normAdmission(v: any) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * ✅ LOCK member_id to the exact “required id”:
 * Prefer the same learner ref used by Fees (usually learner profile uuid).
 * If not available, we DO NOT silently send random ids (avoids 500s + wrong links).
 */
function pickClubMemberIdForEnroll(l: LearnerLite): string {
  const ref = String(pickFeeLearnerRef(l) || '').trim();
  if (ref) return ref;

  // optional fallback if your backend supports numeric user_id resolution:
  const userId = (l as any)?.user_id ?? (l as any)?.user?.id ?? null;
  if (userId !== null && userId !== undefined && String(userId).trim()) return String(userId).trim();

  return '';
}

/** Helps resolve names for members list when member_id can be uuid or numeric */
function buildMemberLookupKeys(l: LearnerLite): string[] {
  const keys = new Set<string>();

  const ref = String(pickFeeLearnerRef(l) || '').trim();
  if (ref) keys.add(ref);

  const userId = String((l as any)?.user_id ?? (l as any)?.user?.id ?? '').trim();
  if (userId) keys.add(userId);

  const id = String((l as any)?.id ?? '').trim();
  if (id) keys.add(id);

  const learnerId = String((l as any)?.learner_id ?? '').trim();
  if (learnerId) keys.add(learnerId);

  // ✅ extra common variants
  const profileId = String((l as any)?.profile_id ?? (l as any)?.learner_profile_id ?? '').trim();
  if (profileId) keys.add(profileId);

  return Array.from(keys);
}

const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const TEMPLATES = [
  { name: 'Debate Club', description: 'Weekly debates, public speaking, and critical thinking.' },
  { name: 'STEM Club', description: 'Hands-on science projects, robotics, and tech challenges.' },
  { name: 'Chess Club', description: 'Chess practice, puzzles, and friendly tournaments.' },
  { name: 'Drama Society', description: 'Acting, stage skills, and termly performances.' },
  { name: 'Environmental Club', description: 'Clean-ups, tree planting, and sustainability projects.' },
  { name: 'Journalism Club', description: 'School news, writing, photography, and media.' },
];

const OrgToolsClubsPage: React.FC = () => {
  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;

  // future-proof if you later add /org/:orgId/clubs
  const { orgId: orgIdParam } = useParams();

  const {
    orgId: ctxOrgId,
    token: ctxUserToken,
    orgToken: ctxOrgToken,
    backendUrl: ctxBackendUrl,
  } = useShopContext() as any;

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  // ✅ IMPORTANT:
  // - Org tools endpoints usually accept orgToken
  // - BUT /clubs/mine often needs user identity → we will call it with userToken separately.
  const clubToken = (ctxOrgToken as string) || (ctxUserToken as string) || null;

  // ✅ orgId resolution order (include activeOrgId + org.id to avoid “missing orgId” edge cases)
  const orgId =
    (orgIdParam as string) ||
    (activeOrgId as string) ||
    (ctxOrgId as string) ||
    (org?.id as string) ||
    (orgFromHook?.id as string) ||
    null;

  const {
    clubs,
    members,
    myClubs, // (we won't auto call it anymore; backend was 500)
    loading,
    saving,
    error,
    notice,
    fetchClubs,
    // fetchMyClubs,  // ❌ STOP auto calling (this is what caused 500 after create)
    fetchMembers,
    saveClub,
    editClub,
    removeClub,
    enrollMember,
    unenrollMember,
  } = useOrgClubs({
    orgId,
    token: clubToken,
    backendUrl: ctxBackendUrl, // optional; API falls back to env
  }) as any;

  const missingCtx = !orgId || !clubToken;

  // Debug snapshot (same style as announcements)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line no-console
    console.log('[OrgToolsClubsPage] context snapshot', {
      route_orgIdParam: orgIdParam ?? null,
      activeOrgId: activeOrgId ?? null,
      ctxOrgId: ctxOrgId ?? null,
      orgFromHook_id: orgFromHook?.id ?? null,
      orgFromProTools_id: org?.id ?? null,
      resolved_orgId: orgId ?? null,
      has_user_token: Boolean(ctxUserToken),
      has_org_token: Boolean(ctxOrgToken),
      resolved_has_club_token: Boolean(clubToken),
      backendUrl_ctx: ctxBackendUrl ?? null,
      location: window.location.pathname,
    });
  }, [orgIdParam, activeOrgId, ctxOrgId, orgFromHook?.id, org?.id, orgId, ctxUserToken, ctxOrgToken, clubToken, ctxBackendUrl]);

  // Fetch ALL clubs only (safe)
  useEffect(() => {
    if (!orgId || !clubToken) return;
    fetchClubs();
  }, [orgId, clubToken, fetchClubs]);

  const [mode, setMode] = useState<'all' | 'mine'>('all');
  const [q, setQ] = useState('');

  // ✅ My clubs: call endpoint ONLY when user requests the Mine tab AND using userToken
  const [myClubsLocal, setMyClubsLocal] = useState<any[]>([]);
  const [myClubsLoading, setMyClubsLoading] = useState(false);
  const [myClubsError, setMyClubsError] = useState<string | null>(null);

 // ✅ pick a token that can identify the logged-in user
const mineToken =
  (ctxUserToken as string) ||
  (ctxOrgToken as string) || // allow orgToken too (often still a JWT with user)
  null;

// ✅ show heads-up only when user is on Mine tab AND we truly lack a token AND nothing loaded yet
const showMineHeadsUp = mode === 'mine' && !mineToken && myClubsLocal.length === 0;

const fetchMine = useCallback(async () => {
  if (!orgId || !mineToken) {
    setMyClubsLocal([]);
    setMyClubsError('My clubs requires a valid session token.');
    return;
  }

  setMyClubsLoading(true);
  setMyClubsError(null);

  try {
    const rows = await apiGetMyClubs(ctxBackendUrl, mineToken, orgId as string);
    setMyClubsLocal(Array.isArray(rows) ? rows : []);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || 'Failed to load my clubs';
    setMyClubsError(msg);
    setMyClubsLocal([]);
  } finally {
    setMyClubsLoading(false);
  }
}, [orgId, mineToken, ctxBackendUrl]);


  useEffect(() => {
    if (mode === 'mine') fetchMine();
  }, [mode, fetchMine]);

  // ✅ roster (for admission → name → locked member_id)
  const rosterQuery = useQuery({
    queryKey: ['orgRoster', ctxBackendUrl, orgId, clubToken],
    enabled: Boolean(ctxBackendUrl && orgId && clubToken),
    queryFn: async () => {
      const raw = (await getOrgRoster(ctxBackendUrl, clubToken as string, orgId as string)) as any;
      const learnersRaw = (raw?.learners ?? raw?.items ?? []) as any[];
      const learners: LearnerLite[] = Array.isArray(learnersRaw) ? (learnersRaw as LearnerLite[]) : [];
      return { raw, learners };
    },
    staleTime: 30_000,
  });

  const learners: LearnerLite[] = rosterQuery.data?.learners || [];

  const admissionIndex = useMemo(() => {
    const m = new Map<string, LearnerLite>();
    for (const l of learners) {
      const adm = pickAdmissionCode(l);
      const key = normAdmission(adm);
      if (key) m.set(key, l);
    }
    return m;
  }, [learners]);

  const memberLookup = useMemo(() => {
    const m = new Map<string, LearnerLite>();
    for (const l of learners) {
      for (const k of buildMemberLookupKeys(l)) m.set(String(k), l);
    }
    return m;
  }, [learners]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    meeting_schedule: '',
    advisor_id: '', // optional uuid (keep blank unless you truly have a uuid)
    is_active: true,
  });

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm({ name: '', description: '', meeting_schedule: '', advisor_id: '', is_active: true });
  }, []);

  const canSave = useMemo(() => Boolean(form.name.trim()), [form.name]);

  const list = useMemo(() => {
    const base = (mode === 'mine' ? myClubsLocal : (clubs || [])) as any[];
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((c) => String(c?.name || '').toLowerCase().includes(needle));
  }, [clubs, mode, q, myClubsLocal]);

  const instructorHint = useMemo(() => {
    const s = String(error || '').toLowerCase();
    return s.includes('403') || s.includes('forbidden') || s.includes('instructor');
  }, [error]);

  const handlePickTemplate = (t: { name: string; description: string }) => {
    setForm((p) => ({
      ...p,
      name: t.name,
      description: p.description?.trim() ? p.description : t.description,
    }));
  };

  const handleEditClick = (club: any) => {
    setEditingId(Number(club.id));
    setForm({
      name: String(club.name || ''),
      description: String(club.description || ''),
      meeting_schedule: String(club.meeting_schedule || ''),
      advisor_id: String(club.advisor_id || ''),
      is_active: Boolean(club.is_active ?? true),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleActive = async (club: any) => {
    const clubId = Number(club.id);
    await editClub(clubId, { is_active: !club.is_active });
    fetchClubs();
  };

  const handleSave = async () => {
    if (!canSave || missingCtx) return;

    // ✅ advisor_id: only send if it is a UUID (avoids 400s)
    const advisor = form.advisor_id?.trim();
    const payload: any = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      meeting_schedule: form.meeting_schedule?.trim() || null,
      is_active: !!form.is_active,
      ...(advisor && isUuid(advisor) ? { advisor_id: advisor } : {}),
    };

    let ok: any = null;
    if (editingId) ok = await editClub(editingId, payload);
    else ok = await saveClub(payload);

    if (ok) {
      resetForm();
      fetchClubs();

      // ✅ DO NOT auto-call /clubs/mine after save (it was 500-ing)
      // If user is currently on Mine tab, refresh mine safely (with userToken)
      if (mode === 'mine') fetchMine();
    }
  };

  // Members modal state
  const [membersOpen, setMembersOpen] = useState(false);
  const [activeClub, setActiveClub] = useState<any | null>(null);

  // ✅ admission-based member form
  const [memberForm, setMemberForm] = useState({
    admission_code: '',
    role: 'member',
    // fallback: allow raw id only if needed (kept optional, minimal)
    member_id_fallback: '',
  });

  const openMembers = async (club: any) => {
    setActiveClub(club);
    setMembersOpen(true);
    setMemberForm({ admission_code: '', role: 'member', member_id_fallback: '' });
    await fetchMembers(Number(club.id));
  };

  const closeMembers = () => {
    setMembersOpen(false);
    setActiveClub(null);
  };

  const matchedLearner = useMemo(() => {
    const key = normAdmission(memberForm.admission_code);
    return key ? admissionIndex.get(key) || null : null;
  }, [memberForm.admission_code, admissionIndex]);

  const resolvedMemberId = useMemo(() => {
    if (matchedLearner) return pickClubMemberIdForEnroll(matchedLearner);
    const raw = String(memberForm.member_id_fallback || '').trim();
    return raw;
  }, [matchedLearner, memberForm.member_id_fallback]);

  const resolvedIsUsable = useMemo(() => {
    // if your backend expects uuid-only, enforce uuid here
    // if backend supports numeric user_id resolution, this can be relaxed
    return Boolean(String(resolvedMemberId || '').trim());
  }, [resolvedMemberId]);

  const doEnroll = async () => {
    if (!activeClub) return;
    if (!resolvedIsUsable) return;

    const clubId = Number(activeClub.id);

    const member_id = String(resolvedMemberId || '').trim();
    if (!member_id) return;

    const res = await enrollMember(clubId, {
      member_id, // ✅ LOCKED from admission → correct ref
      role: memberForm.role?.trim() || 'member',
    });

    if (res) {
      setMemberForm((p) => ({ ...p, admission_code: '', member_id_fallback: '' }));
      fetchMembers(clubId);
      fetchClubs();
      if (mode === 'mine') fetchMine();
    }
  };

  const doUnenroll = async (member_id: any) => {
    if (!activeClub) return;
    const clubId = Number(activeClub.id);
    await unenrollMember(clubId, { member_id: String(member_id) });
    fetchMembers(clubId);
    fetchClubs();
    if (mode === 'mine') fetchMine();
  };

  // Render name/admission for member row if we can map it to roster
  const renderMemberTitle = (m: any) => {
  // 1) First try roster mapping (this gives the same name you saw when selecting ADM No)
  const key1 = String(m?.member_id ?? '').trim();
  const key2 = String(m?.user_id ?? '').trim(); // backend already returns lp.user_id

  const learner =
    (key1 && memberLookup.get(key1)) ||
    (key2 && memberLookup.get(key2)) ||
    null;

  if (learner) {
    return {
      name: pickLearnerName(learner),
      admission: pickAdmissionCode(learner),
      class_label: String((learner as any)?.class_label || ''),
    };
  }

  // 2) If not found in roster, THEN use API fields (email/admission/class)
  const apiName = String(m?.member_name ?? m?.memberName ?? '').trim();
  const apiAdm = String(m?.admission_code ?? m?.admissionCode ?? '').trim();
  const apiClass = String(m?.class_label ?? m?.classLabel ?? '').trim();

  return {
    name: apiName || String(m?.email || '') || `Member ${key1 ? key1.slice(0, 8) : '—'}`,
    admission: apiAdm,
    class_label: apiClass,
  };
};

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      {/* Missing context strip */}
      {missingCtx ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
          <div className="font-semibold">Missing org/session context</div>
          <div className="mt-1 opacity-90">
            orgId: {orgId ?? 'null'} • token: {clubToken ? 'present' : 'missing'}
          </div>
          <div className="mt-1 text-xs opacity-80">
            Make sure you’re logged in and inside an org. Open DevTools → Console and look for{' '}
            <code>[OrgToolsClubsPage]</code> logs.
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="truncate text-2xl font-semibold">Clubs & societies</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Create clubs, manage membership, and keep activities organised.
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
          Pro / Enterprise
        </span>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <div className="mt-2 text-sm">
            <Link className="text-blue-700 underline" to="/org/profile">
              Upgrade for {org?.name || 'your org'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Composer */}
          <div className={cn(card, 'lg:col-span-2')}>
            {(error || notice) ? (
              <div
                className={cn(
                  'mb-3 rounded-lg px-3 py-2 text-sm',
                  error
                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
                )}
              >
                {error || notice}
                {instructorHint ? (
                  <div className="mt-1 text-xs opacity-90">
                    Tip: Clubs endpoints require <b>Pro tier</b> + <b>Org Instructor</b>. If you’re not an instructor,
                    you’ll get 403.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {editingId ? 'Edit club' : 'Create a club'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Keep it simple: name + schedule + optional description.
                </div>
              </div>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {/* Quick templates */}
            {!editingId ? (
              <div className="mt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick templates
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.slice(0, 6).map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => handlePickTemplate(t)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Debate Club"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Meeting schedule (optional)</span>
                <input
                  value={form.meeting_schedule}
                  onChange={(e) => setForm((p) => ({ ...p, meeting_schedule: e.target.value }))}
                  placeholder="Every Friday 3:30pm — Room 12"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Description (optional)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What does this club do?"
                  className="h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {/* Advisor (uuid only) */}
              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Advisor id (optional, UUID only)</span>
                <input
                  value={form.advisor_id}
                  onChange={(e) => setForm((p) => ({ ...p, advisor_id: e.target.value }))}
                  placeholder="Leave blank unless you have a UUID"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                {form.advisor_id?.trim() && !isUuid(form.advisor_id.trim()) ? (
                  <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                    Not a UUID — it won’t be sent (prevents 400 errors).
                  </div>
                ) : null}
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                <span>Active</span>
              </label>

              <div className="flex gap-3">
                <button
                  disabled={!canSave || saving || missingCtx}
                  onClick={handleSave}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save club'}
                </button>

                <button
                  onClick={() => {
                    if (!orgId || !clubToken) return;
                    fetchClubs();
                    if (mode === 'mine') fetchMine();
                  }}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh list
                </button>
              </div>
            </div>
          </div>

          {/* List */}
          <div className={cn(card, 'lg:col-span-3')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('all')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    mode === 'all'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  All clubs
                </button>
                <button
                  type="button"
                  onClick={() => setMode('mine')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    mode === 'mine'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  My clubs
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search clubs…"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-64"
                />
              </div>
            </div>

            {mode === 'mine' && (myClubsLoading || myClubsError) ? (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {myClubsLoading ? 'Loading my clubs…' : myClubsError}
              </div>
            ) : null}

            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? <p className="py-3 text-sm text-slate-500">Loading clubs…</p> : null}

              {!loading && !list.length ? (
                <p className="py-3 text-sm text-slate-500">No clubs yet. Create one on the left.</p>
              ) : (
                list.map((c: any) => (
                  <div key={c.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-semibold text-slate-800 dark:text-slate-100">{c.name}</div>

                          {c.is_active ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              Inactive
                            </span>
                          )}

                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {safeCount(c.member_count)} members
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {c.meeting_schedule ? c.meeting_schedule : 'Schedule: TBC'}
                        </div>

                        {c.description ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                            {c.description}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openMembers(c)}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Members
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditClick(c)}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleActive(c)}
                          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {c.is_active ? 'Deactivate' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${c.name}"?`)) removeClub(Number(c.id));
                          }}
                          className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Note: Clubs endpoints require <b>Pro tier</b> + <b>Org Instructor</b>. If you’re not an instructor,
              the API will return 403.
            </div>
          </div>
        </div>
      )}

      {/* Members modal */}
      {membersOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Members • {activeClub?.name || 'Club'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Type admission code/no to auto-resolve learner + lock correct member id.
                </div>
              </div>
              <button
                type="button"
                onClick={closeMembers}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Enroll */}
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 sm:col-span-2">
                  <span className="mb-1 text-xs uppercase tracking-wide">Admission code / no</span>

                  <input
                    list="clubAdmissionSuggestions"
                    value={memberForm.admission_code}
                    onChange={(e) => setMemberForm((p) => ({ ...p, admission_code: e.target.value }))}
                    placeholder="Type admission no (e.g. ADM001)"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <datalist id="clubAdmissionSuggestions">
                    {learners
                      .map((l) => pickAdmissionCode(l))
                      .filter(Boolean)
                      .slice(0, 500)
                      .map((code) => (
                        <option key={String(code)} value={String(code)} />
                      ))}
                  </datalist>

                  <div className="mt-1 text-xs">
                    {memberForm.admission_code.trim() ? (
                      matchedLearner ? (
                        <span className="text-emerald-700 dark:text-emerald-200">
                          ✅ {pickLearnerName(matchedLearner)}
                          {String((matchedLearner as any)?.class_label || '') ? ` • ${(matchedLearner as any).class_label}` : ''}
                          <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-300">
                            (member_id: <span className="font-mono">{resolvedMemberId || '—'}</span>)
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-200">No learner found for that admission code.</span>
                      )
                    ) : (
                      <span className="text-slate-500 dark:text-slate-300">
                        Start typing to auto-resolve learner.
                      </span>
                    )}
                  </div>

                  {/* Optional fallback (kept minimal) */}
                  {!matchedLearner ? (
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      If you *must* add someone not in learner roster, you can paste internal id below.
                      <input
                        value={memberForm.member_id_fallback}
                        onChange={(e) => setMemberForm((p) => ({ ...p, member_id_fallback: e.target.value }))}
                        placeholder="Internal member_id (optional)"
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  ) : null}
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Role</span>
                  <select
                    value={memberForm.role}
                    onChange={(e) => setMemberForm((p) => ({ ...p, role: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="member">Member</option>
                    <option value="prefect">Prefect</option>
                    <option value="captain">Captain</option>
                    <option value="chair">Chair</option>
                    <option value="secretary">Secretary</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!resolvedIsUsable || saving}
                  onClick={doEnroll}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {saving ? 'Adding…' : 'Add member'}
                </button>
                <button
                  onClick={() => {
                    if (!activeClub) return;
                    fetchMembers(Number(activeClub.id));
                  }}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>

              {/* Members list */}
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {!members?.length ? (
                  <div className="p-3 text-sm text-slate-500">No members yet.</div>
                ) : (
                  (members as any[]).map((m) => {
                    const info = renderMemberTitle(m);
                    return (
                      <div key={`${m.club_id}-${m.member_id}`} className="flex items-center justify-between p-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {info.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            role: {m.role || 'member'}
                            {info.admission ? ` • ${String(info.admission)}` : ''}
                            {info.class_label ? ` • ${info.class_label}` : ''}
                            {m.email ? ` • ${m.email}` : ''}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            member_id: <span className="font-mono">{String(m.member_id ?? '')}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Remove this member from the club?')) doUnenroll(m.member_id);
                          }}
                          className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/20"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Roster: {rosterQuery.isLoading ? 'Loading…' : `${learners.length} learners`} • If your backend only
                accepts UUID member ids, this UI now enforces the proper ref by default.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OrgToolsClubsPage;
