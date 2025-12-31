// apps/mobile/src/App.tsx
import * as React from 'react';
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';


import type { MainStackParamList } from './navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { useHomePage } from '@mytutorapp/shared/hooks';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

/* ─────────────────────────────────────────────────────────
 * Global UI
 * ───────────────────────────────────────────────────────── */
import NavbarNative from './screens/Navbar.native';
import FooterNav from './screens/FooterNav.native';
import Spinner from './screens/Spinner.native';

/* ─────────────────────────────────────────────────────────
 * Public / Core
 * ───────────────────────────────────────────────────────── */
import Landing from './screens/Landing.native';
import HomePageNative from './screens/HomePage.native';
import LoginScreen from './screens/LoginScreen.native';
import FindTutor from './screens/FindTutor.native';
import RobotTutorPage from './screens/RobotTutor.native';
import HelpPage from './screens/HelpPage.native';
import ResourcesPage from './screens/Resources.native';
import VideosScreen from './screens/Videos.native';

/* ─────────────────────────────────────────────────────────
 * Policy / Other public
 * ───────────────────────────────────────────────────────── */
import PrivacyPolicy from './screens/PrivacyPolicy.native';
import TermsOfService from './screens/TermsOfService.native';
import AntiSpamPolicy from './screens/AntiSpamPolicy.native';
import ComplaintsFeedback from './screens/ComplaintsFeedback.native';
import RefundsAndCancellations from './screens/RefundsAndCancellations.native';
import UnsubscribePage from './screens/Unsubscribe.native';
import FulfillmentPolicy from './screens/FulfillmentPolicy.native';

/* ─────────────────────────────────────────────────────────
 * OER
 * ───────────────────────────────────────────────────────── */
import OerReaderFullNative from './screens/OerReaderFull.native';

/* ─────────────────────────────────────────────────────────
 * Profile / Account (protected)
 * ───────────────────────────────────────────────────────── */
import ProfileScreen from './screens/ProfileScreen.native';
import ProfileDetailPage from './screens/ProfileDetailScreen.native';
import Messages from './screens/Messages.native';
import Settings from './screens/SettingsScreen.native';
import CreateProfileForm from './screens/CreateProfileForm.native';
import ManageProfileForm from './screens/ManageProfileForm.native';
import AccountSection from './screens/AccountSection.native';

/* ─────────────────────────────────────────────────────────
 * Courses / Achievements (protected)
 * ───────────────────────────────────────────────────────── */
import MyEnrollmentsPage from './screens/MyEnrollments.native';
import MyCourses from './screens/MyCourses.native';
import CourseDetails from './screens/CourseDetails.native';
import CreateCourse from './screens/CreateCourse.native';
import CourseEnrollment from './screens/CourseEnrollment.native';
import CourseProgress from './screens/CourseProgress.native';
import AchievementsList from './screens/AchievementsList.native';
import ResultsPage from './screens/Results.native';

/* ─────────────────────────────────────────────────────────
 * ClassVault
 * ───────────────────────────────────────────────────────── */
import ClassVaultListScreen from './screens/ClassVaultListScreen.native';
import ClassVaultDetailScreen from './screens/ClassVaultDetailScreen.native';
import ClassVaultUploadScreen from './screens/ClassVaultUploadScreen.native';

/* ─────────────────────────────────────────────────────────
 * Verify (public)
 * ───────────────────────────────────────────────────────── */
import VerifyCertificatePage from './screens/VerifyCertificate.native';
import VerifyCertificatePrintPage from './screens/VerifyCertificatePrintScreen.native';

/* ─────────────────────────────────────────────────────────
 * Payments
 * ───────────────────────────────────────────────────────── */
import PaymentFlow from './screens/PaymentFlow.native';
import PaystackCallbackNative from './screens/PaystackCallback.native';
import PaystackCheckoutNative from './screens/PaystackCheckout.native';

