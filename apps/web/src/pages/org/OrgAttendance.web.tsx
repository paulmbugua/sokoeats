// apps/web/src/pages/org/OrgAttendance.web.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-slate-800 dark:text-slate-200">
    {children}
  </span>
);

const OrgAttendancePage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();

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
            <Link className="text-blue-600 underline" to="/org/profile">
              Manage billing for {org?.name || 'your org'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Use your mobile roster or CSV imports to pre-fill learners. Sessions can be filtered by
            class or period label and exported from the admin report.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Create session</h3>
              <p className="text-xs text-slate-500">Quickly start a new roll call.</p>
              <button className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                New session
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Bulk mark learners</h3>
              <p className="text-xs text-slate-500">Tap a session to mark present/absent/late/excused.</p>
              <button className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-700">
                Open latest session
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Admins can export CSV reports for any date range to share with attendance offices.
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAttendancePage;
