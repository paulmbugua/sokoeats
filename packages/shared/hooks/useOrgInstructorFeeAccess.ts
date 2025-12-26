// packages/shared/hooks/useOrgInstructorFeeAccess.ts
import { useCallback, useMemo, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  setInstructorFeeAccess,
  type SetInstructorFeeAccessResponse,
} from '@mytutorapp/shared/api/orgInstructorsApi';

interface UseOrgInstructorFeeAccessOptions {
  backendUrl?: string | null;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgInstructorFeeAccess(opts?: UseOrgInstructorFeeAccessOptions) {
  const shop = useShopContext() as any;

  const ctxBackendUrl = shop?.backendUrl;
  const ctxToken = shop?.orgToken ?? shop?.token;
  const ctxOrgId = shop?.orgId;

  const backendUrl = useMemo(() => (opts?.backendUrl ?? ctxBackendUrl ?? '').replace(/\/+$/, ''), [
    opts?.backendUrl,
    ctxBackendUrl,
  ]);
  const token = useMemo(() => opts?.token ?? ctxToken ?? null, [opts?.token, ctxToken]);
  const orgId = useMemo(() => opts?.orgId ?? ctxOrgId ?? null, [opts?.orgId, ctxOrgId]);

  const [saving, setSaving] = useState(false);
  const [designatedInstructorId, setDesignatedInstructorId] = useState<string | number | null>(null);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!backendUrl) m.push('backendUrl');
    if (!token) m.push('token/orgToken');
    if (!orgId) m.push('orgId');
    return m;
  }, [backendUrl, token, orgId]);

  const ready = missing.length === 0;

  const updateFeeAccess = useCallback(
    async (instructorId: string | number, enabled: boolean): Promise<SetInstructorFeeAccessResponse | null> => {
      if (!ready) return null;
      setSaving(true);
      try {
        const res = await setInstructorFeeAccess(
          backendUrl,
          token as string,
          orgId as string,
          instructorId,
          enabled,
        );
        setDesignatedInstructorId(res.designatedInstructorId ?? (enabled ? instructorId : null));
        return res;
      } finally {
        setSaving(false);
      }
    },
    [ready, backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    token,
    ready,
    missing,
    saving,
    designatedInstructorId,
    updateFeeAccess,
  };
}

export default useOrgInstructorFeeAccess;
