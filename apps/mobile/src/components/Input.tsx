import React from 'react';
import { TextInput, View, Text } from 'react-native';
import { colors, radius, typography } from '../theme/tokens';

export default function Input({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  secureTextEntry?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? (
        <Text style={{ color: colors.ink, fontWeight: '800', marginBottom: 8, fontSize: typography.small }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        style={{
          minHeight: 56,
          borderWidth: 1,
          borderColor: 'rgba(15, 23, 42, 0.08)',
          borderRadius: radius.lg,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: typography.body,
          color: colors.text,
          backgroundColor: colors.surface,
        }}
      />
    </View>
  );
}
