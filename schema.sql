--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9
-- Dumped by pg_dump version 16.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE ONLY public.tutor_sessions DROP CONSTRAINT tutor_sessions_tutor_id_fkey;
ALTER TABLE ONLY public.tutor_sessions DROP CONSTRAINT tutor_sessions_student_id_fkey;
ALTER TABLE ONLY public.transcripts DROP CONSTRAINT transcripts_student_id_fkey;
ALTER TABLE ONLY public.transactions DROP CONSTRAINT transactions_user_id_fkey;
ALTER TABLE ONLY public.session_participants DROP CONSTRAINT session_participants_session_id_fkey;
ALTER TABLE ONLY public.reviews DROP CONSTRAINT reviews_tutor_id_fkey;
ALTER TABLE ONLY public.reviews DROP CONSTRAINT reviews_student_id_fkey;
ALTER TABLE ONLY public.reviews DROP CONSTRAINT reviews_session_id_fkey;
ALTER TABLE ONLY public.recorded_videos DROP CONSTRAINT recorded_videos_tutor_id_fkey;
ALTER TABLE ONLY public.recorded_video_reviews DROP CONSTRAINT recorded_video_reviews_video_id_fkey;
ALTER TABLE ONLY public.recorded_video_reviews DROP CONSTRAINT recorded_video_reviews_student_id_fkey;
ALTER TABLE ONLY public.quizzes DROP CONSTRAINT quizzes_course_id_fkey;
ALTER TABLE ONLY public.quiz_attempts DROP CONSTRAINT quiz_attempts_quiz_id_fkey;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT purchases_video_id_fkey;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT purchases_student_id_fkey;
ALTER TABLE ONLY public.profiles DROP CONSTRAINT profiles_user_id_fkey;
ALTER TABLE ONLY public.payments DROP CONSTRAINT payments_user_id_fkey;
ALTER TABLE ONLY public.payments DROP CONSTRAINT payments_package_id_fkey;
ALTER TABLE ONLY public.payments DROP CONSTRAINT payments_certificate_id_fkey;
ALTER TABLE ONLY public.organizations DROP CONSTRAINT organizations_owner_user_id_fkey;
ALTER TABLE ONLY public.org_webhook_deliveries DROP CONSTRAINT org_webhook_deliveries_org_id_fkey;
ALTER TABLE ONLY public.org_subscriptions DROP CONSTRAINT org_subscriptions_org_id_fkey;
ALTER TABLE ONLY public.org_subscription_payments DROP CONSTRAINT org_subscription_payments_org_id_fkey;
ALTER TABLE ONLY public.org_quiz_attempts DROP CONSTRAINT org_quiz_attempts_user_id_fkey;
ALTER TABLE ONLY public.org_quiz_attempts DROP CONSTRAINT org_quiz_attempts_org_id_fkey;
ALTER TABLE ONLY public.org_quiz_attempts DROP CONSTRAINT org_quiz_attempts_org_fk;
ALTER TABLE ONLY public.org_quiz_attempts DROP CONSTRAINT org_quiz_attempts_assignment_id_fkey;
ALTER TABLE ONLY public.org_memberships DROP CONSTRAINT org_memberships_user_id_fkey;
ALTER TABLE ONLY public.org_memberships DROP CONSTRAINT org_memberships_org_fk;
ALTER TABLE ONLY public.org_learner_profiles DROP CONSTRAINT org_learner_profiles_user_id_fkey;
ALTER TABLE ONLY public.org_learner_profiles DROP CONSTRAINT org_learner_profiles_org_id_fkey;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_user_id_fkey;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_term_id_fkey;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_session_id_fkey;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_org_id_fkey;
ALTER TABLE ONLY public.org_invites DROP CONSTRAINT org_invites_org_id_fkey;
ALTER TABLE ONLY public.org_instructor_profiles DROP CONSTRAINT org_instructor_profiles_user_id_fkey;
ALTER TABLE ONLY public.org_instructor_profiles DROP CONSTRAINT org_instructor_profiles_org_id_fkey;
ALTER TABLE ONLY public.org_exam_terms DROP CONSTRAINT org_exam_terms_org_id_fkey;
ALTER TABLE ONLY public.org_exam_student_overall DROP CONSTRAINT org_exam_student_overall_student_user_id_fkey;
ALTER TABLE ONLY public.org_exam_student_overall DROP CONSTRAINT org_exam_student_overall_session_id_fkey;
ALTER TABLE ONLY public.org_exam_student_overall DROP CONSTRAINT org_exam_student_overall_org_id_fkey;
ALTER TABLE ONLY public.org_exam_sessions DROP CONSTRAINT org_exam_sessions_term_id_fkey;
ALTER TABLE ONLY public.org_exam_sessions DROP CONSTRAINT org_exam_sessions_org_id_fkey;
ALTER TABLE ONLY public.org_exam_results DROP CONSTRAINT org_exam_results_student_user_id_fkey;
ALTER TABLE ONLY public.org_exam_results DROP CONSTRAINT org_exam_results_org_id_fkey;
ALTER TABLE ONLY public.org_exam_grading_bands DROP CONSTRAINT org_exam_grading_bands_org_id_fkey;
ALTER TABLE ONLY public.org_course_assignments DROP CONSTRAINT org_course_assignments_org_fk;
ALTER TABLE ONLY public.org_course_assignments DROP CONSTRAINT org_course_assignments_created_by_fkey;
ALTER TABLE ONLY public.org_course_assignments DROP CONSTRAINT org_course_assignments_course_id_fkey;
ALTER TABLE ONLY public.org_course_assignment_submissions DROP CONSTRAINT org_course_assignment_submissions_org_id_fkey;
ALTER TABLE ONLY public.org_course_assignment_submissions DROP CONSTRAINT org_course_assignment_submissions_learner_fk;
ALTER TABLE ONLY public.org_course_assignment_submissions DROP CONSTRAINT org_course_assignment_submissions_assignment_id_fkey;
ALTER TABLE ONLY public.org_attempt_answers DROP CONSTRAINT org_attempt_answers_attempt_id_fkey;
ALTER TABLE ONLY public.org_assignment_enrollments DROP CONSTRAINT org_assignment_enrollments_user_id_fkey;
ALTER TABLE ONLY public.org_assignment_enrollments DROP CONSTRAINT org_assignment_enrollments_assignment_id_fkey;
ALTER TABLE ONLY public.oer_wrapped_course DROP CONSTRAINT oer_wrapped_course_course_id_fkey;
ALTER TABLE ONLY public.oer_wrapped_course DROP CONSTRAINT oer_wrapped_course_catalog_slug_fkey;
ALTER TABLE ONLY public.messages DROP CONSTRAINT messages_sender_id_fkey;
ALTER TABLE ONLY public.lessons DROP CONSTRAINT lessons_course_id_fkey;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT fk_cvp_tutor;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT fk_cvp_student;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT fk_cvp_class;
ALTER TABLE ONLY public.enrollments DROP CONSTRAINT enrollments_student_id_fkey;
ALTER TABLE ONLY public.enrollments DROP CONSTRAINT enrollments_course_id_fkey;
ALTER TABLE ONLY public.email_unsubscribes DROP CONSTRAINT email_unsubscribes_user_id_fkey;
ALTER TABLE ONLY public.courses DROP CONSTRAINT courses_tutor_id_fkey;
ALTER TABLE ONLY public.courses DROP CONSTRAINT courses_catalog_collection_id_fkey;
ALTER TABLE ONLY public.course_reviews DROP CONSTRAINT course_reviews_student_id_fkey;
ALTER TABLE ONLY public.course_reviews DROP CONSTRAINT course_reviews_course_id_fkey;
ALTER TABLE ONLY public.course_purchases DROP CONSTRAINT course_purchases_tutor_id_fkey;
ALTER TABLE ONLY public.course_purchases DROP CONSTRAINT course_purchases_student_id_fkey;
ALTER TABLE ONLY public.course_purchases DROP CONSTRAINT course_purchases_course_id_fkey;
ALTER TABLE ONLY public.course_progress DROP CONSTRAINT course_progress_student_id_fkey;
ALTER TABLE ONLY public.course_progress DROP CONSTRAINT course_progress_course_id_fkey;
ALTER TABLE ONLY public.course_outlines DROP CONSTRAINT course_outlines_course_id_fkey;
ALTER TABLE ONLY public.conversations DROP CONSTRAINT conversations_sender_id_fkey;
ALTER TABLE ONLY public.conversations DROP CONSTRAINT conversations_recipient_id_fkey;
ALTER TABLE ONLY public.certifications DROP CONSTRAINT certifications_profile_id_fkey;
ALTER TABLE ONLY public.certificates DROP CONSTRAINT certificates_student_id_fkey;
ALTER TABLE ONLY public.certificates DROP CONSTRAINT certificates_quiz_attempt_id_fkey;
ALTER TABLE ONLY public.certificates DROP CONSTRAINT certificates_course_id_fkey;
ALTER TABLE ONLY public.catalog_collection_items DROP CONSTRAINT catalog_collection_items_collection_id_fkey;
ALTER TABLE ONLY public.catalog_collection_items DROP CONSTRAINT catalog_collection_items_catalog_slug_fkey;
ALTER TABLE ONLY public.ai_certificate_issuances DROP CONSTRAINT ai_certificate_issuances_certificate_id_fkey;
ALTER TABLE ONLY public.achievements DROP CONSTRAINT achievements_student_id_fkey;
ALTER TABLE ONLY public.achievements DROP CONSTRAINT achievements_course_id_fkey;
DROP TRIGGER trg_set_updated_at ON public.courses;
DROP TRIGGER trg_org_course_assignments_updated_at ON public.org_course_assignments;
DROP TRIGGER trg_courses_size_defaults ON public.courses;
DROP TRIGGER set_org_subscriptions_updated_at ON public.org_subscriptions;
DROP TRIGGER packages_set_updated_at ON public.packages;
DROP TRIGGER catalog_collection_set_updated_at ON public.catalog_collection;
DROP INDEX public.ux_tpc_provider_slug;
DROP INDEX public.ux_org_instructor_profiles_org_staff_code;
DROP INDEX public.ux_oer_wrapped_course_slug;
DROP INDEX public.ux_oer_books_provider_lower_title;
DROP INDEX public.ux_courses_provider_lower_title;
DROP INDEX public.ux_course_progress_student_course_week;
DROP INDEX public.ux_cci_collection_slug;
DROP INDEX public.ux_catalog_collection_title_subject;
DROP INDEX public.ux_catalog_collection_lower_title;
DROP INDEX public.ux_achievements_unique_rule;
DROP INDEX public.uq_oer_books_slug;
DROP INDEX public.uniq_entitlements_student;
DROP INDEX public.uniq_enrollments_student_course;
DROP INDEX public.uniq_collection_title_subject_ci;
DROP INDEX public.uniq_achievements_triplet;
DROP INDEX public.uix_course_reviews_course_student;
DROP INDEX public.payouts_tutor_status_idx;
DROP INDEX public.org_subscriptions_active_idx;
DROP INDEX public.org_subscription_payments_org_idx;
DROP INDEX public.org_quiz_attempts_unique_try;
DROP INDEX public.org_quiz_attempts_org_idx;
DROP INDEX public.org_quiz_attempts_assign_user_attempt_uniq;
DROP INDEX public.org_memberships_user_idx;
DROP INDEX public.org_memberships_org_user_uidx;
DROP INDEX public.org_memberships_org_idx;
DROP INDEX public.org_learner_profiles_org_id_admission_code_key;
DROP INDEX public.org_course_assignments_org_course_uidx;
DROP INDEX public.org_attempt_unique;
DROP INDEX public.org_assignment_enrollments_user_idx;
DROP INDEX public.ix_oer_books_lower_title;
DROP INDEX public.idx_transcripts_student;
DROP INDEX public.idx_third_party_catalog_slug;
DROP INDEX public.idx_quizzes_created_at;
DROP INDEX public.idx_quizzes_course_id;
DROP INDEX public.idx_quiz_attempts_quiz_id;
DROP INDEX public.idx_quiz_attempts_created_at;
DROP INDEX public.idx_profiles_tutor_region;
DROP INDEX public.idx_profiles_tutor_grade_bands_gin;
DROP INDEX public.idx_profiles_tutor_country;
DROP INDEX public.idx_payments_user_status;
DROP INDEX public.idx_payments_transaction_id;
DROP INDEX public.idx_payments_provider_order_id;
DROP INDEX public.idx_payments_provider;
DROP INDEX public.idx_payments_method;
DROP INDEX public.idx_payments_meta_purpose;
DROP INDEX public.idx_payments_meta_course;
DROP INDEX public.idx_payments_fee_total_usd;
DROP INDEX public.idx_payments_created_at;
DROP INDEX public.idx_payments_certificate_id;
DROP INDEX public.idx_payments_capture_id;
DROP INDEX public.idx_org_webhook_deliveries_status;
DROP INDEX public.idx_org_subscriptions_org;
DROP INDEX public.idx_org_subscriptions_active;
DROP INDEX public.idx_org_sub_payments_org;
DROP INDEX public.idx_org_invites_org;
DROP INDEX public.idx_org_instructor_profiles_subject;
DROP INDEX public.idx_org_instructor_profiles_org_id;
DROP INDEX public.idx_org_exam_results_org_session_student;
DROP INDEX public.idx_org_exam_overall_org_session_class;
DROP INDEX public.idx_org_exam_overall_org_session;
DROP INDEX public.idx_org_course_assignments_org_subject;
DROP INDEX public.idx_org_course_assignments_org_class_subject;
DROP INDEX public.idx_org_course_assignments_org_class;
DROP INDEX public.idx_org_attempts_user;
DROP INDEX public.idx_org_attempts_org_time;
DROP INDEX public.idx_org_attempts_assign;
DROP INDEX public.idx_org_attempt_answers_att;
DROP INDEX public.idx_oer_wrapped_course_course;
DROP INDEX public.idx_oer_wrapped_course_catalog;
DROP INDEX public.idx_oer_books_slug;
DROP INDEX public.idx_lessons_created_at;
DROP INDEX public.idx_lessons_course_id;
DROP INDEX public.idx_courses_title_ci;
DROP INDEX public.idx_courses_source_kind;
DROP INDEX public.idx_courses_rating;
DROP INDEX public.idx_courses_not_ai;
DROP INDEX public.idx_courses_course_size;
DROP INDEX public.idx_courses_catalog_collection_id;
DROP INDEX public.idx_course_reviews_student_id;
DROP INDEX public.idx_course_reviews_course_id;
DROP INDEX public.idx_course_reviews_course;
DROP INDEX public.idx_course_purchases_student;
DROP INDEX public.idx_course_purchases_course;
DROP INDEX public.idx_course_progress_course_student;
DROP INDEX public.idx_course_outlines_created_at;
DROP INDEX public.idx_course_outlines_course_id;
DROP INDEX public.idx_course_entitlements_user;
DROP INDEX public.idx_course_entitlements_course;
DROP INDEX public.idx_collection_items_collection_id;
DROP INDEX public.idx_certificates_student;
DROP INDEX public.idx_cc_items_collection;
DROP INDEX public.idx_catalog_collection_kind;
DROP INDEX public.idx_ai_cert_issuances_user;
DROP INDEX public.idx_ai_cert_issuances_course;
DROP INDEX public.email_unsubscribes_email_uidx;
ALTER TABLE ONLY public.zoomwebhooks DROP CONSTRAINT zoomwebhooks_pkey;
ALTER TABLE ONLY public.zoom_meeting_logs DROP CONSTRAINT zoom_meeting_logs_pkey;
ALTER TABLE ONLY public.zoom_meeting_logs DROP CONSTRAINT zoom_meeting_logs_meeting_id_key;
ALTER TABLE ONLY public.users DROP CONSTRAINT users_pkey;
ALTER TABLE ONLY public.users DROP CONSTRAINT users_email_key;
ALTER TABLE ONLY public.course_video_watch DROP CONSTRAINT uq_watch;
ALTER TABLE ONLY public.conversations DROP CONSTRAINT unique_conversation;
ALTER TABLE ONLY public.recorded_video_reviews DROP CONSTRAINT uniq_video_student;
ALTER TABLE ONLY public.ai_certificate_issuances DROP CONSTRAINT uniq_ai_issuance_user_course_sku;
ALTER TABLE ONLY public.tutor_sessions DROP CONSTRAINT tutor_sessions_pkey;
ALTER TABLE ONLY public.transcripts DROP CONSTRAINT transcripts_pkey;
ALTER TABLE ONLY public.transactions DROP CONSTRAINT transactions_pkey;
ALTER TABLE ONLY public.third_party_catalog DROP CONSTRAINT third_party_catalog_pkey;
ALTER TABLE ONLY public.subscription_plans DROP CONSTRAINT subscription_plans_pkey;
ALTER TABLE ONLY public.session_types DROP CONSTRAINT session_types_type_key;
ALTER TABLE ONLY public.session_types DROP CONSTRAINT session_types_pkey;
ALTER TABLE ONLY public.session_participants DROP CONSTRAINT session_participants_pkey;
ALTER TABLE ONLY public.reviews DROP CONSTRAINT reviews_pkey;
ALTER TABLE ONLY public.recorded_videos DROP CONSTRAINT recorded_videos_pkey;
ALTER TABLE ONLY public.recorded_video_reviews DROP CONSTRAINT recorded_video_reviews_video_id_student_id_key;
ALTER TABLE ONLY public.recorded_video_reviews DROP CONSTRAINT recorded_video_reviews_pkey;
ALTER TABLE ONLY public.quizzes DROP CONSTRAINT quizzes_pkey;
ALTER TABLE ONLY public.quiz_attempts DROP CONSTRAINT quiz_attempts_pkey;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT purchases_student_id_video_id_key;
ALTER TABLE ONLY public.classvault_purchases DROP CONSTRAINT purchases_pkey;
ALTER TABLE ONLY public.profiles DROP CONSTRAINT profiles_user_id_unique;
ALTER TABLE ONLY public.profiles DROP CONSTRAINT profiles_pkey;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_category_check;
ALTER TABLE ONLY public.payouts DROP CONSTRAINT payouts_pkey;
ALTER TABLE ONLY public.payments DROP CONSTRAINT payments_transaction_id_key;
ALTER TABLE ONLY public.payments DROP CONSTRAINT payments_pkey;
ALTER TABLE ONLY public.participants DROP CONSTRAINT participants_pkey;
ALTER TABLE ONLY public.packages DROP CONSTRAINT packages_unique_credits_currency;
ALTER TABLE ONLY public.packages DROP CONSTRAINT packages_pkey;
ALTER TABLE ONLY public.organizations DROP CONSTRAINT organizations_slug_key;
ALTER TABLE ONLY public.organizations DROP CONSTRAINT organizations_pkey;
ALTER TABLE ONLY public.organizations DROP CONSTRAINT organizations_owner_user_id_slug_key;
ALTER TABLE ONLY public.organizations DROP CONSTRAINT organizations_owner_user_id_key;
ALTER TABLE ONLY public.org_webhook_deliveries DROP CONSTRAINT org_webhook_deliveries_pkey;
ALTER TABLE ONLY public.org_subscriptions DROP CONSTRAINT org_subscriptions_pkey;
ALTER TABLE ONLY public.org_subscriptions DROP CONSTRAINT org_subscriptions_org_key;
ALTER TABLE ONLY public.org_subscription_payments DROP CONSTRAINT org_subscription_payments_pkey;
ALTER TABLE ONLY public.org_quiz_attempts DROP CONSTRAINT org_quiz_attempts_pkey;
ALTER TABLE ONLY public.org_memberships DROP CONSTRAINT org_memberships_org_user_key;
ALTER TABLE ONLY public.org_learner_profiles DROP CONSTRAINT org_learner_profiles_pkey;
ALTER TABLE ONLY public.org_learner_profiles DROP CONSTRAINT org_learner_profiles_org_id_user_id_key;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_pkey;
ALTER TABLE ONLY public.org_learner_attendance DROP CONSTRAINT org_learner_attendance_org_id_user_id_term_id_key;
ALTER TABLE ONLY public.org_invites DROP CONSTRAINT org_invites_pkey;
ALTER TABLE ONLY public.org_invites DROP CONSTRAINT org_invites_code_key;
ALTER TABLE ONLY public.org_instructor_profiles DROP CONSTRAINT org_instructor_profiles_pkey;
ALTER TABLE ONLY public.org_exam_terms DROP CONSTRAINT org_exam_terms_pkey;
ALTER TABLE ONLY public.org_exam_terms DROP CONSTRAINT org_exam_terms_org_id_year_label_key;
ALTER TABLE ONLY public.org_exam_student_overall DROP CONSTRAINT org_exam_student_overall_pkey;
ALTER TABLE ONLY public.org_exam_student_overall DROP CONSTRAINT org_exam_student_overall_org_id_session_id_student_user_id_key;
ALTER TABLE ONLY public.org_exam_sessions DROP CONSTRAINT org_exam_sessions_pkey;
ALTER TABLE ONLY public.org_exam_sessions DROP CONSTRAINT org_exam_sessions_org_id_term_id_label_key;
ALTER TABLE ONLY public.org_exam_results DROP CONSTRAINT org_exam_results_pkey;
ALTER TABLE ONLY public.org_exam_results DROP CONSTRAINT org_exam_results_org_id_session_id_student_user_id_subject_key;
ALTER TABLE ONLY public.org_exam_grading_bands DROP CONSTRAINT org_exam_grading_bands_pkey;
ALTER TABLE ONLY public.org_exam_grading_bands DROP CONSTRAINT org_exam_grading_bands_org_id_scheme_name_grade_key;
ALTER TABLE ONLY public.org_course_assignments DROP CONSTRAINT org_course_assignments_pkey;
ALTER TABLE ONLY public.org_course_assignments DROP CONSTRAINT org_course_assignments_invite_code_key;
ALTER TABLE ONLY public.org_course_assignment_submissions DROP CONSTRAINT org_course_assignment_submissions_pkey;
ALTER TABLE ONLY public.org_attempts DROP CONSTRAINT org_attempts_pkey;
ALTER TABLE ONLY public.org_attempt_answers DROP CONSTRAINT org_attempt_answers_pkey;
ALTER TABLE ONLY public.org_assignment_enrollments DROP CONSTRAINT org_assignment_enrollments_pkey;
ALTER TABLE ONLY public.oer_wrapped_course DROP CONSTRAINT oer_wrapped_course_pkey;
ALTER TABLE ONLY public.oer_wrapped_course DROP CONSTRAINT oer_wrapped_course_course_id_key;
ALTER TABLE ONLY public.oer_wrapped_book DROP CONSTRAINT oer_wrapped_book_pkey;
ALTER TABLE ONLY public.oer_books DROP CONSTRAINT oer_books_pkey;
ALTER TABLE ONLY public.messages DROP CONSTRAINT messages_pkey;
ALTER TABLE ONLY public.lessons DROP CONSTRAINT lessons_pkey;
ALTER TABLE ONLY public.enrollments DROP CONSTRAINT enrollments_pkey;
ALTER TABLE ONLY public.email_unsubscribes DROP CONSTRAINT email_unsubscribes_pkey;
ALTER TABLE ONLY public.earnings_balances DROP CONSTRAINT earnings_balances_pkey;
ALTER TABLE ONLY public.courses DROP CONSTRAINT courses_pkey;
ALTER TABLE ONLY public.course_video_watch DROP CONSTRAINT course_video_watch_pkey;
ALTER TABLE ONLY public.course_text_read DROP CONSTRAINT course_text_read_pkey;
ALTER TABLE ONLY public.course_reviews DROP CONSTRAINT course_reviews_pkey;
ALTER TABLE ONLY public.course_reviews DROP CONSTRAINT course_reviews_course_id_student_id_key;
ALTER TABLE ONLY public.course_purchases DROP CONSTRAINT course_purchases_pkey;
ALTER TABLE ONLY public.course_purchases DROP CONSTRAINT course_purchases_course_id_student_id_key;
ALTER TABLE ONLY public.course_progress DROP CONSTRAINT course_progress_pkey;
ALTER TABLE ONLY public.course_outlines DROP CONSTRAINT course_outlines_pkey;
ALTER TABLE ONLY public.course_entitlements DROP CONSTRAINT course_entitlements_user_id_course_id_key;
ALTER TABLE ONLY public.course_entitlements DROP CONSTRAINT course_entitlements_pkey;
ALTER TABLE ONLY public.conversations DROP CONSTRAINT conversations_pkey;
ALTER TABLE ONLY public.certifications DROP CONSTRAINT certifications_pkey;
ALTER TABLE ONLY public.certificates DROP CONSTRAINT certificates_pkey;
ALTER TABLE ONLY public.catalog_collection DROP CONSTRAINT catalog_collection_pkey;
ALTER TABLE ONLY public.catalog_collection_items DROP CONSTRAINT catalog_collection_items_pkey;
ALTER TABLE ONLY public.badge_rules DROP CONSTRAINT badge_rules_pkey;
ALTER TABLE ONLY public.badge_rules DROP CONSTRAINT badge_rules_code_key;
ALTER TABLE ONLY public.app_settings DROP CONSTRAINT app_settings_pkey;
ALTER TABLE ONLY public.ai_certificates DROP CONSTRAINT ai_certificates_pkey;
ALTER TABLE ONLY public.ai_certificates DROP CONSTRAINT ai_certificates_code_key;
ALTER TABLE ONLY public.ai_certificate_issuances DROP CONSTRAINT ai_certificate_issuances_pkey;
ALTER TABLE ONLY public.achievements DROP CONSTRAINT achievements_pkey;
ALTER TABLE public.zoomwebhooks ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.zoom_meeting_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.tutor_sessions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.transactions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.subscription_plans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.session_types ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.session_participants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.recorded_videos ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.recorded_video_reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.payouts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.participants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.packages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.org_learner_attendance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.org_exam_student_overall ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.org_exam_results ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.org_course_assignment_submissions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.course_reviews ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.course_entitlements ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.conversations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.classvault_purchases ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.certifications ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE public.zoomwebhooks_id_seq;
DROP TABLE public.zoomwebhooks;
DROP SEQUENCE public.zoom_meeting_logs_id_seq;
DROP TABLE public.zoom_meeting_logs;
DROP SEQUENCE public.users_id_seq;
DROP TABLE public.users;
DROP VIEW public.tutors;
DROP SEQUENCE public.tutor_sessions_id_seq;
DROP TABLE public.tutor_sessions;
DROP TABLE public.transcripts;
DROP SEQUENCE public.transactions_id_seq;
DROP TABLE public.transactions;
DROP TABLE public.third_party_catalog;
DROP SEQUENCE public.subscription_plans_id_seq;
DROP TABLE public.subscription_plans;
DROP SEQUENCE public.session_types_id_seq;
DROP TABLE public.session_types;
DROP SEQUENCE public.session_participants_id_seq;
DROP TABLE public.session_participants;
DROP SEQUENCE public.reviews_id_seq;
DROP TABLE public.reviews;
DROP SEQUENCE public.recorded_videos_id_seq;
DROP TABLE public.recorded_videos;
DROP SEQUENCE public.recorded_video_reviews_id_seq;
DROP TABLE public.recorded_video_reviews;
DROP TABLE public.quizzes;
DROP TABLE public.quiz_attempts;
DROP SEQUENCE public.purchases_id_seq;
DROP SEQUENCE public.profiles_id_seq;
DROP TABLE public.profiles;
DROP SEQUENCE public.payouts_id_seq;
DROP TABLE public.payouts;
DROP SEQUENCE public.payments_id_seq;
DROP TABLE public.payments;
DROP SEQUENCE public.participants_id_seq;
DROP TABLE public.participants;
DROP SEQUENCE public.packages_id_seq;
DROP TABLE public.packages;
DROP TABLE public.organizations;
DROP TABLE public.org_webhook_deliveries;
DROP TABLE public.org_subscriptions;
DROP TABLE public.org_subscription_payments;
DROP TABLE public.org_quiz_attempts;
DROP TABLE public.org_memberships;
DROP TABLE public.org_learner_profiles;
DROP SEQUENCE public.org_learner_attendance_id_seq;
DROP TABLE public.org_learner_attendance;
DROP TABLE public.org_invites;
DROP TABLE public.org_instructor_profiles;
DROP TABLE public.org_exam_terms;
DROP SEQUENCE public.org_exam_student_overall_id_seq;
DROP TABLE public.org_exam_student_overall;
DROP TABLE public.org_exam_sessions;
DROP SEQUENCE public.org_exam_results_id_seq;
DROP TABLE public.org_exam_results;
DROP TABLE public.org_exam_grading_bands;
DROP TABLE public.org_course_assignments;
DROP SEQUENCE public.org_course_assignment_submissions_id_seq;
DROP TABLE public.org_course_assignment_submissions;
DROP TABLE public.org_attempts;
DROP TABLE public.org_attempt_answers;
DROP TABLE public.org_assignment_enrollments;
DROP TABLE public.oer_wrapped_course;
DROP TABLE public.oer_wrapped_book;
DROP TABLE public.oer_books;
DROP SEQUENCE public.messages_id_seq;
DROP TABLE public.messages;
DROP TABLE public.lessons;
DROP TABLE public.enrollments;
DROP TABLE public.email_unsubscribes;
DROP TABLE public.earnings_balances;
DROP TABLE public.courses;
DROP TABLE public.course_video_watch;
DROP TABLE public.course_text_read;
DROP SEQUENCE public.course_reviews_id_seq;
DROP TABLE public.course_reviews;
DROP TABLE public.course_purchases;
DROP TABLE public.course_progress;
DROP TABLE public.course_outlines;
DROP SEQUENCE public.course_entitlements_id_seq;
DROP TABLE public.course_entitlements;
DROP SEQUENCE public.conversations_id_seq;
DROP TABLE public.conversations;
DROP TABLE public.classvault_purchases;
DROP SEQUENCE public.certifications_id_seq;
DROP TABLE public.certifications;
DROP TABLE public.certificates;
DROP TABLE public.catalog_collection_items;
DROP TABLE public.catalog_collection;
DROP TABLE public.badge_rules;
DROP TABLE public.app_settings;
DROP TABLE public.ai_certificates;
DROP TABLE public.ai_certificate_issuances;
DROP TABLE public.achievements;
DROP FUNCTION public.set_updated_at();
DROP FUNCTION public.courses_apply_size_defaults();
DROP EXTENSION "uuid-ossp";
DROP EXTENSION pgcrypto;
--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: courses_apply_size_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.courses_apply_size_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  u int; l int; est_min int; est_max int; target_ms int;
  words_min int; words_max int; quiz int; project text;
