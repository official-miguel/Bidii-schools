/**
 * Fines Statistics Screen
 *
 * Navigated to from the DollarSign header button in fines/index.tsx.
 * Shows summary KPI cards for the school's fine activity.
 * Full data implementation will wire to the analytics endpoint.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ScreenHeader, Card, ErrorBanner } from '@/components/ui';
import { api } from '@/services/api';
import { Colors, Spacing, Typography, Radius } from '@/constants';
import { formatCurrency } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DollarSign, TrendingUp, AlertTriangle, Clock } from 'lucide-react-native';

interface FineStats {
  totalFines: number;
  collected: number;
  outstanding: number;
  overdue: number;
}

export default function FinesStatsScreen() {
  const insets = useSafeAreaInsets();

  const [stats,     setStats]     = useState<FineStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Pull fine KPIs from the analytics endpoint
      const analytics = await api.getAnalytics();
      setStats({
        totalFines:  analytics.fineKpis.totalGenerated,
        collected:   analytics.fineKpis.totalPaid,
        outstanding: analytics.fineKpis.totalOutstanding,
        overdue:     analytics.overview.overdueCount,
      });
    } catch (e: any) {
      setError(e.message ?? 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Fines Statistics"
        subtitle="School-wide fine summary"
        showBack
      />

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          style={{ margin: Spacing[4] }}
        />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.teal} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + Spacing[8] },
          ]}
        >
          {/* ── KPI cards ─────────────────────────────────────────── */}
          <View style={styles.grid}>
            <StatCard
              label="Total Fines"
              value={formatCurrency(stats?.totalFines ?? 0)}
              icon={<DollarSign size={18} color={Colors.teal} />}
              accent={Colors.teal}
            />
            <StatCard
              label="Collected"
              value={formatCurrency(stats?.collected ?? 0)}
              icon={<TrendingUp size={18} color={Colors.success} />}
              accent={Colors.success}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(stats?.outstanding ?? 0)}
              icon={<AlertTriangle size={18} color={Colors.warn} />}
              accent={Colors.warn}
            />
            <StatCard
              label="Overdue Books"
              value={String(stats?.overdue ?? 0)}
              icon={<Clock size={18} color={Colors.danger} />}
              accent={Colors.danger}
            />
          </View>

          {/* ── Placeholder message ───────────────────────────────── */}
          <Card>
            <View style={styles.placeholder}>
              <DollarSign size={36} color={Colors.slateText} />
              <Text style={styles.placeholderTitle}>Statistics coming soon</Text>
              <Text style={styles.placeholderBody}>
                Detailed fine trends, per-student breakdowns, and payment
                history charts will appear here in a future update.
              </Text>
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

// ── Stat card sub-component ───────────────────────────────────────────────────

function StatCard({
  label, value, icon, accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <View style={[styles.statCard, { borderTopColor: accent, borderTopWidth: 3 }]}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing[4],
    gap: Spacing[4],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: Spacing[4],
    alignItems: 'center',
    // each card takes ~48% width on standard phones
    minWidth: '47%',
    flex: 1,
  },
  statIcon: {
    marginBottom: Spacing[2],
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.ink,
    marginBottom: Spacing[1],
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.slateText,
    textAlign: 'center',
  },
  placeholder: {
    alignItems: 'center',
    paddingVertical: Spacing[6],
    gap: Spacing[3],
  },
  placeholderTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.ink,
  },
  placeholderBody: {
    fontSize: Typography.fontSize.sm,
    color: Colors.slateText,
    textAlign: 'center',
    lineHeight: 20,
  },
});
