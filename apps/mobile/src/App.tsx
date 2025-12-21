// apps/mobile/src/App.tsx
import * as React from 'react';
import type { ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { View } from 'react-native'; // StatusBar intentionally handled by the root; none here
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStackNavigator } from '@react-navigation/stack';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';

import type { MainStackParamList } from './navigation/types';
import { useShopContext } from '@mytutorapp/shared/context';
import { useHomePage } from '@mytutorapp/shared/hooks';

// Public/org invite login
import InviteLoginScreen from './screens/InviteLoginScreen.native';
import VideosScreen from './screens/Videos.native';
// Global UI
import NavbarNative from './screens/Navbar.native';
import FooterNav from './screens/FooterNav.native';
import Spinner from './screens/Spinner.native';

// Core app screens
import HomePageNative from './screens/HomePage.native';
import LoginScreen from './screens/LoginScreen.native';
import ProfileDetailPage from './screens/ProfileDetailScreen.native';
import Messages from './screens/Messages.native';
import Settings from './screens/SettingsScreen.native';
import CreateProfileForm from './screens/CreateProfileForm.native';
import ManageProfileForm from './screens/ManageProfileForm.native';
import AccountSection from './screens/AccountSection.native';

// ClassVault
import ClassVaultListScreen from './screens/ClassVaultListScreen.native';
import ClassVaultDetailScreen from './screens/ClassVaultDetailScreen.native';
import ClassVaultUploadScreen from './screens/ClassVaultUploadScreen.native';

// Public / other screens
import Landing from './screens/Landing.native';
import RobotTutorPage from './screens/RobotTutor.native';
import FindTutor from './screens/FindTutor.native';
import RefundsAndCancellations from './screens/RefundsAndCancellations.native';
import UnsubscribePage from './screens/Unsubscribe.native';
import FulfillmentPolicy from './screens/FulfillmentPolicy.native';
import OrgElearnPortal from './screens/org/OrgElearnPortal.native';
import OrgInviteLanding from './screens/org/OrgInviteLanding.native';
import InstitutionLogin from './screens/org/InstitutionLogin.native';
import OrgProfilePage from './screens/org/OrgProfile.native';
import ResultsPage from './screens/Results.native';
import MyEnrollmentsPage from './screens/MyEnrollments.native';
import ProfileScreen from './screens/ProfileScreen.native';
import ResourcesPage from './screens/Resources.native';

// 🔗 NEW: native OER reader
import OerReaderFullNative from './screens/OerReaderFull.native';

import PrivacyPolicy from './screens/PrivacyPolicy.native';
import TermsOfService from './screens/TermsOfService.native';
import AntiSpamPolicy from './screens/AntiSpamPolicy.native';
import ComplaintsFeedback from './screens/ComplaintsFeedback.native';
import HelpPage from './screens/HelpPage.native';
import CourseDetails from './screens/CourseDetails.native';
import MyCourses from './screens/MyCourses.native';

// Course lifecycle
import CreateCourse from './screens/CreateCourse.native';
import CourseEnrollment from './screens/CourseEnrollment.native';
import CourseProgress from './screens/CourseProgress.native';
import AchievementsList from './screens/AchievementsList.native';

// Public verify views
import VerifyCertificatePage from './screens/VerifyCertificate.native';
import VerifyCertificatePrintPage from './screens/VerifyCertificatePrintScreen.native';

// Payments
import PaymentFlow from './screens/PaymentFlow.native';
import PaystackCallbackNative from './screens/PaystackCallback.native';
import PaystackCheckoutNative from './screens/PaystackCheckout.native';

// Organizations
import OrgHomeRouterNative from './screens/org/OrgHomeRouter.native';
import OrgLearnerHomeNative from './screens/org/OrgLearnerHome.native';
import OrgInstructorHomeNative from './screens/org/OrgInstructorHome.native';
import OrgExamResultsPortal from './screens/org/OrgExamResultsPortal.native'; // if you have this
import OrgChangePasswordNative from './screens/org/OrgChangePassword.native';
import OrgAttendanceNative from './screens/org/OrgAttendance.native';
import OrgFeesNative from './screens/org/OrgFees.native';
import OrgNewslettersNative from './screens/org/OrgNewsletters.native';
import OrgAnnouncementsNative from './screens/org/OrgAnnouncements.native';
import OrgToolsSportsNative from './screens/org/OrgToolsSports.native';
import OrgToolsClubsNative from './screens/org/OrgToolsClubs.native';

