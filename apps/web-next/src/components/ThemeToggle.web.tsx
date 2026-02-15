'use client';
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@mytutorapp/shared/hooks';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-1 rounded-lg border border-gray-300 
                 dark:border-darkCard bg-white dark:bg-darkBg text-gray-800 
                 dark:text-darkTextPrimary hover:bg-gray-100 dark:hover:bg-[#172534]"
    >
      <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
