/* eslint-disable prettier/prettier */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import tw from '../../tailwind';

export type Option = { label: string; value: string };

export interface SelectFieldProps {
  /** Optional label shown above the field */
  label?: string;
  /** Current selected value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Options to choose from */
  options: Option[];
  /** Placeholder text when value is empty */
  placeholder?: string;
  /** Optional – overrides the default placeholder color */
  placeholderColor?: string;
  /** Optional – overrides the default selected text color */
  selectedTextColor?: string;
  /** Optional title shown at the top of the modal list (defaults to label or placeholder) */
  modalTitle?: string;
  /** Optional error message shown below the field */
  error?: string;
}

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  placeholderColor,
  selectedTextColor,
  modalTitle,
  error,
}) => {
  const [open, setOpen] = useState(false);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? value ?? '';

  const effectivePlaceholderText = placeholder ?? 'Select an option';
  const effectiveModalTitle = modalTitle ?? label ?? effectivePlaceholderText;

  // ✅ Use Tailwind dark: classes for theme, with optional overrides
  const textColorStyle = value
    ? // Selected value
      (selectedTextColor
        ? { color: selectedTextColor }
        : tw`text-slate-900 dark:text-slate-50`)
    : // Placeholder
      (placeholderColor
        ? { color: placeholderColor }
        : tw`text-slate-500 dark:text-slate-300`);

  // Icon follows placeholder-ish color; keep it neutral & always visible
  const iconColor =
    placeholderColor ?? '#64748B'; // works fine in both themes

  return (
    <>
      {/* Label + shell that looks like a TextInput */}
      <View style={tw`mb-4`}>
        {label ? (
          <Text style={tw`text-base text-[#49739c] dark:text-gray-200 mb-1`}>
            {label}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={() => setOpen(true)}
          style={tw.style(
            'bg-slate-100 dark:bg-[#0b1016] border border-[#cedbe8] dark:border-white/10 px-3 py-3 rounded-xl flex-row items-center justify-between',
            error ? 'border-red-500' : '',
          )}
        >
          <Text
            style={tw.style('text-sm', textColorStyle)}
            numberOfLines={1}
          >
            {value ? selectedLabel : effectivePlaceholderText}
          </Text>
          <FontAwesome
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={iconColor}
          />
        </TouchableOpacity>

        {error ? (
          <Text style={tw`mt-1 text-sm text-red-600 dark:text-red-400`}>
            {error}
          </Text>
        ) : null}
      </View>

      {/* Simple JS-only dropdown modal */}
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={tw`flex-1 bg-black/40 justify-center px-6`}>
          <View
            style={tw`rounded-2xl bg-white dark:bg-[#0f1821] p-4 max-h-[80%]`}
          >
            {effectiveModalTitle ? (
              <Text
                style={tw`text-base font-semibold text-[#0d141c] dark:text-white mb-2`}
              >
                {effectiveModalTitle}
              </Text>
            ) : null}

            <ScrollView>
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={tw`py-2`}
                >
                  <Text
                    style={tw.style(
                      'text-sm',
                      opt.value === value
                        ? 'font-semibold text-pink-600 dark:text-pink-400'
                        : 'text-slate-700 dark:text-slate-100',
                    )}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setOpen(false)}
              style={tw`mt-3 h-10 rounded-xl bg-slate-100 dark:bg-[#0b1016] items-center justify-center`}
            >
              <Text style={tw`text-sm text-slate-700 dark:text-slate-100`}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default SelectField;
