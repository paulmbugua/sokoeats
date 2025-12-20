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

const OrgInstructorHome: React.FC = () => {
  const { org, role } = (useOrg?.() ?? {}) as { org?: Org | null; role?: string | null };
  const { backendUrl, token: userToken, orgToken, orgLogout } = useShopContext();
  const authToken = orgToken || userToken;
  const navigate = useNavigate();

  const orgName: string =
    org?.name ||
    // legacy field
    (org as any)?.org_name ||
    'Your Institution';

  const tierLabel: string = (org?.tier && String(org.tier).toUpperCase()) || 'STARTER';

  const handleLogout = useCallback(async () => {
    if (orgLogout) {
      await orgLogout();
    }
    navigate('/org/login', { replace: true });
  }, [orgLogout, navigate]);

  // ─────────────────────────────────────────────────────────
  // Instructor signature state (org-level instructor_signature_url)
  // ─────────────────────────────────────────────────────────
  const initialSigUrl = org?.instructor_signature_url
    ? resolveAsset(org.instructor_signature_url, backendUrl, orgName)
    : null;

  const [savingSig, setSavingSig] = useState(false);
  const [sigError, setSigError] = useState<string | null>(null);
  const [sigSuccess, setSigSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialSigUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // NEW: class label for per-class teacher signature
  const [classLabel, setClassLabel] = useState('');

  // ─────────────────────────────────────────────────────────
  // Recent submissions state
  // ─────────────────────────────────────────────────────────
  const [recentAssignments, setRecentAssignments] = useState<OrgAssignmentRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

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
      // 1) Upload via shared helper (same as branding portal)
      const res: any = await uploadAsset(backendUrl, authToken, selectedFile, 'image');

      const rawUrl =
        typeof res === 'string' ? res : res?.url || res?.secure_url || res?.data?.url || '';

      if (!rawUrl) {
        console.error('[OrgInstructorHome] uploadAsset response with no url:', res);
        throw new Error('Upload completed but no URL was returned by the server.');
      }

      const finalUrl = resolveAsset(rawUrl, backendUrl, orgName);

      // 2) Save to org branding (same field used by portal: instructor_signature_url)
      const payload = { instructor_signature_url: finalUrl };

      const updated = await updateOrgBranding(backendUrl, authToken, org.id, payload);

      const savedUrl = updated?.instructor_signature_url
        ? resolveAsset(updated.instructor_signature_url, backendUrl, orgName)
        : finalUrl;

      setPreviewUrl(savedUrl);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setSigSuccess(
        'Signature updated. New report cards will use this image in the “Class teacher / Instructor” section.'
      );
    } catch (err: any) {
      console.error('[OrgInstructorHome] save signature error', err);

      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message;

      if (status === 403) {
        // Mirror backend’s permission model with a clear UX message
        setSigError(
          'You do not have permission to change institution branding. ' +
            'Ask your institution owner/admin to upload this signature from Institution E-Learning → Branding.'
        );
      } else {
        setSigError(msg || 'Failed to upload or save signature.');
      }
    } finally {
      setSavingSig(false);
    }
  };

  // ─────────────────────────────────────────────────────────
  // Fetch recent submissions (instructor view)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!backendUrl || !authToken || !org?.id) return;

    const orgId = org.id;
    setRecentLoading(true);
    setRecentError(null);

    fetchOrgAssignments(backendUrl, authToken, orgId, { view: 'instructor' })
      .then((resp) => {
        const rows = (resp?.data ?? []) as OrgAssignmentRow[];

        // Keep only assignments that have at least one submission
        const withSubs = rows.filter((row: any) => {
          const count = row.submission_count ?? row.submissions_count ?? row.answers_count ?? 0;
          return row.has_submission || row.hasSubmitted || count > 0;
        });

        // Sort by latest submission date desc (fallback to due_at/created_at)
        withSubs.sort((a: any, b: any) => {
          const aDate = new Date(
            a.latest_submission_at || a.submitted_at || a.due_at || a.created_at || 0
          ).getTime();
          const bDate = new Date(
            b.latest_submission_at || b.submitted_at || b.due_at || b.created_at || 0
          ).getTime();
          return bDate - aDate;
        });

        setRecentAssignments(withSubs.slice(0, 5));
      })
      .catch((err: any) => {
        console.error('[OrgInstructorHome] recent submissions error', {
          message: err?.message,
          status: err?.response?.status,
          data: err?.response?.data,
        });
        setRecentError('Failed to load recent submissions.');
      })
      .finally(() => {
        setRecentLoading(false);
      });
  }, [backendUrl, authToken, org?.id]);

  // Deep-link into an assignment’s submissions view
  const handleOpenSubmissions = useCallback(
    (assignmentId: string | number) => {
      if (!org?.id) return;

      // Frontend route mirrors backend submissions endpoint
      // Backend:   /api/orgs/:orgId/assignments/:assignmentId/submissions
      // Frontend:  /org/portal?tab=assign&assignmentId=...&view=submissions
      const id = encodeURIComponent(String(assignmentId));
      navigate(`/org/portal?tab=assign&assignmentId=${id}&view=submissions`);
    },
    [navigate, org?.id]
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-[#0f172a] dark:text-darkTextPrimary">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
        {/* Header */}
        <header className="rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#0b1220] px-4 sm:px-6 py-4 sm:py-5 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-emerald-500/80">
              {role ? `${String(role).toUpperCase()} PORTAL` : 'INSTRUCTOR PORTAL'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-bold leading-tight">
              Welcome back, instructor
            </h1>
            <p className="text-xs sm:text-sm text-mutedGray dark:text-darkTextSecondary">
              You’re managing learning for <span className="font-semibold">{orgName}</span>. Use
              this space to create assignments, enter exam marks, and keep your classes organized.
            </p>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Plan: {tierLabel}
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] bg-sky-500/10 text-sky-400 border border-sky-500/30">
                Role: {role ? String(role).toUpperCase() : 'INSTRUCTOR'}
              </span>
            </div>
          </div>

          {/* Primary actions */}
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-[#020617] text-xs sm:text-sm font-semibold text-slate-700 dark:text-darkTextPrimary px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              title="Sign out of this institution"
            >
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">Logout</span>
            </button>

            <Link
              to="/org/portal?tab=assign"
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-md shadow-indigo-600/30 transition"
              title="Open E-Learning Portal"
            >
              Open E-Learning Portal
            </Link>
            <Link
              to="/robot-teach"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-md shadow-emerald-600/30 transition"
              title="Try Robot Tutor now"
            >
              Try Robot Tutor
            </Link>
          </div>
        </header>

        {/* Quick actions (chips) */}
        <section className="rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#020617] px-4 sm:px-5 py-4 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm sm:text-base font-semibold">Quick actions</h2>
              <p className="text-xs sm:text-sm text-mutedGray dark:text-darkTextSecondary">
                Jump straight into the tools you use most often.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to="/org/portal?tab=assign" className="chip chip-active">
              Create assignment
            </Link>
            <Link to="/org/exams" className="chip">
              Enter marks &amp; report cards
            </Link>
            <Link to="/class-vault/upload" className="chip">
              Upload recorded class
            </Link>
          </div>

          <p className="mt-3 text-[11px] sm:text-xs text-mutedGray dark:text-darkTextSecondary">
            Use the E-Learning Portal to configure assignments and review analytics. Use the Exams
            &amp; results area to directly capture marks, auto-grade, and generate rich PDF report
            cards for guardians.
          </p>
        </section>

        {/* Instructor signature section – mirrors portal backend flow */}
        <section className="rounded-3xl border border-slate-200/70 dark:border-darkCard bg-white/90 dark:bg-[#020617] px-4 sm:px-5 py-4 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold">Instructor signature</h2>
              <p className="text-xs sm:text-sm text-mutedGray dark:text-darkTextSecondary">
                Upload a clear signature image to appear in the{' '}
                <span className="font-semibold">“Class teacher / Instructor”</span> section of your
                report cards. This uses the same branding field as the Institution E-Learning
                portal.
              </p>
            </div>
            {previewUrl && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[10px] sm:text-[11px] text-mutedGray dark:text-darkTextSecondary">
                  Current preview
                </span>
                <div className="h-14 w-40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center px-2">
                  <img
                    src={previewUrl}
                    alt="Instructor signature preview"
                    className="max-h-10 max-w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleSignatureChange}
              className="block w-full text-xs text-slate-600 dark:text-slate-300
                         file:mr-3 file:py-1.5 file:px-3 file:rounded-xl
                         file:border-0 file:text-xs file:font-semibold
                         file:bg-slate-900/90 file:text-white
                         hover:file:bg-slate-900
                         dark:file:bg-slate-200 dark:file:text-slate-900 dark:hover:file:bg-white/90"
            />
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={savingSig}
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/60 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-sm shadow-emerald-600/30 transition"
            >
              {savingSig ? 'Saving…' : 'Save signature'}
            </button>
          </div>

          <p className="mt-2 text-[11px] sm:text-xs text-mutedGray dark:text-darkTextSecondary">
            Tip: use a transparent PNG (around 600×200px) with a dark pen on a light background.
            Once saved, future report cards and certificates will automatically use this signature
            image.
          </p>

          {/* NEW: Apply preview as class-teacher signature for a specific class */}
          <div className="mt-4 space-y-2">
            <label className="text-xs sm:text-sm text-mutedGray dark:text-darkTextSecondary">
              Class / Grade this signature belongs to
            </label>
            <input
              className="input w-full max-w-xs"
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
              placeholder="e.g. Grade 7 Blue"
            />
            <button
              type="button"
              disabled={!previewUrl || !classLabel || !org?.id || !authToken}
              onClick={async () => {
                try {
                  setSigError(null);
                  setSigSuccess(null);

                  if (!backendUrl || !org?.id || !authToken) {
                    throw new Error('Missing organization context.');
                  }

                  const res = await fetch(
                    `${backendUrl}/api/orgs/${org!.id}/classes/${encodeURIComponent(
                      classLabel
                    )}/class-teacher-signature`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authToken}`,
                      },
                      body: JSON.stringify({ signature_url: previewUrl }),
                    }
                  );
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    throw new Error(j.message || `Failed (${res.status})`);
                  }
                  setSigSuccess(
                    `Signature applied to ${classLabel}. New report cards for this class will use it.`
                  );
                } catch (e: any) {
                  setSigError(e?.message || 'Failed to apply class teacher signature.');
                }
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-xs sm:text-sm font-semibold text-white px-4 py-2.5 shadow-sm shadow-indigo-600/30 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Save as class teacher for this class
            </button>
          </div>

          {sigError && <p className="mt-2 text-[11px] sm:text-xs text-red-500">{sigError}</p>}
          {sigSuccess && (
            <p className="mt-2 text-[11px] sm:text-xs text-emerald-500">{sigSuccess}</p>
          )}
        </section>

        {/* Main grid of cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            to="/org/portal?tab=assign"
            className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                RobotTeacher &amp; assignments
              </h2>
              <span className="text-[11px] text-emerald-500 group-hover:translate-x-0.5 transition">
                Open →
              </span>
            </div>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Create AI-powered lessons, configure assignments, and share links that drop learners
              directly into RobotTeacher.
            </p>
          </Link>

          <Link
            to="/org/exams"
            className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                Exams, marks &amp; reports
              </h2>
              <span className="text-[11px] text-emerald-500 group-hover:translate-x-0.5 transition">
                Enter marks →
              </span>
            </div>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Enter student marks directly, auto-grade using your bands, and generate modern report
              cards with analytics and email sending to guardians.
            </p>
          </Link>

          <Link
            to="/create-course"
            className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                Create / manage courses
              </h2>
              <span className="text-[11px] text-emerald-500 group-hover:translate-x-0.5 transition">
                Manage →
              </span>
            </div>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Build structured courses with topics, lessons, and assessments that plug directly into
              your institution’s portal and learner home.
            </p>
          </Link>

          <Link
            to="/class-vault/upload"
            className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                Upload recorded classes
              </h2>
              <span className="text-[11px] text-emerald-500 group-hover:translate-x-0.5 transition">
                Upload →
              </span>
            </div>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Add video lessons, slides, and PDFs to your ClassVault so students can revisit key
              sessions on their own time.
            </p>
          </Link>

          <Link
            to="/messages"
            className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                Messages
              </h2>
              <span className="text-[11px] text-emerald-500 group-hover:translate-x-0.5 transition">
                Open →
              </span>
            </div>
            <p className="mt-2 text-sm text-mutedGray dark:text-darkTextSecondary">
              Keep in touch with learners and guardians, respond to questions, and coordinate
              support from a single inbox.
            </p>
          </Link>

          {/* NEW: Recent submissions summary */}
          <div className="group rounded-2xl bg-white/95 dark:bg-[#0f1821] border border-slate-200/80 dark:border-darkCard shadow-sm hover:shadow-md hover:-translate-y-[1px] transition flex flex-col p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-darkTextPrimary">
                Recent submissions
              </h2>
              <Link
                to="/org/portal?tab=assign"
                className="text-[11px] text-emerald-500 hover:text-emerald-400 underline-offset-2 hover:underline"
              >
                Open portal →
              </Link>
            </div>

            {recentLoading && (
              <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                Loading recent submissions…
              </p>
            )}

            {!recentLoading && recentError && <p className="text-xs text-red-500">{recentError}</p>}

            {!recentLoading && !recentError && recentAssignments.length === 0 && (
              <p className="text-xs text-mutedGray dark:text-darkTextSecondary">
                No submissions yet. Once learners start turning in work, their latest assignments
                will appear here.
              </p>
            )}

            {!recentLoading && !recentError && recentAssignments.length > 0 && (
              <div className="mt-1 space-y-2">
                {recentAssignments.map((a) => {
                  const count =
                    (a as any).submission_count ??
                    (a as any).submissions_count ??
                    (a as any).answers_count ??
                    0;

                  const latest = (a as any).latest_submission_at ?? (a as any).submitted_at ?? null;

                  let latestLabel = '';
                  if (latest) {
                    try {
                      latestLabel = new Date(latest).toLocaleString();
                    } catch {
                      latestLabel = String(latest);
                    }
                  }

                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleOpenSubmissions(a.id)}
                      className="w-full text-left flex items-start justify-between gap-2 border-b border-slate-100/80 dark:border-slate-800 pb-1.5 last:border-b-0 last:pb-0 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 rounded-lg px-1 -mx-1 transition"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900 dark:text-darkTextPrimary">
                          {a.title || a.course_title || 'Untitled assignment'}
                        </p>
                        <p className="truncate text-[11px] text-mutedGray dark:text-darkTextSecondary">
                          {a.org_class_label || (a as any).class_label || 'All classes'} •{' '}
                          {a.org_subject_key || (a as any).subject_key || 'Subject'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-semibold text-emerald-500">
                          {count} <span className="font-normal text-[11px]">subm.</span>
                        </p>
                        {latestLabel && (
                          <p className="text-[10px] text-mutedGray dark:text-darkTextSecondary">
                            {latestLabel}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OrgInstructorHome;