BEGIN
  IF NEW.course_size IS NULL THEN
    RETURN NEW;
  END IF;

  -- Presets
  IF NEW.course_size='mini' THEN
    u:=2;  l:=3;  est_min:=3;  est_max:=4;  target_ms:=210000;  words_min:=400;  words_max:=550;  quiz:=4; project:='optional';
  ELSIF NEW.course_size='standard' THEN
    u:=4;  l:=4;  est_min:=5;  est_max:=7;  target_ms:=360000;  words_min:=600;  words_max:=800;  quiz:=5; project:='required';
  ELSIF NEW.course_size='extended' THEN
    u:=6;  l:=4;  est_min:=6;  est_max:=8;  target_ms:=420000;  words_min:=750;  words_max:=900;  quiz:=6; project:='required';
  ELSIF NEW.course_size='deep_dive' THEN
    u:=8;  l:=4;  est_min:=8;  est_max:=10; target_ms:=540000;  words_min:=900;  words_max:=1100; quiz:=7; project:='required_with_rubric';
  ELSIF NEW.course_size='bootcamp' THEN
    u:=10; l:=5;  est_min:=8;  est_max:=10; target_ms:=540000;  words_min:=900;  words_max:=1200; quiz:=7; project:='required_with_rubric';
  END IF;

  -- Fill core counters if not already set
  NEW.total_units       := COALESCE(NEW.total_units, u);
  NEW.lessons_per_unit  := COALESCE(NEW.lessons_per_unit, l);
  NEW.total_lessons     := COALESCE(NEW.total_lessons, u*l);
  NEW.tts_target_ms     := COALESCE(NEW.tts_target_ms, target_ms);

  -- Merge meta
  NEW.size_meta := COALESCE(NEW.size_meta, '{}'::jsonb) ||
    jsonb_build_object(
      'words_per_lesson_min', words_min,
      'words_per_lesson_max', words_max,
      'quiz_per_lesson',      quiz,
      'unit_project',         project,
      'est_audio_min_sec',    est_min*60,
      'est_audio_max_sec',    est_max*60
    );

  -- Estimated hours (avg minutes per lesson / 60)
  IF NEW.estimated_hours IS NULL THEN
    NEW.estimated_hours := ROUND(((u*l) * ((est_min+est_max)/2.0))::numeric / 60.0, 1);
  END IF;

  -- Default price ladder if price is null
  IF NEW.price IS NULL THEN
    NEW.price := CASE NEW.course_size
      WHEN 'mini' THEN 3
      WHEN 'standard' THEN 9
      WHEN 'extended' THEN 15
      WHEN 'deep_dive' THEN 22
      WHEN 'bootcamp' THEN 35
    END;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id integer,
    course_id uuid,
    title text NOT NULL,
    icon_url text,
    earned_at timestamp with time zone DEFAULT now(),
    rule_code text
);