/* ─────────────────────────────────────────────────────────
 * Org
 * ───────────────────────────────────────────────────────── */
import InstitutionLogin from './screens/org/InstitutionLogin.native';
import OrgInviteLanding from './screens/org/OrgInviteLanding.native';
import OrgHomeRouterNative from './screens/org/OrgHomeRouter.native';

import OrgProfilePage from './screens/org/OrgProfile.native';
import OrgElearnPortal from './screens/org/OrgElearnPortal.native';
import OrgLearnerHomeNative from './screens/org/OrgLearnerHome.native';
import OrgLearnerFeesNative from './screens/org/OrgLearnerFees.native';
import OrgInstructorHomeNative from './screens/org/OrgInstructorHome.native';

import OrgExamResultsPortal from './screens/org/OrgExamResultsPortal.native';
import OrgChangePasswordNative from './screens/org/OrgChangePassword.native';
import OrgRosterScreenNative from './screens/org/OrgRoster.native';

import OrgAttendanceNative from './screens/org/OrgAttendance.native';
import OrgFeesNative from './screens/org/OrgFees.native';
import OrgNewslettersNative from './screens/org/OrgNewsletters.native';
import OrgAnnouncementsNative from './screens/org/OrgAnnouncements.native';
import OrgToolsSportsNative from './screens/org/OrgToolsSports.native';
import OrgToolsClubsNative from './screens/org/OrgToolsClubs.native';

import OrgLearnerNewslettersNative from './screens/org/OrgLearnerNewsletters.native';
import OrgLearnerSportsClubsNative from './screens/org/OrgLearnerSportsClubs.native';

const Stack = createStackNavigator<MainStackParamList>();

/* ─────────────────────────────────────────────────────────
 * Minimal local typings (avoids `any`)
 * ───────────────────────────────────────────────────────── */
type ShopProfile = { id?: string | number; email?: string | null };
type ShopCtx = {
  token?: string | null;
  orgToken?: string | null;
  initializing?: boolean;
  userId?: string | number | null;
  userEmail?: string | null;
  profile?: ShopProfile | null;
};

type OrgState = {
  role?: string | null;
  loading?: boolean;
  isLoading?: boolean;
};

/* ─────────────────────────────────────────────────────────
 * First-login helpers (per identity)
 * ───────────────────────────────────────────────────────── */
const firstLoginKey = (userId?: string | number | null, email?: string | null | undefined) =>
  `tutorapp_hasLoggedInOnce::${userId ?? email ?? 'unknown'}`;

function useIdentityKey() {
  const ctx = useShopContext() as unknown as ShopCtx;
  const id = ctx.userId ?? ctx.profile?.id ?? null;
  const email = ctx.userEmail ?? ctx.profile?.email ?? null;

  const stable = id != null || (typeof email === 'string' && email.trim().length > 0);
  const key = firstLoginKey(id ?? null, email ?? null);

  return { key, stable };
}

function useIsFirstLogin() {
  const { key, stable } = useIdentityKey();
  return React.useCallback(async () => {
    if (!stable) return true;
    const v = await AsyncStorage.getItem(key);
    return v !== 'true';
  }, [key, stable]);
}

function useMarkFirstLoginSeen() {
  const { key, stable } = useIdentityKey();
  return React.useCallback(async () => {
    if (stable) await AsyncStorage.setItem(key, 'true');
  }, [key, stable]);
}

/* ─────────────────────────────────────────────────────────
 * Guards
 * ───────────────────────────────────────────────────────── */
type GuardProps = { children: ReactNode };

function ProtectedRoute({ children }: GuardProps) {
  const { token } = useShopContext() as unknown as ShopCtx;
  if (!token) return <LoginScreen />;
  return <>{children}</>;
}

function OrgProtectedRoute({ children }: GuardProps) {
  const { orgToken } = useShopContext() as unknown as ShopCtx;
  if (!orgToken) return <InstitutionLogin />;
  return <>{children}</>;
}

