// Basic mapping: turn a grade band label or key into an ageGroup we store in DB
// - 'preprimary'/'primary'       → 'child'
// - 'lower-secondary'/'upper-secondary'/'sixth-form' → 'teen'
// - 'tvet'/'tertiary'/'adults'   → 'adult'
export function inferAgeGroup({ age, gradeBands }) {
  // 1) prefer band if provided
  const asArr = Array.isArray(gradeBands)
    ? gradeBands
    : gradeBands
      ? [gradeBands]
      : [];
  const first = (asArr[0] || '').toString().toLowerCase();

  if (first.includes('pre') || first.includes('pp')) return 'child';
  if (first.includes('primary')) return 'child';
  if (
    first.includes('lower-secondary') ||
    first.includes('junior') ||
    first.includes('jss') ||
    first.includes('ks3')
  )
    return 'teen';
  if (
    first.includes('upper-secondary') ||
    first.includes('senior') ||
    first.includes('high') ||
    first.includes('gcse') ||
    first.includes('sixth')
  )
    return 'teen';
  if (
    first.includes('tvet') ||
    first.includes('tertiary') ||
    first.includes('university') ||
    first.includes('college') ||
    first.includes('adult')
  )
    return 'adult';

  // 2) fallback: infer from age
  const n = Number(age);
  if (Number.isFinite(n)) {
    if (n < 13) return 'child';
    if (n < 18) return 'teen';
    return 'adult';
  }
  // 3) final fallback
  return 'teen';
}
