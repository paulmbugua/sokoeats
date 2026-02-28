export type RootStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Login: undefined;
  SignUp: undefined;
  OtpVerify: { phone: string };
  Tabs: undefined;

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
  BookingConfirmed: { bookingId: string; jobId: string; quoteId: string };
};
