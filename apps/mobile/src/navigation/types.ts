// apps/mobile/src/navigation/types.ts

export type ActiveTab = 'overview' | 'transactions' | 'sessions' | 'reviews' | 'earnings';

export type MainStackParamList = {
  /* Landing & Public */
  Landing: undefined;
  InviteLogin: { code: string };
  Home: undefined;
  Login: { switch?: boolean; force?: boolean } | undefined;
  Help: undefined;
  Resources: undefined;
  CookiePolicy: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  AntiSpamPolicy: undefined;
  ComplaintsFeedback: undefined;
  OerCollectionReader: { id: string };
  RefundsAndCancellations: undefined;
  Unsubscribe: { e?: string; t?: string; email?: string; token?: string } | undefined;
  FulfillmentPolicy: undefined;
  PaymentFlow: undefined;
  Videos: undefined;
  VideoCollection: { id: string | number };
  OerReaderFull: { id?: string };

  /* Verify (public) */
  VerifyCertificate: { id?: string } | undefined;
  VerifyCertificatePrint: { id?: string } | undefined;

  /* Org (public + protected in-app) */
  InstitutionLogin:
    | {
        logoutOrg?: boolean;
        force?: 'logout';
        next?: string;
      }
    | undefined;

  OrgInviteLanding: { code?: string } | undefined;

  OrgHome: { next?: string } | undefined;

  OrgLearnerHome:
    | {
        assignmentId?: string | number;
        courseId?: string | number;
        qt?: 'mcq' | 'short';
        qs?: string | number;
      }
    | undefined;

  OrgLearnerFees:
    | {
        studentId?: string | number;
        student_id?: string | number;
      }
    | undefined;

  OrgInstructorHome: undefined;

  OrgElearnPortal:
    | {
        tab?:
          | 'branding'
          | 'assign'
          | 'analytics'
          | 'tools'
          | 'fees'
          | 'sports'
          | 'clubs'
          | 'newsletters';
        from?: string;
        courseId?: string;
      }
    | undefined;

  OrgProfile: undefined;

  OrgAttendance: undefined;
  OrgFees: undefined;
  OrgNewsletters: undefined;
  OrgAnnouncements: undefined;

  OrgToolsSports: { orgId?: string } | undefined;

  // ✅ ADD these (you used them in App.tsx)
  OrgToolsClubs: undefined;
  OrgLearnerNewsletters:
  | {
      tab?: 'newsletters' | 'announcements';
      id?: string | number;  // optional: open a specific newsletter
      aid?: string | number; // optional: open a specific announcement
    }
  | undefined;

  OrgLearnerSportsClubs: { tab?: 'sports' | 'clubs' } | undefined;

  OrgExamResultsPortal:
    | { view?: 'learner' | 'admin'; studentId?: string | number | null }
    | undefined;

  /* Discovery & tutor */
  FindTutor: { subject?: string } | undefined;
  RobotTutor: undefined;

  /* Catalog & course details */
  Courses:
    | {
        view?: 'learner' | 'admin';
        studentId?: string | number;
        class?: string;
        subject?: string;
      }
    | undefined;
  CourseDetails: { courseId: string };
  CourseProgress: { courseId: string };

  /* Enrollments & lifecycle */
  MyEnrollments: undefined;
  CreateCourse: undefined;
  CourseEnrollment: { courseId: string };

  /* Achievements */
  Achievements: undefined;

  /* ClassVault */
  ClassVaultLibrary: undefined;
  ClassVaultDetail: { id: number };
  ClassVaultUpload: undefined;

  /* Profile & account */
  Account: {
    action?: 'createSession';
    tutorId?: string;
    tutorName?: string;
    subject?: string;
    pricing?: Record<string, string>;
    tab?: ActiveTab;
  };
  Profile: { id?: string } | undefined;
  ProfileSelf: undefined;
  Messages: { studentId?: string } | undefined;
  Settings: undefined;
  SettingsCreate: undefined;
  SettingsManage: undefined;
  SettingsAccount?: undefined;

  /* Payments */
  BuyTokens: undefined;

  /* Results */
  Results:
    | {
        courseId?: string;
        courseTitle?: string;
        grade?: { scorePct: number; passMark: number; passed: boolean };
      }
    | undefined;

  PaystackCallback:
    | { reference?: string; trxref?: string; paymentId?: string; kind?: string }
    | undefined;

  PaystackCheckout:
    | {
        authorizationUrl: string;
        reference: string;
        paymentId?: string;
        kind?: string;
      }
    | undefined;

  OrgChangePassword:
    | {
        returnTo?: string;
      }
    | undefined;
};
