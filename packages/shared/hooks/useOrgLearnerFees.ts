import { useCallback, useState } from 'react';
import {
  apiGetMyFeeStructure,
  apiGetMyFeeStatement,
  apiDownloadMyFeeStructurePdf,
  apiDownloadMyFeeStatementPdf,
} from '../api/orgLearnerFeesApi';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function viewBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function useOrgLearnerFees(opts: { backendUrl?: string; token?: string; orgId?: string }) {
  const { backendUrl, token, orgId } = opts;
  const [loading, setLoading] = useState(false);
  const [structure, setStructure] = useState<any>(null);
  const [statement, setStatement] = useState<any>(null);
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!backendUrl || !token || !orgId) return;
    setLoading(true);
    setError('');
    try {
      const s = await apiGetMyFeeStructure(backendUrl, token, orgId);
      setStructure(s);
      const st = await apiGetMyFeeStatement(backendUrl, token, orgId);
      setStatement(st);
    } catch (e: any) {
      setError(e?.message || 'Failed to load fee data');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token, orgId]);

  const viewStructurePdf = useCallback(async () => {
    if (!backendUrl || !token || !orgId) return;
    const blob = await apiDownloadMyFeeStructurePdf(backendUrl, token, orgId);
    viewBlob(blob);
  }, [backendUrl, token, orgId]);

  const downloadStructurePdf = useCallback(async (filename = 'fee-structure.pdf') => {
    if (!backendUrl || !token || !orgId) return;
    const blob = await apiDownloadMyFeeStructurePdf(backendUrl, token, orgId);
    downloadBlob(blob, filename);
  }, [backendUrl, token, orgId]);

  const viewStatementPdf = useCallback(async () => {
    if (!backendUrl || !token || !orgId) return;
    const blob = await apiDownloadMyFeeStatementPdf(backendUrl, token, orgId);
    viewBlob(blob);
  }, [backendUrl, token, orgId]);

  const downloadStatementPdf = useCallback(async (filename = 'fee-statement.pdf') => {
    if (!backendUrl || !token || !orgId) return;
    const blob = await apiDownloadMyFeeStatementPdf(backendUrl, token, orgId);
    downloadBlob(blob, filename);
  }, [backendUrl, token, orgId]);

  return {
    loading,
    error,
    structure,
    statement,
    refresh,
    viewStructurePdf,
    downloadStructurePdf,
    viewStatementPdf,
    downloadStatementPdf,
  };
}