function useOrgRole() {
  const org = (useOrg() ?? {}) as unknown as OrgState;
  const busy = typeof org.loading === 'boolean' ? org.loading : org.isLoading;
  const normalized = org.role ? String(org.role).toLowerCase() : '';

  const isAdmin = normalized === 'owner' || normalized === 'admin';
  const isInstructor = normalized === 'instructor' || normalized === 'teacher';
  const isLearner = normalized === 'learner' || normalized === 'student';

  return { busy: Boolean(busy), role: normalized, isAdmin, isInstructor, isLearner };
}

function OrgAdminOnlyGuard({ children }: GuardProps) {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    if (isInstructor) navigation.reset({ index: 0, routes: [{ name: 'OrgInstructorHome' }] });
    else if (isLearner) navigation.reset({ index: 0, routes: [{ name: 'OrgLearnerHome' }] });
    else if (!isAdmin) navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;
  if (isAdmin) return <>{children}</>;
  return null;
}

function OrgLearnerOnlyGuard({ children }: GuardProps) {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    if (isInstructor) navigation.reset({ index: 0, routes: [{ name: 'OrgInstructorHome' }] });
    else if (isAdmin) navigation.reset({ index: 0, routes: [{ name: 'OrgProfile' }] });
    else if (!isLearner) navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;
  if (isLearner) return <>{children}</>;
  return null;
}

function OrgInstructorOnlyGuard({ children }: GuardProps) {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    if (isLearner) navigation.reset({ index: 0, routes: [{ name: 'OrgLearnerHome' }] });
    else if (isAdmin) navigation.reset({ index: 0, routes: [{ name: 'OrgProfile' }] });
    else if (!isInstructor) navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;
  if (isInstructor) return <>{children}</>;
  return null;
}

/* ─────────────────────────────────────────────────────────
 * Helpers (ClassVault filters) — IMPORTANT: outside App component
 * ───────────────────────────────────────────────────────── */
function toStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const xs = v.map(String).map((s) => s.trim()).filter(Boolean);
    return xs.length ? xs : undefined;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s ? [s] : undefined;
  }
  return undefined;
}

type ClassVaultUiFilters = {
  videoCategory?: unknown;
  category?: unknown;
  videoAgeGroup?: unknown;
  ageGroup?: unknown;
};

type ClassVaultLibraryProps = {
  uiFilters: unknown;
  clearFilters: () => void;
};

function ClassVaultLibraryScreen({ uiFilters, clearFilters }: ClassVaultLibraryProps) {
  const filters = React.useMemo(() => {
    const f = uiFilters as ClassVaultUiFilters;
    return {
      category: toStringArray(f.videoCategory ?? f.category),
      ageGroup: toStringArray(f.videoAgeGroup ?? f.ageGroup),
    };
  }, [uiFilters]);

  return <ClassVaultListScreen filters={filters} clearFilters={clearFilters} />;
}

function OrgStaffGuard({ children }: GuardProps) {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    // Learners shouldn't access staff tools
    if (isLearner) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgLearnerHome' }] });
      return;
    }

    // Not staff? kick to login
    if (!(isAdmin || isInstructor)) {
      navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
    }
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;
  if (isAdmin || isInstructor) return <>{children}</>;
  return null;
}


/* ─────────────────────────────────────────────────────────
 * Screen wrappers (named)
 * ───────────────────────────────────────────────────────── */
