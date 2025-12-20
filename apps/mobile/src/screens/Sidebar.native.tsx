// apps/mobile/src/screens/Sidebar.native.tsx

import React, { useState } from 'react';
import { SafeAreaView, ScrollView, Text, TouchableOpacity, View, Platform } from 'react-native';
import tw from '../../tailwind';

export interface SidebarProps {
  onFilterChange: (filterType: string, value: string, merge?: boolean) => void;
}

// Filter option sets
const quickSections = ['All Tutors', 'Free Session', 'Favorites', 'Recent Chats'];
const subjects = ['Math', 'Science', 'Programming', 'Art', 'Wellness', 'Languages'];
const teachingStyles = ['One-on-One', 'Group', 'Workshop', 'Lecture'];
const experienceLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const expertiseOptions = ['Exam Prep', 'Skill Building', 'Homework Help', 'Career Guidance'];
const ageGroups = ['Pre-Primary', 'Lower Primary', 'Upper Primary', 'University/College', 'Adults'];
const priceRanges = ['20-50', '51-100', '101-150', '151-200'];

// State shape
type FiltersState = {
  section: string[];
  category: string[];
  teachingStyle: string[];
  experienceLevel: string[];
  expertise: string[];
  ageGroup: string[];
  pricing: string[];
};

const SidebarNative: React.FC<SidebarProps> = ({ onFilterChange }) => {
  const [filters, setFilters] = useState<FiltersState>({
    section: [],
    category: [],
    teachingStyle: [],
    experienceLevel: [],
    expertise: [],
    ageGroup: [],
    pricing: [],
  });

  // toggles a filter on/off; single=true makes it single-select
  const toggleFilter = (key: keyof FiltersState, value: string, single = false) => {
    setFilters((prev) => {
      const current = prev[key];
      let next: string[];
      if (single) {
        next = current.includes(value) ? [] : [value];
      } else {
        next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      }
      return { ...prev, [key]: next };
    });

    // notify parent after scheduling state update
    onFilterChange(key, value, !single);
  };

  // UI reveal flags
  const hasSubject = filters.category.length > 0;
  const hasStyle = filters.teachingStyle.length > 0;
  const hasExperience = filters.experienceLevel.length > 0;
  const hasExpertise = filters.expertise.length > 0;
  const hasAge = filters.ageGroup.length > 0;

  // A single filter button
  const Option = ({
    label,
    keyName,
    single = false,
    disabled = false,
  }: {
    label: string;
    keyName: keyof FiltersState;
    single?: boolean;
    disabled?: boolean;
  }) => {
    const selected = filters[keyName].includes(label);
    return (
      <TouchableOpacity
        onPress={() => toggleFilter(keyName, label, single)}
        disabled={disabled}
        style={tw.style(
          'px-3 py-2 rounded-lg mb-2',
          disabled && 'opacity-40',
          selected ? 'bg-softPink' : 'bg-white/10'
        )}
      >
        <Text style={tw.style('text-sm', selected ? 'text-plum' : 'text-white')}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-plum ${Platform.OS === 'ios' ? 'pt-6' : ''}`}>
      <ScrollView contentContainerStyle={tw`p-4`} showsVerticalScrollIndicator={false}>
        <Text style={tw`text-white text-lg font-bold mb-4`}>🎯 Filter Tutors</Text>

        {/* 1) Quick Access (single-select) */}
        <Text style={tw`text-softPink font-semibold mb-2`}>Quick Access</Text>
        {quickSections.map((sec) => (
          <Option key={sec} label={sec} keyName="section" single />
        ))}

        {/* 2) Subjects */}
        <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Subjects</Text>
        {subjects.map((s) => (
          <Option key={s} label={s} keyName="category" />
        ))}

        {/* 3) Teaching Style */}
        {hasSubject && (
          <>
            <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Teaching Style</Text>
            {teachingStyles.map((s) => (
              <Option key={s} label={s} keyName="teachingStyle" />
            ))}
          </>
        )}

        {/* 4) Experience Level */}
        {hasStyle && (
          <>
            <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Experience Level</Text>
            {experienceLevels.map((e) => (
              <Option key={e} label={e} keyName="experienceLevel" />
            ))}
          </>
        )}

        {/* 5) Expertise */}
        {hasExperience && (
          <>
            <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Expertise</Text>
            {expertiseOptions.map((e) => (
              <Option key={e} label={e} keyName="expertise" />
            ))}
          </>
        )}

        {/* 6) Age Group */}
        {hasExpertise && (
          <>
            <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Age Group</Text>
            {ageGroups.map((a) => (
              <Option key={a} label={a} keyName="ageGroup" />
            ))}
          </>
        )}

        {/* 7) Pricing */}
        {hasAge && (
          <>
            <Text style={tw`text-softPink font-semibold mt-4 mb-2`}>Pricing</Text>
            {priceRanges.map((p) => (
              <Option
                key={p}
                label={`${p} Tokens`}
                keyName="pricing"
                disabled={filters.teachingStyle.length === 0}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SidebarNative;
