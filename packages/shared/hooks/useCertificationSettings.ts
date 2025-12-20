// packages/shared/hooks/useCertificationSettings.ts

import { useState, useEffect } from 'react';
import {
  getCertificationStatus,
  uploadCertificationDocuments,
  CertificationData,
} from '@mytutorapp/shared/api';

/**
 * A single file, already encoded to base64
 */
export interface Base64File {
  name: string;
  type: string;
  base64: string;
}

export default function useCertificationSettings(
  backendUrl: string,
  token: string,
  profileId?: string
) {
  const [uploading, setUploading] = useState(false);
  const [certificationData, setCertificationData] = useState<CertificationData | null>(null);

  // 1) Fetch current status on mount / when profileId changes
  useEffect(() => {
    if (!profileId) return;
    getCertificationStatus(backendUrl, token, profileId)
      .then(setCertificationData)
      .catch((err) => console.error('Error fetching certification status:', err));
  }, [backendUrl, token, profileId]);

  // 2) Upload handler takes *already-prepared* base64 files
  const handleSubmit = async (files: Base64File[]): Promise<CertificationData | null> => {
    if (!profileId) {
      console.error('Missing profileId');
      return null;
    }
    if (files.length === 0) {
      console.error('No files provided for upload');
      return null;
    }

    setUploading(true);
    try {
      const updated = await uploadCertificationDocuments(backendUrl, token, profileId, files);
      setCertificationData(updated);
      return updated;
    } catch (err) {
      console.error('Error uploading certification:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploading,
    certificationData,
    handleSubmit,
  };
}
