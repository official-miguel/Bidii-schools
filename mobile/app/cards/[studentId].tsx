/**
 * Student Library Card Detail Screen
 *
 * Renders the student's digital library card:
 *   - Student photo (or initials avatar) + name + admission number
 *   - Card number, status badge, expiry
 *   - Fine balance + paid total
 *   - Current borrow count + total borrows
 *   - Active borrows list (with overdue highlighting + due date)
 *   - Borrow history (collapsible)
 *   - Suspend / Unsuspend card action (librarian/principal)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CreditCard, BookOpen, AlertTriangle, ChevronDown,
  ChevronUp, CheckCircle2, Clock, Ban, Shield,
} from 'lucide-react-native';
import {
  ScreenHeader, Card, Avatar, Button,
  ErrorBanner, Toast, useToast, ConfirmModal,
} from '@/components/ui';
import { api, CardDetail, BorrowRow } from '@/services/api';
import { Spacing, Typography, Radius, CardStatusColors } from '@/constants';
import { isLibrarian, isPrincipal } from '@/lib/auth';
import {
  formatDate, formatCurrency, cardStatusLabel,
  isOverdue, daysOverdue, daysUntilDue, getErrorMessage,
} from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

export default function StudentCardScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const router        = useRouter();
  const insets        = useSafeAreaInsets();
  const { colors }    = useTheme();
  const { toastProps, show: showToast } = useToast();
  const canManage = isLibrarian() || isPrincipal();

  const [detail,    setDetail]    = useState<CardDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Suspend modal
  const [showSuspend,     setShowSuspend]     = useState(false);
  const [suspendReason,   setSuspendReason]   = useState('');
  const [suspendError,    setSuspendError]    = useState('');
  const [savingSuspend,   setSavingSuspend]   = useState(false);

  // Unsuspend confirm
  const [showUnsuspend,   setShowUnsuspend]   = useState(false);
  const [savingUnsuspend, setSavingUnsuspend] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    try {
      setError(null);
      const data = await api.getCard(studentId);
      setDetail(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load library card');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  // ── Suspend ───────────────────────────────────────────────────────────────

  const handleSuspend = async () => {
    if (!suspendReason.trim()) { setSuspendError('Please provide a reason for suspension'); return; }
    if (!detail) return;
    setSavingSuspend(true);
    try {
      await api.patch(`/api/library/cards/${detail.card.id}/suspend`, { reason: suspendReason.trim() });
      showToast('Card suspended', 'warn');
      setShowSuspend(false);
      setSuspendReason('');
      load();
    } catch (err: any) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSavingSuspend(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!detail) return;
    setSavingUnsuspend(true);
    try {
      await api.patch(`/api/library/cards/${detail.card.id}/unsuspend`, {});
      showToast('Card reactivated', 'success');
      setShowUnsuspend(false);
      load();
    } catch (err: any) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSavingUnsuspend(false);
    }
  };

  // ── Loading / Error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Library Card" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Library Card" showBack />
        <ErrorBanner message={error || 'Card not found'} style={{ margin: Spacing[4] }} />
      </View>
    );
  }

  const { student, card, settings } = detail;
  const photoId     = student.files[0]?.id;
  const cardStatus  = card.status;
  const statusColors = CardStatusColors[cardStatus] || { bg: colors.border, text: colors.mutedForeground, border: colors.border };
  const activeBorrows  = card.borrows.filter(b => !b.returnedAt);
  const returnedBorrows = card.borrows.filter(b => b.returnedAt);

  const hasOverdue   = activeBorrows.some(b => isOverdue(b.dueAt));
  const isBlocked    = cardStatus !== 'ACTIVE';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={student.fullName}
        subtitle={student.admissionNumber}
        showBack
        color={isBlocked ? colors.mutedForeground : colors.primary}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing[8] }}
      >
        {/* ── Visual Library Card ─────────────────────────────────── */}
        <View style={{
          backgroundColor: isBlocked ? colors.mutedForeground : colors.primary,
          paddingHorizontal: Spacing[6],
          paddingTop: Spacing[2],
          paddingBottom: Spacing[8],
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[4] }}>
            {/* Photo */}
            <Avatar name={student.fullName} photoFileId={photoId} size="xl" />

            {/* Card info */}
            <View style={{ flex: 1, gap: Spacing[1] }}>
              <Text style={{ color: '#FFFFFF', fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold }} numberOfLines={1}>
                {student.fullName}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: Typography.fontSize.sm }}>
                {student.admissionNumber}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: Typography.fontSize.sm }}>
                {student.schoolClass.name}
              </Text>
              <View style={{ marginTop: Spacing[1] }}>
                <View style={{
                  alignSelf: 'flex-start',
                  backgroundColor: statusColors.bg,
                  paddingHorizontal: Spacing[3], paddingVertical: Spacing[1],
                  borderRadius: Radius.full,
                }}>
                  <Text style={{ color: statusColors.text, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
                    {cardStatusLabel(cardStatus)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Card number */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginTop: Spacing[4] }}>
            <CreditCard size={16} color={'rgba(255,255,255,0.5)'} />
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: Typography.fontSize.xs }}>
              Card No: {card.cardNumber || student.admissionNumber}
            </Text>
            {card.expiresAt && (
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: Typography.fontSize.xs, marginLeft: Spacing[4] }}>
                Expires: {formatDate(card.expiresAt)}
              </Text>
            )}
          </View>

          {/* Suspension reason */}
          {cardStatus === 'SUSPENDED' && card.suspensionReason && (
            <View style={{
              backgroundColor: colors.warn, borderRadius: Radius.sm,
              padding: Spacing[3], marginTop: Spacing[3],
              flexDirection: 'row', gap: Spacing[2],
            }}>
              <Ban size={14} color={colors.warnForeground} />
              <Text style={{ color: colors.warnForeground, fontSize: Typography.fontSize.xs, flex: 1 }}>
                {card.suspensionReason}
              </Text>
            </View>
          )}
        </View>

        <View style={{ padding: Spacing[4], gap: Spacing[4] }}>
          {/* ── Stats row ──────────────────────────────────────────── */}
          <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
            <StatBox value={card.fineBalance > 0 ? formatCurrency(card.fineBalance) : '—'} label="Fine Balance" color={card.fineBalance > 0 ? colors.destructive : colors.successForeground} colors={colors} />
            <StatBox value={card.currentBorrowCount.toString()} label="Books Out" color={'#2E90FA'} colors={colors} />
            <StatBox value={card.totalBorrowCount.toString()} label="All Time" color={colors.primary} colors={colors} />
          </View>

          {/* Fine balance warning */}
          {card.fineBalance > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: Spacing[2],
              backgroundColor: colors.destructive + '15', borderRadius: Radius.button,
              padding: Spacing[3], borderWidth: 1, borderColor: colors.destructive + '30',
            }}>
              <AlertTriangle size={16} color={colors.destructive} />
              <Text style={{ flex: 1, fontSize: Typography.fontSize.sm, color: colors.destructive }}>
                Outstanding fine: {formatCurrency(card.fineBalance)}
                {card.fineBalance >= (settings.finePerDay * 10) ? ' — borrowing may be blocked' : ''}
              </Text>
            </View>
          )}

          {/* ── Active Borrows ──────────────────────────────────────── */}
          <Card padding="none">
            <View style={{ padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }}>
                Currently Borrowed ({activeBorrows.length})
              </Text>
            </View>
            {activeBorrows.length === 0 ? (
              <View style={{ padding: Spacing[6], alignItems: 'center' }}>
                <CheckCircle2 size={24} color={colors.successForeground} />
                <Text style={{ fontSize: Typography.fontSize.sm, color: colors.mutedForeground, marginTop: Spacing[2] }}>
                  No books currently borrowed
                </Text>
              </View>
            ) : (
              activeBorrows.map((borrow, idx) => (
                <BorrowRow
                  key={borrow.id}
                  borrow={borrow}
                  isLast={idx === activeBorrows.length - 1}
                  colors={colors}
                />
              ))
            )}
          </Card>

          {/* ── Borrow History ──────────────────────────────────────── */}
          {returnedBorrows.length > 0 && (
            <Card padding="none">
              <TouchableOpacity
                onPress={() => setShowHistory(v => !v)}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  padding: Spacing[4],
                  borderBottomWidth: showHistory ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }}>
                  History ({returnedBorrows.length})
                </Text>
                {showHistory ? <ChevronUp size={18} color={colors.mutedForeground} /> : <ChevronDown size={18} color={colors.mutedForeground} />}
              </TouchableOpacity>

              {showHistory && returnedBorrows.slice(0, 20).map((borrow, idx) => (
                <BorrowRow
                  key={borrow.id}
                  borrow={borrow}
                  isLast={idx === Math.min(returnedBorrows.length, 20) - 1}
                  dimmed
                  colors={colors}
                />
              ))}
            </Card>
          )}

          {/* ── Card Actions (librarian/principal) ─────────────────── */}
          {canManage && (
            <Card>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing[3] }}>
                Card Actions
              </Text>
              <View style={{ gap: Spacing[2] }}>
                {cardStatus === 'ACTIVE' ? (
                  <Button
                    label="Suspend Card"
                    onPress={() => setShowSuspend(true)}
                    variant="danger"
                    icon={<Ban size={16} color={'#FFFFFF'} />}
                    fullWidth
                  />
                ) : cardStatus === 'SUSPENDED' ? (
                  <Button
                    label="Reactivate Card"
                    onPress={() => setShowUnsuspend(true)}
                    variant="primary"
                    icon={<Shield size={16} color={'#FFFFFF'} />}
                    fullWidth
                  />
                ) : null}

                {/* Go to circulation for this student */}
                <Button
                  label="Issue / Return Book"
                  onPress={() => router.push({ pathname: '/(tabs)/circulate', params: { preloadStudentId: studentId } })}
                  variant="secondary"
                  icon={<BookOpen size={16} color={colors.foreground} />}
                  fullWidth
                />
              </View>
            </Card>
          )}
        </View>
      </ScrollView>

      {/* Suspend modal */}
      <ConfirmModal
        visible={showSuspend}
        title="Suspend Library Card"
        message=""
        confirmLabel="Suspend"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleSuspend}
        onCancel={() => { setShowSuspend(false); setSuspendReason(''); setSuspendError(''); }}
        loading={savingSuspend}
      />

      {/* Unsuspend confirm */}
      <ConfirmModal
        visible={showUnsuspend}
        title="Reactivate Card"
        message={`Reactivate ${student.fullName}'s library card? They will be able to borrow books immediately.`}
        confirmLabel="Reactivate"
        onConfirm={handleUnsuspend}
        onCancel={() => setShowUnsuspend(false)}
        loading={savingUnsuspend}
      />

      <Toast {...toastProps} />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

