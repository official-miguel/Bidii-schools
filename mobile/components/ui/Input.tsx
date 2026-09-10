/**
 * Input — text input matching web app's inputClass exactly.
 * Supports label, prefix icon, suffix icon, error state.
 */

import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import { Radius, Typography, Spacing, Colors } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  onSuffixPress?: () => void;
  containerStyle?: ViewStyle;
  required?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    prefixIcon,
    suffixIcon,
    onSuffixPress,
    containerStyle,
    required,
    style,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const { colors } = useTheme();

  const borderColor = error
    ? colors.destructive
    : focused
    ? colors.primary
    : colors.border;

  const ringColor = error
    ? colors.destructive + '30'
    : focused
    ? colors.primary + '25'
    : 'transparent';

  return (
    <View style={containerStyle}>
      {/* Label */}
      {label && (
        <Text
          style={{
            fontSize: Typography.fontSize.sm,
            fontWeight: Typography.fontWeight.medium,
            color: colors.foreground,
            marginBottom: Spacing[1.5],
          }}
        >
          {label}
          {required && (
            <Text style={{ color: colors.destructive }}> *</Text>
          )}
        </Text>
      )}

      {/* Input wrapper */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: focused ? 1.5 : 1,
          borderColor,
          borderRadius: Radius.button,
          backgroundColor: colors.input,
          // Soft focus ring via shadow on iOS
          ...(focused && {
            shadowColor: ringColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 4,
            elevation: 2,
          }),
        }}
      >
        {/* Prefix icon */}
        {prefixIcon && (
          <View style={{ paddingLeft: Spacing[3], paddingRight: Spacing[1] }}>
            {prefixIcon}
          </View>
        )}

        {/* Text input */}
        <TextInput
          ref={ref}
          style={[
            {
              flex: 1,
              paddingHorizontal: prefixIcon ? Spacing[2] : Spacing[3],
              paddingVertical: Spacing[2.5],
              fontSize: Typography.fontSize.sm,
              color: colors.foreground,
              fontFamily: Typography.fontFamily.sans,
            },
            style,
          ]}
          placeholderTextColor={colors.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />

        {/* Suffix icon / button */}
        {suffixIcon && (
          <TouchableOpacity
            onPress={onSuffixPress}
            disabled={!onSuffixPress}
            style={{ paddingRight: Spacing[3], paddingLeft: Spacing[1] }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            {suffixIcon}
          </TouchableOpacity>
        )}
      </View>

      {/* Error message */}
      {error && (
        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: colors.destructive,
            marginTop: Spacing[1],
          }}
        >
          {error}
        </Text>
      )}

      {/* Hint text */}
      {hint && !error && (
        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: colors.mutedForeground,
            marginTop: Spacing[1],
          }}
        >
          {hint}
        </Text>
      )}
    </View>
  );
});
