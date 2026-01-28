import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAnnouncements } from '@mytutorapp/shared/hooks/useOrgAnnouncements';
import { Coachmark, useCoachmark } from '../../components/hints/Coachmark';
import { CircleCheckbox } from './OrgFees.ui';
import SeoHead from '../../components/seo/SeoHead';


function toIsoOrNull(v: string) {
  const s = String(v || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function fmtWhen(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}
function statusBadge(a: any) {
  const st =
    a.status ||
    (a.end_at && new Date(a.end_at).getTime() < Date.now()
      ? 'expired'
      : a.start_at && new Date(a.start_at).getTime() > Date.now()
        ? 'scheduled'
        : 'live');
  return st;
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const OrgAnnouncementsPage: React.FC = () => {
  const location = useLocation();
  const { isPro, upgradeCta } = useOrgProTools();

  // NOTE: App.tsx route is "/org/announcements" (no :orgId),
  // so orgIdParam will normally be undefined. Keep it for future-proofing.
  const { orgId: orgIdParam } = useParams();

  const { orgId: ctxOrgId, orgToken: ctxOrgToken, backendUrl: ctxBackendUrl } =
    useShopContext() as any;

  // ✅ useOrg is already used in admin/staff guards; calling it here gives us org.id reliably.
  const orgState = (useOrg?.() ?? {}) as any;
  const orgFromHook = orgState?.org || orgState?.organization || null;

  // ✅ IMPORTANT: org pages usually use orgToken, not user token
  const token = (ctxOrgToken as string) || null;

  // ✅ orgId resolution order:
  // 1) URL param (if you later add /org/:orgId/announcements)
  // 2) shop context orgId
  // 3) useOrg() resolved org id
  const orgId =
    (orgIdParam as string) ||
    (ctxOrgId as string) ||
    (orgFromHook?.id as string) ||
    null;

  const {
    announcements,
    loading,
    saving,
    error,
    notice,
    fetchAnnouncements,
    saveAnnouncement,
    removeAnnouncement,
    downloadAgmPdf,
  } = useOrgAnnouncements({
    orgId,
    token,
    backendUrl: ctxBackendUrl, // optional; hook/api already fall back to env
  });

  // ✅ Debug logs (VERY helpful)
  useEffect(() => {
    // avoid noisy logs in SSR
    if (typeof window === 'undefined') return;

    console.log('[OrgAnnouncementsPage] context snapshot', {
      route_orgIdParam: orgIdParam ?? null,
      ctxOrgId: ctxOrgId ?? null,
      orgFromHook_id: orgFromHook?.id ?? null,
      resolved_orgId: orgId ?? null,
      has_user_token: false,
      has_org_token: Boolean(ctxOrgToken),
      resolved_has_token: Boolean(token),
      backendUrl_ctx: ctxBackendUrl ?? null,
      location: window.location.pathname,
    });
  }, [orgIdParam, ctxOrgId, ctxOrgToken, ctxBackendUrl, orgId, token, orgFromHook?.id]);

  // ✅ only fetch when ready (REMOVE the older unguarded fetch useEffect)
  useEffect(() => {
    if (!orgId || !token) return;
    fetchAnnouncements();
  }, [orgId, token, fetchAnnouncements]);

  const [form, setForm] = useState({
    title: '',
    body: '',
    pinned: false,
    audience: 'all',
    start_at: '',
    end_at: '',
    category: 'general', // 'general' | 'agm'
    meeting_at: '',
    meeting_location: '',
    meeting_url: '',
    agenda_md: '',
    class_label: '',

  });

  const [limitToClass, setLimitToClass] = useState(false);
  const isAgm = form.category === 'agm';
  const canPost = useMemo(
    () => Boolean(form.title.trim() && form.body.trim()),
    [form.title, form.body],
  );

  const autoFillAgm = () => {
    const when = form.meeting_at ? fmtWhen(toIsoOrNull(form.meeting_at)) : 'TBD';
    const where = form.meeting_location?.trim() ? form.meeting_location.trim() : 'TBD';
    const link = form.meeting_url?.trim() ? form.meeting_url.trim() : '';

    const agenda = form.agenda_md?.trim()
      ? form.agenda_md.trim()
      : `- Confirmation of minutes\n- Financial report\n- Elections (if applicable)\n- AOB (Any Other Business)\n- Closing remarks`;

    const title = form.title.trim() || 'Annual General Meeting (AGM) Notice';
    const body = `Dear Parents/Guardians,

This is a formal notice for our Annual General Meeting (AGM).

📅 Date/Time: ${when}
📍 Location: ${where}${link ? `\n🔗 Online link: ${link}` : ''}

Agenda:
${agenda}

Kindly attend on time. If you are unable to attend, please share any questions in advance through the school office.

Thank you.`;

    setForm((p) => ({ ...p, title, body, agenda_md: agenda }));
  };

  const handleSave = async () => {
    if (!canPost) return;

    // Extra visible debug (so you can confirm why ensure() would fail)
    console.log('[OrgAnnouncementsPage] Publish clicked', {
      resolved_orgId: orgId,
      has_token: Boolean(token),
      has_org_token: Boolean(ctxOrgToken),
      has_user_token: false,
    });

   const payload: any = {
  title: form.title.trim(),
  body: form.body.trim(),
  audience: String(form.audience || 'all').trim().toLowerCase(),
  class_label: limitToClass && form.class_label?.trim() ? form.class_label.trim() : null,
  pinned: !!form.pinned,
  start_at: toIsoOrNull(form.start_at),
  end_at: toIsoOrNull(form.end_at),
  category: form.category,
};

    if (isAgm) {
      payload.meeting_at = toIsoOrNull(form.meeting_at);
      payload.meeting_location = form.meeting_location?.trim() || null;
      payload.meeting_url = form.meeting_url?.trim() || null;
      payload.agenda_md = form.agenda_md?.trim() || null;
      payload.metadata = { kind: 'agm' };
    }

    const created = await saveAnnouncement(payload);
    if (created) {
      setForm({
        title: '',
        body: '',
        pinned: false,
        audience: 'all',
        start_at: '',
        end_at: '',
        category: 'general',
        meeting_at: '',
        meeting_location: '',
        meeting_url: '',
        agenda_md: '',
        class_label: '',
      });

      fetchAnnouncements();
    }
  };

  const downloadAgm = async (id: number) => {
    await downloadAgmPdf(id, `announcement-${id}-agm.pdf`);
  };

  const missingCtx = !orgId || !token;
  const announcementHint = useCoachmark('org_announcements_publish_v1', !loading && !missingCtx);

  

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <SeoHead
        title="Announcements | DayBreak"
        description="Create and manage institution announcements."
        canonicalPath={location.pathname}
        noindex
      />
      {/* ✅ Visible context strip (matches your banner but now accurate) */}
      {missingCtx ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-200">
          <div className="font-semibold">Missing org/session context</div>
          <div className="mt-1 opacity-90">
            orgId: {orgId ?? 'null'} • token: {token ? 'present' : 'missing'}
          </div>
          <div className="mt-1 text-xs opacity-80">
            Open DevTools → Console and look for <code>[OrgAnnouncementsPage]</code> logs.
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Announcements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Post updates. Schedule visibility. Pin important messages. AGM notices can export PDF.
          </p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
          Pro / Enterprise
        </span>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <a className="text-blue-600 underline" href="/org/profile">
            Upgrade billing
          </a>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {(error || notice) ? (
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                error
                  ? 'bg-rose-50 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200'
                  : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200',
              )}
            >
              {error || notice}
            </div>
          ) : null}

          {/* Composer */}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Type</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, category: 'general' }))}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm',
                    form.category === 'general'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                  )}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, category: 'agm' }))}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm',
                    form.category === 'agm'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                  )}
                >
                  AGM Notice
                </button>
              </div>
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
              </select>
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
            <span className="mb-1 text-xs uppercase tracking-wide">Target class (optional)</span>
            <input
              value={form.class_label}
              onChange={(e) => setForm((p) => ({ ...p, class_label: e.target.value }))}
              placeholder="e.g. Grade 5"
              disabled={!limitToClass}
              className={cn(
                "rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                !limitToClass && "opacity-60 cursor-not-allowed"
              )}
            />

          </label>


            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 md:col-span-2">
              <span className="mb-1 text-xs uppercase tracking-wide">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder={isAgm ? 'Annual General Meeting (AGM) Notice' : 'Weekly update'}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Visible from</span>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm((p) => ({ ...p, start_at: e.target.value }))}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Visible to</span>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm((p) => ({ ...p, end_at: e.target.value }))}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                <CircleCheckbox
                  checked={!!form.pinned}
                  onChange={(next) => setForm((p) => ({ ...p, pinned: next }))}
                  label="Pin announcement"
                  labelClassName="text-sm"
                />

                <CircleCheckbox
                  checked={!!limitToClass}
                  onChange={(next) => {
                    setLimitToClass(next);
                    if (!next) setForm((p) => ({ ...p, class_label: '' }));
                  }}
                  label="Target a class"
                  labelClassName="text-sm"
                />

                <span className="text-xs text-slate-500 dark:text-slate-400">(optional)</span>
              </div>


            {isAgm ? (
              <>
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Meeting date/time</span>
                  <input
                    type="datetime-local"
                    value={form.meeting_at}
                    onChange={(e) => setForm((p) => ({ ...p, meeting_at: e.target.value }))}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
                  <span className="mb-1 text-xs uppercase tracking-wide">Location</span>
                  <input
                    value={form.meeting_location}
                    onChange={(e) => setForm((p) => ({ ...p, meeting_location: e.target.value }))}
                    placeholder="School hall"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 md:col-span-2">
                  <span className="mb-1 text-xs uppercase tracking-wide">Online link (optional)</span>
                  <input
                    value={form.meeting_url}
                    onChange={(e) => setForm((p) => ({ ...p, meeting_url: e.target.value }))}
                    placeholder="https://…"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 md:col-span-2">
                  <span className="mb-1 text-xs uppercase tracking-wide">Agenda (markdown bullets)</span>
                  <textarea
                    value={form.agenda_md}
                    onChange={(e) => setForm((p) => ({ ...p, agenda_md: e.target.value }))}
                    placeholder="- Confirmation of minutes…"
                    className="h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>

                <div className="md:col-span-2 flex gap-2">
                  <button
                    type="button"
                    onClick={autoFillAgm}
                    className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Auto-build AGM message
                  </button>
                </div>
              </>
            ) : null}

            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 md:col-span-2">
              <span className="mb-1 text-xs uppercase tracking-wide">Body</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Share key dates and reminders"
                className="h-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="flex gap-3 relative">
            <Coachmark
              id="org_announcements_publish_v1"
              title="Notify everyone"
              text="Publish here to send an announcement to learners and instructors."
              visible={announcementHint.visible}
              onDismiss={announcementHint.dismiss}
              placement="top"
            />
            <button
              disabled={!canPost || saving || missingCtx}
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Publishing…' : 'Publish'}
            </button>
            <button
              onClick={() => fetchAnnouncements()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          {/* List */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? <p className="py-3 text-sm text-slate-500">Loading…</p> : null}
            {!loading && !announcements?.length ? (
              <p className="py-3 text-sm text-slate-500">No announcements yet.</p>
            ) : (
              (announcements as any[]).map((a) => {
                const st = statusBadge(a);
                return (
                  <div key={a.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                            {a.title}
                          </div>
                          {a.pinned ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              Pinned
                            </span>
                          ) : null}
                          {String(a.category || '').toLowerCase() === 'agm' ? (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                              AGM
                            </span>
                          ) : null}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {st}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {a.start_at ? `From: ${fmtWhen(a.start_at)}` : 'From: now'} •{' '}
                          {a.end_at ? `To: ${fmtWhen(a.end_at)}` : 'No end'}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {String(a.category || '').toLowerCase() === 'agm' ? (
                          <button
                            onClick={() => downloadAgm(a.id)}
                            className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Download AGM PDF
                          </button>
                        ) : null}
                        <button
                          onClick={() => {
                            if (confirm('Delete this announcement?')) removeAnnouncement(a.id);
                          }}
                          className="rounded-md border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-900/20"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                      {a.body}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAnnouncementsPage;
