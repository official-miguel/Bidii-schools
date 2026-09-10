/**
 * Reservations Screen — first-in-line queue management.
 *
 * - Search by book title to see queue per title
 * - Each reservation row shows who is in queue (position + name)
 * - Confirm/Cancel pop-up naming the student
 * - Expired reservations auto-highlighted
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, Clock, CheckCircle2, XCircle, Plus } from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, Card, Badge, EmptyState,
  ErrorBanner, Toast, useToast, ConfirmModal,
} from '@/components/ui';
import { api, ReservationRecord } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { useDebounce } from '@/hooks';
import { formatDate, getErrorMessage } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

const STATUS_TABS = ['ALL','PENDING','ACTIVE','FULFILLED','CANCELLED','EXPIRED'] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function ReservationsScreen() {
  const insets = useSafeAreaInsets();
  const { toastProps, show: showToast } = useToast();
  const { colors } = useTheme();

  const [query,       setQuery]       = useState('');
  const [statusTab,   setStatusTab]   = useState<StatusTab>('ALL');
  const [reservations,setReservations]= useState<ReservationRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Confirm/Cancel action state
  const [actionRow,   setActionRow]   = useState<ReservationRecord | null>(null);
  const [actionType,  setActionType]  = useState<'fulfill' | 'cancel' | null>(null);
  const [acting,      setActing]      = useState(false);

  const debouncedQuery = useDebounce(query, 250);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.getReservations({
        status: statusTab === 'ALL' ? undefined : statusTab,
      });
      const filtered = debouncedQuery.trim()
        ? data.filter(r =>
            r.catalogue.title.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            r.student?.fullName.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
            r.student?.admissionNumber.toLowerCase().includes(debouncedQuery.toLowerCase())
          )
        : data;
      setReservations(filtered);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [debouncedQuery, statusTab]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const handleAction = async () => {
    if (!actionRow || !actionType) return;
    setActing(true);
    try {
      if (actionType === 'fulfill') {
        // Find first available copy for this catalogue
        const copies = await api.searchCopies(actionRow.catalogue.id);
        const avail  = copies.find(c => c.status === 'AVAILABLE');
        if (!avail) throw new Error('No available copies — cannot fulfill reservation');
        await api.fulfillReservation(actionRow.id, avail.id);
        showToast('Reservation fulfilled', 'success');
      } else {
        await api.cancelReservation(actionRow.id, 'Cancelled by librarian');
        showToast('Reservation cancelled', 'warn');
      }
      setActionRow(null); setActionType(null);
      load();
    } catch (e: any) {
      showToast(getErrorMessage(e), 'error');
    } finally { setActing(false); }
  };

  return (
    <View style={{ flex:1, backgroundColor: colors.background }}>
      <ScreenHeader title="Reservations" subtitle="Book reservation queue" />

      {/* Search */}
      <View style={{ backgroundColor: colors.card, borderBottomWidth:1, borderBottomColor: colors.border, padding: Spacing[4], gap: Spacing[3] }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by title or student…" />
        {/* Status tabs */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_TABS}
          keyExtractor={s => s}
          ItemSeparatorComponent={() => <View style={{ width: Spacing[2] }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setStatusTab(item)}
              style={{
                paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
                borderRadius: Radius.full, borderWidth:1,
                borderColor: statusTab === item ? colors.primary : colors.border,
                backgroundColor: statusTab === item ? colors.primary + '15' : colors.card,
              }}
            >
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: statusTab === item ? colors.primary : colors.mutedForeground }}>
                {item === 'ALL' ? 'All' : item.charAt(0) + item.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} style={{ margin: Spacing[4] }} />}

      {loading && !refreshing ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={r => r.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2], paddingBottom: insets.bottom + Spacing[8] }}
          renderItem={({ item }) => (
            <ReservationRow
              item={item}
              colors={colors}
              onFulfill={() => { setActionRow(item); setActionType('fulfill'); }}
              onCancel={()  => { setActionRow(item); setActionType('cancel'); }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No reservations"
              description={debouncedQuery ? `No results for "${debouncedQuery}"` : 'No reservations match the selected filter'}
              icon={<BookOpen size={40} color={colors.mutedForeground} />}
            />
          }
        />
      )}

      {/* Confirm modal — names the student explicitly */}
      <ConfirmModal
        visible={!!(actionRow && actionType)}
        title={actionType === 'fulfill' ? 'Fulfill Reservation' : 'Cancel Reservation'}
        message={
          actionType === 'fulfill'
            ? `Fulfill ${actionRow?.student?.fullName ?? 'this student'}'s reservation for "${actionRow?.catalogue.title}"?\nAn available copy will be allocated.`
            : `Cancel ${actionRow?.student?.fullName ?? 'this student'}'s reservation for "${actionRow?.catalogue.title}"? This cannot be undone.`
        }
        confirmLabel={actionType === 'fulfill' ? 'Fulfill' : 'Cancel Reservation'}
        cancelLabel="Go Back"
        variant={actionType === 'cancel' ? 'danger' : 'default'}
        onConfirm={handleAction}
        onCancel={() => { setActionRow(null); setActionType(null); }}
        loading={acting}
      />

      <Toast {...toastProps} />
    </View>
  );
}

