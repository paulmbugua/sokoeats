export const PROVIDER_FREE_SERVICE_LIMIT = 2;

const QUALIFICATION_SERVICE_STATUSES = new Set(['pending', 'approved']);

export function normalizeProviderServices(values, max = 12) {
  if (!Array.isArray(values)) return [];
  const services = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    services.push(value);
    if (services.length >= max) break;
  }
  return services;
}

export function hasProviderServiceQualification(profile) {
  if (!profile) return false;
  const status = String(profile.certificate_status || profile.certificateStatus || '').toLowerCase();
  return Boolean(profile.certificate_url || profile.certificateUrl || QUALIFICATION_SERVICE_STATUSES.has(status));
}

export async function validateProviderServiceSelection(db, userId, services) {
  const selected = normalizeProviderServices(services);
  if (selected.length <= PROVIDER_FREE_SERVICE_LIMIT) {
    return { ok: true, services: selected, requiresQualification: false };
  }

  const { rows } = await db.query(
    `SELECT certificate_url, certificate_status
       FROM ekazi_handyman_profiles
      WHERE user_id = $1
      LIMIT 1`,
    [userId],
  );

  if (hasProviderServiceQualification(rows[0])) {
    return { ok: true, services: selected, requiresQualification: true };
  }

  return {
    ok: false,
    services: selected,
    status: 409,
    code: 'SERVICE_LIMIT_REQUIRES_QUALIFICATION',
    maxFreeServices: PROVIDER_FREE_SERVICE_LIMIT,
    message:
      'Providers can select up to 2 services without a qualification certificate. Upload your qualification certificate before adding a third service.',
  };
}

export function providerServiceLimitError(result) {
  return {
    message: result.message,
    code: result.code,
    maxFreeServices: result.maxFreeServices || PROVIDER_FREE_SERVICE_LIMIT,
    selectedServices: result.services || [],
  };
}
