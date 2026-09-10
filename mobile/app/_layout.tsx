import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth, migrateTokenToSecureStore } from '@/lib/auth';
import { api } from '@/services';
import { database } from '@/database';
import { ThemeProvider } from '@/lib/ThemeContext';
import '../global.css';

/**
 * Root layout — initialises auth, API, and database before any screen renders.
 *
 * Startup sequence:
 *  1. migrateTokenToSecureStore() — one-time migration: moves any token from
 *     the legacy AsyncStorage location (unencrypted) to SecureStore
 *     (iOS Keychain / Android Keystore). Idempotent — safe to call every launch.
 *  2. init()  — restores the persisted token from SecureStore into the API client.
 *  3. api.init() — secondary API client init (token already set by init).
 */
export default function RootLayout() {
  const { init } = useAuth();

  useEffect(() => {
    (async () => {
      // Step 1: migrate token from AsyncStorage → SecureStore (no-op after first run)
      await migrateTokenToSecureStore();
      // Step 2: restore saved auth token into API client
      await init();
      // Step 3: Initialise API (token already set by init)
      await api.init();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
