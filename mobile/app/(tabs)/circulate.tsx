/**
 * Circulation Desk — book-first workflow
 *
 * Phase 1: Find book — camera open by default, keyboard toggle for manual entry
 * Phase 2: Find student — only for borrow (skipped for returns/renewals)
 * Phase 3: Policy evaluation → confirm action
 * Phase 4: Done
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput,
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

type Phase = 'book' | 'student' | 'eval' | 'done';
type Action = 'borrow' | 'return' | 'renew';

const RETURN_TYPES      = ['NORMAL','DAMAGED','LOST','REPLACEMENT_RECEIVED'] as const;
const RETURN_CONDITIONS = ['EXCELLENT','GOOD','FAIR','DAMAGED','LOST']       as const;

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CirculateScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const params  = useLocalSearchParams<{ preloadStudentId?: string }>();
  const { toastProps, show: showToast } = useToast();

  const [phase,  setPhase]  = useState<Phase>('book');
  const [action, setAction] = useState<Action | null>(null);

  // Book — camera or keyboard mode
  const [bookInputMode, setBookInputMode] = useState<'camera' | 'keyboard'>('camera');
  const [bookQuery,     setBookQuery]     = useState('');
  const [searchingBook, setSearchingBook] = useState(false);
  const [bookErr,       setBookErr]       = useState<string | null>(null);
  const [permission,    requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<number>(0);

  // Student (only needed after book phase for borrow/renew)
  const [studentQuery,     setStudentQuery]     = useState('');
  const [studentResults,   setStudentResults]   = useState<StudentHit[]>([]);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [studentErr,       setStudentErr]       = useState<string | null>(null);
  const [loadingCard,      setLoadingCard]       = useState(false);

  // Card + eval
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [evalResult, setEvalResult] = useState<PolicyEvalResult | null>(null);

  // Action options
  const [returnType,      setReturnType]      = useState('NORMAL');
  const [returnCondition, setReturnCondition] = useState('GOOD');
  const [returnNotes,     setReturnNotes]     = useState('');
  const [overrideReason,  setOverrideReason]  = useState('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [acting,      setActing]      = useState(false);
  const [actionErr,   setActionErr]   = useState<string | null>(null);
  const [doneMsg,     setDoneMsg]     = useState('');

  const debStudentQuery = useDebounce(studentQuery, 250);
  const debBookQuery    = useDebounce(bookQuery,    300);

  // Pre-load student when navigating from another screen (e.g. student card)
  useEffect(() => {
    if (params.preloadStudentId) loadCard(params.preloadStudentId);
  }, []); // eslint-disable-line

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []); // eslint-disable-line

  // ── Book live search ───────────────────────────────────────────────────
  useEffect(() => {
    if (!debBookQuery.trim() || phase !== 'book') return;
    lookupBook(debBookQuery);
  }, [debBookQuery]); // eslint-disable-line

  // ── Student live search ────────────────────────────────────────────────
  useEffect(() => {
    if (!debStudentQuery.trim() || phase !== 'student') { setStudentResults([]); return; }
    (async () => {
      setSearchingStudent(true); setStudentErr(null);
      try { setStudentResults(await api.searchStudents(debStudentQuery)); }
      catch (e: any) { setStudentErr(e.message); }
      finally { setSearchingStudent(false); }
    })();
  }, [debStudentQuery, phase]);

  // ── Look up a book copy ────────────────────────────────────────────────
  const lookupBook = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setSearchingBook(true); setBookErr(null); setEvalResult(null);
    setAction(null); setCardDetail(null);

    const accession = q.startsWith('BIDII:BOOK:') ? q.slice(11)
                    : q.startsWith('BIDII:')       ? q.slice(6)
                    : q;
    try {
      const copies = await api.searchCopies(accession);
      const copy   = copies.find(c => c.accessionNumber.toUpperCase() === accession.toUpperCase().trim())
                   ?? (copies.length === 1 ? copies[0] : null);

      if (!copy) { setBookErr(`No copy found for "${accession}"`); return; }

      if (copy.status === 'BORROWED' || copy.status === 'RESERVED') {
        // Return / renew path: look up the active borrow to get the student
        const borrowInfo = await api.get<{
          borrowId: string; studentId: string; studentName: string;
          dueAt: string; fineAmount?: number;
        }>(`/api/library/copies/${copy.id}/active-borrow`);

        // Load the student's full card
        const card = await api.getCard(borrowInfo.studentId);
        setCardDetail(card);

        // Policy evaluate
        const ev = await api.evaluatePolicy(card.student.id, copy.id);
        setEvalResult({ ...ev, copy });
        setPhase('eval');
      } else if (copy.status === 'AVAILABLE') {
        // Borrow path: need to identify the student first
        setEvalResult({ copy } as PolicyEvalResult);
        setPhase('student');
      } else {
        setBookErr(`Cannot process "${accession}" — copy status: ${copy.status}`);
      }
    } catch (e: any) {
      setBookErr(getErrorMessage(e));
    } finally {
      setSearchingBook(false);
    }
  }, []);

  // ── Camera barcode handler ─────────────────────────────────────────────
  const onBarcodeScanned = useCallback((r: BarcodeScanningResult) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = now;
    if (searchingBook) return;
    // Strip known prefixes
    const raw = r.data;
    const accession = raw.startsWith('BIDII:BOOK:') ? raw.slice(11)
                    : raw.startsWith('BIDII:')       ? raw.slice(6)
                    : raw;
    setBookQuery(accession);
    setBookInputMode('keyboard'); // switch to keyboard so user sees what was scanned
    lookupBook(accession);
  }, [searchingBook, lookupBook]);
  const loadCard = useCallback(async (sid: string) => {
    setLoadingCard(true); setStudentErr(null);
    try {
      const card = await api.getCard(sid);
      setCardDetail(card);

      // If we already have the copy from book phase, evaluate policy now
      const copy = evalResult?.copy;
      if (copy) {
        const ev = await api.evaluatePolicy(card.student.id, copy.id);
        setEvalResult({ ...ev, copy });
      }
      setPhase('eval');
    } catch (e: any) { setStudentErr(e.message); }
    finally { setLoadingCard(false); }
  }, [evalResult]);

  // ── Execute action ─────────────────────────────────────────────────────
  const executeAction = async () => {
    if (!cardDetail || !evalResult?.copy || !action) return;
    setActing(true); setActionErr(null);
    try {
      if (action === 'borrow') {
        const body: Record<string, unknown> = { studentId: cardDetail.student.id, copyId: evalResult.copy.id };
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
    setPhase('book'); setBookQuery(''); setBookInputMode('camera');
    setStudentQuery('');
    setStudentResults([]); setCardDetail(null); setEvalResult(null);
    setAction(null); setActionErr(null); setDoneMsg('');
    setReturnType('NORMAL'); setReturnCondition('GOOD');
    setReturnNotes(''); setOverrideReason('');
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
          phase === 'book'    ? 'Scan or type book code' :
          phase === 'student' ? 'Find student to borrow' :
          phase === 'eval'    ? cardDetail?.student.fullName ?? 'Confirm action' :
          phase === 'done'    ? 'Done' : ''
        }
        right={
          phase !== 'book' ? (
            <TouchableOpacity onPress={reset} style={{ padding: Spacing[2] }} hitSlop={{ top:8, right:8, bottom:8, left:8 }}>
              <X size={20} color={Colors.white} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Phase bar */}
      <PhaseBar phase={phase} />

      <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[4], paddingBottom: insets.bottom + Spacing[10] }}>

        {/* ── PHASE 1: Book scan ─────────────────────────────────────── */}
        {phase === 'book' && (
          <View style={{ gap: Spacing[3] }}>

            {/* Mode toggle */}
            <View style={{ flexDirection: 'row', backgroundColor: Colors.card, borderRadius: Radius.button, padding: 3, borderWidth: 1, borderColor: Colors.line }}>
              <TouchableOpacity
                onPress={() => setBookInputMode('camera')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[1.5], paddingVertical: Spacing[2], borderRadius: Radius.button - 2, backgroundColor: bookInputMode === 'camera' ? Colors.teal : 'transparent' }}
              >
                <QrCode size={15} color={bookInputMode === 'camera' ? Colors.white : Colors.slateText} />
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: bookInputMode === 'camera' ? Colors.white : Colors.slateText }}>
                  Scan QR
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setBookInputMode('keyboard')}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing[1.5], paddingVertical: Spacing[2], borderRadius: Radius.button - 2, backgroundColor: bookInputMode === 'keyboard' ? Colors.teal : 'transparent' }}
              >
                <Keyboard size={15} color={bookInputMode === 'keyboard' ? Colors.white : Colors.slateText} />
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: bookInputMode === 'keyboard' ? Colors.white : Colors.slateText }}>
                  Type Code
                </Text>
              </TouchableOpacity>
            </View>

            {/* Camera mode */}
            {bookInputMode === 'camera' && (
              permission?.granted ? (
                <View style={{ borderRadius: Radius.card, overflow: 'hidden', height: 260 }}>
                  <CameraView
                    style={{ flex: 1 }}
                    facing="back"
                    barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}
                    onBarcodeScanned={searchingBook ? undefined : onBarcodeScanned}
                  >
                    {/* Scan frame overlay */}
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

            {/* Keyboard mode */}
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

            {bookInputMode === 'camera' && !searchingBook && (
              <Text style={{ color: Colors.muted, fontSize: Typography.fontSize.xs, textAlign: 'center' }}>
                Or tap "Type Code" above to enter manually
              </Text>
            )}
          </View>
        )}

        {/* ── PHASE 2: Student search (borrow path only) ─────────────── */}
        {phase === 'student' && (
          <View style={{ gap: Spacing[3] }}>
            {/* Show scanned book summary */}
            {evalResult?.copy && (
              <View style={{ backgroundColor: Colors.teal50, borderRadius: Radius.card, padding: Spacing[3], flexDirection:'row', alignItems:'center', gap: Spacing[2], borderWidth:1, borderColor: Colors.teal + '40' }}>
                <BookOpen size={16} color={Colors.teal} />
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.teal }} numberOfLines={1}>
                    {evalResult.copy.catalogue?.title || evalResult.copy.accessionNumber}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.teal + 'AA' }}>
                    {evalResult.copy.accessionNumber} · {evalResult.copy.status}
                  </Text>
                </View>
              </View>
            )}

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
              <View style={{ alignItems:'center', paddingTop: Spacing[8] }}>
                <User size={40} color={Colors.muted} />
                <Text style={{ color: Colors.muted, fontSize: Typography.fontSize.sm, marginTop: Spacing[3], textAlign:'center' }}>
                  Who is borrowing this book?
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/scan-modal')}
                  style={{ marginTop: Spacing[4], flexDirection:'row', alignItems:'center', gap: Spacing[2], paddingHorizontal: Spacing[4], paddingVertical: Spacing[2.5], borderRadius: Radius.button, backgroundColor: Colors.teal50, borderWidth:1, borderColor: Colors.teal }}
                >
                  <QrCode size={18} color={Colors.teal} />
                  <Text style={{ color: Colors.teal, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold }}>
                    Scan Student QR Code
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Student card panel (eval + done) ───────────────────────── */}
        {(phase === 'eval' || phase === 'done') && cardDetail && (
          <StudentCardPanel detail={cardDetail} hasOverdue={hasOverdue} />
        )}

        {/* ── PHASE 3: Eval ──────────────────────────────────────────── */}
        {phase === 'eval' && evalResult && cardDetail && (
          <EvalPanel
            eval={evalResult} cardDetail={cardDetail}
            canBorrow={canBorrow} canReturn={canReturn} canRenew={canRenew}
            action={action} onSelectAction={setAction}
            returnType={returnType} onReturnType={setReturnType}
            returnCondition={returnCondition} onReturnCondition={setReturnCondition}
            returnNotes={returnNotes} onReturnNotes={setReturnNotes}
            overrideReason={overrideReason} onOverrideReason={setOverrideReason}
            onConfirm={() => setShowConfirm(true)}
            actionErr={actionErr}
          />
        )}

        {/* ── PHASE 4: Done ──────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={{ gap: Spacing[4] }}>
            <View style={{ backgroundColor: Colors.successBg, borderRadius: Radius.card, padding: Spacing[6], alignItems:'center', gap: Spacing[3] }}>
              <CheckCircle2 size={40} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, textAlign:'center' }}>
                {doneMsg}
              </Text>
            </View>
            <Button label="New Transaction" onPress={reset} fullWidth />
            <Button
              label="Another Book for Same Student"
              variant="secondary"
              onPress={() => {
                setPhase('book'); setBookQuery(''); setBookInputMode('camera');
                setEvalResult(null); setAction(null); setActionErr(null);
              }}
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

const PHASE_ORDER: Phase[] = ['book', 'student', 'eval', 'done'];
const PHASE_LABELS: Record<Phase, string> = {
  book:    'Book',
  student: 'Student',
  eval:    'Confirm',
  done:    'Done',
};

function PhaseBar({ phase }: { phase: Phase }) {
  const current = PHASE_ORDER.indexOf(phase);
  return (
    <View style={{ flexDirection:'row', backgroundColor: Colors.card, borderBottomWidth:1, borderBottomColor: Colors.line, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] }}>
      {PHASE_ORDER.map((p, i) => {
        const done   = i < current;
        const active = i === current;
        // Student phase is skipped for returns — show it dimmed in that case
        return (
          <React.Fragment key={p}>
            <View style={{ alignItems:'center', opacity: done || active ? 1 : 0.35 }}>
              <View style={{ width:24, height:24, borderRadius:12, backgroundColor: done ? Colors.success : active ? Colors.teal : Colors.line, alignItems:'center', justifyContent:'center' }}>
                {done
                  ? <CheckCircle2 size={14} color={Colors.white} />
                  : <Text style={{ fontSize:11, fontWeight:'700', color: active ? Colors.white : Colors.slateText }}>{i+1}</Text>
                }
              </View>
              <Text style={{ fontSize: Typography.fontSize.xs, marginTop:2, color: active ? Colors.teal : Colors.slateText, fontWeight: active ? Typography.fontWeight.semibold : Typography.fontWeight.normal }}>
                {PHASE_LABELS[p]}
              </Text>
            </View>
            {i < PHASE_ORDER.length - 1 && (
              <View style={{ flex:1, height:2, backgroundColor: i < current ? Colors.success : Colors.line, alignSelf:'center', marginHorizontal: Spacing[1], marginBottom:14 }} />
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
    <View style={{ backgroundColor: Colors.teal, borderRadius: Radius.card, padding: Spacing[4], flexDirection:'row', gap: Spacing[3] }}>
      <Avatar name={student.fullName} photoFileId={student.files[0]?.id} size="lg" />
      <View style={{ flex:1, gap: Spacing[1] }}>
        <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }} numberOfLines={1}>{student.fullName}</Text>
        <Text style={{ color: Colors.white + 'CC', fontSize: Typography.fontSize.xs }}>{student.admissionNumber} · {student.schoolClass.name}</Text>
        <View style={{ flexDirection:'row', gap: Spacing[2], marginTop: Spacing[1], flexWrap:'wrap' }}>
          <View style={{ backgroundColor: Colors.white + '30', paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.white }}>{cardStatusLabel(card.status)}</Text>
          </View>
          {card.fineBalance > 0 && (
            <View style={{ backgroundColor: Colors.dangerBg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.danger }}>Fine: {formatCurrency(card.fineBalance)}</Text>
            </View>
          )}
          {hasOverdue && (
            <View style={{ backgroundColor: Colors.warnBg, paddingHorizontal: Spacing[2], paddingVertical:1, borderRadius: Radius.full }}>
              <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, color: Colors.warn }}>Overdue</Text>
            </View>
          )}
          <Text style={{ color: Colors.white + '99', fontSize: Typography.fontSize.xs }}>{card.currentBorrowCount} out</Text>
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
  returnType: string; onReturnType: (v: string) => void;
  returnCondition: string; onReturnCondition: (v: string) => void;
  returnNotes: string; onReturnNotes: (v: string) => void;
  overrideReason: string; onOverrideReason: (v: string) => void;
  onConfirm: () => void; actionErr: string | null;
}

function EvalPanel(p: EvalPanelProps) {
  const { eval: ev, canBorrow, canReturn, canRenew } = p;
  const copy = ev.copy;

  return (
    <View style={{ gap: Spacing[3] }}>
      <Card>
        <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, textTransform:'uppercase', letterSpacing:0.8, marginBottom: Spacing[2] }}>Book</Text>
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

      {ev.reasons?.map((r, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.dangerBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertCircle size={16} color={Colors.danger} />
          <Text style={{ flex:1, fontSize: Typography.fontSize.sm, color: Colors.danger }}>{r}</Text>
        </View>
      ))}
      {ev.warnings?.map((w, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center', gap: Spacing[2], backgroundColor: Colors.warnBg, borderRadius: Radius.button, padding: Spacing[3] }}>
          <AlertTriangle size={16} color={Colors.warn} />
          <Text style={{ flex:1, fontSize: Typography.fontSize.sm, color: Colors.warn }}>{w}</Text>
        </View>
      ))}

      <View style={{ gap: Spacing[2] }}>
        {canBorrow && <ActionButton label="Borrow" active={p.action==='borrow'} onPress={() => p.onSelectAction('borrow')} color={Colors.teal} />}
        {canReturn  && <ActionButton label="Return" active={p.action==='return'} onPress={() => p.onSelectAction('return')} color={Colors.success} />}
        {canRenew   && <ActionButton label="Renew"  active={p.action==='renew'}  onPress={() => p.onSelectAction('renew')}  color={Colors.info} />}
      </View>

      {p.action === 'return' && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.slateText, marginBottom: Spacing[3], textTransform:'uppercase', letterSpacing:0.8 }}>Return Details</Text>
          <PillRow label="Return type"        options={RETURN_TYPES}      value={p.returnType}      onChange={p.onReturnType} />
          <View style={{ marginTop: Spacing[3] }}>
            <PillRow label="Condition on return" options={RETURN_CONDITIONS} value={p.returnCondition} onChange={p.onReturnCondition} />
          </View>
        </Card>
      )}

      {p.action === 'borrow' && !ev.allowed && (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.warn, marginBottom: Spacing[2] }}>Override Required</Text>
          <TextInputField value={p.overrideReason} onChangeText={p.onOverrideReason} placeholder="Enter override reason" />
        </Card>
      )}

      {p.actionErr && <ErrorBanner message={p.actionErr} />}

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

function ActionButton({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ padding: Spacing[3], borderRadius: Radius.button, borderWidth:2, borderColor: active ? color : Colors.line, backgroundColor: active ? color + '15' : Colors.card, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}
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
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap: Spacing[2] }}>
        {options.map(o => (
          <TouchableOpacity key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: Spacing[3], paddingVertical: Spacing[1.5], borderRadius: Radius.full, borderWidth:1, borderColor: value===o ? Colors.teal : Colors.line, backgroundColor: value===o ? Colors.teal50 : Colors.card }}>
            <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.medium, color: value===o ? Colors.teal : Colors.slateText }}>
              {o.replace(/_/g,' ').charAt(0)+o.replace(/_/g,' ').slice(1).toLowerCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function TextInputField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={Colors.muted} multiline numberOfLines={2}
      style={{ borderWidth:1, borderColor: Colors.line, borderRadius: Radius.sm, padding: Spacing[3], fontSize: Typography.fontSize.sm, color: Colors.ink, minHeight: 60 }}
    />
  );
}