function OrgHomeScreen() {
  return (
    <OrgProtectedRoute>
      <OrgHomeRouterNative />
    </OrgProtectedRoute>
  );
}
function OrgChangePasswordScreen() {
  return (
    <OrgProtectedRoute>
      <OrgChangePasswordNative />
    </OrgProtectedRoute>
  );
}
function OrgLearnerHomeScreen() {
  return (
    <OrgProtectedRoute>
      <OrgLearnerOnlyGuard>
        <OrgLearnerHomeNative />
      </OrgLearnerOnlyGuard>
    </OrgProtectedRoute>
  );
}
function OrgLearnerFeesScreen() {
  return (
    <OrgProtectedRoute>
      <OrgLearnerOnlyGuard>
        <OrgLearnerFeesNative />
      </OrgLearnerOnlyGuard>
    </OrgProtectedRoute>
  );
}
function OrgInstructorHomeScreen() {
  return (
    <OrgProtectedRoute>
      <OrgInstructorOnlyGuard>
        <OrgInstructorHomeNative />
      </OrgInstructorOnlyGuard>
    </OrgProtectedRoute>
  );
}
function OrgElearnPortalScreen() {
  return (
    <OrgProtectedRoute>
      <OrgElearnPortal />
    </OrgProtectedRoute>
  );
}
function OrgProfileScreen() {
  return (
    <OrgProtectedRoute>
      <OrgAdminOnlyGuard>
        <OrgProfilePage />
      </OrgAdminOnlyGuard>
    </OrgProtectedRoute>
  );
}

function OrgRosterScreen() {
  return (
    <OrgProtectedRoute>
      <OrgAdminOnlyGuard>
        <OrgRosterScreenNative />
      </OrgAdminOnlyGuard>
    </OrgProtectedRoute>
  );
}


function OrgExamResultsPortalScreen() {
  const route = useRoute<RouteProp<MainStackParamList, 'OrgExamResultsPortal'>>();
  const view = route.params?.view;

  // learner view should allow learners; staff view stays staff-only
  const GuardComp = view === 'learner' ? OrgLearnerOnlyGuard : OrgStaffGuard;

  return (
    <OrgProtectedRoute>
      <GuardComp>
        <OrgExamResultsPortal />
      </GuardComp>
    </OrgProtectedRoute>
  );
}

function OrgAttendanceScreen() {
  return (
    <OrgProtectedRoute>
      <OrgStaffGuard>
        <OrgAttendanceNative />
      </OrgStaffGuard>
    </OrgProtectedRoute>
  );
}

function OrgFeesScreen() {
  return (
    <OrgProtectedRoute>
      <OrgStaffGuard>
        <OrgFeesNative />
      </OrgStaffGuard>
    </OrgProtectedRoute>
  );
}

function OrgNewslettersScreen() {
  return (
    <OrgProtectedRoute>
      <OrgAdminOnlyGuard>
        <OrgNewslettersNative />
      </OrgAdminOnlyGuard>
    </OrgProtectedRoute>
  );
}
function OrgAnnouncementsScreen() {
  return (
    <OrgProtectedRoute>
      <OrgAdminOnlyGuard>
        <OrgAnnouncementsNative />
      </OrgAdminOnlyGuard>
    </OrgProtectedRoute>
  );
}
function OrgToolsSportsScreen() {
  return (
    <OrgProtectedRoute>
      <OrgStaffGuard>
        <OrgToolsSportsNative />
      </OrgStaffGuard>
    </OrgProtectedRoute>
  );
}

function OrgToolsClubsScreen() {
  return (
    <OrgProtectedRoute>
      <OrgStaffGuard>
        <OrgToolsClubsNative />
      </OrgStaffGuard>
    </OrgProtectedRoute>
  );
}

function ProfileSelfScreen() {
  return (
    <ProtectedRoute>
      <ProfileScreen />
    </ProtectedRoute>
  );
}
function AccountScreen() {
  return (
    <ProtectedRoute>
      <AccountSection />
    </ProtectedRoute>
  );
}
function MessagesScreen() {
  return (
    <ProtectedRoute>
      <Messages />
    </ProtectedRoute>
  );
}
function SettingsScreen() {
  return (
    <ProtectedRoute>
      <Settings />
    </ProtectedRoute>
  );
}
function SettingsCreateScreen() {
  return (
    <ProtectedRoute>
      <CreateProfileForm />
    </ProtectedRoute>
  );
}
function SettingsManageScreen() {
  return (
    <ProtectedRoute>
      <ManageProfileForm />
    </ProtectedRoute>
  );
}
function ClassVaultUploadProtectedScreen() {
  return (
    <ProtectedRoute>
      <ClassVaultUploadScreen />
    </ProtectedRoute>
  );
}

