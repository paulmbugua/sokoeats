// apps/web/src/components/AutocompleteSearch.tsx

import React, { useState, useMemo, ChangeEvent, KeyboardEvent, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';

interface AutocompleteProps {
  onSelect: (value: string) => void;
  onSearch?: (value: string) => void;
}

export const AutocompleteSearch: React.FC<AutocompleteProps> = ({ onSelect, onSearch }) => {
  // 1) all your vocab in a typed array
  const allOptions = useMemo<string[]>(() => {
    const category = ['Math', 'Science', 'Programming', 'Art', 'Wellness', 'Languages'];
    const teachingStyle = ['One-on-One', 'Group', 'Workshop', 'Lecture'];
    const experienceLevel = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
    const expertise = ['Exam Prep', 'Skill Building', 'Homework', 'Career Guidance'];
    const ageGroup = ['Pre-Primary', 'Lower Primary', 'Upper Primary', 'University', 'Adults'];
    const pricing = ['20–50', '51–100', '101–150', '151–200'];
    const videoCategory = category;
    const videoAgeGroup = ageGroup;

    // dedupe
    return Array.from(
      new Set<string>([
        ...category,
        ...teachingStyle,
        ...experienceLevel,
        ...expertise,
        ...ageGroup,
        ...pricing,
        ...videoCategory,
        ...videoAgeGroup,
      ])
    );
  }, []);

  // 2) component state
  const [term, setTerm] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // 3) filter suggestions when term changes
  useEffect(() => {
    const q = term.trim().toLowerCase();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    setSuggestions(allOptions.filter((opt: string) => opt.toLowerCase().includes(q)).slice(0, 10));
    setActiveIndex(-1);
  }, [term, allOptions]);

  // 4) handle keyboard nav & Enter
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      e.preventDefault();
    }
    if (e.key === 'ArrowUp') {
      setActiveIndex((i) => Math.max(i - 1, 0));
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        select(suggestions[activeIndex]);
      } else {
        select(term);
      }
      e.preventDefault();
    }
  };

  // 5) click outside closes suggestions
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // 6) select value
  const select = (value: string) => {
    setTerm(value);
    setSuggestions([]);
    onSelect(value);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs md:max-w-xl">
      {/* input wrapper */}
      <div className="flex items-center bg-white bg-opacity-20 rounded-full px-4 py-2 md:px-3 md:py-1">
        <FontAwesomeIcon icon={faSearch} className="h-5 w-5 text-white/70" />
        <input
          type="text"
          value={term}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const v = e.target.value;
            setTerm(v);
            onSearch?.(v);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search subjects, grades, styles…"
          className="ml-2 flex-1 bg-transparent placeholder-white/70 text-white text-sm focus:outline-none"
        />
      </div>

      {/* suggestions dropdown */}
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-plum rounded-md max-h-60 overflow-auto shadow-lg">
          {suggestions.map((opt, idx) => (
            <li
              key={opt}
              onClick={() => select(opt)}
              className={`px-4 py-2 cursor-pointer text-white ${
                idx === activeIndex ? 'bg-softPink' : 'hover:bg-softPink/30'
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
