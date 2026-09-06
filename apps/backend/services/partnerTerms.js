import crypto from 'node:crypto';

export const TERMS_VERSION = '2026-09-03.2';
export const termsRole = (role) => ({ courier: 'rider', merchant_admin: 'merchant' }[role] || role);
export const needsPartnerTerms = (role) => ['rider', 'vendor', 'merchant'].includes(termsRole(role));

const common = [
  ['Your agreement', 'These terms govern your use of SokoEats as a delivery or business partner in Kenya. By selecting the acceptance checkbox, you confirm you are at least 18, have read this agreement, and have authority to act for the named business where applicable. Registration is an application, not a guarantee of approval, jobs, sales, exclusivity or income. Your separately accepted commercial schedule forms part of this agreement. Mandatory Kenyan law takes priority over any inconsistent clause.'],
  ['Identity, verification and account security', 'Provide accurate identity, contact, tax, licence, business and settlement details and keep them current. Supply documents needed for lawful verification and payment-provider checks. Do not impersonate another person, share credentials, bypass suspension or use an account without authority. Protect your password and device and promptly report suspected misuse through in-app support. SokoEats may request re-verification; restricted activities remain unavailable until required checks are complete.'],
  ['Orders and customer care', 'Only accept orders you can fulfil. Keep availability and preparation or arrival estimates accurate, communicate delays promptly, and record each actual handover using the platform. Estimates are not guarantees. Do not falsify acceptance, pickup, arrival, delivery, ratings or GPS data. Contact the customer only as necessary for the order. Do not demand off-platform payment, a tip, a customer password or a payment PIN. Raise missing items, failed delivery and safety concerns through support with relevant evidence.'],
  ['Payments, fees and statements', 'Customer payments are processed through the configured payment provider, including Paystack, for reconciliation and fulfilment. A payment initiation or screenshot is not confirmation of payment. The separate commercial agreement or accepted delivery offer identifies commission, delivery earnings, service fees, provider charges and any applicable taxes or deductions. Do not deduct an undisclosed fee. Promotional funding, surge eligibility and who bears a discount must be disclosed before participation; surge and promotions do not guarantee earnings. Review transaction statements and report discrepancies promptly.'],
  ['Settlement, reserves and disputes', 'Confirmed payment is not immediately withdrawable revenue. Settlement depends on fulfilment, delivery confirmation, reconciliation, verified payout details, provider availability and applicable risk checks. New store partners are ordinarily eligible the day after confirmed delivery (T+1); approved trusted partners may qualify for same-day settlement. Riders use their approved daily or immediate schedule. Eligibility is not a bank-credit guarantee: cutoffs, weekends, holidays, transfer charges and provider processing may affect receipt. Disputed or suspicious amounts may be held while investigated. Holds and adjustments must be proportionate to the affected exposure, recorded with a reason, and reviewable through support; undisputed eligible balances remain payable.'],
  ['Cancellations, refunds and chargebacks', 'Report inability to fulfil before dispatch where possible. Refunds are reconciled through the original payment provider wherever supported. Responsibility for loss, a refund or chargeback is determined from the order record, applicable law and the party responsible, not automatically assigned to a rider or shop. You may provide evidence and challenge an adjustment. Do not refund a customer separately unless support confirms the process, as this can cause duplicate refunds. SokoEats must not retain money it is legally required to return.'],
  ['Privacy and location', 'Use customer names, contact details, addresses and delivery locations only to fulfil and support the relevant order. Do not sell, export for marketing, publish or retain that data unnecessarily. Location is used for service coverage, dispatch, delivery tracking and safety where the device permission and applicable lawful basis allow it; background tracking requires the relevant separate permission. Limit staff access, secure devices, and promptly report a suspected data incident. Identity, transaction and acceptance records may be retained where necessary for legal, fraud, accounting or dispute obligations. Request access, correction or deletion through account settings or support; you may complain to the ODPC. Acceptance of these terms is not consent to optional marketing, and does not waive data-protection rights.'],
  ['Conduct, safety and prohibited activity', 'No harassment, discrimination, threats, theft, bribery, fraud, counterfeit goods, unlawful sales or manipulation of promotions and reviews. Follow public-health, road-safety and product-specific requirements. Stop unsafe work and contact emergency services where there is immediate danger, then report the incident through support when safe. Do not place yourself or others at risk to meet an estimated time.'],
  ['Content and platform rights', 'You retain rights in your branding and original content. You grant SokoEats a non-exclusive licence to display, resize and distribute content you submit to operate and promote your listings while they are active, and to retain relevant records where required. Upload only images and descriptions you own or may use. Do not copy another shop, misrepresent a product, introduce malicious software, scrape private data or interfere with the service. Report infringing or inaccurate content for review.'],
  ['Tax, insurance and working relationship', 'Each party remains responsible for taxes, records, permits and insurance applicable to its activities. Provide compliant invoices or receipts where required; deductions required by law will be reflected in records. No minimum income, employee benefit or insurance cover is promised unless separately confirmed in writing. The legal nature of the relationship is determined by applicable law and actual circumstances, not solely by the label partner or independent contractor. These terms do not remove statutory employment or consumer rights.'],
  ['Suspension, exit and balances', 'You may stop taking new orders and request account closure in account settings. Complete or arrange support-led resolution of open orders first. SokoEats may restrict access for safety, fraud, non-compliance or serious breach and, where lawful and practical, explain the reason and allow a response through support. Immediate restriction may be necessary to prevent harm. Closure does not erase valid earned balances, refunds, disputes, tax records or other accrued obligations. Personal data that is no longer needed will be handled under the privacy policy and applicable law.'],
  ['Responsibility and service availability', 'Each party is responsible for loss caused by its own breach, negligence or unlawful conduct, assessed with evidence and applicable law. Connectivity, maps, payment processors and other external services can fail; report problems rather than marking an uncompleted order complete. No clause excludes liability that cannot lawfully be excluded, including applicable consumer remedies. Neither a blanket waiver nor an automatic unlimited indemnity is required to join.'],
  ['Complaints, changes and applicable law', 'Use in-app support with your order or settlement reference to raise a complaint and request human review. You retain access to competent Kenyan courts, regulators and any applicable statutory complaints process; arbitration is not compulsory under these terms. Kenyan law applies subject to mandatory rights. Material changes will be shown with a new version for acceptance before affected partner activities continue. New terms do not retrospectively change completed transactions or remove accrued rights. A copy of the terms and your acceptance record is available from your account.'],
];

