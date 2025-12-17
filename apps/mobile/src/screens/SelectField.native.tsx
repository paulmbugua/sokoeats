/* eslint-disable prettier/prettier */
import React, { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import tw from '../../tailwind';
import { useThemePref } from '../theme/ThemeContext';

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
  const { resolvedScheme } = useThemePref();

  const effectivePlaceholderText = placeholder ?? 'Select an option';
  const effectiveModalTitle = modalTitle ?? label ?? effectivePlaceholderText;

  const selectedLabel = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    return hit?.label ?? '';
  }, [options, value]);

  // Defaults (same spirit as ManageProfileForm)
  const defaultPlaceholder =
    resolvedScheme === 'dark' ? '#94A3B8' : '#64748B'; // slate-400 (dark) / slate-500 (light)
  const defaultSelected =
    resolvedScheme === 'dark' ? '#E5E7EB' : '#0F172A'; // gray-200 / slate-900

  const effectivePlaceholderColor = placeholderColor ?? defaultPlaceholder;
  const effectiveSelectedColor = selectedTextColor ?? defaultSelected;

  const isSelected = !!value;

  const displayText = isSelected ? (selectedLabel || value) : effectivePlaceholderText;

  // Always-visible chevron (don’t tie to placeholder override too tightly)
  const iconColor = resolvedScheme === 'dark' ? '#CBD5E1' : '#64748B'; // slate-300 / slate-500

  return (
    <>
      <View style={tw`mb-4`}>
        {label ? (
          <Text style={tw`text-sm font-semibold text-[#0d141c] dark:text-white mb-2`}>
            {label}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.9}
          style={tw.style(
            // ✅ match your inputBase look (ManageProfileForm / AccountSection)
            'w-full px-3 py-3 rounded-xl flex-row items-center justify-between',
            'bg-slate-100 dark:bg-slate-900/60',
            'border border-slate-200 dark:border-white/10',
            error ? 'border-red-500' : ''
          )}
        >
          <Text
            numberOfLines={1}
            style={[
              tw`text-sm`,
              { color: isSelected ? effectiveSelectedColor : effectivePlaceholderColor },
            ]}
          >
            {displayText}
          </Text>

          <FontAwesome
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={iconColor}
          />
        </TouchableOpacity>

        {error ? (
          <Text style={tw`mt-1 text-[11px] text-red-600 dark:text-red-400`}>
            {error}
          </Text>
        ) : null}
      </View>

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={tw`flex-1 bg-black/50 justify-center px-6`}>
          <View style={tw`rounded-2xl bg-white dark:bg-[#0f1821] p-4 max-h-[80%] border border-slate-200 dark:border-white/10`}>
            <Text style={tw`text-base font-semibold text-[#0d141c] dark:text-white mb-3`}>
              {effectiveModalTitle}
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((opt) => {
                const on = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    activeOpacity={0.9}
                    style={tw`py-2`}
                  >
                    <Text
                      style={tw.style(
                        'text-sm',
                        on
                          ? 'font-semibold text-pink-600 dark:text-pink-400'
                          : 'text-slate-700 dark:text-slate-100'
                      )}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setOpen(false)}
              activeOpacity={0.9}
              style={tw`mt-3 h-10 rounded-xl bg-slate-100 dark:bg-slate-900/60 items-center justify-center border border-slate-200 dark:border-white/10`}
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