const Stack = createStackNavigator<MainStackParamList>();

/* ───────── First-login helpers (per identity) ───────── */
const firstLoginKey = (userId?: string | number | null, email?: string | null | undefined) =>
  `tutorapp_hasLoggedInOnce::${userId ?? email ?? 'unknown'}`;

/** Compute a stable per-user key only when we actually know identity. */
const useIdentityKey = () => {
  const { userId, userEmail, profile } = useShopContext() as any;
  const id = userId ?? profile?.id ?? null;
  const email = userEmail ?? profile?.email ?? null;
  const stable = id != null || (typeof email === 'string' && email.trim().length > 0);
  const key = firstLoginKey(id ?? null, email ?? null);
  return { key, stable };
};

/** Returns an async function that resolves to whether this is the user's first login. */
const useIsFirstLogin = () => {
  const { key, stable } = useIdentityKey();
  return React.useCallback(async () => {
    if (!stable) return true; // assume "first" before identity is known
    const v = await AsyncStorage.getItem(key);
    return v !== 'true';
  }, [key, stable]);
};

/** Returns an async function that marks the first-login flag as seen. */
const useMarkFirstLoginSeen = () => {
  const { key, stable } = useIdentityKey();
  return React.useCallback(async () => {
    if (stable) await AsyncStorage.setItem(key, 'true');
  }, [key, stable]);
};

/* ───────── Route guards ───────── */

type ProtectedRouteProps = { children: ReactNode };

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { token } = useShopContext() as any;
  if (!token) return <LoginScreen />;
  return <>{children}</>;
};

const useOrgRole = () => {
  const { role, loading, isLoading } = (useOrg() ?? {}) as any;
  const busy = typeof loading === 'boolean' ? loading : isLoading;
  const normalized = role ? String(role).toLowerCase() : '';

  const isAdmin = normalized === 'owner' || normalized === 'admin';
  const isInstructor = normalized === 'instructor' || normalized === 'teacher';
  const isLearner = normalized === 'learner' || normalized === 'student';

  return { busy, role: normalized, isAdmin, isInstructor, isLearner };
};

const OrgProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { orgToken } = useShopContext() as any;
  if (!orgToken) return <InstitutionLogin />;
  return <>{children}</>;
};

/* ───────── ORG ROLE GUARDS (native equivalents of web guards) ───────── */

const OrgAdminOnlyGuard: React.FC<ProtectedRouteProps> = ({ children }) => {
  const navigation = useNavigation<any>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  // 🔁 Redirect *after* render
  React.useEffect(() => {
    if (busy || !role) return;

    if (isInstructor) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgInstructorHome' }] });
    } else if (isLearner) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgLearnerHome' }] });
    } else if (!isAdmin) {
      navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
    }
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;

  // If admin, show the protected page
  if (isAdmin) return <>{children}</>;

  // While redirecting, render nothing
  return null;
};

const OrgLearnerOnlyGuard: React.FC<ProtectedRouteProps> = ({ children }) => {
  const navigation = useNavigation<any>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    if (isInstructor) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgInstructorHome' }] });
    } else if (isAdmin) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgProfile' }] });
    } else if (!isLearner) {
      navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
    }
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;

  if (isLearner) return <>{children}</>;

  return null;
};

const OrgInstructorOnlyGuard: React.FC<ProtectedRouteProps> = ({ children }) => {
  const navigation = useNavigation<any>();
  const { busy, role, isAdmin, isInstructor, isLearner } = useOrgRole();

  React.useEffect(() => {
    if (busy || !role) return;

    if (isLearner) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgLearnerHome' }] });
    } else if (isAdmin) {
      navigation.reset({ index: 0, routes: [{ name: 'OrgProfile' }] });
    } else if (!isInstructor) {
      navigation.reset({ index: 0, routes: [{ name: 'InstitutionLogin' }] });
    }
  }, [busy, role, isAdmin, isInstructor, isLearner, navigation]);

  if (busy || !role) return <Spinner />;

  if (isInstructor) return <>{children}</>;

  return null;
};

