# How to Rebuild the iOS App After QR Scanner Fix

## Why You Need to Rebuild

The changes made to fix iOS QR scanning require a **native rebuild**. Simply reloading the app or hot-reloading will NOT work because:

1. We changed the `app.json` configuration (added `barcodeScannerEnabled: true`)
2. Native iOS modules need to be recompiled
3. Camera permissions need to be reconfigured at the native level

## Prerequisites

Make sure you have:
- macOS computer (required for iOS development)
- Xcode installed (download from Mac App Store)
- iOS device or simulator
- Expo CLI installed

## Option 1: Development Build (Recommended for Testing)

### Step 1: Navigate to mobile directory
```bash
cd mobile
```

### Step 2: Clear cache and install dependencies
```bash
rm -rf node_modules
npm install
```

### Step 3: Prebuild native projects
```bash
npx expo prebuild --clean
```

This will generate iOS and Android native folders with the updated configuration.

### Step 4: Run on iOS
```bash
# For physical device (recommended)
npx expo run:ios --device

# OR for simulator
npx expo run:ios
```

This will:
- Build the native iOS app
- Install it on your device/simulator
- Start the Metro bundler
- Launch the app automatically

### Step 5: Test the QR scanner
1. Open the app on your iPhone
2. Navigate to the Scan tab or use the scanner in Circulation
3. Point the camera at a QR code
4. Check the console for debug logs (they'll show if barcode is detected)

---

## Option 2: EAS Build (For Production/Distribution)

If you're using Expo Application Services (EAS):

### Step 1: Install EAS CLI (if not already)
```bash
npm install -g eas-cli
eas login
```

### Step 2: Build for iOS
```bash
cd mobile

# Development build
eas build --platform ios --profile development

# OR Production build
eas build --platform ios --profile production
```

### Step 3: Install the build
After the build completes, EAS will provide:
- A download link
- QR code to install on device

---

## Option 3: Expo Go (Quick Test - Limited)

**Note:** Expo Go has limitations and may not support all native features.

```bash
cd mobile
npx expo start
```

Then scan the QR code with Expo Go app on your iPhone.

**Warning:** If this doesn't work, you MUST use Option 1 or 2 because Expo Go doesn't support custom native configurations.

---

## Troubleshooting

### Build fails with "Command PhaseScriptExecution failed"
```bash
cd ios
pod deintegrate
pod install
cd ..
npx expo run:ios --device
```

### "No devices found"
Make sure:
- iPhone is connected via USB
- iPhone is unlocked
- Trust this computer on iPhone
- Developer Mode is enabled (Settings → Privacy & Security → Developer Mode)

### "Unable to boot simulator"
```bash
xcrun simctl list devices
# Find your simulator and its UDID, then:
xcrun simctl boot <UDID>
```

### Permission errors
```bash
sudo xcode-select --reset
sudo xcodebuild -license accept
```

### Camera permission not appearing
1. Delete the app from your iPhone
2. Rebuild and reinstall
3. The permission prompt should appear on first launch

---

## Verifying the Fix

After rebuilding, you should see:

1. **Console logs when scanning:**
   ```
   [QR Scanner] Barcode detected: { type: 'qr', data: 'BIDII:BOOK:ACC-001', timestamp: '...' }
   ```

2. **Immediate response:** QR code is recognized within 1 second

3. **Consistent behavior:** Works across all scanner screens (Scan tab, Scan modal, Circulation)

---

## Files Changed (For Reference)

The following files were modified in the fix:

1. `mobile/app.json` - Added `barcodeScannerEnabled: true`
2. `mobile/app/(tabs)/scan.tsx` - Simplified barcode types to ['qr']
3. `mobile/app/scan-modal.tsx` - Simplified barcode types to ['qr']
4. `mobile/app/(tabs)/circulate.tsx` - Simplified barcode types to ['qr']

All changes also include debug logging to help diagnose issues.

---

## Quick Commands Reference

```bash
# Full clean rebuild
cd mobile
rm -rf node_modules ios android .expo
npm install
npx expo prebuild --clean
npx expo run:ios --device

# Just rebuild without cleaning
cd mobile
npx expo run:ios --device

# Check expo environment
npx expo-doctor

# View logs
npx react-native log-ios
```

---

## Need Help?

If you're still having issues after rebuilding:

1. Check the troubleshooting guide: `IOS-SCANNING-TROUBLESHOOTING.md`
2. Check console logs for "[QR Scanner]" messages
3. Verify camera permissions in iPhone Settings
4. Try on a different iPhone to isolate device-specific issues
5. Create a minimal test app to verify expo-camera works on your setup

---

## Expected Timeline

- **Development build:** 5-10 minutes
- **EAS build:** 15-30 minutes (cloud build time)
- **Testing:** 5 minutes

Total: ~20-45 minutes depending on build method
