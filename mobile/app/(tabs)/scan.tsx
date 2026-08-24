/**
 * Scan Tab — Quick borrow/return via QR with inline camera.
 * Uses CameraView from expo-camera. Each borrow generates a
 * loan-specific token (BIDII:LOAN:<borrowId>) so returns are
 * always validated against the active loan record.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { CheckCircle2, AlertCircle, QrCode, BookOpen, RefreshCw } from 'lucide-react-native';
import { ScreenHeader, Button, Toast, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { Colors, Spacing, Typography, Radius, SCAN_COOLDOWN_MS } from '@/constants';
import { parseQRCode, formatDate, formatCurrency, getErrorMessage } from '@/lib/utils';
import { syncService } from '@/services/sync';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScanResult =
  | { state: 'idle' }
  | { state: 'processing' }
  | { state: 'success'; message: string; detail?: string }
  | { state: 'error';   message: string };

export default function ScanTabScreen() {
  const insets = useSafeAreaInsets();
  const { toastProps, show: showToast } = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchOn,    setTorchOn]    = useState(false);
  const [result,     setResult]     = useState<ScanResult>({ state: 'idle' });
  const lastScanRef = useRef<number>(0);

  useEffect(() => { if (!permission?.granted) requestPermission(); }, []);

  const resetResult = () => setResult({ state: 'idle' });

  const handleScan = useCallback(async (raw: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return;
    lastScanRef.current = now;
    if (result.state === 'processing') return;

    setResult({ state: 'processing' });

    try {
      const parsed = parseQRCode(raw);

      if (!parsed) {
        // Treat as accession number → look up and try return first
        await handleAccessionScan(raw);
        return;
      }

      if (parsed.type === 'BOOK') {
        await handleAccessionScan(parsed.id);
      } else if (parsed.type === 'LOAN') {
        await handleLoanTokenScan(parsed.id);
      } else if (parsed.type === 'STUDENT') {
        setResult({ state: 'error', message: 'This is a student QR code. Use the Circulation tab and search by name to identify a student.' });
      } else {
        setResult({ state: 'error', message: `Unknown QR type: ${raw}` });
      }
    } catch (err: any) {
      setResult({ state: 'error', message: getErrorMessage(err) });
    }
  }, [result.state]);

  /** Accession number: look up copy status and auto-return if borrowed */
  const handleAccessionScan = async (accession: string) => {
    const copies = await api.searchCopies(accession);
    const copy   = copies.find(c => c.accessionNumber.toUpperCase() === accession.toUpperCase().trim());

    if (!copy) {
      setResult({ state: 'error', message: `No copy found for "${accession}"` });
      return;
    }

    if (copy.status === 'BORROWED') {
      // Find active borrow for this copy via a lookup
      const borrowInfo = await api.get<{
        borrowId: string; studentName: string; dueAt: string; fineAmount?: number;
      }>(`/api/library/copies/${copy.id}/active-borrow`);

      const res = await api.returnBook({
        borrowId: borrowInfo.borrowId,
        returnType: 'NORMAL',
        returnCondition: 'GOOD',
      });
      setResult({
        state: 'success',
        message: `Returned by ${borrowInfo.studentName}`,
        detail: `Fine charged: ${formatCurrency(res.totalFine ?? 0)}`,
      });
    } else if (copy.status === 'AVAILABLE') {
      setResult({ state: 'error', message: `"${accession}" is available — use Circulation tab to borrow` });
    } else {
      setResult({ state: 'error', message: `Cannot process "${accession}" — status: ${copy.status}` });
    }
  };

  /** Loan token: validate against active borrow on server, then return */
  const handleLoanTokenScan = async (tokenId: string) => {
    const loanData = await api.get<{
      borrowId: string; studentName: string;
      accessionNumber: string; title: string; dueAt: string;
    }>(`/api/library/borrows/token/${encodeURIComponent(tokenId)}`);

    const res = await api.returnBook({
      borrowId: loanData.borrowId,
      returnType: 'NORMAL',
      returnCondition: 'GOOD',
    });

    setResult({
      state: 'success',
      message: `"${loanData.title || loanData.accessionNumber}" returned by ${loanData.studentName}`,
      detail: `Fine: ${formatCurrency(res.totalFine ?? 0)}`,
    });
  };

  const onBarcodeScanned = useCallback((r: BarcodeScanningResult) => {
    handleScan(r.data);
  }, [handleScan]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScreenHeader title="QR Scanner" subtitle="Scan to borrow / return" />

      {/* Camera viewport */}
      <View style={{ height: 320, position: 'relative' }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{ barcodeTypes: ['qr','code128','ean13'] }}
            onBarcodeScanned={result.state !== 'processing' ? onBarcodeScanned : undefined}
          >
            {/* Scan frame */}
            <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
              <View style={{ width: 200, height: 200 }}>
                {(['tl','tr','bl','br'] as const).map(c => (
                  <View key={c} style={{
                    position:'absolute',
                    [c.includes('t') ? 'top' : 'bottom']: 0,
                    [c.includes('l') ? 'left' : 'right']: 0,
                    width:32, height:32, borderColor: Colors.teal,
                    borderTopWidth:    c.includes('t') ? 3 : 0,
                    borderBottomWidth: c.includes('b') ? 3 : 0,
                    borderLeftWidth:   c.includes('l') ? 3 : 0,
                    borderRightWidth:  c.includes('r') ? 3 : 0,
                  }}/>
                ))}
              </View>
            </View>
          </CameraView>
        ) : (
          <View style={{ flex:1, backgroundColor: Colors.ink, alignItems:'center', justifyContent:'center', gap: Spacing[3] }}>
            <QrCode size={48} color={Colors.muted} />
            <Text style={{ color: Colors.muted, textAlign:'center', paddingHorizontal: Spacing[6] }}>
              Camera permission needed for scanning
            </Text>
            <TouchableOpacity onPress={requestPermission} style={{ backgroundColor: Colors.teal, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2.5], borderRadius: Radius.button }}>
              <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.semibold }}>Enable Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Torch toggle */}
        {permission?.granted && (
          <TouchableOpacity
            onPress={() => setTorchOn(v => !v)}
            style={{
              position:'absolute', top: Spacing[3], right: Spacing[3],
              backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: Radius.full,
              width: 40, height: 40, alignItems:'center', justifyContent:'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>{torchOn ? '🔦' : '💡'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Result panel */}
      <View style={{ flex:1, backgroundColor: Colors.paper }}>
        <ScrollView contentContainerStyle={{ padding: Spacing[4], gap: Spacing[3], paddingBottom: insets.bottom + Spacing[8] }}>

          {result.state === 'idle' && (
            <View style={{ alignItems:'center', paddingTop: Spacing[6], gap: Spacing[2] }}>
              <QrCode size={32} color={Colors.muted} />
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.muted, textAlign:'center' }}>
                Point the camera at a book QR code to return it instantly
              </Text>
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.muted, textAlign:'center' }}>
                Supported: Book QR codes (BIDII:BOOK:*) and Loan tokens (BIDII:LOAN:*)
              </Text>
            </View>
          )}

          {result.state === 'processing' && (
            <View style={{ alignItems:'center', paddingVertical: Spacing[8], gap: Spacing[3] }}>
              <ActivityIndicator size="large" color={Colors.teal} />
              <Text style={{ color: Colors.slateText, fontSize: Typography.fontSize.sm }}>Processing scan…</Text>
            </View>
          )}

          {result.state === 'success' && (
            <View style={{ backgroundColor: Colors.successBg, borderRadius: Radius.card, padding: Spacing[5], alignItems:'center', gap: Spacing[2], borderWidth:1, borderColor: Colors.success + '30' }}>
              <CheckCircle2 size={36} color={Colors.success} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.ink, textAlign:'center' }}>
                {result.message}
              </Text>
              {result.detail && (
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.slateText }}>{result.detail}</Text>
              )}
              <Button label="Scan Next" onPress={resetResult} size="sm" style={{ marginTop: Spacing[2] }} />
            </View>
          )}

          {result.state === 'error' && (
            <View style={{ backgroundColor: Colors.dangerBg, borderRadius: Radius.card, padding: Spacing[5], alignItems:'center', gap: Spacing[2], borderWidth:1, borderColor: Colors.danger + '30' }}>
              <AlertCircle size={36} color={Colors.danger} />
              <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.danger, textAlign:'center' }}>
                {result.message}
              </Text>
              <Button label="Try Again" onPress={resetResult} size="sm" variant="secondary" style={{ marginTop: Spacing[2] }} />
            </View>
          )}
        </ScrollView>
      </View>

      <Toast {...toastProps} />
    </View>
  );
}
