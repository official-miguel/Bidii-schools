/**
 * SyncStatusBar — persistent offline/sync indicator shown at the top of screens.
 * Appears only when offline or when there are pending sync items.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import { Spacing, Typography } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useNetworkState } from '@/hooks/useNetworkState';

export function SyncStatusBar() {
  const { status, pendingCount, triggerSync } = useSyncStatus();
  const { isOnline } = useNetworkState();
  const { colors } = useTheme();

  // Nothing to show when online and idle with nothing pending
  if (isOnline && status === 'idle' && pendingCount === 0) return null;

  const isOffline = !isOnline;
  const isSyncing = status === 'syncing';
  const hasError  = status === 'error';
  const hasPending = pendingCount > 0;

  let bgColor = colors.warn;
  let textColor = colors.warnForeground;
  let message = '';

  if (isOffline) {
    bgColor = colors.destructive + '15'; textColor = colors.destructive;
    message = hasPending
      ? `Offline — ${pendingCount} action${pendingCount !== 1 ? 's' : ''} queued`
      : 'You are offline — changes will sync when reconnected';
  } else if (isSyncing) {
    // info: using primary colors for syncing state — intentional
    bgColor = colors.primary + '15'; textColor = colors.primary;
    message = 'Syncing…';
  } else if (hasError) {
    bgColor = colors.destructive + '15'; textColor = colors.destructive;
    message = 'Sync failed — tap to retry';
  } else if (hasPending) {
    bgColor = colors.warn; textColor = colors.warnForeground;
    message = `${pendingCount} action${pendingCount !== 1 ? 's' : ''} pending sync`;
  }

  return (
    <TouchableOpacity
      onPress={isOnline && !isSyncing ? triggerSync : undefined}
      activeOpacity={isOnline ? 0.7 : 1}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
        backgroundColor: bgColor,
        paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
        borderBottomWidth: 1, borderBottomColor: textColor + '30',
      }}
    >
      {isOffline   && <WifiOff    size={14} color={textColor} />}
      {isSyncing   && <ActivityIndicator size="small" color={textColor} />}
      {hasError    && <RefreshCw  size={14} color={textColor} />}
      {!isOffline && !isSyncing && !hasError && hasPending && <RefreshCw size={14} color={textColor} />}

      <Text style={{ flex:1, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: textColor }}>
        {message}
      </Text>

      {isOnline && !isSyncing && hasPending && (
        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: textColor }}>
          Tap to sync
        </Text>
      )}
    </TouchableOpacity>
  );
}