import type { ColorTokens } from '@/constants';

function StatBox({ value, label, color, colors }: { value: string; label: string; color: string; colors: ColorTokens }) {
  return (
    <View style={{
      flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: Radius.button, padding: Spacing[3], alignItems: 'center',
    }}>
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color }}>{value}</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function BorrowRow({ borrow, isLast, dimmed = false, colors }: { borrow: BorrowRow; isLast: boolean; dimmed?: boolean; colors: ColorTokens }) {
  const title = borrow.copy?.catalogue?.title || borrow.book?.title || 'Unknown';
  const acc   = borrow.copy?.accessionNumber;
  const overdue = !borrow.returnedAt && isOverdue(borrow.dueAt);
  const daysOver = overdue ? daysOverdue(borrow.dueAt) : 0;
  const daysLeft = !borrow.returnedAt && !overdue ? daysUntilDue(borrow.dueAt) : null;

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
      padding: Spacing[4],
      borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border,
      opacity: dimmed ? 0.7 : 1,
      backgroundColor: overdue ? colors.destructive + '15' : colors.card,
    }}>
      <View style={{ marginTop: 2 }}>
        {borrow.returnedAt ? (
          <CheckCircle2 size={16} color={colors.successForeground} />
        ) : overdue ? (
          <AlertTriangle size={16} color={colors.destructive} />
        ) : (
          <Clock size={16} color={'#2E90FA'} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: colors.foreground }} numberOfLines={1}>
          {title}
        </Text>
        {acc && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
            {acc}
          </Text>
        )}
        <Text style={{ fontSize: Typography.fontSize.xs, color: overdue ? colors.destructive : colors.mutedForeground }}>
          {borrow.returnedAt
            ? `Returned ${formatDate(borrow.returnedAt)}`
            : overdue
            ? `Overdue by ${daysOver} day${daysOver !== 1 ? 's' : ''} — due ${formatDate(borrow.dueAt)}`
            : `Due ${formatDate(borrow.dueAt)}${daysLeft !== null ? ` (${daysLeft}d left)` : ''}`}
        </Text>
        {(borrow.fineAmount ?? 0) > 0 && (
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.destructive }}>
            Fine: {formatCurrency(borrow.fineAmount)}
          </Text>
        )}
        {borrow.renewalCount > 0 && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>
            Renewed {borrow.renewalCount}× 
          </Text>
        )}
      </View>
    </View>
  );
}
