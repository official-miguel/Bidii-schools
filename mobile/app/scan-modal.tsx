/**
 * QR Scanner Modal — full-screen camera with scan overlay.
 *
 * Uses expo-camera with barcode scanning enabled.
 * Scans BIDII:BOOK:*, BIDII:STUDENT:*, or BIDII:LOAN:* tokens.
 * BIDII:LOAN tokens are validated against the active loan record
 * on the server — NOT a raw string match — so returns are always
 * validated against real borrow data.
 *
 * Provides manual fallback input if camera permission is denied.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  CameraView, useCameraPermissions, BarcodeScanningResult,
} from 'expo-camera';
import { X, Keyboard, Flashlight, FlashlightOff, Camera } from 'lucide-react-native';
import { Colors, Spacing, Typography, Radius, SCAN_COOLDOWN_MS } from '@/constants';
import { parseQRCode } from '@/lib/utils';
import { api } from '@/services/api';

type ScanMode = 'camera' | 'manual';

export default function ScanModal() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ returnTo?: string; context?: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [mode,       setMode]       = useState<ScanMode>('camera');
  const [torchOn,    setTorchOn]    = useState(false);
  const [manualVal,  setManualVal]  = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback,   setFeedback]   = useState('');
  const lastScanRef = useRef<number>(0);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleScan = useCallback(async (raw: string) => {
    const now = Date.now();
    if (now - lastScanRef.current < SCAN_COOLDOWN_MS) return; // debounce
    lastScanRef.current = now;

    setProcessing(true);
    setFeedback('');

    try {
      const parsed = parseQRCode(raw);

      if (!parsed) {
        // Fallback: treat raw value as accession number
        setFeedback(`Scanned: ${raw}`);
        router.back();
        router.setParams({ scannedValue: raw, scannedType: 'RAW' });
        return;
      }

      if (parsed.type === 'BOOK') {
        setFeedback(`Book: ${parsed.id}`);
        router.back();
        router.setParams({ scannedValue: parsed.id, scannedType: 'BOOK' });

      } else if (parsed.type === 'LOAN') {
        // LOAN token — validate against active borrow on server
        // This is the key security check: we never do a raw string match.
        // The server returns the borrow record only if the token matches
        // an active (not returned) loan.
        const loanData = await api.get<{
          borrowId: string; studentId: string; copyId: string;
          accessionNumber: string; title: string; dueAt: string;
        }>(`/api/library/borrows/token/${encodeURIComponent(parsed.id)}`);

        setFeedback(`Loan validated: ${loanData.accessionNumber}`);
        router.back();
        router.setParams({
          scannedValue: loanData.borrowId,
          scannedType: 'LOAN',
          scannedMeta: JSON.stringify(loanData),
        });
      }
    } catch (err: any) {
      setFeedback(err.message || 'Scan failed');
      setTimeout(() => setFeedback(''), 2000);
    } finally {
      setProcessing(false);
    }
  }, [router]);

  const onBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    if (!processing) handleScan(result.data);
  }, [processing, handleScan]);

  const handleManualSubmit = () => {
    if (!manualVal.trim()) return;
    handleScan(manualVal.trim());
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        paddingTop: 56, paddingHorizontal: Spacing[4], paddingBottom: Spacing[3],
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}>
        <Text style={{ color: Colors.white, fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold }}>
          Scan QR Code
        </Text>
        <View style={{ flexDirection: 'row', gap: Spacing[3] }}>
          {mode === 'camera' && (
            <TouchableOpacity onPress={() => setTorchOn(v => !v)} hitSlop={{ top:8,right:8,bottom:8,left:8 }}>
              {torchOn
                ? <FlashlightOff size={22} color={Colors.white} />
                : <Flashlight size={22} color={Colors.white} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setMode(m => m === 'camera' ? 'manual' : 'camera')} hitSlop={{ top:8,right:8,bottom:8,left:8 }}>
            {mode === 'camera'
              ? <Keyboard size={22} color={Colors.white} />
              : <Camera size={22} color={Colors.white} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top:8,right:8,bottom:8,left:8 }}>
            <X size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera mode */}
      {mode === 'camera' ? (
        <>
          {!permission?.granted ? (
            <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap: Spacing[4], padding: Spacing[6] }}>
              <Camera size={48} color={Colors.muted} />
              <Text style={{ color: Colors.white, textAlign:'center', fontSize: Typography.fontSize.sm }}>
                Camera permission is required to scan QR codes.
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                style={{ backgroundColor: Colors.teal, paddingHorizontal: Spacing[5], paddingVertical: Spacing[3], borderRadius: Radius.button }}
              >
                <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.semibold }}>Grant Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('manual')}>
                <Text style={{ color: Colors.teal, fontSize: Typography.fontSize.sm }}>Use manual entry instead</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torchOn}
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}
              onBarcodeScanned={onBarcodeScanned}
            >
              {/* Scan frame overlay */}
              <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
                <View style={{ width: 260, height: 260 }}>
                  {/* Corner brackets */}
                  {(['tl','tr','bl','br'] as const).map(corner => (
                    <View key={corner} style={{
                      position:'absolute',
                      [corner.includes('t') ? 'top' : 'bottom']: 0,
                      [corner.includes('l') ? 'left' : 'right']: 0,
                      width: 40, height: 40,
                      borderColor: Colors.teal,
                      borderTopWidth:    corner.includes('t') ? 3 : 0,
                      borderBottomWidth: corner.includes('b') ? 3 : 0,
                      borderLeftWidth:   corner.includes('l') ? 3 : 0,
                      borderRightWidth:  corner.includes('r') ? 3 : 0,
                    }} />
                  ))}
                </View>

                {/* Instruction / feedback */}
                <View style={{ marginTop: Spacing[6], backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.button, paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] }}>
                  {processing
                    ? <ActivityIndicator size="small" color={Colors.teal} />
                    : <Text style={{ color: Colors.white, fontSize: Typography.fontSize.sm, textAlign:'center' }}>
                        {feedback || 'Point camera at a Bidii QR code'}
                      </Text>
                  }
                </View>
              </View>
            </CameraView>
          )}
        </>
      ) : (
        /* Manual entry fallback */
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex:1, justifyContent:'center', padding: Spacing[6] }}
        >
          <Text style={{ color: Colors.white, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, marginBottom: Spacing[4] }}>
            Manual Entry
          </Text>
          <TextInput
            value={manualVal}
            onChangeText={setManualVal}
            placeholder="Book accession number (e.g. ACC-00145)"
            placeholderTextColor={Colors.muted}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={handleManualSubmit}
            style={{
              backgroundColor: Colors.card, borderRadius: Radius.button,
              paddingHorizontal: Spacing[4], paddingVertical: Spacing[3],
              fontSize: Typography.fontSize.base, color: Colors.ink,
            }}
          />
          <TouchableOpacity
            onPress={handleManualSubmit}
            disabled={!manualVal.trim() || processing}
            style={{
              marginTop: Spacing[4], backgroundColor: manualVal.trim() ? Colors.teal : Colors.slateText,
              borderRadius: Radius.button, paddingVertical: Spacing[3.5], alignItems:'center',
            }}
          >
            {processing
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={{ color: Colors.white, fontWeight: Typography.fontWeight.semibold }}>Submit</Text>
            }
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
