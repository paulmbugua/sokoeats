# Org Assignments Verification (Web + Mobile)

Use this 10–15 minute checklist to verify assignments behavior end to end.

## Web (Instructor)
- [ ] Open an assignment’s submissions/details screen (instructor/admin view), then return to the list and refresh – the assignment should show **Opened** instead of New.
- [ ] In the submissions table, the **Admission No.** column is present and populated (no student ID/email labels).
- [ ] Learner names render from profile (first/last or display name); no row shows “Unknown learner.”
- [ ] For an AI assignment, each learner row shows a **Score** (e.g., `85%`) that matches the analytics/reporting score for the same learner, plus attempts info if available.

## Mobile (Instructor)
- [ ] Open an assignment from the instructor portal panes, view submissions/details, return to the list, and refresh – the assignment shows **Opened** afterward.
- [ ] Submissions view shows **Admission No.** as the identifier, and learner names appear (no “Unknown learner”).
- [ ] For AI assignments, the submissions view shows the learner’s score consistent with analytics (and attempts count/last attempt when provided).

## Notes
- Ensure you’re signed in as an instructor/admin belonging to the org.
- Use class/subject filters consistent with the assignment scope so the correct rows appear.
- AI assignment invites should still open `/org/join/<code>` (web) or OrgInviteLanding (mobile) for learners; verify separately if needed.
