import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

import type { OrgSportsEvent, OrgClub } from '@mytutorapp/shared/types';
import { listSportsEvents, getMyClubs as apiGetMyClubs } from '@mytutorapp/shared/api/orgEngagementApi';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

// ✅ Theme-aware shell + card (same family as the fees page)
const pageShell =
  'min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-darkTextPrimary px-3 sm:px-4 py-6';

const card =
  'rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] p-4 sm:p-5 shadow-sm';

function pickString(...xs: any[]) {
  for (const x of xs) {
    const s = typeof x === 'string' ? x : x == null ? '' : String(x);
    if (s.trim()) return s.trim();
  }
  return '';
}

function fmtWhen(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function dayKey(iso?: string | null) {
  if (!iso) return 'TBC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBC';
  return d.toDateString();
}

function Badge({
  tone,
  children,
}: {
  tone: 'blue' | 'green' | 'amber' | 'slate' | 'rose';
  children: React.ReactNode;
}) {
  // ✅ Theme-aware badges (light + dark)
  const cls =
    tone === 'green'
      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/30'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/30'
        : tone === 'rose'
          ? 'bg-rose-50 text-rose-900 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/30'
          : tone === 'blue'
            ? 'bg-sky-50 text-sky-900 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-400/30'
            : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-white/10 dark:text-white/70 dark:border-white/10';

  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1', cls)}>
      {children}
    </span>
  );
}

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

function TabButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 text-left rounded-2xl px-4 py-3 border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:focus-visible:ring-white/15',
        active
          ? 'bg-slate-900 text-white border-slate-900/10 dark:bg-white/10 dark:text-white dark:border-white/20'
          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-white',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl">{icon}</div>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-slate-600 dark:text-white/60 mt-0.5">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

const OrgLearnerSportsClubsPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  const { backendUrl, token: userToken, orgToken, orgId: ctxOrgId } = useShopContext() as any;

  const resolvedOrgId =
    (ctxOrgId as string) ||
    (orgFromHook?.id as string) ||
    (orgState?.org?.id as string) ||
    null;

  // Sports can work with orgToken OR user token (prefer orgToken)
  const sportsToken = (orgToken as string) || (userToken as string) || null;

  // My clubs is best with user token (identity). Fallback to orgToken if needed.
  const clubsToken = (userToken as string) || (orgToken as string) || null;

  const tab = (params.get('tab') || 'sports').toLowerCase();
  const activeTab: 'sports' | 'clubs' = tab === 'clubs' ? 'clubs' : 'sports';

  const setTab = (t: 'sports' | 'clubs') => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  // ─────────────────────────────────────────────
  // Sports calendar (learner view)
  // ─────────────────────────────────────────────
  const [sportsMode, setSportsMode] = React.useState<'upcoming' | 'results'>('upcoming');
  const [sportsQ, setSportsQ] = React.useState('');
  const [sportsKind, setSportsKind] = React.useState<string>('');

  const sportsQuery = useQuery({
    queryKey: ['org-learner-sports', resolvedOrgId, sportsMode, sportsKind, sportsQ],
    enabled: Boolean(backendUrl && resolvedOrgId && sportsToken),
    queryFn: async () => {
      const status = sportsMode === 'results' ? 'completed' : 'scheduled';
      const rows = await listSportsEvents(backendUrl, sportsToken as string, resolvedOrgId as string, {
        status,
        kind: sportsKind || undefined,
        q: sportsQ.trim() || undefined,
        limit: 300,
        offset: 0,
      });
      return Array.isArray(rows) ? (rows as OrgSportsEvent[]) : [];
    },
    staleTime: 20_000,
  });

  const sportsAll = (sportsQuery.data || []) as any[];

  // Learner safety filter: show audience = learners OR all OR empty
  const sportsVisible = React.useMemo(() => {
    return sportsAll.filter((e) => {
      const a = String(e?.audience || '').trim().toLowerCase();
      return !a || a === 'learners' || a === 'all';
    });
  }, [sportsAll]);

  const sportsGrouped = React.useMemo(() => {
    const m = new Map<string, any[]>();
    for (const e of sportsVisible) {
      const k = dayKey(e?.event_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }

    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => {
        const ta = a?.event_at ? new Date(a.event_at).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b?.event_at ? new Date(b.event_at).getTime() : Number.MAX_SAFE_INTEGER;
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
  }, [sportsVisible]);

  const nextEvent = React.useMemo(() => {
    const upcoming = sportsVisible
      .filter((e) => String(e?.status || 'scheduled').toLowerCase() === 'scheduled')
      .filter((e) => e?.event_at && !Number.isNaN(new Date(e.event_at).getTime()))
      .sort((a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime());
    return upcoming[0] || null;
  }, [sportsVisible]);

  // ─────────────────────────────────────────────
  // My clubs (learner view)
  // ─────────────────────────────────────────────
  const clubsQuery = useQuery({
    queryKey: ['org-learner-my-clubs', resolvedOrgId],
    enabled: Boolean(backendUrl && resolvedOrgId && clubsToken),
    queryFn: async () => {
      const rows = await apiGetMyClubs(backendUrl, clubsToken as string, resolvedOrgId as string);
      return Array.isArray(rows) ? (rows as OrgClub[]) : [];
    },
    staleTime: 20_000,
  });

  const myClubs = (clubsQuery.data || []) as any[];

  const clubsErr: any = clubsQuery.error;
  const clubsStatus = clubsErr?.response?.status;
  const clubsMsg = String(clubsErr?.response?.data?.message || clubsErr?.message || '');

  // Treat 401/403 (or obvious token/session text) as “session token” issues
  const clubsAuthErr =
    clubsStatus === 401 || clubsStatus === 403 || /unauthor|token|session|jwt|forbidden/i.test(clubsMsg);

  // Show heads-up ONLY if userToken is missing AND we actually hit an auth error on clubs
  const showMineHeadsUp = activeTab === 'clubs' && !userToken && clubsAuthErr;

  const missingCtx = !resolvedOrgId || !backendUrl || (!sportsToken && !clubsToken);

  return (
    <div className={pageShell}>
      <div className="max-w-screen-lg mx-auto space-y-4">
        {/* Header */}
        <header className={cn(card, 'flex items-center justify-between gap-3')}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
              Learner activities
            </div>
            <h1 className="text-xl sm:text-2xl font-bold truncate mt-0.5">Sports Calendar & Clubs</h1>
            <div className="text-xs text-slate-600 dark:text-darkTextSecondary mt-0.5">
              See sports events and your enrolled clubs — in one place.
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                         dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
            >
              ← Back
            </button>
            <Link
              to="/org/learn"
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                         dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {missingCtx ? (
          <div className={cn(card, 'border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-900/20')}>
            <div className="font-semibold text-rose-900 dark:text-rose-100">Missing org/session context</div>
            <div className="text-sm text-slate-700 dark:text-white/70 mt-1">We need orgId + a token to load sports/clubs.</div>
          </div>
        ) : null}

        {/* Tabs */}
        <section className={card}>
          <div className="flex flex-col sm:flex-row gap-3">
            <TabButton
              active={activeTab === 'sports'}
              onClick={() => setTab('sports')}
              icon="🏆"
              title="Sports Calendar"
              subtitle="Upcoming fixtures, practice, tournaments."
            />
            <TabButton
              active={activeTab === 'clubs'}
              onClick={() => setTab('clubs')}
              icon="🤝"
              title="Clubs & Societies"
              subtitle="Clubs you are enrolled in."
            />
          </div>
        </section>

        {/* SPORTS TAB */}
        {activeTab === 'sports' ? (
          <section className={card}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Sports calendar</h2>
                <p className="text-sm text-slate-600 dark:text-darkTextSecondary">
                  Only events meant for <b>learners</b> (or <b>everyone</b>) appear here.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSportsMode('upcoming')}
                  className={cn(
                    'text-[11px] sm:text-xs px-3 py-1.5 rounded-full border font-medium transition',
                    sportsMode === 'upcoming'
                      ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-400/40 dark:bg-sky-500/15 dark:text-sky-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80',
                  )}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  onClick={() => setSportsMode('results')}
                  className={cn(
                    'text-[11px] sm:text-xs px-3 py-1.5 rounded-full border font-medium transition',
                    sportsMode === 'results'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80',
                  )}
                >
                  Results
                </button>

                <button
                  type="button"
                  onClick={() => sportsQuery.refetch()}
                  className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                             dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* “Next up” highlight */}
            {sportsMode === 'upcoming' && nextEvent ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/20 dark:bg-emerald-500/10">
                <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-200/80">
                  Next up
                </div>
                <div className="mt-1 text-base font-semibold">{pickString(nextEvent?.title, 'Untitled event')}</div>
                <div className="mt-2 text-sm text-slate-800 dark:text-white/80">
                  <span className="font-semibold">{fmtWhen(nextEvent?.event_at)}</span>
                  {nextEvent?.location ? <span className="text-slate-600 dark:text-white/60"> • {nextEvent.location}</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="slate">{KIND_LABEL[String(nextEvent?.kind || 'other')] || String(nextEvent?.kind || 'other')}</Badge>
                  <Badge tone="blue">{STATUS_LABEL[String(nextEvent?.status || 'scheduled')] || String(nextEvent?.status || 'scheduled')}</Badge>
                  {nextEvent?.team_label ? <Badge tone="amber">{String(nextEvent.team_label)}</Badge> : null}
                </div>
              </div>
            ) : null}

            {/* Filters */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={sportsQ}
                onChange={(e) => setSportsQ(e.target.value)}
                placeholder="Search sports… (team, opponent, title)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-300
                           dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/40 dark:focus:border-sky-400/40"
              />
              <select
                value={sportsKind}
                onChange={(e) => setSportsKind(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-300
                           dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-sky-400/40"
                title="Filter by kind"
              >
                <option value="">All kinds</option>
                <option value="fixture">Fixture</option>
                <option value="practice">Practice</option>
                <option value="tournament">Tournament</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* List */}
            <div className="mt-4">
              {sportsQuery.isLoading ? (
                <div className="text-sm text-slate-600 dark:text-darkTextSecondary">Loading sports…</div>
              ) : sportsQuery.error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-100">
                  Could not load sports.{' '}
                  <span className="text-slate-600 dark:text-white/70">
                    {String(((sportsQuery.error as any)?.message || sportsQuery.error) ?? '')}
                  </span>
                </div>
              ) : sportsGrouped.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                  No sports events found yet. If your school has sports, ask an instructor/admin to publish fixtures.
                </div>
              ) : (
                <div className="space-y-5">
                  {sportsGrouped.map((g) => (
                    <div key={g.day} className="space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-white/50">
                        {g.day}
                      </div>
                      <div className="space-y-2">
                        {g.items.map((e: any) => {
                          const k = String(e?.kind || 'other');
                          const st = String(e?.status || 'scheduled');

                          const tone = st === 'completed' ? 'green' : st === 'cancelled' ? 'rose' : 'blue';

                          const title = pickString(e?.title, 'Untitled');
                          const team = pickString(e?.team_label);
                          const opp = pickString(e?.opponent);

                          const score =
                            e?.score_home != null || e?.score_away != null
                              ? `${e?.score_home ?? '—'} : ${e?.score_away ?? '—'}`
                              : null;

                          return (
                            <div
                              key={String(e?.id ?? `${g.day}-${title}`)}
                              className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-base font-semibold">{title}</div>
                                    <Badge tone="slate">{KIND_LABEL[k] || k}</Badge>
                                    <Badge tone={tone as any}>{STATUS_LABEL[st] || st}</Badge>
                                    {score ? <Badge tone="amber">Score {score}</Badge> : null}
                                  </div>

                                  <div className="mt-1 text-sm text-slate-800 dark:text-white/80">
                                    <span className="font-medium">{fmtWhen(e?.event_at)}</span>
                                    {e?.end_at ? (
                                      <span className="text-slate-600 dark:text-white/60"> → {fmtWhen(e.end_at)}</span>
                                    ) : null}
                                  </div>

                                  <div className="mt-1 text-sm text-slate-700 dark:text-white/70">
                                    {team ? (
                                      <span className="font-medium">{team}</span>
                                    ) : (
                                      <span className="text-slate-500 dark:text-white/50">Team TBC</span>
                                    )}
                                    {opp ? <span className="text-slate-600 dark:text-white/60"> vs {opp}</span> : null}
                                    {e?.location ? (
                                      <span className="text-slate-600 dark:text-white/60"> • {e.location}</span>
                                    ) : null}
                                  </div>

                                  {e?.description ? (
                                    <div className="mt-2 text-sm text-slate-700 dark:text-white/70 whitespace-pre-wrap">
                                      {String(e.description)}
                                    </div>
                                  ) : null}
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
          </section>
        ) : null}

        {/* CLUBS TAB */}
        {activeTab === 'clubs' ? (
          <section className={card}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Clubs &amp; societies</h2>
                <p className="text-sm text-slate-600 dark:text-darkTextSecondary">These are the clubs you are currently enrolled in.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => clubsQuery.refetch()}
                  className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                             dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
                >
                  Refresh
                </button>

                <Link
                  to="/org/tools/clubs"
                  className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium transition
                             dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
                  title="Admin/instructor clubs workspace"
                >
                  Manage (staff) →
                </Link>
              </div>
            </div>

            {showMineHeadsUp ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                Heads-up: “My clubs” needs an active session token. If it doesn’t load, sign out and log in again.
              </div>
            ) : null}

            <div className="mt-4">
              {clubsQuery.isLoading ? (
                <div className="text-sm text-slate-600 dark:text-darkTextSecondary">Loading your clubs…</div>
              ) : clubsQuery.error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-100">
                  Could not load your clubs.{' '}
                  <span className="text-slate-600 dark:text-white/70">
                    {String(((clubsQuery.error as any)?.message || clubsQuery.error) ?? '')}
                  </span>
                </div>
              ) : myClubs.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                  You are not enrolled in any club yet. Ask your teacher/admin to add you to a club.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {myClubs.map((c: any) => {
                    const name = pickString(c?.name, 'Club');
                    const desc = pickString(c?.description);
                    const schedule = pickString(c?.meeting_schedule, c?.meetingSchedule);
                    const role = pickString(c?.role, c?.member_role, c?.membership_role);
                    const active = c?.is_active == null ? true : Boolean(c?.is_active);

                    return (
                      <div
                        key={String(c?.id ?? name)}
                        className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{name}</div>
                            <div className="mt-1 text-xs text-slate-600 dark:text-white/60">
                              {schedule ? `📅 ${schedule}` : '📅 Schedule: TBC'}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Badge tone={active ? 'green' : 'slate'}>{active ? 'Active' : 'Inactive'}</Badge>
                            {role ? <Badge tone="blue">{role}</Badge> : null}
                          </div>
                        </div>

                        {desc ? (
                          <div className="mt-3 text-sm text-slate-700 dark:text-white/70 whitespace-pre-wrap">{desc}</div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-500 dark:text-white/50">No description yet.</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {/* Footer help */}
        <section className={cn(card, 'text-xs text-slate-600 dark:text-white/60')}>
          Tip: Sports events are published by staff. Clubs are assigned by staff — if anything is missing, ask your class teacher to update it.
        </section>
      </div>
    </div>
  );
};

export default OrgLearnerSportsClubsPage;
