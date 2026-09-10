/**
 * Add / Edit BookCopy Screen
 *
 * Registers one physical copy under a catalogue entry.
 * Generates accession number, condition picker, acquisition info.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader, Input, Button, Card, ErrorBanner, Toast, useToast } from '@/components/ui';
import { api, CreateCopyInput } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { syncService } from '@/services/sync';
import { getErrorMessage } from '@/lib/utils';
import { useTheme } from '@/lib/ThemeContext';

const CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED'] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_LABELS: Record<Condition, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  DAMAGED: 'Damaged',
};

export default function NewCopyScreen() {
  const { id: catalogueId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { toastProps, show: showToast } = useToast();

  const [accessionNumber, setAccessionNumber] = useState('');
  const [condition, setCondition] = useState<Condition>('GOOD');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [cost, setCost] = useState('');

  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [apiError,setApiError]= useState<string | null>(null);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!accessionNumber.trim())
      e.accessionNumber = 'Accession number is required';
    if (cost && isNaN(parseFloat(cost)))
      e.cost = 'Enter a valid cost amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSave = async () => {
    if (!validate()) return;

    const payload: CreateCopyInput = {
      catalogueId: catalogueId!,
      accessionNumber: accessionNumber.trim(),
      condition,
      acquisitionDate: acquisitionDate.trim() || undefined,
      cost: cost ? parseFloat(cost) : undefined,
    };

    setSaving(true);
    setApiError(null);

    try {
      await api.createCopy(payload);
      showToast('Copy added successfully', 'success');
      setTimeout(() => router.back(), 800);
    } catch (err: any) {
      if (err.message?.includes('Network') || err.status === 0) {
        await syncService.queueOperation('CREATE', 'copy', 'new', payload);
        showToast('Saved offline — will sync when connected', 'info');
        setTimeout(() => router.back(), 1000);
      } else {
        setApiError(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScreenHeader title="Add Copy" subtitle="Physical book copy" showBack />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[16] }}>
        {apiError && (
          <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />
        )}

        <Card>
          <SectionTitle>Copy Details</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Accession Number"
              required
              value={accessionNumber}
              onChangeText={setAccessionNumber}
              error={errors.accessionNumber}
              placeholder="e.g. ACC-00145"
              autoCapitalize="characters"
              hint="Must be unique across all copies in the school"
              returnKeyType="next"
            />
          </View>
        </Card>

        <Card>
          <SectionTitle>Condition</SectionTitle>
          <View style={{ flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setCondition(c)}
                style={{
                  paddingHorizontal: Spacing[4], paddingVertical: Spacing[2],
                  borderRadius: Radius.button, borderWidth: 1,
                  borderColor: condition === c ? colors.primary : colors.border,
                  backgroundColor: condition === c ? colors.primary + '15' : colors.card,
                }}
              >
                <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: condition === c ? colors.primary : colors.mutedForeground }}>
                  {CONDITION_LABELS[c]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card>
          <SectionTitle>Acquisition</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Acquisition Date"
              value={acquisitionDate}
              onChangeText={setAcquisitionDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              hint="When was this copy purchased?"
              returnKeyType="next"
            />
            <Input
              label="Cost (KES)"
              value={cost}
              onChangeText={setCost}
              error={errors.cost}
              placeholder="e.g. 450"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>
        </Card>

        <Button
          label={saving ? 'Saving…' : 'Add Copy'}
          onPress={handleSave}
          loading={saving}
          fullWidth
        />
      </ScrollView>

      <Toast {...toastProps} />
    </KeyboardAvoidingView>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing[3] }}>
      {children}
    </Text>
  );
}
