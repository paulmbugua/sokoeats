// apps/web/src/components/Navbar.web.tsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import {
  faBell,
  faMagnifyingGlass,
  faBars,
  faXmark,
  faMoon,
  faSun,
  faBuilding,
  faUser,
  faChalkboardTeacher,
  faGraduationCap,
} from '@fortawesome/free-solid-svg-icons';
import { useChatContext, useShopContext } from '@mytutorapp/shared/context';
import { useOrg } from '@mytutorapp/shared/hooks/useOrg';
import { useTheme } from '@mytutorapp/shared/hooks';
import {
  extractScopeHint,
  normalizeCountryLabel,
  parseSmartSearchIntent,
  resolveSearchTarget,
  type SearchTarget,
} from '@mytutorapp/shared/utils/smartSearchIntent';
import { appUrl, siteUrl } from '../lib/appOrigin';

type Props = {
  avatarUrl?: string;
};

const FALLBACK_AVATAR = (name = 'You') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=223649&color=ffffff`;

const Navbar: React.FC<Props> = ({ avatarUrl }) => {
  const { token, orgToken, backendUrl, profile, orgLogout, authMode } = useShopContext() as any;

  const { role } = useOrg({ enabled: Boolean(orgToken) || authMode === 'org' }) ?? {};
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount, chats } = useChatContext();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTarget, setSearchTarget] = useState<SearchTarget>('auto');

  const { theme, setTheme } = useTheme() as any;

  const isOrg = useMemo(() => {
    const onOrgRoute = location.pathname.startsWith('/org');
    return onOrgRoute || authMode === 'org';
  }, [location.pathname, authMode]);

  const normalizedRole = (role || '').toString().toLowerCase();
  const isLearnerRole = normalizedRole === 'learner' || normalizedRole === 'student';
  const isInstructorRole = normalizedRole === 'instructor' || normalizedRole === 'teacher';

  const orgPortalHref = useMemo(() => {
    if (!orgToken) return siteUrl('/institutions/login?next=/org');
    if (isLearnerRole) return appUrl('/org/learn');
    if (isInstructorRole) return appUrl('/org/instructor');
    return appUrl('/org/profile');
  }, [orgToken, isLearnerRole, isInstructorRole]);

  const handleOrgButtonClick = async (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    // Learner/Instructor = "switch account" behavior
    if (!orgToken || !orgLogout) return;
    if (!(isLearnerRole || isInstructorRole)) return;

    e.preventDefault();
    try {
      await orgLogout();
    } catch (err) {
      console.error('[Navbar] orgLogout error', err);
    }
    navigate(appUrl('/org/login'), { replace: true });
  };

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileSearchOpen) {
      const t = setTimeout(() => mobileSearchRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [mobileSearchOpen]);

  const profileAvatarRaw = (avatarUrl ||
    (profile as any)?.avatar ||
    (profile as any)?.photoUrl ||
    (profile as any)?.avatar_url ||
    (Array.isArray((profile as any)?.gallery) ? (profile as any).gallery[0] : undefined)) as
    | string
    | undefined;

  const resolvedAvatar = useMemo(() => {
    if (!profileAvatarRaw || profileAvatarRaw.length === 0) {
      return FALLBACK_AVATAR(profile?.name || 'You');
    }
    if (profileAvatarRaw.startsWith('/') && backendUrl) {
      return `${backendUrl.replace(/\/+$/, '')}${profileAvatarRaw}`;
    }
    return profileAvatarRaw;
  }, [profileAvatarRaw, backendUrl, profile?.name]);

  const avatarHref = useMemo(() => {
    if (orgToken) {
      if (isLearnerRole) return appUrl('/org/learn');
      if (isInstructorRole) return appUrl('/org/instructor');
      return appUrl('/org/profile');
    }
    return token ? siteUrl('/profile/me') : siteUrl('/login');
  }, [orgToken, isLearnerRole, isInstructorRole, token]);

  const myCoursesHref = siteUrl('/courses');

  const handleSearchSubmit = (raw?: string) => {
    const query = String(raw ?? searchQuery ?? '').trim();
    if (!query) return;

    const intent = parseSmartSearchIntent(query);
    const target = resolveSearchTarget(query, searchTarget);
    const country = intent.country ?? normalizeCountryLabel(query);

    const params = new URLSearchParams();
    params.set('q', query);

    if (intent.subject) params.set('subject', intent.subject);
    if (intent.gradeBand) params.set('gradeBand', intent.gradeBand);
    if (intent.level) params.set('level', intent.level);
    if (intent.minRating) params.set('minRating', String(intent.minRating));
    if (intent.maxPrice) params.set('maxPrice', String(intent.maxPrice));

    if (target === 'tutors') {
      if (country?.code) params.set('country', country.code);
      navigate(`/find-tutor?${params.toString()}`);
      return;
    }

    if (country?.name) params.set('country', country.name);

    if (target === 'library') {
      params.set('tab', 'library');
      const scope = extractScopeHint(query);
      if (scope !== 'all') params.set('scope', scope);
    } else {
      params.set('tab', 'courses');
    }

    navigate(`/resources?${params.toString()}`);
  };

  const handleThemeToggle = () => {
    const current = (theme || 'light').toString().toLowerCase();
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme?.(next);
  };

  const isDark = (theme || '').toString().toLowerCase() === 'dark';
  const totalUnreadCount = useMemo(() => {
    if (typeof unreadCount === 'number') return unreadCount;
    return chats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
  }, [unreadCount, chats]);

  const unreadBadgeLabel = totalUnreadCount > 99 ? '99+' : String(totalUnreadCount);
  const hasUnreadMessages = totalUnreadCount > 0;

  const handleNotificationsClick = () => {
    const latestUnreadChat = chats.find((chat) => (chat.unreadCount || 0) > 0);
    if (latestUnreadChat?.recipientId) {
      navigate(appUrl(`/messages?studentId=${encodeURIComponent(latestUnreadChat.recipientId)}`));
      return;
    }
    navigate(appUrl('/messages'));
  };

  // One responsive pill style used by Org shortcuts everywhere
  const ORG_PILL =
    'shrink-0 inline-flex items-center justify-center rounded-full ' +
    'h-10 px-3 sm:px-4 text-xs sm:text-sm font-semibold whitespace-nowrap ' +
    'bg-emerald-600 text-white ring-1 ring-emerald-700/25 shadow-sm transition ' +
    'hover:bg-emerald-500 hover:ring-emerald-700/40 ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ' +
    'dark:focus-visible:ring-offset-darkBg ' +
    // allow truncation if container is tight
    'max-w-[12rem] sm:max-w-none';

  const orgPillMeta = useMemo(() => {
    if (!isOrg) return null;

    if (!orgToken) {
      return {
        href: appUrl('/org/login'),
        label: 'Login',
        icon: faBuilding,
        title: 'Institution login',
      };
    }

    if (isLearnerRole) {
      return {
        href: appUrl('/org/learn'),
        label: 'Learner Home',
        icon: faGraduationCap,
        title: 'Org Learner Home',
      };
    }

    if (isInstructorRole) {
      return {
        href: appUrl('/org/instructor'),
        label: 'Instructor Home',
        icon: faChalkboardTeacher,
        title: 'Org Instructor Home',
      };
    }

    return {
      href: appUrl('/org/profile'),
      label: 'Org Profile',
      icon: faBuilding,
      title: 'Institution profile',
    };
  }, [isOrg, orgToken, isLearnerRole, isInstructorRole]);

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-darkBg border-b border-gray-200 dark:border-darkCard">
      <div className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-8">
        {/* Top bar */}
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2">
          {/* Left */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Hamburger (mobile) */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-xl h-10 w-10 bg-gray-100 dark:bg-[#172534] ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <FontAwesomeIcon icon={(mobileMenuOpen ? faXmark : faBars) as IconProp} />
            </button>

            {/* Brand */}
            <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="size-5 text-primary dark:text-darkTextPrimary shrink-0">
                <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">
                  <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" />
                </svg>
              </span>
              <h1 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                DayBreak
              </h1>
            </Link>

            {/* Desktop nav (collapses gracefully because left is min-w-0) */}
            <nav className="hidden md:flex items-center gap-6 ml-4">
              {token && (
                <Link
                  to={appUrl('/home')}
                  className="text-sm/6 hover:text-primary transition-colors"
                >
                  Home
                </Link>
              )}
              <Link to="/find-tutor" className="text-sm/6 hover:text-primary transition-colors">
                Find Tutors
              </Link>
              <Link to={myCoursesHref} className="text-sm/6 hover:text-primary transition-colors">
                My Courses
              </Link>
              <Link to="/resources" className="text-sm/6 hover:text-primary transition-colors">
                Resources
              </Link>
              <Link
                to={siteUrl('/robot-teacher')}
                className="text-sm/6 hover:text-primary transition-colors"
              >
                Learn with A.I
              </Link>

              {/* For Institutions (desktop) */}
              <Link
                to={orgPortalHref}
                state={!orgToken ? { next: '/org' } : undefined}
                onClick={handleOrgButtonClick}
                className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
              >
                For Institutions
              </Link>
            </nav>
          </div>

          {/* Right */}
          <div className="flex flex-1 justify-end items-center gap-2 sm:gap-3 min-w-0">
            {/* Desktop search */}
            <label className="hidden md:flex w-full max-w-lg h-10 min-w-0">
              <div className="flex w-full min-w-0 items-stretch rounded-xl ring-1 ring-gray-200 dark:ring-darkCard bg-gray-100 dark:bg-[#172534] focus-within:ring-primary transition">
                <div className="text-gray-500 dark:text-darkTextSecondary flex items-center justify-center pl-4">
                  <FontAwesomeIcon icon={faMagnifyingGlass as IconProp} />
                </div>
                <input
                  placeholder="Search"
                  className="w-full min-w-0 bg-transparent h-full px-3 outline-none placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchSubmit(searchQuery);
                  }}
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs px-2 text-gray-500 dark:text-darkTextSecondary"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
                <select
                  value={searchTarget}
                  onChange={(e) => setSearchTarget(e.target.value as SearchTarget)}
                  className="h-full bg-transparent text-xs px-2 text-gray-600 dark:text-darkTextSecondary border-l border-gray-200 dark:border-darkCard"
                  aria-label="Search target"
                >
                  <option value="auto">Auto</option>
                  <option value="courses">Courses</option>
                  <option value="library">Videos/Notes</option>
                  <option value="tutors">Tutors</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleSearchSubmit(searchQuery)}
                  className="h-full px-3 text-xs font-semibold text-white bg-[#3d99f5] rounded-r-xl"
                >
                  Go
                </button>
              </div>
            </label>

            {/* Mobile search button */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center rounded-xl h-10 w-10 bg-gray-100 dark:bg-[#172534] ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
              aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
              onClick={() => setMobileSearchOpen((v) => !v)}
            >
              <FontAwesomeIcon
                icon={(mobileSearchOpen ? faXmark : faMagnifyingGlass) as IconProp}
              />
            </button>

            {/* Bell */}
            <button
              type="button"
              onClick={handleNotificationsClick}
              className="relative inline-flex items-center justify-center rounded-xl h-10 w-10 bg-gray-100 dark:bg-[#172534] ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
              aria-label={`Unread messages: ${totalUnreadCount}`}
            >
              <FontAwesomeIcon icon={faBell as IconProp} />
              {hasUnreadMessages && (
                <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-red-500 text-white text-[0.65rem] font-bold leading-5 text-center ring-2 ring-white dark:ring-darkBg">
                  {unreadBadgeLabel}
                </span>
              )}
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={handleThemeToggle}
              className="inline-flex items-center justify-center rounded-xl h-10 w-10 bg-gray-100 dark:bg-[#172534] ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
              aria-label="Toggle theme"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <FontAwesomeIcon icon={(isDark ? faSun : faMoon) as IconProp} />
            </button>

            {/* Responsive org/profile control (never overflows) */}
            {isOrg && orgPillMeta ? (
              <Link to={orgPillMeta.href} className={ORG_PILL} title={orgPillMeta.title}>
                <span className="inline-flex items-center justify-center">
                  <FontAwesomeIcon icon={orgPillMeta.icon as IconProp} />
                </span>
                {/* show text from sm up; keep pill compact on tiny phones */}
                <span className="hidden sm:inline ml-2 truncate">{orgPillMeta.label}</span>
              </Link>
            ) : (
              <Link
                to={avatarHref}
                className="shrink-0 rounded-full ring-1 ring-gray-200 dark:ring-darkCard hover:ring-primary transition"
                aria-label={token ? 'Open my profile' : 'Login'}
                title={token ? profile?.name || 'My profile' : 'Login'}
              >
                <img
                  src={resolvedAvatar}
                  alt={profile?.name ? `${profile.name} avatar` : 'User avatar'}
                  className="size-10 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </Link>
            )}
          </div>
        </div>

        {/* Mobile search reveal */}
        {mobileSearchOpen && (
          <div className="md:hidden pb-3 space-y-2">
            <label className="flex h-10">
              <div className="flex w-full items-stretch rounded-xl ring-1 ring-gray-200 dark:ring-darkCard bg-gray-100 dark:bg-[#172534] focus-within:ring-primary transition">
                <div className="text-gray-500 dark:text-darkTextSecondary flex items-center justify-center pl-4">
                  <FontAwesomeIcon icon={faMagnifyingGlass as IconProp} />
                </div>
                <input
                  ref={mobileSearchRef}
                  placeholder="Search courses, tutors…"
                  className="w-full bg-transparent h-full px-3 outline-none placeholder:text-gray-500 dark:placeholder:text-darkTextSecondary"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchSubmit(searchQuery);
                  }}
                />
                {searchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs px-2 text-gray-500 dark:text-darkTextSecondary"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={searchTarget}
                onChange={(e) => setSearchTarget(e.target.value as SearchTarget)}
                className="h-10 flex-1 rounded-xl bg-gray-100 dark:bg-[#172534] px-3 text-xs ring-1 ring-gray-200 dark:ring-darkCard"
                aria-label="Search target"
              >
                <option value="auto">Auto</option>
                <option value="courses">Courses</option>
                <option value="library">Videos/Notes</option>
                <option value="tutors">Tutors</option>
              </select>
              <button
                type="button"
                onClick={() => handleSearchSubmit(searchQuery)}
                className="h-10 px-4 rounded-xl bg-[#3d99f5] text-white text-xs font-semibold"
              >
                Go
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile menu panel */}
      <div
        className={`md:hidden border-t border-gray-200 dark:border-darkCard bg-white dark:bg-darkBg transition-[max-height,opacity] duration-200 overflow-hidden ${
          mobileMenuOpen ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!mobileMenuOpen}
      >
        <nav className="px-3 sm:px-4 py-3 flex flex-col gap-1">
          {token && (
            <Link
              to={appUrl('/home')}
              className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
            >
              Home
            </Link>
          )}
          <Link
            to="/find-tutor"
            className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
          >
            Find Tutors
          </Link>
          <Link
            to={myCoursesHref}
            className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
          >
            My Courses
          </Link>
          <Link
            to="/resources"
            className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
          >
            Resources
          </Link>
          <Link
            to={siteUrl('/robot-teacher')}
            className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
          >
            Learn with A.I
          </Link>

          {/* For Institutions (mobile) */}
          <Link
            to={orgPortalHref}
            state={!orgToken ? { next: '/org' } : undefined}
            onClick={handleOrgButtonClick}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition"
          >
            <span className="inline-flex items-center gap-2">
              <FontAwesomeIcon icon={faBuilding as IconProp} />
              <span>For Institutions</span>
            </span>
          </Link>

          {/* Org shortcuts (mobile) */}
          {orgToken && isLearnerRole && (
            <Link
              to={appUrl('/org/learn')}
              className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
            >
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon icon={faGraduationCap as IconProp} />
                <span>Org Learner Home</span>
              </span>
            </Link>
          )}
          {orgToken && isInstructorRole && (
            <Link
              to={appUrl('/org/instructor')}
              className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
            >
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon icon={faChalkboardTeacher as IconProp} />
                <span>Org Instructor Home</span>
              </span>
            </Link>
          )}
          {orgToken && !(isLearnerRole || isInstructorRole) && (
            <Link
              to={appUrl('/org/profile')}
              className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-[#172534]"
            >
              <span className="inline-flex items-center gap-2">
                <FontAwesomeIcon icon={faBuilding as IconProp} />
                <span>Org Profile</span>
              </span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
