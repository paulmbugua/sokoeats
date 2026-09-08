import type { Metadata } from 'next';

import styles from './privacy-policy.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How SokoEats collects, uses, shares and protects personal information.',
  alternates: { canonical: '/privacy-policy' },
};

const sections = [
  {
    title: 'Who we are',
    body: (
      <>
        <p>
          SokoEats is operated by <strong>EkaziConnect Solutions Ltd</strong> ("SokoEats",
          "we", "us" or "our"). Our business address is International Hse, 2nd flr, Rm12,
          Kenya.
        </p>
        <p>
          This policy explains how we handle information when you use the SokoEats mobile app,
          website, partner portals, customer-care channels and related delivery services.
        </p>
      </>
    ),
  },
  {
    title: 'Who this policy covers',
    body: (
      <>
        <p>This policy applies to all people using or interacting with SokoEats, including:</p>
        <ul>
          <li>Buyers who browse shops, place orders, make payments and receive deliveries.</li>
          <li>Riders who accept, collect and deliver orders.</li>
          <li>Vendors who operate a shop and publish products for sale.</li>
          <li>Merchants who manage a registered business, brand, staff or several shops.</li>
          <li>Customer-care users, applicants, visitors and people contacting us for support.</li>
          <li>Platform administrators and authorised operations or compliance staff.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'Information we collect',
    body: (
      <>
        <h3>Account and identity information</h3>
        <p>
          We collect your name, email address, phone number, account role, profile photo and sign-in
          provider. For riders, vendors and merchants, we may also collect city, delivery or shop
          address, vehicle and registration details, business name, registration information, KRA
          PIN, national ID or director details, settlement details and verification documents.
        </p>
        <h3>Orders and service information</h3>
        <p>
          We collect items selected, shop and menu information, delivery instructions, recipient
          details when you order for another person, order status, delivery OTP events, ratings,
          favourites, reorders, support conversations and application tracking numbers.
        </p>
        <h3>Location information</h3>
        <p>
          With your permission, we use device location, map pins, geocoded addresses, route points
          and rider location updates to calculate delivery routes, price delivery, show coverage,
          assign riders and provide live order tracking. You can enter or move a pin manually.
        </p>
        <h3>Payment, settlement and financial records</h3>
        <p>
          Our payment providers process payment credentials. We receive payment status, provider
          references, amounts, currency, refunds, disputes, settlement and payout records. We do
          not store raw card numbers or card security codes. Vendors, merchants and riders may
          provide bank, M-Pesa, Till or Paybill settlement details for payouts.
        </p>
        <h3>Technical and usage information</h3>
        <p>
          We receive IP address, device and operating-system details, app version, browser type,
          crash and diagnostic logs, approximate location, pages or screens viewed, session events
          and cookie or similar technology data.
        </p>
        <h3>Communications and uploads</h3>
        <p>
          We process messages sent to customer care, email and SMS delivery status, feedback,
          ratings, shop branding images, product images, documents and other content you choose to
          upload.
        </p>
      </>
    ),
  },
  {
    title: 'How we use information',
    body: (
      <>
        <p>We use information to:</p>
        <ul>
          <li>create, authenticate and secure accounts and keep buyers signed in across devices;</li>
          <li>display shops, products, prices, availability, ratings and relevant recommendations;</li>
          <li>accept orders, calculate VAT or other applicable charges, process payments and refunds;</li>
          <li>coordinate shops and riders, share the necessary delivery details and track order progress;</li>
          <li>send order, payment, delivery, account, security and service messages;</li>
          <li>verify partner applications, manage compliance, calculate commissions and make payouts;</li>
          <li>prevent fraud, abuse, unsafe deliveries, unauthorised access and payment disputes;</li>
          <li>provide customer care, resolve complaints and improve products, maps and operations;</li>
          <li>measure performance, troubleshoot failures and maintain reliable infrastructure; and</li>
          <li>meet legal, tax, accounting, regulatory and lawful-authority requirements.</li>
        </ul>
      </>
    ),
  },
  {
    title: 'When we share information',
    body: (
      <>
        <p>
          We share only the information reasonably needed for the service. A buyer’s name, phone
          number, delivery address, map pin, instructions and order details may be shared with the
          relevant shop and assigned rider. A shop receives order information needed to prepare the
          order, and a rider receives information needed to collect and deliver it.
        </p>
        <p>
          We use trusted providers for authentication, hosting, maps and geocoding, payment
          processing, storage, email, SMS, analytics, security and customer support. They process
          information under their service agreements and our instructions. We may also share records
          with professional advisers, insurers, auditors, acquiring banks, regulators or law
          enforcement where permitted or required by law, or during a business transfer.
        </p>
        <p>
          We do not sell personal information. We do not give a shop access to a buyer’s unrelated
          orders or a rider access to information unrelated to an assigned delivery.
        </p>
      </>
    ),
  },
  {
    title: 'Payments and partner payouts',
    body: (
      <p>
        Payments are initiated through our configured payment provider and may offer available
        methods such as M-Pesa or card. The provider may process information under its own privacy
        terms. SokoEats keeps transaction and ledger records so that customers can receive support,
        shops can reconcile sales, riders can receive entitlements and legitimate refunds or disputes
        can be handled. Vendors, merchants and riders are responsible for keeping their settlement
        account information accurate and confidential.
      </p>
    ),
  },
  {
    title: 'Location and delivery privacy',
    body: (
      <>
        <p>
          Location access is optional until a feature needs it. If you allow current location, we
          use it for coverage, map positioning, address confirmation and route estimation. Riders
          may share active delivery location with SokoEats and the buyer during an assigned delivery
          and for a limited operational period afterwards.
        </p>
        <p>
          You can disable device location permissions, use a saved address or move the map pin.
          Disabling location may limit automatic pinning, route calculation or live tracking.
        </p>
      </>
    ),
  },
  {
    title: 'Google, Firebase and other sign-in services',
    body: (
      <p>
        Buyers and riders may sign in with Google through Firebase or another configured identity
        service. We receive the account information permitted by that service, such as your name,
        email and profile image, and use it to create or access your SokoEats account. Partners may
        be required to submit business and compliance details before activation. Your use of a third-
        party sign-in service is also subject to that provider’s privacy policy.
      </p>
    ),
  },
  {
    title: 'Cookies and similar technologies',
    body: (
      <p>
        The website may use essential cookies or local storage to keep sessions, remember basket and
        preference state, protect forms and maintain security. We may use limited analytics or
        diagnostics to understand reliability and usage. You can control cookies in your browser,
        but disabling essential storage may prevent login or ordering from working.
      </p>
    ),
  },
  {
    title: 'Retention and deletion',
    body: (
      <p>
        We keep information only for as long as needed for the purposes described here, including
        account operation, safety, support, disputes, fraud prevention, tax, accounting and legal
        obligations. Account profile data can be deleted or corrected through the account controls
        where available, or by contacting us. Transaction, payout, tax, compliance and security
        records may need to be retained for a longer period even after account deletion, with access
        restricted and data anonymised where practical.
      </p>
    ),
  },
  {
    title: 'Your choices and rights',
    body: (
      <>
        <p>Subject to applicable Kenyan law and reasonable verification, you may ask us to:</p>
        <ul>
          <li>tell you what personal information we hold and provide a copy;</li>
          <li>correct inaccurate or incomplete information;</li>
          <li>delete information that we no longer need or are not required to retain;</li>
          <li>explain or restrict certain processing, or object where legally available;</li>
          <li>withdraw permission for optional location, marketing or notification processing; and</li>
          <li>help you raise a complaint with the relevant data-protection authority.</li>
        </ul>
        <p>
          We may need to verify your identity and may explain when a request cannot be completed
          because a legal, safety, fraud-prevention or contractual obligation applies.
        </p>
      </>
    ),
  },
  {
    title: 'Security',
    body: (
      <p>
        We use access controls, encryption in transit, provider safeguards, audit records and role-
        based access to protect information. No online service is completely secure. Keep your
        password, verification codes, payment prompts and device secure, and notify us immediately
        if you suspect unauthorised access.
      </p>
    ),
  },
  {
    title: 'Children',
    body: (
      <p>
        SokoEats is intended for people who can lawfully use the service and enter binding
        agreements. We do not knowingly collect children’s information for independent account
        creation. Contact us if you believe a child has provided information so we can review it.
      </p>
    ),
  },
  {
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy when our services, providers or legal obligations change. We will
        publish the new version here, update the effective date and provide additional notice where
        required. Your continued use after an update means the updated policy applies to future
        use, subject to applicable law.
      </p>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <a className={styles.back} href="/">← Back to SokoEats</a>
        <header className={styles.header}>
          <p className={styles.eyebrow}>SokoEats legal</p>
          <h1>Privacy Policy</h1>
          <p className={styles.lede}>
            Clear information about how EkaziConnect Solutions Ltd handles data across the SokoEats
            marketplace, delivery service and partner tools.
          </p>
          <div className={styles.meta}>
            <span><strong>Effective:</strong> 8 September 2026</span>
            <span><strong>Version:</strong> 1.0</span>
          </div>
        </header>

        <div className={styles.content}>
          <aside className={styles.contents} aria-label="Contents">
            <strong>On this page</strong>
            <nav>
              {sections.map((section, index) => (
                <a key={section.title} href={`#section-${index + 1}`}>
                  {index + 1}. {section.title}
                </a>
              ))}
            </nav>
          </aside>
          <article className={styles.article}>
            {sections.map((section, index) => (
              <section key={section.title} id={`section-${index + 1}`}>
                <h2>{index + 1}. {section.title}</h2>
                {section.body}
              </section>
            ))}
            <section className={styles.contact} id="contact">
              <h2>Contact us</h2>
              <p>
                For privacy questions, access or deletion requests, contact SokoEats at{' '}
                <a href="mailto:support@sokoeats.co.ke">support@sokoeats.co.ke</a> or write to
                EkaziConnect Solutions Ltd, International Hse, 2nd flr, Rm12, Kenya.
              </p>
              <p className={styles.note}>
                Please include enough information for us to identify your account and describe your
                request. Do not send passwords, payment PINs or full card details by email.
              </p>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}
