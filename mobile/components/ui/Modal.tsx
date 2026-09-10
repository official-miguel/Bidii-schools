/**
 * Modal — bottom sheet / centered dialog wrapper.
 * Matches the web's dialog/confirm-popup pattern.
 */

import React from 'react';
import {
  View,
  Text,
  Modal as RNModal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { Colors, Radius, Typography, Spacing, Shadows } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  /** Prevent closing by tapping backdrop */
  dismissible?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  style,
  dismissible = true,
}: ModalProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const maxHeight = size === 'sm' ? '40%' : size === 'md' ? '65%' : '90%';

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissible ? onClose : undefined}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Backdrop — always semi-transparent black for consistent depth cue */}
        <TouchableWithoutFeedback onPress={dismissible ? onClose : undefined}>
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
            }}
          />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Spacing[4] }}>
          <View
            style={[
              {
                backgroundColor: colors.card,
                borderRadius: Radius.dialog,
                maxHeight,
                overflow: 'hidden',
                ...Shadows.xl,
              },
              style,
            ]}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: Spacing[5],
                paddingTop: Spacing[5],
                paddingBottom: Spacing[3],
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: Typography.fontSize.base,
                  fontWeight: Typography.fontWeight.semibold,
                  color: colors.foreground,
                  flex: 1,
                }}
              >
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <X size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView
              contentContainerStyle={{ padding: Spacing[5] }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {/* Footer */}
            {footer && (
              <View
                style={{
                  flexDirection: 'row',
                  gap: Spacing[2],
                  paddingHorizontal: Spacing[5],
                  paddingBottom: Spacing[5] + insets.bottom,
                  paddingTop: Spacing[3],
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                {footer}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ── Confirm dialog (named pop-up for reservations, etc.) ────────────────────

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  // brand: teal / danger action buttons — intentional, contrast ≥ 4.5:1 for white text
  const confirmBg = variant === 'danger' ? colors.destructive : colors.primary;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            paddingHorizontal: Spacing[6],
          }}
        >
          <TouchableWithoutFeedback>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: Radius.dialog,
                padding: Spacing[5],
                ...Shadows.xl,
              }}
            >
              <Text
                style={{
                  fontSize: Typography.fontSize.base,
                  fontWeight: Typography.fontWeight.semibold,
                  color: colors.foreground,
                  marginBottom: Spacing[2],
                }}
              >
                {title}
              </Text>

              <Text
                style={{
                  fontSize: Typography.fontSize.sm,
                  color: colors.mutedForeground,
                  lineHeight: Typography.lineHeight.base,
                  marginBottom: Spacing[5],
                }}
              >
                {message}
              </Text>

              <View style={{ flexDirection: 'row', gap: Spacing[3] }}>
                {/* Cancel */}
                <TouchableOpacity
                  onPress={onCancel}
                  disabled={loading}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing[2.5],
                    borderRadius: Radius.button,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.fontSize.sm,
                      fontWeight: Typography.fontWeight.medium,
                      color: colors.foreground,
                    }}
                  >
                    {cancelLabel}
                  </Text>
                </TouchableOpacity>

                {/* Confirm */}
                <TouchableOpacity
                  onPress={onConfirm}
                  disabled={loading}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing[2.5],
                    borderRadius: Radius.button,
                    backgroundColor: loading ? confirmBg + '70' : confirmBg,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: Typography.fontSize.sm,
                      fontWeight: Typography.fontWeight.semibold,
                      color: colors.primaryForeground,
                    }}
                  >
                    {loading ? 'Please wait…' : confirmLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}