--
-- Name: ai_certificate_issuances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_certificate_issuances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    course_id uuid,
    certificate_id uuid NOT NULL,
    price_tokens numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sku_code text,
    kind text,
    includes_transcript boolean DEFAULT false NOT NULL
);


--
-- Name: ai_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    price_tokens numeric(10,2) NOT NULL,
    active boolean DEFAULT true,
    includes_transcript boolean DEFAULT false,
    kind text,
    tier text,
    is_extended boolean
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: badge_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badge_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    title text NOT NULL,
    icon_url text,
    criteria jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true
);


--
-- Name: catalog_collection; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_collection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    subject text,
    created_at timestamp with time zone DEFAULT now(),
    thumbnail_url text,
    content_kind text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_collection_content_kind_check CHECK ((content_kind = ANY (ARRAY['video'::text, 'doc'::text])))
);


--
-- Name: catalog_collection_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalog_collection_items (
    collection_id uuid NOT NULL,
    catalog_slug text NOT NULL,
    "position" integer
);


--
-- Name: certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certificates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id integer,
    course_id uuid,
    url text,
    issued_at timestamp without time zone DEFAULT now(),
    quiz_attempt_id uuid,
    status text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_logo_public_id text
);


--
-- Name: certifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.certifications (
    id integer NOT NULL,
    profile_id integer,
    tutor_name text NOT NULL,
    status text DEFAULT 'Pending'::text,
    documents jsonb,
    submitted_at timestamp without time zone,
    verified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT certifications_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Verified'::text])))
);


