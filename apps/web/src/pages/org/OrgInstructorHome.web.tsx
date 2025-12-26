// apps/web/src/pages/org/OrgInstructorHome.web.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useShopContext } from '@mytutorapp/shared/context';
import { uploadAsset } from '@mytutorapp/shared/api';
import {
  updateOrgBranding,
  type OrgResp as Org,
  type OrgAssignmentRow,
  getOrgAssignments as fetchOrgAssignments,
} from '@mytutorapp/shared/api/orgApi';
import { resolveAsset } from './portal/OrgProfileShared.web';

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const pageShell =
  'min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-darkTextPrimary px-3 sm:px-4 py-6';

const card =
  'rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] p-4 sm:p-5 shadow-sm';

function fmtWhen(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function Badge({
  tone,
  children,
}: {
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' | 'indigo';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-400/30'
      : tone === 'sky'
        ? 'bg-sky-500/10 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-400/30'
        : tone === 'amber'
          ? 'bg-amber-500/10 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-400/30'
          : tone === 'rose'
            ? 'bg-rose-500/10 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-400/30'
            : tone === 'indigo'
              ? 'bg-indigo-500/10 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-200 dark:border-indigo-400/30'
              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-white/70 dark:border-white/10';

  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 border', cls)}>
      {children}
    </span>
  );
}

function IconTile({
  to,
  icon,
  title,
  subtitle,
  tone = 'indigo',
  badge,
  disabled,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone?: 'indigo' | 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
  badge?: string;
  disabled?: boolean;
}) {
  const toneCls =
    tone === 'emerald'
      ? 'from-emerald-500/20 to-emerald-500/5 ring-emerald-300/50 text-emerald-700 dark:from-emerald-500/25 dark:to-emerald-500/5 dark:ring-emerald-400/30 dark:text-emerald-100'
      : tone === 'sky'
        ? 'from-sky-500/20 to-sky-500/5 ring-sky-300/50 text-sky-700 dark:from-sky-500/25 dark:to-sky-500/5 dark:ring-sky-400/30 dark:text-sky-100'
        : tone === 'amber'
          ? 'from-amber-500/20 to-amber-500/5 ring-amber-300/50 text-amber-800 dark:from-amber-500/25 dark:to-amber-500/5 dark:ring-amber-400/30 dark:text-amber-100'
          : tone === 'rose'
            ? 'from-rose-500/20 to-rose-500/5 ring-rose-300/50 text-rose-700 dark:from-rose-500/25 dark:to-rose-500/5 dark:ring-rose-400/30 dark:text-rose-100'
            : tone === 'slate'
              ? 'from-slate-200/60 to-slate-50 ring-slate-200 text-slate-700 dark:from-white/10 dark:to-white/5 dark:ring-white/10 dark:text-white'
              : 'from-indigo-500/20 to-indigo-500/5 ring-indigo-300/50 text-indigo-700 dark:from-indigo-500/25 dark:to-indigo-500/5 dark:ring-indigo-400/30 dark:text-indigo-100';

  const base =
    'group relative rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 ' +
    'hover:bg-slate-50 dark:hover:bg-white/10 transition overflow-hidden ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:focus-visible:ring-white/20';

  const inner =
    'flex flex-col items-center justify-center text-center px-3 py-4 sm:py-5 min-h-[108px] sm:min-h-[124px]';

  const iconWrap =
    'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl grid place-items-center bg-gradient-to-br ring-1 shadow-inner ' +
    toneCls;

  const titleCls = 'mt-2 text-sm font-semibold text-slate-900 dark:text-white/95';
  const subCls = 'mt-1 text-[11px] leading-snug text-slate-600 dark:text-white/60';

  const shine = (
    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition">
      <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
      <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-slate-400/10 dark:bg-white/10 blur-2xl" />
    </div>
  );

  const content = (
    <>
      {shine}

      <div className="absolute top-2 right-2 text-[11px] text-slate-400 dark:text-white/40 group-hover:text-slate-500 dark:group-hover:text-white/70 transition">
        ↗
      </div>

      {badge ? (
        <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:bg-white/10 dark:text-white/70 dark:border-white/10">
          {badge}
        </div>
      ) : null}

      <div className={inner}>
        <div className={iconWrap}>{icon}</div>
        <div className={titleCls}>{title}</div>
        {subtitle ? <div className={subCls}>{subtitle}</div> : null}
      </div>
    </>
  );

  if (disabled) {
    return <div className={cn(base, 'opacity-60 cursor-not-allowed')}>{content}</div>;
  }

  return (
    <Link to={to} className={base} title={title}>
      {content}
    </Link>
  );
}

const OrgInstructorHome: React.FC = () => {
  const { org, role, membership } = (useOrg?.() ?? {}) as {
    org?: Org | null;
    role?: string | null;
    membership?: any;
  };
  const shop = (useShopContext?.() ?? {}) as any;

  const backendUrl: string | null = shop?.backendUrl ?? null;
  const userToken: string | null = shop?.token ?? null;
  const orgToken: string | null = shop?.orgToken ?? null;
  const orgLogout: null | (() => Promise<void>) = shop?.orgLogout ?? null;

  const authToken = orgToken || userToken;
  const navigate = useNavigate();

  const orgName: string = org?.name || (org as any)?.org_name || 'Your Institution';
  const tierLabel: string = (org?.tier && String(org.tier).toUpperCase()) || 'STARTER';
  const isProTier =
    String(org?.tier || '').toLowerCase() === 'pro' ||
    String(org?.tier || '').toLowerCase() === 'enterprise';

  const primaryMembership = Array.isArray(membership) ? membership[0] : membership;
  const roleLower = (role || '').toLowerCase();
  const hasFeeAccess =
    isProTier &&
    (roleLower === 'owner' || roleLower === 'admin' || (primaryMembership as any)?.can_access_fees === true);

  const portalLabel = role ? `${String(role).toUpperCase()} PORTAL` : 'INSTRUCTOR PORTAL';

  const handleLogout = useCallback(async () => {
    if (orgLogout) await orgLogout();
    navigate('/org/login', { replace: true });
  }, [orgLogout, navigate]);

  // ─────────────────────────────────────────────────────────
  // Instructor signature state (org-level instructor_signature_url)
  // ─────────────────────────────────────────────────────────
  const initialSigUrl =
    org?.instructor_signature_url && backendUrl
      ? resolveAsset(org.instructor_signature_url, backendUrl, orgName)
      : org?.instructor_signature_url
        ? String(org.instructor_signature_url)
        : null;

  const [savingSig, setSavingSig] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigSuccess, setSigSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialSigUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Optional: per-class teacher signature
  const [classLabel, setClassLabel] = useState('');

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSigError(null);
    setSigSuccess(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
  };

  const handleSaveSignature = async () => {
    setSigError(null);
    setSigSuccess(null);

    if (!backendUrl || !authToken || !org?.id) {
      setSigError('Missing organization context. Please refresh and try again.');
      return;
    }
    if (!selectedFile) {
      setSigError('Please choose a signature image first.');
      return;
    }
    if (!/^image\//.test(selectedFile.type)) {
      setSigError('Please choose an image file (png, jpg, webp, svg).');
      return;
    }

    setSavingSig(true);
    try {
      const res: any = await uploadAsset(backendUrl, authToken, selectedFile, 'image');

      const rawUrl =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!rawUrl) {
        console.error('[OrgInstructorHome] uploadAsset response with no url:', res);
        throw new Error('Upload completed but no URL was returned by the server.');
      }

      const finalUrl = resolveAsset(rawUrl, backendUrl, orgName);

      const payload = { instructor_signature_url: finalUrl };
      const updated = await updateOrgBranding(backendUrl, authToken, org.id, payload);

      const savedUrl = updated?.instructor_signature_url
        ? resolveAsset(updated.instructor_signature_url, backendUrl, orgName)
        : finalUrl;

      setPreviewUrl(savedUrl);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      setSigSuccess(
        'Signature updated. New report cards will use this image in the “Class teacher / Instructor” section.',
      );
    } catch (err: any) {
      console.error('[OrgInstructorHome] save signature error', err);
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message;

      if (status === 403) {
        setSigError(
          'You do not have permission to change institution branding. ' +
            'Ask your institution owner/admin to upload this signature from Institution E-Learning → Branding.',
        );
      } else {
        setSigError(msg || 'Failed to upload or save signature.');
      }
    } finally {
      setSavingSig(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Recent submissions state
  // ─────────────────────────────────────────────────────────
  const [recentAssignments, setRecentAssignments] = useState<OrgAssignmentRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    if (!backendUrl || !authToken || !org?.id) return;

    const orgId = org.id;
    setRecentLoading(true);
    setRecentError(null);

    fetchOrgAssignments(backendUrl, authToken, orgId, { view: 'instructor' })
      .then((resp) => {
        const rows = (resp?.data ?? []) as OrgAssignmentRow[];

        const withSubs = rows.filter((row: any) => {
          const count = row.submission_count ?? row.submissions_count ?? row.answers_count ?? 0;
          return row.has_submission || row.hasSubmitted || count > 0;
        });

        withSubs.sort((a: any, b: any) => {
          const aDate = new Date(
            a.latest_submission_at || a.submitted_at || a.due_at || a.created_at || 0,
          ).getTime();
          const bDate = new Date(
            b.latest_submission_at || b.submitted_at || b.due_at || b.created_at || 0,
          ).getTime();
          return bDate - aDate;
        });

        setRecentAssignments(withSubs.slice(0, 6));
      })
      .catch((err: any) => {
        console.error('[OrgInstructorHome] recent submissions error', {
          message: err?.message,
          status: err?.response?.status,
          data: err?.response?.data,
        });
        setRecentError('Failed to load recent submissions.');
      })
      .finally(() => setRecentLoading(false));
  }, [backendUrl, authToken, org?.id]);

  const handleOpenSubmissions = useCallback(
    (assignmentId: string | number) => {
      if (!org?.id) return;
      const id = encodeURIComponent(String(assignmentId));
      navigate(`/org/portal?tab=assign&assignmentId=${id}&view=submissions`);
    },
    [navigate, org?.id],
  );

  const heroBg =
    'relative overflow-hidden rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] ' +
    'before:absolute before:inset-0 ' +
    'before:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_55%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.10),transparent_55%)] ' +
    'dark:before:bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.18),transparent_55%)] ' +
    'before:opacity-100';

  return (
    <div className={pageShell}>
      <div className="max-w-screen-xl mx-auto space-y-4">
        {/* HERO */}
        <header className={cn(heroBg, 'p-4 sm:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}>
          <div className="relative min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-600 dark:text-darkTextSecondary">
              {portalLabel}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight mt-1">
              Welcome back, <span className="text-slate-900 dark:text-white/95">instructor</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-darkTextSecondary mt-1">
              Manage learning for <span className="font-semibold text-slate-900 dark:text-darkTextPrimary">{orgName}</span>.
              Create assignments, enter marks, and keep classes organized.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="emerald">Plan: {tierLabel}</Badge>
              <Badge tone="sky">Role: {role ? String(role).toUpperCase() : 'INSTRUCTOR'}</Badge>
              {!authToken ? <Badge tone="rose">Session missing</Badge> : null}
            </div>
          </div>

          <div className="relative flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleLogout}
              className="text-[11px] sm:text-xs px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-white/15 bg-white/80 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-white/80 font-semibold transition"
              title="Sign out of this institution"
            >
              Sign out
            </button>

            <Link
              to="/org/portal?tab=assign"
              className="text-[11px] sm:text-xs px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm shadow-indigo-600/25 transition"
              title="Open E-Learning Portal"
            >
              Open E-Learning
            </Link>

            <Link
              to="/robot-teach"
              className="text-[11px] sm:text-xs px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm shadow-emerald-600/25 transition"
              title="Try Robot Tutor now"
            >
              Try Robot Tutor
            </Link>
          </div>
        </header>

        {/* WORKSPACE TILES */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Instructor workspace</h2>
              <p className="text-xs text-slate-600 dark:text-darkTextSecondary mt-1">
                Everything you need — in fast, modern tiles.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 dark:text-darkTextSecondary">
              <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 dark:bg-white/5 dark:border-white/10">
                Quick launch
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
            <IconTile to="/org/portal?tab=assign" icon={<span className="text-2xl">📝</span>} title="Assignments" subtitle="Portal" tone="indigo" />
            <IconTile to="/org/exams" icon={<span className="text-2xl">🧾</span>} title="Exams" subtitle="Marks & PDFs" tone="sky" />
            <IconTile to="/create-course" icon={<span className="text-2xl">🧠</span>} title="Courses" subtitle="Create" tone="emerald" />
            <IconTile to="/class-vault/upload" icon={<span className="text-2xl">🎥</span>} title="ClassVault" subtitle="Upload" tone="amber" />
            <IconTile to="/messages" icon={<span className="text-2xl">💬</span>} title="Messages" subtitle="Inbox" tone="rose" />
            <IconTile to="/org/profile" icon={<span className="text-2xl">🏫</span>} title="Institution" subtitle="Profile" tone="slate" />
          </div>

          <div className="mt-4 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Tip: Use <b>Assignments</b> to publish tasks and review submissions. Use <b>Exams</b> to capture marks,
            auto-grade, and generate PDF report cards.
          </div>
        </section>

        {/* PRO TOOLS */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Institution tools</h2>
              <p className="text-xs text-slate-600 dark:text-darkTextSecondary mt-1">
                Attendance, fees, newsletters, and announcements.
              </p>
            </div>

            {!isProTier ? (
              <div className="text-[11px] px-3 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-400/20">
                Pro / Enterprise required for some tools
              </div>
            ) : (
              <div className="text-[11px] px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-400/20">
                Unlocked
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
            <IconTile to="/org/attendance" icon={<span className="text-2xl">✅</span>} title="Attendance" subtitle="Sessions" tone="emerald" disabled={!isProTier} badge={!isProTier ? 'Locked' : undefined} />
            <IconTile
              to="/org/fees"
              icon={<span className="text-2xl">💳</span>}
              title="Fees"
              subtitle="Balances"
              tone="emerald"
              disabled={!hasFeeAccess}
              badge={!hasFeeAccess ? 'No access' : undefined}
            />
            <IconTile to="/org/newsletters" icon={<span className="text-2xl">📰</span>} title="Newsletters" subtitle="Send" tone="sky" disabled={!isProTier} badge={!isProTier ? 'Locked' : undefined} />
            <IconTile to="/org/announcements" icon={<span className="text-2xl">📣</span>} title="Announcements" subtitle="Post" tone="indigo" disabled={!isProTier} badge={!isProTier ? 'Locked' : undefined} />
            <IconTile to="/org/tools/clubs" icon={<span className="text-2xl">🤝</span>} title="Clubs" subtitle="Manage" tone="slate" />
            <IconTile to="/org/tools/sports" icon={<span className="text-2xl">🏆</span>} title="Sports" subtitle="Publish" tone="amber" />
          </div>

          {!isProTier ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-100">
              Some tools are locked on <b>Starter</b>. If you need them, ask your admin to upgrade the institution plan.
            </div>
          ) : null}
        </section>

        {/* RECENT SUBMISSIONS */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Recent submissions</h2>
              <p className="text-xs text-slate-600 dark:text-darkTextSecondary mt-1">
                Quickly jump to what learners submitted most recently.
              </p>
            </div>
            <Link
              to="/org/portal?tab=assign"
              className="text-[11px] sm:text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80"
            >
              Open portal →
            </Link>
          </div>

          <div className="mt-3">
            {recentLoading ? (
              <div className="text-sm text-slate-600 dark:text-darkTextSecondary">
                Loading recent submissions…
              </div>
            ) : recentError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-100">
                {recentError}
              </div>
            ) : recentAssignments.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                No submissions yet. Once learners start turning in work, their latest assignments will show up here.
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-white/10 dark:bg-white/5">
                <div className="divide-y divide-slate-200/70 dark:divide-white/10">
                  {recentAssignments.map((a: any) => {
                    const count = a.submission_count ?? a.submissions_count ?? a.answers_count ?? 0;
                    const latest = a.latest_submission_at ?? a.submitted_at ?? null;
                    const classLabel = a.org_class_label || a.class_label || 'All classes';
                    const subjectKey = a.org_subject_key || a.subject_key || 'Subject';

                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => handleOpenSubmissions(a.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white/90 truncate">
                            {a.title || a.course_title || 'Untitled assignment'}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600 dark:text-white/60 truncate">
                            {classLabel} • {subjectKey}
                            {latest ? (
                              <span className="text-slate-500 dark:text-white/45"> • {fmtWhen(latest)}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                            {count}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-white/50">submissions</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* SIGNATURE */}
        <section className={cn(card, 'relative overflow-hidden')}>
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Instructor signature</h2>
              <p className="text-xs text-slate-600 dark:text-darkTextSecondary mt-1">
                Upload a clear signature image to appear in the <b>“Class teacher / Instructor”</b> section of report
                cards. (Uses the institution branding field.)
              </p>
            </div>

            {previewUrl ? (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] text-slate-500 dark:text-darkTextSecondary">Preview</span>
                <div className="h-14 w-44 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center px-2 dark:border-white/10 dark:bg-white/5">
                  <img
                    src={previewUrl}
                    alt="Instructor signature preview"
                    className="max-h-10 max-w-full object-contain"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSignatureChange}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm outline-none focus:border-emerald-400/60
                         dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:focus:border-emerald-400/40"
            />

            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={savingSig}
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-sm shadow-emerald-600/25 transition"
            >
              {savingSig ? 'Saving…' : 'Save signature'}
            </button>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Tip: use a transparent PNG (about 600×200px). Make it clean and readable.
          </div>

          {/* Optional: per-class teacher signature */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Apply to a specific class</div>
                <div className="text-[11px] text-slate-600 dark:text-darkTextSecondary">
                  If your setup supports per-class signatures, set the class label and save.
                </div>
              </div>
              <Badge tone="slate">Optional</Badge>
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={classLabel}
                onChange={(e) => setClassLabel(e.target.value)}
                placeholder="e.g. Grade 7 Blue"
                className="w-full sm:max-w-xs rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400/60
                           dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:border-sky-400/40"
              />
              <button
                type="button"
                disabled={!previewUrl || !classLabel || !org?.id || !authToken || !backendUrl}
                onClick={async () => {
                  try {
                    setSigError(null);
                    setSigSuccess(null);

                    if (!backendUrl || !org?.id || !authToken) throw new Error('Missing organization context.');
                    if (!previewUrl) throw new Error('Upload a signature first.');
                    if (!classLabel.trim()) throw new Error('Enter a class label.');

                    const res = await fetch(
                      `${backendUrl}/api/orgs/${org.id}/classes/${encodeURIComponent(classLabel.trim())}/class-teacher-signature`,
                      {
                        method: 'PUT',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${authToken}`,
                        },
                        body: JSON.stringify({ signature_url: previewUrl }),
                      },
                    );

                    if (!res.ok) {
                      const j = await res.json().catch(() => ({}));
                      throw new Error(j.message || `Failed (${res.status})`);
                    }

                    setSigSuccess(
                      `Signature applied to ${classLabel.trim()}. New report cards for this class will use it.`,
                    );
                  } catch (e: any) {
                    setSigError(e?.message || 'Failed to apply class teacher signature.');
                  }
                }}
                className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-sm shadow-indigo-600/25 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Save for class
              </button>
            </div>

            {sigError ? <div className="mt-2 text-[11px] text-rose-700 dark:text-rose-200">{sigError}</div> : null}
            {sigSuccess ? (
              <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-200">{sigSuccess}</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrgInstructorHome;