function MyEnrollmentsScreen() {
  return (
    <ProtectedRoute>
      <MyEnrollmentsPage />
    </ProtectedRoute>
  );
}
function CreateCourseScreen() {
  return (
    <ProtectedRoute>
      <CreateCourse />
    </ProtectedRoute>
  );
}
function CourseEnrollmentScreen() {
  return (
    <ProtectedRoute>
      <CourseEnrollment />
    </ProtectedRoute>
  );
}
function CourseProgressScreen() {
  return (
    <ProtectedRoute>
      <CourseProgress />
    </ProtectedRoute>
  );
}
function AchievementsScreen() {
  return (
    <ProtectedRoute>
      <AchievementsList />
    </ProtectedRoute>
  );
}
function ResultsScreen() {
  return (
    <ProtectedRoute>
      <ResultsPage />
    </ProtectedRoute>
  );
}

/* ─────────────────────────────────────────────────────────
 * App
 * ───────────────────────────────────────────────────────── */
const App: React.FC = () => {
  // ✅ hooks first (no early returns before all hooks)
  const [bootReady, setBootReady] = React.useState(false);
  const [initialRoute, setInitialRoute] = React.useState<keyof MainStackParamList>('Landing');

  const { token, initializing } = (useShopContext() as unknown as ShopCtx) ?? {};
  const isFirstLogin = useIsFirstLogin();
  const markSeen = useMarkFirstLoginSeen();
  const { uiFilters, handleSearch, clearFilters } = useHomePage();

  React.useEffect(() => {
    let mounted = true;

    const decide = async () => {
      if (!mounted) return;

      if (!token) {
        setInitialRoute('Landing');
        setBootReady(true);
        return;
      }

      const first = await isFirstLogin();
      if (first) await markSeen();

      setInitialRoute(first ? 'ProfileSelf' : 'Home');
      setBootReady(true);
    };

    void decide();
    return () => {
      mounted = false;
    };
  }, [token, isFirstLogin, markSeen]);

  // ✅ early returns AFTER hooks
  if (initializing === true) return <Spinner />;
  if (!bootReady) return <Spinner />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.flex1}>
      <NavbarNative onSearch={handleSearch} />

      <View style={styles.flex1}>
        <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
          {/* Public */}
          <Stack.Screen name="Landing" component={Landing} />
          <Stack.Screen name="Home" component={HomePageNative} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="FindTutor" component={FindTutor} />
          <Stack.Screen name="RobotTutor" component={RobotTutorPage} />
          <Stack.Screen name="Help" component={HelpPage} />
          <Stack.Screen name="Resources" component={ResourcesPage} />
          <Stack.Screen name="Videos" component={VideosScreen} />
          <Stack.Screen name="VideoCollection" component={VideosScreen} />
          <Stack.Screen name="OerReaderFull" component={OerReaderFullNative} />

          {/* Policies */}
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
          <Stack.Screen name="TermsOfService" component={TermsOfService} />
          <Stack.Screen name="AntiSpamPolicy" component={AntiSpamPolicy} />
          <Stack.Screen name="ComplaintsFeedback" component={ComplaintsFeedback} />
          <Stack.Screen name="RefundsAndCancellations" component={RefundsAndCancellations} />
          <Stack.Screen name="Unsubscribe" component={UnsubscribePage} />
          <Stack.Screen name="FulfillmentPolicy" component={FulfillmentPolicy} />

          {/* Payments */}
          <Stack.Screen name="PaymentFlow" component={PaymentFlow} />
          <Stack.Screen name="PaystackCheckout" component={PaystackCheckoutNative} />
          <Stack.Screen name="PaystackCallback" component={PaystackCallbackNative} />

          {/* Verify */}
          <Stack.Screen name="VerifyCertificate" component={VerifyCertificatePage} />
          <Stack.Screen name="VerifyCertificatePrint" component={VerifyCertificatePrintPage} />

          {/* Org public */}
          <Stack.Screen name="InstitutionLogin" component={InstitutionLogin} />
          <Stack.Screen name="OrgInviteLanding" component={OrgInviteLanding} />
          <Stack.Screen name="OrgLearnerNewsletters" component={OrgLearnerNewslettersNative} />
          <Stack.Screen name="OrgLearnerSportsClubs" component={OrgLearnerSportsClubsNative} />

          {/* Org protected */}
          <Stack.Screen name="OrgHome" component={OrgHomeScreen} />
          <Stack.Screen name="OrgChangePassword" component={OrgChangePasswordScreen} />
          <Stack.Screen name="OrgLearnerHome" component={OrgLearnerHomeScreen} />
          <Stack.Screen name="OrgLearnerFees" component={OrgLearnerFeesScreen} />
          <Stack.Screen name="OrgInstructorHome" component={OrgInstructorHomeScreen} />
          <Stack.Screen name="OrgElearnPortal" component={OrgElearnPortalScreen} />
          <Stack.Screen name="OrgProfile" component={OrgProfileScreen} />
          <Stack.Screen name="OrgRoster" component={OrgRosterScreen} />
          <Stack.Screen name="OrgExamResultsPortal" component={OrgExamResultsPortalScreen} />
          <Stack.Screen name="OrgAttendance" component={OrgAttendanceScreen} />
          <Stack.Screen name="OrgFees" component={OrgFeesScreen} />
          <Stack.Screen name="OrgNewsletters" component={OrgNewslettersScreen} />
          <Stack.Screen name="OrgAnnouncements" component={OrgAnnouncementsScreen} />
          <Stack.Screen name="OrgToolsSports" component={OrgToolsSportsScreen} />
          <Stack.Screen name="OrgToolsClubs" component={OrgToolsClubsScreen} />

          {/* Public profile/catalog */}
          <Stack.Screen name="Profile" component={ProfileDetailPage} />
          <Stack.Screen name="Courses" component={MyCourses} />
          <Stack.Screen name="CourseDetails" component={CourseDetails} />

          {/* ClassVault */}
          <Stack.Screen name="ClassVaultLibrary">
            {() => (
              <ClassVaultLibraryScreen uiFilters={uiFilters} clearFilters={clearFilters} />
            )}
          </Stack.Screen>
          <Stack.Screen name="ClassVaultDetail" component={ClassVaultDetailScreen} />
          <Stack.Screen name="ClassVaultUpload" component={ClassVaultUploadProtectedScreen} />

          {/* User protected */}
          <Stack.Screen name="ProfileSelf" component={ProfileSelfScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="Messages" component={MessagesScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="SettingsCreate" component={SettingsCreateScreen} />
          <Stack.Screen name="SettingsManage" component={SettingsManageScreen} />

          <Stack.Screen name="MyEnrollments" component={MyEnrollmentsScreen} />
          <Stack.Screen name="CreateCourse" component={CreateCourseScreen} />
          <Stack.Screen name="CourseEnrollment" component={CourseEnrollmentScreen} />
          <Stack.Screen name="CourseProgress" component={CourseProgressScreen} />
          <Stack.Screen name="Achievements" component={AchievementsScreen} />
          <Stack.Screen name="Results" component={ResultsScreen} />
        </Stack.Navigator>
      </View>

      <View pointerEvents="box-none" style={styles.footerOverlay}>
        <FooterNav aiRouteName="RobotTutor" homeRouteName="Home" profileRouteName="ProfileSelf" />
      </View>
    </SafeAreaView>
  );
};

export default App;

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  footerOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 50,
  },
});
