export type RootStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  OtpVerify: { phone: string; purpose?: 'phone_verification' | 'password_reset' | 'login'; twoFactorToken?: string; userId?: string | number; initialChallenge?: any; deliveryMethod?: 'sms' | 'email' };
  Tabs: undefined;
  CompleteProfile: undefined;

  CategorySelect: undefined;
  TaskSelect: { categoryId: number; categoryName: string };
  DescribeIssue: { categoryId: number; categoryName: string; serviceId: number; serviceName: string };
  PhotoUpload: { draft: any };
  LocationSelect: { draft: any };
  ScheduleSelect: { draft: any };
  JobDetails: { draft: any };
  ReviewRequest: { draft: any };
  RequestSubmitted: { jobId: string };

  QuotesInbox: { jobId: string };
  QuoteDetail: { quoteId: string };
  Conversation: { conversationId: string; name: string };
  SubmitQuote: { job: any; quote?: any };
  HandymanLocation: undefined;
  ProviderCommissionPayment: undefined;
  BookingConfirmed: { bookingId: string; jobId: string; quoteId: string };
  PaystackCheckout: {
    authorizationUrl: string;
    reference: string;
    kind?: 'tokens' | 'org' | 'booking' | string;
    paymentId?: string | number;
    bookingId?: string;
    jobId?: string;
    quoteId?: string;
  };
  PaystackCallback: {
    reference?: string;
    trxref?: string;
    kind?: 'tokens' | 'org' | 'booking' | string;
    paymentId?: string | number;
    bookingId?: string;
    jobId?: string;
    quoteId?: string;
  };
};

export type MainStackParamList = RootStackParamList;

