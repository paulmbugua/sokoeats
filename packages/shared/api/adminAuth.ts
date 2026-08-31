export type AdminAuthRole = 'customer' | 'rider' | 'vendor' | 'merchant' | 'support' | 'admin';

export function adminRoleLabel(role: AdminAuthRole) {
  if (role === 'admin') return 'Platform Admin';
  if (role === 'support') return 'Support Agent';
  if (role === 'merchant') return 'Merchant Admin';
  if (role === 'vendor') return 'Vendor Operator';
  if (role === 'rider') return 'Rider';
  return 'Buyer';
}

export function adminAccountGuidance(role: AdminAuthRole) {
  if (role === 'admin') return 'Platform admins are invited by an existing owner. Use the private admin invite code to create a password account, then rotate the invite code.';
  if (role === 'support') return 'Support agents are invited by operations. Use the private support invite code to create a password account with ticket and dispatch access.';
  if (role === 'merchant' || role === 'vendor') return 'Business operators enroll through merchant onboarding, submit verification details, and receive catalogue access after review.';
  return 'Customers and riders enroll through the SokoEats mobile or web onboarding flow.';
}
