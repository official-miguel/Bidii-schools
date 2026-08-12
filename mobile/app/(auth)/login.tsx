/**
 * mobile/app/(auth)/login.tsx
 *
 * Single-step login screen — email/phone + password.
 *
 * First-login flow:
 *   • Teacher's initial password is the school username (e.g. "kianyaga").
 *   • After successful login with mustChangePassword=true, a SetPasswordScreen
 *     is shown inline before navigating to the dashboard.
 *   • The API blocks using the school username as the new password.
 *
 * Multi-school:
 *   • If the same email exists at multiple schools, the API returns
 *     requiresSchoolSlug=true and a school username field appears.
 */

import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Eye, EyeOff, School, CheckCircle } from "lucide-react-native";
import { useAuth } from "@/lib/auth";
import { Colors } from "@/constants";

// ── Shared ─────────────────────────────────────────────────────────────────

const inputBase =
  "bg-paper border border-line rounded-xl px-4 py-3.5 text-base text-ink";

// ── Login screen ───────────────────────────────────────────────────────────

function LoginStep({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const { login, isLoading, error, clearError } = useAuth();

  const [identifier,  setIdentifier]  = useState("");
  const [password,    setPassword]    = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [schoolSlug,  setSchoolSlug]  = useState("");
  const [needsSlug,   setNeedsSlug]   = useState(false);
  const [localError,  setLocalError]  = useState<string | null>(null);

  async function handleLogin() {
    clearError();
    setLocalError(null);

    const trimId   = identifier.trim().toLowerCase();
    const trimPwd  = password.trim();
    const trimSlug = schoolSlug.trim().replace(/^@/, "");

    if (!trimId)  { setLocalError("Enter your email address or phone number."); return; }
    if (!trimPwd) { setLocalError("Enter your password."); return; }

    const result = await login(trimId, trimPwd, needsSlug ? trimSlug : undefined);

    if (result?.requiresSchoolSlug) {
      setNeedsSlug(true);
      setLocalError("Your account is linked to more than one school. Enter your school username.");
      return;
    }

    const { user } = useAuth.getState();
    if (!user) return; // error already set in store

    onLoginSuccess();
  }

  const displayError = localError ?? error;

  return (
    <View className="space-y-4">
      <Text className="text-ink text-xl font-semibold mb-1 text-center">Sign In</Text>
      <Text className="text-slate text-sm text-center mb-4">
        Enter your email or phone number and password.
      </Text>

      {displayError && (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-2">
          <Text className="text-danger text-sm">{displayError}</Text>
        </View>
      )}

      {/* Identifier */}
      <View className="mb-3">
        <Text className="text-slate text-sm font-medium mb-2">Email or phone number</Text>
        <TextInput
          className={inputBase}
          placeholder="you@school.com or 07xxxxxxxx"
          placeholderTextColor={Colors.muted}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!isLoading}
          returnKeyType="next"
        />
      </View>

      {/* Password */}
      <View className="mb-3">
        <Text className="text-slate text-sm font-medium mb-2">Password</Text>
        <View className="relative">
          <TextInput
            className={`${inputBase} pr-12`}
            placeholder="Your password"
            placeholderTextColor={Colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity
            onPress={() => setShowPwd((v) => !v)}
            className="absolute right-3 top-3.5"
            activeOpacity={0.7}
          >
            {showPwd
              ? <EyeOff size={18} color={Colors.muted} />
              : <Eye    size={18} color={Colors.muted} />}
          </TouchableOpacity>
        </View>
        <Text className="text-slate/70 text-xs mt-1.5">
          First login? Use your school&apos;s username as the password.
        </Text>
      </View>

      {/* School username — only shown when same email exists at multiple schools */}
      {needsSlug && (
        <View className="mb-3">
          <Text className="text-slate text-sm font-medium mb-2">School username</Text>
          <View className="flex-row items-center gap-2">
            <School size={16} color={Colors.muted} />
            <TextInput
              className={`${inputBase} flex-1`}
              placeholder="e.g. kianyaga"
              placeholderTextColor={Colors.muted}
              value={schoolSlug}
              onChangeText={setSchoolSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>
          <Text className="text-slate/70 text-xs mt-1.5">
            Your school username was shared by your administrator.
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleLogin}
        disabled={isLoading}
        activeOpacity={0.8}
        className={`rounded-xl py-4 items-center mt-2 ${isLoading ? "bg-teal/50" : "bg-teal"}`}
      >
        {isLoading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text className="text-white text-base font-semibold">Sign in</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Set-password screen (first login) ──────────────────────────────────────

function SetPasswordStep({ onDone }: { onDone: () => void }) {
  const { setPassword, isLoading, error, clearError } = useAuth();

  const [newPwd,     setNewPwd]     = useState("");
  const [confirm,    setConfirm]    = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showCfm,    setShowCfm]    = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  const reqs = [
    { label: "At least 8 characters", met: newPwd.length >= 8    },
    { label: "One uppercase letter",  met: /[A-Z]/.test(newPwd)  },
    { label: "One number",            met: /[0-9]/.test(newPwd)  },
  ];
  const allMet       = reqs.every((r) => r.met);
  const pwdMatch     = newPwd === confirm && confirm.length > 0;
  const canSubmit    = allMet && pwdMatch && !isLoading;
  const displayError = localError ?? error;

  async function handleSet() {
    clearError();
    setLocalError(null);
    if (!allMet)   { setLocalError("Password does not meet requirements."); return; }
    if (!pwdMatch) { setLocalError("Passwords do not match."); return; }

    const ok = await setPassword(newPwd);
    if (ok) {
      setSuccess(true);
      setTimeout(onDone, 1200);
    }
  }

  if (success) {
    return (
      <View className="items-center py-8 gap-3">
        <CheckCircle size={48} color="#17B26A" />
        <Text className="text-ink font-semibold text-base">Password set!</Text>
        <Text className="text-slate text-sm">Taking you to your dashboard…</Text>
      </View>
    );
  }

  return (
    <View className="space-y-4">
      <Text className="text-ink text-xl font-semibold mb-1 text-center">Set your password</Text>
      <Text className="text-slate text-sm text-center mb-1">
        You signed in with your school&apos;s username. Choose a personal password — it cannot be the school username.
      </Text>

      {displayError && (
        <View className="bg-danger/10 border border-danger/30 rounded-xl p-3 mb-2">
          <Text className="text-danger text-sm">{displayError}</Text>
        </View>
      )}

      {/* New password */}
      <View className="mb-3">
        <Text className="text-slate text-sm font-medium mb-2">New password</Text>
        <View className="relative">
          <TextInput
            className={`${inputBase} pr-12`}
            placeholder="Choose a strong password"
            placeholderTextColor={Colors.muted}
            value={newPwd}
            onChangeText={(v) => { setNewPwd(v); setLocalError(null); }}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
          />
          <TouchableOpacity onPress={() => setShowNew((v) => !v)} className="absolute right-3 top-3.5" activeOpacity={0.7}>
            {showNew ? <EyeOff size={18} color={Colors.muted} /> : <Eye size={18} color={Colors.muted} />}
          </TouchableOpacity>
        </View>
        {/* Requirements */}
        <View className="mt-2 gap-1">
          {reqs.map((r) => (
            <View key={r.label} className="flex-row items-center gap-1.5">
              <CheckCircle size={12} color={r.met ? "#17B26A" : "#CBD5E1"} />
              <Text className={`text-xs ${r.met ? "text-success" : "text-slate"}`}>{r.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Confirm */}
      <View className="mb-3">
        <Text className="text-slate text-sm font-medium mb-2">Confirm password</Text>
        <View className="relative">
          <TextInput
            className={`${inputBase} pr-12`}
            placeholder="Re-enter your new password"
            placeholderTextColor={Colors.muted}
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setLocalError(null); }}
            secureTextEntry={!showCfm}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            onSubmitEditing={handleSet}
          />
          <TouchableOpacity onPress={() => setShowCfm((v) => !v)} className="absolute right-3 top-3.5" activeOpacity={0.7}>
            {showCfm ? <EyeOff size={18} color={Colors.muted} /> : <Eye size={18} color={Colors.muted} />}
          </TouchableOpacity>
        </View>
        {confirm.length > 0 && (
          <Text className={`text-xs mt-1.5 ${pwdMatch ? "text-success" : "text-danger"}`}>
            {pwdMatch ? "Passwords match." : "Passwords do not match."}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={handleSet}
        disabled={!canSubmit}
        activeOpacity={0.8}
        className={`rounded-xl py-4 items-center mt-2 ${!canSubmit ? "bg-teal/40" : "bg-teal"}`}
      >
        {isLoading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text className="text-white text-base font-semibold">Set password &amp; continue</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Root screen ────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const router = useRouter();
  const [step, setStep] = useState<"login" | "set-password">("login");

  function handleLoginDone() {
    const currentUser = useAuth.getState().user;
    if (currentUser?.mustChangePassword) {
      setStep("set-password");
    } else {
      router.replace("/(tabs)/dashboard");
    }
  }

  function handlePasswordSet() {
    router.replace("/(tabs)/dashboard");
  }

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
            {step === "login" ? (
              <LoginStep onLoginSuccess={handleLoginDone} />
            ) : (
              <SetPasswordStep onDone={handlePasswordSet} />
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
