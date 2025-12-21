// apps/web/src/pages/org/OrgAnnouncements.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAnnouncements } from '@mytutorapp/shared/hooks/useOrgAnnouncements';

const OrgAnnouncementsPage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();
  const { announcements, loading, saving, fetchAnnouncements, saveAnnouncement, downloadAgmPdf } = useOrgAnnouncements();

  const [form, setForm] = useState({ title: '', body: '', is_pinned: false, visible_from: '', visible_to: '', kind: 'general' });

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const canPost = useMemo(() => Boolean(form.title && form.body), [form.title, form.body]);

  const handleSave = async () => {
    if (!canPost) return;
    await saveAnnouncement({
      title: form.title,
      body: form.body,
      is_pinned: form.is_pinned,
      visible_from: form.visible_from || undefined,
      visible_to: form.visible_to || undefined,
      kind: form.kind as any,
    });
    setForm({ title: '', body: '', is_pinned: false, visible_from: '', visible_to: '', kind: 'general' });
  };

  const downloadAgm = async (id: number) => {
    await downloadAgmPdf(id, `announcement-${id}-agm.pdf`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Announcements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Share pinned updates with learners and instructors with optional start/end windows.
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
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Weekly update"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Visible from</span>
              <input
                value={form.visible_from}
                onChange={(e) => setForm((p) => ({ ...p, visible_from: e.target.value }))}
                placeholder="2025-02-14"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200 md:col-span-2">
              <span className="mb-1 text-xs uppercase tracking-wide">Body</span>
              <textarea
                value={form.body}
                onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                placeholder="Share key dates and reminders"
                className="h-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Visible to</span>
              <input
                value={form.visible_to}
                onChange={(e) => setForm((p) => ({ ...p, visible_to: e.target.value }))}
                placeholder="2025-02-20"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_pinned}
                onChange={(e) => setForm((p) => ({ ...p, is_pinned: e.target.checked }))}
              />
              <span>Pin announcement</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.kind === 'agm'}
                onChange={(e) => setForm((p) => ({ ...p, kind: e.target.checked ? 'agm' : 'general' }))}
              />
              <span>AGM notice</span>
            </label>
          </div>
          <div className="flex gap-3">
            <button
              disabled={!canPost || saving}
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Posting…' : 'Publish'}
            </button>
            <button
              onClick={() => fetchAnnouncements()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Refresh feed
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? <p className="py-3 text-sm text-slate-500">Loading feed…</p> : null}
            {!loading && !announcements.length ? (
              <p className="py-3 text-sm text-slate-500">No announcements yet.</p>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {a.is_pinned ? 'Pinned • ' : ''}
                        {a.visible_from || 'Live'}
                      </div>
                    </div>
                    {a.kind === 'agm' ? (
                      <button
                        onClick={() => downloadAgm(a.id)}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Download AGM PDF
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{a.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAnnouncementsPage;
