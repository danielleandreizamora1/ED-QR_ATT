import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';

import AppButton from '@/components/AppButton';
import { ErrorNotice, SuccessNotice } from '@/components/feedback';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/ui';
import { signUp } from '@/lib/auth';
import { sanitize, validateEmail, validatePassword, validateRequired } from '@/lib/validation';

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);
    const nameError = validateRequired(fullName, 'Full name', 100);
    if (nameError) return setError(nameError);
    const emailError = validateEmail(email);
    if (emailError) return setError(emailError);
    const passwordError = validatePassword(password);
    if (passwordError) return setError(passwordError);
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setLoading(true);
    try {
      const { data, error: authError } = await signUp(email.trim(), password, {
        full_name: sanitize(fullName, 100),
        role,
      });
      if (authError) setError(authError.message);
      else if (data.session) router.replace('/(tabs)');
      else setSuccess(true);
    } catch {
      setError('Unable to create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={styles.masthead}>
          <View style={styles.mark}>
            <UiIcon name="qr" size={22} color={COLORS.textOnPrimary} />
          </View>
          <Text style={styles.wordmark}>QR—ATT</Text>
          <View style={styles.mastRule} />
          <Text style={styles.edition}>02</Text>
        </View>
        <Text style={styles.eyebrow}>QR ATTENDANCE — REGISTER</Text>
        <Text style={styles.heroTitle}>Create{'\n'}account.</Text>
        <Text style={styles.heroSub}>One account for check-ins, events and reports.</Text>
      </View>

      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          {success ? (
            <>
              <SuccessNotice title="Check your email" detail="Confirm your account, then return to sign in." />
              <View style={styles.btnWrap}>
                <AppButton title="Back to sign in" variant="secondary" fullWidth onPress={() => router.replace('/login' as RelativePathString)} />
              </View>
            </>
          ) : (
            <>
              <Field label="FULL NAME" icon="user">
                <TextInput value={fullName} onChangeText={setFullName} placeholder="Your name" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} autoCapitalize="words" editable={!loading} />
              </Field>
              <Field label="EMAIL" icon="mail">
                <TextInput value={email} onChangeText={setEmail} placeholder="you@school.edu" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} autoCapitalize="none" keyboardType="email-address" editable={!loading} />
              </Field>
              <Field label="PASSWORD" icon="lock">
                <TextInput value={password} onChangeText={setPassword} placeholder="At least 6 characters" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} secureTextEntry editable={!loading} />
              </Field>
              <Field label="CONFIRM PASSWORD" icon="lock">
                <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat your password" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} secureTextEntry editable={!loading} />
              </Field>
              <View style={styles.field}>
                <Text style={styles.label}>I AM A…</Text>
                <View style={styles.roleRow}>
                  {(['student', 'teacher'] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setRole(option)}
                      style={[styles.roleChip, role === option && styles.roleChipActive]}
                      disabled={loading}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: role === option }}
                    >
                      <Text style={[styles.roleChipText, role === option && styles.roleChipTextActive]}>
                        {option === 'student' ? 'Student' : 'Teacher'}
                      </Text>
                      <Text style={styles.roleIndex}>{option === 'student' ? '01' : '02'}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.roleHint}>Admin accounts are granted by an administrator — not self-registered.</Text>
              </View>
              {error && (
                <View style={styles.errorWrap}>
                  <ErrorNotice message={error} />
                </View>
              )}
              <View style={styles.btnWrap}>
                {loading ? (
                  <ActivityIndicator color={COLORS.primary} size="large" />
                ) : (
                  <AppButton theme="primary" title="Sign up  →" onPress={handleRegister} fullWidth />
                )}
              </View>
            </>
          )}
          <Link href={'/login' as RelativePathString} asChild>
            <Pressable style={styles.linkBtn}>
              <Text style={styles.link}>Already have an account? <Text style={styles.linkStrong}>Sign in</Text></Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, icon, children }: { label: string; icon: 'user' | 'mail' | 'lock'; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <UiIcon name={icon} size={17} color={COLORS.textSecondary} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  hero: { paddingHorizontal: 24, paddingTop: 68, paddingBottom: 20, gap: 10 },
  masthead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  mastRule: { flex: 1, height: 1, backgroundColor: COLORS.border },
  edition: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  eyebrow: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  heroTitle: { color: COLORS.textPrimary, fontSize: 44, fontWeight: '800', letterSpacing: -1.2, lineHeight: 46 },
  heroSub: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22 },
  sheetWrap: { flex: 1 },
  sheet: {
    flexGrow: 1,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
  },
  field: { gap: 8 },
  label: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
  },
  inputInner: { flex: 1, color: COLORS.textPrimary, fontSize: 16, paddingVertical: 12 },
  errorWrap: { marginTop: 4 },
  btnWrap: { marginTop: 8 },
  linkBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  link: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  linkStrong: { color: COLORS.textPrimary, fontWeight: '800', textDecorationLine: 'underline' },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    minHeight: 64,
    backgroundColor: COLORS.card,
  },
  roleChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  roleChipText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 12 },
  roleChipTextActive: { color: COLORS.textOnPrimary, fontWeight: '800' },
  roleHint: { color: COLORS.textSecondary, fontSize: 12 },
  roleIndex: { color: COLORS.textSecondary, fontSize: 10, fontFamily: 'monospace' },
});
