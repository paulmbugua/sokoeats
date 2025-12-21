// apps/web/src/pages/org/OrgAttendance.web.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgAttendance } from '@mytutorapp/shared/hooks/useOrgAttendance';

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
    {children}
  </span>
);

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="flex flex-col text-sm text-slate-500 dark:text-slate-300">
    <span className="mb-1 text-xs uppercase tracking-wide">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
  </label>
);

const OrgAttendancePage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();
  const { sessions, loading, saving, fetchSessions, saveSession, downloadReportCsv } = useOrgAttendance();

  const [form, setForm] = useState({ session_date: '', class_label: '', period_label: '' });

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const canSave = useMemo(() => Boolean(form.session_date), [form.session_date]);

  const handleSave = async () => {
    if (!canSave) return;
    await saveSession({
      session_date: form.session_date,
      class_label: form.class_label || undefined,
      period_label: form.period_label || undefined,
    });
    setForm({ session_date: '', class_label: '', period_label: '' });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Create sessions by date and mark learners as present, absent, late, or excused.
          </p>
        </div>
        <Badge>Pro / Enterprise</Badge>
      </div>

      {!isPro && upgradeCta ? (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="font-semibold">{upgradeCta.headline}</div>
          <p className="text-sm">{upgradeCta.body}</p>
          <div className="mt-2 text-sm">
            <a className="text-blue-600 underline" href="/org/profile">
              Manage billing for {org?.name || 'your org'}
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-3">
            <Field
              label="Session date"
              value={form.session_date}
              placeholder="2025-02-14"
              onChange={(session_date) => setForm((p) => ({ ...p, session_date }))}
            />
            <Field
              label="Class label"
              value={form.class_label}
              placeholder="Grade 9"
              onChange={(class_label) => setForm((p) => ({ ...p, class_label }))}
            />
            <Field
              label="Period label"
              value={form.period_label}
              placeholder="Morning"
              onChange={(period_label) => setForm((p) => ({ ...p, period_label }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={!canSave || saving}
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {saving ? 'Saving…' : 'Save session'}
            </button>
            <button
              onClick={() => fetchSessions()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Refresh list
            </button>
            <button
              onClick={() => downloadReportCsv()}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? <p className="py-3 text-sm text-slate-500">Loading sessions…</p> : null}
            {!loading && !sessions.length ? (
              <p className="py-3 text-sm text-slate-500">No sessions yet.</p>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{session.session_date}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {(session.class_label || 'General') + (session.period_label ? ` • ${session.period_label}` : '')}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{session.entries?.length || 0} entries</div>
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

export default OrgAttendancePage;
