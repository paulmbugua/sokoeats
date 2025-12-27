# Certificate entitlement + quiz source-of-truth (Step 0 notes)

## Entitlement/status source
- `/api/certificates/status` resolves certificate entitlement via `getStatus` in `apps/backend/controllers/certificatesController.js`. It checks existing certificates, org coverage, purchases/enrollments, and `ai_certificate_issuances` to set `paid`, `tier`, and `canCertificate` flags. It also syncs `ai_certificate_entitlements` via `upsertAiCertificateEntitlement` when any coverage exists.

## Quiz pass knowledge
- Quiz pass data is derived from `org_quiz_attempts` joined to `org_course_assignments` (see `getStatus` and `listMyAiCourses` in `certificatesController.js`). Grading logic lives in `gradeQuiz` (`apps/backend/controllers/aiCourseController.js`), which computes pass/fail using provided answers and pass marks (default 70 or assignment-defined).

## Results/Profile population
- The Results/Profile “Purchased AI courses” list is populated by `listMyAiCourses` (`apps/backend/controllers/certificatesController.js`). It pulls `ai_certificate_entitlements` for the user (via `getEntitlementsForUser`), enriches with course metadata from `courses`, and includes completion status from the latest `org_quiz_attempts` per course. Client hook `useAiCourseEntitlements` consumes this endpoint through `listMyAiCourses` API and exposes the items to apps.
