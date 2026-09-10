/**
 * StatCard — KPI metric tile, matches web StatCard from DisciplineDashboard.
 */

import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { Radius, Typography, Spacing, Shadows } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: string;
  loading?: boolean;
  style?: ViewStyle;
  subtitle?: string;
}

function SkeletonPulse({ width, height, borderColor }: { width: number | string; height: number; borderColor: string }) {
  return (
    <View
      style={{
        width,
        height,
        backgroundColor: borderColor,
        borderRadius: Radius.sm,
      }}
    />
  );
}

export function StatCard({ label, value, icon, color, loading, style, subtitle }: StatCardProps) {
  const { colors } = useTheme();
  const accentColor = color || colors.primary;

  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing[4],
          flex: 1,
          ...Shadows.sm,
        },
        style,
      ]}
    >
      {/* Icon */}
      {icon && (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: Radius.button,
            backgroundColor: accentColor + '15',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: Spacing[3],
          }}
        >
          {React.cloneElement(icon as React.ReactElement, {
            size: 18,
            color: accentColor,
          })}
        </View>
      )}

      {/* Value */}
      {loading ? (
        <>
          <SkeletonPulse width="50%" height={24} borderColor={colors.border} />
          <View style={{ marginTop: Spacing[2] }}>
            <SkeletonPulse width="80%" height={14} borderColor={colors.border} />
          </View>
        </>
      ) : (
        <>
          <Text
            style={{
              fontSize: Typography.fontSize['2xl'],
              fontWeight: Typography.fontWeight.bold,
              color: colors.foreground,
              marginBottom: 2,
            }}
            numberOfLines={1}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
          </Text>

          <Text
            style={{
              fontSize: Typography.fontSize.xs,
              fontWeight: Typography.fontWeight.medium,
              color: colors.mutedForeground,
            }}
          >
            {label}
          </Text>

          {subtitle && (
            <Text
              style={{
                fontSize: Typography.fontSize.xs,
                color: colors.mutedForeground,
                marginTop: 2,
              }}
            >
              {subtitle}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
