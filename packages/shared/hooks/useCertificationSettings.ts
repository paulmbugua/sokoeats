import { useMemo } from 'react';

export type CertificationSettings = {
  enabled: boolean;
  requireAdminReview: boolean;
  maxUploadMb: number;
  acceptedMimeTypes: string[];
};

export default function useCertificationSettings() {
  return useMemo<CertificationSettings>(() => ({
    enabled: true,
    requireAdminReview: true,
    maxUploadMb: 10,
    acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  }), []);
}
