/**
 * Avatar — student photo or initials fallback.
 * Matches the StudentPhoto component from the web's circulate page.
 */

import React, { useState } from 'react';
import { View, Text, Image, ViewStyle } from 'react-native';
import { Typography, Radius } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { initials } from '@/lib/utils';
import { api } from '@/services/api';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<AvatarSize, { container: number; font: number }> = {
  xs: { container: 28, font: 10 },
  sm: { container: 36, font: 13 },
  md: { container: 48, font: 16 },
  lg: { container: 64, font: 22 },
  xl: { container: 80, font: 28 },
};

interface AvatarProps {
  name: string;
  photoFileId?: string | null;
  size?: AvatarSize;
  style?: ViewStyle;
}

export function Avatar({ name, photoFileId, size = 'md', style }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const { colors } = useTheme();
  const dims = SIZE_MAP[size];
  const abbr = initials(name);
  const showPhoto = !!photoFileId && !imgError;

  const containerStyle: ViewStyle = {
    width: dims.container,
    height: dims.container,
    borderRadius: Radius.full,
    overflow: 'hidden',
    flexShrink: 0,
    borderWidth: 2,
    borderColor: showPhoto ? colors.border : colors.primary + '30',
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (showPhoto) {
    return (
      <View style={[containerStyle, style]}>
        <Image
          source={{ uri: api.getStudentPhoto(photoFileId!) }}
          style={{ width: dims.container - 4, height: dims.container - 4, borderRadius: Radius.full }}
          onError={() => setImgError(true)}
        />
      </View>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      <Text
        style={{
          color: colors.primary,
          fontSize: dims.font,
          fontWeight: Typography.fontWeight.bold,
        }}
      >
        {abbr}
      </Text>
    </View>
  );
}
