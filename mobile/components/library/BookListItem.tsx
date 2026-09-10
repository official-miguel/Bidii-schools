/**
 * BookListItem — catalogue/copy list row with status badge
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { ChevronRight, BookOpen } from 'lucide-react-native';
import { Radius, Typography, Spacing } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { Badge, type BadgeVariant } from '@/components/ui';
import { copyStatusLabel, conditionLabel } from '@/lib/utils';
import { CopyStatusColors, ConditionColors } from '@/constants/theme';

interface BookListItemProps {
  title: string;
  author?: string | null;
  accessionNumber?: string;
  status?: string;
  condition?: string;
  onPress: () => void;
  style?: ViewStyle;
  subtitle?: string;
  showChevron?: boolean;
}

export function BookListItem({
  title,
  author,
  accessionNumber,
  status,
  condition,
  onPress,
  style,
  subtitle,
  showChevron = true,
}: BookListItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing[3],
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.button,
          padding: Spacing[3],
        },
        style,
      ]}
    >
      {/* Icon */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: Radius.sm,
          backgroundColor: colors.primary + '20',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BookOpen size={20} color={colors.primary} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: Spacing[1] }}>
        <Text
          style={{
            fontSize: Typography.fontSize.sm,
            fontWeight: Typography.fontWeight.semibold,
            color: colors.foreground,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>

        {(author || accessionNumber || subtitle) && (
          <Text
            style={{
              fontSize: Typography.fontSize.xs,
              color: colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {author && `by ${author}`}
            {author && accessionNumber && ' • '}
            {accessionNumber}
            {(author || accessionNumber) && subtitle && ' • '}
            {subtitle}
          </Text>
        )}

        {/* Badges row */}
        {(status || condition) && (
          <View style={{ flexDirection: 'row', gap: Spacing[1.5], marginTop: Spacing[1] }}>
            {status && (
              <View
                style={{
                  paddingHorizontal: Spacing[2],
                  paddingVertical: 1,
                  borderRadius: Radius.full,
                  backgroundColor: CopyStatusColors[status]?.bg || colors.muted,
                }}
              >
                <Text
                  style={{
                    fontSize: Typography.fontSize.xs,
                    fontWeight: Typography.fontWeight.semibold,
                    color: CopyStatusColors[status]?.text || colors.mutedForeground,
                  }}
                >
                  {copyStatusLabel(status)}
                </Text>
              </View>
            )}

            {condition && (
              <View
                style={{
                  paddingHorizontal: Spacing[2],
                  paddingVertical: 1,
                  borderRadius: Radius.full,
                  backgroundColor: ConditionColors[condition]?.bg || colors.muted,
                }}
              >
                <Text
                  style={{
                    fontSize: Typography.fontSize.xs,
                    fontWeight: Typography.fontWeight.semibold,
                    color: ConditionColors[condition]?.text || colors.mutedForeground,
                  }}
                >
                  {conditionLabel(condition)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Chevron */}
      {showChevron && <ChevronRight size={18} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}
