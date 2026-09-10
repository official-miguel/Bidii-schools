/**
 * BookCopy Detail / Edit Screen
 *
 * Shows full info for one physical copy:
 * - Accession number, QR code, barcode
 * - Current status + condition
 * - Active borrow info (if borrowed)
 * - Condition update form (librarian/principal)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Edit2, QrCode, Hash, Calendar } from 'lucide-react-native';
import {
  ScreenHeader, Card, Badge, BadgeVariant, Button,
  ErrorBanner, Toast, useToast, ConfirmModal,
} from '@/components/ui';
import { api, CopyRecord } from '@/services/api';
import { Spacing, Typography, Radius, CopyStatusColors, ConditionColors } from '@/constants';
import { isLibrarian, isPrincipal } from '@/lib/auth';
import { formatDate, copyStatusLabel, conditionLabel, getErrorMessage } from '@/lib/utils';
import { useTheme } from '@/lib/ThemeContext';

const CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED'] as const;
type Condition = typeof CONDITIONS[number];

export default function CopyDetailScreen() {
  const { id: catalogueId, copyId } = useLocalSearchParams<{ id: string; copyId: string }>();
  const router     = useRouter();
  const { colors } = useTheme();
  const { toastProps, show: showToast } = useToast();
  const canManage  = isLibrarian() || isPrincipal();

  const [copy,      setCopy]      = useState<CopyRecord | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Edit condition state
  const [editingCondition, setEditingCondition] = useState(false);
  const [newCondition,     setNewCondition]     = useState<Condition>('GOOD');
  const [saving,           setSaving]           = useState(false);

  // Archive confirm
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!copyId) return;
    try {
      setError(null);
      // Fetch copy via catalogue copies list (find matching)
      const catalogueData = await api.getCatalogueWithCopies(catalogueId!);
      const found = catalogueData.copies.find(c => c.id === copyId);
      if (!found) throw new Error('Copy not found');
      setCopy(found);
      setNewCondition((found.condition as Condition) || 'GOOD');
    } catch (err: any) {
      setError(err.message || 'Failed to load copy details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [catalogueId, copyId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  const handleSaveCondition = async () => {
    if (!copy || !copyId) return;
    setSaving(true);
    try {
      await api.updateCopy(copyId, { condition: newCondition });
      showToast('Condition updated', 'success');
      setEditingCondition(false);
      load();
    } catch (err: any) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!copyId) return;
    setSaving(true);
    try {
      await api.updateCopy(copyId, { status: 'ARCHIVED' } as any);
      showToast('Copy archived', 'success');
      setShowArchiveConfirm(false);
      router.back();
    } catch (err: any) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Copy Details" showBack />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error || !copy) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader title="Copy Details" showBack />
        <ErrorBanner message={error || 'Copy not found'} style={{ margin: Spacing[4] }} />
      </View>
    );
  }

  const statusColors  = CopyStatusColors[copy.status]  || { bg: colors.border, text: colors.mutedForeground };
  const condColors    = ConditionColors[copy.condition] || { bg: colors.border, text: colors.mutedForeground };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title={copy.accessionNumber}
        subtitle="Physical copy"
        showBack
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[16] }}
      >
        {/* ── Status & Condition ─────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: Spacing[3] }}>
          <View style={{ flex: 1, backgroundColor: statusColors.bg, borderRadius: Radius.card, padding: Spacing[4], alignItems: 'center' }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: statusColors.text, marginBottom: Spacing[1] }}>Status</Text>
            <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: statusColors.text }}>
              {copyStatusLabel(copy.status)}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: condColors.bg, borderRadius: Radius.card, padding: Spacing[4], alignItems: 'center' }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: condColors.text, marginBottom: Spacing[1] }}>Condition</Text>
            <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: condColors.text }}>
              {conditionLabel(copy.condition)}
            </Text>
          </View>
        </View>

        {/* ── Details ───────────────────────────────────────────── */}
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing[3] }}>
            Copy Details
          </Text>
          <View style={{ gap: Spacing[3] }}>
            <InfoRow icon={<Hash size={14} color={colors.mutedForeground} />} label="Accession Number" colors={colors}>
              {copy.accessionNumber}
            </InfoRow>

            {copy.qrCode && (
              <InfoRow icon={<QrCode size={14} color={colors.mutedForeground} />} label="QR Code" colors={colors}>
                {copy.qrCode}
              </InfoRow>
            )}

            {copy.acquisitionDate && (
              <InfoRow icon={<Calendar size={14} color={colors.mutedForeground} />} label="Acquired" colors={colors}>
                {formatDate(copy.acquisitionDate)}
              </InfoRow>
            )}

            {copy.cost != null && (
              <InfoRow icon={<Hash size={14} color={colors.mutedForeground} />} label="Cost" colors={colors}>
                KES {copy.cost.toFixed(2)}
              </InfoRow>
            )}
          </View>
        </Card>

        {/* ── Update Condition (librarian/principal) ─────────────── */}
        {canManage && (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[3] }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Update Condition
              </Text>
              {!editingCondition && (
                <TouchableOpacity onPress={() => setEditingCondition(true)}>
                  <Edit2 size={16} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {editingCondition ? (
              <View style={{ gap: Spacing[3] }}>
                <View style={{ flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' }}>
                  {CONDITIONS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewCondition(c)}
                      style={{
                        paddingHorizontal: Spacing[3], paddingVertical: Spacing[2],
                        borderRadius: Radius.button, borderWidth: 1,
                        borderColor: newCondition === c ? colors.primary : colors.border,
                        backgroundColor: newCondition === c ? colors.primary + '15' : colors.card,
                      }}
                    >
                      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: newCondition === c ? colors.primary : colors.mutedForeground }}>
                        {newCondition === c ? `✓ ` : ''}{conditionLabel(c)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
                  <Button label="Cancel" onPress={() => setEditingCondition(false)} variant="secondary" size="sm" style={{ flex: 1 }} />
                  <Button label={saving ? 'Saving…' : 'Save'} onPress={handleSaveCondition} loading={saving} size="sm" style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: Typography.fontSize.sm, color: colors.mutedForeground }}>
                Current: <Text style={{ fontWeight: Typography.fontWeight.semibold, color: colors.foreground }}>{conditionLabel(copy.condition)}</Text>
              </Text>
            )}
          </Card>
        )}

        {/* ── Archive ───────────────────────────────────────────── */}
        {canManage && copy.status !== 'ARCHIVED' && copy.status !== 'BORROWED' && (
          <Button
            label="Archive This Copy"
            onPress={() => setShowArchiveConfirm(true)}
            variant="danger"
            fullWidth
          />
        )}
      </ScrollView>

      <ConfirmModal
        visible={showArchiveConfirm}
        title="Archive Copy"
        message={`Archive copy ${copy.accessionNumber}? This copy will be removed from active circulation but its borrow history will be preserved.`}
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
        variant="danger"
        loading={saving}
      />

      <Toast {...toastProps} />
    </View>
  );
}

import type { ColorTokens } from '@/constants';

function InfoRow({ icon, label, children, colors }: { icon: React.ReactNode; label: string; children: React.ReactNode; colors: ColorTokens }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground, marginBottom: 1 }}>{label}</Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: colors.foreground }}>{String(children)}</Text>
      </View>
    </View>
  );
}
