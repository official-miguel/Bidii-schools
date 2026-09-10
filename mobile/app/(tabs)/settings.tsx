/**
 * Settings Screen — fine rates, max books, weekend toggle, block threshold.
 * Shared between Principal and Librarian; changes sync live via API.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Switch, ActivityIndicator,
} from 'react-native';
import {
  ScreenHeader, Card, Input, Button, ErrorBanner, Toast, useToast,
} from '@/components/ui';
import { api, LibrarySettingsRecord, LibraryPolicyRecord } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { getErrorMessage } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { toastProps, show: showToast } = useToast();
  const { colors } = useTheme();

  const [settings, setSettings] = useState<LibrarySettingsRecord | null>(null);
  const [policy,   setPolicy]   = useState<LibraryPolicyRecord | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Editable fields (kept as strings for text inputs)
  const [finePerDay,         setFinePerDay]         = useState('');
  const [maxBooks,           setMaxBooks]           = useState('');
  const [maxBorrowDays,      setMaxBorrowDays]      = useState('');
  const [maxRenewals,        setMaxRenewals]        = useState('');
  const [gracePeriodDays,    setGracePeriodDays]    = useState('');
  const [fineBlockThreshold, setFineBlockThreshold] = useState('');
  const [countWeekends,      setCountWeekends]      = useState(true);
  const [overdueAlertDays,   setOverdueAlertDays]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, policies] = await Promise.all([api.getSettings(), api.getPolicies()]);
      setSettings(s);
      setFinePerDay(String(s.finePerDay));
      setMaxBooks(String(s.maxBooksPerStudent));
      setMaxBorrowDays(String(s.maxBorrowDays));
      setMaxRenewals(String(s.maxRenewals));
      setOverdueAlertDays(String(s.overdueAlertDays));

      const defaultPolicy = policies.find(p => p.patronType === 'DEFAULT');
      if (defaultPolicy) {
        setPolicy(defaultPolicy);
        setGracePeriodDays(String(defaultPolicy.gracePeriodDays));
        setFineBlockThreshold(String(defaultPolicy.fineBlockThreshold));
        setCountWeekends(defaultPolicy.countWeekends);
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      await api.updateSettings({
        finePerDay:        parseFloat(finePerDay)    || settings!.finePerDay,
        maxBooksPerStudent:parseInt(maxBooks)        || settings!.maxBooksPerStudent,
        maxBorrowDays:     parseInt(maxBorrowDays)   || settings!.maxBorrowDays,
        maxRenewals:       parseInt(maxRenewals)     || settings!.maxRenewals,
        overdueAlertDays:  parseInt(overdueAlertDays)|| settings!.overdueAlertDays,
      });

      if (policy) {
        await api.updatePolicy(policy.id, {
          gracePeriodDays:   parseInt(gracePeriodDays)    || 0,
          fineBlockThreshold:parseFloat(fineBlockThreshold) || 0,
          countWeekends,
        });
      }

      showToast('Settings saved and synced', 'success');
      load();
    } catch (e: any) {
      setError(getErrorMessage(e));
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <View style={{ flex:1, backgroundColor: colors.background }}>
        <ScreenHeader title="Settings" />
        <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor: colors.background }}>
      <ScreenHeader title="Library Settings" subtitle="Synced with all dashboards" />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: insets.bottom + Spacing[8] }}>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ── Circulation limits ──────────────────────────────────── */}
        <Card>
          <SectionTitle colors={colors}>Circulation Limits</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input label="Max books per student" value={maxBooks} onChangeText={setMaxBooks}
              keyboardType="number-pad" hint="Maximum number of books a student can borrow at once" />
            <Input label="Max borrow days" value={maxBorrowDays} onChangeText={setMaxBorrowDays}
              keyboardType="number-pad" hint="Default loan period in days" />
            <Input label="Max renewals per loan" value={maxRenewals} onChangeText={setMaxRenewals}
              keyboardType="number-pad" />
          </View>
        </Card>

        {/* ── Fine configuration ──────────────────────────────────── */}
        <Card>
          <SectionTitle colors={colors}>Fine Configuration</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input label="Fine per overdue day (KES)" value={finePerDay} onChangeText={setFinePerDay}
              keyboardType="decimal-pad" hint="Amount charged per day after due date" />
            <Input label="Grace period (days)" value={gracePeriodDays} onChangeText={setGracePeriodDays}
              keyboardType="number-pad" hint="Days after due date before fines start accruing" />
            <Input label="Fine block threshold (KES)" value={fineBlockThreshold} onChangeText={setFineBlockThreshold}
              keyboardType="decimal-pad" hint="Outstanding balance above which borrowing is blocked (0 = any fine blocks)" />
            <Input label="Overdue alert after (days)" value={overdueAlertDays} onChangeText={setOverdueAlertDays}
              keyboardType="number-pad" hint="Days overdue before a student appears on the overdue list" />
          </View>
        </Card>

        {/* ── Weekend counting ────────────────────────────────────── */}
        <Card>
          <SectionTitle colors={colors}>Overdue Calculation</SectionTitle>
          <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: colors.foreground }}>
                Count weekends toward overdue days
              </Text>
              <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground, marginTop: 2 }}>
                When off, only Mon–Fri count toward overdue fines
              </Text>
            </View>
            <Switch
              value={countWeekends}
              onValueChange={setCountWeekends}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={countWeekends ? colors.primary : colors.mutedForeground}
            />
          </View>
        </Card>

        {/* Save button */}
        <Button label={saving ? 'Saving…' : 'Save Settings'} onPress={handleSave} loading={saving} fullWidth />
      </ScrollView>

      <Toast {...toastProps} />
    </View>
  );
}

function SectionTitle({ children, colors }: { children: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.mutedForeground, textTransform:'uppercase', letterSpacing:0.8, marginBottom: Spacing[3] }}>
      {children}
    </Text>
  );
}
