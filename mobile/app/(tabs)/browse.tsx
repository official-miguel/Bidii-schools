/**
 * Browse Catalogue — Student view
 * Search and reserve books. Shows availability counts per title.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { BookOpen, Plus } from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, EmptyState, ErrorBanner,
  Toast, useToast, ConfirmModal, Badge, Card, SyncStatusBar,
} from '@/components/ui';
import { api, CatalogueRecord } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { useDebounce } from '@/hooks';
import { useAuth } from '@/lib/auth';
import { truncate, pluralize } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

export default function BrowseScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { toastProps, show: showToast } = useToast();

  const [query,      setQuery]      = useState('');
  const [catalogues, setCatalogues] = useState<CatalogueRecord[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const [reserveTarget, setReserveTarget] = useState<CatalogueRecord | null>(null);
  const [reserving,     setReserving]     = useState(false);

  const debouncedQuery = useDebounce(query, 250);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setCatalogues([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const result = await api.getCatalogues({ q });
      setCatalogues(result.catalogues);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { search(debouncedQuery); }, [debouncedQuery, search]);
  const handleRefresh = () => { setRefreshing(true); search(debouncedQuery); };

  const handleReserve = async () => {
    if (!reserveTarget || !user) return;
    setReserving(true);
    try {
      await api.createReservation({ catalogueId: reserveTarget.id, studentId: user.id });
      showToast(`Reserved "${reserveTarget.title}"`, 'success');
      setReserveTarget(null);
    } catch (e: any) {
      showToast(e.message || 'Reservation failed', 'error');
    } finally { setReserving(false); }
  };

  return (
    <View style={{ flex:1, backgroundColor: colors.background }}>
      <ScreenHeader title="Browse Books" subtitle="Find and reserve titles" />
      <SyncStatusBar />

      <View style={{ backgroundColor: colors.card, borderBottomWidth:1, borderBottomColor: colors.border, padding: Spacing[4] }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by title, author, subject…" loading={loading} autoFocus={false} />
      </View>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} style={{ margin: Spacing[4] }} />}

      <FlatList
        data={catalogues}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: Spacing[4], gap: Spacing[2], paddingBottom: insets.bottom + Spacing[8] }}
        renderItem={({ item }) => (
          <View style={{
            backgroundColor: colors.card, borderRadius: Radius.card,
            borderWidth:1, borderColor: colors.border, padding: Spacing[4],
            flexDirection:'row', gap: Spacing[3], alignItems:'flex-start',
          }}>
            <View style={{ width:44, height:44, borderRadius: Radius.sm, backgroundColor: colors.primary + '15', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <BookOpen size={22} color={colors.primary} />
            </View>
            <View style={{ flex:1, gap: Spacing[1] }}>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }} numberOfLines={2}>
                {item.title}
              </Text>
              {item.author && <Text style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}>by {item.author}</Text>}
              <View style={{ flexDirection:'row', gap: Spacing[1.5], flexWrap:'wrap', marginTop: Spacing[1] }}>
                {item.form && <Badge label={`Form ${item.form}`} variant="info" size="sm" />}
                <View style={{ paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full, backgroundColor: colors.primary + '15' }}>
                  <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.primary }}>
                    {pluralize(item.totalCopies, 'copy', 'copies')}
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setReserveTarget(item)}
              style={{ width:36, height:36, borderRadius: Radius.button, backgroundColor: colors.primary, alignItems:'center', justifyContent:'center', flexShrink:0 }}
            >
              <Plus size={18} color={'#FFFFFF'} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title={debouncedQuery ? 'No books found' : 'Search for a book'}
              description={debouncedQuery ? `No results for "${debouncedQuery}"` : 'Type a title, author, or subject to search'}
              icon={<BookOpen size={40} color={colors.mutedForeground} />}
            />
          ) : null
        }
      />

      <ConfirmModal
        visible={!!reserveTarget}
        title="Reserve Book"
        message={`Reserve "${reserveTarget?.title}"?\nYou'll be added to the waiting queue and notified when a copy is available.`}
        confirmLabel="Reserve"
        onConfirm={handleReserve}
        onCancel={() => setReserveTarget(null)}
        loading={reserving}
      />

      <Toast {...toastProps} />
    </View>
  );
}
