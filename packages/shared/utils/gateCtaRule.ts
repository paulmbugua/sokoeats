// gateCtaRule.ts (shared idea; copy into web/mobile if you don't have shared utils)

export type GateReason =
  | 'quota_exhausted'
  | 'anon_quota_exhausted'
  | 'entitlement_required'
  | string
  | undefined
  | null;

export function getCertificateCtaFromGate(opts: {
  gateMode?: 'narration' | 'notes_only' | null;
  reason?: GateReason;
  isLoggedIn: boolean;
}) {
  const { gateMode, reason, isLoggedIn } = opts;

  // Only show CTA when narration is locked and we have a known purchase-unlock reason.
  const shouldConsider = gateMode === 'notes_only';
  if (!shouldConsider) return { show: false as const };

  const buyReasons = new Set<GateReason>([
    'quota_exhausted',
    'anon_quota_exhausted',
    'entitlement_required',
  ]);

  if (!buyReasons.has(reason)) return { show: false as const };

  // anon quota → must log in before buying
  if (reason === 'anon_quota_exhausted' || !isLoggedIn) {
    return {
      show: true as const,
      action: 'login' as const,
      label: 'Log in to buy',
      sku: 'certificate',
    };
  }

  return {
    show: true as const,
    action: 'buy_certificate' as const,
    label: 'Buy Certificate',
    sku: 'certificate',
  };
}
