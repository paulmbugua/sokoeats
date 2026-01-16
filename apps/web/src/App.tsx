// apps/web/src/App.tsx
import React, { ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import SiteLayout from './layouts/SiteLayout.web';
import Spinner from './components/Spinner.web';
import CookieConsentBanner from './components/CookieConsentBanner.web';
import AuthBusyOverlay from './components/AuthBusyOverlay';

import Landing from './pages/Landing.web';
import HomePage from './pages/HomePage.web';
import FindTutor from './pages/FindTutor.web';
import RobotTutorPage from './pages/RobotTutor.web';
import HelpPage from './pages/HelpPage.web';
import ResourcesPage from './pages/Resources.web';
import ProfileDetailPage from './pages/ProfileDetailPage.web';
import ProfilePage from './pages/Profile.web';
import LoginPage from './pages/LoginPage.web';
import OrgLearnerNewsletters from './pages/org/OrgLearnerNewsletters.web';

import RefundsAndCancellations from './pages/RefundsAndCancellations';
import FulfillmentPolicy from './pages/FulfillmentPolicy';
import PaymentFlow from './pages/PaymentFlow';
import UnsubscribePage from './pages/Unsubscribe';
import CookiePolicy from './pages/CookiePolicy.web';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import AntiSpamPolicy from './pages/AntiSpamPolicy';
import ComplaintsFeedback from './pages/ComplaintsFeedback';
import OrgLearnerFeesPage from './pages/org/OrgLearnerFees.web';
import Messages from './pages/Messages.web';
import ResultsPage from './pages/Results.web';
import OrgLearnerSportsClubsPage from './pages/org/OrgLearnerSportsClubs.web'
import MyCourses from './pages/MyCourses.web';
import CourseDetails from './pages/CourseDetails.web';
import EditCoursePage from './components/EditCourse.web';
import MyEnrollmentsPage from './pages/MyEnrollments.web';
import CreateCourse from './components/CreateCourse.web';
import CourseEnrollment from './components/CourseEnrollment.web';
import CourseProgress from './components/CourseProgress.web';
import AchievementsList from './components/AchievementsList.web';
import LanguageLearningPage from './pages/LanguageLearning.web';

import AccountSection from './components/AccountSection.web';

// ClassVault
import ClassVaultList from './components/ClassVaultList.web';
import ClassVaultDetail from './components/ClassVaultDetail.web';
import ClassVaultUpload from './components/ClassVaultUpload.web';

// Public verify views
import VerifyCertificatePage from './components/VerifyCertificate.web';
import VerifyCertificatePrintPage from './components/VerifyCertificatePrint.web';
import CertificationSettings from './components/CertificationSettings.web';

// Profile create/manage forms
import CreateProfileForm from './components/CreateProfileForm.web';
import ManageProfileForm from './components/ManageProfileForm.web';

// Org pages
import InstitutionLogin from './pages/org/InstitutionLogin.web';
import OrgInviteLanding from './pages/org/OrgInviteLanding';
import OrgHomeRouter from './pages/org/OrgHomeRouter.web';
import OrgElearnPortal from './pages/org/OrgElearnPortal';
import OrgProfilePage from './pages/org/OrgProfile.web';
import OrgLearnerHome from './pages/org/OrgLearnerHome.web';
import OrgInstructorHome from './pages/org/OrgInstructorHome.web';
import OrgExamResultsPortal from './pages/org/OrgExamResultsPortal.web';
import OrgAttendancePage from './pages/org/OrgAttendance.web';
import OrgFeesPage from './pages/org/OrgFees.web';
import OrgNewslettersPage from './pages/org/OrgNewsletters.web';
import OrgAnnouncementsPage from './pages/org/OrgAnnouncements.web';
import OrgToolsSportsPage from './pages/org/OrgToolsSports.web';
import OrgToolsClubsPage from './pages/org/OrgToolsClubs.web';
import OrgChangePassword from './pages/org/OrgChangePassword.web';
import OrgRosterPage from './pages/org/OrgRoster.web';
// OER
import OerReaderFull from './pages/OerReaderFull.web';
import OerCollectionReader from './pages/OerCollectionReader.web';

// Paystack callback pages
import PaystackCallbackWeb from '@/pages/PaystackCallback.web';
import PaystackCallbackRedirectWeb from '@/pages/PaystackCallbackRedirect.web';

import { useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { OrgGate, OrgAuthGate } from './components/org/OrgGates';

/* ───────────────────────────
   Per-user "first login" helpers
   ─────────────────────────── */
const firstLoginKey = (userId?: string | number | null, email?: string | null | undefined) =>
  `tutorapp_hasLoggedInOnce::${userId ?? email ?? 'unknown'}`;

// Treat identity as "stable" only when we have userId or a non-empty email.
// We NEVER mark the flag for the "unknown" identity to avoid poisoning first-login.
const useIdentityKey = () => {
  const { userId, userEmail } = useShopContext();
  const stable = userId != null || (typeof userEmail === 'string' && userEmail.trim().length > 0);
  const key = stable ? firstLoginKey(userId ?? null, userEmail ?? null) : firstLoginKey(null, null);
  return { key, stable };
};

const useIsFirstLogin = () => {
  const { key, stable } = useIdentityKey();
  return () => {
    if (!stable) return true; // before identity loads, assume "first" so we can route to profile
    return localStorage.getItem(key) !== 'true';
  };
};

const useMarkFirstLoginSeen = () => {
  const { key, stable } = useIdentityKey();
  return () => {
    if (stable) localStorage.setItem(key, 'true');
  };
};

/* ───────────────────────────
   Route guards
   ─────────────────────────── */
interface ProtectedRouteProps {
  children: ReactNode;
}

// accept either normal token OR orgToken
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { token, orgToken } = useShopContext() as any;
  const location = useLocation();

  const isAuthed = Boolean(token || orgToken);

  if (!isAuthed) {
    const fromPath = location.pathname || '';
    const wantsOrg = fromPath.startsWith('/org/');

    return <Navigate to={wantsOrg ? '/org/login' : '/login'} replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

// Org-only protected route: checks orgToken (not user token) and avoids first-render race
const OrgProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { orgToken, initializing } = useShopContext() as any;
  const location = useLocation();

  // wait for tokens to hydrate (no blank screen)
  if (initializing) return <Spinner />;

  if (orgToken) return <>{children}</>;

  try {
    const next = `${location.pathname}${location.search}${location.hash}`;
    sessionStorage.setItem('auth:returnTo', next);
  } catch {}

  return <Navigate to="/org/login" replace state={{ from: location }} />;
};


/* Enforce first-login redirect inside protected area (general app) */
const FirstLoginGate: React.FC = () => {
  const { token, userId, userEmail } = useShopContext();
  const location = useLocation();
  const isFirstLogin = useIsFirstLogin();
  const markSeen = useMarkFirstLoginSeen();

  if (!token) return null;

  const path = location.pathname;

  // Allowlist: never gate the profile & settings pages themselves
  if (path.startsWith('/profile/me') || path.startsWith('/settings/')) {
    return null;
  }

  // Only gate once identity is stable (prevents bounce before context loads)
  const identityStable =
    userId != null || (typeof userEmail === 'string' && userEmail.trim().length > 0);

  if (!identityStable) {
    // Identity not ready—do nothing instead of redirecting
    return null;
  }

  if (isFirstLogin()) {
    markSeen();
    return <Navigate to="/profile/me" replace />;
  }

  return null;
};

/* Root landing: decide "/" after auth */
const RootLandingOrHome: React.FC = () => {
  const { token } = useShopContext();
  const isFirstLogin = useIsFirstLogin();
  const markSeen = useMarkFirstLoginSeen();

  if (!token) return <Landing />;

  const first = isFirstLogin();
  if (first) {
    markSeen();
    return <Navigate to="/profile/me" replace />;
  }
  return <Navigate to="/home" replace />;
};

/* If already logged in, bounce away from /login appropriately
   allow explicit switch via ?switch=1 or ?force=1 */
const LoggedOutOnly: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { token } = useShopContext();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const switching = params.get('switch') === '1' || params.get('force') === '1';

  const isFirstLogin = useIsFirstLogin();
  const markSeen = useMarkFirstLoginSeen();

  // If not logged in OR explicitly switching, render the login page
  if (!token || switching) return <>{children}</>;

  // if we have a saved deep link (e.g., /org/join/:code or a robot link),
  // honor that FIRST so invite flows return to the landing page.
  const returnTo = (() => {
    try {
      return sessionStorage.getItem('auth:returnTo') || '';
    } catch {
      return '';
    }
  })();

  if (returnTo && (returnTo.startsWith('/org/join/') || /[?&]assignmentId=/.test(returnTo))) {
    return <Navigate to={returnTo} replace />;
  }

  // Existing behavior
  const first = isFirstLogin();
  if (first) {
    markSeen();
    return <Navigate to="/profile/me" replace />;
  }
  return <Navigate to="/home" replace />;
};

/* Layout wrappers */
const ProtectedLayout: React.FC = () => (
  <ProtectedRoute>
    <FirstLoginGate />
    <SiteLayout />
  </ProtectedRoute>
);


const OrgAuthOnlyLayout: React.FC = () => (
  <OrgAuthGate>
    <SiteLayout />
  </OrgAuthGate>
);

const OrgProtectedLayout: React.FC = () => (
  <OrgAuthGate>
    <OrgGate>
      <SiteLayout />
    </OrgGate>
  </OrgAuthGate>
);

/* Org admin-only guard for /org/profile (and other admin-only tools) */

// ✅ Fees-access guard: only the designated instructor with can_access_fees
const OrgFeesAccessRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, membership, org, loading, isLoading } = (useOrg?.() ?? {}) as any;
  const location = useLocation();

  const busy = typeof loading === 'boolean' ? loading : isLoading;
  if (busy || !role) return null;

  const roleLower = String(role || '').toLowerCase();
  const primaryMembership = Array.isArray(membership) ? membership[0] : membership;

  const tierLower = String(org?.tier || '').toLowerCase();
  const isProTier = tierLower === 'pro' || tierLower === 'enterprise';

  const hasFeeAccess =
    isProTier && roleLower === 'instructor' && primaryMembership?.can_access_fees === true;

  if (hasFeeAccess) return <>{children}</>;

  // Redirects (keep it simple + predictable)
  const isLearner = roleLower === 'learner' || roleLower === 'student';
  if (isLearner) return <Navigate to="/org/learn" replace state={{ from: location }} />;

  // Staff but no fee access → back to instructor home (or portal tools)
  return <Navigate to="/org/instructor" replace state={{ from: location }} />;
};


