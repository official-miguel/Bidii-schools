/**
 * Bulk Import Screen
 *
 * Accepts a CSV file picked from device storage.
 * Required CSV columns (case-insensitive, in any order):
 *   title*  — required
 *   copies* — required (integer, how many physical copies)
 * Optional:
 *   author | edition | level | subject
 *
 * Workflow:
 *   1. Pick file → parse CSV client-side
 *   2. Preview phase — shows total rows, total copies, per-row errors
 *      (mirrored from server ?preview=true, or computed locally)
 *   3. Confirm import → POST /api/library/catalogue/import
 *   4. Result — imported books, copies added, skipped rows
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Upload, FileText, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react-native';
import {
  ScreenHeader, Card, Button, ErrorBanner, Badge, Toast, useToast,
} from '@/components/ui';
import { api } from '@/services/api';
import { Colors, Spacing, Typography, Radius } from '@/constants';
import { truncate, getErrorMessage } from '@/lib/utils';

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/"/g, ''));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    if (values.every((v) => !v)) continue; // skip blank lines
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Row type and validation
// ---------------------------------------------------------------------------

interface ParsedRow {
  title:   string;
  author:  string;
  edition: string;
  level:   string;
  subject: string;
  copies:  number;
}

interface PreviewRow {
  index:  number;
  row:    ParsedRow | null;
  error?: string;
  raw:    Record<string, string>;
}

function validateRow(raw: Record<string, string>, index: number): PreviewRow {
  const title  = (raw['title'] || raw['book_title'] || raw['name'] || '').trim();
  const copies = raw['copies'] || raw['num_copies'] || raw['count'] || '';

  if (!title) {
    return { index, row: null, raw, error: 'Missing required field: title' };
  }

  const copiesNum = parseInt(copies, 10);
  if (!copies || isNaN(copiesNum) || copiesNum < 1) {
    return {
      index, row: null, raw,
      error: copies
        ? `"copies" must be a positive integer (got "${copies}")`
        : 'Missing required field: copies',
    };
  }
  if (copiesNum > 500) {
    return { index, row: null, raw, error: 'copies cannot exceed 500 per row' };
  }

  return {
    index,
    raw,
    row: {
      title,
      author:  (raw['author']  || '').trim(),
      edition: (raw['edition'] || '').trim(),
      level:   (raw['level']   || '').trim(),
      subject: (raw['subject'] || '').trim(),
      copies:  copiesNum,
    },
  };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BulkImportScreen() {
  const router = useRouter();
  const { toastProps, show: showToast } = useToast();

  const [fileName,  setFileName]  = useState('');
  const [preview,   setPreview]   = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing,   setParsing]   = useState(false);
  const [result,    setResult]    = useState<{
    imported: number; copiesAdded: number; skipped: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const [apiError,  setApiError]  = useState<string | null>(null);

  const validRows   = preview.filter((r) => r.row && !r.error);
  const invalidRows = preview.filter((r) => !r.row || r.error);
  const totalCopies = validRows.reduce((s, r) => s + (r.row?.copies ?? 0), 0);

  // ── Pick + parse ────────────────────────────────────────────────────────

  const handlePickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets?.[0]) return;

      const asset = res.assets[0];
      setFileName(asset.name);
      setParsing(true);
      setPreview([]);
      setResult(null);
      setApiError(null);

      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const rows = parseCSV(content);

      if (rows.length === 0) {
        Alert.alert(
          'Empty File',
          'No data rows found. Make sure the file has a header row and data rows.'
        );
        setParsing(false);
        return;
      }

      setPreview(rows.map((raw, i) => validateRow(raw, i + 1)));
    } catch (err: any) {
      Alert.alert('Error', 'Could not read the file. Please use a CSV file.');
    } finally {
      setParsing(false);
    }
  };

  // ── Submit import ────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setApiError(null);

    try {
      const payload = validRows.map((r) => r.row!);
      const importResult = await api.bulkImportCatalogues(payload);
      setResult(importResult);
      showToast(
        `Imported ${importResult.copiesAdded ?? importResult.imported ?? 0} copies`,
        'success'
      );
    } catch (err: any) {
      setApiError(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader title="Bulk Import" subtitle="CSV catalogue import" showBack />

      <ScrollView
        contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[16] }}
      >
        {/* ── Column guide ──────────────────────────────────────── */}
        <Card>
          <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, marginBottom: Spacing[2] }}>
            Required CSV Columns
          </Text>
          <View style={{ gap: Spacing[1.5] }}>
            <ColRow name="title"   required desc="Book title" />
            <ColRow name="copies"  required desc="Number of physical copies to create" />
            <ColRow name="author"  desc="Author name (optional)" />
            <ColRow name="edition" desc="Edition, e.g. 3rd Edition (optional)" />
            <ColRow name="level"   desc="Level label, e.g. Form 3 (optional)" />
            <ColRow name="subject" desc="Subject area (optional)" />
          </View>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, marginTop: Spacing[3] }}>
            First row must be the header row. Blank optional fields are stored as empty.
          </Text>
        </Card>

        {/* ── File picker ────────────────────────────────────────── */}
        <TouchableOpacity
          onPress={handlePickFile}
          disabled={parsing || importing}
          style={{
            borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.teal,
            borderRadius: Radius.card, backgroundColor: Colors.teal50,
            paddingVertical: Spacing[10], paddingHorizontal: Spacing[6],
            alignItems: 'center', gap: Spacing[3],
          }}
        >
          {parsing ? (
            <ActivityIndicator size="large" color={Colors.teal} />
          ) : (
            <>
              <Upload size={32} color={Colors.teal} />
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.teal }}>
                {fileName ? 'Change File' : 'Pick CSV File'}
              </Text>
              {fileName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[1] }}>
                  <FileText size={12} color={Colors.slateText} />
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>
                    {truncate(fileName, 40)}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>
                  Tap to browse your files
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>

        {apiError && (
          <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />
        )}

        {/* ── Result ─────────────────────────────────────────────── */}
        {result && (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2], marginBottom: Spacing[3] }}>
              <CheckCircle2 size={20} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }}>
                Import Complete
              </Text>
            </View>

            <View style={{ gap: Spacing[2] }}>
              <StatLine label="Books created or matched" value={result.imported} />
              <StatLine label="Physical copies added" value={result.copiesAdded} color={Colors.teal} />
              {result.skipped > 0 && (
                <StatLine label="Rows skipped (errors)" value={result.skipped} color={Colors.danger} />
              )}
            </View>

            {result.errors.length > 0 && (
              <View style={{ marginTop: Spacing[3] }}>
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.danger, marginBottom: Spacing[2] }}>
                  {result.errors.length} row error{result.errors.length !== 1 ? 's' : ''}:
                </Text>
                {result.errors.slice(0, 5).map((e, i) => (
                  <Text key={i} style={{ fontSize: Typography.fontSize.xs, color: Colors.danger }}>
                    • Row {e.row}: {e.error}
                  </Text>
                ))}
                {result.errors.length > 5 && (
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>
                    + {result.errors.length - 5} more
                  </Text>
                )}
              </View>
            )}

            <Button
              label="Done"
              onPress={() => router.back()}
              style={{ marginTop: Spacing[4] }}
              fullWidth
            />
          </Card>
        )}

        {/* ── Preview ─────────────────────────────────────────────── */}
        {preview.length > 0 && !result && (
          <View style={{ gap: Spacing[3] }}>
            {/* Summary row */}
            <View style={{ flexDirection: 'row', gap: Spacing[2], alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge label={`${validRows.length} valid rows`}   variant="success" />
              <Badge label={`${totalCopies} copies`}           variant="info" />
              {invalidRows.length > 0 && (
                <Badge label={`${invalidRows.length} errors`}  variant="danger" />
              )}
            </View>

            {/* Preview list */}
            <Card padding="none">
              {preview.slice(0, 20).map((row, idx) => (
                <PreviewRowItem
                  key={idx}
                  row={row}
                  isLast={idx === Math.min(preview.length, 20) - 1}
                />
              ))}
              {preview.length > 20 && (
                <View style={{ padding: Spacing[3], alignItems: 'center' }}>
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted }}>
                    + {preview.length - 20} more rows
                  </Text>
                </View>
              )}
            </Card>

            {validRows.length > 0 && (
              <Button
                label={importing
                  ? `Importing…`
                  : `Import ${validRows.length} row${validRows.length !== 1 ? 's' : ''} → ${totalCopies} copies`}
                onPress={handleImport}
                loading={importing}
                fullWidth
              />
            )}
            {invalidRows.length > 0 && (
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, textAlign: 'center' }}>
                {invalidRows.length} invalid row{invalidRows.length !== 1 ? 's' : ''} will be skipped
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <Toast {...toastProps} />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColRow({ name, required, desc }: { name: string; required?: boolean; desc: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] }}>
      <Text style={{
        fontSize: Typography.fontSize.xs, fontFamily: 'monospace',
        color: required ? Colors.teal : Colors.ink,
        fontWeight: required ? Typography.fontWeight.bold : Typography.fontWeight.normal,
        minWidth: 64,
      }}>
        {name}{required ? '*' : ''}
      </Text>
      <Text style={{ flex: 1, fontSize: Typography.fontSize.xs, color: Colors.slateText }}>
        {desc}
      </Text>
    </View>
  );
}

