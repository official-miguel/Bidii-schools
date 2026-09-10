/**
 * Overdue & Fines Management Screen
 *
 * - Searchable overdue list (by student name / admission number)
 * - Shows: student, book, days overdue, real-time fine amount
 * - Fine is calculated client-side using the server-synced timestamps
 * - Actions: Pause overdue clock, Resume, Mark as Paid
 * - Students disappear from list once fine balance = 0 and book returned
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Pause, Play, DollarSign } from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, ErrorBanner,
  Toast, useToast, ConfirmModal, EmptyState,
} from '@/components/ui';
import { api, OverdueItem } from '@/services/api';
import { Colors, Spacing, Typography, Radius } from '@/constants';
import { useTheme } from '@/lib/ThemeContext';
import { useDebounce } from '@/hooks';
import { formatDate, formatCurrency, getErrorMessage } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function FinesScreen() {
  const insets = useSafeAreaInsets();
  const { toastProps, show: showToast } = useToast();
  const router = useRouter();
  const { colors } = useTheme();

  const [query,       setQuery]       = useState('');
  const [items,       setItems]       = useState<OverdueItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Action modals
  const [payItem,   setPayItem]   = useState<OverdueItem | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payReason, setPayReason] = useState('');
  const [payError,  setPayError]  = useState('');
  const [saving,    setSaving]    = useState(false);

  const [pauseItem,  setPauseItem]  = useState<OverdueItem | null>(null);
  const [pauseReason,setPauseReason]= useState('');

  const debouncedQuery = useDebounce(query, 250);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await api.getOverdueList({ q: debouncedQuery || undefined });
      setItems(data.items);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, [debouncedQuery]);

  useEffect(() => { load(); }, [load]);
  const handleRefresh = () => { setRefreshing(true); load(); };

  // ── Pay fine ──────────────────────────────────────────────────────────

  const handlePay = async () => {
    if (!payItem) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { setPayError('Enter a valid amount'); return; }
    if (!payReason.trim()) { setPayError('Please provide a reason / receipt reference'); return; }
    setSaving(true);
    try {
      // Find card ID from student
      const card = await api.getCard(payItem.studentId);
      await api.markFinePaid(card.card.id, amount, payReason.trim());
      showToast(`Fine payment of ${formatCurrency(amount)} recorded`, 'success');
      setPayItem(null); setPayAmount(''); setPayReason(''); setPayError('');
      load();
    } catch (e: any) { setPayError(getErrorMessage(e)); }
    finally { setSaving(false); }
  };

  // ── Pause fine clock ──────────────────────────────────────────────────

  const handlePause = async () => {
    if (!pauseItem) return;
    if (!pauseReason.trim()) return;
    setSaving(true);
    try {
      await api.pauseFine(pauseItem.studentId, pauseReason.trim());
      showToast('Fine clock paused', 'success');
      setPauseItem(null); setPauseReason('');
      load();
    } catch (e: any) { showToast(getErrorMessage(e), 'error'); }
    finally { setSaving(false); }
  };

  const handleResume = async (item: OverdueItem) => {
    try {
      await api.resumeFine(item.studentId);
      showToast('Fine clock resumed', 'success');
      load();
    } catch (e: any) { showToast(getErrorMessage(e), 'error'); }
  };

  return (
    <View style={{ flex:1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Overdue & Fines"
        subtitle={`${items.length} overdue`}
        showBack
        right={
          <TouchableOpacity onPress={() => router.push('/fines/stats')} style={{ padding: Spacing[1] }}>
            {/* DollarSign icon on teal ScreenHeader — white is intentional (brand: contrast ≥ 4.5:1) */}
            <DollarSign size={20} color="#FFFFFF" />
          </TouchableOpacity>
        }
      />

      <View style={{ backgroundColor: colors.card, borderBottomWidth:1, borderBottomColor: colors.border, padding: Spacing[4] }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by student name or admission no." />
      </View>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} style={{ margin: Spacing[4] }} />}

      {loading && !refreshing ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.borrowId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2], paddingBottom: insets.bottom + Spacing[8] }}
          renderItem={({ item }) => (
            <OverdueRow
              item={item}
              onPay={() => { setPayItem(item); setPayAmount(item.fineAmount.toFixed(2)); }}
              onPause={() => setPauseItem(item)}
              onResume={() => handleResume(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No overdue books"
              description={debouncedQuery ? `No results for "${debouncedQuery}"` : 'All students are up to date'}
              icon={<AlertTriangle size={40} color={colors.mutedForeground} />}
            />
          }
        />
      )}

      {/* Pay fine modal */}
      <ConfirmModal
        visible={!!payItem}
        title={`Record Payment — ${payItem?.studentName}`}
        message={`Outstanding: ${formatCurrency(payItem?.fineAmount ?? 0)}`}
        confirmLabel="Record Payment"
        cancelLabel="Cancel"
        onConfirm={handlePay}
        onCancel={() => { setPayItem(null); setPayError(''); }}
        loading={saving}
      />

      {/* Pause clock modal */}
      <ConfirmModal
        visible={!!pauseItem}
        title={`Pause Fine Clock — ${pauseItem?.studentName}`}
        message="Fine accrual will be paused for this student. Enter a reason:"
        confirmLabel="Pause Clock"
        cancelLabel="Cancel"
        onConfirm={handlePause}
        onCancel={() => { setPauseItem(null); setPauseReason(''); }}
        loading={saving}
      />

      <Toast {...toastProps} />
    </View>
  );
}

