// apps/web/src/components/Sidebar.web.tsx

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';

export interface SidebarProps {
  filters: Record<string, string[]>;
  onFilterChange: (filterType: string, value: string) => void;
  clearFilters: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ filters, onFilterChange, clearFilters }) => {
  const [isCategoriesOpen, setCategoriesOpen] = useState(false);
  const [isFiltersOpen, setFiltersOpen] = useState(false);

  const sections = [
    'All Tutors',
    'Free Session',
    'My Favorites',
    'My Recent Chats',
    'Upcoming Classes',
  ];

  const categories = [
    'Math Tutors',
    'Sciences',
    'Programming',
    'Art & Design',
    'Wellness',
    'Languages',
  ];

  const experienceLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  const teachingStyles = ['One-on-One', 'Group', 'Workshop', 'Lecture'];
  const expertises = ['Exam Prep', 'Skill Building', 'Homework Help', 'Career Guidance'];
  const ageGroups = [
    'Pre-Primary',
    'Lower Primary',
    'Upper Primary',
    'University/College',
    'Adults',
  ];
  const pricingRanges = ['20-50', '51-100', '101-150', '151-200'];

  return (
    <div className="p-4 bg-plum text-white h-full w-64 shadow-lg overflow-y-auto custom-scrollbar">
      {/* Sidebar Header */}
      <div className="border-b border-softPink pb-6 mb-6 mt-8">
        <p className="text-lg text-pink-500 text-left mt-2">
          Find tutors by category & preferences
        </p>
      </div>

      {/* Section (exclusive) */}
      <div className="mb-6">
        {sections.map((sec) => (
          <label key={sec} className="block mb-2 text-xl">
            <input
              type="radio"
              name="section"
              className="mr-2"
              checked={filters.section?.includes(sec) ?? false}
              onChange={() => {
                clearFilters();
                onFilterChange('section', sec);
              }}
            />
            {sec}
          </label>
        ))}
      </div>

      {/* Subjects (multi‐select) */}
      <div className="space-y-2 mb-6">
        <div
          onClick={() => setCategoriesOpen(!isCategoriesOpen)}
          className="flex justify-between items-center cursor-pointer text-xl font-semibold uppercase tracking-wider text-softPink"
        >
          <span>Subjects</span>
          <FontAwesomeIcon icon={(isCategoriesOpen ? faChevronUp : faChevronDown) as IconProp} />
        </div>
        {isCategoriesOpen &&
          categories.map((cat) => (
            <label key={cat} className="block mb-1 pl-4 text-lg">
              <input
                type="checkbox"
                className="mr-2"
                checked={filters.category?.includes(cat) ?? false}
                onChange={() => onFilterChange('category', cat)}
              />
              {cat}
            </label>
          ))}
      </div>

      {/* Other Filters */}
      <div className="space-y-2 mb-6">
        <div
          onClick={() => setFiltersOpen(!isFiltersOpen)}
          className="flex justify-between items-center cursor-pointer text-xl font-semibold uppercase tracking-wider text-softPink"
        >
          <span>Filters</span>
          <FontAwesomeIcon icon={(isFiltersOpen ? faChevronUp : faChevronDown) as IconProp} />
        </div>

        {isFiltersOpen && (
          <div className="pl-2 space-y-6">
            {/* Experience Level */}
            <div>
              <h4 className="text-softGray text-lg font-semibold mb-2">Experience Level</h4>
              {experienceLevels.map((lvl) => (
                <label key={lvl} className="block mb-1">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={filters.experienceLevel?.includes(lvl) ?? false}
                    onChange={() => onFilterChange('experienceLevel', lvl)}
                  />
                  {lvl}
                </label>
              ))}
            </div>

            {/* Teaching Style */}
            <div>
              <h4 className="text-softGray text-lg font-semibold mb-2">Teaching Style</h4>
              {teachingStyles.map((style) => (
                <label key={style} className="block mb-1">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={filters['description.teachingStyle']?.includes(style) ?? false}
                    onChange={() => onFilterChange('description.teachingStyle', style)}
                  />
                  {style}
                </label>
              ))}
            </div>

            {/* Expertise */}
            <div>
              <h4 className="text-softGray text-lg font-semibold mb-2">Expertise</h4>
              {expertises.map((exp) => (
                <label key={exp} className="block mb-1">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={filters['description.expertise']?.includes(exp) ?? false}
                    onChange={() => onFilterChange('description.expertise', exp)}
                  />
                  {exp}
                </label>
              ))}
            </div>

            {/* Age Group */}
            <div>
              <h4 className="text-softGray text-lg font-semibold mb-2">Age Group</h4>
              {ageGroups.map((age) => (
                <label key={age} className="block mb-1">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={filters.ageGroup?.includes(age) ?? false}
                    onChange={() => onFilterChange('ageGroup', age)}
                  />
                  {age}
                </label>
              ))}
            </div>

            {/* Pricing */}
            <div>
              <h4 className="text-softGray text-lg font-semibold mb-2">Pricing (Tokens)</h4>
              {pricingRanges.map((range) => (
                <label key={range} className="block mb-1">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={filters.pricing?.includes(range) ?? false}
                    onChange={() => onFilterChange('pricing', range)}
                  />
                  {range}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Clear All */}
      <button
        onClick={clearFilters}
        className="mt-4 px-3 py-2 bg-red-500 rounded text-white hover:bg-red-600"
      >
        Clear All Filters
      </button>

      {/* Scrollbar CSS */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(255, 192, 203, 0.5);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default Sidebar;
