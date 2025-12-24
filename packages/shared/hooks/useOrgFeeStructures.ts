// packages/shared/hooks/useOrgFeeStructures.ts
import { useCallback, useState } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';
import type { FeeStructure } from '@mytutorapp/shared/types';
import {
  activateFeeStructure,
  createFeeStructure,
  getFeeStructurePdf,
  listFeeStructures,
  updateFeeStructure,
} from '@mytutorapp/shared/api/orgFeesApi';

interface UseOrgFeeStructuresProps {
  backendUrl?: string;
  token?: string | null;
  orgId?: string | null;
}

const sameId = (a: any, b: any) => String(a ?? '') === String(b ?? '');

export function useOrgFeeStructures(opts?: UseOrgFeeStructuresProps) {
  const { backendUrl: ctxBackendUrl, token: ctxToken, orgId: ctxOrgId } = useShopContext() as any;

  const backendUrl = opts?.backendUrl ?? ctxBackendUrl;
  const token = opts?.token ?? ctxToken;
  const orgId = opts?.orgId ?? ctxOrgId;

  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const ensure = () => Boolean(backendUrl && token && orgId);

  const fetchStructures = useCallback(async () => {
    if (!ensure()) return;
    setLoading(true);
    try {
      const items = await listFeeStructures(backendUrl, token as string, orgId as string);
      setStructures(Array.isArray(items) ? (items as any) : []);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, orgId]);

  const saveStructure = useCallback(
    async (payload: Partial<FeeStructure>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const created = await createFeeStructure(backendUrl, token as string, orgId as string, payload);
        setStructures((prev) => [created as any, ...prev.filter((s: any) => !sameId(s.id, (created as any).id))]);
        return created as any;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const editStructure = useCallback(
    async (structureId: number, payload: Partial<FeeStructure>) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const updated = await updateFeeStructure(backendUrl, token as string, orgId as string, structureId, payload);
        setStructures((prev) => prev.map((s: any) => (sameId(s.id, structureId) ? (updated as any) : s)));
        return updated as any;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const activateStructure = useCallback(
    async (structureId: number) => {
      if (!ensure()) return null;
      setSaving(true);
      try {
        const activated = await activateFeeStructure(backendUrl, token as string, orgId as string, structureId);
        setStructures((prev) =>
          (prev || []).map((s: any) => ({ ...s, is_active: sameId(s.id, (activated as any).id) })),
        );
        return activated as any;
      } finally {
        setSaving(false);
      }
    },
    [backendUrl, token, orgId],
  );

  const downloadStructurePdf = useCallback(
    async (structureId: number, fileName = 'fee-structure.pdf') => {
      if (!ensure()) return null;

      const params = new URLSearchParams();
      if (token) params.set('token', token as string);
      const url = `${backendUrl}/api/orgs/${orgId}/fees/structures/${structureId}.pdf?${params.toString()}`;

      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        try {
          const blob = await getFeeStructurePdf(backendUrl, token as string, orgId as string, structureId);
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
          console.error('[useOrgFeeStructures] download failed', e);
        }
      }

      return url;
    },
    [backendUrl, token, orgId],
  );

  return {
    backendUrl,
    orgId,
    structures,
    loading,
    saving,
    fetchStructures,
    saveStructure,
    editStructure,
    activateStructure,
    downloadStructurePdf,
  };
}