function PreviewRowItem({ row, isLast }: { row: PreviewRow; isLast: boolean }) {
  const hasError = !row.row || !!row.error;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3],
      padding: Spacing[3],
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: Colors.line,
      backgroundColor: hasError ? Colors.dangerBg : 'transparent',
    }}>
      {hasError
        ? <AlertCircle  size={16} color={Colors.danger} style={{ marginTop: 2 }} />
        : <CheckCircle2 size={16} color={Colors.success} style={{ marginTop: 2 }} />
      }
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: Typography.fontSize.sm,
          fontWeight: Typography.fontWeight.medium,
          color: hasError ? Colors.danger : Colors.ink,
        }} numberOfLines={1}>
          Row {row.index}: {row.row?.title || row.raw['title'] || '(empty)'}
        </Text>

        {row.row && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText }}>
            {[
              row.row.author  && `by ${row.row.author}`,
              row.row.edition && row.row.edition,
              row.row.level   && row.row.level,
              `${row.row.copies} cop${row.row.copies !== 1 ? 'ies' : 'y'}`,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}

        {row.error && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.danger, marginTop: 2 }}>
            {row.error}
          </Text>
        )}
      </View>
    </View>
  );
}

function StatLine({ label, value, color = Colors.ink }: { label: string; value: number; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.slateText }}>{label}</Text>
      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.bold, color }}>{value}</Text>
    </View>
  );
}
