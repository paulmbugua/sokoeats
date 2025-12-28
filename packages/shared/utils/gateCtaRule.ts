// packages/shared/src/utils/gateCtaRule.ts

export type GateReason =
  | 'quota_exhausted'
  | 'anon_quota_exhausted'
  | 'entitlement_required'
  | 'login_or_anon_required'
  | 'login_required'
  | 'certificate_required'
  | string
  | undefined
  | null;

export type CertificateCta =
  | { show: false }
  | {
      show: true;
      /** UI styling intent */
      kind: 'signup' | 'buy';
      /** Behavioral intent (kept for older callers) */
      action: 'login' | 'buy';
      label: string;
    };

export function getCertificateCtaFromGate({
  gateMode,
  reason,
  isLoggedIn,
}: {
  gateMode?: 'narration' | 'notes_only';
  reason?: GateReason;
  isLoggedIn: boolean;
}): CertificateCta {
  const r = String(reason || '').trim();

  // Only show CTA when narration is locked (notes_only)
  if (gateMode !== 'notes_only') return { show: false };

  // ANON (or not logged in) should see signup/login nudge for these reasons
  if (!isLoggedIn) {
    if (r === 'anon_quota_exhausted' || r === 'login_or_anon_required' || r === 'login_required') {
      return {
        show: true,
        kind: 'signup',
        action: 'login',
        label: 'Sign up to continue',
      };
    }
    return { show: false };
  }

  // Signed users: daily cap exhausted OR entitlement required => buy certificate
  if (r === 'quota_exhausted' || r === 'entitlement_required' || r === 'certificate_required') {
    return {
      show: true,
      kind: 'buy',
      action: 'buy',
      label: 'Buy certificate (20 tokens)',
    };
  }

  return { show: false };
}
