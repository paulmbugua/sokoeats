// apps/web/src/pages/org/OrgAnnouncements.web.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

const OrgAnnouncementsPage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();

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
          <Link className="text-blue-600 underline" to="/org/profile">
            Upgrade billing
          </Link>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Post announcement</div>
                <p className="text-xs text-slate-500">Send to all learners or instructors and optionally pin it.</p>
              </div>
              <button className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white">New announcement</button>
            </div>
          </div>
          <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Feed</div>
                <p className="text-xs text-slate-500">Recent posts appear here with pinning respected.</p>
              </div>
              <button className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                Refresh feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgAnnouncementsPage;