/* Staff-only guard (owner/admin/instructor) */
const OrgStaffOnlyRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, loading, isLoading } = (useOrg?.() ?? {}) as any;
  const location = useLocation();
  const busy = typeof loading === 'boolean' ? loading : isLoading;

  if (busy || !role) return null;

  const normalizedRole = String(role || '').toLowerCase();
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';

  if (isOrgAdmin || isInstructor) return <>{children}</>;

  if (isLearner) return <Navigate to="/org/learn" replace state={{ from: location }} />;

  return <Navigate to="/org/login" replace state={{ from: location }} />;
};

const OrgAdminOnlyRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, loading, isLoading } = (useOrg?.() ?? {}) as any;
  const location = useLocation();
  const busy = typeof loading === 'boolean' ? loading : isLoading;

  if (busy || !role) return null; // wait until role is known

  const normalizedRole = String(role || '').toLowerCase();
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';

  if (isOrgAdmin) return <>{children}</>;

  // Block cross-access:
  if (isInstructor) return <Navigate to="/org/instructor" replace state={{ from: location }} />;
  if (isLearner) return <Navigate to="/org/learn" replace state={{ from: location }} />;

  // Unknown / weird → safest is org login
  return <Navigate to="/org/login" replace state={{ from: location }} />;
};

/* Learner-only guard for /org/learn */
const OrgLearnerOnlyRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, loading, isLoading } = (useOrg?.() ?? {}) as any;
  const location = useLocation();
  const busy = typeof loading === 'boolean' ? loading : isLoading;

  if (busy || !role) return null;

  const normalizedRole = String(role || '').toLowerCase();
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';

  if (isLearner) return <>{children}</>;

  if (isInstructor) return <Navigate to="/org/instructor" replace state={{ from: location }} />;
  if (isOrgAdmin) return <Navigate to="/org/profile" replace state={{ from: location }} />;

  return <Navigate to="/org/login" replace state={{ from: location }} />;
};

