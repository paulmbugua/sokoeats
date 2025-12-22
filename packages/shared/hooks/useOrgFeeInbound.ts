import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import {
  attachFeeInboundToLearner,
  listFeeInbound,
  type FeeInboundRow,
} from '@mytutorapp/shared/api/orgFeesApi';

interface UseOrgFeeInboundProps {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

export function useOrgFeeInbound(opts?: UseOrgFeeInboundProps) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [rows, setRows] = useState<FeeInboundRow[]>([]);
  const [loading, setLoading] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchUnmatched = useCallback(async () => {
    if (!ensure()) return;
    setLoading(true);
    try {
      const data = await listFeeInbound(backendUrl, token as string, orgId as string, {
        status: 'unmatched',
      });
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, orgId]);

  const attachToLearner = useCallback(
    async (inboundId: string | number, learnerId: string) => {
      if (!ensure()) return;
      return attachFeeInboundToLearner(
        backendUrl,
        token as string,
        orgId as string,
        inboundId,
        { learner_id: learnerId },
      );
    },
    [backendUrl, token, orgId],
  );

  return { rows, loading, fetchUnmatched, attachToLearner };
}
