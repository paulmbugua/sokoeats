// apps/web/src/pages/ProfileDetailPage.web.tsx
import React, { useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useProfileDetail from '@mytutorapp/shared/hooks/useProfileDetail';
import useProfileCard from '@mytutorapp/shared/hooks/useProfileCard';
import { useShopContext } from '@mytutorapp/shared/context';
import type { TutorProfile } from '@mytutorapp/shared/types';
import debounce from 'lodash.debounce';
import Navbar from '../components/Navbar.web';
import Footer from '../components/Footer.web';
import Spinner from '../components/Spinner.web';
import ProfileActions from '../components/ProfileActions.web';
import TutorReviews from '../components/TutorReviews.web';
import { motion, useReducedMotion, Variants } from 'framer-motion';

/* ----------------------------- Motion variants ---------------------------- */
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

const sectionStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, when: 'beforeChildren' } },
};

const listStagger: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/* ----------------------------- Defaults ----------------------------------- */
const defaultTutorProfile: TutorProfile = {
  id: '',
  user_id: '',
  user: '',
  name: '',
  category: '',
  gallery: [],
  video: '',
  role: undefined,
  status: undefined,
  lastOnline: undefined,
  description: {},
  recommended: [],
  languages: [],
  pricing: { privateSession: '0', groupSession: '0', lecture: '0', workshop: '0' },
  rating: 0,
  totalReviews: 0,
};

