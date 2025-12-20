/* eslint-disable prettier/prettier */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  Pressable,
  Text,
  Keyboard,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import tw from '../../tailwind';

type Props = {
  onSelect: (value: string) => void;
  onSearch?: (value: string) => void;
  /** Close the dropdown when the input blurs (default true) */
  closeOnBlur?: boolean;
};

export const AutocompleteSearchNative: React.FC<Props> = ({
  onSelect,
  onSearch,
  closeOnBlur = true,
}) => {
  // 1) vocab
  const allOptions = useMemo<string[]>(() => {
    const category = ['Math', 'Science', 'Programming', 'Art', 'Wellness', 'Languages'];
    const teachingStyle = ['One-on-One', 'Group', 'Workshop', 'Lecture'];
    const experienceLevel = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
    const expertise = ['Exam Prep', 'Skill Building', 'Homework', 'Career Guidance'];
    const ageGroup = ['Pre-Primary', 'Lower Primary', 'Upper Primary', 'University', 'Adults'];
    const pricing = ['20–50', '51–100', '101–150', '151–200'];
    const videoCategory = category;
    const videoAgeGroup = ageGroup;

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

  // 2) state
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1); // for Enter select
  const inputRef = useRef<TextInput>(null);

  // 3) filter on term
  useEffect(() => {
    const q = term.trim().toLowerCase();
    if (!q) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const next = allOptions.filter((o) => o.toLowerCase().includes(q)).slice(0, 10);
    setSuggestions(next);
    setActiveIndex(-1);
  }, [term, allOptions]);

  // 4) select helper
  const select = (value: string) => {
    setTerm(value);
    setSuggestions([]);
    setActiveIndex(-1);
    onSelect(value);
    Keyboard.dismiss();
  };

  // 5) best-effort keyboard support (hardware keyboards)
  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;
    if (key === 'Enter' || key === 'Return') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        select(suggestions[activeIndex]);
      } else {
        select(term.trim());
      }
    }
    // Arrow keys are not consistently delivered on mobile; attempt where supported (Android)
    if (Platform.OS === 'android') {
      if (key === 'ArrowDown') {
        setActiveIndex((i) => Math.min(i + 1, (suggestions.length || 1) - 1));
      }
      if (key === 'ArrowUp') {
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    }
  };

  return (
    <View style={tw`relative w-full`}>
      {/* Input pill */}
      <View style={tw`flex-row items-center bg-white/20 rounded-full px-4 py-2`}>
        <FontAwesome name="search" size={16} color="rgba(255,255,255,0.7)" />
        <TextInput
          ref={inputRef}
          value={term}
          onChangeText={(v) => {
            setTerm(v);
            onSearch?.(v);
          }}
          onSubmitEditing={() => select(term.trim())}
          onKeyPress={onKeyPress}
          placeholder="Search subjects, grades, styles…"
          placeholderTextColor="rgba(255,255,255,0.7)"
          style={tw`ml-2 flex-1 text-white text-sm`}
          returnKeyType="search"
          onBlur={() => {
            if (closeOnBlur) setSuggestions([]);
          }}
        />
      </View>

      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <View
          // absolute, same width as input
          style={tw`absolute z-50 left-0 right-0 mt-1 bg-plum rounded-md max-h-60`}
        >
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={suggestions}
            keyExtractor={(item) => item}
            style={tw`rounded-md`}
            contentContainerStyle={tw`py-1`}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => select(item)}
                android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                style={[tw`px-4 py-2`, index === activeIndex ? tw`bg-softPink` : tw``]}
              >
                <Text style={tw`text-white`}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
};

export default AutocompleteSearchNative;
