import type { UserRole } from '@myhandymanapp/shared/types/ShopContextTypes';

export const RoleOrder = {
  student: 0,
  tutor: 1,
  admin: 2,
  superadmin: 3,
} as const;

export function hasRoleAtLeast(current: UserRole, required: UserRole): boolean {
  if (!current || !required) return false;

  return RoleOrder[current] >= RoleOrder[required];
}

export function isAdmin(current: UserRole): boolean {
  return hasRoleAtLeast(current, 'admin');
}

export function isSuperAdmin(current: UserRole): boolean {
  return current === 'superadmin';
}
