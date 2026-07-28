import React, { useState } from 'react';
import { Pressable, TextInput, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={{ marginBottom: 16 }}>
      {label ? (
        <Text style={{ color: colors.ink, fontWeight: '800', marginBottom: 8, fontSize: typography.small }}>
          {label}
        </Text>
      ) : null}
      <View style={{ position: 'relative' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          secureTextEntry={isPassword && !passwordVisible}
          autoCapitalize={isPassword ? 'none' : undefined}
          autoCorrect={isPassword ? false : undefined}
          textContentType={isPassword ? 'password' : undefined}
          style={{
            minHeight: 60,
            borderWidth: 1,
            borderColor: 'rgba(15, 23, 42, 0.08)',
            borderRadius: radius.lg,
            paddingLeft: 17,
            paddingRight: isPassword ? 54 : 17,
            paddingVertical: 15,
            fontSize: typography.body,
            color: colors.text,
            backgroundColor: colors.surface,
          }}
        />
        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            onPress={() => setPasswordVisible((current) => !current)}
            hitSlop={10}
            style={{
              position: 'absolute',
              right: 8,
              top: 8,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.mutedDark}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
