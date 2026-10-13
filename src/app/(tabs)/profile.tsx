import type { RelativePathString } from 'expo-router';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UiIcon } from '@/components/UiIcon';
import { COLORS } from '@/constants/colors';
import { RADIUS, SHADOW } from '@/constants/ui';
import { signOut, useAuth } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const nextProfile = await getProfile(user.id);
    setProfile(nextProfile);
    setDraftName(nextProfile?.full_name ?? '');
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  const handleSignOut = async () => {
    setLoading(true);
    await signOut();
    router.replace('/login' as RelativePathString);
  };

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await updateProfile(user.id, { full_name: draftName.trim() });
    setSaving(false);
    if (error) {
      Alert.alert('Error', error);
      return;
    }
    setProfile((current) => current ? { ...current, full_name: draftName.trim() } : current);
    setEditing(false);
  };

  const initial = (profile?.full_name ?? user?.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      <ScreenHeader index="05" eyebrow="ACCOUNT" title="My profile" subtitle="Your identity across every check-in." />
      {/* Ledger identity card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Text style={styles.heroIndex}>ID — {(profile?.role ?? 'student').toUpperCase()}</Text>
          <View style={styles.roleDot} />
        </View>
        <View style={styles.heroMain}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>
              {profile?.full_name || 'Add your name'}
            </Text>
            <Text style={styles.identityEmail} numberOfLines={1}>{user?.email ?? ''}</Text>
          </View>
        </View>
        <View style={styles.heroFoot}>
          <UiIcon name={profile?.role === 'teacher' ? 'school' : profile?.role === 'admin' ? 'shield' : 'user'} size={13} color="#FFFFFF" />
          <Text style={styles.roleBadgeText}>{profile?.role ?? 'student'}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowIndex}>01</Text>
          <UiIcon name="user" size={16} color={COLORS.textSecondary} />
          <Text style={styles.label}>NAME</Text>
        </View>
        {editing ? (
          <View style={styles.nameEditRow}>
            <TextInput value={draftName} onChangeText={setDraftName} style={styles.nameInput} placeholder="Your name" placeholderTextColor={COLORS.textSecondary} editable={!saving} />
            <Pressable onPress={handleSaveName} disabled={saving} style={styles.saveButton} accessibilityRole="button">
              <Text style={styles.saveButtonText}>{saving ? '…' : 'Save'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)} style={styles.nameRow} accessibilityRole="button">
            <Text style={styles.value}>{profile?.full_name || 'Tap to add your name'}</Text>
            <View style={styles.editPill}>
              <Text style={styles.editHint}>EDIT</Text>
            </View>
          </Pressable>
        )}
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowIndex}>02</Text>
          <UiIcon name="mail" size={16} color={COLORS.textSecondary} />
          <Text style={styles.label}>EMAIL</Text>
        </View>
        <Text style={styles.value}>{user?.email ?? 'Unknown account'}</Text>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowIndex}>03</Text>
          <UiIcon name="shield" size={16} color={COLORS.textSecondary} />
          <Text style={styles.label}>USER ID</Text>
        </View>
        <Text style={styles.id} numberOfLines={1}>{user?.id ?? 'Not available'}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.primary} />
      ) : (
        <AppButton title="Sign out" variant="danger" fullWidth onPress={handleSignOut} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 20, paddingTop: 24 },
  heroCard: {
    backgroundColor: COLORS.primaryDeep,
    borderRadius: RADIUS.xl,
    padding: 18,
    marginBottom: 14,
    gap: 14,
    ...SHADOW.pop,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroIndex: { color: '#FFFFFF99', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, fontFamily: 'monospace' },
  roleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.primary, fontSize: 24, fontWeight: '800' },
  identityText: { flex: 1, gap: 3 },
  identityName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  identityEmail: { color: '#D6D3D1', fontSize: 13, fontWeight: '500' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#FFFFFF22', paddingTop: 12 },
  roleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 18, marginBottom: 20, gap: 8, borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowIndex: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  label: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  value: { color: COLORS.textPrimary, fontSize: 16, flex: 1, fontWeight: '600' },
  id: { color: COLORS.textSecondary, fontSize: 11, fontFamily: 'monospace' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40 },
  editPill: { borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  nameInput: { flex: 1, minHeight: 50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.card, color: COLORS.textPrimary, paddingHorizontal: 12 },
  saveButton: { backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingHorizontal: 20, minHeight: 50, justifyContent: 'center' },
  saveButtonText: { color: COLORS.textOnPrimary, fontWeight: '700', fontSize: 13 },
  editHint: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
});
