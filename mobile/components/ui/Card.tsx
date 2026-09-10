/**
 * Card — themed card surface with border and optional shadow.
 * Matches web's `bg-card border border-border rounded-xl` pattern.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Radius, Shadows, Spacing } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number | 'none';
  shadow?: boolean;
  borderless?: boolean;
}

export function Card({
  children,
  style,
  padding = Spacing[4],
  shadow = false,
  borderless = false,
}: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: Radius.card,
          padding: padding === 'none' ? 0 : (typeof padding === 'number' ? padding : Spacing[4]),
          ...(borderless ? {} : { borderWidth: 1, borderColor: colors.border }),
          ...(shadow ? Shadows.sm : {}),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
