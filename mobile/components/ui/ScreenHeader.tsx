/**
 * ScreenHeader — teal top bar that sits above SafeArea, with optional back button.
 * Consistent across all screens.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Spacing, Typography } from '@/constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
  /** Override background colour — defaults to teal (brand color, intentional) */
  color?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  right,
  style,
  color,
}: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  // brand: teal header — intentional, brand primary color, contrast ≥ 4.5:1 for white text
  const bgColor = color || colors.primary;

  const handleBack = onBack || (() => router.back());

  return (
    <View
      style={[
        {
          backgroundColor: bgColor,
          paddingTop: insets.top + Spacing[3],
          paddingBottom: Spacing[5],
          paddingHorizontal: Spacing[6],
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Left: back button or spacer */}
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ marginRight: Spacing[2] }}
          >
            <ChevronLeft size={24} color={'#FFFFFF'} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 + Spacing[2] }} />
        )}

        {/* Center: title */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: Typography.fontSize.xl,
              fontWeight: Typography.fontWeight.bold,
              textAlign: showBack ? 'center' : 'left',
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle && (
            <Text
              style={{
              color: 'rgba(255,255,255,0.8)',
                fontSize: Typography.fontSize.sm,
                marginTop: 2,
                textAlign: showBack ? 'center' : 'left',
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right: actions or spacer */}
        {right ? (
          <View style={{ marginLeft: Spacing[2] }}>{right}</View>
        ) : (
          <View style={{ width: showBack ? 24 + Spacing[2] : 0 }} />
        )}
      </View>
    </View>
  );
}