/* Instructor-only guard for /org/instructor */
const OrgInstructorOnlyRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { role, loading, isLoading } = (useOrg?.() ?? {}) as any;
  const location = useLocation();
  const busy = typeof loading === 'boolean' ? loading : isLoading;

  if (busy || !role) return null;

  const normalizedRole = String(role || '').toLowerCase();
  const isInstructor = normalizedRole === 'instructor' || normalizedRole === 'teacher';
  const isLearner = normalizedRole === 'learner' || normalizedRole === 'student';
  const isOrgAdmin = normalizedRole === 'owner' || normalizedRole === 'admin';

  if (isInstructor) return <>{children}</>;

  if (isOrgAdmin) return <Navigate to="/org/profile" replace state={{ from: location }} />;
  if (isLearner) return <Navigate to="/org/learn" replace state={{ from: location }} />;

  return <Navigate to="/org/login" replace state={{ from: location }} />;
};

/* ───────────────────────────
   App
   ─────────────────────────── */
const App: React.FC = () => {
  const { initializing } = useShopContext();
  if (initializing) return <Spinner />;

  return (
    <>
      <Routes>
        {/* Public pages with layout */}
        <Route element={<SiteLayout />}>
          <Route path="/" element={<RootLandingOrHome />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/find-tutor" element={<FindTutor />} />
          <Route path="/robot-teach" element={<RobotTutorPage />} />

          <Route path="/refunds" element={<RefundsAndCancellations />} />
          <Route path="/fulfillment" element={<FulfillmentPolicy />} />
          <Route path="/payment-flow" element={<PaymentFlow />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />

          {/* Paystack callback (fix duplicate path bug) */}
          <Route path="/paystack/callback" element={<PaystackCallbackWeb />} />
          <Route path="/paystack/callback/redirect" element={<PaystackCallbackRedirectWeb />} />

          {/* Org public routes */}
          <Route path="/org/login" element={<InstitutionLogin />} />
          <Route path="/org/join/:code" element={<OrgInviteLanding />} />

          {/* Public content */}
          <Route path="/help" element={<HelpPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/profile/:id" element={<ProfileDetailPage />} />

          <Route path="/cookie-policy" element={<CookiePolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/anti-spam-policy" element={<AntiSpamPolicy />} />
          <Route path="/complaints-feedback" element={<ComplaintsFeedback />} />

          {/* OER */}
          <Route path="/oer/:id" element={<OerReaderFull />} />
          <Route path="/oer/collections/:id" element={<OerCollectionReader />} />

          {/* Public catalog */}
          <Route path="/courses" element={<MyCourses />} />

          {/* Public verify routes */}
          <Route path="/verify" element={<VerifyCertificatePage />} />
          <Route path="/verify/no/:certNo" element={<VerifyCertificatePage />} />
          <Route path="/verify/:id" element={<VerifyCertificatePage />} />
          <Route path="/verify/:id/print" element={<VerifyCertificatePrintPage />} />
        </Route>

        {/* Org auth-only routes (no must-change gate wrapping) */}
        <Route element={<OrgAuthOnlyLayout />}>
          <Route path="/org/change-password" element={<OrgChangePassword />} />
        </Route>


        {/* Org portal (protected; no first-login bounce) */}
        <Route element={<OrgProtectedLayout />}>
          {/* /org uses OrgHomeRouter */}
          <Route path="/org" element={<OrgHomeRouter />} />

          {/* keep portal reachable */}
          <Route path="/org/portal" element={<OrgElearnPortal />} />
         <Route path="/org/learner/newsletters" element={<OrgLearnerNewsletters />} />
        <Route path="/org/learner/newsletters/:id" element={<OrgLearnerNewsletters />} />

          <Route path="/org/learn/activities" element={<OrgLearnerSportsClubsPage />} />

          <Route
          path="/org/roster"
          element={
            <OrgAdminOnlyRoute>
              <OrgRosterPage />
            </OrgAdminOnlyRoute>
          }
        />


          {/* Admin-only profile */}
          <Route
            path="/org/profile"
            element={
              <OrgAdminOnlyRoute>
                <OrgProfilePage />
              </OrgAdminOnlyRoute>
            }
          />

          <Route
            path="/org/learn/fees"
            element={
              <OrgLearnerOnlyRoute>
                <OrgLearnerFeesPage />
              </OrgLearnerOnlyRoute>
            }
          />

          {/* Learner-only home */}
          <Route
            path="/org/learn"
            element={
              <OrgLearnerOnlyRoute>
                <OrgLearnerHome />
              </OrgLearnerOnlyRoute>
            }
          />

          {/* Instructor-only home */}
          <Route
            path="/org/instructor"
            element={
              <OrgInstructorOnlyRoute>
                <OrgInstructorHome />
              </OrgInstructorOnlyRoute>
            }
          />

          <Route path="/org/exams" element={<OrgExamResultsPortal />} />

          <Route
            path="/org/attendance"
            element={
              <OrgStaffOnlyRoute>
                <OrgAttendancePage />
              </OrgStaffOnlyRoute>
            }
          />

          {/* Fees (admin tool) */}
         <Route
            path="/org/fees/*"
            element={
              <OrgFeesAccessRoute>
                <OrgFeesPage />
              </OrgFeesAccessRoute>
            }
          />



          {/* Fees actions (wired destinations) */}
          <Route
            path="/org/fees"
            element={
              <OrgFeesAccessRoute>
                <OrgFeesPage />
              </OrgFeesAccessRoute>
            }
          />
         <Route
            path="/org/newsletters"
            element={
              <OrgAdminOnlyRoute>
                <OrgNewslettersPage />
              </OrgAdminOnlyRoute>
            }
          />

          <Route
            path="/org/announcements"
            element={
              <OrgAdminOnlyRoute>
                <OrgAnnouncementsPage />
              </OrgAdminOnlyRoute>
            }
          />
          <Route
            path="/org/tools/sports"
            element={
              <OrgStaffOnlyRoute>
                <OrgToolsSportsPage />
              </OrgStaffOnlyRoute>
            }
          />
          <Route
          path="/org/tools/clubs"
          element={
            <OrgStaffOnlyRoute>
              <OrgToolsClubsPage />
            </OrgStaffOnlyRoute>
          }
        />

          
        </Route>

        {/* Protected pages with layout (general app) */}
        <Route element={<ProtectedLayout />}>
          <Route path="/account" element={<AccountSection />} />
          <Route path="/messages" element={<Messages />} />

          <Route path="/courses/:courseId" element={<CourseDetails />} />
          <Route path="/courses/:id/edit" element={<EditCoursePage />} />

          {/* ClassVault */}
          <Route path="/class-vault/upload" element={<ClassVaultUpload />} />
          <Route path="/class-vault/:id" element={<ClassVaultDetail />} />
          <Route path="/class-vault" element={<ClassVaultList />} />

          <Route path="/results" element={<ResultsPage />} />

          {/* Enrollments */}
          <Route path="/my-courses" element={<MyEnrollmentsPage />} />

          {/* Course lifecycle */}
          <Route path="/create-course" element={<CreateCourse />} />
          <Route path="/enroll/:courseId" element={<CourseEnrollment />} />
          <Route path="/progress/:courseId" element={<CourseProgress />} />
          <Route path="/courses/:courseId/progress" element={<CourseProgress />} />

          <Route path="/achievements" element={<AchievementsList />} />

          {/* Profile (protected) */}
          <Route path="/profile/me" element={<ProfilePage />} />
          <Route path="/settings/create" element={<CreateProfileForm />} />
          <Route path="/settings/manage" element={<ManageProfileForm />} />
          <Route path="/settings/certification" element={<CertificationSettings />} />
          <Route path="/language/:courseId" element={<LanguageLearningPage />} />
        </Route>

        {/* Auth route (logged-out only) */}
        <Route
          path="/login"
          element={
            <LoggedOutOnly>
              <LoginPage />
            </LoggedOutOnly>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CookieConsentBanner />
      <AuthBusyOverlay />
    </>
  );
};

export default App;
