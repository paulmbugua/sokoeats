/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgClubs } from '@mytutorapp/shared/hooks/useOrgClubs';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';
import { getMyClubs as apiGetMyClubs } from '@mytutorapp/shared/api/orgEngagementApi';

/* ─────────────────────────────────────────────────────────
 * Small helpers (native-safe)
 * ───────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────
 * LearnerLite + picker helpers (ported from OrgFees.shared)
 * Keep it robust: supports different shapes from roster API.
 * ───────────────────────────────────────────────────────── */
type LearnerLite = {
  id?: string | number;
  user_id?: string | number;
  learner_id?: string | number;
  profile_id?: string | number;
  learner_profile_id?: string | number;
  admission_code?: string;
  admissionCode?: string;
  admission_no?: string;
  admissionNo?: string;
  admission_number?: string;
  admissionNumber?: string;
  name?: string;
  full_name?: string;
  fullName?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  email?: string;
  class_label?: string;
  classLabel?: string;
  user?: { id?: string | number; email?: string; name?: string };
};

function pickAdmissionCode(l: LearnerLite) {
  const s =
    l?.admission_code ??
    l?.admissionCode ??
    l?.admission_no ??
    l?.admissionNo ??
    l?.admission_number ??
    l?.admissionNumber ??
    '';
  return String(s || '').trim();
}

function pickLearnerName(l: LearnerLite) {
  const fromNames =
    l?.full_name ??
    l?.fullName ??
    l?.name ??
    (l?.first_name || l?.last_name
      ? `${l.first_name || ''} ${l.last_name || ''}`.trim()
      : l?.firstName || l?.lastName
      ? `${l.firstName || ''} ${l.lastName || ''}`.trim()
      : '') ??
    '';

  const fromUser = l?.user?.name || l?.user?.email || '';
  const email = l?.email || '';
  return String(fromNames || fromUser || email || 'Learner').trim();
}

/**
 * Prefer learner profile uuid (same idea as Fees), then fallback to user_id if supported.
 * This avoids sending random ids and causing 500s / wrong links.
 */
function pickFeeLearnerRef(l: LearnerLite) {
  const profile =
    (l as any)?.learner_profile_id ??
    (l as any)?.profile_id ??
    (l as any)?.learnerProfileId ??
    (l as any)?.profileId ??
    null;

  if (profile != null && String(profile).trim()) return String(profile).trim();

  // sometimes roster returns "id" as the profile id
  const id = (l as any)?.id ?? null;
  if (id != null && String(id).trim()) return String(id).trim();

  return '';
}

function pickClubMemberIdForEnroll(l: LearnerLite): string {
  const ref = String(pickFeeLearnerRef(l) || '').trim();
  if (ref) return ref;

  const userId = (l as any)?.user_id ?? (l as any)?.user?.id ?? null;
  if (userId !== null && userId !== undefined && String(userId).trim()) return String(userId).trim();

  return '';
}

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

  const profileId = String((l as any)?.profile_id ?? (l as any)?.learner_profile_id ?? '').trim();
  if (profileId) keys.add(profileId);

  return Array.from(keys);
}

/* ─────────────────────────────────────────────────────────
 * UI atoms (same family as your native screens)
 * ───────────────────────────────────────────────────────── */