/* ───────────────────────────────── Component ─────────────────────────────── */
const ProfileDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion() ?? false;

  const { backendUrl, token } = useShopContext();

  const {
    tutorProfile,
    loading,
    showChat,
    newMessage,
    setNewMessage,
    toggleChat,
    handleCreateSession,
    handleSendMessage,
    chatMessages,
    selectedImage,
    handleImageClick,
    closeModal,
  } = useProfileDetail(id!, backendUrl);

  const resolveAsset = (raw: string) => (raw?.startsWith('/') ? `${backendUrl}${raw}` : raw);

  const debouncedSendMessage = useMemo(() => debounce(handleSendMessage, 300), [handleSendMessage]);
  useEffect(() => () => debouncedSendMessage.cancel(), [debouncedSendMessage]);

  const profile: TutorProfile = useMemo(() => {
    const tp = tutorProfile as Partial<TutorProfile> | undefined;
    return tp && tp.id ? (tp as TutorProfile) : defaultTutorProfile;
  }, [tutorProfile]);

  useProfileCard(profile, backendUrl, token);

  const pickDefaultSession = (pricing?: Record<string, number | string>) => {
    if (!pricing) return { type: '', cost: '' };
    const entries = Object.entries(pricing);
    if (!entries.length) return { type: '', cost: '' };
    const nonZero = entries.find(([, v]) => Number(v) > 0) ?? entries[0];
    const [type, price] = nonZero;
    return { type, cost: String(price ?? '') };
  };

  const onCreateSession = useCallback(() => {
    const subject = profile.category || 'General';
    const { type, cost } = pickDefaultSession(profile.pricing);

    const params = new URLSearchParams();
    params.set('tab', 'sessions');
    params.set('action', 'createSession');
    params.set('tutorId', (profile.user_id || profile.user) ?? '');
    params.set('tutorName', profile.name ?? '');
    params.set('subject', subject);
    if (type) params.set('sessionType', type);
    if (cost) params.set('sessionCost', cost);
    if (profile.pricing) params.set('pricing', JSON.stringify(profile.pricing));

    navigate(`/account?${params.toString()}`);
  }, [navigate, profile]);

  if (loading) {
    return (
      <div className="min-h-screen app-body flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tutorProfile) {
    return (
      <div className="min-h-screen app-body flex items-center justify-center">
        <p className="text-darkText dark:text-darkTextPrimary">Tutor profile not found.</p>
      </div>
    );
  }

  const statusColor =
    profile.status === 'Online'
      ? 'bg-green-500'
      : profile.status === 'Busy'
        ? 'bg-yellow-500'
        : profile.status === 'Free'
          ? 'bg-purple-500'
          : 'bg-gray-500';

  const languages = profile.languages ?? [];
  const expertise = profile.description?.expertise ?? [];
  const teachingStyle = profile.description?.teachingStyle ?? [];

  // Tutor-only display of School Grade / Year / Level, read from server fields
  const isTutor = (profile.role || '').toLowerCase() === 'tutor';
  const gradeRaw = (tutorProfile as any)?.school_grade ?? (tutorProfile as any)?.schoolGrade;
  const displayGrade = typeof gradeRaw === 'string' ? gradeRaw : '';

  const pricingSections: [string, string][] = [
    ['Private Session (60 mins)', profile.pricing.privateSession],
    ['Group Session (90 mins)', profile.pricing.groupSession],
    ['Workshop (120 mins)', profile.pricing.workshop],
    ['Lecture (180 mins)', profile.pricing.lecture],
  ];

  const aboutSections: [string, string[]][] = [
    ['Expertise', expertise],
    ['Teaching Style', teachingStyle],
  ];

  return (
    <div className="relative min-h-screen app-body overflow-x-hidden">
      {/* Top Nav */}
      <motion.div
        className="fixed top-0 left-0 w-full z-50"
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Navbar />
      </motion.div>

      {/* decorative glows */}
      {!prefersReducedMotion && (
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl bg-indigo-300/20" />
          <div className="absolute top-10 right-10 h-80 w-80 rounded-full blur-3xl bg-cyan-300/20" />
        </div>
      )}

      <main className="pt-24 md:pt-16 px-4 lg:px-8 max-w-7xl mx-auto space-y-12 pb-20">
        {/* Top Section */}
        <motion.section
          className="flex flex-col md:flex-row gap-8"
          variants={sectionStagger}
          initial="hidden"
          animate="show"
        >
          {/* Left column → Gallery + Video */}
          <motion.div className="w-full md:w-1/2 lg:w-2/5 space-y-4" variants={fadeUp}>
            <motion.img
              src={profile.gallery[0] ? resolveAsset(profile.gallery[0]) : '/default-image.jpg'}
              alt={profile.name}
              className="w-full h-80 md:h-[400px] object-cover rounded-lg shadow-lg cursor-pointer ring-1 ring-gray-200 dark:ring-darkCard"
              onClick={() => handleImageClick(profile.gallery[0] || '')}
              whileHover={{ scale: prefersReducedMotion ? 1 : 1.02 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            />

            {typeof profile.video === 'string' && profile.video.trim() !== '' && (
              <motion.video
                key={profile.video}
                src={resolveAsset(profile.video)}
                controls
                playsInline
                className="w-full h-40 md:h-44 object-cover rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-darkCard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
            )}
          </motion.div>

          {/* Right column → profile info */}
          <motion.div
            className="w-full md:flex-1 bg-white dark:bg-darkCard p-6 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-darkCard space-y-6"
            variants={fadeInScale}
            whileHover={{ y: prefersReducedMotion ? 0 : -2 }}
          >
            <div className="flex items-center space-x-4">
              <motion.img
                src={profile.gallery[0] ? resolveAsset(profile.gallery[0]) : '/default-avatar.jpg'}
                alt={profile.name}
                className="h-20 w-20 rounded-full shadow-md object-cover ring-1 ring-gray-200 dark:ring-darkCard"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
              <div>
                <motion.h2
                  className="text-2xl font-semibold"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
                >
                  {profile.name}
                </motion.h2>

                <motion.p
                  className="text-sm text-darkTextSecondary dark:text-darkTextSecondary"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}
                >
                  <span className="font-medium text-darkText dark:text-darkTextPrimary">
                    Category:
                  </span>{' '}
                  <span className="text-primary font-medium">{profile.category || 'N/A'}</span>
                </motion.p>

                <motion.p
                  className="text-sm text-darkTextSecondary dark:text-darkTextSecondary"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut', delay: 0.13 }}
                >
                  <span className="font-medium text-darkText dark:text-darkTextPrimary">
                    Speaks:
                  </span>{' '}
                  <span className="text-darkText dark:text-darkTextPrimary">
                    {languages.join(', ') || 'N/A'}
                  </span>
                </motion.p>

                {profile.status && (
                  <motion.span
                    className={`inline-block mt-2 px-3 py-1 text-xs rounded-full text-white ${statusColor}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.15 }}
                  >
                    {profile.status}
                  </motion.span>
                )}
              </div>
            </div>

            <motion.button
              onClick={onCreateSession}
              className="w-full bg-primary hover:bg-secondary text-white py-2 rounded-lg font-medium transition"
              whileHover={{ scale: prefersReducedMotion ? 1 : 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              Create Session
            </motion.button>

            <motion.div
              className="space-y-1 text-sm"
              variants={listStagger}
              initial="hidden"
              animate="show"
            >
              {pricingSections.map(([label, val]) => (
                <motion.div key={label} className="flex justify-between" variants={listItem}>
                  <span className="text-darkText dark:text-darkTextPrimary">{label}</span>
                  <span className="font-semibold text-darkText dark:text-darkTextPrimary">
                    {val} tokens
                  </span>
                </motion.div>
              ))}
            </motion.div>

            <ProfileActions
              recipientId={(profile.user_id || profile.user) as string}
              onSendMessage={toggleChat}
            />
          </motion.div>
        </motion.section>

        {/* About & Reviews */}
        <motion.section
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          variants={sectionStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
        >
          <motion.div
            className="lg:col-span-2 bg-white dark:bg-darkCard p-6 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-darkCard space-y-4"
            variants={fadeInScale}
          >
            <motion.h3 className="text-xl font-semibold text-primary" variants={fadeUp}>
              About Me
            </motion.h3>

            <motion.p
              className="text-darkText dark:text-darkTextPrimary"
              variants={fadeUp}
              transition={{ delay: 0.04 }}
            >
              {profile.description?.bio || 'No bio available.'}
            </motion.p>

            {/* Grade / Class — heading styled like About */}
            {isTutor && displayGrade && (
              <motion.div variants={fadeUp} transition={{ delay: 0.06 }}>
                <h3 className="text-xl font-semibold text-primary">Grade / Class</h3>
                <p className="text-darkText dark:text-darkTextPrimary mt-1">{displayGrade}</p>
              </motion.div>
            )}

            {/* Expertise / Teaching Style */}
            <motion.div className="grid grid-cols-1 sm:grid-cols-2 gap-4" variants={listStagger}>
              {aboutSections.map(([title, items]) => (
                <motion.div key={title} variants={listItem}>
                  <h4 className="text-lg font-semibold text-primary">{title}</h4>
                  {items.length > 0 ? (
                    <motion.div variants={listStagger} initial="hidden" animate="show">
                      {items.map((it, i) => (
                        <motion.p
                          key={i}
                          className="text-darkText dark:text-darkTextPrimary text-sm"
                          variants={listItem}
                        >
                          {it}
                        </motion.p>
                      ))}
                    </motion.div>
                  ) : (
                    <p className="text-mutedGray dark:text-darkTextSecondary text-sm">
                      Not specified
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            className="bg-white dark:bg-darkCard p-6 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-darkCard"
            variants={fadeInScale}
            whileHover={{ y: prefersReducedMotion ? 0 : -2 }}
          >
            <TutorReviews tutorId={(profile.user_id || profile.user) as string} />
          </motion.div>
        </motion.section>

        {/* Recommended Tutors */}
        <motion.section
          className="bg-white dark:bg-darkCard p-6 rounded-lg shadow-lg ring-1 ring-gray-200 dark:ring-darkCard space-y-4"
          variants={fadeInScale}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          whileHover={{ y: prefersReducedMotion ? 0 : -2 }}
        >
          <ProfileActions.Recommended recommended={profile.recommended} statusColor={statusColor} />
        </motion.section>
      </main>

      <Footer />

      {/* Lightbox for gallery image */}
      {selectedImage && (
        <motion.button
          type="button"
          onClick={closeModal}
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.img
            src={resolveAsset(selectedImage)}
            alt="Preview"
            className="max-h-[85vh] max-w-[92vw] rounded-xl shadow-2xl ring-1 ring-white/10 object-contain"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
          />
        </motion.button>
      )}
    </div>
  );
};

export default ProfileDetailPage;
