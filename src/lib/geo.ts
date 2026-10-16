// Location verification (geofence) for Smart Attendance.
//
// Teachers optionally set a check-in area on an event (geofence centre +
// radius). At check-in the student's GPS position is verified against that
// fence BEFORE attendance is recorded. Uses expo-location (works in Expo Go
// and in development builds) and degrades to an explicit "unavailable"
// verdict — never a crash — when permission or hardware is missing.

import type { CloudEvent } from '@/lib/events';

export type Geofence = {
  lat: number;
  lng: number;
  radiusM: number;
};

export type LocationVerificationStatus =
  | 'verified' // inside the fence (or no fence to check)
  | 'not_required' // event has no geofence
  | 'outside' // further from the venue than the radius allows
  | 'unavailable' // permission denied / GPS timeout / unsupported platform
  | 'mocked'; // Android reported a mock/fake location

export type LocationVerification = {
  status: LocationVerificationStatus;
  /** Metres from the fence centre — present whenever a fence exists. */
  distanceM?: number;
  radiusM?: number;
  accuracyM?: number;
  lat?: number;
  lng?: number;
  /** Android only: true when the OS reports a simulated location. */
  mocked?: boolean;
  /** Human-readable reason when status is not verified/not_required. */
  message?: string;
};

/** Hard cap so a stuck GPS fix never hangs the check-in flow. */
const LOCATION_TIMEOUT_MS = 12_000;

/** Extract the geofence from an event, or null when none is configured. */
export function geofenceFromEvent(event: Pick<CloudEvent, 'geofence' | 'geofenceRadiusM'>): Geofence | null {
  const fence = event.geofence;
  if (!fence) return null;
  const radius = Number(event.geofenceRadiusM);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return { lat: fence.lat, lng: fence.lng, radiusM: radius };
}

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function unavailable(message: string): LocationVerification {
  return { status: 'unavailable', message };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Location request timed out.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Verify the device is inside the event's geofence.
 * Events without a geofence return `not_required` without touching GPS.
 */
export async function verifyEventLocation(event: Pick<CloudEvent, 'geofence' | 'geofenceRadiusM'>): Promise<LocationVerification> {
  const fence = geofenceFromEvent(event);
  if (!fence) return { status: 'not_required' };

  let Location: typeof import('expo-location');
  try {
    Location = await import('expo-location');
  } catch {
    return unavailable('Location services are not available on this device.');
  }

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return unavailable('Location permission is required to check in at this venue.');
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_TIMEOUT_MS,
    );

    const { latitude, longitude, accuracy } = position.coords;
    const distanceM = haversineMeters({ lat: latitude, lng: longitude }, { lat: fence.lat, lng: fence.lng });
    const base: LocationVerification = {
      status: 'verified',
      distanceM,
      radiusM: fence.radiusM,
      accuracyM: accuracy ?? undefined,
      lat: latitude,
      lng: longitude,
      mocked: position.mocked ?? false,
    };

    // Android: a simulated GPS position must never count as on-site.
    if (position.mocked) {
      return {
        ...base,
        status: 'mocked',
        message: 'Fake location detected — turn off mock locations to check in.',
      };
    }

    if (distanceM > fence.radiusM) {
      return {
        ...base,
        status: 'outside',
        message: `You are ${Math.round(distanceM)} m from the venue (limit ${Math.round(fence.radiusM)} m).`,
      };
    }

    return base;
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    return unavailable(`Could not read your location.${detail}`);
  }
}

/** One-shot helper for teachers: "use my current location" for a geofence. */
export async function captureCurrentLocation(): Promise<
  { lat: number; lng: number; accuracyM?: number } | { error: string }
> {
  let Location: typeof import('expo-location');
  try {
    Location = await import('expo-location');
  } catch {
    return { error: 'Location services are not available on this device.' };
  }
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { error: 'Location permission is required to set the check-in area.' };
    }
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_TIMEOUT_MS,
    );
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy ?? undefined,
    };
  } catch {
    return { error: 'Could not read your location. Try again outdoors or set the area manually.' };
  }
}
