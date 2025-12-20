// apps/web/src/pages/org/OrgPortalPanes.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import type { OrgResp as Org, OrgAnalyticsRow } from '@mytutorapp/shared/api/orgApi';
import { useCourses } from '@mytutorapp/shared/hooks';

type TabKey = 'branding' | 'assign' | 'analytics';
type Period = 'month' | 'term' | 'year';

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-[#49739c] dark:text-darkTextSecondary">
    {children}
  </div>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[#e7edf4] text-[#0d141c] dark:bg-[#172534] dark:text-darkTextPrimary">
    {children}
  </span>
);

/** ─────────────────────────────────────────────────────────
 * BRANDING + ASSIGN pane
 * ───────────────────────────────────────────────────────── */
type BrandingAssignProps = {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  instructors: { id: string | number; name?: string; email?: string }[];

  // capabilities
  canBranding: boolean;
  canAssignments: boolean;
  canCustomPassTimers: boolean;
  canSSO: boolean;
  canWebhooks: boolean;
  canEmailReports: boolean;

  // org/session
  org: Org | null;
  token?: string | null;
  backendUrl: string;

  // branding
  form: any;
  setForm: (f: any) => void;
  uploadingLogo: boolean;
  uploadingSignature: boolean;
  uploadingInstructorSignature: boolean;
  onUpload: (
    file: File | null,
    target: 'logo_url' | 'signature_url' | 'instructor_signature_url'
  ) => Promise<void>;

  onSaveBranding: () => void;
  onSendTestReport: () => Promise<void>;

  // assignment (Teach with AI)
  courseId: string;
  setCourseId: (v: string) => void;
  titleOverride: string;
  setTitleOverride: (v: string) => void;
  passMark: number | '';
  setPassMark: (v: number | '') => void;
  timer: number | '';
  setTimer: (v: number | '') => void;
  dueAt: string;
  setDueAt: (v: string) => void;
  onCreateAssignment: () => void;
  inviteLink: string;
  copyLink: () => Promise<void> | void;
  setCourseIdAndUrl?: (next: string) => void;
  tutorToken?: string | null;

  // NEW: assignment scope (for class/subject filters)
  assignClassLabel?: string;
  assignSubjectKey?: string;
  setAssignScope?: (opts: { classLabel?: string; subjectKey?: string }) => void;

  // NEW: legacy assignment composer
  legacyTitle: string;
  setLegacyTitle: (v: string) => void;
  legacyInstructions: string;
  setLegacyInstructions: (v: string) => void;
  legacyDueAt: string;
  setLegacyDueAt: (v: string) => void;
  legacyAttachmentUrl: string;
  legacyUploadingAttachment: boolean;
  onUploadLegacyAttachment: (file: File | null) => Promise<string | null> | Promise<null> | null;
  onCreateLegacyAssignment: () => void;
  creatingLegacyAssignment: boolean;
};

export function BrandingAssignPane(props: BrandingAssignProps) {
  const {
    tab,
    setTab,
    canBranding,
    canAssignments,
    canCustomPassTimers,
    canSSO,
    canWebhooks,
    canEmailReports,
    org,
    token,
    backendUrl,
    form,
    setForm,
    uploadingLogo,
    uploadingSignature,
    uploadingInstructorSignature,
    onUpload,
    onSaveBranding,
    onSendTestReport,
    courseId,
    setCourseId,
    titleOverride,
    setTitleOverride,
    passMark,
    setPassMark,
    timer,
    setTimer,
    dueAt,
    setDueAt,
    onCreateAssignment,
    inviteLink,
    copyLink,
    setCourseIdAndUrl,
    tutorToken,
    assignClassLabel,
    assignSubjectKey,
    setAssignScope,
    legacyTitle,
    setLegacyTitle,
    legacyInstructions,
    setLegacyInstructions,
    legacyDueAt,
    setLegacyDueAt,
    legacyAttachmentUrl,
    legacyUploadingAttachment,
    onUploadLegacyAttachment,
    onCreateLegacyAssignment,
    creatingLegacyAssignment,
  } = props;

  // Generate stable ids for file inputs (works on SSR + iOS Safari)
  const logoInputId = React.useId();
  const sigInputId = React.useId();
  const instructorSigInputId = React.useId();
  const coursesToken = tutorToken || token || null;

  const {
    courses = [],
    loading: coursesLoading,
    error: coursesError,
  } = useCourses({
    backendUrl,
    token: coursesToken || undefined,
  } as any);

  // Webhook test enablement logic
  const rawUrl = String(form.webhook_url ?? '').trim();
  const urlOk = /^https:\/\/.+/i.test(rawUrl);
  const canSendTest = Boolean(org?.id && token && form.webhook_enabled && urlOk);
  const [isSending, setIsSending] = React.useState(false);

  React.useEffect(() => {
    console.debug('send-test state', {
      enabled: !!form.webhook_enabled,
      rawUrl,
      urlOk,
      canSendTest,
      orgId: org?.id,
      hasToken: !!token,
    });
  }, [form.webhook_enabled, rawUrl, urlOk, canSendTest, org?.id, token]);

  // Group instructor emails into safe-size BCC chunks (mailto URI length guard)
  const { bccChunks, instructorEmails } = React.useMemo(() => {
    const instructorEmails = (props.instructors ?? [])
      .map((i) => (i.email || '').trim())
      .filter(Boolean);

    const mkMailto = (emails: string[], link: string) => {
      const subject = encodeURIComponent('Course invite');
      const body = encodeURIComponent(link);
      const bcc = encodeURIComponent(emails.join(','));
      return `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;
    };

    const chunks: string[][] = [];
    if (inviteLink) {
      let cur: string[] = [];
      for (const e of instructorEmails) {
        const test = mkMailto([...cur, e], inviteLink);
        // keep some headroom under common 2k limits
        if (test.length > 1800 || cur.length >= 50) {
          if (cur.length) chunks.push(cur);
          cur = [e];
        } else {
          cur.push(e);
        }
      }
      if (cur.length) chunks.push(cur);
    }

    return { bccChunks: chunks, instructorEmails };
  }, [props.instructors, inviteLink]);

  // File picker handler
  const handlePick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'logo_url' | 'signature_url' | 'instructor_signature_url'
  ) => {
    const inputEl = e.currentTarget; // cache before await
    const file = inputEl.files?.[0] ?? null;

    if (!file) {
      try {
        inputEl.value = '';
      } catch {}
      return;
    }

    if (!token) {
      alert('Please sign in to upload images.');
      try {
        inputEl.value = '';
      } catch {}
      return;
    }
    if (!canBranding && target !== 'instructor_signature_url') {
      // instructor signature is handled separately by instructor home,
      // but from here we keep general branding changes locked if needed.
      alert('Branding settings can only be changed by your institution owner/admin.');
      try {
        inputEl.value = '';
      } catch {}
      return;
    }

    try {
      await onUpload(file, target);
    } finally {
      try {
        if (document.body.contains(inputEl)) inputEl.value = '';
      } catch {}
    }
  };

  return (
    <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-darkCard bg-white dark:bg-[#0f1821] p-3 sm:p-4">
      {/* Tabs local header (mobile-friendly quick switch) */}
      <div className="mb-3 flex items-center gap-2">
        {canBranding && (
          <button
            className={`chip ${tab === 'branding' ? 'chip-active' : ''}`}
            onClick={() => setTab('branding')}
          >
            Branding
          </button>
        )}
        <button
          className={`chip ${tab === 'assign' ? 'chip-active' : ''}`}
          onClick={() => setTab('assign')}
        >
          Assign
        </button>
      </div>

      {tab === 'branding' && (
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
          {!canBranding && (
            <div className="sm:col-span-2 text-sm text-amber-700 dark:text-amber-300">
              Branding settings aren’t editable from this account. Please ask your institution owner
              or admin to update logos, signatures, and contact details.
            </div>
          )}

          <div>
            <Label>Institution Name</Label>
            <input
              className="input mt-1 w-full"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Example Academy"
              disabled={!canBranding}
            />
          </div>

          <div>
            <Label>Certificate Title (optional)</Label>
            <input
              className="input mt-1 w-full"
              value={form.certificate_title || ''}
              onChange={(e) => setForm({ ...form, certificate_title: e.target.value })}
              placeholder="Certificate of Completion"
              disabled={!canBranding}
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded bg-[#e7edf4] dark:bg-[#172534] ring-1 ring-[#cedbe8] dark:ring-darkCard overflow-hidden flex items-center justify-center">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-[#49739c] dark:text-white/60 px-1 text-center">
                    No logo
                  </span>
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="input w-full"
                  value={form.logo_url || ''}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="https://..."
                  disabled={!canBranding}
                />

                {/* File input (visually hidden) */}
                <input
                  id={logoInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handlePick(e, 'logo_url')}
                />
                {/* Label styled as button opens picker */}
                <label
                  htmlFor={logoInputId}
                  className={[
                    'btn w-full sm:w-auto text-center',
                    uploadingLogo || !canBranding || !token
                      ? 'opacity-60 cursor-not-allowed bg-white/10'
                      : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer',
                  ].join(' ')}
                  aria-disabled={uploadingLogo || !canBranding || !token || undefined}
                  title={!token ? 'Login required' : undefined}
                >
                  {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
                </label>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="space-y-2">
            <Label>Registrar Signature</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded bg-[#e7edf4] dark:bg-[#172534] ring-1 ring-[#cedbe8] dark:ring-darkCard overflow-hidden flex items-center justify-center">
                {form.signature_url ? (
                  <img
                    src={form.signature_url}
                    alt="Registrar Signature"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-[#49739c] dark:text-white/60 px-1 text-center">
                    No signature
                  </span>
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="input w-full"
                  value={form.signature_url || ''}
                  onChange={(e) => setForm({ ...form, signature_url: e.target.value })}
                  placeholder="https://..."
                  disabled={!canBranding}
                />

                {/* File input (visually hidden) */}
                <input
                  id={sigInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handlePick(e, 'signature_url')}
                />
                {/* Label styled as button */}
                <label
                  htmlFor={sigInputId}
                  className={[
                    'btn w-full sm:w-auto text-center',
                    uploadingSignature || !canBranding || !token
                      ? 'opacity-60 cursor-not-allowed bg-white/10'
                      : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer',
                  ].join(' ')}
                  aria-disabled={uploadingSignature || !canBranding || !token || undefined}
                  title={!token ? 'Login required' : undefined}
                >
                  {uploadingSignature ? 'Uploading…' : 'Upload Signature'}
                </label>
              </div>
            </div>
          </div>

          {/* Course Instructor Signature */}
          <div className="space-y-2">
            <Label>Course Instructor Signature</Label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded bg-[#e7edf4] dark:bg-[#172534] ring-1 ring-[#cedbe8] dark:ring-darkCard overflow-hidden flex items-center justify-center">
                {form.instructor_signature_url ? (
                  <img
                    src={form.instructor_signature_url}
                    alt="Course Instructor Signature"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] text-[#49739c] dark:text-white/60 px-1 text-center">
                    No signature
                  </span>
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  className="input w-full"
                  value={form.instructor_signature_url || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      instructor_signature_url: e.target.value,
                    })
                  }
                  placeholder="https://..."
                  disabled={!canBranding}
                />

                {/* File input (visually hidden) */}
                <input
                  id={instructorSigInputId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => handlePick(e, 'instructor_signature_url')}
                />
                {/* Label styled as button */}
                <label
                  htmlFor={instructorSigInputId}
                  className={[
                    'btn w-full sm:w-auto text-center',
                    uploadingInstructorSignature || !canBranding || !token
                      ? 'opacity-60 cursor-not-allowed bg-white/10'
                      : 'bg-emerald-600 hover:bg-emerald-500 cursor-pointer',
                  ].join(' ')}
                  aria-disabled={
                    uploadingInstructorSignature || !canBranding || !token || undefined
                  }
                  title={!token ? 'Login required' : undefined}
                >
                  {uploadingInstructorSignature ? 'Uploading…' : 'Upload Signature'}
                </label>
              </div>
            </div>
          </div>

          {/* Institution contact details – universal */}
          <div className="sm:col-span-2 mt-1">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <Label>Institution contact details</Label>
              <span className="text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                Optional – appears on report cards.
              </span>
            </div>

            <div className="grid sm:grid-cols-4 gap-2">
              <div className="sm:col-span-2">
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mb-0.5">
                  Address line 1
                </div>
                <input
                  className="input w-full"
                  value={form.address_line1 || ''}
                  onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                  placeholder="123 Main Street"
                  disabled={!canBranding}
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mb-0.5">
                  Address line 2
                </div>
                <input
                  className="input w-full"
                  value={form.address_line2 || ''}
                  onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                  placeholder="City / State / Country"
                  disabled={!canBranding}
                />
              </div>

              <div>
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mb-0.5">
                  Phone
                </div>
                <input
                  className="input w-full"
                  value={form.phone_number || ''}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  placeholder="+00 123 456 789"
                  disabled={!canBranding}
                />
              </div>

              <div>
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mb-0.5">
                  Contact email
                </div>
                <input
                  type="email"
                  className="input w-full"
                  value={form.contact_email || ''}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="info@school.example"
                  disabled={!canBranding}
                />
              </div>

              <div className="sm:col-span-2">
                <div className="text-[11px] text-[#49739c] dark:text-darkTextSecondary mb-0.5">
                  Website
                </div>
                <input
                  className="input w-full"
                  value={form.website_url || ''}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                  placeholder="https://school.example"
                  disabled={!canBranding}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Label>Default Pass Mark</Label>
              {!canCustomPassTimers && <Pill>Pro+</Pill>}
            </div>
            <input
              type="number"
              min={1}
              max={100}
              className="input mt-1 w-full"
              value={form.default_pass_mark || 70}
              onChange={(e) =>
                setForm({
                  ...form,
                  default_pass_mark: Number(e.target.value) || 70,
                })
              }
              disabled={!canCustomPassTimers}
              title={!canCustomPassTimers ? 'Available on Pro and Enterprise' : ''}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Label>Quiz Time Limit (seconds)</Label>
              {!canCustomPassTimers && <Pill>Pro+</Pill>}
            </div>
            <input
              type="number"
              min={60}
              step={30}
              className="input mt-1 w-full"
              value={form.quiz_time_limit_s || 900}
              onChange={(e) =>
                setForm({
                  ...form,
                  quiz_time_limit_s: Number(e.target.value) || 900,
                })
              }
              disabled={!canCustomPassTimers}
              title={!canCustomPassTimers ? 'Available on Pro and Enterprise' : ''}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="allow_retry"
              type="checkbox"
              checked={!!form.allow_retry}
              onChange={(e) => setForm({ ...form, allow_retry: e.target.checked })}
              disabled={!canCustomPassTimers}
              title={!canCustomPassTimers ? 'Available on Pro and Enterprise' : ''}
            />
            <label
              htmlFor="allow_retry"
              className="text-sm text-[#0d141c] dark:text-darkTextPrimary"
            >
              Allow retry?{' '}
              <span className="text-[#49739c] dark:text-darkTextSecondary">(default off)</span>
            </label>
            {!canCustomPassTimers && <Pill>Pro+</Pill>}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Label>Restrict invites by email domain</Label>
              {!canSSO && <Pill>Enterprise</Pill>}
            </div>
            <input
              className="input mt-1 w-full"
              value={form.email_domain || ''}
              onChange={(e) => setForm({ ...form, email_domain: e.target.value })}
              placeholder="example.edu"
              disabled={!canSSO}
              title={!canSSO ? 'Available on Enterprise' : ''}
            />
            <div className="mt-1 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              Comma-separated. Supports wildcards like <code>*.example.edu</code>. Learners with
              other domains cannot accept invites.
            </div>
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Label>Webhook (on submit / pass)</Label>
              {!canWebhooks && <Pill>Enterprise</Pill>}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                id="webhook_enabled"
                type="checkbox"
                checked={!!form.webhook_enabled}
                onChange={(e) => setForm({ ...form, webhook_enabled: e.target.checked })}
                disabled={!canWebhooks}
                title={!canWebhooks ? 'Available on Enterprise' : ''}
              />
              <label
                htmlFor="webhook_enabled"
                className="text-sm text-[#0d141c] dark:text-darkTextPrimary"
              >
                Enable webhooks
              </label>
            </div>

            <input
              className="input mt-1 w-full"
              value={form.webhook_url || ''}
              onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              placeholder="https://your.system/hooks/elearn"
              disabled={!canWebhooks}
              title={!canWebhooks ? 'Available on Enterprise' : ''}
            />

            {/* Webhook controls */}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="chip"
                disabled={!org?.id || !token}
                title="Show masked info"
                onClick={async () => {
                  if (!org?.id || !token) return;
                  const r = await fetch(`${backendUrl}/api/orgs/${org!.id}/webhooks/secret`, {
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const j = await r.json();
                  if (!j.ok && j.message) return alert(j.message);
                  alert(
                    j.present
                      ? `Secret exists (last4: ${j.last4 || '—'}). Rotated: ${j.rotatedAt || '—'}`
                      : 'No secret yet. Generate one.'
                  );
                }}
              >
                View secret status
              </button>

              <button
                className="chip chip-active"
                disabled={!org?.id || !token}
                title="Generate or rotate the secret (you’ll see it once)"
                onClick={async () => {
                  if (!org?.id || !token) return;
                  if (
                    !confirm('Generate/rotate the secret now? This invalidates the previous one.')
                  ) {
                    return;
                  }
                  const r = await fetch(`${backendUrl}/api/orgs/${org!.id}/webhooks/secret`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const j = await r.json();
                  if (!j.ok) return alert(j.message || 'Failed to generate secret.');
                  window.prompt('Copy your webhook secret now (store in your system):', j.secret);
                }}
              >
                Generate / Rotate secret
              </button>

              <button
                className="chip chip-active"
                disabled={!canWebhooks || !canSendTest || isSending}
                title={
                  !org?.id
                    ? 'No organization loaded'
                    : !token
                      ? 'Not authenticated'
                      : !form.webhook_enabled
                        ? 'Toggle “Enable webhooks” first'
                        : !urlOk
                          ? 'Enter a valid HTTPS Webhook URL'
                          : 'Send a signed test event'
                }
                onClick={async () => {
                  if (!canWebhooks || !canSendTest || isSending) return;
                  setIsSending(true);
                  try {
                    const r = await fetch(`${backendUrl}/api/orgs/${org!.id}/webhooks/test`, {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        overrideUrl: String(form.webhook_url || '').trim(),
                      }),
                    });

                    let j: any = null;
                    if (r.status !== 204) {
                      try {
                        j = await r.json();
                      } catch {}
                    }
                    if (!r.ok || j?.ok === false) {
                      alert(j?.message || `Failed (HTTP ${r.status})`);
                      return;
                    }
                    alert(
                      `Test webhook queued${
                        j?.status ? ` and fired (HTTP ${j.status})` : ''
                      }. Delivery id: ${j?.id || 'n/a'}`
                    );
                  } catch (e: any) {
                    console.error('[UI] queue error', e);
                    alert(`Network error: ${e?.message || e}`);
                  } finally {
                    setIsSending(false);
                  }
                }}
              >
                {isSending ? 'Sending…' : 'Send test webhook'}
              </button>
            </div>

            {canEmailReports && (
              <div className="mt-3 rounded-xl bg-[#e7edf4]/60 dark:bg-white/5 ring-1 ring-[#cedbe8] dark:ring-white/10 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm text-[#0d141c] dark:text-darkTextPrimary">
                      Email reports
                    </div>
                    <div className="text-xs text-[#49739c] dark:text-darkTextSecondary">
                      Send periodic analytics to admins
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button
                      className="btn bg-indigo-600 hover:bg-indigo-500 w-full sm:w-auto"
                      onClick={onSendTestReport}
                    >
                      Send test report
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:justify-end gap-2">
            <button
              onClick={onSaveBranding}
              disabled={!org?.id || !token || !canBranding}
              className="btn bg-indigo-600 hover:bg-indigo-500 w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Save Branding
            </button>
          </div>
        </div>
      )}

      {tab === 'assign' && (
        <div className="space-y-4">
          {!canAssignments && (
            <div className="text-sm text-amber-700 dark:text-amber-300">
              Assignments are not available on your plan. Upgrade to enable.
            </div>
          )}

          {/* Scope hint shared by both flows */}
          {(assignClassLabel || assignSubjectKey) && (
            <div className="rounded-xl bg-[#e7edf4]/60 dark:bg-white/5 px-3 py-2 text-[11px] text-[#49739c] dark:text-darkTextSecondary">
              This work is currently scoped to {assignClassLabel && <b>{assignClassLabel}</b>}
              {assignClassLabel && assignSubjectKey && ' · '}
              {assignSubjectKey && <b>{assignSubjectKey}</b>}. Learners in this class/subject will
              see it in their Assignments tab.
            </div>
          )}

          {/* ─────────────────────────────────────────────────────
              Classic / file-based assignment card
             ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-slate-50/80 dark:bg-[#111b28] p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wide uppercase text-[#49739c] dark:text-darkTextSecondary">
                  Classic assignment
                </div>
                <div className="text-sm sm:text-base font-semibold">
                  Attach a worksheet or project brief
                </div>
                <div className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                  Perfect for essays, worksheets, experiments and offline tasks. Learners download
                  your file, complete the work, then submit their own file or typed answer.
                </div>
              </div>
            </div>

            {/* Class + subject */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Class / Grade</Label>
                <input
                  className="input mt-1 w-full"
                  value={assignClassLabel || ''}
                  onChange={(e) => setAssignScope?.({ classLabel: e.target.value || '' })}
                  placeholder="e.g. Grade 7 Blue"
                  disabled={!canAssignments}
                />
              </div>
              <div>
                <Label>Subject</Label>
                <input
                  className="input mt-1 w-full"
                  value={assignSubjectKey || ''}
                  onChange={(e) => setAssignScope?.({ subjectKey: e.target.value || '' })}
                  placeholder="e.g. Mathematics, English, Physics"
                  disabled={!canAssignments}
                />
              </div>
            </div>

            {/* Title + instructions */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Assignment title</Label>
                <input
                  className="input mt-1 w-full"
                  value={legacyTitle}
                  onChange={(e) => setLegacyTitle(e.target.value)}
                  placeholder="Term 2 Algebra worksheet"
                  disabled={!canAssignments}
                />
              </div>
              <div>
                <Label>Deadline (optional)</Label>
                <input
                  type="datetime-local"
                  className="input mt-1 w-full"
                  value={legacyDueAt}
                  onChange={(e) => setLegacyDueAt(e.target.value)}
                  disabled={!canAssignments}
                />
                <div className="mt-1 text-[10px] text-[#49739c] dark:text-darkTextSecondary">
                  Learners will still see the assignment after the deadline, but you can treat late
                  submissions differently.
                </div>
              </div>
            </div>

            <div>
              <Label>Instructions</Label>
              <textarea
                rows={4}
                className="input mt-1 w-full min-h-[96px] resize-y"
                value={legacyInstructions}
                onChange={(e) => setLegacyInstructions(e.target.value)}
                placeholder="Explain what learners should do, how to name their files, and how you will grade them…"
                disabled={!canAssignments}
              />
            </div>

            {/* Attachment upload */}
            <div className="space-y-2">
              <Label>Attach assignment file (PDF, DOC, slides…)</Label>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={async (e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) return;
                    await onUploadLegacyAttachment(file);
                    try {
                      e.target.value = '';
                    } catch {}
                  }}
                  className="block w-full text-[11px] sm:text-xs text-slate-600 dark:text-slate-300
                    file:mr-3 file:py-1.5 file:px-3 file:rounded-xl
                    file:border-0 file:text-xs file:font-semibold
                    file:bg-slate-900/90 file:text-white
                    hover:file:bg-slate-900
                    dark:file:bg-slate-200 dark:file:text-slate-900 dark:hover:file:bg-white/90"
                  disabled={!canAssignments || legacyUploadingAttachment}
                />

                {legacyAttachmentUrl && (
                  <a
                    href={legacyAttachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center px-3 py-1.5 rounded-xl text-[11px] sm:text-xs bg-white text-[#0d141c] ring-1 ring-[#d1e2f4] hover:bg-[#e7edf4] dark:bg-[#0b1420] dark:text-white dark:ring-white/15 dark:hover:bg.white/5"
                  >
                    View attached file
                  </a>
                )}
              </div>

              {legacyUploadingAttachment && (
                <div className="text-[11px] text-slate-500 dark:text-white/60">
                  Uploading attachment…
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onCreateLegacyAssignment}
                disabled={!canAssignments || creatingLegacyAssignment}
                className={`btn w-full sm:w-auto ${
                  canAssignments
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-white/10 cursor-not-allowed'
                }`}
              >
                {creatingLegacyAssignment ? 'Sharing…' : 'Share with class'}
              </button>
            </div>
          </section>

          {/* ─────────────────────────────────────────────────────
              Teach with AI / Robot Tutor assignment card
             ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-wide uppercase text-[#49739c] dark:text-darkTextSecondary">
                  Teach with AI
                </div>
                <div className="text-sm sm:text-base font-semibold">
                  Link a Robot Tutor course as an assignment
                </div>
                <div className="text-[11px] sm:text-xs text-slate-600 dark:text-white/70">
                  Choose one of your AI-generated courses, set optional pass marks and timers, then
                  share the invite link with specific groups.
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Course ID</Label>
                <input
                  className="input mt-1 w-full"
                  value={courseId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCourseId(next);
                    setCourseIdAndUrl?.(next);
                  }}
                  placeholder="course uuid"
                  disabled={!canAssignments}
                />
              </div>
              <div>
                <Label>Title Override (optional)</Label>
                <input
                  className="input mt-1 w-full"
                  value={titleOverride}
                  onChange={(e) => setTitleOverride(e.target.value)}
                  placeholder="Intro to Cybersecurity — Cohort A"
                  disabled={!canAssignments}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Pass Mark (optional)</Label>
                  {!canCustomPassTimers && <Pill>Pro+</Pill>}
                </div>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input mt-1 w-full"
                  value={passMark}
                  onChange={(e) => setPassMark(e.target.value ? Number(e.target.value) : '')}
                  disabled={!canAssignments || !canCustomPassTimers}
                  title={!canCustomPassTimers ? 'Available on Pro and Enterprise' : ''}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>Timer seconds (optional)</Label>
                  {!canCustomPassTimers && <Pill>Pro+</Pill>}
                </div>
                <input
                  type="number"
                  min={60}
                  step={30}
                  className="input mt-1 w-full"
                  value={timer}
                  onChange={(e) => setTimer(e.target.value ? Number(e.target.value) : '')}
                  disabled={!canAssignments || !canCustomPassTimers}
                  title={!canCustomPassTimers ? 'Available on Pro and Enterprise' : ''}
                />
              </div>
              <div>
                <Label>Due at (optional, ISO)</Label>
                <input
                  className="input mt-1 w-full"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  placeholder="2025-09-30T23:59:59Z"
                  disabled={!canAssignments}
                />
              </div>
            </div>

            {/* Courses list */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Your courses (click to use)</Label>
                <div className="mt-1 rounded-xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-slate-50/80 dark:bg-[#111b28] max-h-64 overflow-y-auto">
                  {coursesLoading && (
                    <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-white/65">
                      Loading courses…
                    </div>
                  )}
                  {coursesError && (
                    <div className="px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                      Failed to load courses.
                    </div>
                  )}
                  {!coursesLoading && !coursesError && (!courses || courses.length === 0) && (
                    <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-white/65">
                      No courses found. Create a course with Robot Tutor first, then link it here.
                    </div>
                  )}
                  {courses && courses.length > 0 && (
                    <ul className="divide-y divide-[#e7edf4] dark:divide-white/10">
                      {courses.map((c: any) => {
                        const id = String(c.id ?? c.uuid ?? c.course_uuid ?? c.courseId ?? '');
                        const isActive = id && id === courseId;
                        return (
                          <li key={id || c.title}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!id) return;
                                setCourseId(id);
                                setCourseIdAndUrl?.(id);
                              }}
                              className={[
                                'w-full flex items-start justify-between gap-2 px-3 py-2 text-left text-xs sm:text-sm',
                                isActive
                                  ? 'bg-[#dbeafe] dark:bg-sky-500/15 text-sky-800 dark:text-sky-100'
                                  : 'hover:bg-[#e7edf4] dark:hover:bg-white/5 text-slate-800 dark:text-white',
                              ].join(' ')}
                              disabled={!canAssignments}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">
                                  {c.title || 'Untitled course'}
                                </div>
                                {c.subject && (
                                  <div className="text-[11px] text-slate-500 dark:text-white/60 truncate">
                                    {c.subject}
                                  </div>
                                )}
                              </div>
                              {isActive && (
                                <span className="text-[11px] font-medium text-sky-700 dark:text-sky-200">
                                  Selected
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={onCreateAssignment}
                className={`btn ${
                  canAssignments
                    ? 'bg-indigo-600 hover:bg-indigo-500'
                    : 'bg-white/10 cursor-not-allowed'
                } w-full sm:w-auto`}
                disabled={!canAssignments}
              >
                Create AI assignment
              </button>

              {inviteLink && (
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="chip chip-active"
                    title="Copy invite link to clipboard"
                  >
                    Copy invite link
                  </button>

                  {bccChunks.length > 0 ? (
                    bccChunks.map((chunk, idx) => {
                      const subject = encodeURIComponent('Course invite');
                      const body = encodeURIComponent(inviteLink);
                      const bcc = encodeURIComponent(chunk.join(','));
                      const href = `mailto:?subject=${subject}&bcc=${bcc}&body=${body}`;
                      return (
                        <a
                          key={idx}
                          href={href}
                          className="chip"
                          title="Email invite link to instructors"
                        >
                          Email instructors {bccChunks.length > 1 ? `(${idx + 1})` : ''}
                        </a>
                      );
                    })
                  ) : instructorEmails.length > 0 ? (
                    <a
                      href={`mailto:?subject=${encodeURIComponent(
                        'Course invite'
                      )}&bcc=${encodeURIComponent(
                        instructorEmails.join(',')
                      )}&body=${encodeURIComponent(inviteLink)}`}
                      className="chip"
                      title="Email invite link to instructors"
                    >
                      Email instructors
                    </a>
                  ) : null}

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(inviteLink)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="chip"
                    title="Share via WhatsApp"
                  >
                    Share on WhatsApp
                  </a>
                </div>
              )}
            </div>

            <p className="text-xs text-[#49739c] dark:text-darkTextSecondary">
              Share the AI invite link for timed quizzes and auto-marking. For open-ended projects
              or long-form work, use the classic assignment card above so learners can upload their
              files directly.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}

/** ─────────────────────────────────────────────────────────
 * ANALYTICS pane
 * ───────────────────────────────────────────────────────── */

type AnalyticsPaneProps = {
  period: Period;
  setPeriod: (p: Period) => void;
  canMultiPeriodAnalytics: boolean;
  canEmailReports: boolean;
  canCSV: boolean;
  loadingAnalytics: boolean;
  analytics: OrgAnalyticsRow[];
  summary?: {
    totalAttempts: number;
    totalPasses: number;
    overallPassRate: number;
    overallAvgScore: number;

    examsAttempts: number;
    examsPasses: number;
    examsPassRate: number;

    robotQuizAttempts: number;
    robotQuizPasses: number;
    robotQuizPassRate: number;

    assignmentAttempts: number;
    assignmentPasses: number;
    assignmentPassRate: number;

    examCardsGenerated?: number;
  } | null;
  onRefresh: () => void;
  onExportCSV: () => void;
  onSendReportRow: (bucketISO: string, p: Period) => Promise<void> | void;
  canMonthly: boolean;
};

export function AnalyticsPane({
  period,
  setPeriod,
  canMultiPeriodAnalytics,
  canEmailReports,
  canCSV,
  loadingAnalytics,
  analytics,
  summary,
  onRefresh,
  onExportCSV,
  onSendReportRow,
  canMonthly,
}: AnalyticsPaneProps) {
  const hasData = (analytics?.length ?? 0) > 0;

  const effectiveSummary = React.useMemo(() => {
    if (summary) return summary;

    // Lightweight fallback: treat everything as "Robot Teacher quizzes"
    const rows = (analytics || []) as any[];
    let totalAttempts = 0;
    let totalPasses = 0;
    let scoreWeightedSum = 0;
    let scoreWeight = 0;

    for (const r of rows) {
      const attempts = Number(r.attempts ?? 0);
      const passes = Number(r.passes ?? 0);
      const avg = Number(r.avg_score ?? (r as any).avgScore ?? 0);
      totalAttempts += attempts;
      totalPasses += passes;
      if (attempts > 0 && Number.isFinite(avg)) {
        scoreWeightedSum += avg * attempts;
        scoreWeight += attempts;
      }
    }

    const overallPassRate = totalAttempts > 0 ? Math.round((totalPasses * 100) / totalAttempts) : 0;
    const overallAvgScore = scoreWeight > 0 ? +(scoreWeightedSum / scoreWeight).toFixed(1) : 0;

    return {
      totalAttempts,
      totalPasses,
      overallPassRate,
      overallAvgScore,
      examsAttempts: 0,
      examsPasses: 0,
      examsPassRate: 0,
      robotQuizAttempts: totalAttempts,
      robotQuizPasses: totalPasses,
      robotQuizPassRate: overallPassRate,
      assignmentAttempts: 0,
      assignmentPasses: 0,
      assignmentPassRate: 0,
      examCardsGenerated: undefined,
    };
  }, [summary, analytics]);

  const periodLabel =
    period === 'month' ? 'Last 30 days' : period === 'term' ? 'This term' : 'This year';

  const periodOptions: Period[] = ['month', 'term', 'year'];

  // For a mini "sparkline" bar – we’ll just use widths
  const maxAttemptsInBucket = Math.max(
    0,
    ...analytics.map((r) => Number((r as any).attempts ?? 0))
  );

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const cardBase =
    'rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white/95 dark:bg-[#0f1821] p-3 sm:p-4 flex flex-col justify-between';

  const pillMuted =
    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-slate-50 text-slate-700 ring-1 ring-slate-200 dark:bg-white/5 dark:text-white/80 dark:ring-white/10';

  return (
    <section className="mt-4 space-y-4">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">Learning analytics</h2>
          <p className="text-[11px] sm:text-xs text-slate-600 dark:text-darkTextSecondary">
            One view that blends <b>Robot Teacher quizzes</b>, <b>exam results</b> and{' '}
            <b>assignment grading</b> for your institution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="inline-flex rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 text-xs sm:text-sm bg-white dark:bg-[#0b1420]">
            {periodOptions.map((p) => {
              const disabled = p !== 'month' && (!canMultiPeriodAnalytics || !canMonthly);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => !disabled && setPeriod(p)}
                  className={[
                    'px-2.5 sm:px-3 py-1.5',
                    period === p
                      ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white'
                      : 'bg-transparent hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-white/70',
                    disabled ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' ')}
                  title={
                    disabled
                      ? 'Available on higher plans'
                      : p === 'month'
                        ? 'Monthly view'
                        : p === 'term'
                          ? 'Term view'
                          : 'Year view'
                  }
                >
                  {p === 'month' ? 'Month' : p === 'term' ? 'Term' : 'Year'}
                </button>
              );
            })}
          </div>

          <button onClick={onRefresh} className="chip" type="button" disabled={loadingAnalytics}>
            {loadingAnalytics ? 'Refreshing…' : 'Refresh'}
          </button>

          {canCSV && hasData && (
            <button onClick={onExportCSV} className="chip" type="button">
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Summary cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Exams card */}
        <div className={cardBase}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500 dark:text-darkTextSecondary">Term exams</div>
              <div className="mt-1 text-xl font-semibold">
                {effectiveSummary.examsAttempts || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-darkTextSecondary">
                graded exam results in {periodLabel.toLowerCase()}
              </div>
            </div>
            <span className={pillMuted}>Exams</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 dark:text-darkTextSecondary">
            <span>
              Pass rate:{' '}
              <b>{effectiveSummary.examsAttempts ? `${effectiveSummary.examsPassRate}%` : '—'}</b>
            </span>
            {typeof effectiveSummary.examCardsGenerated === 'number' &&
              effectiveSummary.examCardsGenerated > 0 && (
                <span>
                  Cards: <b>{effectiveSummary.examCardsGenerated}</b>
                </span>
              )}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Use the{' '}
            <Link
              to="/org/exams"
              className="underline underline-offset-2 hover:text-sky-700 dark:hover:text-sky-300"
            >
              exam results portal
            </Link>{' '}
            for deeper subject / term breakdowns.
          </div>
        </div>

        {/* Robot Teacher quizzes */}
        <div className={cardBase}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500 dark:text-darkTextSecondary">
                Robot Teacher quizzes
              </div>
              <div className="mt-1 text-xl font-semibold">
                {effectiveSummary.robotQuizAttempts || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-darkTextSecondary">
                auto-graded quiz attempts in {periodLabel.toLowerCase()}
              </div>
            </div>
            <span className={pillMuted}>AI</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 dark:text-darkTextSecondary">
            <span>
              Pass rate: <b>{effectiveSummary.robotQuizPassRate || 0}%</b>
            </span>
            <span>
              Avg score: <b>{effectiveSummary.overallAvgScore || 0}%</b>
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Built from any course a teacher or learner runs through{' '}
            <span className="font-semibold">Robot Teacher</span>.
          </div>
        </div>

        {/* Assignments */}
        <div className={cardBase}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500 dark:text-darkTextSecondary">
                Instructor grading
              </div>
              <div className="mt-1 text-xl font-semibold">
                {effectiveSummary.assignmentAttempts || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-darkTextSecondary">
                graded assignments in {periodLabel.toLowerCase()}
              </div>
            </div>
            <span className={pillMuted}>Assignments</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 dark:text-darkTextSecondary">
            <span>
              Pass rate: <b>{effectiveSummary.assignmentPassRate || 0}%</b>
            </span>
            <span>
              Overall graded: <b>{effectiveSummary.totalAttempts}</b>
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Includes AI-powered and legacy assignments targeted to specific classes and subjects.
          </div>
        </div>
      </div>

      {/* Trend table + mini bars */}
      <div className="rounded-2xl ring-1 ring-[#e7edf4] dark:ring-white/10 bg-white dark:bg-[#0f1821] p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="text-sm sm:text-base font-semibold">Attempts over time</h3>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-darkTextSecondary">
              Each row is a time bucket in this period. Use it to spot spikes in activity (exams
              week, revision week, etc.).
            </p>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Overall pass rate: <b>{effectiveSummary.overallPassRate || 0}%</b>
          </div>
        </div>

        {!hasData && !loadingAnalytics && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-4 text-[11px] sm:text-xs text-slate-500 dark:text-darkTextSecondary">
            No graded activity yet for this period. Once learners start taking quizzes, exams or
            assignments inside DayBreak, you’ll see a trend here.
          </div>
        )}

        {hasData && (
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-xs sm:text-sm">
              <thead className="text-left text-slate-600 dark:text-white/70">
                <tr>
                  <th className="py-2 pr-3">Bucket</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Passes</th>
                  <th className="py-2 pr-3">Avg score</th>
                  <th className="py-2 pr-3">Activity</th>
                  {canEmailReports && <th className="py-2 pr-3 text-right">Email snapshot</th>}
                </tr>
              </thead>
              <tbody>
                {analytics.map((r) => {
                  const key = String((r as any).bucket ?? (r as any).id ?? Math.random());
                  const attempts = Number((r as any).attempts ?? 0);
                  const passes = Number((r as any).passes ?? 0);
                  const avg = Number((r as any).avg_score ?? (r as any).avgScore ?? 0);
                  const bucketISO = String((r as any).bucket ?? (r as any).bucket_iso ?? '');
                  const barWidth =
                    maxAttemptsInBucket > 0
                      ? Math.max(4, Math.round((attempts / maxAttemptsInBucket) * 100))
                      : 0;

                  // Optional per-bucket hints
                  const exams = Number((r as any).exams_attempts ?? (r as any).exam_attempts ?? 0);
                  const robots = Number((r as any).robot_attempts ?? (r as any).quiz_attempts ?? 0);
                  const assigns = Number((r as any).assignment_attempts ?? 0);

                  return (
                    <tr
                      key={key}
                      className="border-t border-[#e7edf4] dark:border-white/10 align-top"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {bucketISO ? formatDate(bucketISO) : '—'}
                      </td>
                      <td className="py-2 pr-3">{attempts}</td>
                      <td className="py-2 pr-3">{passes}</td>
                      <td className="py-2 pr-3">
                        {Number.isFinite(avg) ? `${Math.round(avg)}%` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-1">
                          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 dark:from-emerald-500 dark:via-sky-500 dark:to-indigo-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="flex flex-wrap gap-1 text-[10px] text-slate-500 dark:text-darkTextSecondary">
                            {exams > 0 && <span className={pillMuted}>Exams: {exams}</span>}
                            {robots > 0 && <span className={pillMuted}>AI quizzes: {robots}</span>}
                            {assigns > 0 && (
                              <span className={pillMuted}>Assignments: {assigns}</span>
                            )}
                            {!exams && !robots && !assigns && attempts > 0 && (
                              <span className={pillMuted}>Mixed activity</span>
                            )}
                          </div>
                        </div>
                      </td>
                      {canEmailReports && (
                        <td className="py-2 pr-3 text-right">
                          <button
                            type="button"
                            onClick={() => bucketISO && onSendReportRow(bucketISO, period)}
                            className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] hover:bg-slate-800 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                          >
                            Send email
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {loadingAnalytics && (
          <div className="mt-3 text-[11px] text-slate-500 dark:text-darkTextSecondary">
            Loading analytics…
          </div>
        )}
      </div>
    </section>
  );
}
