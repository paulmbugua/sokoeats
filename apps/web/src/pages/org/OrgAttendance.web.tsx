// apps/web/src/pages/org/OrgAttendancePage.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAttendance } from '@mytutorapp/shared/hooks/useOrgAttendance';
import { getOrgRoster } from '@mytutorapp/shared/api/orgApi';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

/* ─────────────────────────────────────────────────────────
 * ✅ Robust learner key helper
 * - Prefer learner profile UUID if present
 * - Fallback to numeric user_id (backend will resolve -> org_learner_profiles.id)
 * - Never return empty string if there is ANY usable id
 * ───────────────────────────────────────────────────────── */

function isUuid(v: any) {
  const s = String(v || '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
function isIntLike(v: any) {
  const s = String(v || '');
  return /^\d+$/.test(s);
}

/**
 * ✅ Always returns a non-empty identifier if the row has *any* usable id.
 * Prefer learner profile UUID, fallback to numeric user_id (server will resolve it).
 */
function learnerKey(l: any) {
  // UUID candidates (common shapes)
  const uuidCandidate =
    l.learner_profile_id ||
    l.org_learner_profile_id ||
    l.org_learner_id ||
    (isUuid(l.learner_id) ? l.learner_id : null) ||
    (isUuid(l.id) ? l.id : null);

  if (uuidCandidate) return String(uuidCandidate);

  // numeric candidates (user id)
  const intCandidate =
    (isIntLike(l.user_id) ? l.user_id : null) ||
    (isIntLike(l.userId) ? l.userId : null) ||
    (isIntLike(l.learner_id) ? l.learner_id : null) ||
    (isIntLike(l.id) ? l.id : null);

  return intCandidate ? String(intCandidate) : '';
}

function pickLearnerName(l: any) {
  return String(l?.name || l?.full_name || l?.display_name || l?.fullName || '').trim();
}

function pickAdmissionNo(l: any) {
  return String(
    l?.admission_code || l?.admission || l?.admission_no || l?.admissionNumber || l?.admission_number || '',
  ).trim();
}

function learnerKeysAll(l: any) {
  const keys = new Set<string>();

  // uuid candidates
  const uuidCandidate =
    l?.learner_profile_id ||
    l?.org_learner_profile_id ||
    l?.org_learner_id ||
    (isUuid(l?.learner_id) ? l.learner_id : null) ||
    (isUuid(l?.id) ? l.id : null);

  if (uuidCandidate) keys.add(String(uuidCandidate));

  // numeric candidates
  const intCandidate =
    (isIntLike(l?.user_id) ? l.user_id : null) ||
    (isIntLike(l?.userId) ? l.userId : null) ||
    (isIntLike(l?.learner_id) ? l.learner_id : null) ||
    (isIntLike(l?.id) ? l.id : null);

  if (intCandidate) keys.add(String(intCandidate));

  // also include the single “best” key for safety
  const best = learnerKey(l);
  if (best) keys.add(best);

  return Array.from(keys).filter(Boolean);
}

function csvEscape(v: any) {
  const s = String(v ?? '');
  // escape quotes and wrap if it contains comma/newline/quote
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsvText(filename: string, csvText: string) {
  if (typeof document === 'undefined') return; // safety
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}


/* ─────────────────────────────────────────────────────────
 * UI bits
 * ───────────────────────────────────────────────────────── */

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
    {children}
  </span>
);

const Banner: React.FC<{ tone: 'ok' | 'warn'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    className={cn(
      'rounded-xl border p-3 text-sm',
      tone === 'ok' &&
        'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-100',
      tone === 'warn' &&
        'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100',
    )}
  >
    {children}
  </div>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="flex flex-col text-sm text-slate-500 dark:text-slate-300">
    <span className="mb-1 text-xs uppercase tracking-wide">{label}</span>
    <input
      value={value}
      type={type}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}> = ({ label, value, onChange, options, placeholder = 'All' }) => (
  <label className="flex flex-col text-sm text-slate-500 dark:text-slate-300">
    <span className="mb-1 text-xs uppercase tracking-wide">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

const statuses = ['present', 'absent', 'late', 'excused'] as const;
type Status = (typeof statuses)[number];

function prettyStatus(s?: string) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const StatusPill: React.FC<{
  active?: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition',
      active
        ? 'bg-blue-600 text-white ring-blue-600'
        : 'bg-transparent text-slate-700 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
    )}
    aria-pressed={!!active}
  >
    {label}
  </button>
);

/* ─────────────────────────────────────────────────────────
 * ✅ Tiny confirmation modal
 * ───────────────────────────────────────────────────────── */

const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ open, title, body, confirmText = 'Confirm', danger, onClose, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{body}</div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-semibold text-white',
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const OrgAttendancePage: React.FC = () => {
  const { orgToken, backendUrl } = useShopContext() as any;
  const { isPro, upgradeCta, org, classLabels = [] } = useOrgProTools() as any;

  const attendance = useOrgAttendance({
    backendUrl,
    token: orgToken,
    orgId: org?.id,
  });

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
  downloadReportCsv,
} = attendance;

  const [flash, setFlash] = useState<{ tone: 'ok' | 'warn'; msg: string } | null>(null);

  // create
  const [form, setForm] = useState({ session_date: '', class_label: '', period_label: '' });
  const canSaveSession = useMemo(() => Boolean(form.session_date), [form.session_date]);

  // filters (left list)
  const [filters, setFilters] = useState({ start: '', end: '', class_label: '' });

  // pagination (sessions list)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const totalPages = useMemo(() => {
    if (!sessions?.length) return 1;
    return Math.max(1, Math.ceil(sessions.length / pageSize));
  }, [sessions?.length, pageSize]);

  const paginatedSessions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return (sessions || []).slice(start, start + pageSize);
  }, [sessions, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [filters.start, filters.end, filters.class_label]);

  // selection + editor
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [savingEntries, setSavingEntries] = useState(false);
  const [q, setQ] = useState('');

  // ✅ Confirm modal (clear saved)
  const [confirmClearSaved, setConfirmClearSaved] = useState(false);

  // entryDraft: learnerKey -> {status, note}
  const [entryDraft, setEntryDraft] = useState<Record<string, { status?: Status; note?: string }>>({});

  // roster
  const rosterQ = useQuery({
    queryKey: ['orgRoster', org?.id],
    enabled: ready,
    queryFn: async () => {
      const res: any = await getOrgRoster(backendUrl, orgToken, org?.id);
      const learners = res?.learners || res?.items || res?.rows || [];
      return { ...res, learners };
    },
  });

  const learnersAll = rosterQ.data?.learners || [];

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

    for (const k of learnerKeysAll(l)) {
      map.set(k, { name, admission });
    }
  }
  return map;
}, [learnersAll]);


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

  const markedCount = useMemo(() => counts.present + counts.absent + counts.late + counts.excused, [counts]);

  const loadList = useCallback(async () => {
    if (!ready) return;
    await fetchSessions({
      start: filters.start || undefined,
      end: filters.end || undefined,
      class_label: filters.class_label || undefined,
    });
  }, [ready, fetchSessions, filters.start, filters.end, filters.class_label]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const openSession = async (idRaw: any) => {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) return;

    setSelectedId(id);
    setFlash(null);

    try {
      const s = await fetchSession(id);
      setSelectedSession(s);

      // ✅ hydrate entryDraft from existing entries
      const m: Record<string, { status?: Status; note?: string }> = {};

      for (const e of s?.entries || []) {
        const uuid = String(e?.learner_id || '').trim();
        const uid = String(e?.user_id || '').trim();
        const payload = { status: e.status, note: e.note || '' };

        // ✅ prefer numeric user_id key (matches learnerKey from roster)
        if (uid) m[uid] = payload;
        // ✅ also store under uuid so either lookup works
        if (uuid) m[uuid] = payload;
      }

      setEntryDraft(m);
    } catch (e: any) {
      setFlash({ tone: 'warn', msg: e?.message || 'Failed to open session.' });
    }
  };

  const handleSaveSession = async () => {
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

      setFlash({ tone: 'ok', msg: 'Session saved. Now take attendance →' });
      setForm({ session_date: '', class_label: '', period_label: '' });

      // ✅ auto-open newly created session
      await openSession(created.id);

      // optional: refresh list
      await loadList();
    } catch (e: any) {
      setFlash({ tone: 'warn', msg: e?.response?.data?.message || e?.message || 'Unable to save session.' });
    }
  };

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

  // ✅ Clear saved entries (DB) with confirmation
  const clearSavedAttendance = async () => {
    if (!ready || !selectedId) return;

    setFlash(null);
    setConfirmClearSaved(false);
    setSavingEntries(true);

    try {
      const r: any = await clearEntriesApi(selectedId);
      setEntryDraft({});
      setFlash({ tone: 'ok', msg: `Saved attendance cleared (${r?.deleted ?? 0} entries).` });

      await openSession(selectedId); // reload session (should now be empty)
      await loadList(); // refresh left list
    } catch (e: any) {
      setFlash({
        tone: 'warn',
        msg: e?.response?.data?.message || e?.message || 'Failed to clear saved attendance.',
      });
    } finally {
      setSavingEntries(false);
    }
  };

  const saveEntries = async () => {
    if (!ready || !selectedId) return;

    let missing = 0;

    const entries = learnersForSelected
      .map((l: any) => {
        const id = learnerKey(l);
        if (!id) {
          missing += 1;
          return null;
        }

        const s = entryDraft[id]?.status;
        if (!s) return null;

        return { learner_id: id, status: s, note: entryDraft[id]?.note || null };
      })
      .filter(Boolean) as any[];

    // ✅ important: don't call API if empty
    if (entries.length === 0) {
      setFlash({
        tone: 'warn',
        msg:
          missing > 0
            ? `No attendance saved because learners are missing IDs (${missing} skipped). Fix roster to include learner profile uuid or user_id.`
            : 'Nothing to save yet. Mark at least one learner (or click “Mark all present”).',
      });
      return;
    }

    if (missing) {
      setFlash({
        tone: 'warn',
        msg: `Some learners have no usable id (${missing}). They were skipped. Fix roster to include learner profile uuid or user_id.`,
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
  };

  const exportCsv = async () => {
  if (!ready) {
    setFlash({ tone: 'warn', msg: `Attendance not ready: missing ${missing.join(', ')}` });
    return;
  }

  // ensure roster is loaded (best effort)
  try {
    if (!rosterQ.data && rosterQ.refetch) await rosterQ.refetch();
  } catch {}

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

        // try match by user_id first then learner_id
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

    // Build CSV
    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
    ].join('\r\n');

    const filename =
      `attendance-report` +
      (filters.start ? `_${filters.start}` : '') +
      (filters.end ? `_${filters.end}` : '') +
      (filters.class_label ? `_${filters.class_label}` : '') +
      `.csv`;

    downloadCsvText(filename, csv);

    if (!rows.length) {
      setFlash({ tone: 'warn', msg: 'Exported an empty CSV (no saved attendance entries in that range).' });
    } else {
      setFlash({ tone: 'ok', msg: `Exported ${rows.length} row(s).` });
    }
  } catch (e: any) {
    setFlash({ tone: 'warn', msg: e?.response?.data?.message || e?.message || 'Export failed.' });
  }
};


  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      {/* ✅ Confirmation modal */}
      <ConfirmModal
        open={confirmClearSaved}
        title="Clear saved attendance?"
        body={
          <>
            This will permanently remove <b>all saved entries</b> for this session from the database.
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Tip: Use “Clear draft” if you only want to reset the UI before saving.
            </div>
          </>
        }
        confirmText="Yes, clear saved"
        danger
        onClose={() => setConfirmClearSaved(false)}
        onConfirm={clearSavedAttendance}
      />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Create sessions → open a session → mark Present/Absent/Late → save.
          </p>
        </div>
        <Badge>Pro / Enterprise</Badge>
      </div>

      {!ready ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
          Attendance not ready: missing <b>{missing.join(', ')}</b>
        </div>
      ) : null}

      {/* ✅ extra diagnostic so you can fix roster shape quickly */}
      {ready && !rosterQ.isLoading && missingIdCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
          Heads up: <b>{missingIdCount}</b> learner(s) in your roster have no usable id. They will be skipped when saving
          attendance. Ensure roster rows include <b>org_learner_profiles.id</b> (uuid) or <b>user_id</b>.
        </div>
      ) : null}

      {flash ? <Banner tone={flash.tone}>{flash.msg}</Banner> : null}

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <div className="mt-2 text-sm">
            <a className="text-blue-600 underline" href="/org/profile">
              Manage billing for {org?.name || 'your org'}
            </a>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* LEFT: sessions */}
          <div className="lg:col-span-5 space-y-4">
            {/* Create session */}
            <div className={card}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">New session</div>
                <div className="text-xs text-slate-500">Required: date</div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field
                  label="Session date"
                  type="date"
                  value={form.session_date}
                  onChange={(session_date) => setForm((p) => ({ ...p, session_date }))}
                />

                {Array.isArray(classLabels) && classLabels.length > 0 ? (
                  <SelectField
                    label="Class label"
                    value={form.class_label}
                    onChange={(class_label) => setForm((p) => ({ ...p, class_label }))}
                    options={classLabels.map((c: string) => ({ value: c, label: c }))}
                    placeholder="General"
                  />
                ) : (
                  <Field
                    label="Class label"
                    value={form.class_label}
                    placeholder="Grade 9"
                    onChange={(class_label) => setForm((p) => ({ ...p, class_label }))}
                  />
                )}

                <Field
                  label="Period label"
                  value={form.period_label}
                  placeholder="Morning"
                  onChange={(period_label) => setForm((p) => ({ ...p, period_label }))}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!ready || !canSaveSession || attendanceSaving}
                  onClick={handleSaveSession}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {attendanceSaving ? 'Saving…' : 'Save & take attendance'}
                </button>

                <button
                  type="button"
                  disabled={!ready}
                  onClick={loadList}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh
                </button>

                <button
                  type="button"
                  disabled={!ready}
                  onClick={exportCsv}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Export CSV
                </button>
              </div>
            </div>

            {/* Filters + sessions list */}
            <div className={card}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sessions</div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
                <div>
                  {sessionsLoading
                    ? 'Loading…'
                    : `Showing ${sessions.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(
                        page * pageSize,
                        sessions.length,
                      )} of ${sessions.length}`}
                </div>

                <div className="inline-flex items-center gap-2">
                  <span>Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPage(1);
                      setPageSize(Number(e.target.value) || 10);
                    }}
                    className="rounded-full bg-white dark:bg-[#0f1821] px-2 py-1 ring-1 ring-black/10 dark:ring-white/10"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
            </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field
                  label="From"
                  type="date"
                  value={filters.start}
                  onChange={(start) => setFilters((p) => ({ ...p, start }))}
                />
                <Field
                  label="To"
                  type="date"
                  value={filters.end}
                  onChange={(end) => setFilters((p) => ({ ...p, end }))}
                />
                {Array.isArray(classLabels) && classLabels.length > 0 ? (
                  <SelectField
                    label="Class"
                    value={filters.class_label}
                    onChange={(class_label) => setFilters((p) => ({ ...p, class_label }))}
                    options={classLabels.map((c: string) => ({ value: c, label: c }))}
                    placeholder="All classes"
                  />
                ) : (
                  <Field
                    label="Class"
                    value={filters.class_label}
                    placeholder="All classes"
                    onChange={(class_label) => setFilters((p) => ({ ...p, class_label }))}
                  />
                )}
              </div>

              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {sessionsLoading ? <p className="py-3 text-sm text-slate-500">Loading sessions…</p> : null}

                {!sessionsLoading && !sessions.length ? (
                  <p className="py-3 text-sm text-slate-500">No sessions yet.</p>
                ) : (
                  paginatedSessions.map((s: any) => (
                    <button
                      type="button"
                      key={String(s.id)}
                      onClick={() => openSession(s.id)}
                      className={cn(
                        'w-full py-3 text-left transition',
                        selectedId === Number(s.id)
                          ? 'bg-slate-50 dark:bg-slate-800/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3 px-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 dark:text-slate-100">{s.session_date}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {(s.class_label || 'General') + (s.period_label ? ` • ${s.period_label}` : '')}
                          </div>
                        </div>
                        <div className="shrink-0 text-xs text-slate-500">{s.entries?.length || 0} entries</div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {!sessionsLoading && sessions.length ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-[11px] sm:text-xs text-[#49739c] dark:text-darkTextSecondary">
                  <span>
                    Page {page} of {totalPages}
                  </span>

                  {totalPages > 1 ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-[#e7edf4] dark:bg-[#172534] px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                          page === 1 ? 'opacity-40 cursor-default' : 'hover:bg-white/70 dark:hover:bg-white/10'
                        }`}
                      >
                        ‹ Prev
                      </button>

                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                          page === totalPages
                            ? 'opacity-40 cursor-default'
                            : 'hover:bg-white/70 dark:hover:bg-white/10'
                        }`}
                      >
                        Next ›
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT: take attendance */}
          <div className="lg:col-span-7 space-y-4">
            <div className={card}>
              {!selectedSession ? (
                <div className="py-8 text-center">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Take attendance</div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Select a session on the left (or create one) to mark Present/Absent.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {selectedSession.session_date} • {selectedSession.class_label || 'General'}
                        {selectedSession.period_label ? ` • ${selectedSession.period_label}` : ''}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Present: {counts.present}</span>
                        <span>Absent: {counts.absent}</span>
                        <span>Late: {counts.late}</span>
                        <span>Excused: {counts.excused}</span>
                        <span>Unmarked: {counts.unmarked}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => markAll('present')}
                        className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Mark all present
                      </button>

                      {/* ✅ Clear Draft (UI only) */}
                      <button
                        type="button"
                        onClick={clearAll}
                        className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Clear draft
                      </button>

                      {/* ✅ Clear Saved (DB) */}
                      <button
                        type="button"
                        disabled={!selectedId || savingEntries}
                        onClick={() => setConfirmClearSaved(true)}
                        className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900/40 dark:text-red-200 dark:hover:bg-red-900/20"
                      >
                        Clear saved…
                      </button>

                      <button
                        type="button"
                        disabled={savingEntries || markedCount === 0}
                        onClick={saveEntries}
                        className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingEntries ? 'Saving…' : markedCount === 0 ? 'Mark learners first' : 'Save attendance'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field label="Search learner" value={q} onChange={setQ} placeholder="Name or admission code" />
                    <div className="flex items-end justify-end gap-2">
                      <StatusPill label="Present" onClick={() => markAll('present')} />
                      <StatusPill label="Absent" onClick={() => markAll('absent')} />
                      <StatusPill label="Late" onClick={() => markAll('late')} />
                      <StatusPill label="Excused" onClick={() => markAll('excused')} />
                    </div>
                  </div>

                  <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                    {rosterQ.isLoading ? (
                      <p className="py-3 text-sm text-slate-500">Loading roster…</p>
                    ) : (
                      learnersForSelected.map((l: any, idx: number) => {
                        const id = learnerKey(l);

                        if (!id) {
                          return (
                            <div key={`missing-${idx}`} className="py-3 text-xs text-amber-700">
                              Skipped learner with missing id: {l.name || l.full_name || l.display_name || 'Unknown'}
                            </div>
                          );
                        }

                        const cur = entryDraft[id]?.status;

                        return (
                          <div key={id} className="py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                                  {l.name || l.full_name || l.display_name || 'Learner'}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {l.admission_code ? `Adm: ${l.admission_code}` : ''}{' '}
                                  {l.class_label ? `• ${l.class_label}` : ''}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <StatusPill
                                  active={cur === 'present'}
                                  label="P"
                                  onClick={() =>
                                    setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'present' } }))
                                  }
                                />
                                <StatusPill
                                  active={cur === 'absent'}
                                  label="A"
                                  onClick={() =>
                                    setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'absent' } }))
                                  }
                                />
                                <StatusPill
                                  active={cur === 'late'}
                                  label="L"
                                  onClick={() =>
                                    setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'late' } }))
                                  }
                                />
                                <StatusPill
                                  active={cur === 'excused'}
                                  label="E"
                                  onClick={() =>
                                    setEntryDraft((p) => ({ ...p, [id]: { ...(p[id] || {}), status: 'excused' } }))
                                  }
                                />
                                <span className="ml-2 text-xs text-slate-500">{prettyStatus(cur)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {!rosterQ.isLoading && learnersForSelected.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">No learners found for this session/class.</p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAttendancePage;
