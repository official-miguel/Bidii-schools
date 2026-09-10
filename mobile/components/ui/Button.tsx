/**
 * Button — primary, secondary, ghost, danger variants.
 * Matches the web app's button classes exactly.
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Radius, Typography, Spacing } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize   = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const SIZE_STYLES: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium },
  },
  md: {
    container: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold },
  },
  lg: {
    container: { paddingHorizontal: Spacing[5], paddingVertical: Spacing[3.5], borderRadius: Radius.button },
    text:      { fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold },
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const { colors } = useTheme();
  const sizeStyles = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  // Variant styles derived from theme colors
  type StyleMap = { container: ViewStyle; text: TextStyle; disabledContainer: ViewStyle; disabledText: TextStyle };
  const VARIANT_STYLES: Record<ButtonVariant, StyleMap> = {
    primary: {
      container:        { backgroundColor: colors.primary, borderWidth: 0 },
      text:             { color: colors.primaryForeground },
      disabledContainer:{ backgroundColor: colors.primary + '60' },
      disabledText:     { color: colors.primaryForeground + '80' },
    },
    secondary: {
      container:        { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
      text:             { color: colors.foreground },
      disabledContainer:{ backgroundColor: colors.border },
      disabledText:     { color: colors.mutedForeground },
    },
    ghost: {
      container:        { backgroundColor: 'transparent', borderWidth: 0 },
      text:             { color: colors.primary },
      disabledContainer:{ backgroundColor: 'transparent' },
      disabledText:     { color: colors.mutedForeground },
    },
    danger: {
      container:        { backgroundColor: colors.destructive, borderWidth: 0 },
      text:             { color: colors.destructiveForeground },
      disabledContainer:{ backgroundColor: colors.destructive + '60' },
      disabledText:     { color: colors.destructiveForeground + '80' },
    },
  };

  const variantStyles = VARIANT_STYLES[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing[2],
        },
        sizeStyles.container,
        isDisabled ? variantStyles.disabledContainer : variantStyles.container,
        fullWidth && { width: '100%' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'ghost' ? colors.primary : colors.primaryForeground}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && <View>{icon}</View>}
          <Text
            style={[
              sizeStyles.text,
              isDisabled ? variantStyles.disabledText : variantStyles.text,
              textStyle,
            ]}
          >
            {label}
          </Text>
          {icon && iconPosition === 'right' && <View>{icon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
}
