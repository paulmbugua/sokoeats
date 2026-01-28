// apps/web/src/layouts/SiteLayout.web.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Navbar from '../components/Navbar.web';
import Footer from '../components/Footer.web'; // ✅ import the footer

const GSC_VERIFICATION = import.meta.env.VITE_GSC_VERIFICATION ?? '';
const SiteLayout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-softGray dark:bg-darkBg text-darkText dark:text-darkTextPrimary">
      {GSC_VERIFICATION ? (
        <Helmet>
          <meta name="google-site-verification" content={GSC_VERIFICATION} />
        </Helmet>
      ) : null}
      {/* Sticky Navbar */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
};

export default SiteLayout;