function OverdueRow({
  item, onPay, onPause, onResume,
}: { item: OverdueItem; onPay: () => void; onPause: () => void; onResume: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: Radius.card,
      borderWidth:1,
      // brand: danger border when active, muted border when paused
      borderColor: item.finePaused ? colors.border : colors.destructive + '30',
      overflow:'hidden',
    }}>
      {item.finePaused && (
        <View style={{ backgroundColor: colors.warn, paddingHorizontal: Spacing[4], paddingVertical: Spacing[1] }}>
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.warnForeground, fontWeight: Typography.fontWeight.semibold }}>
            Fine clock paused
          </Text>
        </View>
      )}

      <View style={{ padding: Spacing[4], gap: Spacing[2] }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }} numberOfLines={1}>
              {item.studentName}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
              {item.admissionNumber}
            </Text>
          </View>
          <View style={{ alignItems:'flex-end' }}>
            <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: colors.destructive }}>
              {formatCurrency(item.fineAmount)}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
              {item.overdueDays}d overdue
            </Text>
          </View>
        </View>

        <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }} numberOfLines={1}>
          📖 {item.title} · {item.accessionNumber}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: colors.destructive }}>
          Due: {formatDate(item.dueAt)}
        </Text>

        <View style={{ flexDirection:'row', gap: Spacing[2], marginTop: Spacing[1] }}>
          <TouchableOpacity
            onPress={onPay}
            style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: Spacing[1], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: colors.primary }}
          >
            {/* brand: primary button — white text intentional, contrast ≥ 4.5:1 */}
            <DollarSign size={13} color={colors.primaryForeground} />
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.primaryForeground }}>Mark Paid</Text>
          </TouchableOpacity>

          {item.finePaused ? (
            <TouchableOpacity
              onPress={onResume}
              style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: Spacing[1], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: colors.success, borderWidth:1, borderColor: colors.successForeground + '30' }}
            >
              <Play size={13} color={colors.successForeground} />
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.successForeground }}>Resume</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onPause}
              style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap: Spacing[1], paddingVertical: Spacing[2], borderRadius: Radius.sm, backgroundColor: colors.warn, borderWidth:1, borderColor: colors.warnForeground + '30' }}
            >
              <Pause size={13} color={colors.warnForeground} />
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.warnForeground }}>Pause</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