--
-- Name: certifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.certifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: certifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.certifications_id_seq OWNED BY public.certifications.id;


--
-- Name: classvault_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classvault_purchases (
    id integer NOT NULL,
    student_id integer,
    class_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    tutor_id integer,
    amount integer NOT NULL,
    fee_tokens integer,
    gross_tokens integer
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id integer NOT NULL,
    sender_id integer NOT NULL,
    recipient_id integer NOT NULL,
    unread_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.conversations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.conversations_id_seq OWNED BY public.conversations.id;


--
-- Name: course_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_entitlements (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    tier text DEFAULT 'standard'::text NOT NULL,
    can_certificate boolean DEFAULT false NOT NULL,
    can_transcript boolean DEFAULT false NOT NULL,
    purchased_at timestamp with time zone DEFAULT now(),
    student_id bigint,
    CONSTRAINT course_entitlements_tier_check CHECK ((tier = ANY (ARRAY['standard'::text, 'extended'::text])))
);


--
-- Name: course_entitlements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_entitlements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_entitlements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_entitlements_id_seq OWNED BY public.course_entitlements.id;


--
-- Name: course_outlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_outlines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title text NOT NULL,
    level text NOT NULL,
    target_minutes integer NOT NULL,
    json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: course_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id integer,
    course_id uuid,
    week integer,
    status text DEFAULT 'Not Started'::text,
    updated_at timestamp without time zone DEFAULT now(),
    score integer,
    notes text,
    CONSTRAINT course_progress_status_check CHECK ((status = ANY (ARRAY['Not Started'::text, 'In Progress'::text, 'Completed'::text])))
);


--
-- Name: course_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    student_id integer,
    tutor_id integer,
    gross integer NOT NULL,
    net_tokens integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: course_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_reviews (
    id bigint NOT NULL,
    course_id uuid NOT NULL,
    student_id integer,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT course_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: course_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.course_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: course_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.course_reviews_id_seq OWNED BY public.course_reviews.id;


--
-- Name: course_text_read; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_text_read (
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    week integer NOT NULL,
    source_url text NOT NULL,
    words_read integer DEFAULT 0,
    total_words integer DEFAULT 0,
    scrolled_pct numeric(5,2) DEFAULT 0,
    seconds_active integer DEFAULT 0,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: course_video_watch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_video_watch (
    user_id uuid NOT NULL,
    course_id uuid NOT NULL,
    week integer NOT NULL,
    video_id text NOT NULL,
    provider text NOT NULL,
    watched_seconds integer DEFAULT 0 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tutor_id integer,
    title text NOT NULL,
    description text,
    level text,
    duration text,
    price numeric(10,2),
    syllabus jsonb,
    prerequisites text,
    created_at timestamp with time zone DEFAULT now(),
    signature_public_id text,
    updated_at timestamp without time zone DEFAULT now(),
    avg_rating numeric(3,2) DEFAULT 0 NOT NULL,
    ratings_count integer DEFAULT 0 NOT NULL,
    is_ai_generated boolean DEFAULT false,
    course_size text,
    total_units integer,
    lessons_per_unit integer,
    total_lessons integer,
    estimated_hours numeric(6,1),
    tts_target_ms integer,
    size_meta jsonb DEFAULT '{}'::jsonb,
    provider text,
    price_label text DEFAULT 'Free'::text,
    thumbnail_url text,
    subject text,
    source_kind text,
    catalog_collection_id uuid,
    content_kind text,
    is_oer boolean DEFAULT false,
    CONSTRAINT courses_ai_requires_size CHECK (((is_ai_generated = false) OR (course_size IS NOT NULL))),
    CONSTRAINT courses_content_kind_chk CHECK (((content_kind = ANY (ARRAY['doc'::text, 'video'::text, 'mixed'::text])) OR (content_kind IS NULL))),
    CONSTRAINT courses_course_size_check CHECK ((course_size = ANY (ARRAY['mini'::text, 'standard'::text, 'extended'::text, 'deep_dive'::text, 'bootcamp'::text]))),
    CONSTRAINT courses_level_check CHECK ((level = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text, 'All Levels'::text]))),
    CONSTRAINT courses_source_kind_chk CHECK (((source_kind IS NULL) OR (source_kind = ANY (ARRAY['oer'::text, 'wrapped_oer'::text, 'catalog'::text, 'ai'::text, 'seed10'::text, 'seed25'::text, 'seed50'::text, 'starter50'::text]))))
);


--
-- Name: earnings_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.earnings_balances (
    user_id bigint NOT NULL,
    currency text NOT NULL,
    available_amount numeric(12,2) DEFAULT 0 NOT NULL,
    pending_amount numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_unsubscribes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    reason text,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    student_id integer,
    status text DEFAULT 'active'::text,
    progress integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'upcoming'::text])))
);


--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    title text NOT NULL,
    ssml text NOT NULL,
    outline_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id integer NOT NULL,
    conversation_id integer NOT NULL,
    sender_id integer NOT NULL,
    content text NOT NULL,
    unread boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;


--
-- Name: oer_books; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oer_books (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    pdf_url text,
    license text,
    license_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    web_url text,
    cover_url text
);


--
-- Name: oer_wrapped_book; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oer_wrapped_book (
    book_id uuid NOT NULL,
    course_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: oer_wrapped_course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oer_wrapped_course (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    catalog_slug text NOT NULL,
    catalog_provider text NOT NULL,
    course_id uuid NOT NULL,
    commercial_allowed boolean DEFAULT false,
    license text,
    license_url text,
    attribution_html text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: org_assignment_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_assignment_enrollments (
    assignment_id uuid NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_attempt_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_attempt_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempt_id uuid NOT NULL,
    user_id text NOT NULL,
    assignment_id text NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    answers jsonb NOT NULL
);


--
-- Name: org_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id text NOT NULL,
    user_id text NOT NULL,
    device_id text,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_heartbeat timestamp with time zone,
    remaining_ms integer DEFAULT 0 NOT NULL,
    seed integer DEFAULT 0 NOT NULL,
    heartbeat_sec integer DEFAULT 15 NOT NULL,
    max_backgrounds integer DEFAULT 2 NOT NULL,
    max_suspicion integer DEFAULT 5 NOT NULL,
    backgrounds integer DEFAULT 0 NOT NULL,
    suspicions integer DEFAULT 0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb
);


--
-- Name: org_course_assignment_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_course_assignment_submissions (
    id bigint NOT NULL,
    user_id bigint,
    student_id text,
    answer_text text,
    attachment_url text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    org_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    learner_id uuid
);


--
-- Name: org_course_assignment_submissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_course_assignment_submissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_course_assignment_submissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_course_assignment_submissions_id_seq OWNED BY public.org_course_assignment_submissions.id;


--
-- Name: org_course_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_course_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid,
    title_override text,
    pass_mark integer,
    timer_s integer,
    max_attempts integer DEFAULT 1 NOT NULL,
    due_at timestamp with time zone,
    invite_code text NOT NULL,
    created_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    locked_config jsonb DEFAULT '{}'::jsonb,
    org_id uuid NOT NULL,
    org_class_label text,
    org_subject_key text,
    instructions text,
    attachment_url text,
    source_kind text,
    CONSTRAINT chk_locked_config_quiztype CHECK ((((locked_config ? 'quizType'::text) IS FALSE) OR ((locked_config ->> 'quizType'::text) = ANY (ARRAY['mcq'::text, 'short'::text]))))
);


--
-- Name: org_exam_grading_bands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_exam_grading_bands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    scheme_name text DEFAULT 'default'::text NOT NULL,
    grade text NOT NULL,
    min_percent numeric(5,2) NOT NULL,
    max_percent numeric(5,2) NOT NULL,
    remark text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_exam_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_exam_results (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    session_id uuid NOT NULL,
    student_user_id integer NOT NULL,
    class_label text,
    subject text NOT NULL,
    score numeric(7,2) NOT NULL,
    max_score numeric(7,2) NOT NULL,
    percent numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (max_score > (0)::numeric) THEN ((score * 100.0) / max_score)
    ELSE (0)::numeric
END) STORED,
    grade text NOT NULL,
    remark text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cat_score numeric,
    exam_score numeric,
    teacher_initials text,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: org_exam_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_exam_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_exam_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_exam_results_id_seq OWNED BY public.org_exam_results.id;


--
-- Name: org_exam_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_exam_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    term_id uuid,
    label text NOT NULL,
    weight numeric(5,2) DEFAULT 1.0 NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_exam_student_overall; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_exam_student_overall (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    session_id uuid NOT NULL,
    student_user_id integer NOT NULL,
    class_label text,
    overall_comment text,
    teacher_comment text,
    principal_comment text,
    total_score numeric(10,2),
    total_max numeric(10,2),
    total_percent numeric(5,2),
    overall_grade text,
    "position" integer,
    stream_size integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    principal_remark text
);


--
-- Name: org_exam_student_overall_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_exam_student_overall_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_exam_student_overall_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_exam_student_overall_id_seq OWNED BY public.org_exam_student_overall.id;


--
-- Name: org_exam_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_exam_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    label text NOT NULL,
    year integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_instructor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_instructor_profiles (
    org_id uuid NOT NULL,
    user_id integer NOT NULL,
    staff_code text,
    subject text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    temp_password text
);


--
-- Name: org_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    role text NOT NULL,
    code text NOT NULL,
    email text,
    created_by bigint NOT NULL,
    accepted_by bigint,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_invites_role_check CHECK ((role = ANY (ARRAY['instructor'::text, 'learner'::text])))
);


--
-- Name: org_learner_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_learner_attendance (
    id bigint NOT NULL,
    org_id uuid NOT NULL,
    user_id bigint NOT NULL,
    term_id uuid NOT NULL,
    session_id uuid,
    lessons_held integer,
    lessons_attended integer,
    attendance_percent numeric(5,2),
    behavior_rating integer,
    punctuality_rating integer,
    teacher_comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: org_learner_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.org_learner_attendance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: org_learner_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.org_learner_attendance_id_seq OWNED BY public.org_learner_attendance.id;


--
-- Name: org_learner_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_learner_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id integer NOT NULL,
    admission_code text,
    class_label text,
    guardian_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    house_label text,
    dorm_label text,
    club_label text,
    photo_url text,
    temp_password text,
    class_teacher_signature_url text
);


--
-- Name: org_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_memberships (
    user_id integer NOT NULL,
    role text NOT NULL,
    email text,
    invited_by integer,
    invited_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone,
    org_id uuid NOT NULL,
    CONSTRAINT org_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'instructor'::text, 'learner'::text])))
);


--
-- Name: org_quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_quiz_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    assignment_id uuid NOT NULL,
    user_id integer,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone NOT NULL,
    submitted_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    score_pct integer,
    pass_mark integer,
    passed boolean,
    answers jsonb DEFAULT '[]'::jsonb,
    attempt_no integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_quiz_attempts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'submitted'::text, 'expired'::text, 'locked'::text])))
);


--
-- Name: org_subscription_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_subscription_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tier text NOT NULL,
    cycle text NOT NULL,
    currency text NOT NULL,
    amount_cents integer NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_order_id text,
    provider_txn_id text,
    mpesa_reference text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_subscription_payments_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT org_subscription_payments_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'KES'::text]))),
    CONSTRAINT org_subscription_payments_cycle_check CHECK ((cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT org_subscription_payments_provider_check CHECK ((provider = ANY (ARRAY['MPESA'::text, 'PAYPAL'::text]))),
    CONSTRAINT org_subscription_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'canceled'::text]))),
    CONSTRAINT org_subscription_payments_tier_check CHECK ((tier = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text])))
);


