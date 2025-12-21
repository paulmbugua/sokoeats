import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { OrgMessageLog } from '@mytutorapp/shared/types';
import { listMessageLogs, sendMessageNow } from '@mytutorapp/shared/api/orgEngagementApi';

interface UseOrgMessageLogOptions {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgMessageLog(opts?: UseOrgMessageLogOptions) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;
  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [logs, setLogs] = useState<OrgMessageLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchLogs = useCallback(
    async (params?: Record<string, unknown>) => {
      if (!ensure()) return [] as OrgMessageLog[];
      setLoading(true);
      try {
        const res = await listMessageLogs(backendUrl, token as string, orgId as string, params);
        setLogs(res || []);
        return res;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const sendNow = useCallback(
    async (payload: { subject?: string; body?: string; template_key?: string; payload?: Record<string, unknown>; recipients: any[] }) => {
      if (!ensure()) return [] as OrgMessageLog[];
      setSaving(true);
      try {
        const res = await sendMessageNow(backendUrl, token as string, orgId as string, payload);
        setLogs((prev) => [...res, ...prev]);
        return res;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  return { backendUrl, orgId, logs, loading, saving, fetchLogs, sendNow };
}
