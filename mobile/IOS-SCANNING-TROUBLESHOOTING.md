# iOS QR Code Scanning Troubleshooting Guide

## Problem
QR codes scan successfully on Android devices and other iPhones with web-based scanners, but not on your specific iPhone with the Bidii Library app.

## Root Causes & Solutions

### 1. App Needs Rebuilding (MOST LIKELY CAUSE)
After code changes, the app must be rebuilt to apply the new barcode scanning configuration.

**Solution:**
```bash
cd mobile

# Clear cache and rebuild
npx expo start -c

# For iOS development build
npx expo run:ios

# OR if using EAS Build
eas build --platform ios --profile development
```

**Important:** Simply reloading the app with Expo Go or hot reload is NOT sufficient for native configuration changes. You must do a full rebuild.

---

### 2. Missing Native Configuration
The `barcodeScannerEnabled` flag must be explicitly set in app.json.

**Fixed in:** `mobile/app.json`
```json
"plugins": [
  [
    "expo-camera",
    {
      "cameraPermission": "Allow Bidii Library to access your camera for scanning QR codes.",
      "barcodeScannerEnabled": true  // ← Added this
    }
  ]
]
```

After changing app.json, run:
```bash
npx expo prebuild --clean
```

---

### 3. iOS Camera Permissions
Check if the app has camera permissions on your device.

**Steps:**
1. Go to iPhone **Settings** → **Privacy & Security** → **Camera**
2. Find "Bidii Library" in the list
3. Ensure the toggle is **ON** (green)
4. If it's not listed, delete and reinstall the app

---

### 4. iOS "Scan QR Codes" Setting
Some iPhones have a system-wide QR code setting that might interfere.

**Steps:**
1. Go to **Settings** → **Camera**
2. Enable **Scan QR Codes** toggle
3. Restart the app

---

### 5. Device-Specific Issues

#### iOS Version
- Ensure you're running iOS 13.0 or later
- Check: **Settings** → **General** → **About** → **Software Version**

#### Camera Hardware
- Clean the camera lens
- Ensure adequate lighting
- Hold the camera steady and at the right distance (15-30cm from QR code)

#### Background Process Limits
- Close other camera-using apps
- Restart your iPhone if needed

---

### 6. Barcode Scanner Settings in Code
Ensure all scanner components use the correct settings.

**Verified in these files:**
- ✅ `mobile/app/(tabs)/scan.tsx`
- ✅ `mobile/app/scan-modal.tsx`
- ✅ `mobile/app/(tabs)/circulate.tsx`

All now use:
```typescript
barcodeScannerSettings={{ 
  barcodeTypes: ['qr'] 
}}
```

---

### 7. QR Code Quality Issues
Even though other scanners work, ensure:
- QR code has good contrast (black on white preferred)
- QR code is not too small (minimum 2cm × 2cm)
- QR code is not damaged or partially obscured
- Sufficient white border around QR code (minimum 4 modules/cells)

---

## Testing Checklist

After applying fixes, test:

1. **Camera Permission**: App asks for camera access on first launch
2. **Camera Preview**: Live camera preview shows correctly
3. **QR Detection**: App recognizes and processes QR codes
4. **Different QR Types**:
   - Book QR codes (BIDII:BOOK:*)
   - Student QR codes (BIDII:STUDENT:*)
   - Loan tokens (BIDII:LOAN:*)
   - Plain accession numbers

---

## Debug Mode

To see if the scanner is firing but failing silently, add this temporary logging:

```typescript
// In scan.tsx, scan-modal.tsx, or circulate.tsx
const onBarcodeScanned = useCallback((r: BarcodeScanningResult) => {
  console.log('QR SCANNED:', r.data, r.type);  // ← Add this
  handleScan(r.data);
}, [handleScan]);
```

Then check the Expo console output when scanning.

---

## Still Not Working?

If none of these solutions work:

1. **Try Expo Go** (development only):
   ```bash
   npx expo start
   # Scan the QR code with Expo Go app
   ```

2. **Check Expo version compatibility**:
   ```bash
   npx expo-doctor
   ```

3. **Create a minimal test app**:
   ```bash
   npx create-expo-app test-scanner
   cd test-scanner
   npx expo install expo-camera
   # Add simple scanner code
   npx expo run:ios
   ```

4. **Report to Expo**:
   If the issue persists after all fixes, it may be a platform bug.
   File an issue at: https://github.com/expo/expo/issues

---

## Quick Fix Commands

```bash
# Full rebuild process
cd mobile
rm -rf node_modules
npm install
npx expo prebuild --clean
npx expo run:ios

# OR for EAS
eas build --platform ios --profile development --clear-cache
```

---

## Expected Behavior

✅ Camera preview shows immediately  
✅ QR code is highlighted when detected  
✅ Scan callback fires within 1 second  
✅ Success/error message displays  
✅ Works consistently across multiple scans  

---

## Additional Resources

- [Expo Camera Documentation](https://docs.expo.dev/versions/latest/sdk/camera/)
- [iOS Camera Best Practices](https://developer.apple.com/documentation/avfoundation/cameras_and_media_capture)
- [GitHub Issue #11726](https://github.com/expo/expo/issues/11726) - Original iOS scanning bug