--
-- Name: org_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    tier text NOT NULL,
    seats integer DEFAULT 50 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_subscriptions_tier_check CHECK ((tier = ANY (ARRAY['starter'::text, 'pro'::text, 'enterprise'::text])))
);


--
-- Name: org_webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id integer NOT NULL,
    name text NOT NULL,
    slug text,
    logo_url text,
    signature_url text,
    certificate_title text DEFAULT 'Certificate of Completion'::text NOT NULL,
    default_pass_mark integer DEFAULT 70 NOT NULL,
    quiz_time_limit_s integer DEFAULT 900 NOT NULL,
    allow_retry boolean DEFAULT false NOT NULL,
    email_domain text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_url text,
    webhook_secret text,
    webhook_enabled boolean DEFAULT false,
    webhook_secret_rotated_at timestamp with time zone,
    address_line1 text,
    address_line2 text,
    phone_number text,
    contact_email text,
    website_url text,
    instructor_signature_url text,
    exam_report_title text
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id integer NOT NULL,
    credits integer NOT NULL,
    price numeric(10,2) NOT NULL,
    offer text,
    currency character varying(10) DEFAULT 'USD'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.packages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.packages_id_seq OWNED BY public.packages.id;


--
-- Name: participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participants (
    id integer NOT NULL,
    meeting_id text NOT NULL,
    user_id text NOT NULL,
    user_name text,
    email text,
    role text DEFAULT 'unknown'::text,
    join_time timestamp without time zone,
    leave_time timestamp without time zone,
    raw_payload jsonb
);


--
-- Name: participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.participants_id_seq OWNED BY public.participants.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    user_id integer,
    package_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_method text NOT NULL,
    status text DEFAULT 'Pending'::text,
    transaction_id text,
    mpesa_reference text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    method text,
    provider text,
    provider_order_id text,
    capture_id text,
    intent text,
    currency text,
    meta jsonb DEFAULT '{}'::jsonb,
    certificate_id uuid,
    payer_email text,
    fee_fixed_usd numeric(10,2),
    fee_percent numeric(6,4),
    fee_total_usd numeric(10,2),
    CONSTRAINT payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['MPESA'::text, 'B2C'::text, 'CARD'::text, 'PAYPAL'::text, 'CRYPTO'::text]))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Success'::text, 'Failed'::text, 'Completed'::text])))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id bigint NOT NULL,
    tutor_id bigint NOT NULL,
    currency text NOT NULL,
    method text NOT NULL,
    amount numeric(12,2) NOT NULL,
    destination jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider_ref text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    class_id integer,
    purchase_id integer,
    net_tokens numeric,
    CONSTRAINT payouts_method_check CHECK ((method = ANY (ARRAY['mpesa'::text, 'wise'::text]))),
    CONSTRAINT payouts_method_currency_check CHECK ((((method = 'mpesa'::text) AND (currency = 'KES'::text)) OR ((method = 'wise'::text) AND (currency = 'USD'::text))))
);


--
-- Name: payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payouts_id_seq OWNED BY public.payouts.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id integer NOT NULL,
    user_id integer,
    role text NOT NULL,
    name text NOT NULL,
    age integer,
    languages text[],
    gallery text[],
    video text,
    status text DEFAULT 'Offline'::text,
    notifications boolean DEFAULT false,
    category text,
    favorites text[],
    recommended text[],
    experience_level text,
    description jsonb,
    pricing jsonb,
    age_group text[],
    payment_method text,
    bank_account text,
    bank_code text,
    mpesa_phone_number text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    certified boolean DEFAULT false,
    payout_currency text DEFAULT 'KES'::text,
    payout_method text DEFAULT 'mpesa'::text,
    stripe_connect_id text,
    paypal_email text,
    wise_email text,
    region text,
    country_code text,
    grade_bands text[] DEFAULT '{}'::text[],
    country character(2),
    school_grade character varying(64),
    payout_destination jsonb,
    CONSTRAINT profiles_age_check CHECK ((age >= 5)),
    CONSTRAINT profiles_country_code_iso2_chk CHECK (((country_code IS NULL) OR (country_code ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT profiles_experience_level_check CHECK ((experience_level = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text, 'Expert'::text]))),
    CONSTRAINT profiles_payment_method_check CHECK ((payment_method = ANY (ARRAY['bank'::text, 'mpesa'::text]))),
    CONSTRAINT profiles_payout_currency_check CHECK ((payout_currency = ANY (ARRAY['KES'::text, 'USD'::text]))),
    CONSTRAINT profiles_payout_method_check CHECK ((payout_method = ANY (ARRAY['mpesa'::text, 'wise'::text]))),
    CONSTRAINT profiles_payout_method_currency_check CHECK ((((payout_method = 'mpesa'::text) AND (payout_currency = 'KES'::text)) OR ((payout_method = 'wise'::text) AND (payout_currency = 'USD'::text)))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['tutor'::text, 'student'::text]))),
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['Online'::text, 'Offline'::text, 'Busy'::text, 'Free'::text, 'New'::text])))
);


--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: purchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: purchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.purchases_id_seq OWNED BY public.classvault_purchases.id;


--
-- Name: quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_id uuid NOT NULL,
    total integer NOT NULL,
    correct integer NOT NULL,
    score_pct integer NOT NULL,
    passed boolean NOT NULL,
    answers_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quizzes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizzes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recorded_video_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recorded_video_reviews (
    id bigint NOT NULL,
    video_id bigint NOT NULL,
    student_id bigint,
    rating smallint NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT recorded_video_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: recorded_video_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recorded_video_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recorded_video_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recorded_video_reviews_id_seq OWNED BY public.recorded_video_reviews.id;


--
-- Name: recorded_videos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recorded_videos (
    id integer NOT NULL,
    tutor_id integer,
    title character varying(255) NOT NULL,
    description text,
    subject character varying(100),
    grade_level character varying(50),
    price numeric(10,2) DEFAULT 0.00 NOT NULL,
    duration integer,
    tags text[],
    video_url text,
    thumbnail_url text,
    preview_url text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    pdf_url text,
    avg_rating numeric(3,2) DEFAULT 0 NOT NULL,
    ratings_count integer DEFAULT 0 NOT NULL
);


--
-- Name: recorded_videos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recorded_videos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recorded_videos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recorded_videos_id_seq OWNED BY public.recorded_videos.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    tutor_id integer,
    student_id integer,
    session_id integer,
    rating integer NOT NULL,
    comment text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: session_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_participants (
    id integer NOT NULL,
    session_id integer NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    join_time timestamp without time zone,
    leave_time timestamp without time zone
);


--
-- Name: session_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_participants_id_seq OWNED BY public.session_participants.id;


--
-- Name: session_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_types (
    id integer NOT NULL,
    type text NOT NULL,
    duration integer NOT NULL
);


--
-- Name: session_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.session_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: session_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.session_types_id_seq OWNED BY public.session_types.id;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) DEFAULT 0
);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: third_party_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.third_party_catalog (
    slug text NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    provider text NOT NULL,
    subject text,
    grade_level text,
    thumbnail_url text,
    source_url text NOT NULL,
    embed_url text,
    commercial_allowed boolean DEFAULT false,
    license text,
    license_url text,
    attribution_html text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT third_party_catalog_type_check CHECK ((type = ANY (ARRAY['video'::text, 'text'::text]))),
    CONSTRAINT tpc_slug_no_spaces CHECK ((slug !~ '\\s'::text))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    user_id integer,
    type text NOT NULL,
    amount numeric(10,2) NOT NULL,
    description text NOT NULL,
    date timestamp without time zone DEFAULT now(),
    status text DEFAULT 'Pending'::text,
    paystack_reference text,
    mpesa_reference text,
    phone_number text DEFAULT ''::text,
    payment_method text DEFAULT 'PlatformBalance'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    currency text DEFAULT 'KES'::text,
    reference text,
    payout_destination text,
    CONSTRAINT transactions_payment_method_check CHECK ((payment_method = ANY (ARRAY['M-Pesa'::text, 'Wise'::text, 'PlatformBalance'::text]))),
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Completed'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['Token Deduction'::text, 'Expected Earnings'::text, 'Completed Earnings'::text, 'Platform Commission'::text, 'Payout'::text, 'Payout Reversal'::text, 'Withdrawal Request'::text])))
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: transcripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcripts (
    id uuid NOT NULL,
    course_id uuid NOT NULL,
    url text DEFAULT ''::text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    student_id integer NOT NULL
);


--
-- Name: tutor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tutor_sessions (
    id integer NOT NULL,
    type text NOT NULL,
    tutor_id integer,
    student_id integer,
    session_type text,
    total_duration integer,
    subject text,
    date timestamp without time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    amount numeric(10,2),
    zoom_links text[],
    zoom_meeting_ids text[],
    paystack_reference text DEFAULT ''::text,
    participants jsonb,
    last_tutor_join_time timestamp without time zone,
    last_tutor_leave_time timestamp without time zone,
    last_student_join_time timestamp without time zone,
    last_student_leave_time timestamp without time zone,
    tutor_duration integer DEFAULT 0,
    student_duration integer DEFAULT 0,
    description text,
    comment text,
    rating integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    duration integer,
    end_time timestamp without time zone,
    completion_deadline timestamp without time zone,
    tutor_name character varying(255),
    completed_at timestamp with time zone,
    CONSTRAINT tutor_sessions_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT tutor_sessions_session_type_check CHECK ((session_type = ANY (ARRAY['privateSession'::text, 'groupSession'::text, 'lecture'::text, 'workshop'::text]))),
    CONSTRAINT tutor_sessions_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'completed'::text, 'cancelled'::text, 'pending'::text, 'accepted'::text, 'completed_pending'::text]))),
    CONSTRAINT tutor_sessions_type_check CHECK ((type = ANY (ARRAY['session'::text, 'earning'::text, 'review'::text])))
);


--
-- Name: tutor_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tutor_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tutor_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tutor_sessions_id_seq OWNED BY public.tutor_sessions.id;


--
-- Name: tutors; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tutors AS
 SELECT id,
    user_id,
    created_at
   FROM public.profiles
  WHERE (category = 'tutor'::text);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text,
    role text,
    email text NOT NULL,
    password text,
    google_id text,
    otp text,
    otp_expiration timestamp without time zone,
    tokens integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    onboarding_state text DEFAULT 'pending'::text,
    deleted_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    reset_otp text,
    reset_otp_expires_at timestamp with time zone,
    reset_otp_attempts integer DEFAULT 0
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: zoom_meeting_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoom_meeting_logs (
    id integer NOT NULL,
    meeting_id text NOT NULL,
    end_time timestamp without time zone,
    event text
);


--
-- Name: zoom_meeting_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zoom_meeting_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zoom_meeting_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zoom_meeting_logs_id_seq OWNED BY public.zoom_meeting_logs.id;


--
-- Name: zoomwebhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zoomwebhooks (
    id integer NOT NULL,
    event text NOT NULL,
    meeting_ids text[] NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    raw_payload jsonb,
    CONSTRAINT zoomwebhooks_event_check CHECK ((event = ANY (ARRAY['meeting.participant_joined'::text, 'meeting.participant_left'::text, 'meeting.ended'::text, 'endpoint.url_validation'::text, 'meeting.started'::text, 'meeting.participant_jbh_joined'::text, 'meeting.created'::text])))
);


--
-- Name: zoomwebhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.zoomwebhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: zoomwebhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.zoomwebhooks_id_seq OWNED BY public.zoomwebhooks.id;


--
-- Name: certifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications ALTER COLUMN id SET DEFAULT nextval('public.certifications_id_seq'::regclass);


