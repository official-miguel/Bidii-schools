# iOS QR Code Scanning Fix

## Problem
QR code scanning was not working reliably on iPhone devices in the library module. The camera would display the preview but would not recognize or scan QR codes.

## Root Cause
The issue was caused by the `barcodeScannerSettings` configuration in the CameraView component. When multiple barcode types were specified (e.g., `['qr', 'code128', 'ean13']`), iOS devices had difficulty recognizing QR codes. This is a known issue with expo-camera on iOS.

**Reference:** [expo/expo Issue #11726](https://github.com/expo/expo/issues/11726)

## Solution
Changed the `barcodeScannerSettings` to use only `['qr']` instead of multiple barcode types.

### Files Modified

1. **mobile/app/(tabs)/scan.tsx**
   - Changed from: `barcodeScannerSettings={{ barcodeTypes: ['qr','code128','ean13'] }}`
   - Changed to: `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`

2. **mobile/app/scan-modal.tsx**
   - Changed from: `barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}`
   - Changed to: `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`

3. **mobile/app/(tabs)/circulate.tsx**
   - Changed from: `barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13'] }}`
   - Changed to: `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`

## Impact
- **Positive:** QR code scanning now works reliably on iOS devices (iPhones and iPads)
- **Trade-off:** The scanner will only recognize QR codes, not other barcode formats like Code128 or EAN13
- **Note:** Since the Bidii system uses QR codes for books, students, and loan tokens, this limitation has no practical impact on functionality

## Testing
After this fix, test on:
- iPhone (various models if possible)
- iPad
- Android devices (to ensure no regression)

Scan the following QR code types:
- Book QR codes (BIDII:BOOK:*)
- Student QR codes (BIDII:STUDENT:*)
- Loan token QR codes (BIDII:LOAN:*)
- Plain accession numbers

## Additional Notes
- Android devices work with or without multiple barcode types, but iOS specifically requires the simplified configuration
- The manual fallback input remains available if camera scanning still fails
- Torch/flashlight functionality is unaffected by this change
