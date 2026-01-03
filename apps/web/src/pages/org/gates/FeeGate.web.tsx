import React, { ReactNode } from 'react';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrgProTools } from '@mytutorapp/shared/hooks/useOrgProTools';
import { useOrgInstructorFeeAccess } from '@mytutorapp/shared/hooks/useOrgInstructorFeeAccess';

type Props = { children: ReactNode };

export default function FeeGate({ children }: Props) {
  const shop = useShopContext() as any;
  const { org, activeOrgId, loading } = useOrgProTools() as any;

  const feeAccess = useOrgInstructorFeeAccess({
    backendUrl: shop?.backendUrl,
    token: shop?.orgToken ?? shop?.token,
    orgId: org?.id || activeOrgId,
  });

  if (loading || feeAccess.isLoading || !feeAccess.ready) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-darkBg">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-10">
          <div className="bg-white dark:bg-[#0f1724] rounded-2xl shadow p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-48 w-full bg-slate-100 dark:bg-slate-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (feeAccess.isDenied || !feeAccess.hasAccess) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-darkBg flex items-center justify-center px-4">
        <div className="bg-white dark:bg-[#0f1724] rounded-2xl shadow p-8 max-w-xl w-full text-center space-y-3">
          <div className="text-2xl font-bold">Fees locked</div>
          <p className="text-slate-600 dark:text-slate-300">
            Fees are only accessible to the single designated instructor.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