--
-- Name: classvault_purchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases ALTER COLUMN id SET DEFAULT nextval('public.purchases_id_seq'::regclass);


--
-- Name: conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations ALTER COLUMN id SET DEFAULT nextval('public.conversations_id_seq'::regclass);


--
-- Name: course_entitlements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_entitlements ALTER COLUMN id SET DEFAULT nextval('public.course_entitlements_id_seq'::regclass);


--
-- Name: course_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_reviews ALTER COLUMN id SET DEFAULT nextval('public.course_reviews_id_seq'::regclass);


--
-- Name: messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- Name: org_course_assignment_submissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignment_submissions ALTER COLUMN id SET DEFAULT nextval('public.org_course_assignment_submissions_id_seq'::regclass);


--
-- Name: org_exam_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_results ALTER COLUMN id SET DEFAULT nextval('public.org_exam_results_id_seq'::regclass);


--
-- Name: org_exam_student_overall id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall ALTER COLUMN id SET DEFAULT nextval('public.org_exam_student_overall_id_seq'::regclass);


--
-- Name: org_learner_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance ALTER COLUMN id SET DEFAULT nextval('public.org_learner_attendance_id_seq'::regclass);


--
-- Name: packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages ALTER COLUMN id SET DEFAULT nextval('public.packages_id_seq'::regclass);


--
-- Name: participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants ALTER COLUMN id SET DEFAULT nextval('public.participants_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: payouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts ALTER COLUMN id SET DEFAULT nextval('public.payouts_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: recorded_video_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews ALTER COLUMN id SET DEFAULT nextval('public.recorded_video_reviews_id_seq'::regclass);


--
-- Name: recorded_videos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_videos ALTER COLUMN id SET DEFAULT nextval('public.recorded_videos_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: session_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants ALTER COLUMN id SET DEFAULT nextval('public.session_participants_id_seq'::regclass);


--
-- Name: session_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_types ALTER COLUMN id SET DEFAULT nextval('public.session_types_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: tutor_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_sessions ALTER COLUMN id SET DEFAULT nextval('public.tutor_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: zoom_meeting_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_meeting_logs ALTER COLUMN id SET DEFAULT nextval('public.zoom_meeting_logs_id_seq'::regclass);


--
-- Name: zoomwebhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoomwebhooks ALTER COLUMN id SET DEFAULT nextval('public.zoomwebhooks_id_seq'::regclass);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: ai_certificate_issuances ai_certificate_issuances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_certificate_issuances
    ADD CONSTRAINT ai_certificate_issuances_pkey PRIMARY KEY (id);


--
-- Name: ai_certificates ai_certificates_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_certificates
    ADD CONSTRAINT ai_certificates_code_key UNIQUE (code);


--
-- Name: ai_certificates ai_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_certificates
    ADD CONSTRAINT ai_certificates_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: badge_rules badge_rules_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badge_rules
    ADD CONSTRAINT badge_rules_code_key UNIQUE (code);


--
-- Name: badge_rules badge_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badge_rules
    ADD CONSTRAINT badge_rules_pkey PRIMARY KEY (id);


--
-- Name: catalog_collection_items catalog_collection_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_collection_items
    ADD CONSTRAINT catalog_collection_items_pkey PRIMARY KEY (collection_id, catalog_slug);


--
-- Name: catalog_collection catalog_collection_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_collection
    ADD CONSTRAINT catalog_collection_pkey PRIMARY KEY (id);


--
-- Name: certificates certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_pkey PRIMARY KEY (id);


--
-- Name: certifications certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications
    ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: course_entitlements course_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_entitlements
    ADD CONSTRAINT course_entitlements_pkey PRIMARY KEY (id);


--
-- Name: course_entitlements course_entitlements_user_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_entitlements
    ADD CONSTRAINT course_entitlements_user_id_course_id_key UNIQUE (user_id, course_id);


--
-- Name: course_outlines course_outlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_outlines
    ADD CONSTRAINT course_outlines_pkey PRIMARY KEY (id);


--
-- Name: course_progress course_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_progress
    ADD CONSTRAINT course_progress_pkey PRIMARY KEY (id);


--
-- Name: course_purchases course_purchases_course_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_purchases
    ADD CONSTRAINT course_purchases_course_id_student_id_key UNIQUE (course_id, student_id);


--
-- Name: course_purchases course_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_purchases
    ADD CONSTRAINT course_purchases_pkey PRIMARY KEY (id);


--
-- Name: course_reviews course_reviews_course_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_reviews
    ADD CONSTRAINT course_reviews_course_id_student_id_key UNIQUE (course_id, student_id);


--
-- Name: course_reviews course_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_reviews
    ADD CONSTRAINT course_reviews_pkey PRIMARY KEY (id);


--
-- Name: course_text_read course_text_read_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_text_read
    ADD CONSTRAINT course_text_read_pkey PRIMARY KEY (user_id, course_id, week, source_url);


--
-- Name: course_video_watch course_video_watch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_video_watch
    ADD CONSTRAINT course_video_watch_pkey PRIMARY KEY (user_id, course_id, week, video_id);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: earnings_balances earnings_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.earnings_balances
    ADD CONSTRAINT earnings_balances_pkey PRIMARY KEY (user_id, currency);


--
-- Name: email_unsubscribes email_unsubscribes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_pkey PRIMARY KEY (id);


--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);


--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: oer_books oer_books_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_books
    ADD CONSTRAINT oer_books_pkey PRIMARY KEY (id);


--
-- Name: oer_wrapped_book oer_wrapped_book_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_wrapped_book
    ADD CONSTRAINT oer_wrapped_book_pkey PRIMARY KEY (book_id);


--
-- Name: oer_wrapped_course oer_wrapped_course_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_wrapped_course
    ADD CONSTRAINT oer_wrapped_course_course_id_key UNIQUE (course_id);


--
-- Name: oer_wrapped_course oer_wrapped_course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_wrapped_course
    ADD CONSTRAINT oer_wrapped_course_pkey PRIMARY KEY (id);


--
-- Name: org_assignment_enrollments org_assignment_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_assignment_enrollments
    ADD CONSTRAINT org_assignment_enrollments_pkey PRIMARY KEY (assignment_id, user_id);


--
-- Name: org_attempt_answers org_attempt_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attempt_answers
    ADD CONSTRAINT org_attempt_answers_pkey PRIMARY KEY (id);


--
-- Name: org_attempts org_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attempts
    ADD CONSTRAINT org_attempts_pkey PRIMARY KEY (id);


--
-- Name: org_course_assignment_submissions org_course_assignment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignment_submissions
    ADD CONSTRAINT org_course_assignment_submissions_pkey PRIMARY KEY (id);


--
-- Name: org_course_assignments org_course_assignments_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignments
    ADD CONSTRAINT org_course_assignments_invite_code_key UNIQUE (invite_code);


--
-- Name: org_course_assignments org_course_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignments
    ADD CONSTRAINT org_course_assignments_pkey PRIMARY KEY (id);


--
-- Name: org_exam_grading_bands org_exam_grading_bands_org_id_scheme_name_grade_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_grading_bands
    ADD CONSTRAINT org_exam_grading_bands_org_id_scheme_name_grade_key UNIQUE (org_id, scheme_name, grade);


--
-- Name: org_exam_grading_bands org_exam_grading_bands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_grading_bands
    ADD CONSTRAINT org_exam_grading_bands_pkey PRIMARY KEY (id);


--
-- Name: org_exam_results org_exam_results_org_id_session_id_student_user_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_results
    ADD CONSTRAINT org_exam_results_org_id_session_id_student_user_id_subject_key UNIQUE (org_id, session_id, student_user_id, subject);


--
-- Name: org_exam_results org_exam_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_results
    ADD CONSTRAINT org_exam_results_pkey PRIMARY KEY (id);


--
-- Name: org_exam_sessions org_exam_sessions_org_id_term_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_sessions
    ADD CONSTRAINT org_exam_sessions_org_id_term_id_label_key UNIQUE (org_id, term_id, label);


--
-- Name: org_exam_sessions org_exam_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_sessions
    ADD CONSTRAINT org_exam_sessions_pkey PRIMARY KEY (id);


--
-- Name: org_exam_student_overall org_exam_student_overall_org_id_session_id_student_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall
    ADD CONSTRAINT org_exam_student_overall_org_id_session_id_student_user_id_key UNIQUE (org_id, session_id, student_user_id);


--
-- Name: org_exam_student_overall org_exam_student_overall_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall
    ADD CONSTRAINT org_exam_student_overall_pkey PRIMARY KEY (id);


--
-- Name: org_exam_terms org_exam_terms_org_id_year_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_terms
    ADD CONSTRAINT org_exam_terms_org_id_year_label_key UNIQUE (org_id, year, label);


--
-- Name: org_exam_terms org_exam_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_terms
    ADD CONSTRAINT org_exam_terms_pkey PRIMARY KEY (id);


--
-- Name: org_instructor_profiles org_instructor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_instructor_profiles
    ADD CONSTRAINT org_instructor_profiles_pkey PRIMARY KEY (org_id, user_id);


--
-- Name: org_invites org_invites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_code_key UNIQUE (code);


--
-- Name: org_invites org_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_pkey PRIMARY KEY (id);


--
-- Name: org_learner_attendance org_learner_attendance_org_id_user_id_term_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_org_id_user_id_term_id_key UNIQUE (org_id, user_id, term_id);


--
-- Name: org_learner_attendance org_learner_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_pkey PRIMARY KEY (id);


--
-- Name: org_learner_profiles org_learner_profiles_org_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_profiles
    ADD CONSTRAINT org_learner_profiles_org_id_user_id_key UNIQUE (org_id, user_id);


--
-- Name: org_learner_profiles org_learner_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_profiles
    ADD CONSTRAINT org_learner_profiles_pkey PRIMARY KEY (id);


--
-- Name: org_memberships org_memberships_org_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_org_user_key UNIQUE (org_id, user_id);


--
-- Name: org_quiz_attempts org_quiz_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_quiz_attempts
    ADD CONSTRAINT org_quiz_attempts_pkey PRIMARY KEY (id);


--
-- Name: org_subscription_payments org_subscription_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_subscription_payments
    ADD CONSTRAINT org_subscription_payments_pkey PRIMARY KEY (id);


--
-- Name: org_subscriptions org_subscriptions_org_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_subscriptions
    ADD CONSTRAINT org_subscriptions_org_key UNIQUE (org_id);


--
-- Name: org_subscriptions org_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_subscriptions
    ADD CONSTRAINT org_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: org_webhook_deliveries org_webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_webhook_deliveries
    ADD CONSTRAINT org_webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_owner_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_user_id_key UNIQUE (owner_user_id);


--
-- Name: organizations organizations_owner_user_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_user_id_slug_key UNIQUE (owner_user_id, slug);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: packages packages_unique_credits_currency; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_unique_credits_currency UNIQUE (credits, currency);


--
-- Name: participants participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participants
    ADD CONSTRAINT participants_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_transaction_id_key UNIQUE (transaction_id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_category_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['Mathematics'::text, 'Sciences'::text, 'Programming'::text, 'Languages'::text, 'Art & Design'::text, 'Wellness'::text])))) NOT VALID;


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);


--
-- Name: classvault_purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: classvault_purchases purchases_student_id_video_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT purchases_student_id_video_id_key UNIQUE (student_id, class_id);


--
-- Name: quiz_attempts quiz_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id);


--
-- Name: quizzes quizzes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_pkey PRIMARY KEY (id);


--
-- Name: recorded_video_reviews recorded_video_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews
    ADD CONSTRAINT recorded_video_reviews_pkey PRIMARY KEY (id);


