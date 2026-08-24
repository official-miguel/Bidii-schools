/**
 * Circulation Desk — student-first, device-adaptive book scan
 *
 * Phase 1: Find student (search/select — always the first step)
 * Phase 2: Find book
 *   • Camera opens automatically AFTER the student is selected.
 *     Camera is NOT activated on page load (avoids permission prompts
 *     and battery drain before it's actually needed).
 *   • Toggle button always visible to switch between camera and
 *     manual text entry mid-flow.
 * Phase 3: Policy evaluation → confirm action
 * Phase 4: Done
 *
 * For borrowed books (return/renew) the active borrow is looked up
 * server-side so no additional student identification is needed.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import {
  BookOpen, User, CheckCircle2,
  AlertCircle, AlertTriangle, X, QrCode, Keyboard,
} from 'lucide-react-native';
import {
  ScreenHeader, SearchBar, Card, Avatar, Button,
  ErrorBanner, Toast, useToast, ConfirmModal,
} from '@/components/ui';
import { StudentListItem } from '@/components/library';
import {
  api, StudentHit, CardDetail, PolicyEvalResult,
} from '@/services/api';
import { Colors, Spacing, Typography, Radius, SCAN_COOLDOWN_MS } from '@/constants';
import { useDebounce } from '@/hooks';
import { syncService } from '@/services/sync';
import {
  formatDate, formatCurrency, cardStatusLabel,
  isOverdue, getErrorMessage,
} from '@/lib/utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Phase  = 'student' | 'book' | 'eval' | 'done';
type Action = 'borrow' | 'return' | 'renew';
type BookInputMode = 'camera' | 'keyboard';

const RETURN_TYPES      = ['NORMAL','DAMAGED','LOST','REPLACEMENT_RECEIVED'] as const;
const RETURN_CONDITIONS = ['EXCELLENT','GOOD','FAIR','DAMAGED','LOST']       as const;

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CirculateScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ preloadStudentId?: string }>();
  const { toastProps } = useToast();

  // ── Phase ──────────────────────────────────────────────────────────────
  const [phase,  setPhase]  = useState<Phase>('student');
  const [action, setAction] = useState<Action | null>(null);

  // ── Student search ──────────────────────────────────────────────────────
  const [studentQuery,     setStudentQuery]     = useState('');
  const [studentResults,   setStudentResults]   = useState<StudentHit[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentErr,       setStudentErr]       = useState<string | null>(null);
  const [loadingCard,      setLoadingCard]       = useState(false);
  const [cardDetail,       setCardDetail]        = useState<CardDetail | null>(null);

  // ── Book lookup ──────────────────────────────────────────────────────────
  // bookInputMode starts as 'camera' but camera is NOT mounted until phase==='book'
  const [bookInputMode, setBookInputMode] = useState<BookInputMode>('camera');
  const [bookQuery,     setBookQuery]     = useState('');
  const [searchingBook, setSearchingBook] = useState(false);
  const [bookErr,       setBookErr]       = useState<string | null>(null);
  const [evalResult,    setEvalResult]    = useState<PolicyEvalResult | null>(null);

  // ── Camera (only requested after student is picked) ─────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<number>(0);

  // ── Action ──────────────────────────────────────────────────────────────
  const [returnType,      setReturnType]      = useState('NORMAL');
  const [returnCondition, setReturnCondition] = useState('GOOD');
  const [returnNotes,     setReturnNotes]     = useState('');
  const [overrideReason,  setOverrideReason]  = useState('');
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [acting,          setActing]          = useState(false);
  const [actionErr,       setActionErr]       = useState<string | null>(null);
  const [doneMsg,         setDoneMsg]         = useState('');

  const debStudentQuery = useDebounce(studentQuery, 250);
  const debBookQuery    = useDebounce(bookQuery, 300);

  // Pre-load student from deeplink (e.g. student card "Issue" button)
  useEffect(() => {
    if (params.preloadStudentId) loadCard(params.preloadStudentId);
  }, []); // eslint-disable-line

  // ── Student live search ─────────────────────────────────────────────────
  useEffect(() => {
    if (!debStudentQuery.trim() || phase !== 'student') { setStudentResults([]); return; }
    (async () => {
      setSearchingStudent(true); setStudentErr(null);
      try { setStudentResults(await api.searchStudents(debStudentQuery)); }
      catch (e: any) { setStudentErr(e.message); }
      finally { setSearchingStudent(false); }
    })();
  }, [debStudentQuery, phase]);

  // ── Book live search (keyboard mode only) ──────────────────────────────
  useEffect(() => {
    if (!debBookQuery.trim() || phase !== 'book' || bookInputMode !== 'keyboard') return;
    lookupBook(debBookQuery);
  }, [debBookQuery]); // eslint-disable-line

  // ── Load student card ──────────────────────────────────────────────────
  const loadCard = useCallback(async (sid: string) => {
    setLoadingCard(true); setStudentErr(null);
    try {
      const card = await api.getCard(sid);
      setCardDetail(card);
      setPhase('book');
      // Request camera permission now — only after student is picked
      if (!permission?.granted) requestPermission();
    } catch (e: any) { setStudentErr(e.message); }
    finally { setLoadingCard(false); }
  }, [permission, requestPermission]);

  // ── Book lookup ────────────────────────────────────────────────────────
  const lookupBook = useCallback(async (q: string) => {
    if (!q.trim() || !cardDetail) return;
    setSearchingBook(true); setBookErr(null); setEvalResult(null); setAction(null);

    const accession = q.startsWith('BIDII:BOOK:') ? q.slice(11)
                    : q.startsWith('BIDII:')       ? q.slice(6)
                    : q;
    try {
      const searchRes = await api.searchCopies(accession);
      const copy = searchRes.find((c: any) =>
        c.accessionNumber.toUpperCase() === accession.toUpperCase().trim()
      ) ?? (searchRes.length === 1 ? searchRes[0] : null);

      if (!copy) { setBookErr(`No copy found for "${accession}"`); return; }

      const ev = await api.evaluatePolicy(cardDetail.student.id, copy.id);
      setEvalResult({ ...ev, copy });
      setPhase('eval');
    } catch (e: any) {
      setBookErr(getErrorMessage(e));
    } finally {
      setSearchingBook(false);
    }
  }, [cardDetail]);

  // ── Camera barcode handler ─────────────────────────────────────────────
  const onBarcodeScanned = useCallback((r: BarcodeScanningResult) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = now;
    if (searchingBook) return;
    const raw = r.data;
    const accession = raw.startsWith('BIDII:BOOK:') ? raw.slice(11)
                    : raw.startsWith('BIDII:')       ? raw.slice(6)
                    : raw;
    setBookQuery(accession);
    setBookInputMode('keyboard'); // show what was scanned
    lookupBook(accession);
  }, [searchingBook, lookupBook]);

  // ── Execute action ─────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!cardDetail || !evalResult?.copy || !action) return;
    setActing(true); setActionErr(null);
    try {
      if (action === 'borrow') {
        const body: Record<string, unknown> = {
          studentId: cardDetail.student.id, copyId: evalResult.copy.id,
        };
        if (!evalResult.allowed && overrideReason) body.overrideReason = overrideReason;
        const res = await api.borrow(body);
        setDoneMsg(`"${evalResult.copy.catalogue?.title || evalResult.copy.accessionNumber}" issued — due ${formatDate(res.borrow?.dueAt)}.`);
      } else if (action === 'return') {
        const activeBorrow = cardDetail.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber
        );
        if (!activeBorrow) throw new Error('No active borrow found for this copy');
        const res = await api.returnBook({ borrowId: activeBorrow.id, returnType, returnCondition, notes: returnNotes || undefined });
        setDoneMsg(`Returned. Fine: ${formatCurrency(res.totalFine ?? 0)}.`);
      } else {
        const activeBorrow = cardDetail.card.borrows.find(
          b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber
        );
        if (!activeBorrow) throw new Error('No active borrow found');
        const res = await api.renew(activeBorrow.id);
        setDoneMsg(`Renewed — new due date: ${formatDate(res.newDueAt)}.`);
      }
      setShowConfirm(false);
      setPhase('done');
    } catch (e: any) {
      if (e.status === 0 || e.message?.includes('Network')) {
        const activeBorrow = action !== 'borrow'
          ? cardDetail.card.borrows.find(b => !b.returnedAt && b.copy?.accessionNumber === evalResult.copy!.accessionNumber)
          : null;
        await syncService.queueOperation(action.toUpperCase() as never, 'borrow', activeBorrow?.id || 'new', {
          studentId: cardDetail.student.id, copyId: evalResult.copy.id,
          borrowId: activeBorrow?.id, returnType, returnCondition,
        });
        setDoneMsg('Action queued offline — will sync when connected.');
        setPhase('done');
      } else {
        setActionErr(getErrorMessage(e));
      }
    } finally { setActing(false); }
  };

  const reset = () => {
    setPhase('student'); setStudentQuery(''); setStudentResults([]);
    setCardDetail(null); setBookQuery(''); setBookInputMode('camera');
    setEvalResult(null); setAction(null); setActionErr(null); setDoneMsg('');
    setReturnType('NORMAL'); setReturnCondition('GOOD');
    setReturnNotes(''); setOverrideReason('');
  };

  const nextBook = () => {
    setPhase('book'); setBookQuery(''); setBookInputMode('camera');
    setEvalResult(null); setAction(null); setActionErr(null);
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const copyStatus = evalResult?.copy?.status;
  const canBorrow  = copyStatus === 'AVAILABLE' || copyStatus === 'RESERVED';
  const canReturn  = copyStatus === 'BORROWED';
  const canRenew   = copyStatus === 'BORROWED' && (cardDetail?.settings?.maxRenewals ?? 1) > 0;
  const hasOverdue = cardDetail?.card.borrows.some(b => !b.returnedAt && isOverdue(b.dueAt)) ?? false;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.paper }}>
      <ScreenHeader
        title="Circulation Desk"
        subtitle={
          phase === 'student' ? 'Find student' :
          phase === 'book'    ? `Scan book for ${cardDetail?.student.fullName ?? ''}` :
          phase === 'eval'    ? cardDetail?.student.fullName ?? 'Confirm action' :
          'Done'
        }
        right={
          phase !== 'student' ? (
            <TouchableOpacity onPress={reset} style={{ padding: Spacing[2] }} hitSlop={{ top:8, right:8, bottom:8, left:8 }}>
              <X size={20} color={Colors.white} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <PhaseBar phase={phase} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: insets.bottom + Spacing[10] }}>

        {/* ── PHASE 1: Student search ────────────────────────────────── */}
        {phase === 'student' && (
          <View style={{ gap: Spacing[3] }}>
            <SearchBar
              value={studentQuery}
              onChangeText={setStudentQuery}
              placeholder="Name or admission number…"
              loading={searchingStudent || loadingCard}
              autoFocus
            />
            {studentErr && <ErrorBanner message={studentErr} onDismiss={() => setStudentErr(null)} />}
            {studentResults.map(s => (
              <StudentListItem key={s.id} student={s} onPress={() => loadCard(s.id)} />
            ))}
            {!studentQuery && (
              <View style={{ alignItems: 'center', paddingTop: Spacing[10] }}>
                <User size={48} color={Colors.muted} />
                <Text style={{ color: Colors.muted, fontSize: Typography.fontSize.sm, marginTop: Spacing[3], textAlign: 'center' }}>
                  Start by finding the student
                </Text>
                <Text style={{ color: Colors.muted, fontSize: Typography.fontSize.xs, marginTop: Spacing[2], textAlign: 'center', paddingHorizontal: Spacing[6] }}>
                  Type their name or admission number above.{'\n'}
                  The camera opens for the book scan after you select them.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Student card strip (book + eval + done) ───────────────── */}
        {(phase === 'book' || phase === 'eval' || phase === 'done') && cardDetail && (
          <StudentCardPanel detail={cardDetail} hasOverdue={hasOverdue} />
        )}

        {/* ── PHASE 2: Book scan ────────────────────────────────────── */}
        {phase === 'book' && (
          <View style={{ gap: Spacing[3] }}>

            {/* Camera / keyboard toggle */}
            <View style={{
              flexDirection: 'row', backgroundColor: Colors.card,
              borderRadius: Radius.button, padding: 3,
              borderWidth: 1, borderColor: Colors.line,
            }}>
              {(['camera', 'keyboard'] as BookInputMode[]).map(mode => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setBookInputMode(mode)}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'center', gap: Spacing[1.5],
                    paddingVertical: Spacing[2], borderRadius: Radius.button - 2,
                    backgroundColor: bookInputMode === mode ? Colors.teal : 'transparent',
                  }}
                >
                  {mode === 'camera'
                    ? <QrCode size={15} color={bookInputMode === mode ? Colors.white : Colors.slateText} />
                    : <Keyboard size={15} color={bookInputMode === mode ? Colors.white : Colors.slateText} />
                  }
                  <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: bookInputMode === mode ? Colors.white : Colors.slateText }}>
                    {mode === 'camera' ? 'Scan QR' : 'Type Code'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Camera — only mounted here (phase=book), never on load */}
            {bookInputMode === 'camera' && (
              permission?.granted ? (
                <View style={{ borderRadius: Radius.card, overflow: 'hidden', height: 260 }}>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
                    onBarcodeScanned={searchingBook ? undefined : onBarcodeScanned}
                  >
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 200, height: 200 }}>
                        {(['tl','tr','bl','br'] as const).map(c => (
                          <View key={c} style={{
                            position: 'absolute',
                            [c.includes('t') ? 'top' : 'bottom']: 0,
                            [c.includes('l') ? 'left' : 'right']: 0,
                            width: 32, height: 32,
                            borderColor: Colors.teal,
                            borderTopWidth:    c.includes('t') ? 3 : 0,
                            borderBottomWidth: c.includes('b') ? 3 : 0,
                            borderLeftWidth:   c.includes('l') ? 3 : 0,
                            borderRightWidth:  c.includes('r') ? 3 : 0,
                          }} />
                        ))}
                      </View>
                      <View style={{ marginTop: Spacing[4], backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.button, paddingHorizontal: Spacing[4], paddingVertical: Spacing[1.5] }}>
                        <Text style={{ color: Colors.white, fontSize: Typography.fontSize.xs, textAlign: 'center' }}>
                          {searchingBook ? 'Processing…' : 'Point camera at book QR code'}
                        </Text>
                      </View>
                    </View>
                  </CameraView>
                </View>
              ) : (
                <View style={{ height: 200, backgroundColor: Colors.ink, borderRadius: Radius.card, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] }}>
                  <QrCode size={36} color={Colors.muted} />
                  <Text style={{ color: Colors.muted, textAlign: 'center', fontSize: Typography.fontSize.sm, paddingHorizontal: Spacing[6] }}>
                    Camera permission needed
                  </Text>
                  <Button label="Enable Camera" onPress={requestPermission} size="sm" />
                </View>
              )
            )}

            {/* Manual text input */}
            {bookInputMode === 'keyboard' && (
              <SearchBar
                value={bookQuery}
                onChangeText={setBookQuery}
                placeholder="Accession number (e.g. ACC-00145)…"
                loading={searchingBook}
                autoFocus
              />
            )}

            {bookErr && <ErrorBanner message={bookErr} onDismiss={() => setBookErr(null)} />}
          </View>
        )}

        {/* ── PHASE 3: Policy eval ──────────────────────────────────── */}
        {phase === 'eval' && evalResult && cardDetail && (
          <EvalPanel
            eval={evalResult}
            cardDetail={cardDetail}
            canBorrow={canBorrow}
            canReturn={canReturn}
            canRenew={canRenew}
            action={action}
            onSelectAction={setAction}
            returnType={returnType}           onReturnType={setReturnType}
            returnCondition={returnCondition} onReturnCondition={setReturnCondition}
            returnNotes={returnNotes}         onReturnNotes={setReturnNotes}
            overrideReason={overrideReason}   onOverrideReason={setOverrideReason}
            onConfirm={() => setShowConfirm(true)}
            actionErr={actionErr}
          />
        )}

        {/* ── PHASE 4: Done ─────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={{ gap: Spacing[4] }}>
            <View style={{ backgroundColor: Colors.successBg, borderRadius: Radius.card, padding: Spacing[6], alignItems: 'center', gap: Spacing[3] }}>
              <CheckCircle2 size={40} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, textAlign: 'center' }}>
                {doneMsg}
              </Text>
            </View>
            <Button label="New Transaction" onPress={reset} fullWidth />
            <Button
              label="Another Book — Same Student"
              variant="secondary"
              onPress={nextBook}
              fullWidth
            />
          </View>
        )}
      </ScrollView>

      <ConfirmModal
        visible={showConfirm}
        title={action === 'borrow' ? 'Confirm Borrow' : action === 'return' ? 'Confirm Return' : 'Confirm Renewal'}
        message={
          action === 'borrow'
            ? `Issue "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" to ${cardDetail?.student.fullName}?\nDue: ${evalResult?.dueAt ? formatDate(evalResult.dueAt) : '—'}`
            : action === 'return'
            ? `Return "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" from ${cardDetail?.student.fullName}?`
            : `Renew "${evalResult?.copy?.catalogue?.title || evalResult?.copy?.accessionNumber}" for ${cardDetail?.student.fullName}?`
        }
        confirmLabel={action === 'borrow' ? 'Issue Book' : action === 'return' ? 'Return Book' : 'Renew Loan'}
        onConfirm={executeAction}
        onCancel={() => setShowConfirm(false)}
        loading={acting}
      />

      <Toast {...toastProps} />
    </View>
  );
}

// ── PhaseBar ──────────────────────────────────────────────────────────────────

const PHASES: { key: Phase; label: string }[] = [
  { key: 'student', label: 'Student' },
  { key: 'book',    label: 'Book'    },
  { key: 'eval',    label: 'Confirm' },
  { key: 'done',    label: 'Done'    },
];

function PhaseBar({ phase }: { phase: Phase }) {
  const current = PHASES.findIndex(p => p.key === phase);
  return (
    <View style={{ flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.line, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] }}>
      {PHASES.map(({ key, label }, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={key}>
            <View style={{ alignItems: 'center', opacity: done || active ? 1 : 0.35 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: done ? Colors.success : active ? Colors.teal : Colors.line, alignItems: 'center', justifyContent: 'center' }}>
                {done
                  ? <CheckCircle2 size={14} color={Colors.white} />
                  : <Text style={{ fontSize: 11, fontWeight: '700', color: active ? Colors.white : Colors.slateText }}>{i + 1}</Text>
                }
              </View>
              <Text style={{ fontSize: Typography.fontSize.xs, marginTop: 2, color: active ? Colors.teal : Colors.slateText, fontWeight: active ? Typography.fontWeight.semibold : Typography.fontWeight.normal }}>
                {label}
              </Text>
            </View>
            {i < PHASES.length - 1 && (
              <View style={{ flex: 1, height: 2, backgroundColor: i < current ? Colors.success : Colors.line, alignSelf: 'center', marginHorizontal: Spacing[1], marginBottom: 14 }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── StudentCardPanel ──────────────────────────────────────────────────────────

function StudentCardPanel({ detail, hasOverdue }: { detail: CardDetail; hasOverdue: boolean }) {
  const { student, card } = detail;
  return (
    <View style={{ backgroundColor: Colors.teal, borderRadius: Radius.card, padding: Spacing[4], flexDirection: 'row', gap: Spacing[3] }}>
      <Avatar name={student.fullName} photoFileId={student.files[0]?.id} size="lg" />
      <View style={{ flex: 1, gap: Spacing[1] }}>
        <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }} numberOfLines={1}>
          {student.fullName}
        </Text>
        <Text style={{ color: Colors.white + 'CC', fontSize: Typography.fontSize.xs }}>
          {student.admissionNumber} · {student.schoolClass.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: Spacing[2], marginTop: Spacing[1], flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: Colors.white + '30', paddingHorizontal: Spacing[2], paddingVertical: 1, borderRadius: Radius.full }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.white }}>
              {cardStatusLabel(card.status)}
            </Text>
          </View>
          {card.fineBalance > 0 && (
            <View style={{ backgroundColor: Colors.dangerBg, paddingHorizontal: Spacing[2], paddingVertical: 1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.danger }}>
                Fine: {formatCurrency(card.fineBalance)}
              </Text>
            </View>
          )}
          {hasOverdue && (
            <View style={{ backgroundColor: Colors.warnBg, paddingHorizontal: Spacing[2], paddingVertical: 1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.warn }}>Overdue</Text>
            </View>
          )}
          <Text style={{ color: Colors.white + '99', fontSize: Typography.fontSize.xs }}>
            {card.currentBorrowCount} out
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── EvalPanel ─────────────────────────────────────────────────────────────────

interface EvalPanelProps {
  eval: PolicyEvalResult; cardDetail: CardDetail;
  canBorrow: boolean; canReturn: boolean; canRenew: boolean;
  action: Action | null; onSelectAction: (a: Action) => void;
  returnType: string;      onReturnType: (v: string) => void;
  returnCondition: string; onReturnCondition: (v: string) => void;
  returnNotes: string;     onReturnNotes: (v: string) => void;
  overrideReason: string;  onOverrideReason: (v: string) => void;
  onConfirm: () => void;   actionErr: string | null;
}

function EvalPanel(p: EvalPanelProps) {
  const { eval: ev, canBorrow, canReturn, canRenew } = p;
  const copy = ev.copy;

  return (
    <View style={{ gap: Spacing[3] }}>
      {/* Book summary */}
      <Card>
        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing[2] }}>Book</Text>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink }} numberOfLines={1}>
          {copy?.catalogue?.title || copy?.accessionNumber}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.slateText, marginTop: 2 }}>
          {copy?.accessionNumber} · {copy?.status} · {copy?.condition}
        </Text>
        {ev.dueAt && canBorrow && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.teal, marginTop: Spacing[2] }}>
            If borrowed → due {formatDate(ev.dueAt)}
          </Text>
        )}
      </Card>

      {/* Block reasons */}
      {ev.reasons?.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.dangerBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertCircle size={16} color={Colors.danger} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.sm, color: Colors.danger }}>{r}</Text>
        </View>
      ))}

      {/* Warnings */}
      {ev.warnings?.map((w, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2], backgroundColor: Colors.warnBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertTriangle size={16} color={Colors.warn} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.sm, color: Colors.warn }}>{w}</Text>
        </View>
      ))}

      {/* Action selector */}
      <View style={{ gap: Spacing[2] }}>
        {canBorrow && <ActionBtn label="Borrow" active={p.action==='borrow'} onPress={() => p.onSelectAction('borrow')} color={Colors.teal} />}
        {canReturn  && <ActionBtn label="Return" active={p.action==='return'} onPress={() => p.onSelectAction('return')} color={Colors.success} />}
        {canRenew   && <ActionBtn label="Renew"  active={p.action==='renew'}  onPress={() => p.onSelectAction('renew')}  color={Colors.info} />}
      </View>

      {/* Return options */}
      {p.action === 'return' && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, marginBottom: Spacing[3], textTransform: 'uppercase', letterSpacing: 0.8 }}>Return Details</Text>
          <PillRow label="Return type"         options={RETURN_TYPES}      value={p.returnType}      onChange={p.onReturnType} />
          <View style={{ marginTop: Spacing[3] }}>
            <PillRow label="Condition on return" options={RETURN_CONDITIONS} value={p.returnCondition} onChange={p.onReturnCondition} />
          </View>
        </Card>
      )}

      {/* Override reason (borrow blocked) */}
      {p.action === 'borrow' && !ev.allowed && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.warn, marginBottom: Spacing[2] }}>Override Required</Text>
          <TextInput
            value={p.overrideReason} onChangeText={p.onOverrideReason}
            placeholder="Enter override reason" placeholderTextColor={Colors.muted}
            multiline numberOfLines={2}
            style={{ borderWidth: 1, borderColor: Colors.line, borderRadius: Radius.sm, padding: Spacing[3], fontSize: Typography.fontSize.sm, color: Colors.ink, minHeight: 60 }}
          />
        </Card>
      )}

      {p.actionErr && <ErrorBanner message={p.actionErr} />}

      {/* Confirm button */}
      {p.action && (
        <Button
          label={p.action === 'borrow' ? 'Issue Book' : p.action === 'return' ? 'Return Book' : 'Renew Loan'}
          onPress={p.onConfirm}
          disabled={p.action === 'borrow' && !ev.allowed && !p.overrideReason.trim()}
          fullWidth
        />
      )}
    </View>
  );
}

function ActionBtn({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ padding: Spacing[3], borderRadius: Radius.button, borderWidth: 2, borderColor: active ? color : Colors.line, backgroundColor: active ? color + '15' : Colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: active ? color : Colors.ink }}>{label}</Text>
      {active && <CheckCircle2 size={20} color={color} />}
    </TouchableOpacity>
  );
}

function PillRow({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, marginBottom: Spacing[2] }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] }}>
        {options.map(o => (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            style={{ paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5], borderRadius: Radius.full, borderWidth: 1, borderColor: value === o ? Colors.teal : Colors.line, backgroundColor: value === o ? Colors.teal50 : Colors.card }}
          >
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: value === o ? Colors.teal : Colors.slateText }}>
              {o.replace(/_/g, ' ').charAt(0) + o.replace(/_/g, ' ').slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
