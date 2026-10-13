import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { COLORS } from '@/constants/colors';
import { StatusIcon } from '@/components/StatusIcon';

export type ToastData = { id: number; success: boolean; title: string; detail?: string } | null;

// Real-time toast: slides down over the camera on every scan result,
// auto-dismisses so the scanner is never blocked.
export function Toast({ toast }: { toast: ToastData }) {
  const slide = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slide, { toValue: -80, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }, 3200);
    return () => clearTimeout(timer);
  }, [toast, slide, opacity]);

  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.toast,
        toast.success ? styles.toastSuccess : styles.toastError,
        { transform: [{ translateY: slide }], opacity },
      ]}>
      <View style={styles.iconWrap}>
        <StatusIcon status={toast.success ? 'present' : 'absent'} size={20} />
      </View>
      <Text style={styles.toastTitle} numberOfLines={2}>
        {toast.title}
      </Text>
      {toast.detail ? (
        <Text style={styles.toastDetail} numberOfLines={1}>
          {toast.detail}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 56,
    left: 20,
    right: 20,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  toastSuccess: { backgroundColor: '#064E3B', borderColor: COLORS.accent },
  toastError: { backgroundColor: '#450A0A', borderColor: COLORS.danger },
  toastIcon: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  iconWrap: { backgroundColor: '#FFFFFF', borderRadius: 999, padding: 2 },
  toastTitle: { flex: 1, color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  toastDetail: { color: '#E4E4E7', fontSize: 12 },
});