--
-- Name: recorded_video_reviews recorded_video_reviews_video_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews
    ADD CONSTRAINT recorded_video_reviews_video_id_student_id_key UNIQUE (video_id, student_id);


--
-- Name: recorded_videos recorded_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_videos
    ADD CONSTRAINT recorded_videos_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: session_participants session_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_pkey PRIMARY KEY (id);


--
-- Name: session_types session_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_types
    ADD CONSTRAINT session_types_pkey PRIMARY KEY (id);


--
-- Name: session_types session_types_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_types
    ADD CONSTRAINT session_types_type_key UNIQUE (type);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: third_party_catalog third_party_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.third_party_catalog
    ADD CONSTRAINT third_party_catalog_pkey PRIMARY KEY (slug);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: transcripts transcripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_pkey PRIMARY KEY (id);


--
-- Name: tutor_sessions tutor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_sessions
    ADD CONSTRAINT tutor_sessions_pkey PRIMARY KEY (id);


--
-- Name: ai_certificate_issuances uniq_ai_issuance_user_course_sku; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_certificate_issuances
    ADD CONSTRAINT uniq_ai_issuance_user_course_sku UNIQUE (user_id, course_id, sku_code);


--
-- Name: recorded_video_reviews uniq_video_student; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews
    ADD CONSTRAINT uniq_video_student UNIQUE (video_id, student_id);


--
-- Name: conversations unique_conversation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT unique_conversation UNIQUE (sender_id, recipient_id);


--
-- Name: course_video_watch uq_watch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_video_watch
    ADD CONSTRAINT uq_watch UNIQUE (user_id, course_id, week, video_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: zoom_meeting_logs zoom_meeting_logs_meeting_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_meeting_logs
    ADD CONSTRAINT zoom_meeting_logs_meeting_id_key UNIQUE (meeting_id);


--
-- Name: zoom_meeting_logs zoom_meeting_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoom_meeting_logs
    ADD CONSTRAINT zoom_meeting_logs_pkey PRIMARY KEY (id);


--
-- Name: zoomwebhooks zoomwebhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zoomwebhooks
    ADD CONSTRAINT zoomwebhooks_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribes_email_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_unsubscribes_email_uidx ON public.email_unsubscribes USING btree (lower(email));


--
-- Name: idx_ai_cert_issuances_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_cert_issuances_course ON public.ai_certificate_issuances USING btree (course_id);


--
-- Name: idx_ai_cert_issuances_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_cert_issuances_user ON public.ai_certificate_issuances USING btree (user_id);


--
-- Name: idx_catalog_collection_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_catalog_collection_kind ON public.catalog_collection USING btree (content_kind, created_at);


--
-- Name: idx_cc_items_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cc_items_collection ON public.catalog_collection_items USING btree (collection_id);


--
-- Name: idx_certificates_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_certificates_student ON public.certificates USING btree (student_id, created_at DESC);


--
-- Name: idx_collection_items_collection_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_collection_items_collection_id ON public.catalog_collection_items USING btree (collection_id);


--
-- Name: idx_course_entitlements_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_entitlements_course ON public.course_entitlements USING btree (course_id);


--
-- Name: idx_course_entitlements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_entitlements_user ON public.course_entitlements USING btree (user_id);


--
-- Name: idx_course_outlines_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_outlines_course_id ON public.course_outlines USING btree (course_id);


--
-- Name: idx_course_outlines_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_outlines_created_at ON public.course_outlines USING btree (created_at);


--
-- Name: idx_course_progress_course_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_progress_course_student ON public.course_progress USING btree (course_id, student_id);


--
-- Name: idx_course_purchases_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_purchases_course ON public.course_purchases USING btree (course_id);


--
-- Name: idx_course_purchases_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_purchases_student ON public.course_purchases USING btree (student_id);


--
-- Name: idx_course_reviews_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_reviews_course ON public.course_reviews USING btree (course_id);


--
-- Name: idx_course_reviews_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_reviews_course_id ON public.course_reviews USING btree (course_id);


--
-- Name: idx_course_reviews_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_course_reviews_student_id ON public.course_reviews USING btree (student_id);


--
-- Name: idx_courses_catalog_collection_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_catalog_collection_id ON public.courses USING btree (catalog_collection_id);


--
-- Name: idx_courses_course_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_course_size ON public.courses USING btree (course_size);


--
-- Name: idx_courses_not_ai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_not_ai ON public.courses USING btree (created_at DESC) WHERE (is_ai_generated = false);


--
-- Name: idx_courses_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_rating ON public.courses USING btree (avg_rating DESC, ratings_count DESC);


--
-- Name: idx_courses_source_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_source_kind ON public.courses USING btree (source_kind);


--
-- Name: idx_courses_title_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_courses_title_ci ON public.courses USING btree (lower(title));


--
-- Name: idx_lessons_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_course_id ON public.lessons USING btree (course_id);


--
-- Name: idx_lessons_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lessons_created_at ON public.lessons USING btree (created_at);


--
-- Name: idx_oer_books_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oer_books_slug ON public.oer_books USING btree (slug);


--
-- Name: idx_oer_wrapped_course_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oer_wrapped_course_catalog ON public.oer_wrapped_course USING btree (catalog_provider, catalog_slug);


--
-- Name: idx_oer_wrapped_course_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oer_wrapped_course_course ON public.oer_wrapped_course USING btree (course_id);


--
-- Name: idx_org_attempt_answers_att; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_attempt_answers_att ON public.org_attempt_answers USING btree (attempt_id);


--
-- Name: idx_org_attempts_assign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_attempts_assign ON public.org_attempts USING btree (assignment_id);


--
-- Name: idx_org_attempts_org_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_attempts_org_time ON public.org_quiz_attempts USING btree (org_id, started_at);


--
-- Name: idx_org_attempts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_attempts_user ON public.org_attempts USING btree (user_id);


--
-- Name: idx_org_course_assignments_org_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_course_assignments_org_class ON public.org_course_assignments USING btree (org_id, org_class_label);


--
-- Name: idx_org_course_assignments_org_class_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_course_assignments_org_class_subject ON public.org_course_assignments USING btree (org_id, org_class_label, org_subject_key);


--
-- Name: idx_org_course_assignments_org_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_course_assignments_org_subject ON public.org_course_assignments USING btree (org_id, org_subject_key);


--
-- Name: idx_org_exam_overall_org_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_exam_overall_org_session ON public.org_exam_student_overall USING btree (org_id, session_id);


--
-- Name: idx_org_exam_overall_org_session_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_exam_overall_org_session_class ON public.org_exam_student_overall USING btree (org_id, session_id, class_label);


--
-- Name: idx_org_exam_results_org_session_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_exam_results_org_session_student ON public.org_exam_results USING btree (org_id, session_id, student_user_id);


--
-- Name: idx_org_instructor_profiles_org_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_instructor_profiles_org_id ON public.org_instructor_profiles USING btree (org_id);


--
-- Name: idx_org_instructor_profiles_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_instructor_profiles_subject ON public.org_instructor_profiles USING btree (org_id, subject);


--
-- Name: idx_org_invites_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_invites_org ON public.org_invites USING btree (org_id);


--
-- Name: idx_org_sub_payments_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_sub_payments_org ON public.org_subscription_payments USING btree (org_id);


--
-- Name: idx_org_subscriptions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_subscriptions_active ON public.org_subscriptions USING btree (org_id, active);


--
-- Name: idx_org_subscriptions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_subscriptions_org ON public.org_subscriptions USING btree (org_id);


--
-- Name: idx_org_webhook_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_webhook_deliveries_status ON public.org_webhook_deliveries USING btree (status, created_at);


--
-- Name: idx_payments_capture_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_capture_id ON public.payments USING btree (capture_id);


--
-- Name: idx_payments_certificate_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_certificate_id ON public.payments USING btree (certificate_id);


--
-- Name: idx_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at);


--
-- Name: idx_payments_fee_total_usd; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_fee_total_usd ON public.payments USING btree (fee_total_usd);


--
-- Name: idx_payments_meta_course; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_meta_course ON public.payments USING btree (((meta ->> 'courseId'::text)));


--
-- Name: idx_payments_meta_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_meta_purpose ON public.payments USING btree (((meta ->> 'purpose'::text)));


--
-- Name: idx_payments_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_method ON public.payments USING btree (payment_method);


--
-- Name: idx_payments_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider ON public.payments USING btree (provider);


--
-- Name: idx_payments_provider_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_provider_order_id ON public.payments USING btree (provider_order_id);


--
-- Name: idx_payments_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_transaction_id ON public.payments USING btree (transaction_id);


--
-- Name: idx_payments_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_status ON public.payments USING btree (user_id, status);


--
-- Name: idx_profiles_tutor_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tutor_country ON public.profiles USING btree (country_code) WHERE (role = 'tutor'::text);


--
-- Name: idx_profiles_tutor_grade_bands_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tutor_grade_bands_gin ON public.profiles USING gin (grade_bands) WHERE (role = 'tutor'::text);


--
-- Name: idx_profiles_tutor_region; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tutor_region ON public.profiles USING btree (region) WHERE (role = 'tutor'::text);


--
-- Name: idx_quiz_attempts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_attempts_created_at ON public.quiz_attempts USING btree (created_at);


--
-- Name: idx_quiz_attempts_quiz_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quiz_attempts_quiz_id ON public.quiz_attempts USING btree (quiz_id);


--
-- Name: idx_quizzes_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_course_id ON public.quizzes USING btree (course_id);


--
-- Name: idx_quizzes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizzes_created_at ON public.quizzes USING btree (created_at);


--
-- Name: idx_third_party_catalog_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_third_party_catalog_slug ON public.third_party_catalog USING btree (slug);


--
-- Name: idx_transcripts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transcripts_student ON public.transcripts USING btree (student_id);


--
-- Name: ix_oer_books_lower_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_oer_books_lower_title ON public.oer_books USING btree (lower(title));


--
-- Name: org_assignment_enrollments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_assignment_enrollments_user_idx ON public.org_assignment_enrollments USING btree (user_id);


--
-- Name: org_attempt_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_attempt_unique ON public.org_quiz_attempts USING btree (assignment_id, user_id, attempt_no);


--
-- Name: org_course_assignments_org_course_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_course_assignments_org_course_uidx ON public.org_course_assignments USING btree (org_id, course_id);


--
-- Name: org_learner_profiles_org_id_admission_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_learner_profiles_org_id_admission_code_key ON public.org_learner_profiles USING btree (org_id, admission_code) WHERE (admission_code IS NOT NULL);


--
-- Name: org_memberships_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_memberships_org_idx ON public.org_memberships USING btree (org_id);


--
-- Name: org_memberships_org_user_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_memberships_org_user_uidx ON public.org_memberships USING btree (org_id, user_id);


--
-- Name: org_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_memberships_user_idx ON public.org_memberships USING btree (user_id);


--
-- Name: org_quiz_attempts_assign_user_attempt_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_quiz_attempts_assign_user_attempt_uniq ON public.org_quiz_attempts USING btree (assignment_id, user_id, attempt_no);


--
-- Name: org_quiz_attempts_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_quiz_attempts_org_idx ON public.org_quiz_attempts USING btree (org_id);


--
-- Name: org_quiz_attempts_unique_try; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_quiz_attempts_unique_try ON public.org_quiz_attempts USING btree (assignment_id, user_id, attempt_no);


--
-- Name: org_subscription_payments_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_subscription_payments_org_idx ON public.org_subscription_payments USING btree (org_id, status);


--
-- Name: org_subscriptions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_subscriptions_active_idx ON public.org_subscriptions USING btree (org_id, active) WHERE active;


--
-- Name: payouts_tutor_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payouts_tutor_status_idx ON public.payouts USING btree (tutor_id, status);


