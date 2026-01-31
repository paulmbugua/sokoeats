// src/pages/CookiePolicy.jsx
import React from 'react';

const CookiePolicy = () => {
  return (
    <div className="max-w-3xl mx-auto p-6 bg-white shadow-md rounded-lg">
      <h1 className="text-3xl font-display font-semibold text-plum mb-6">
        Cookie Policy for DayBreak
      </h1>
      <p className="text-sm text-mutedGray mb-8">Effective Date: 01-02-2025</p>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">1. Introduction</h2>
        <p className="text-base text-darkText leading-relaxed">
          Welcome to DayBreak. This Cookie Policy explains how we use cookies and similar
          technologies on our website. By using our site, you consent to the use of cookies as
          described in this policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">
          2. What Are Cookies?
        </h2>
        <p className="text-base text-darkText leading-relaxed">
          Cookies are small text files placed on your device by websites you visit. They are widely
          used to make websites work efficiently and to provide information to site owners.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">
          3. How We Use Cookies
        </h2>
        <p className="text-base text-darkText leading-relaxed mb-4">We use cookies to:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>Enhance User Experience: Remember your preferences and settings.</li>
          <li>Analytics: Understand how you use our site to improve functionality.</li>
          <li>Authentication: Keep you logged in as you navigate our site.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">
          4. Types of Cookies We Use
        </h2>
        <ul className="list-disc list-inside space-y-2">
          <li>
            <strong>Essential Cookies:</strong> Necessary for the operation of our website.
          </li>
          <li>
            <strong>Performance Cookies:</strong> Collect information about how visitors use our
            site.
          </li>
          <li>
            <strong>Functionality Cookies:</strong> Remember choices you make to improve your
            experience.
          </li>
          <li>
            <strong>Targeting Cookies:</strong> Track your browsing habits to deliver relevant
            advertisements.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">
          5. Third-Party Cookies
        </h2>
        <p className="text-base text-darkText leading-relaxed">
          We may allow third-party service providers to place cookies on your device for analytics
          and advertising purposes. These providers include:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li>[List of Third-Party Providers]</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">6. Managing Cookies</h2>
        <p className="text-base text-darkText leading-relaxed">
          You can control and manage cookies through your browser settings. However, disabling
          cookies may affect the functionality of our website.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-display font-medium text-primary mb-4">
          7. Changes to This Policy
        </h2>
        <p className="text-base text-darkText leading-relaxed">
          We may update this Cookie Policy from time to time. We encourage you to review this policy
          periodically for any changes.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-display font-medium text-primary mb-4">8. Contact Us</h2>
        <p className="text-base text-darkText leading-relaxed">
          If you have any questions about our use of cookies, please contact us at:
        </p>
        <p className="text-base text-darkText leading-relaxed mt-2">+254 720 423 764</p>
      </section>
    </div>
  );
};

export default CookiePolicy;
