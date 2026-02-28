// packages/shared/types/index.ts

// -------------------------------------------------------------
// 🔹 Utility & Core Types
// -------------------------------------------------------------
export type GalleryImage = File | string | null;


export type OrgRole = 'owner' | 'admin' | 'instructor' | 'learner';

export type PayoutCurrency = 'USD' | 'KES';





/** Payload your API expects for updates */
export interface UpdateProfilePayload {
  name: string;
  age?: string; // server expects string
  languages: string[];

  country?: string;
  schoolGrade?: string; // camelCase for client
  gallery?: string[];
  video?: string;

  status?: string;
  notifications?: boolean;

  pricing: {
    privateSession: number;
    groupSession: number;
    lecture: number;
    workshop: number;
  };

  experienceLevel?: string;
  category?: string;
  recommended: string[];

 

  // ── Legacy (deprecated) still accepted by older backends but not used by UI ──
  /** @deprecated */
  paymentMethod?: 'bank' | 'mpesa';
  /** @deprecated */
  bankAccount?: string;
  /** @deprecated */
  bankCode?: string;
}




