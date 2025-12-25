// apps/mobile/src/screens/org/OrgAttendance.native.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import tw from '../../../tailwind';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAttendance } from '@mytutorapp/shared/hooks/useOrgAttendance';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';

/* ─────────────────────────────────────────────────────────
 * Shared helpers (ported from web)
 * ───────────────────────────────────────────────────────── */

function isUuid(v: any) {
  const s = String(v || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
function isIntLike(v: any) {
  const s = String(v || '');
  return /^\d+$/.test(s);
}

function learnerKey(l: any) {
  const uuidCandidate =
    l?.learner_profile_id ||
    l?.org_learner_profile_id ||
    l?.org_learner_id ||
    (isUuid(l?.learner_id) ? l.learner_id : null) ||
    (isUuid(l?.id) ? l.id : null);

  if (uuidCandidate) return String(uuidCandidate);

  const intCandidate =
    (isIntLike(l?.user_id) ? l.user_id : null) ||
    (isIntLike(l?.userId) ? l.userId : null) ||
    (isIntLike(l?.learner_id) ? l.learner_id : null) ||
    (isIntLike(l?.id) ? l.id : null);

  return intCandidate ? String(intCandidate) : '';
}

function learnerKeysAll(l: any) {
  const keys = new Set<string>();

  const uuidCandidate =
    l?.learner_profile_id ||
    l?.org_learner_profile_id ||
    l?.org_learner_id ||
    (isUuid(l?.learner_id) ? l.learner_id : null) ||
    (isUuid(l?.id) ? l.id : null);

  if (uuidCandidate) keys.add(String(uuidCandidate));

  const intCandidate =
    (isIntLike(l?.user_id) ? l.user_id : null) ||
    (isIntLike(l?.userId) ? l.userId : null) ||
    (isIntLike(l?.learner_id) ? l.learner_id : null) ||
    (isIntLike(l?.id) ? l.id : null);

  if (intCandidate) keys.add(String(intCandidate));

  const best = learnerKey(l);
  if (best) keys.add(best);

  return Array.from(keys).filter(Boolean);
}

function pickLearnerName(l: any) {
  return String(l?.name || l?.full_name || l?.display_name || l?.fullName || '').trim();
}
function pickAdmissionNo(l: any) {
  return String(
    l?.admission_code || l?.admission || l?.admission_no || l?.admissionNumber || l?.admission_number || '',
  ).trim();
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function shareCsvNative(filename: string, csvText: string) {
  // Best effort: expo-file-system + expo-sharing; fallback to Share message
  try {
    const FileSystem = await import('expo-file-system');
    const path = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + filename;

    await FileSystem.writeAsStringAsync(path, csvText, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    try {
      const Sharing = await import('expo-sharing');
      const ok = await Sharing.isAvailableAsync?.();
      if (ok) {
        await Sharing.shareAsync(path, {
          mimeType: 'text/csv',
          dialogTitle: 'Share attendance CSV',
          UTI: 'public.comma-separated-values-text',
        });
        return true;
      }
    } catch {}

    // Fallback: plain share text
    const { Share } = await import('react-native');
    await Share.share({ title: filename, message: csvText });
    return true;
  } catch {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────
 * UI bits (theme-aware)
 * ───────────────────────────────────────────────────────── */

const statuses = ['present', 'absent', 'late', 'excused'] as const;
type Status = (typeof statuses)[number];

function prettyStatus(s?: string) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const Chip = ({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  theme: any;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      tw`mr-2 mb-2 px-3 py-2 rounded-full border`,
      {
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primarySoft : 'transparent',
      },
    ]}
    accessibilityRole="button"
  >
    <Text style={[tw`text-xs font-semibold`, { color: active ? theme.primary : theme.subtext }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const StatusPill = ({
  label,
  active,
  onPress,
  theme,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  theme: any;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      tw`px-3 py-2 rounded-full border`,
      {
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primary : 'transparent',
      },
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: !!active }}
  >
    <Text style={[tw`text-xs font-semibold`, { color: active ? '#fff' : theme.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const Banner = ({
  tone,
  msg,
  theme,
}: {
  tone: 'ok' | 'warn';
  msg: string;
  theme: any;
}) => (
  <View
    style={[
      tw`rounded-2xl border p-3`,
      {
        borderColor: tone === 'ok' ? theme.okBorder : theme.warnBorder,
        backgroundColor: tone === 'ok' ? theme.okBg : theme.warnBg,
      },
    ]}
  >
    <Text style={[tw`text-sm`, { color: theme.text }]}>{msg}</Text>
  </View>
);

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  theme,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  theme: any;
  keyboardType?: any;
}) => (
  <View style={tw`mb-3`}>
    <Text style={[tw`text-xs uppercase tracking-wider mb-1`, { color: theme.muted }]}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      keyboardType={keyboardType}
      style={[
        tw`rounded-xl px-3 py-3 border`,
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
          color: theme.text,
        },
      ]}
    />
  </View>
);

const PrimaryBtn = ({
  label,
  onPress,
  disabled,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: any;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      tw`px-4 py-3 rounded-xl`,
      { backgroundColor: disabled ? theme.border : theme.primary, opacity: disabled ? 0.6 : 1 },
    ]}
  >
    <Text style={tw`text-white font-semibold text-sm`}>{label}</Text>
  </TouchableOpacity>
);

const GhostBtn = ({
  label,
  onPress,
  disabled,
  theme,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: any;
  danger?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={[
      tw`px-4 py-3 rounded-xl border`,
      {
        borderColor: danger ? theme.dangerBorder : theme.border,
        backgroundColor: 'transparent',
        opacity: disabled ? 0.6 : 1,
      },
    ]}
  >
    <Text
      style={[
        tw`font-semibold text-sm`,
        { color: danger ? theme.danger : theme.text },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const ConfirmModal = ({
  open,
  title,
  body,
  confirmText = 'Confirm',
  danger,
  onClose,
  onConfirm,
  theme,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  theme: any;
}) => (
  <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[tw`flex-1 items-center justify-center px-4`, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
      <View
        style={[
          tw`w-full rounded-3xl border p-4`,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <Text style={[tw`text-base font-semibold`, { color: theme.text }]}>{title}</Text>
        <View style={tw`mt-2`}>
          <Text style={[tw`text-sm`, { color: theme.subtext }]}>{body as any}</Text>
        </View>

        <View style={tw`mt-4 flex-row justify-end`}>
          <TouchableOpacity onPress={onClose} style={tw`px-3 py-2 mr-2`}>
            <Text style={[tw`font-semibold`, { color: theme.subtext }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirm}
            style={[
              tw`px-4 py-3 rounded-xl`,
              { backgroundColor: danger ? theme.danger : theme.primary },
            ]}
          >
            <Text style={tw`text-white font-semibold`}>{confirmText}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

/* ─────────────────────────────────────────────────────────
 * Screen
 * ───────────────────────────────────────────────────────── */

export default function OrgAttendanceNative() {
  const scheme = useColorScheme();
  const theme = useMemo(() => {
    const dark = scheme === 'dark';
    return {
      dark,
      bg: dark ? '#0b1220' : '#f8fafc',
      card: dark ? '#0f172a' : '#ffffff',
      border: dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.12)',
      text: dark ? '#e2e8f0' : '#0f172a',
      subtext: dark ? 'rgba(226,232,240,0.75)' : 'rgba(15,23,42,0.65)',
      muted: dark ? 'rgba(226,232,240,0.55)' : 'rgba(15,23,42,0.45)',
      primary: '#2563eb',
      primarySoft: dark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.12)',
      okBg: dark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)',
      okBorder: dark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.25)',
      warnBg: dark ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)',
      warnBorder: dark ? 'rgba(245,158,11,0.40)' : 'rgba(245,158,11,0.28)',
      danger: '#dc2626',
      dangerBorder: dark ? 'rgba(220,38,38,0.38)' : 'rgba(220,38,38,0.22)',
    };
  }, [scheme]);

  const { orgToken, token, backendUrl } = useShopContext() as any;
  const { isPro, upgradeCta, org, classLabels = [] } = (useOrgProTools?.() ?? {}) as any;

  const attendance = useOrgAttendance({
    backendUrl,
    token: orgToken || token,
    orgId: org?.id,
  }) as any;

  const {
    ready,
    missing,
    sessions,
    loading: sessionsLoading,
    saving: attendanceSaving,
    fetchSessions,
    fetchSession,
    fetchReport,
    saveSession,
    saveEntries: saveEntriesApi,
    clearEntries: clearEntriesApi,
  } = attendance;

  const [flash, setFlash] = useState<{ tone: 'ok' | 'warn'; msg: string } | null>(null);

  // create
  const [form, setForm] = useState({ session_date: '', class_label: '', period_label: '' });
  const canSaveSession = useMemo(() => Boolean(form.session_date), [form.session_date]);

  // filters
  const [filters, setFilters] = useState({ start: '', end: '', class_label: '' });

  // selection + editor
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [savingEntries, setSavingEntries] = useState(false);
  const [q, setQ] = useState('');

  // clear saved confirm
  const [confirmClearSaved, setConfirmClearSaved] = useState(false);

  // roster
  const [rosterLoading, setRosterLoading] = useState(false);
  const [learnersAll, setLearnersAll] = useState<any[]>([]);

  // entryDraft: learnerKey -> {status, note}
  const [entryDraft, setEntryDraft] = useState<Record<string, { status?: Status; note?: string }>>({});

  const missingIdCount = useMemo(
    () => (Array.isArray(learnersAll) ? learnersAll.filter((l: any) => !learnerKey(l)).length : 0),
    [learnersAll],
  );

  const rosterIndex = useMemo(() => {
    const map = new Map<string, { name: string; admission: string }>();
    const list = Array.isArray(learnersAll) ? learnersAll : [];
    for (const l of list) {
      const name = pickLearnerName(l);
      const admission = pickAdmissionNo(l);
      for (const k of learnerKeysAll(l)) map.set(k, { name, admission });
    }
    return map;
  }, [learnersAll]);

  const loadRoster = useCallback(async () => {
    if (!ready) return;
    setRosterLoading(true);
    try {
      const res: any = await getOrgRoster(backendUrl, orgToken || token, org?.id);
      const learners = res?.learners || res?.items || res?.rows || [];
      setLearnersAll(Array.isArray(learners) ? learners : []);
    } catch {
      // silent (best effort)
    } finally {
      setRosterLoading(false);
    }
  }, [ready, backendUrl, orgToken, token, org?.id]);

  const loadList = useCallback(async () => {
    if (!ready) return;
    await fetchSessions({
      start: filters.start || undefined,
      end: filters.end || undefined,
      class_label: filters.class_label || undefined,
      limit: 50,
      offset: 0,
    });
  }, [ready, fetchSessions, filters.start, filters.end, filters.class_label]);

  useEffect(() => {
    if (!ready) return;
    loadList();
    loadRoster();
  }, [ready, loadList, loadRoster]);

  const learnersForSelected = useMemo(() => {
    const classLabel = selectedSession?.class_label || '';
    const list = Array.isArray(learnersAll) ? learnersAll : [];
    const filtered = classLabel ? list.filter((l: any) => (l.class_label || '') === classLabel) : list;

    const qq = q.trim().toLowerCase();
    if (!qq) return filtered;

    return filtered.filter((l: any) => {
      const name = String(l.name || l.full_name || l.display_name || '').toLowerCase();
      const code = String(l.admission_code || l.admission || '').toLowerCase();
      return name.includes(qq) || code.includes(qq);
    });
  }, [learnersAll, selectedSession?.class_label, q]);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
    for (const l of learnersForSelected) {
      const id = learnerKey(l);
      if (!id) continue;
      const s = entryDraft[id]?.status;
      if (!s) c.unmarked += 1;
      else c[s] += 1;
    }
    return c;
  }, [learnersForSelected, entryDraft]);

  const markedCount = useMemo(
    () => counts.present + counts.absent + counts.late + counts.excused,
    [counts],
  );

  const openSession = useCallback(
    async (idRaw: any) => {
      const id = Number(idRaw);
      if (!Number.isFinite(id)) return;

      setSelectedId(id);
      setFlash(null);

      try {
        const s = await fetchSession(id);
        setSelectedSession(s);

        // hydrate entryDraft from existing entries
        const m: Record<string, { status?: Status; note?: string }> = {};
        for (const e of s?.entries || []) {
          const uuid = String(e?.learner_id || '').trim();
          const uid = String(e?.user_id || '').trim();
          const payload = { status: e.status, note: e.note || '' };

          if (uid) m[uid] = payload;   // prefer numeric user_id
          if (uuid) m[uuid] = payload; // also store uuid
        }
        setEntryDraft(m);
      } catch (e: any) {
        setFlash({ tone: 'warn', msg: e?.message || 'Failed to open session.' });
      }
    },
    [fetchSession],
  );

  const handleSaveSession = useCallback(async () => {
    if (!ready) {
      setFlash({ tone: 'warn', msg: `Attendance not ready: missing ${missing.join(', ')}` });
      return;
    }
    if (!canSaveSession) return;

    setFlash(null);

    try {
      const created = await saveSession({
        session_date: form.session_date,
        class_label: form.class_label || undefined,
        period_label: form.period_label || undefined,
      });

      if (!created) {
        setFlash({
          tone: 'warn',
          msg: 'Could not save. You may be logged out, missing org access, or not Pro/Instructor.',
        });
        return;
      }

      setFlash({ tone: 'ok', msg: 'Session saved. Now take attendance ↓' });
      setForm({ session_date: '', class_label: '', period_label: '' });

      await openSession(created.id);
      await loadList();
    } catch (e: any) {
      setFlash({ tone: 'warn', msg: e?.response?.data?.message || e?.message || 'Unable to save session.' });
    }
  }, [ready, missing, canSaveSession, saveSession, form, openSession, loadList]);

  const markAll = (s: Status) => {
    const next = { ...entryDraft };
    for (const l of learnersForSelected) {
      const id = learnerKey(l);
      if (!id) continue;
      next[id] = { ...(next[id] || {}), status: s };
    }
    setEntryDraft(next);
  };

  const clearAll = () => setEntryDraft({});

  const clearSavedAttendance = useCallback(async () => {
    if (!ready || !selectedId) return;

    setFlash(null);
    setConfirmClearSaved(false);
    setSavingEntries(true);

    try {
      const r: any = await clearEntriesApi(selectedId);
      setEntryDraft({});
      setFlash({ tone: 'ok', msg: `Saved attendance cleared (${r?.deleted ?? 0} entries).` });

      await openSession(selectedId);
      await loadList();
    } catch (e: any) {
      setFlash({
        tone: 'warn',
        msg: e?.response?.data?.message || e?.message || 'Failed to clear saved attendance.',
      });
    } finally {
      setSavingEntries(false);
    }
  }, [ready, selectedId, clearEntriesApi, openSession, loadList]);

  const saveEntries = useCallback(async () => {
    if (!ready || !selectedId) return;

    let missingCount = 0;

    const entries = learnersForSelected
      .map((l: any) => {
        const id = learnerKey(l);
        if (!id) {
          missingCount += 1;
          return null;
        }

        const s = entryDraft[id]?.status;
        if (!s) return null;

        return { learner_id: id, status: s, note: entryDraft[id]?.note || null };
      })
      .filter(Boolean) as any[];

    if (entries.length === 0) {
      setFlash({
        tone: 'warn',
        msg:
          missingCount > 0
            ? `No attendance saved because learners are missing IDs (${missingCount} skipped). Fix roster to include learner profile uuid or user_id.`
            : 'Nothing to save yet. Mark at least one learner (or tap “Mark all present”).',
      });
      return;
    }

    if (missingCount) {
      setFlash({
        tone: 'warn',
        msg: `Some learners have no usable id (${missingCount}). They were skipped.`,
      });
    } else {
      setFlash(null);
    }

    setSavingEntries(true);
    try {
      await saveEntriesApi(selectedId, entries);
      setFlash({ tone: 'ok', msg: 'Attendance saved.' });
      await openSession(selectedId);
      await loadList();
    } catch (e: any) {
      setFlash({
        tone: 'warn',
        msg: e?.response?.data?.message || e?.message || 'Failed to save attendance entries.',
      });
    } finally {
      setSavingEntries(false);
    }
  }, [ready, selectedId, learnersForSelected, entryDraft, saveEntriesApi, openSession, loadList]);

  const exportCsv = useCallback(async () => {
    if (!ready) {
      setFlash({ tone: 'warn', msg: `Attendance not ready: missing ${missing.join(', ')}` });
      return;
    }

    // Ensure roster best-effort
    if (!learnersAll?.length && !rosterLoading) {
      try {
        await loadRoster();
      } catch {}
    }

    try {
      const rep: any = await fetchReport({
        start: filters.start || undefined,
        end: filters.end || undefined,
        class_label: filters.class_label || undefined,
      });

      const reportSessions = Array.isArray(rep) ? rep : rep?.sessions || rep?.rows || [];

      const headers = [
        'session_id',
        'session_date',
        'class_label',
        'period_label',
        'learner_name',
        'admission_number',
        'status',
        'note',
      ];

      const rows: Array<Record<string, any>> = [];

      for (const s of reportSessions) {
        const session_id = s?.session_id ?? s?.id ?? '';
        const session_date = s?.session_date ?? s?.date ?? '';
        const class_label = s?.class_label ?? '';
        const period_label = s?.period_label ?? '';

        const entries = Array.isArray(s?.entries) ? s.entries : [];
        for (const e of entries) {
          const uid = String(e?.user_id ?? '').trim();
          const lid = String(e?.learner_id ?? '').trim();

          const info = (uid && rosterIndex.get(uid)) || (lid && rosterIndex.get(lid)) || null;

          rows.push({
            session_id,
            session_date,
            class_label,
            period_label,
            learner_name: info?.name || '',
            admission_number: info?.admission || '',
            status: e?.status ?? '',
            note: e?.note ?? '',
          });
        }
      }

      const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\r\n');

      const filename =
        `attendance-report` +
        (filters.start ? `_${filters.start}` : '') +
        (filters.end ? `_${filters.end}` : '') +
        (filters.class_label ? `_${filters.class_label}` : '') +
        `.csv`;

      const ok = await shareCsvNative(filename, csv);

      if (!ok) {
        setFlash({ tone: 'warn', msg: 'Could not share CSV on this device. (Missing sharing support)' });
        return;
      }

      if (!rows.length) setFlash({ tone: 'warn', msg: 'Exported an empty CSV (no saved entries in that range).' });
      else setFlash({ tone: 'ok', msg: `Exported ${rows.length} row(s).` });
    } catch (e: any) {
      setFlash({ tone: 'warn', msg: e?.response?.data?.message || e?.message || 'Export failed.' });
    }
  }, [
    ready,
    missing,
    learnersAll?.length,
    rosterLoading,
    loadRoster,
    fetchReport,
    filters.start,
    filters.end,
    filters.class_label,
    rosterIndex,
  ]);

  const classOptions: string[] = useMemo(() => {
    const xs = Array.isArray(classLabels) ? classLabels.filter(Boolean) : [];
    // ensure unique
    return Array.from(new Set(xs.map(String)));
  }, [classLabels]);

  return (
    <View style={[tw`flex-1`, { backgroundColor: theme.bg }]}>
      <ConfirmModal
        open={confirmClearSaved}
        title="Clear saved attendance?"
        body={
          'This will permanently remove all saved entries for this session from the database.\n\nTip: Use “Clear draft” if you only want to reset the UI.'
        }
        confirmText="Yes, clear saved"
        danger
        onClose={() => setConfirmClearSaved(false)}
        onConfirm={clearSavedAttendance}
        theme={theme}
      />

      <ScrollView contentContainerStyle={tw`px-4 pt-6 pb-28`}>
        {/* Header */}
        <View style={tw`mb-4`}>
          <Text style={[tw`text-xs uppercase tracking-wider`, { color: theme.primary }]}>Org tools</Text>
          <View style={tw`flex-row items-center justify-between mt-1`}>
            <Text style={[tw`text-2xl font-bold`, { color: theme.text }]}>Attendance</Text>
            <View
              style={[
                tw`px-3 py-1 rounded-full border`,
                { borderColor: theme.border, backgroundColor: theme.primarySoft },
              ]}
            >
              <Text style={[tw`text-xs font-semibold`, { color: theme.primary }]}>Pro / Enterprise</Text>
            </View>
          </View>
          <Text style={[tw`text-sm mt-1`, { color: theme.subtext }]}>
            Create sessions → open a session → mark Present/Absent/Late → save.
          </Text>
        </View>

        {!ready ? (
          <Banner
            tone="warn"
            msg={`Attendance not ready: missing ${Array.isArray(missing) ? missing.join(', ') : ''}`}
            theme={theme}
          />
        ) : null}

        {ready && !rosterLoading && missingIdCount > 0 ? (
          <View style={tw`mt-3`}>
            <Banner
              tone="warn"
              msg={`Heads up: ${missingIdCount} learner(s) in your roster have no usable id. They will be skipped when saving attendance. Ensure roster rows include org_learner_profiles.id (uuid) or user_id.`}
              theme={theme}
            />
          </View>
        ) : null}

        {flash ? (
          <View style={tw`mt-3`}>
            <Banner tone={flash.tone} msg={flash.msg} theme={theme} />
          </View>
        ) : null}

        {!isPro && upgradeCta ? (
          <View style={[tw`mt-4 rounded-3xl border p-4`, { borderColor: theme.warnBorder, backgroundColor: theme.warnBg }]}>
            <Text style={[tw`font-bold`, { color: theme.text }]}>{upgradeCta.headline}</Text>
            <Text style={[tw`mt-1`, { color: theme.subtext }]}>{upgradeCta.body}</Text>
          </View>
        ) : null}

        {/* New session */}
        <View style={[tw`mt-4 rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>New session</Text>
            <Text style={[tw`text-xs`, { color: theme.muted }]}>Required: date (YYYY-MM-DD)</Text>
          </View>

          <View style={tw`mt-3`}>
            <Field
              label="Session date"
              value={form.session_date}
              onChange={(session_date) => setForm((p) => ({ ...p, session_date }))}
              placeholder="2025-12-25"
              theme={theme}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            />

            <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>
              Class label (optional)
            </Text>

            {classOptions.length ? (
              <View style={tw`flex-row flex-wrap`}>
                <Chip
                  label="General"
                  active={!form.class_label}
                  onPress={() => setForm((p) => ({ ...p, class_label: '' }))}
                  theme={theme}
                />
                {classOptions.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={form.class_label === c}
                    onPress={() => setForm((p) => ({ ...p, class_label: c }))}
                    theme={theme}
                  />
                ))}
              </View>
            ) : (
              <Field
                label="Class label"
                value={form.class_label}
                onChange={(class_label) => setForm((p) => ({ ...p, class_label }))}
                placeholder="Grade 9"
                theme={theme}
              />
            )}

            <Field
              label="Period label (optional)"
              value={form.period_label}
              onChange={(period_label) => setForm((p) => ({ ...p, period_label }))}
              placeholder="Morning"
              theme={theme}
            />

            <View style={tw`flex-row flex-wrap gap-2 mt-2`}>
              <View style={tw`mr-2 mb-2`}>
                <PrimaryBtn
                  label={attendanceSaving ? 'Saving…' : 'Save & take attendance'}
                  onPress={handleSaveSession}
                  disabled={!ready || !canSaveSession || attendanceSaving}
                  theme={theme}
                />
              </View>
              <View style={tw`mr-2 mb-2`}>
                <GhostBtn
                  label={sessionsLoading ? 'Refreshing…' : 'Refresh'}
                  onPress={loadList}
                  disabled={!ready || sessionsLoading}
                  theme={theme}
                />
              </View>
              <View style={tw`mr-2 mb-2`}>
                <GhostBtn
                  label="Export CSV"
                  onPress={exportCsv}
                  disabled={!ready}
                  theme={theme}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Sessions */}
        <View style={[tw`mt-4 rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>Sessions</Text>
            <Text style={[tw`text-xs`, { color: theme.muted }]}>
              {sessionsLoading ? 'Loading…' : `${Array.isArray(sessions) ? sessions.length : 0} shown`}
            </Text>
          </View>

          <View style={tw`mt-3`}>
            <Field
              label="From (YYYY-MM-DD)"
              value={filters.start}
              onChange={(start) => setFilters((p) => ({ ...p, start }))}
              placeholder="2025-12-01"
              theme={theme}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            />
            <Field
              label="To (YYYY-MM-DD)"
              value={filters.end}
              onChange={(end) => setFilters((p) => ({ ...p, end }))}
              placeholder="2025-12-31"
              theme={theme}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
            />

            <Text style={[tw`text-xs uppercase tracking-wider mb-2`, { color: theme.muted }]}>
              Filter by class (optional)
            </Text>

            {classOptions.length ? (
              <View style={tw`flex-row flex-wrap`}>
                <Chip
                  label="All"
                  active={!filters.class_label}
                  onPress={() => setFilters((p) => ({ ...p, class_label: '' }))}
                  theme={theme}
                />
                {classOptions.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={filters.class_label === c}
                    onPress={() => setFilters((p) => ({ ...p, class_label: c }))}
                    theme={theme}
                  />
                ))}
              </View>
            ) : (
              <Field
                label="Class"
                value={filters.class_label}
                onChange={(class_label) => setFilters((p) => ({ ...p, class_label }))}
                placeholder="All classes"
                theme={theme}
              />
            )}

            <View style={tw`mt-2`}>
              {sessionsLoading ? (
                <View style={tw`py-3 flex-row items-center`}>
                  <ActivityIndicator />
                  <Text style={[tw`ml-2`, { color: theme.subtext }]}>Loading sessions…</Text>
                </View>
              ) : !sessions?.length ? (
                <Text style={[tw`py-3`, { color: theme.subtext }]}>No sessions yet.</Text>
              ) : (
                <View style={tw`mt-1`}>
                  {sessions.map((s: any) => {
                    const active = selectedId === Number(s?.id);
                    return (
                      <TouchableOpacity
                        key={String(s?.id)}
                        onPress={() => openSession(s?.id)}
                        style={[
                          tw`py-3 px-2 rounded-2xl mb-2 border`,
                          {
                            borderColor: active ? theme.primary : theme.border,
                            backgroundColor: active ? theme.primarySoft : 'transparent',
                          },
                        ]}
                      >
                        <View style={tw`flex-row items-center justify-between`}>
                          <View style={tw`flex-1 pr-3`}>
                            <Text style={[tw`font-bold`, { color: theme.text }]}>{s?.session_date}</Text>
                            <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]}>
                              {(s?.class_label || 'General') + (s?.period_label ? ` • ${s?.period_label}` : '')}
                            </Text>
                          </View>
                          <Text style={[tw`text-xs`, { color: theme.muted }]}>{s?.entries?.length || 0} entries</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Take attendance */}
        <View style={[tw`mt-4 rounded-3xl border p-4`, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {!selectedSession ? (
            <View style={tw`py-8 items-center`}>
              <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>Take attendance</Text>
              <Text style={[tw`text-sm mt-2 text-center`, { color: theme.subtext }]}>
                Select a session above (or create one) to mark Present/Absent/Late.
              </Text>
            </View>
          ) : (
            <>
              <View style={tw`flex-row items-start justify-between`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={[tw`text-sm font-bold`, { color: theme.text }]}>
                    {selectedSession?.session_date} • {selectedSession?.class_label || 'General'}
                    {selectedSession?.period_label ? ` • ${selectedSession?.period_label}` : ''}
                  </Text>
                  <Text style={[tw`text-xs mt-2`, { color: theme.subtext }]}>
                    Present: {counts.present}  •  Absent: {counts.absent}  •  Late: {counts.late}  •  Excused:{' '}
                    {counts.excused}  •  Unmarked: {counts.unmarked}
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={tw`mt-3 flex-row flex-wrap gap-2`}>
                <PrimaryBtn label="Mark all present" onPress={() => markAll('present')} theme={theme} />
                <GhostBtn label="Clear draft" onPress={clearAll} theme={theme} />
                <GhostBtn
                  label="Clear saved…"
                  onPress={() => setConfirmClearSaved(true)}
                  disabled={!selectedId || savingEntries}
                  theme={theme}
                  danger
                />
                <PrimaryBtn
                  label={
                    savingEntries ? 'Saving…' : markedCount === 0 ? 'Mark learners first' : 'Save attendance'
                  }
                  onPress={saveEntries}
                  disabled={savingEntries || markedCount === 0}
                  theme={theme}
                />
              </View>

              {/* Search + quick status */}
              <View style={tw`mt-4`}>
                <Field
                  label="Search learner"
                  value={q}
                  onChange={setQ}
                  placeholder="Name or admission code"
                  theme={theme}
                />

                <View style={tw`flex-row flex-wrap gap-2`}>
                  <StatusPill label="Present" onPress={() => markAll('present')} theme={theme} />
                  <StatusPill label="Absent" onPress={() => markAll('absent')} theme={theme} />
                  <StatusPill label="Late" onPress={() => markAll('late')} theme={theme} />
                  <StatusPill label="Excused" onPress={() => markAll('excused')} theme={theme} />
                </View>
              </View>

              {/* Learners list */}
              <View style={tw`mt-4`}>
                {rosterLoading ? (
                  <View style={tw`py-3 flex-row items-center`}>
                    <ActivityIndicator />
                    <Text style={[tw`ml-2`, { color: theme.subtext }]}>Loading roster…</Text>
                  </View>
                ) : learnersForSelected.length === 0 ? (
                  <Text style={[tw`py-6 text-center`, { color: theme.subtext }]}>
                    No learners found for this session/class.
                  </Text>
                ) : (
                  <View>
                    {learnersForSelected.map((l: any, idx: number) => {
                      const id = learnerKey(l);
                      if (!id) {
                        return (
                          <Text key={`missing-${idx}`} style={[tw`py-2 text-xs`, { color: theme.danger }]}>
                            Skipped learner with missing id: {l?.name || l?.full_name || l?.display_name || 'Unknown'}
                          </Text>
                        );
                      }

                      const cur = entryDraft[id]?.status;

                      return (
                        <View
                          key={id}
                          style={[
                            tw`py-3 border-b`,
                            { borderBottomColor: theme.border },
                          ]}
                        >
                          <View style={tw`flex-row items-center justify-between`}>
                            <View style={tw`flex-1 pr-3`}>
                              <Text style={[tw`font-semibold`, { color: theme.text }]} numberOfLines={1}>
                                {l?.name || l?.full_name || l?.display_name || 'Learner'}
                              </Text>
                              <Text style={[tw`text-xs mt-1`, { color: theme.subtext }]} numberOfLines={1}>
                                {l?.admission_code ? `Adm: ${l.admission_code}` : ''}
                                {l?.class_label ? `  •  ${l.class_label}` : ''}
                              </Text>
                            </View>

                            <View style={tw`flex-row items-center gap-2`}>
                              <StatusPill
                                label="P"
                                active={cur === 'present'}
                                onPress={() =>
                                  setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'present' } }))
                                }
                                theme={theme}
                              />
                              <StatusPill
                                label="A"
                                active={cur === 'absent'}
                                onPress={() =>
                                  setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'absent' } }))
                                }
                                theme={theme}
                              />
                              <StatusPill
                                label="L"
                                active={cur === 'late'}
                                onPress={() =>
                                  setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'late' } }))
                                }
                                theme={theme}
                              />
                              <StatusPill
                                label="E"
                                active={cur === 'excused'}
                                onPress={() =>
                                  setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'excused' } }))
                                }
                                theme={theme}
                              />
                              <Text style={[tw`ml-2 text-xs`, { color: theme.muted }]}>{prettyStatus(cur)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