const Card: React.FC<{ children: React.ReactNode; style?: any }> = ({ children, style }) => (
  <View
    style={[
      tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821] p-4`,
      style,
    ]}
  >
    {children}
  </View>
);

const Chip: React.FC<{ label: string; active?: boolean; onPress?: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    style={tw`px-3 py-2 rounded-full border ${
      active
        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
        : 'border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0f1821]'
    }`}
  >
    <Text
      style={tw`text-xs font-semibold ${
        active ? 'text-blue-700 dark:text-blue-200' : 'text-[#0d141c] dark:text-white'
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

const Pill: React.FC<{ label: string; kind?: 'blue' | 'green' | 'slate' | 'rose' | 'amber' }> = ({
  label,
  kind = 'slate',
}) => {
  const cls =
    kind === 'green'
      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
      : kind === 'blue'
      ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
      : kind === 'rose'
      ? 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
      : kind === 'amber'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20'
      : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-900/30';

  const text =
    kind === 'green'
      ? 'text-emerald-800 dark:text-emerald-200'
      : kind === 'blue'
      ? 'text-blue-800 dark:text-blue-200'
      : kind === 'rose'
      ? 'text-rose-800 dark:text-rose-200'
      : kind === 'amber'
      ? 'text-amber-900 dark:text-amber-200'
      : 'text-slate-700 dark:text-slate-200';

  return (
    <View style={tw`px-2 py-1 rounded-full border ${cls}`}>
      <Text style={tw`text-[11px] font-bold ${text}`}>{label}</Text>
    </View>
  );
};

const Checkbox: React.FC<{ value: boolean; onToggle: () => void; label: string }> = ({
  value,
  onToggle,
  label,
}) => (
  <Pressable onPress={onToggle} style={tw`flex-row items-center gap-2`}>
    <View
      style={tw`h-5 w-5 rounded-md border ${
        value
          ? 'border-blue-500 bg-blue-600'
          : 'border-[#cedbe8] dark:border-white/20 bg-white dark:bg-transparent'
      }`}
    />
    <Text style={tw`text-sm text-[#0d141c] dark:text-white`}>{label}</Text>
  </Pressable>
);

/* ─────────────────────────────────────────────────────────
 * Templates
 * ───────────────────────────────────────────────────────── */
const TEMPLATES = [
  { name: 'Debate Club', description: 'Weekly debates, public speaking, and critical thinking.' },
  { name: 'STEM Club', description: 'Hands-on science projects, robotics, and tech challenges.' },
  { name: 'Chess Club', description: 'Chess practice, puzzles, and friendly tournaments.' },
  { name: 'Drama Society', description: 'Acting, stage skills, and termly performances.' },
  { name: 'Environmental Club', description: 'Clean-ups, tree planting, and sustainability projects.' },
  { name: 'Journalism Club', description: 'School news, writing, photography, and media.' },
] as const;

const ROLE_OPTIONS = ['member', 'prefect', 'captain', 'chair', 'secretary'] as const;

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */
const OrgToolsClubsNative: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const FOOTER_OVERLAY_PX = 84;
  const NAV_SPACER_PX = 12;
  const bottomPad = Math.max(FOOTER_OVERLAY_PX, FOOTER_OVERLAY_PX + insets.bottom);

  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;

  const {
    orgId: ctxOrgId,
    token: ctxUserToken,
    orgToken: ctxOrgToken,
    backendUrl: ctxBackendUrl,
  } = (useShopContext() as any) ?? {};

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const orgIdParam = route?.params?.orgId ?? null;

  // Tools endpoints accept orgToken; but "mine" needs user identity → prefer user token.
  const clubToken = (ctxOrgToken as string) || (ctxUserToken as string) || null;

  const orgId =
    (orgIdParam as string) ||
    (activeOrgId as string) ||
    (ctxOrgId as string) ||
    (org?.id as string) ||
    (orgFromHook?.id as string) ||
    null;

  const missingCtx = !orgId || !clubToken;

  const {
    clubs,
    members,
    loading,
    saving,
    error,
    notice,
    fetchClubs,
    fetchMembers,
    saveClub,
    editClub,
    removeClub,
    enrollMember,
    unenrollMember,
  } = useOrgClubs({
    orgId,
    token: clubToken,
    backendUrl: ctxBackendUrl,
  }) as any;

  // Debug snapshot (native console)
  useEffect(() => {
    console.log('[OrgToolsClubsNative] context snapshot', {
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
    });
  }, [orgIdParam, activeOrgId, ctxOrgId, orgFromHook?.id, org?.id, orgId, ctxUserToken, ctxOrgToken, clubToken, ctxBackendUrl]);

  // Fetch ALL clubs (safe)
  useEffect(() => {
    if (!orgId || !clubToken) return;
    fetchClubs();
  }, [orgId, clubToken]);

  const [mode, setMode] = useState<'all' | 'mine'>('all');
  const [q, setQ] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // My clubs (load only on Mine tab, using identity token)
  const [myClubsLocal, setMyClubsLocal] = useState<any[]>([]);
  const [myClubsLoading, setMyClubsLoading] = useState(false);
  const [myClubsError, setMyClubsError] = useState<string | null>(null);

  const mineToken = (ctxUserToken as string) || (ctxOrgToken as string) || null;
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

  // roster → admission → learner + member name resolution
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
    advisor_id: '',
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

  const totalPages = useMemo(() => {
    if (!list.length) return 1;
    return Math.max(1, Math.ceil(list.length / pageSize));
  }, [list.length, pageSize]);

  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [q, mode]);

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

    // native scroll to top
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleToggleActive = async (club: any) => {
    const clubId = Number(club.id);
    await editClub(clubId, { is_active: !club.is_active });
    fetchClubs();
  };

  const handleSave = async () => {
    if (!canSave || missingCtx) return;

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
      if (mode === 'mine') fetchMine();
    }
  };

  // Members modal state
  const [membersOpen, setMembersOpen] = useState(false);
  const [activeClub, setActiveClub] = useState<any | null>(null);

  const [memberForm, setMemberForm] = useState({
    admission_code: '',
    role: 'member',
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

  const resolvedIsUsable = useMemo(() => Boolean(String(resolvedMemberId || '').trim()), [resolvedMemberId]);

  const doEnroll = async () => {
    if (!activeClub) return;
    if (!resolvedIsUsable) return;

    const clubId = Number(activeClub.id);
    const member_id = String(resolvedMemberId || '').trim();
    if (!member_id) return;

    const res = await enrollMember(clubId, {
      member_id,
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

  const renderMemberTitle = (m: any) => {
    const key1 = String(m?.member_id ?? '').trim();
    const key2 = String(m?.user_id ?? '').trim();

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

    const apiName = String(m?.member_name ?? m?.memberName ?? '').trim();
    const apiAdm = String(m?.admission_code ?? m?.admissionCode ?? '').trim();
    const apiClass = String(m?.class_label ?? m?.classLabel ?? '').trim();

    return {
      name: apiName || String(m?.email || '') || `Member ${key1 ? key1.slice(0, 8) : '—'}`,
      admission: apiAdm,
      class_label: apiClass,
    };
  };

  // Admission suggestions (native replacement for <datalist>)
  const admissionNeedle = normAdmission(memberForm.admission_code);
  const admissionSuggestions = useMemo(() => {
    if (!admissionNeedle) return [];
    const out: LearnerLite[] = [];
    for (const l of learners) {
      const code = normAdmission(pickAdmissionCode(l));
      if (code && code.includes(admissionNeedle)) out.push(l);
      if (out.length >= 10) break;
    }
    return out;
  }, [admissionNeedle, learners]);

  // Pro gate
  if (!isPro && upgradeCta) {
    return (
      <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={[
            tw`px-4`,
            { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad },
          ]}
        >
          <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-blue-500`}>
            Org tools
          </Text>
          <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white mt-1`}>
            Clubs & societies
          </Text>
          <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
            Create clubs, manage membership, and keep activities organised.
          </Text>

          <View style={tw`mt-4`}>
            <Card>
              <Text style={tw`font-extrabold text-amber-900 dark:text-amber-200`}>
                {upgradeCta.headline}
              </Text>
              <Text style={tw`text-sm mt-1 text-amber-900/90 dark:text-amber-200/90`}>
                {upgradeCta.body}
              </Text>

              <Pressable
                onPress={() => navigation.navigate('OrgProfile')}
                style={tw`mt-3 h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`font-bold text-[#0d141c] dark:text-white`}>Upgrade billing</Text>
              </Pressable>
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}>
      <ScrollView
        ref={scrollRef}
        style={tw`flex-1`}
        contentContainerStyle={[
          tw`px-4`,
          { paddingTop: insets.top + NAV_SPACER_PX, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Missing context strip */}
        {missingCtx ? (
          <View style={tw`rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20 p-4 mb-4`}>
            <Text style={tw`font-extrabold text-rose-800 dark:text-rose-200`}>
              Missing org/session context
            </Text>
            <Text style={tw`text-xs text-rose-800/90 dark:text-rose-200/90 mt-1`}>
              orgId: {String(orgId ?? 'null')} • token: {clubToken ? 'present' : 'missing'}
            </Text>
            <Text style={tw`text-[11px] text-rose-800/80 dark:text-rose-200/80 mt-1`}>
              Make sure you’re logged in and inside an org. Check logs: [OrgToolsClubsNative].
            </Text>
          </View>
        ) : null}

        {/* Header */}
        <View style={tw`mb-3`}>
          <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-blue-500`}>
            Org tools
          </Text>

          <View style={tw`flex-row items-center justify-between mt-1`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-[28px] font-extrabold text-[#0d141c] dark:text-white`}>
                Clubs & societies
              </Text>
              <Text style={tw`text-sm text-[#49739c] dark:text-white/70 mt-1`}>
                Create clubs, manage membership, and keep activities organised.
              </Text>
            </View>

            <Pill label="Pro / Enterprise" kind="blue" />
          </View>
        </View>

        {/* Composer */}
        <Card>
          {(error || notice) ? (
            <View
              style={tw`mb-3 rounded-2xl border ${
                error
                  ? 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20'
              } p-3`}
            >
              <Text
                style={tw`text-sm font-semibold ${
                  error ? 'text-rose-800 dark:text-rose-200' : 'text-emerald-800 dark:text-emerald-200'
                }`}
              >
                {String(error || notice)}
              </Text>
              {instructorHint ? (
                <Text style={tw`text-[11px] mt-1 text-[#49739c] dark:text-white/70`}>
                  Tip: Clubs endpoints require Pro tier + Org Instructor. If you’re not an instructor, you’ll get 403.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                {editingId ? 'Edit club' : 'Create a club'}
              </Text>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                Keep it simple: name + schedule + optional description.
              </Text>
            </View>

            {editingId ? (
              <Pressable
                onPress={resetForm}
                style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>

          {!editingId ? (
            <View style={tw`mt-4`}>
              <Text style={tw`text-xs font-extrabold uppercase tracking-widest text-[#49739c] dark:text-white/60 mb-2`}>
                Quick templates
              </Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {TEMPLATES.map((t) => (
                  <Chip key={t.name} label={t.name} onPress={() => handlePickTemplate(t)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={tw`mt-4 gap-3`}>
            <View>
              <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>Name</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                placeholder="Debate Club"
                placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                style={tw`mt-2 h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
              />
            </View>

            <View>
              <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>
                Meeting schedule (optional)
              </Text>
              <TextInput
                value={form.meeting_schedule}
                onChangeText={(v) => setForm((p) => ({ ...p, meeting_schedule: v }))}
                placeholder="Every Friday 3:30pm — Room 12"
                placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                style={tw`mt-2 h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
              />
            </View>

            <View>
              <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>
                Description (optional)
              </Text>
              <TextInput
                value={form.description}
                onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
                placeholder="What does this club do?"
                placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                multiline
                textAlignVertical="top"
                style={tw`mt-2 h-24 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 py-3 text-[#0d141c] dark:text-white`}
              />
            </View>

            <View>
              <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>
                Advisor id (optional, UUID only)
              </Text>
              <TextInput
                value={form.advisor_id}
                onChangeText={(v) => setForm((p) => ({ ...p, advisor_id: v }))}
                placeholder="Leave blank unless you have a UUID"
                placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                autoCapitalize="none"
                style={tw`mt-2 h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
              />
              {form.advisor_id?.trim() && !isUuid(form.advisor_id.trim()) ? (
                <Text style={tw`text-[11px] text-amber-700 dark:text-amber-200 mt-1`}>
                  Not a UUID — it won’t be sent (prevents 400 errors).
                </Text>
              ) : null}
            </View>

            <Checkbox
              value={form.is_active}
              onToggle={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
              label="Active"
            />

            <View style={tw`flex-row flex-wrap gap-2 mt-1`}>
              <Pressable
                disabled={!canSave || saving || missingCtx}
                onPress={handleSave}
                style={tw`h-10 px-4 rounded-xl bg-blue-600 items-center justify-center ${
                  !canSave || saving || missingCtx ? 'opacity-60' : ''
                }`}
              >
                <Text style={tw`text-sm font-bold text-white`}>
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save club'}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!orgId || !clubToken) return;
                  fetchClubs();
                  if (mode === 'mine') fetchMine();
                }}
                style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>Refresh list</Text>
              </Pressable>
            </View>
          </View>
        </Card>

        {/* List */}
        <View style={tw`mt-4`} />
        <Card>
          <View style={tw`flex-row items-center justify-between gap-2`}>
            <View style={tw`flex-row flex-wrap gap-2`}>
              <Chip label="All clubs" active={mode === 'all'} onPress={() => setMode('all')} />
              <Chip label="My clubs" active={mode === 'mine'} onPress={() => setMode('mine')} />
            </View>

            <View style={tw`flex-1`} />
          </View>

          <View style={tw`mt-3`}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search clubs…"
              placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
              style={tw`h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
            />
          </View>

          {mode === 'mine' && (myClubsLoading || myClubsError || showMineHeadsUp) ? (
            <View style={tw`mt-3 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] p-3`}>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                {showMineHeadsUp
                  ? 'My clubs requires a valid session token.'
                  : myClubsLoading
                  ? 'Loading my clubs…'
                  : myClubsError}
              </Text>
            </View>
          ) : null}

          <View style={tw`mt-3 flex-row items-center justify-between`}>
            <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
              {loading
                ? 'Loading…'
                : `Showing ${list.length ? (page - 1) * pageSize + 1 : 0}-${Math.min(
                    page * pageSize,
                    list.length,
                  )} of ${list.length}`}
            </Text>

            <View style={tw`flex-row items-center gap-2`}>
              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>Rows:</Text>
              <View style={tw`flex-row gap-2`}>
               {[10, 25, 50].map((n) => (
                <Chip
                  key={n}
                  label={String(n)}
                  active={pageSize === n}
                  onPress={() => {
                    setPage(1);
                    setPageSize(n);
                  }}
                />
              ))}

              </View>
            </View>
          </View>

          <View style={tw`mt-4`}>
            {loading ? (
              <View style={tw`py-3 flex-row items-center gap-2`}>
                <ActivityIndicator />
                <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>Loading clubs…</Text>
              </View>
            ) : !list.length ? (
              <Text style={tw`py-3 text-sm text-[#49739c] dark:text-white/70`}>
                No clubs yet. Create one above.
              </Text>
            ) : (
              <View style={tw`gap-3`}>
                {paginatedList.map((c: any) => (
                  <View
                    key={String(c.id)}
                    style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620] p-3`}
                  >
                    <View style={tw`flex-row items-start justify-between gap-2`}>
                      <View style={tw`flex-1 pr-2`}>
                        <View style={tw`flex-row flex-wrap items-center gap-2`}>
                          <Text
                            numberOfLines={1}
                            style={tw`text-sm font-extrabold text-[#0d141c] dark:text-white`}
                          >
                            {String(c.name || '')}
                          </Text>

                          <Pill label={c.is_active ? 'Active' : 'Inactive'} kind={c.is_active ? 'green' : 'slate'} />
                          <Pill label={`${safeCount(c.member_count)} members`} kind="slate" />
                        </View>

                        <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-1`}>
                          {c.meeting_schedule ? String(c.meeting_schedule) : 'Schedule: TBC'}
                        </Text>

                        {c.description ? (
                          <Text style={tw`text-sm text-[#0d141c] dark:text-white/90 mt-2`}>
                            {String(c.description)}
                          </Text>
                        ) : null}
                      </View>

                      <View style={tw`gap-2`}>
                        <Pressable
                          onPress={() => openMembers(c)}
                          style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Members</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleEditClick(c)}
                          style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Edit</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => handleToggleActive(c)}
                          style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>
                            {c.is_active ? 'Deactivate' : 'Activate'}
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            Alert.alert(
                              'Delete club?',
                              `Delete "${String(c.name || 'this club')}"?`,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Delete',
                                  style: 'destructive',
                                  onPress: () => removeClub(Number(c.id)),
                                },
                              ]
                            );
                          }}
                          style={tw`h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 items-center justify-center`}
                        >
                          <Text style={tw`text-xs font-bold text-rose-700 dark:text-rose-200`}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {!loading && list.length ? (
            <View style={tw`mt-3 flex-row items-center justify-between`}>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === 1 ? 'opacity-50' : ''}`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>‹ Prev</Text>
              </Pressable>

              <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                Page {page} of {totalPages}
              </Text>

              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={tw`px-3 py-2 rounded-xl bg-[#e7edf4] dark:bg-[#172534] ${page === totalPages ? 'opacity-50' : ''}`}
              >
                <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>Next ›</Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-4`}>
            Note: Clubs endpoints require Pro tier + Org Instructor. If you’re not an instructor, the API returns 403.
          </Text>
        </Card>

        {/* Members Modal */}
        <Modal visible={membersOpen} transparent animationType="slide" onRequestClose={closeMembers}>
          <View style={tw`flex-1 bg-black/40 justify-end`}>
            <View style={tw`rounded-t-3xl bg-white dark:bg-[#0f1821] border border-[#cedbe8] dark:border-white/10 p-4 max-h-[88%]`}>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={tw`text-base font-extrabold text-[#0d141c] dark:text-white`}>
                    Members • {activeClub?.name || 'Club'}
                  </Text>
                  <Text style={tw`text-xs text-[#49739c] dark:text-white/70 mt-1`}>
                    Type admission to auto-resolve learner + lock correct member id.
                  </Text>
                </View>

                <Pressable
                  onPress={closeMembers}
                  style={tw`h-9 px-3 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                >
                  <Text style={tw`text-xs font-bold text-[#0d141c] dark:text-white`}>Close</Text>
                </Pressable>
              </View>

              <ScrollView style={tw`mt-4`} contentContainerStyle={tw`pb-6`} keyboardShouldPersistTaps="handled">
                {/* Enroll */}
                <View style={tw`gap-3`}>
                  <View>
                    <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>
                      Admission code / no
                    </Text>
                    <TextInput
                      value={memberForm.admission_code}
                      onChangeText={(v) => setMemberForm((p) => ({ ...p, admission_code: v }))}
                      placeholder="Type admission no (e.g. ADM001)"
                      placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                      autoCapitalize="none"
                      style={tw`mt-2 h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                    />

                    {/* Suggestions (native datalist replacement) */}
                    {admissionSuggestions.length ? (
                      <View style={tw`mt-2 rounded-2xl border border-[#cedbe8] dark:border-white/10 bg-white dark:bg-[#0b1620]`}>
                        {admissionSuggestions.map((l) => {
                          const code = pickAdmissionCode(l);
                          return (
                            <Pressable
                              key={String(code)}
                              onPress={() =>
                                setMemberForm((p) => ({
                                  ...p,
                                  admission_code: String(code),
                                }))
                              }
                              style={tw`px-3 py-2 border-b border-[#cedbe8] dark:border-white/10`}
                            >
                              <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>
                                {String(code)}
                              </Text>
                              <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-0.5`}>
                                {pickLearnerName(l)}
                                {String((l as any)?.class_label || '') ? ` • ${(l as any).class_label}` : ''}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={tw`mt-2`}>
                      {memberForm.admission_code.trim() ? (
                        matchedLearner ? (
                          <Text style={tw`text-xs text-emerald-700 dark:text-emerald-200`}>
                            ✅ {pickLearnerName(matchedLearner)}
                            {String((matchedLearner as any)?.class_label || '') ? ` • ${(matchedLearner as any).class_label}` : ''}
                            <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
                              {'  '}
                              (member_id: {resolvedMemberId || '—'})
                            </Text>
                          </Text>
                        ) : (
                          <Text style={tw`text-xs text-amber-700 dark:text-amber-200`}>
                            No learner found for that admission code.
                          </Text>
                        )
                      ) : (
                        <Text style={tw`text-xs text-[#49739c] dark:text-white/70`}>
                          Start typing to auto-resolve learner.
                        </Text>
                      )}
                    </View>

                    {/* Fallback id */}
                    {!matchedLearner ? (
                      <View style={tw`mt-2`}>
                        <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60`}>
                          If you must add someone not in roster, paste internal id below.
                        </Text>
                        <TextInput
                          value={memberForm.member_id_fallback}
                          onChangeText={(v) => setMemberForm((p) => ({ ...p, member_id_fallback: v }))}
                          placeholder="Internal member_id (optional)"
                          placeholderTextColor={tw.color('text-white/60') || '#94a3b8'}
                          autoCapitalize="none"
                          style={tw`mt-2 h-11 rounded-xl border border-[#cedbe8] dark:border-white/10 bg-slate-50 dark:bg-[#0b1620] px-3 text-[#0d141c] dark:text-white`}
                        />
                      </View>
                    ) : null}
                  </View>

                  {/* Role chips */}
                  <View>
                    <Text style={tw`text-xs font-semibold text-[#49739c] dark:text-white/70`}>Role</Text>
                    <View style={tw`flex-row flex-wrap gap-2 mt-2`}>
                      {ROLE_OPTIONS.map((r) => (
                        <Chip
                          key={r}
                          label={r}
                          active={memberForm.role === r}
                          onPress={() => setMemberForm((p) => ({ ...p, role: r }))}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={tw`flex-row flex-wrap gap-2`}>
                    <Pressable
                      disabled={!resolvedIsUsable || saving}
                      onPress={doEnroll}
                      style={tw`h-10 px-4 rounded-xl bg-blue-600 items-center justify-center ${
                        !resolvedIsUsable || saving ? 'opacity-60' : ''
                      }`}
                    >
                      <Text style={tw`text-sm font-bold text-white`}>
                        {saving ? 'Adding…' : 'Add member'}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (!activeClub) return;
                        fetchMembers(Number(activeClub.id));
                      }}
                      style={tw`h-10 px-4 rounded-xl bg-[#e7edf4] dark:bg-[#172534] items-center justify-center`}
                    >
                      <Text style={tw`text-sm font-bold text-[#0d141c] dark:text-white`}>Refresh</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Members list */}
                <View style={tw`mt-4`}>
                  <View style={tw`rounded-2xl border border-[#cedbe8] dark:border-white/10 overflow-hidden`}>
                    {!members?.length ? (
                      <View style={tw`p-3 bg-white dark:bg-[#0b1620]`}>
                        <Text style={tw`text-sm text-[#49739c] dark:text-white/70`}>No members yet.</Text>
                      </View>
                    ) : (
                      (members as any[]).map((m) => {
                        const info = renderMemberTitle(m);
                        return (
                          <View
                            key={`${String(m.club_id)}-${String(m.member_id)}`}
                            style={tw`p-3 bg-white dark:bg-[#0b1620] border-b border-[#cedbe8] dark:border-white/10`}
                          >
                            <View style={tw`flex-row items-start justify-between gap-2`}>
                              <View style={tw`flex-1 pr-2`}>
                                <Text style={tw`text-sm font-extrabold text-[#0d141c] dark:text-white`} numberOfLines={1}>
                                  {info.name}
                                </Text>
                                <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-1`}>
                                  role: {String(m.role || 'member')}
                                  {info.admission ? ` • ${String(info.admission)}` : ''}
                                  {info.class_label ? ` • ${String(info.class_label)}` : ''}
                                  {m.email ? ` • ${String(m.email)}` : ''}
                                </Text>
                                <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-1`}>
                                  member_id: {String(m.member_id ?? '')}
                                </Text>
                              </View>

                              <Pressable
                                onPress={() => {
                                  Alert.alert(
                                    'Remove member?',
                                    'Remove this member from the club?',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Remove',
                                        style: 'destructive',
                                        onPress: () => doUnenroll(m.member_id),
                                      },
                                    ]
                                  );
                                }}
                                style={tw`h-9 px-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/20 items-center justify-center`}
                              >
                                <Text style={tw`text-xs font-bold text-rose-700 dark:text-rose-200`}>
                                  Remove
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>

                  <Text style={tw`text-[11px] text-[#49739c] dark:text-white/60 mt-3`}>
                    Roster: {rosterQuery.isLoading ? 'Loading…' : `${learners.length} learners`} • This UI locks the proper
                    member ref by default.
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

export default OrgToolsClubsNative;
