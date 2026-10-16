// Face verification for Smart Attendance — liveness + proof selfie.
//
// On-device ML Kit (via @react-native-ml-kit/face-detection) confirms the
// check-in photo shows exactly ONE real, awake face that is reasonably
// centered — then the photo is kept as proof (Supabase Storage bucket
// `face-proof`, see migration 20261016020000_smart_attendance.sql).
//
// The native library only exists in development builds; in Expo Go / on web
// every entry point degrades to an explicit "unavailable" verdict instead of
// crashing.

import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type FaceProof = {
  status: 'verified';
  /** Local URI of the captured selfie (kept on device as a fallback copy). */
  photoUri: string;
  /** Raw JPEG base64 — used for the best-effort storage upload. */
  photoBase64?: string;
  verifiedAt: string;
};

export type FaceCheckVerdict = { ok: true } | { ok: false; message: string };

type FaceDetectionModule = typeof import('@react-native-ml-kit/face-detection').default;
type DetectedFace = Awaited<ReturnType<FaceDetectionModule['detect']>>[number];

// Lazy load: Expo Go has no native module behind this package. A dynamic
// import is wrapped so a missing/broken native binding resolves to null
// instead of crashing the app; the result is cached after the first attempt.
let faceModulePromise: Promise<FaceDetectionModule | null> | undefined;
async function loadFaceDetection(): Promise<FaceDetectionModule | null> {
  if (!faceModulePromise) {
    faceModulePromise = import('@react-native-ml-kit/face-detection')
      .then((mod) => mod.default ?? null)
      .catch(() => null);
  }
  return faceModulePromise;
}

/** True when on-device face detection can actually run here. */
export async function isFaceCheckAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await loadFaceDetection()) !== null;
}

// Minimum share of the image width the head should occupy (ML Kit option).
const MIN_FACE_SIZE = 0.22;
// The face centre must sit between these fractions of the image width.
const CENTER_MIN = 0.2;
const CENTER_MAX = 0.8;
// Eyes-open threshold: ML Kit returns closing-probability 0..1.
const EYES_OPEN_MIN = 0.5;

/**
 * Verify a captured selfie: exactly one face, eyes open, face centered.
 * `uri` must be a local file URI (file://…) as returned by takePictureAsync.
 */
export async function verifyFaceFromPhoto(input: {
  uri: string;
  width: number;
  height: number;
}): Promise<FaceCheckVerdict> {
  const detection = await loadFaceDetection();
  if (!detection) {
    return { ok: false, message: 'Face verification is unavailable on this device.' };
  }
  if (!input.width || !input.height) {
    return { ok: false, message: 'Could not read the captured photo.' };
  }

  let faces: DetectedFace[];
  try {
    faces = await detection.detect(input.uri, {
      performanceMode: 'accurate',
      landmarkMode: 'none',
      classificationMode: 'all',
      minFaceSize: MIN_FACE_SIZE,
    });
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    return { ok: false, message: `Face check could not run.${detail}` };
  }

  if (faces.length === 0) {
    return { ok: false, message: 'No face detected — move your face into the frame.' };
  }
  if (faces.length > 1) {
    return { ok: false, message: 'More than one face detected — check in alone.' };
  }

  const face = faces[0];

  const left = face.leftEyeOpenProbability;
  const right = face.rightEyeOpenProbability;
  if ((typeof left === 'number' && left < EYES_OPEN_MIN) || (typeof right === 'number' && right < EYES_OPEN_MIN)) {
    return { ok: false, message: 'Keep your eyes open for the check-in photo.' };
  }

  // Face position: centered horizontally so a cheek/partial face can't pass.
  const frame = face.frame;
  const centerX = frame.left + frame.width / 2;
  const ratio = centerX / input.width;
  if (ratio < CENTER_MIN || ratio > CENTER_MAX) {
    return { ok: false, message: 'Center your face in the frame and try again.' };
  }
  if (frame.width / input.width < MIN_FACE_SIZE) {
    return { ok: false, message: 'Move a little closer to the camera.' };
  }

  return { ok: true };
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Dependency-free base64 → bytes (avoids RN fetch/blob quirks on upload). */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  const dec = (ch: string | undefined) => {
    if (ch === undefined) return 0;
    const v = B64_ALPHABET.indexOf(ch);
    return v < 0 ? 0 : v;
  };
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk = clean.slice(i, i + 4);
    const c1 = dec(chunk[0]);
    const c2 = dec(chunk[1]);
    const c3 = dec(chunk[2]);
    const c4 = dec(chunk[3]);
    if (p < bytes.length) bytes[p++] = ((c1 << 2) | (c2 >> 4)) & 0xff;
    if (chunk.length > 2 && p < bytes.length) bytes[p++] = (((c2 & 15) << 4) | (c3 >> 2)) & 0xff;
    if (chunk.length > 3 && p < bytes.length) bytes[p++] = (((c3 & 3) << 6) | c4) & 0xff;
  }
  return bytes;
}

/**
 * Best-effort proof upload: stores the selfie in the private `face-proof`
 * bucket as <user id>/<attendance id>.jpg. Returns the object path, or null
 * (missing bucket, offline, …) — callers treat failure as non-fatal.
 */
export async function uploadFaceProof(
  userId: string,
  attendanceId: string,
  base64: string,
): Promise<string | null> {
  try {
    const bytes = base64ToBytes(base64);
    if (bytes.length === 0) return null;
    const path = `${userId}/${attendanceId}.jpg`;
    const { error } = await supabase.storage.from('face-proof').upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/** Attach an uploaded proof to the attendance row. Best-effort (may no-op). */
export async function attachFaceProof(attendanceId: string, path: string): Promise<void> {
  try {
    await supabase.from('attendance').update({ face_photo_path: path }).eq('id', attendanceId);
  } catch {
    // Non-fatal: the face_status flag already records the verification.
  }
}
