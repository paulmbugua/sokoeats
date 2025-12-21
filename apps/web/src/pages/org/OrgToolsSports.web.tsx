// apps/web/src/pages/org/OrgToolsSports.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgSports } from '@mytutorapp/shared/hooks/useOrgSports';

const OrgToolsSportsPage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();
  const { events, loading, saving, fetchEvents, saveEvent, editEvent } = useOrgSports();

  const [form, setForm] = useState({ title: '', start_at: '', end_at: '', location: '' });

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const canSave = useMemo(() => Boolean(form.title), [form.title]);

  const handleSave = async () => {
    if (!canSave) return;
    await saveEvent({
      title: form.title,
      start_at: form.start_at || undefined,
      end_at: form.end_at || undefined,
      location: form.location || undefined,
    });
    setForm({ title: '', start_at: '', end_at: '', location: '' });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Sports calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">Manage fixtures and practice sessions.</p>
        </div>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
          Pro / Enterprise
        </span>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <div className="text-sm text-blue-700 underline">
            <a href="/org/profile">Upgrade for {org?.name || 'your org'}</a>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Inter-school meet"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Location</span>
              <input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="Main field"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">Start at</span>
              <input
                value={form.start_at}
                onChange={(e) => setForm((p) => ({ ...p, start_at: e.target.value }))}
                placeholder="2025-03-01T09:00:00Z"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col text-sm text-slate-600 dark:text-slate-200">
              <span className="mb-1 text-xs uppercase tracking-wide">End at</span>
              <input
                value={form.end_at}
                onChange={(e) => setForm((p) => ({ ...p, end_at: e.target.value }))}
                placeholder="2025-03-01T11:00:00Z"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <button
              disabled={!canSave || saving}
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Saving…' : 'Save event'}
            </button>
            <button
              onClick={() => fetchEvents()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Refresh list
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? <p className="py-3 text-sm text-slate-500">Loading events…</p> : null}
            {!loading && !events.length ? (
              <p className="py-3 text-sm text-slate-500">No events yet.</p>
            ) : (
              events.map((evt) => (
                <div key={evt.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{evt.title}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {evt.start_at || 'TBC'} {evt.location ? `• ${evt.location}` : ''}
                      </div>
                    </div>
                    {evt.status !== 'completed' ? (
                      <button
                        onClick={() => editEvent(evt.id, { status: 'completed' })}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Mark complete
                      </button>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
                        Completed
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgToolsSportsPage;