const specific = {
  rider: [
    ['Rider responsibilities', 'Maintain the driving licence, vehicle registration, roadworthiness, insurance and safety equipment required for your vehicle and delivery work. Use an approved vehicle and your own verified identity. Check package count and visible condition at pickup without opening sealed packages; transport goods hygienically and separate incompatible goods. Do not carry regulated or hazardous goods without required authorisation and suitable equipment.'],
    ['Delivery evidence and earnings', 'Review the offered route, estimated distance, earnings and any surge before accepting. Observe traffic laws and take breaks; never operate the app while driving. Update pickup and arrival only when they occur. Ask the recipient for the delivery OTP only at the actual handover; never invent an OTP or complete a delivery early. For an unreachable recipient or unsafe address, contact support and follow the documented return or failed-delivery process. Keep proof limited to what is needed and avoid photographing identity documents or people unnecessarily. Tips and incentives, where offered, must be identified separately in earnings.'],
  ],
  vendor: [
    ['Vendor: sell from your shop', 'You own or operate the shop shown to customers. Keep the shop address and pin, opening hours, stock, prices, product names, images, quantities and descriptions accurate. Confirm orders, prepare the correct items, package them securely and give the rider the right order. Obtain customer agreement through the platform before substitutions, quantity changes or additional charges. Do not list unavailable stock to attract orders.'],
    ['Marketplace pricing', 'Enter the amount you want to receive for each product before statutory deductions. Under the current launch schedule, SokoEats adds a 10% marketplace amount to produce the customer-facing item price. Customers see one final item price and are not shown the internal marketplace split. Your catalogue preview and settlement statement show your entered amount, the marketplace amount and any applicable taxes or provider deductions. SokoEats must notify you and obtain acceptance before a material rate change applies to future orders.'],
    ['Product quality and regulated goods', 'You are responsible for lawful sourcing, authenticity, quality, expiry dates, storage and mandatory product information. Food listings must communicate relevant ingredients and allergen information and comply with applicable hygiene and licensing rules. Medicines must be supplied only through properly authorised premises and personnel, including prescription checks where required; a listing is not medical advice. LPG, gas and other regulated goods require the applicable permits and safe handling. Maintain traceability and cooperate with recalls, complaints and lawful inspections. Do not sell prohibited, recalled or unsafe goods.'],
  ],
  merchant: [
    ['Merchant: manage the business', 'You act for the registered business, brand or multiple shops identified in your application and confirm authority to bind it. Maintain the legal name, registration, tax details, authorised representatives and settlement ownership. Each branch must have accurate operating details, permits and fulfilment capacity. Use role-based staff access, remove departing staff promptly, and oversee orders, product accuracy, support and financial reconciliation across your shops.'],
    ['Marketplace pricing', 'Enter the amount the business should receive for each product before statutory deductions. Under the current launch schedule, SokoEats adds a 10% marketplace amount to produce the customer-facing item price. Customers see one final item price and are not shown the internal marketplace split. Catalogue previews and settlement statements show the entered amount, marketplace amount and applicable taxes or provider deductions. SokoEats must notify the business and obtain acceptance before a material rate change applies to future orders.'],
    ['Branches, listings and commercial authority', 'Ensure every branch follows the same product-safety, authenticity, food-hygiene, allergen, expiry, prescription and regulated-goods obligations that apply to its products. Staff may only publish content and accept commitments within their authority. Do not route another business through your settlement account without verification and approval. Changes to payout destinations or business ownership require verification. Campaigns and discounts require an agreed budget and funding source; a dashboard forecast is not a revenue guarantee.'],
  ],
};

