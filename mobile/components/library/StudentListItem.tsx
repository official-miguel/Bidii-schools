/**
 * StudentListItem — for search results, shows student + card status
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Radius, Typography, Spacing, Colors } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { Avatar, Badge } from '@/components/ui';
import { StudentHit } from '@/services/api';
import { formatCurrency, cardStatusLabel } from '@/lib/utils';
import { CardStatusColors } from '@/constants/theme';

interface StudentListItemProps {
  student: StudentHit;
  onPress: () => void;
  style?: ViewStyle;
  showChevron?: boolean;
}

export function StudentListItem({
  student,
  onPress,
  style,
  showChevron = true,
}: StudentListItemProps) {
  const { colors } = useTheme();
  const cardStatus = student.libraryCard?.status || 'UNKNOWN';
  const fineBalance = student.libraryCard?.fineBalance || 0;
  const photoId = student.files?.[0]?.id;

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
      {/* Photo */}
      <Avatar name={student.fullName} photoFileId={photoId} size="md" />

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
          {student.fullName}
        </Text>

        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: colors.mutedForeground,
          }}
        >
          {student.admissionNumber} • {student.schoolClass.name}
        </Text>

        {/* Badges row */}
        <View style={{ flexDirection: 'row', gap: Spacing[1.5], marginTop: Spacing[1] }}>
          {/* Card status */}
          <View
            style={{
              paddingHorizontal: Spacing[2],
              paddingVertical: 1,
              borderRadius: Radius.full,
              backgroundColor: CardStatusColors[cardStatus]?.bg || colors.muted,
            }}
          >
            <Text
              style={{
                fontSize: Typography.fontSize.xs,
                fontWeight: Typography.fontWeight.semibold,
                color: CardStatusColors[cardStatus]?.text || colors.mutedForeground,
              }}
            >
              {cardStatusLabel(cardStatus)}
            </Text>
          </View>

          {/* Fine balance */}
          {fineBalance > 0 && (
            <View
              style={{
                paddingHorizontal: Spacing[2],
                paddingVertical: 1,
                borderRadius: Radius.full,
                backgroundColor: colors.destructive + '15',
              }}
            >
              <Text
                style={{
                  fontSize: Typography.fontSize.xs,
                  fontWeight: Typography.fontWeight.semibold,
                  color: colors.destructive,
                }}
              >
                {formatCurrency(fineBalance)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Chevron */}
      {showChevron && <ChevronRight size={18} color={colors.mutedForeground} />}
    </TouchableOpacity>
  );
}
