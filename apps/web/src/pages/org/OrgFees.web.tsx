// apps/web/src/pages/org/OrgFees.web.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';

const OrgFeesPage: React.FC = () => {
  const { isPro, upgradeCta, org } = useOrgProTools();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-blue-500">Org tools</p>
          <h1 className="text-2xl font-semibold">Fees & balances</h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Create fee charges, record payments, and view learner balances.
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
            Upgrade {org?.name || 'org'}
          </Link>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Create charge</h3>
              <p className="text-xs text-slate-500">Apply a single fee or charge a full class.</p>
              <button className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">New charge</button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <h3 className="text-sm font-semibold">Record payment</h3>
              <p className="text-xs text-slate-500">Track cash, POS, or transfer receipts.</p>
              <button className="mt-3 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white dark:bg-slate-700">
                Add payment
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Balances combine all charges and payments. Print a statement to hand to guardians or export CSV for finance.
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Statement preview</div>
                <p className="text-xs text-slate-500">Printable view for any learner</p>
              </div>
              <button className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">
                Open print view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgFeesPage;
