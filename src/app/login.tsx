import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import type { RelativePathString } from 'expo-router';

import AppButton from '@/components/AppButton';
import { ErrorNotice } from '@/components/feedback';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/ui';
import { signIn } from '@/lib/auth';
import { validateEmail } from '@/lib/validation';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await signIn(email.trim(), password);
      if (authError) setError(authError.message);
      else router.replace('/(tabs)');
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Editorial masthead: black mark + wordmark rule */}
      <View style={styles.hero}>
        <View style={styles.masthead}>
          <View style={styles.mark}>
            <UiIcon name="qr" size={22} color={COLORS.textOnPrimary} />
          </View>
          <Text style={styles.wordmark}>QR—ATT</Text>
          <View style={styles.mastRule} />
          <Text style={styles.edition}>01</Text>
        </View>
        <Text style={styles.eyebrow}>QR ATTENDANCE — SIGN IN</Text>
        <Text style={styles.heroTitle}>Welcome{'\n'}back.</Text>
        <Text style={styles.heroSub}>Record attendance in seconds. Just sign in and scan.</Text>
      </View>

      <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <View style={styles.inputWrap}>
              <UiIcon name="mail" size={17} color={COLORS.textSecondary} />
              <TextInput value={email} onChangeText={setEmail} placeholder="you@school.edu" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} autoCapitalize="none" keyboardType="email-address" editable={!loading} />
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrap}>
              <UiIcon name="lock" size={17} color={COLORS.textSecondary} />
              <TextInput value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={COLORS.textSecondary} style={styles.inputInner} secureTextEntry editable={!loading} />
            </View>
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
              <AppButton theme="primary" title="Sign in  →" onPress={handleLogin} fullWidth />
            )}
          </View>

          <Link href={'/register' as RelativePathString} asChild>
            <Pressable style={styles.linkBtn}>
              <Text style={styles.link}>New here? <Text style={styles.linkStrong}>Create account</Text></Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  hero: { paddingHorizontal: 24, paddingTop: 76, paddingBottom: 20, gap: 10 },
  masthead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  mastRule: { flex: 1, height: 1, backgroundColor: COLORS.border },
  edition: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  eyebrow: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  heroTitle: { color: COLORS.textPrimary, fontSize: 44, fontWeight: '800', letterSpacing: -1.2, lineHeight: 46 },
  heroSub: { color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, maxWidth: 280 },
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
});
