/**
 * EmptyState — consistent empty/no-results placeholder.
 * Matches the web EmptyBlock pattern from DisciplineDashboard.
 */

import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { Radius, Typography, Spacing } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { Button } from './Button';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({
  title = 'Nothing here yet',
  description,
  icon,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          borderRadius: Radius.card,
          paddingVertical: Spacing[16],
          paddingHorizontal: Spacing[6],
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          opacity: 0.3,
          marginBottom: Spacing[3],
        }}
      >
        {icon || <BookOpen size={40} color={colors.mutedForeground} />}
      </View>

      <Text
        style={{
          fontSize: Typography.fontSize.sm,
          fontWeight: Typography.fontWeight.semibold,
          color: colors.foreground,
          textAlign: 'center',
          marginBottom: description ? Spacing[1] : 0,
        }}
      >
        {title}
      </Text>

      {description && (
        <Text
          style={{
            fontSize: Typography.fontSize.sm,
            color: colors.mutedForeground,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
      )}

      {actionLabel && onAction && (
        <View style={{ marginTop: Spacing[4] }}>
          <Button label={actionLabel} onPress={onAction} size="sm" />
        </View>
      )}
    </View>
  );
}
