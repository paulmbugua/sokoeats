export type TutorFilters = {
  subject: string;
  gradeBand: string;
  country: string;
  minRating: number;
};

export const DEFAULT_TUTOR_FILTERS: TutorFilters = {
  subject: '',
  gradeBand: '',
  country: '',
  minRating: 0,
};
