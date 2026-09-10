/**
 * Catalogue Screen — lists all BookTitle (LibraryCatalogue) records.
 * Supports search, form filter, and tap-to-expand copies.
 * Principal and Librarian both land here; role gates add/edit actions.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Upload, Search, Filter, BookOpen } from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, Card, Badge, EmptyState,
  ErrorBanner, StatCard, Toast, useToast,
} from '@/components/ui';
import { api, type CatalogueRecord } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { useDebounce } from '@/hooks';
import { isLibrarian, isPrincipal, useAuth } from '@/lib/auth';
import { truncate, pluralize } from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

const FORM_OPTIONS = [0, 1, 2, 3, 4, 5, 6];

export default function CatalogueScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { colors } = useTheme();
  const { toastProps, show: showToast } = useToast();
  const canManage = isLibrarian() || isPrincipal();

  const [query,       setQuery]       = useState('');
  const [formFilter,  setFormFilter]  = useState<number | null>(null);
  const [catalogues,  setCatalogues]  = useState<CatalogueRecord[]>([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedQuery = useDebounce(query, 250);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchCatalogues = useCallback(async (reset = true) => {
    if (reset) {
      setLoading(true);
      setPage(1);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentPage = reset ? 1 : page;
      const result = await api.getCatalogues({
        q: debouncedQuery || undefined,
        form: formFilter ?? undefined,
        page: currentPage,
      });

      if (reset) {
        setCatalogues(result.catalogues);
      } else {
        setCatalogues(prev => [...prev, ...result.catalogues]);
      }
      setTotal(result.total);
      if (!reset) setPage(p => p + 1);
    } catch (err: any) {
      setError(err.message || 'Failed to load catalogue');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [debouncedQuery, formFilter, page]);

  useEffect(() => { fetchCatalogues(true); }, [debouncedQuery, formFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCatalogues(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && catalogues.length < total) {
      fetchCatalogues(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: CatalogueRecord }) => (
    <CatalogueRow
      item={item}
      onPress={() => router.push({ pathname: '/catalogue/[id]', params: { id: item.id } })}
    />
  );

  const renderFooter = () => loadingMore ? (
    <View style={{ paddingVertical: Spacing[6], alignItems: 'center' }}>
      <ActivityIndicator size="small" color={colors.primary} />
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="Catalogue"
        subtitle={total > 0 ? `${total.toLocaleString()} titles` : 'Book titles & copies'}
        right={
          canManage ? (
            <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
              <TouchableOpacity
                onPress={() => router.push('/catalogue/import')}
                style={{
                  width: 36, height: 36, borderRadius: Radius.button,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Upload size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/catalogue/new')}
                style={{
                  width: 36, height: 36, borderRadius: Radius.button,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Plus size={18} color={'#FFFFFF'} />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      {/* Search + filter row */}
      <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, padding: Spacing[4], gap: Spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: Spacing[2] }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title, author, subject…"
            style={{ flex: 1 }}
          />
          <TouchableOpacity
            onPress={() => setShowFilters(v => !v)}
            style={{
              width: 44, height: 44, borderRadius: Radius.button,
              backgroundColor: showFilters ? colors.primary + '15' : colors.card,
              borderWidth: 1,
              borderColor: showFilters ? colors.primary : colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Filter size={18} color={showFilters ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Form filter pills */}
        {showFilters && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] }}>
            <TouchableOpacity
              onPress={() => setFormFilter(null)}
              style={{
                paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
                borderRadius: Radius.full, borderWidth: 1,
                borderColor: formFilter === null ? colors.primary : colors.border,
                backgroundColor: formFilter === null ? colors.primary + '15' : colors.card,
              }}
            >
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: formFilter === null ? colors.primary : colors.mutedForeground }}>
                All
              </Text>
            </TouchableOpacity>
            {FORM_OPTIONS.filter(f => f > 0).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFormFilter(formFilter === f ? null : f)}
                style={{
                  paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
                  borderRadius: Radius.full, borderWidth: 1,
                  borderColor: formFilter === f ? colors.primary : colors.border,
                  backgroundColor: formFilter === f ? colors.primary + '15' : colors.card,
                }}
              >
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: formFilter === f ? colors.primary : colors.mutedForeground }}>
                  Form {f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Error */}
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} style={{ margin: Spacing[4] }} />
      )}

      {/* List */}
      {loading && !refreshing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={catalogues}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{
            padding: Spacing[4],
            gap: Spacing[2],
            paddingBottom: insets.bottom + Spacing[8],
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <EmptyState
              title={debouncedQuery ? 'No results found' : 'No books yet'}
              description={
                debouncedQuery
                  ? `No titles match "${debouncedQuery}"`
                  : canManage
                  ? 'Tap + to add your first book title or import from Excel/CSV'
                  : 'The catalogue is empty'
              }
              icon={<BookOpen size={40} color={colors.mutedForeground} />}
              actionLabel={canManage ? 'Add First Title' : undefined}
              onAction={canManage ? () => router.push('/catalogue/new') : undefined}
            />
          }
        />
      )}

      <Toast {...toastProps} />
    </View>
  );
}

// ── Catalogue Row ────────────────────────────────────────────────────────────

function CatalogueRow({
  item,
  onPress,
}: {
  item: CatalogueRecord;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Radius.card,
        padding: Spacing[4],
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing[3],
      }}
    >
      {/* Book icon */}
      <View
        style={{
          width: 44, height: 44, borderRadius: Radius.sm,
          backgroundColor: colors.primary + '15',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <BookOpen size={22} color={colors.primary} />
      </View>

      {/* Details */}
      <View style={{ flex: 1, gap: Spacing[1] }}>
        <Text
          style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: colors.foreground }}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        <Text
          style={{ fontSize: Typography.fontSize.xs, color: colors.mutedForeground }}
          numberOfLines={1}
        >
          {[item.author && `by ${item.author}`, item.edition, item.subject]
            .filter(Boolean).join(' • ')}
        </Text>

        <View style={{ flexDirection: 'row', gap: Spacing[1.5], marginTop: Spacing[1], flexWrap: 'wrap' }}>
          {item.form && (
            <Badge label={`Form ${item.form}`} variant="info" size="sm" />
          )}
          {item.bookNumber && (
            <Badge label={item.bookNumber} variant="default" size="sm" />
          )}
          <View style={{
            paddingHorizontal: Spacing[2], paddingVertical: 1,
            borderRadius: Radius.full,
            backgroundColor: colors.primary + '15',
          }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: colors.primary }}>
              {pluralize(item.totalCopies, 'copy', 'copies')}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}
