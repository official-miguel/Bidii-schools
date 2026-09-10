/**
 * Badge — inline status pill, mirrors web <Badge> component exactly.
 * Variants: success | warn | danger | info | default
 */

import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Radius, Typography } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

export type BadgeVariant = 'success' | 'warn' | 'danger' | 'info' | 'default';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Badge({ label, variant = 'default', size = 'md', style, textStyle }: BadgeProps) {
  const { colors } = useTheme();

  // Variant colors — semantic status tokens where available, static brand tokens for info
  const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
    success: { bg: colors.success,     text: colors.successForeground,     border: colors.successForeground },
    warn:    { bg: colors.warn,        text: colors.warnForeground,        border: colors.warnForeground },
    danger:  { bg: colors.destructive + '15', text: colors.destructive,    border: colors.destructive },
    // info: uses primary as accent on muted surface — adapts correctly in both themes
    info:    { bg: colors.muted,        text: colors.primary,               border: colors.primary },
    default: { bg: colors.muted,       text: colors.mutedForeground,       border: colors.border },
  };

  const badgeColors = VARIANT_STYLES[variant];
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        {
          backgroundColor: badgeColors.bg,
          borderRadius: Radius.full,
          borderWidth: 1,
          borderColor: badgeColors.border + '40', // 25% opacity border
          paddingHorizontal: isSmall ? 6 : 8,
          paddingVertical: isSmall ? 1 : 2,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text
        style={[
          {
            color: badgeColors.text,
            fontSize: Typography.fontSize.xs,
            fontWeight: Typography.fontWeight.semibold,
          },
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
