/**
 * Toast — lightweight in-app notification, auto-dismisses.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, ViewStyle } from 'react-native';
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react-native';
import { Radius, Typography, Spacing, Shadows } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

export type ToastVariant = 'success' | 'error' | 'info' | 'warn';

interface ToastProps {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onHide?: () => void;
  style?: ViewStyle;
}

export function Toast({
  visible,
  message,
  variant = 'success',
  duration = 3000,
  onHide,
  style,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const { colors } = useTheme();

  // Icon and accent color per variant — uses semantic status colors
  const ICONS: Record<ToastVariant, { icon: React.ReactNode; bg: string; border: string }> = {
    success: { icon: <CheckCircle2 size={18} color={colors.successForeground} />, bg: colors.success, border: colors.successForeground + '40' },
    error:   { icon: <AlertCircle  size={18} color={colors.destructive} />, bg: colors.destructive + '15', border: colors.destructive + '40' },
    // info variant uses semantic muted surface so it adapts correctly in dark mode
    info:    { icon: <Info         size={18} color={colors.primary} />, bg: colors.muted, border: colors.primary + '40' },
    warn:    { icon: <AlertTriangle size={18} color={colors.warnForeground} />, bg: colors.warn, border: colors.warnForeground + '40' },
  };

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(duration),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => onHide?.());
    }
  }, [visible, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const { icon, bg, border } = ICONS[variant];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: Spacing[12],
          left: Spacing[4],
          right: Spacing[4],
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing[3],
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          borderRadius: Radius.card,
          paddingHorizontal: Spacing[4],
          paddingVertical: Spacing[3],
          opacity,
          ...Shadows.md,
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          flex: 1,
          fontSize: Typography.fontSize.sm,
          color: colors.foreground,
        }}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

// ── useToast hook ─────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';

interface ToastState {
  visible: boolean;
  message: string;
  variant: ToastVariant;
}

export function useToast() {
  const [state, setState] = useState<ToastState>({
    visible: false,
    message: '',
    variant: 'success',
  });

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    setState({ visible: true, message, variant });
  }, []);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const toastProps = { ...state, onHide: hide };

  return { show, hide, toastProps };
}
