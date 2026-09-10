/**
 * SearchBar — debounced live-search input.
 * Matches the discipline module's search-as-you-type pattern (250ms debounce).
 */

import React, { useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Radius, Typography, Spacing } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  loading?: boolean;
  autoFocus?: boolean;
  style?: ViewStyle;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmit?: () => void;
}

type TextInputProps = React.ComponentProps<typeof TextInput>;

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search…',
  loading = false,
  autoFocus = false,
  style,
  returnKeyType = 'search',
  onSubmit,
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const { colors } = useTheme();

  const handleClear = () => {
    onChangeText('');
    inputRef.current?.focus();
  };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radius.button,
          paddingLeft: Spacing[3],
          paddingRight: Spacing[2],
          height: 44,
          gap: Spacing[2],
        },
        style,
      ]}
    >
      {/* Search icon or spinner */}
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Search size={18} color={colors.mutedForeground} />
      )}

      {/* Input */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmit}
        style={{
          flex: 1,
          fontSize: Typography.fontSize.sm,
          color: colors.foreground,
          fontFamily: Typography.fontFamily.sans,
          paddingVertical: 0, // remove Android default padding
        }}
      />

      {/* Clear button */}
      {value.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <X size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  );
}
