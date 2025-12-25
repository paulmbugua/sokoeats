// apps/web/src/pages/org/OrgToolsSports.web.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgSports } from '@mytutorapp/shared/hooks/useOrgSports';
import type { OrgSportsEvent } from '@mytutorapp/shared/types';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function toIsoOrNull(v: string) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isoToLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

const softCard =
  'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const KIND_LABEL: Record<string, string> = {
  fixture: 'Fixture',
  practice: 'Practice',
  tournament: 'Tournament',
  other: 'Other',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TEMPLATES: Array<Partial<OrgSportsEvent> & { label: string; hint: string }> = [
  {
    label: 'Football match',
    hint: 'Fixture • vs opponent • set time + venue',
    kind: 'fixture',
    title: 'Football Match',
    audience: 'learners',
  },
  {
    label: 'Training session',
    hint: 'Practice • team training • set time + venue',
    kind: 'practice',
    title: 'Team Training',
    audience: 'learners',
  },
  {
    label: 'Athletics meet',
    hint: 'Tournament • track & field • add location',
    kind: 'tournament',
    title: 'Athletics Meet',
    audience: 'all',
  },
  {
    label: 'Friendly match',
    hint: 'Fixture • low-stakes • keep score optional',
    kind: 'fixture',
    title: 'Friendly Match',
    audience: 'learners',
  },
];