/* ───────── App ───────── */
const App: React.FC = () => {
  const [bootReady, setBootReady] = React.useState(false);
  const [initialRoute, setInitialRoute] = React.useState<keyof MainStackParamList>('Landing');

  const { token, initializing } = (useShopContext() as any) ?? {};

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

  if (initializing === true) return <Spinner />;
  if (!bootReady) return <Spinner />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
      {/* Always-on Navbar */}
      <NavbarNative onSearch={handleSearch} />

      {/* Main navigator content */}
      <View style={{ flex: 1 }}>
        <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
          {/* Public: Landing first */}
          <Stack.Screen name="Landing" component={Landing} />
          <Stack.Screen name="InviteLogin" component={InviteLoginScreen} />

          {/* Public / base */}
          <Stack.Screen name="Home" component={HomePageNative} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="FindTutor" component={FindTutor} />
          <Stack.Screen name="RobotTutor" component={RobotTutorPage} />
          <Stack.Screen name="Help" component={HelpPage} />
          <Stack.Screen name="Resources" component={ResourcesPage} />
          <Stack.Screen name="Videos" component={VideosScreen} />
          <Stack.Screen name="VideoCollection" component={VideosScreen} />

          {/* 🔗 NEW: unified OER reader (books + collections, doc + video) */}
          <Stack.Screen name="OerReaderFull" component={OerReaderFullNative} />

          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicy} />
          <Stack.Screen name="TermsOfService" component={TermsOfService} />
          <Stack.Screen name="AntiSpamPolicy" component={AntiSpamPolicy} />
          <Stack.Screen name="ComplaintsFeedback" component={ComplaintsFeedback} />
          <Stack.Screen name="RefundsAndCancellations" component={RefundsAndCancellations} />
          <Stack.Screen name="Unsubscribe" component={UnsubscribePage} />
          <Stack.Screen name="FulfillmentPolicy" component={FulfillmentPolicy} />
          <Stack.Screen name="PaymentFlow" component={PaymentFlow} />
          <Stack.Screen name="PaystackCheckout" component={PaystackCheckoutNative} />
          <Stack.Screen name="PaystackCallback" component={PaystackCallbackNative} />

          {/* Public verify routes */}
          <Stack.Screen name="VerifyCertificate" component={VerifyCertificatePage} />
          <Stack.Screen name="VerifyCertificatePrint" component={VerifyCertificatePrintPage} />

          {/* Org public */}
          <Stack.Screen name="InstitutionLogin" component={InstitutionLogin} />
          <Stack.Screen name="OrgInviteLanding" component={OrgInviteLanding} />

          {/* 🔁 ORG HOME ROUTER (like /org on web) */}
          <Stack.Screen name="OrgHome">
            {() => (
              <OrgProtectedRoute>
                <OrgHomeRouterNative />
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="OrgChangePassword">
            {() => (
              <OrgProtectedRoute>
                <OrgChangePasswordNative />
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Org learner home (role-guarded) */}
          <Stack.Screen name="OrgLearnerHome">
            {() => (
              <OrgProtectedRoute>
                <OrgLearnerOnlyGuard>
                  <OrgLearnerHomeNative />
                </OrgLearnerOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Org instructor home (role-guarded) */}
          <Stack.Screen name="OrgInstructorHome">
            {() => (
              <OrgProtectedRoute>
                <OrgInstructorOnlyGuard>
                  <OrgInstructorHomeNative />
                </OrgInstructorOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Org portal (shared E-learning) */}
          <Stack.Screen name="OrgElearnPortal">
            {() => (
              <OrgProtectedRoute>
                <OrgElearnPortal />
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Org profile – admin only */}
          <Stack.Screen name="OrgProfile">
            {() => (
              <OrgProtectedRoute>
                <OrgAdminOnlyGuard>
                  <OrgProfilePage />
                </OrgAdminOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Exams portal – instructor only (matches native instructor home shortcut) */}
          <Stack.Screen name="OrgExamResultsPortal">
            {() => (
              <OrgProtectedRoute>
                <OrgExamResultsPortal />
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Org pro tools */}
          <Stack.Screen name="OrgAttendance">
            {() => (
              <OrgProtectedRoute>
                <OrgInstructorOnlyGuard>
                  <OrgAttendanceNative />
                </OrgInstructorOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>
          <Stack.Screen name="OrgFees">
            {() => (
              <OrgProtectedRoute>
                <OrgAdminOnlyGuard>
                  <OrgFeesNative />
                </OrgAdminOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>
          <Stack.Screen name="OrgNewsletters">
            {() => (
              <OrgProtectedRoute>
                <OrgAdminOnlyGuard>
                  <OrgNewslettersNative />
                </OrgAdminOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>
          <Stack.Screen name="OrgAnnouncements">
            {() => (
              <OrgProtectedRoute>
                <OrgAdminOnlyGuard>
                  <OrgAnnouncementsNative />
                </OrgAdminOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>
          <Stack.Screen name="OrgToolsSports">
            {() => (
              <OrgProtectedRoute>
                <OrgInstructorOnlyGuard>
                  <OrgToolsSportsNative />
                </OrgInstructorOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>
          <Stack.Screen name="OrgToolsClubs">
            {() => (
              <OrgProtectedRoute>
                <OrgInstructorOnlyGuard>
                  <OrgToolsClubsNative />
                </OrgInstructorOnlyGuard>
              </OrgProtectedRoute>
            )}
          </Stack.Screen>

          {/* Public catalog / details */}
          <Stack.Screen name="Profile">{() => <ProfileDetailPage />}</Stack.Screen>

          <Stack.Screen name="Courses" component={MyCourses} />
          <Stack.Screen name="CourseDetails" component={CourseDetails} />

          {/* ClassVault listing (public entry; filtered UI inside) */}
          <Stack.Screen name="ClassVaultLibrary">
            {() => {
              const classVaultFilters = React.useMemo(
                () => ({
                  category: (uiFilters as any)?.videoCategory ?? (uiFilters as any)?.category,
                  ageGroup: (uiFilters as any)?.videoAgeGroup ?? (uiFilters as any)?.ageGroup,
                }),
                [uiFilters]
              );

              return (
                <ClassVaultListScreen filters={classVaultFilters} clearFilters={clearFilters} />
              );
            }}
          </Stack.Screen>

          <Stack.Screen name="ClassVaultDetail" component={ClassVaultDetailScreen} />

          {/* Protected Sections (user token) */}
          <Stack.Screen name="ProfileSelf">
            {() => (
              <ProtectedRoute>
                <ProfileScreen />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="Account">
            {() => (
              <ProtectedRoute>
                <AccountSection />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="Messages">
            {() => (
              <ProtectedRoute>
                <Messages />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="Settings">
            {() => (
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="SettingsCreate">
            {() => (
              <ProtectedRoute>
                <CreateProfileForm />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="SettingsManage">
            {() => (
              <ProtectedRoute>
                <ManageProfileForm />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="ClassVaultUpload">
            {() => (
              <ProtectedRoute>
                <ClassVaultUploadScreen />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="MyEnrollments">
            {() => (
              <ProtectedRoute>
                <MyEnrollmentsPage />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="CreateCourse">
            {() => (
              <ProtectedRoute>
                <CreateCourse />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="CourseEnrollment">
            {() => (
              <ProtectedRoute>
                <CourseEnrollment />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="CourseProgress">
            {() => (
              <ProtectedRoute>
                <CourseProgress />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="Achievements">
            {() => (
              <ProtectedRoute>
                <AchievementsList />
              </ProtectedRoute>
            )}
          </Stack.Screen>

          <Stack.Screen name="Results">
            {() => (
              <ProtectedRoute>
                <ResultsPage />
              </ProtectedRoute>
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </View>

      {/* Bottom overlay footer */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
        }}
      >
        <FooterNav aiRouteName="RobotTutor" homeRouteName="Home" profileRouteName="ProfileSelf" />
      </View>
    </SafeAreaView>
  );
};

export default App;
