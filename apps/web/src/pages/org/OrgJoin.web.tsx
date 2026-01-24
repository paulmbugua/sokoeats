// apps/web/src/pages/org/OrgJoin.web.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useShopContext } from '@mytutorapp/shared/context';
import { resolveOrgInvite, acceptOrgInvite } from '@mytutorapp/shared/api/orgApi';

export default function OrgJoinPage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { backendUrl, orgToken } = useShopContext() as any;

  // If not logged in, remember where to come back to and go login
  useEffect(() => {
    if (!orgToken) {
      sessionStorage.setItem('auth:returnTo', loc.pathname + loc.search);
      nav('/org/login', { replace: true });
    }
  }, [orgToken, loc, nav]);

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const info = await resolveOrgInvite(backendUrl, code);
        if (!stop) setInvite(info);
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [backendUrl, code]);

  const onAccept = useCallback(async () => {
    const res = await acceptOrgInvite(backendUrl, orgToken, code);
    const orgId = res.enrollment?.orgId;
    if (orgId) {
      localStorage.setItem('auth:orgId', orgId);
    }

    // optional: clear returnTo saved earlier
    sessionStorage.removeItem('auth:returnTo');
    nav('/org/profile', { replace: true });
  }, [backendUrl, orgToken, code, nav]);

  if (loading) return <div className="p-6">Loading invite…</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Join {invite?.org?.name ?? 'Institution'}</h1>
      <p className="mt-2 text-sm">
        You’ve been invited to access assignments/analytics for this institution.
      </p>
      <button onClick={onAccept} className="mt-4 h-10 px-4 rounded-xl bg-emerald-600 text-white">
        Accept & Continue
      </button>
    </div>
  );
}