function Badge({
  tone,
  children,
}: {
  tone: 'blue' | 'green' | 'amber' | 'slate' | 'rose';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : tone === 'rose'
          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
          : tone === 'blue'
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';

  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{children}</span>;
}

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
          </div>
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

const OrgToolsSportsPage: React.FC = () => {
  const { isPro, upgradeCta, org, activeOrgId } = useOrgProTools() as any;
  const { orgId: orgIdParam } = useParams();

  const { backendUrl, token: userToken, orgToken, orgId: ctxOrgId } = useShopContext() as any;
  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  // ✅ enforce orgToken usage (fallback to user token only to avoid hard break in dev)
  const sportsToken = (orgToken as string) || (userToken as string) || null;

  const resolvedOrgId =
    (orgIdParam as string) ||
    (activeOrgId as string) ||
    (ctxOrgId as string) ||
    (org?.id as string) ||
    (orgFromHook?.id as string) ||
    null;

  const strictMissing = !resolvedOrgId || !orgToken;
  const missingCtx = !resolvedOrgId || !sportsToken;

  const { events, loading, saving, error, notice, fetchEvents, saveEvent, editEvent, removeEvent } = useOrgSports({
    orgId: resolvedOrgId,
    token: orgToken ?? null, // ✅ pass orgToken explicitly
    backendUrl,
  }) as any;

  // Debug snapshot (helps confirm orgId + token sources)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line no-console
    console.log('[OrgToolsSportsPage] context snapshot', {
      route_orgIdParam: orgIdParam ?? null,
      activeOrgId: activeOrgId ?? null,
      ctxOrgId: ctxOrgId ?? null,
      orgFromHook_id: orgFromHook?.id ?? null,
      orgFromProTools_id: org?.id ?? null,
      resolved_orgId: resolvedOrgId ?? null,
      has_user_token: Boolean(userToken),
      has_org_token: Boolean(orgToken),
      resolved_has_sports_token: Boolean(sportsToken),
      backendUrl_ctx: backendUrl ?? null,
      location: window.location.pathname,
    });
  }, [
    orgIdParam,
    activeOrgId,
    ctxOrgId,
    orgFromHook?.id,
    org?.id,
    resolvedOrgId,
    userToken,
    orgToken,
    sportsToken,
    backendUrl,
  ]);

  // Filters
  const [mode, setMode] = useState<'upcoming' | 'results' | 'all'>('upcoming');
  const [q, setQ] = useState('');
  const [fKind, setFKind] = useState<string>('');
  const [fTeam, setFTeam] = useState<string>('');
  const [fAudience, setFAudience] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!resolvedOrgId || !sportsToken) return;

    const status = mode === 'results' ? 'completed' : mode === 'upcoming' ? 'scheduled' : '';

    await fetchEvents({
      status: status || undefined,
      kind: fKind || undefined,
      team_label: fTeam || undefined,
      audience: fAudience || undefined,
      q: q.trim() || undefined,
      limit: 300,
      offset: 0,
    });
  }, [resolvedOrgId, sportsToken, fetchEvents, mode, fKind, fTeam, fAudience, q]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Composer
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '',
    kind: 'fixture',
    team_label: '',
    opponent: '',
    location: '',
    audience: 'learners',
    status: 'scheduled',
    event_at: '',
    end_at: '',
    description: '',
    score_home: '',
    score_away: '',
  });

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm({
      title: '',
      kind: 'fixture',
      team_label: '',
      opponent: '',
      location: '',
      audience: 'learners',
      status: 'scheduled',
      event_at: '',
      end_at: '',
      description: '',
      score_home: '',
      score_away: '',
    });
  }, []);

  const canSave = useMemo(() => Boolean(form.title.trim()), [form.title]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    (events || []).forEach((e: any) => {
      const t = String(e?.team_label || '').trim();
      if (t) s.add(t);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const listClientFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = (events || []) as OrgSportsEvent[];

    if (!needle) return base;

    return base.filter((e) => {
      const hay = `${e.title || ''} ${e.description || ''} ${e.opponent || ''} ${e.team_label || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [events, q]);

  const grouped = useMemo(() => {
    const m = new Map<string, OrgSportsEvent[]>();
    for (const e of listClientFiltered) {
      const key = e.event_at ? new Date(e.event_at).toDateString() : 'TBC';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }

    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const ta = a.event_at ? new Date(a.event_at).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.event_at ? new Date(b.event_at).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
      m.set(k, arr);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === 'TBC') return 1;
      if (b === 'TBC') return -1;
      return new Date(a).getTime() - new Date(b).getTime();
    });

    return keys.map((k) => ({ day: k, items: m.get(k)! }));
  }, [listClientFiltered]);

  const instructorHint = useMemo(() => {
    const s = String(error || '').toLowerCase();
    return s.includes('403') || s.includes('forbidden') || s.includes('instructor');
  }, [error]);

  const handlePickTemplate = (t: any) => {
    setForm((p) => ({
      ...p,
      title: String(t.title || p.title || '').trim(),
      kind: String(t.kind || p.kind || 'fixture'),
      audience: String(t.audience || p.audience || 'learners'),
      status: 'scheduled',
    }));
  };

  const handleEditClick = (evt: OrgSportsEvent) => {
    setEditingId(Number(evt.id));
    setForm({
      title: String(evt.title || ''),
      kind: String((evt as any).kind || 'fixture'),
      team_label: String((evt as any).team_label || ''),
      opponent: String((evt as any).opponent || ''),
      location: String(evt.location || ''),
      audience: String((evt as any).audience || 'learners'),
      status: String((evt as any).status || 'scheduled'),
      event_at: isoToLocalInput((evt as any).event_at),
      end_at: isoToLocalInput((evt as any).end_at),
      description: String(evt.description || ''),
      score_home: (evt as any).score_home == null ? '' : String((evt as any).score_home),
      score_away: (evt as any).score_away == null ? '' : String((evt as any).score_away),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (!canSave || missingCtx) return;

    const payload: Partial<OrgSportsEvent> = {
      title: form.title.trim(),
      description: form.description.trim() || null,

      // new fields
      kind: (form.kind || 'fixture').trim(),
      team_label: form.team_label.trim() || null,
      opponent: form.opponent.trim() || null,
      audience: (form.audience || 'all').trim(),
      status: (form.status || 'scheduled').trim(),

      event_at: toIsoOrNull(form.event_at) || null,
      end_at: toIsoOrNull(form.end_at) || null,

      location: form.location.trim() || null,
      score_home: form.score_home.trim() ? Number(form.score_home) : null,
      score_away: form.score_away.trim() ? Number(form.score_away) : null,
    };

    const ok = editingId ? await editEvent(editingId, payload) : await saveEvent(payload);
    if (ok) {
      resetForm();
      refresh();
    }
  };

  const doDuplicate = async (evt: OrgSportsEvent) => {
    const payload: Partial<OrgSportsEvent> = {
      ...(evt as any),
      id: undefined as any,
      status: 'scheduled' as any,
      score_home: null as any,
      score_away: null as any,
      title: evt.title ? `${evt.title} (copy)` : 'Copy',
    };
    await saveEvent(payload);
    refresh();
  };

  // Score modal
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreEvt, setScoreEvt] = useState<OrgSportsEvent | null>(null);
  const [scoreHome, setScoreHome] = useState('');
  const [scoreAway, setScoreAway] = useState('');

  const openScore = (evt: OrgSportsEvent) => {
    setScoreEvt(evt);
    setScoreHome((evt as any).score_home == null ? '' : String((evt as any).score_home));
    setScoreAway((evt as any).score_away == null ? '' : String((evt as any).score_away));
    setScoreOpen(true);
  };

  const submitScore = async () => {
    if (!scoreEvt) return;
    const home = scoreHome.trim() ? Number(scoreHome) : null;
    const away = scoreAway.trim() ? Number(scoreAway) : null;

    await editEvent((scoreEvt as any).id, {
      score_home: home as any,
      score_away: away as any,
      status: 'completed' as any,
    });

    setScoreOpen(false);
    setScoreEvt(null);
    refresh();
  };

  const handleExportCsv = async () => {
    if (!backendUrl || !resolvedOrgId || !sportsToken) return;

    const url = `${String(backendUrl).replace(/\/+$/, '')}/api/orgs/${resolvedOrgId}/sports/events.csv`;

    // include current server filters so CSV matches view
    const status = mode === 'results' ? 'completed' : mode === 'upcoming' ? 'scheduled' : '';

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (fKind) params.set('kind', fKind);
    if (fTeam) params.set('team_label', fTeam);
    if (fAudience) params.set('audience', fAudience);
    if (q.trim()) params.set('q', q.trim());
    params.set('limit', '500');
    params.set('offset', '0');

    const full = `${url}?${params.toString()}`;

    const r = await fetch(full, {
      headers: { Authorization: `Bearer ${sportsToken}` },
    });

    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error('[sports export csv] failed', r.status, await r.text());
      return;
    }

    const blob = await r.blob();
    const filename = `sports-events-${resolvedOrgId}.csv`;
    await downloadBlob(blob, filename);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      {/* Strict orgToken missing warning */}
      {strictMissing ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
          <div className="font-semibold">Org session required</div>
          <div className="mt-1 opacity-90">
            This page is designed for <b>orgToken</b>. Please log in via the org portal.
          </div>
        </div>
      ) : null}

      {/* Missing context strip */}
      {missingCtx ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
          <div className="font-semibold">Missing org/session context</div>
          <div className="mt-1 opacity-90">
            orgId: {resolvedOrgId ?? 'null'} • token: {sportsToken ? 'present' : 'missing'}
          </div>
          <div className="mt-1 text-xs opacity-80">
            Open DevTools → Console and look for <code>[OrgToolsSportsPage]</code> logs.
          </div>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="truncate text-2xl font-semibold">Sports</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Plan fixtures & training, track results, and keep everyone informed.
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
          <div className={cn(softCard, 'lg:col-span-2')}>
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
                    Tip: Sports endpoints require <b>Pro tier</b> + <b>Org Instructor</b>. If you’re not an instructor,
                    you’ll get 403.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {editingId ? 'Edit event' : 'Create event'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Fixtures + practices + tournaments — one place.
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

            {/* Templates */}
            {!editingId ? (
              <div className="mt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick templates
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => handlePickTemplate(t)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                      title={t.hint}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="U13 Football vs Green Hills"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Kind</span>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="fixture">Fixture</option>
                    <option value="practice">Practice</option>
                    <option value="tournament">Tournament</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Audience</span>
                  <select
                    value={form.audience}
                    onChange={(e) => setForm((p) => ({ ...p, audience: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All</option>
                    <option value="learners">Learners</option>
                    <option value="instructors">Instructors</option>
                    <option value="parents">Parents</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Team (optional)</span>
                  <input
                    value={form.team_label}
                    onChange={(e) => setForm((p) => ({ ...p, team_label: e.target.value }))}
                    placeholder="U13 / Senior / Girls Volleyball"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Opponent (optional)</span>
                  <input
                    value={form.opponent}
                    onChange={(e) => setForm((p) => ({ ...p, opponent: e.target.value }))}
                    placeholder="Green Hills School"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Location</span>
                <input
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  placeholder="Main field / Court A / Stadium"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Start</span>
                  <input
                    type="datetime-local"
                    value={form.event_at}
                    onChange={(e) => setForm((p) => ({ ...p, event_at: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">End (optional)</span>
                  <input
                    type="datetime-local"
                    value={form.end_at}
                    onChange={(e) => setForm((p) => ({ ...p, end_at: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 sm:col-span-1">
                  <span className="mb-1 text-xs uppercase tracking-wide">Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Score (home)</span>
                  <input
                    value={form.score_home}
                    onChange={(e) => setForm((p) => ({ ...p, score_home: e.target.value }))}
                    placeholder="—"
                    inputMode="numeric"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Score (away)</span>
                  <input
                    value={form.score_away}
                    onChange={(e) => setForm((p) => ({ ...p, score_away: e.target.value }))}
                    placeholder="—"
                    inputMode="numeric"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                <span className="mb-1 text-xs uppercase tracking-wide">Notes (optional)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Kickoff time, kit color, transport details, etc."
                  className="h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  disabled={!canSave || saving || missingCtx}
                  onClick={handleSave}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save event'}
                </button>

                <button
                  onClick={refresh}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Refresh list
                </button>

                <button
                  onClick={handleExportCsv}
                  disabled={missingCtx || !backendUrl}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  title={missingCtx ? 'CSV export requires orgId + token' : 'Download CSV'}
                >
                  Export CSV
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Note: Sports endpoints require <b>Pro tier</b> + <b>Org Instructor</b>. If you’re not an instructor,
                the API returns 403.
              </div>
            </div>
          </div>

          {/* List */}
          <div className={cn(softCard, 'lg:col-span-3')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode('upcoming')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    mode === 'upcoming'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  onClick={() => setMode('results')}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm font-medium',
                    mode === 'results'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  Results
                </button>
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
                  All
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search… (team, opponent, title)"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:w-64"
                />

                <select
                  value={fKind}
                  onChange={(e) => setFKind(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  title="Filter by kind"
                >
                  <option value="">All kinds</option>
                  <option value="fixture">Fixture</option>
                  <option value="practice">Practice</option>
                  <option value="tournament">Tournament</option>
                  <option value="other">Other</option>
                </select>

                <select
                  value={fTeam}
                  onChange={(e) => setFTeam(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  title="Filter by team"
                >
                  <option value="">All teams</option>
                  {teams.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={fAudience}
                  onChange={(e) => setFAudience(e.target.value)}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  title="Filter by audience"
                >
                  <option value="">All audiences</option>
                  <option value="all">All</option>
                  <option value="learners">Learners</option>
                  <option value="instructors">Instructors</option>
                  <option value="parents">Parents</option>
                </select>

                <button
                  type="button"
                  onClick={refresh}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="text-sm text-slate-500 dark:text-slate-300">Loading events…</div>
              ) : (events || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  No events yet. Use the form to create your first fixture or practice.
                </div>
              ) : (
                <div className="space-y-5">
                  {grouped.map((g) => (
                    <div key={g.day} className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {g.day}
                      </div>

                      <div className="space-y-2">
                        {g.items.map((e) => {
                          const k = String((e as any).kind || 'fixture');
                          const st = String((e as any).status || 'scheduled');

                          const tone =
                            st === 'completed'
                              ? 'green'
                              : st === 'cancelled'
                                ? 'rose'
                                : 'blue';

                          const title = e.title || 'Untitled';
                          const team = String((e as any).team_label || '').trim();
                          const opp = String((e as any).opponent || '').trim();

                          const score =
                            (e as any).score_home != null || (e as any).score_away != null
                              ? `${(e as any).score_home ?? '—'} : ${(e as any).score_away ?? '—'}`
                              : null;

                          return (
                            <div
                              key={String((e as any).id)}
                              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                                      {title}
                                    </div>
                                    <Badge tone="slate">{KIND_LABEL[k] || k}</Badge>
                                    <Badge tone={tone as any}>{STATUS_LABEL[st] || st}</Badge>
                                    {score ? <Badge tone="amber">Score {score}</Badge> : null}
                                  </div>

                                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                    <span className="font-medium">{fmtWhen((e as any).event_at)}</span>
                                    {((e as any).end_at ? (
                                      <span className="opacity-80"> → {fmtWhen((e as any).end_at)}</span>
                                    ) : null)}
                                  </div>

                                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                    {team ? <span className="font-medium">{team}</span> : <span className="opacity-70">Team TBC</span>}
                                    {opp ? <span className="opacity-80"> vs {opp}</span> : null}
                                    {e.location ? <span className="opacity-80"> • {e.location}</span> : null}
                                  </div>

                                  {e.description ? (
                                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{e.description}</div>
                                  ) : null}
                                </div>

                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleEditClick(e)}
                                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => doDuplicate(e)}
                                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    Duplicate
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openScore(e)}
                                    className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                  >
                                    Record score
                                  </button>

                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await removeEvent((e as any).id);
                                      if (ok) refresh();
                                    }}
                                    className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-900/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Tip: Use filters above + <b>Apply</b> to fetch filtered results from the server.
            </div>
          </div>
        </div>
      )}

      <ModalShell
        open={scoreOpen}
        title={scoreEvt?.title ? `Record score: ${scoreEvt.title}` : 'Record score'}
        onClose={() => {
          setScoreOpen(false);
          setScoreEvt(null);
        }}
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Home</span>
              <input
                value={scoreHome}
                onChange={(e) => setScoreHome(e.target.value)}
                inputMode="numeric"
                placeholder="—"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Away</span>
              <input
                value={scoreAway}
                onChange={(e) => setScoreAway(e.target.value)}
                inputMode="numeric"
                placeholder="—"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={submitScore}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save score (mark completed)
            </button>
            <button
              onClick={() => {
                setScoreOpen(false);
                setScoreEvt(null);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Saving a score will set <b>status=completed</b>.
          </div>
        </div>
      </ModalShell>
    </div>
  );
};

export default OrgToolsSportsPage;
