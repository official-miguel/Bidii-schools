/**
 * Add / Edit Catalogue Entry (BookTitle)
 *
 * - editId param → pre-fills form for update
 * - Validates required fields before submit
 * - Queues offline if no connectivity
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader, Input, Button, Card, ErrorBanner, Toast, useToast } from '@/components/ui';
import { api, CreateCatalogueInput } from '@/services/api';
import { Spacing, Typography, Radius } from '@/constants';
import { syncService } from '@/services/sync';
import { getErrorMessage } from '@/lib/utils';
import { useTheme } from '@/lib/ThemeContext';

const CATEGORIES = ['TEXTBOOK', 'REFERENCE', 'NOVEL', 'PERIODICAL', 'DICTIONARY', 'ATLAS', 'OTHER'];
const FORMS      = [1, 2, 3, 4, 5, 6];

export default function NewCatalogueScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const router     = useRouter();
  const { colors } = useTheme();
  const { toastProps, show: showToast } = useToast();
  const isEdit     = !!editId;

  // ── Form state ────────────────────────────────────────────────────────────
  const [title,      setTitle]      = useState('');
  const [bookNumber, setBookNumber] = useState('');
  const [author,     setAuthor]     = useState('');
  const [edition,    setEdition]    = useState('');
  const [publisher,  setPublisher]  = useState('');
  const [isbn,       setIsbn]       = useState('');
  const [subject,    setSubject]    = useState('');
  const [form,       setForm]       = useState<number | null>(null);
  const [category,   setCategory]   = useState('TEXTBOOK');
  const [shelf,      setShelf]      = useState('');
  const [shelfRow,   setShelfRow]   = useState('');
  const [language,   setLanguage]   = useState('English');

  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [apiError,setApiError]= useState<string | null>(null);

  // ── Load existing record for edit ─────────────────────────────────────────
  useEffect(() => {
    if (!editId) return;
    api.getCatalogueWithCopies(editId)
      .then(data => {
        setTitle(data.title || '');
        setBookNumber(data.bookNumber || '');
        setAuthor(data.author || '');
        setEdition(data.edition || '');
        setPublisher(data.publisher || '');
        setIsbn(data.isbn || '');
        setSubject(data.subject || '');
        setForm(data.form ?? null);
        setCategory(data.category || 'TEXTBOOK');
        setShelf(data.shelf || '');
        setShelfRow(data.shelfRow || '');
        setLanguage(data.language || 'English');
      })
      .catch(() => setApiError('Failed to load book details'))
      .finally(() => setLoading(false));
  }, [editId]);

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim())    e.title    = 'Title is required';
    if (isbn && !/^[\d-X]{10,17}$/.test(isbn.replace(/[- ]/g, '')))
                          e.isbn     = 'Enter a valid ISBN-10 or ISBN-13';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;

    const payload: CreateCatalogueInput = {
      title:      title.trim(),
      bookNumber: bookNumber.trim() || undefined,
      author:     author.trim()    || undefined,
      edition:    edition.trim()   || undefined,
      publisher:  publisher.trim() || undefined,
      isbn:       isbn.trim()      || undefined,
      subject:    subject.trim()   || undefined,
      form:       form ?? undefined,
      category,
      shelf:      shelf.trim()     || undefined,
      language,
    };

    setSaving(true);
    setApiError(null);

    try {
      if (isEdit) {
        await api.updateCatalogue(editId!, payload);
        showToast('Book updated successfully', 'success');
      } else {
        await api.createCatalogue(payload);
        showToast('Book added to catalogue', 'success');
      }
      setTimeout(() => router.back(), 800);
    } catch (err: any) {
      // Offline: queue the operation
      if (err.message?.includes('Network') || err.status === 0) {
        await syncService.queueOperation(
          isEdit ? 'UPDATE' : 'CREATE',
          'catalogue',
          editId || 'new',
          payload
        );
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
      <ScreenHeader
        title={isEdit ? 'Edit Book' : 'Add New Book'}
        subtitle="BookTitle record"
        showBack
      />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: Spacing[16] }}>
        {apiError && (
          <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />
        )}

        {/* ── Required ──────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Required</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Title"
              required
              value={title}
              onChangeText={setTitle}
              error={errors.title}
              placeholder="e.g. Mathematics for Secondary Schools"
              returnKeyType="next"
            />
            <Input
              label="Book Number"
              value={bookNumber}
              onChangeText={setBookNumber}
              placeholder="e.g. MAT-001 (school-assigned ID)"
              hint="Used for quick lookup at circulation"
              returnKeyType="next"
            />
          </View>
        </Card>

        {/* ── Publication ───────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Publication</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Author"
              value={author}
              onChangeText={setAuthor}
              placeholder="e.g. K.M. Mutua"
              returnKeyType="next"
            />
            <Input
              label="Edition"
              value={edition}
              onChangeText={setEdition}
              placeholder="e.g. 3rd Edition"
              returnKeyType="next"
            />
            <Input
              label="Publisher"
              value={publisher}
              onChangeText={setPublisher}
              placeholder="e.g. Kenya Literature Bureau"
              returnKeyType="next"
            />
            <Input
              label="ISBN"
              value={isbn}
              onChangeText={setIsbn}
              error={errors.isbn}
              placeholder="e.g. 978-9966-00-000-0"
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
            />
            <Input
              label="Language"
              value={language}
              onChangeText={setLanguage}
              placeholder="e.g. English, Swahili"
              returnKeyType="next"
            />
          </View>
        </Card>

        {/* ── Classification ────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Classification</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Subject"
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Mathematics"
              returnKeyType="next"
            />

            {/* Form selector */}
            <View>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: colors.foreground, marginBottom: Spacing[2] }}>
                Form / Level
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] }}>
                <TouchPill label="Any" active={form === null} onPress={() => setForm(null)} colors={colors} />
                {FORMS.map(f => (
                  <TouchPill key={f} label={`Form ${f}`} active={form === f} onPress={() => setForm(f)} colors={colors} />
                ))}
              </View>
            </View>

            {/* Category selector */}
            <View>
              <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: colors.foreground, marginBottom: Spacing[2] }}>
                Category
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] }}>
                {CATEGORIES.map(c => (
                  <TouchPill key={c} label={c.charAt(0) + c.slice(1).toLowerCase()} active={category === c} onPress={() => setCategory(c)} colors={colors} />
                ))}
              </View>
            </View>
          </View>
        </Card>

        {/* ── Location ──────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Shelf Location</SectionTitle>
          <View style={{ gap: Spacing[4] }}>
            <Input
              label="Shelf"
              value={shelf}
              onChangeText={setShelf}
              placeholder="e.g. A, Science, Mathematics"
              returnKeyType="next"
            />
            <Input
              label="Shelf Row"
              value={shelfRow}
              onChangeText={setShelfRow}
              placeholder="e.g. Row 2"
              returnKeyType="done"
            />
          </View>
        </Card>

        {/* ── Save button ───────────────────────────────────────────── */}
        <Button
          label={saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Catalogue'}
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

import type { ColorTokens } from '@/constants';

function TouchPill({ label, active, onPress, colors }: { label: string; active: boolean; onPress: () => void; colors: ColorTokens }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5],
        borderRadius: Radius.full, borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primary + '15' : colors.card,
      }}
    >
      <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: active ? colors.primary : colors.mutedForeground }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

