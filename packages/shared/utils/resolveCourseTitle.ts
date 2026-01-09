export type CourseTitleResolveInput = {
  routeTitle?: unknown;          // from URL params or RN route params
  inviteMeta?: any;              // resolveOrgInvite data
  assignmentMeta?: any;          // useOrgAssignment().meta
  selectedCourseTitle?: unknown; // selectedCourse?.title
  customTitle?: unknown;         // customTitle (Teach me)
  fallback?: string;
};

export function pickTitle(...vals: unknown[]): string {
  for (const v of vals) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return '';
}

export function resolveCourseTitleInfo(input: CourseTitleResolveInput) {
  const {
    routeTitle,
    inviteMeta,
    assignmentMeta,
    selectedCourseTitle,
    customTitle,
    fallback = 'Assigned Course',
  } = input;

  // Invite meta shapes (public invite resolve)
  const fromInvite = pickTitle(
    inviteMeta?.title_override,
    inviteMeta?.course_title,
    inviteMeta?.courseTitle,
    inviteMeta?.assignment?.title_override,
    inviteMeta?.assignment?.course_title,
    inviteMeta?.assignment?.courseTitle,
    inviteMeta?.assignment_title,
    inviteMeta?.assignment?.title,
    inviteMeta?.title
  );

  // Assignment meta shapes (authenticated “/mine” meta)
  const fromAssignment = pickTitle(
    assignmentMeta?.title_override,
    assignmentMeta?.course_title,
    assignmentMeta?.courseTitle,
    assignmentMeta?.assignment_title,
    assignmentMeta?.title
  );

  const fromRoute = pickTitle(routeTitle);
  const fromSelected = pickTitle(selectedCourseTitle);
  const fromCustom = pickTitle(customTitle);

  const title =
    fromRoute || fromInvite || fromAssignment || fromSelected || fromCustom || fallback;

  const source =
    fromRoute
      ? 'route'
      : fromInvite
        ? 'invite_meta'
        : fromAssignment
          ? 'assignment_meta'
          : fromSelected
            ? 'selected_course'
            : fromCustom
              ? 'custom_title'
              : 'fallback';

  return { title, source };
}
