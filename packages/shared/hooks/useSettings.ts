import { useState, useEffect, useMemo } from 'react';
import { useShopContext } from '@mytutorapp/shared/context';

export interface MenuItem {
  id: string;
  label: string;
  icon: string; // use string keys (or a union) to represent icon IDs
  disabled?: boolean;
  action?: () => void;
}

export interface UseSettingsOptions {
  alertFn?: (title: string, message: string) => void;
  navigateFn?: (destination: string) => void;
  initialSection?: string;
}

export interface UseSettingsReturn {
  hasProfile: boolean;
  activeSection: string;
  setActiveSection: (section: string) => void;
  menuItems: MenuItem[];
  handleMenuClick: (item: MenuItem) => void;
  logout: () => void;
}

function isDevEnv() {
  // Works in Next/Vite/Node builds (and won’t crash in RN).
  // RN may not have process/env, so we guard it.
  try {
    // eslint-disable-next-line no-undef
    const nodeEnv =
      typeof process !== 'undefined' &&
      typeof process.env !== 'undefined' &&
      process.env.NODE_ENV;

    return nodeEnv ? nodeEnv !== 'production' : false;
  } catch {
    return false;
  }
}

export default function useSettings(options?: UseSettingsOptions): UseSettingsReturn {
  const { alertFn, navigateFn } = options || {};
  const { profile, loadingProfile } = useShopContext();
  const [hasProfile, setHasProfile] = useState(false);
  const [activeSection, setActiveSection] = useState(options?.initialSection || 'account');

  useEffect(() => {
    if (!loadingProfile && profile) setHasProfile(true);
    else setHasProfile(false);
  }, [loadingProfile, profile]);

  useEffect(() => {
    if (options?.initialSection) setActiveSection(options.initialSection);
  }, [options?.initialSection]);

  const logout = () => {
    if (alertFn) alertFn('Logout', 'Logged out successfully.');
    if (navigateFn) navigateFn('Login');
  };

  const menuItems: MenuItem[] = useMemo(() => {
    const isTutor = (profile?.role || '').toLowerCase() === 'tutor';
    const showDiagnostics = isDevEnv(); // ✅ replaces __DEV__

    return [
      { id: 'account', label: 'Account', icon: 'faUserCircle' },
      {
        id: 'manageProfile',
        label: hasProfile ? 'Manage Profile' : 'Create Profile',
        icon: 'faEdit',
      },
      {
        id: 'certification',
        label: 'Certification',
        icon: 'faCertificate',
        disabled: !isTutor,
      },
      { id: 'help', label: 'Help', icon: 'faQuestionCircle' },
      { id: 'language', label: 'Language', icon: 'faGlobe' },
      ...(showDiagnostics ? [{ id: 'diagnostics', label: 'Diagnostics', icon: 'faBug' }] : []),
      { id: 'logout', label: 'Log Out', icon: 'faPowerOff', action: logout },
    ];
  }, [hasProfile, profile?.role]); // logout is stable enough; avoids re-creating menu often

  const handleMenuClick = (item: MenuItem) => {
    if (item.disabled) {
      if (alertFn) {
        alertFn('Info', 'Certification settings are available only for tutors.');
      }
      return;
    }

    if (item.id === 'logout') {
      item.action?.();
      return;
    }

    setActiveSection(item.id);
  };

  return {
    hasProfile,
    activeSection,
    setActiveSection,
    menuItems,
    handleMenuClick,
    logout,
  };
}
