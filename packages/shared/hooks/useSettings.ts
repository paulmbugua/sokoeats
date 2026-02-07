import { useState, useEffect } from 'react';
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

export default function useSettings(options?: UseSettingsOptions): UseSettingsReturn {
  const { alertFn, navigateFn } = options || {};
  const { profile, loadingProfile } = useShopContext();
  const [hasProfile, setHasProfile] = useState(false);
  const [activeSection, setActiveSection] = useState(options?.initialSection || 'account');

  useEffect(() => {
    if (!loadingProfile && profile) {
      setHasProfile(true);
    } else {
      setHasProfile(false);
    }
  }, [loadingProfile, profile]);

  useEffect(() => {
    if (options?.initialSection) {
      setActiveSection(options.initialSection);
    }
  }, [options?.initialSection]);

  const logout = () => {
    if (alertFn) {
      alertFn('Logout', 'Logged out successfully.');
    }
    if (navigateFn) {
      navigateFn('Login');
    }
  };

  const menuItems: MenuItem[] = [
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
      disabled: !profile || !profile.role || profile.role.toLowerCase() !== 'tutor',
    },
    { id: 'help', label: 'Help', icon: 'faQuestionCircle' },
    { id: 'language', label: 'Language', icon: 'faGlobe' },
    ...(typeof __DEV__ !== 'undefined' && __DEV__
      ? [{ id: 'diagnostics', label: 'Diagnostics', icon: 'faBug' }]
      : []),
    { id: 'logout', label: 'Log Out', icon: 'faPowerOff', action: logout },
  ];

  const handleMenuClick = (item: MenuItem) => {
    if (item.disabled) {
      if (alertFn) {
        alertFn('Info', 'Certification settings are available only for tutors.');
      }
      return;
    }
    if (item.id === 'logout') {
      if (item.action) {
        item.action();
      }
    } else {
      setActiveSection(item.id);
    }
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
