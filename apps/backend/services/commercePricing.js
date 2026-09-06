export const STANDARD_VAT_BPS = 1600;

export function itemPricing(item, vendor) {
  const partnerPrice = Math.max(0, Math.round(Number(item.price || 0)));
  const commissionBps = Number(vendor.commission_rate_bps || process.env.SOKOEATS_COMMISSION_BPS || 1000);
  const commissionAmount = Math.round(partnerPrice * commissionBps / 10000);
  const customerPrice = partnerPrice + commissionAmount;
  const taxCategory = item.tax_category || 'standard';
  const taxRateBps = vendor.vat_registered && taxCategory === 'standard'
    ? Number(item.tax_rate_bps || STANDARD_VAT_BPS)
    : 0;
  const vatAmount = Math.round(customerPrice * taxRateBps / 10000);
  return { partnerPrice, commissionBps, commissionAmount, customerPrice, taxCategory, taxRateBps, vatAmount };
}

export function platformVat(amount) {
  return String(process.env.SOKOEATS_VAT_REGISTERED || '').toLowerCase() === 'true'
    ? Math.round(Number(amount || 0) * STANDARD_VAT_BPS / 10000)
    : 0;
}