import type { ColorTokens } from '@/constants';

function ReservationRow({
  item, onFulfill, onCancel, colors,
}: { item: ReservationRecord; onFulfill: () => void; onCancel: () => void; colors: ColorTokens }) {
  // Status color map using semantic tokens
  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    PENDING:   { bg: colors.warn,                   text: colors.warnForeground },
    ACTIVE:    { bg: '#2E90FA15',                   text: '#2E90FA' }, // info blue — chart series
    FULFILLED: { bg: colors.success,                text: colors.successForeground },
    CANCELLED: { bg: colors.border,                 text: colors.mutedForeground },
    EXPIRED:   { bg: colors.destructive + '15',     text: colors.destructive },
  };
  const sc = STATUS_COLORS[item.status] || { bg: colors.border, text: colors.mutedForeground };
  const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date() && item.status === 'PENDING';
  const canAct = item.status === 'PENDING' || item.status === 'ACTIVE';

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: Radius.card,
      borderWidth:1, borderColor: isExpired ? colors.destructive + '40' : colors.border,
      overflow:'hidden',
    }}>
      {/* Queue position ribbon */}
      {item.queuePosition != null && (
        <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: Spacing[4], paddingVertical: Spacing[1], borderBottomWidth:1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.primary, fontWeight: Typography.fontWeight.semibold }}>
            Queue position #{item.queuePosition}
          </Text>
        </View>
      )}

      <View style={{ padding: Spacing[4], gap: Spacing[2] }}>
        {/* Title */}
        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }} numberOfLines={1}>
          {item.catalogue.title}
        </Text>

        {/* Student */}
        {item.student && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
            {item.student.fullName} · {item.student.admissionNumber}
          </Text>
        )}

        {/* Status + expiry */}
        <View style={{ flexDirection:'row', gap: Spacing[2], alignItems:'center' }}>
          <View style={{ paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full, backgroundColor: sc.bg }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: sc.text }}>
              {item.status.charAt(0) + item.status.slice(1).toLowerCase()}
            </Text>
          </View>
          {item.expiresAt && (
            <Text style={{ fontSize: Typography.fontSize.xs, color: isExpired ? colors.destructive : colors.mutedForeground }}>
              {isExpired ? 'Expired ' : 'Expires '}{formatDate(item.expiresAt)}
            </Text>
          )}
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
            Reserved {formatDate(item.createdAt)}
          </Text>
        </View>

        {/* Actions */}
        {canAct && (
          <View style={{ flexDirection:'row', gap: Spacing[2], marginTop: Spacing[2] }}>
            <TouchableOpacity
              onPress={onFulfill}
              style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: Spacing[1.5], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: colors.primary }}
            >
              <CheckCircle2 size={14} color={'#FFFFFF'} />
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: '#FFFFFF' }}>Fulfill</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onCancel}
              style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: Spacing[1.5], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: colors.destructive + '15', borderWidth:1, borderColor: colors.destructive + '30' }}
            >
              <XCircle size={14} color={colors.destructive} />
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.destructive }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