export function getPartnerTerms(role) {
  role = termsRole(role);
  if (!needsPartnerTerms(role)) throw Object.assign(new Error('Terms are available for riders, vendors and merchants'), { status: 404 });
  const document = {
    role, version: TERMS_VERSION, effectiveDate: '2026-09-03',
    title: `SokoEats ${role[0].toUpperCase() + role.slice(1)} Terms of Service`,
    operator: process.env.SOKOEATS_LEGAL_ENTITY || 'EkaziConnect Solutions Ltd',
    address: process.env.SOKOEATS_LEGAL_ADDRESS || 'International Hse, 2nd flr, Rm12',
    contact: process.env.SOKOEATS_LEGAL_EMAIL || 'support@sokoeats.co.ke',
    sections: [...common.slice(0, 2), ...specific[role], ...common.slice(2)].map(([title, body]) => ({ title, body })),
  };
  return { ...document, hash: crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex') };
}

export function hasCurrentTerms(user) {
  return !needsPartnerTerms(user.role) || (user.partner_terms_version === TERMS_VERSION && user.partner_terms_role === termsRole(user.role));
}

export function validateTermsAcceptance(role, acceptance) {
  if (!needsPartnerTerms(role)) return null;
  const document = getPartnerTerms(role);
  if (acceptance?.accepted !== true || acceptance.role !== document.role || acceptance.version !== document.version || acceptance.hash !== document.hash) {
    throw Object.assign(new Error('Open and accept the current terms of service for your account type to continue.'), { status: 422 });
  }
  return document;
}

export async function recordTermsAcceptance(db, user, acceptance) {
  const document = validateTermsAcceptance(user.role, acceptance);
  if (!document) return user;
  await db.query(`INSERT INTO sokoeats_terms_acceptances (user_id, role, version, document_hash, document)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (user_id, role, version) DO NOTHING`,
  [user.id, document.role, document.version, document.hash, JSON.stringify(document)]);
  const { rows } = await db.query(`UPDATE sokoeats_users SET partner_terms_version=$2, partner_terms_role=$3,
    terms_accepted_at=(SELECT accepted_at FROM sokoeats_terms_acceptances WHERE user_id=$1 AND version=$2 AND role=$3)
    WHERE id=$1 RETURNING *`, [user.id, document.version, document.role]);
  return rows[0];
}
