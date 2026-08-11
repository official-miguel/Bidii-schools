/**
 * mobile/app/(auth)/login.tsx
 *
 * Two-step OTP login screen.
 *   Step 1 — Email entry  → requestCode()
 *   Step 2 — Code entry   → verifyCode()
 *             ↳ if requiresSchoolSlug → show slug field, re-submit
 */

import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Mail, Hash, School, ArrowLeft } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { isValidEmail, isValidOtpToken } from "@/lib/supabase/auth";
import { Colors } from "@/constants";

// ── Shared styles ──────────────────────────────────────────────────────────

const inputBase = "bg-paper border border-line rounded-xl px-4 py-3.5 text-base text-ink";

// ── Step 1 — Email ─────────────────────────────────────────────────────────

function EmailStep({ onNext }: { onNext: (email: string) => void }) {
  const { requestCode, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSend() {
    clearError();
    setLocalError(null);
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    await requestCode(trimmed);
    // If no error in store after the call, advance to code step.
    const storeError = useAuth.getState().error;
    if (!storeError) onNext(trimmed);
  }

  const displayError = localError ?? error;

  return (
    <View className="space-y-4">
      <Text className="text-ink text-xl font-semibold mb-1 text-center">
        Sign In
      </Text>
      <Text className="text-slate text-sm text-center mb-4">
        We&apos;ll send a 6-digit code to your email.
      </Text>

      {displayError && (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-2">
          <Text className="text-danger text-sm">{displayError}</Text>
        </View>
      )}

      {/* Email input */}
      <View className="mb-4">
        <Text className="text-slate text-sm font-medium mb-2">Email address</Text>
        <View className="relative">
          <TextInput
            className={inputBase}
            placeholder="you@school.com"
            placeholderTextColor={Colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isLoading}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
        </View>
      </View>

      <TouchableOpacity
        onPress={handleSend}
        disabled={isLoading}
        activeOpacity={0.8}
        className={`rounded-xl py-4 items-center ${isLoading ? "bg-teal/50" : "bg-teal"}`}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-base font-semibold">Send code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Step 2 — Code (+ optional school slug) ────────────────────────────────

function CodeStep({
  email,
  onBack,
}: {
  email:  string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { verifyCode, requestCode, isLoading, error, clearError } = useAuth();

  const [token,      setToken]      = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [needsSlug,  setNeedsSlug]  = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendMsg,  setResendMsg]  = useState<string | null>(null);
  const [resending,  setResending]  = useState(false);

  async function handleVerify() {
    clearError();
    setLocalError(null);

    const trimmedToken = token.trim().replace(/\s/g, "");
    if (!isValidOtpToken(trimmedToken)) {
      setLocalError("Enter the 6-digit code from your email.");
      return;
    }

    const result = await verifyCode(
      email,
      trimmedToken,
      needsSlug ? schoolSlug.trim() : undefined
    );

    if (result?.requiresSchoolSlug) {
      setNeedsSlug(true);
      return;
    }

    const storeError = useAuth.getState().error;
    if (storeError) return; // error displayed from store

    // Success — navigate based on role.
    const role = useAuth.getState().user?.role;
    if      (role === "PRINCIPAL")   router.replace("/(tabs)/dashboard");
    else if (role === "TEACHER")     router.replace("/(tabs)/dashboard");
    else if (role === "ADMIN_STAFF") router.replace("/(tabs)/dashboard");
    else                             router.replace("/(tabs)");
  }

  async function handleResend() {
    setResendMsg(null);
    setResending(true);
    await requestCode(email);
    const storeError = useAuth.getState().error;
    setResendMsg(storeError ?? "A new code has been sent.");
    setResending(false);
  }

  const displayError = localError ?? error;

  return (
    <View className="space-y-4">
      {/* Back button */}
      <TouchableOpacity
        onPress={onBack}
        className="flex-row items-center gap-1.5 mb-2"
        activeOpacity={0.7}
      >
        <ArrowLeft size={14} color={Colors.muted} />
        <Text className="text-slate text-sm">Change email</Text>
      </TouchableOpacity>

      <Text className="text-ink text-xl font-semibold mb-1 text-center">
        Check your email
      </Text>
      <View className="bg-teal/10 rounded-xl px-4 py-3 mb-3">
        <Text className="text-teal text-sm text-center">
          Code sent to <Text className="font-semibold">{email}</Text>
        </Text>
      </View>

      {displayError && (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-2">
          <Text className="text-danger text-sm">{displayError}</Text>
        </View>
      )}
      {resendMsg && (
        <View className="bg-teal/10 rounded-xl p-3 mb-2">
          <Text className="text-teal text-sm">{resendMsg}</Text>
        </View>
      )}

      {/* Token input */}
      <View className="mb-3">
        <Text className="text-slate text-sm font-medium mb-2">6-digit code</Text>
        <TextInput
          className={inputBase + " tracking-[0.3em] text-center text-lg font-bold"}
          placeholder="123456"
          placeholderTextColor={Colors.muted}
          value={token}
          onChangeText={(t) => setToken(t.replace(/\D/g, ""))}
          keyboardType="number-pad"
          maxLength={6}
          editable={!isLoading}
          returnKeyType="go"
          autoComplete="one-time-code"
          onSubmitEditing={handleVerify}
        />
      </View>

      {/* School slug — shown only when multiple schools share this email */}
      {needsSlug && (
        <View className="mb-3">
          <Text className="text-slate text-sm font-medium mb-2">School identifier</Text>
          <TextInput
            className={inputBase}
            placeholder="e.g. greenwood-primary"
            placeholderTextColor={Colors.muted}
            value={schoolSlug}
            onChangeText={setSchoolSlug}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <Text className="text-slate/60 text-xs mt-1.5">
            Your school identifier was provided by your administrator.
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleVerify}
        disabled={isLoading}
        activeOpacity={0.8}
        className={`rounded-xl py-4 items-center ${isLoading ? "bg-teal/50" : "bg-teal"}`}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text className="text-white text-base font-semibold">Sign in</Text>
        )}
      </TouchableOpacity>

      {/* Resend */}
      <View className="flex-row justify-center items-center gap-1 mt-2">
        <Text className="text-slate text-sm">Didn&apos;t receive a code?</Text>
        <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
          <Text className={`text-teal text-sm font-semibold ${resending ? "opacity-50" : ""}`}>
            {resending ? "Sending…" : "Resend"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Root screen ────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [step,  setStep]  = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-teal"
    >
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-8">
          {/* Branding */}
          <View className="items-center mb-10">
            <Text className="text-white text-4xl font-bold mb-2">Bidii</Text>
            <Text className="text-white/80 text-base">School Management System</Text>
          </View>

          {/* Card */}
          <View className="bg-white rounded-2xl p-6 shadow-lg">
            {step === "email" ? (
              <EmailStep
                onNext={(e) => { setEmail(e); setStep("code"); }}
              />
            ) : (
              <CodeStep
                email={email}
                onBack={() => { setStep("email"); useAuth.getState().clearError(); }}
              />
            )}
          </View>

          {/* Footer */}
          <Text className="text-white/60 text-xs text-center mt-8">
            Bidii School Management System{"\n"}© 2026 — All rights reserved
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
