export type FeeAccessStatus = {
  ok: boolean;
  hasAccess: boolean;
  designatedInstructorId: string | number | null;
  updatedAt?: string | null;
  grantedByUserId?: string | number | null;
};