--
-- Name: uix_course_reviews_course_student; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uix_course_reviews_course_student ON public.course_reviews USING btree (course_id, student_id);


--
-- Name: uniq_achievements_triplet; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_achievements_triplet ON public.achievements USING btree (student_id, course_id, title);


--
-- Name: uniq_collection_title_subject_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_collection_title_subject_ci ON public.catalog_collection USING btree (lower(title), subject);


--
-- Name: uniq_enrollments_student_course; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_enrollments_student_course ON public.enrollments USING btree (student_id, course_id);


--
-- Name: uniq_entitlements_student; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_entitlements_student ON public.course_entitlements USING btree (student_id, course_id) WHERE (student_id IS NOT NULL);


--
-- Name: uq_oer_books_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_oer_books_slug ON public.oer_books USING btree (slug);


--
-- Name: ux_achievements_unique_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_achievements_unique_rule ON public.achievements USING btree (student_id, course_id, rule_code);


--
-- Name: ux_catalog_collection_lower_title; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_catalog_collection_lower_title ON public.catalog_collection USING btree (lower(title));


--
-- Name: ux_catalog_collection_title_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_catalog_collection_title_subject ON public.catalog_collection USING btree (lower(title), subject);


--
-- Name: ux_cci_collection_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_cci_collection_slug ON public.catalog_collection_items USING btree (collection_id, catalog_slug);


--
-- Name: ux_course_progress_student_course_week; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_course_progress_student_course_week ON public.course_progress USING btree (student_id, course_id, week);


--
-- Name: ux_courses_provider_lower_title; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_courses_provider_lower_title ON public.courses USING btree (provider, lower(title));


--
-- Name: ux_oer_books_provider_lower_title; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_oer_books_provider_lower_title ON public.oer_books USING btree (provider, lower(title));


--
-- Name: ux_oer_wrapped_course_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_oer_wrapped_course_slug ON public.oer_wrapped_course USING btree (catalog_slug);


--
-- Name: ux_org_instructor_profiles_org_staff_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_org_instructor_profiles_org_staff_code ON public.org_instructor_profiles USING btree (org_id, staff_code) WHERE (staff_code IS NOT NULL);


--
-- Name: ux_tpc_provider_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tpc_provider_slug ON public.third_party_catalog USING btree (provider, slug);


--
-- Name: catalog_collection catalog_collection_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER catalog_collection_set_updated_at BEFORE UPDATE ON public.catalog_collection FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: packages packages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER packages_set_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: org_subscriptions set_org_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_org_subscriptions_updated_at BEFORE UPDATE ON public.org_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: courses trg_courses_size_defaults; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_courses_size_defaults BEFORE INSERT OR UPDATE OF course_size ON public.courses FOR EACH ROW EXECUTE FUNCTION public.courses_apply_size_defaults();


--
-- Name: org_course_assignments trg_org_course_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_org_course_assignments_updated_at BEFORE UPDATE ON public.org_course_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: courses trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: achievements achievements_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: achievements achievements_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_certificate_issuances ai_certificate_issuances_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_certificate_issuances
    ADD CONSTRAINT ai_certificate_issuances_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.ai_certificates(id);


--
-- Name: catalog_collection_items catalog_collection_items_catalog_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_collection_items
    ADD CONSTRAINT catalog_collection_items_catalog_slug_fkey FOREIGN KEY (catalog_slug) REFERENCES public.third_party_catalog(slug) ON DELETE CASCADE;


--
-- Name: catalog_collection_items catalog_collection_items_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalog_collection_items
    ADD CONSTRAINT catalog_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.catalog_collection(id) ON DELETE CASCADE;


--
-- Name: certificates certificates_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: certificates certificates_quiz_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_quiz_attempt_id_fkey FOREIGN KEY (quiz_attempt_id) REFERENCES public.quiz_attempts(id) ON DELETE RESTRICT;


--
-- Name: certificates certificates_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certificates
    ADD CONSTRAINT certificates_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: certifications certifications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.certifications
    ADD CONSTRAINT certifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: course_outlines course_outlines_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_outlines
    ADD CONSTRAINT course_outlines_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;


--
-- Name: course_progress course_progress_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_progress
    ADD CONSTRAINT course_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id);


--
-- Name: course_progress course_progress_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_progress
    ADD CONSTRAINT course_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_purchases course_purchases_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_purchases
    ADD CONSTRAINT course_purchases_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_purchases course_purchases_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_purchases
    ADD CONSTRAINT course_purchases_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_purchases course_purchases_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_purchases
    ADD CONSTRAINT course_purchases_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: course_reviews course_reviews_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_reviews
    ADD CONSTRAINT course_reviews_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: course_reviews course_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_reviews
    ADD CONSTRAINT course_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: courses courses_catalog_collection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_catalog_collection_id_fkey FOREIGN KEY (catalog_collection_id) REFERENCES public.catalog_collection(id) ON DELETE SET NULL;


--
-- Name: courses courses_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_unsubscribes email_unsubscribes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: enrollments enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: classvault_purchases fk_cvp_class; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT fk_cvp_class FOREIGN KEY (class_id) REFERENCES public.recorded_videos(id) ON DELETE CASCADE;


--
-- Name: classvault_purchases fk_cvp_student; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT fk_cvp_student FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: classvault_purchases fk_cvp_tutor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT fk_cvp_tutor FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: lessons lessons_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: oer_wrapped_course oer_wrapped_course_catalog_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_wrapped_course
    ADD CONSTRAINT oer_wrapped_course_catalog_slug_fkey FOREIGN KEY (catalog_slug) REFERENCES public.third_party_catalog(slug) ON DELETE CASCADE;


--
-- Name: oer_wrapped_course oer_wrapped_course_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oer_wrapped_course
    ADD CONSTRAINT oer_wrapped_course_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: org_assignment_enrollments org_assignment_enrollments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_assignment_enrollments
    ADD CONSTRAINT org_assignment_enrollments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.org_course_assignments(id) ON DELETE CASCADE;


--
-- Name: org_assignment_enrollments org_assignment_enrollments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_assignment_enrollments
    ADD CONSTRAINT org_assignment_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_attempt_answers org_attempt_answers_attempt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attempt_answers
    ADD CONSTRAINT org_attempt_answers_attempt_id_fkey FOREIGN KEY (attempt_id) REFERENCES public.org_attempts(id) ON DELETE CASCADE;


--
-- Name: org_course_assignment_submissions org_course_assignment_submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignment_submissions
    ADD CONSTRAINT org_course_assignment_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.org_course_assignments(id) ON DELETE CASCADE;


--
-- Name: org_course_assignment_submissions org_course_assignment_submissions_learner_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignment_submissions
    ADD CONSTRAINT org_course_assignment_submissions_learner_fk FOREIGN KEY (learner_id) REFERENCES public.org_learner_profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: org_course_assignment_submissions org_course_assignment_submissions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignment_submissions
    ADD CONSTRAINT org_course_assignment_submissions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_course_assignments org_course_assignments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignments
    ADD CONSTRAINT org_course_assignments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: org_course_assignments org_course_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignments
    ADD CONSTRAINT org_course_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: org_course_assignments org_course_assignments_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_course_assignments
    ADD CONSTRAINT org_course_assignments_org_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_exam_grading_bands org_exam_grading_bands_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_grading_bands
    ADD CONSTRAINT org_exam_grading_bands_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_exam_results org_exam_results_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_results
    ADD CONSTRAINT org_exam_results_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_exam_results org_exam_results_student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_results
    ADD CONSTRAINT org_exam_results_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_exam_sessions org_exam_sessions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_sessions
    ADD CONSTRAINT org_exam_sessions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_exam_sessions org_exam_sessions_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_sessions
    ADD CONSTRAINT org_exam_sessions_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_exam_terms(id) ON DELETE SET NULL;


--
-- Name: org_exam_student_overall org_exam_student_overall_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall
    ADD CONSTRAINT org_exam_student_overall_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_exam_student_overall org_exam_student_overall_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall
    ADD CONSTRAINT org_exam_student_overall_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.org_exam_sessions(id) ON DELETE CASCADE;


--
-- Name: org_exam_student_overall org_exam_student_overall_student_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_student_overall
    ADD CONSTRAINT org_exam_student_overall_student_user_id_fkey FOREIGN KEY (student_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_exam_terms org_exam_terms_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_exam_terms
    ADD CONSTRAINT org_exam_terms_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_instructor_profiles org_instructor_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_instructor_profiles
    ADD CONSTRAINT org_instructor_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_instructor_profiles org_instructor_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_instructor_profiles
    ADD CONSTRAINT org_instructor_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_invites org_invites_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_learner_attendance org_learner_attendance_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_learner_attendance org_learner_attendance_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.org_exam_sessions(id) ON DELETE SET NULL;


--
-- Name: org_learner_attendance org_learner_attendance_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.org_exam_terms(id) ON DELETE CASCADE;


--
-- Name: org_learner_attendance org_learner_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_attendance
    ADD CONSTRAINT org_learner_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_learner_profiles org_learner_profiles_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_profiles
    ADD CONSTRAINT org_learner_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_learner_profiles org_learner_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_learner_profiles
    ADD CONSTRAINT org_learner_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_memberships org_memberships_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_org_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_memberships org_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_memberships
    ADD CONSTRAINT org_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: org_quiz_attempts org_quiz_attempts_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_quiz_attempts
    ADD CONSTRAINT org_quiz_attempts_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.org_course_assignments(id) ON DELETE CASCADE;


--
-- Name: org_quiz_attempts org_quiz_attempts_org_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_quiz_attempts
    ADD CONSTRAINT org_quiz_attempts_org_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_quiz_attempts org_quiz_attempts_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_quiz_attempts
    ADD CONSTRAINT org_quiz_attempts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_quiz_attempts org_quiz_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_quiz_attempts
    ADD CONSTRAINT org_quiz_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: org_subscription_payments org_subscription_payments_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_subscription_payments
    ADD CONSTRAINT org_subscription_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_subscriptions org_subscriptions_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_subscriptions
    ADD CONSTRAINT org_subscriptions_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: org_webhook_deliveries org_webhook_deliveries_org_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_webhook_deliveries
    ADD CONSTRAINT org_webhook_deliveries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organizations organizations_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_certificate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_certificate_id_fkey FOREIGN KEY (certificate_id) REFERENCES public.certificates(id) ON DELETE CASCADE;


--
-- Name: payments payments_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: classvault_purchases purchases_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT purchases_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: classvault_purchases purchases_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classvault_purchases
    ADD CONSTRAINT purchases_video_id_fkey FOREIGN KEY (class_id) REFERENCES public.recorded_videos(id) ON DELETE CASCADE;


--
-- Name: quiz_attempts quiz_attempts_quiz_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;


--
-- Name: quizzes quizzes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizzes
    ADD CONSTRAINT quizzes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;


--
-- Name: recorded_video_reviews recorded_video_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews
    ADD CONSTRAINT recorded_video_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: recorded_video_reviews recorded_video_reviews_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_video_reviews
    ADD CONSTRAINT recorded_video_reviews_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.recorded_videos(id) ON DELETE CASCADE;


--
-- Name: recorded_videos recorded_videos_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recorded_videos
    ADD CONSTRAINT recorded_videos_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.tutor_sessions(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: session_participants session_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_participants
    ADD CONSTRAINT session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.tutor_sessions(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: transcripts transcripts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcripts
    ADD CONSTRAINT transcripts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tutor_sessions tutor_sessions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_sessions
    ADD CONSTRAINT tutor_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- Name: tutor_sessions tutor_sessions_tutor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tutor_sessions
    ADD CONSTRAINT tutor_sessions_tutor_id_fkey FOREIGN KEY (tutor_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

