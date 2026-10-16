import { useCallback, useEffect, useRef, useState } from 'react';

import {
  prepareCheckIn,
  registerAttendance,
  type PreparedCheckIn,
  type RegisterResult,
} from '@/lib/attendance';
import { useAuth } from '@/lib/auth';
import type { FaceProof } from '@/lib/face';

/** Face gate state — non-null while the face sheet must be open. */
export type FaceGate = {
  /** Event that is waiting on the face check (shown in the sheet header). */
  eventTitle: string;
  /** Sheet passed liveness + proof capture: continue the check-in. */
  onVerified: (proof: FaceProof) => void;
  /** Sheet dismissed without a verified selfie: report and stop. */
  onCancel: (reason?: string) => void;
};

/** Called exactly once per attempt with the final outcome. */
export type CheckInResultHandler = (
  result: RegisterResult,
  rawPayload: string,
) => void | Promise<void>;

type PreparedOk = Extract<PreparedCheckIn, { ok: true }>;

const CONNECTION_ERROR = 'Could not connect to attendance service. Try again.';

/**
 * Shared two-stage Smart Attendance check-in, used by every check-in surface
 * (Scan tab, universal attend link):
 *
 *   start(raw)
 *     → prepareCheckIn: auth/role, QR shape, event, open state, time window,
 *       geofence — fails fast BEFORE any camera/photo step.
 *     → when the event requires a face check, the face gate opens and the
 *       registration waits for its proof (cancel reports a plain failure).
 *     → registerAttendance(with location/event/face context) records the row.
 *
 * The sheet itself is rendered by the screen from `faceGate`; the hook only
 * owns the sequencing, so every surface behaves identically.
 */
export function useCheckInFlow(onResult: CheckInResultHandler): {
  busy: boolean;
  faceGate: FaceGate | null;
  start: (rawPayload: string) => Promise<void>;
} {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [faceGate, setFaceGate] = useState<FaceGate | null>(null);

  // Avoid setState after unmount; handlers are read through a ref so the
  // screen never has to memoize its onResult callback.
  const aliveRef = useRef(true);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const deliver = useCallback(
    async (result: RegisterResult, rawPayload: string) => {
      if (aliveRef.current) setBusy(false);
      await onResultRef.current(result, rawPayload);
    },
    [],
  );

  const register = useCallback(
    async (prepared: PreparedOk, face?: FaceProof) => {
      if (!user) {
        await deliver(
          { success: false, message: 'Please log in to record attendance.' },
          prepared.rawPayload,
        );
        return;
      }
      try {
        const result = await registerAttendance(prepared.rawPayload, user.id, {
          location: prepared.location,
          event: prepared.event,
          face,
        });
        await deliver(result, prepared.rawPayload);
      } catch {
        await deliver(
          { success: false, message: CONNECTION_ERROR },
          prepared.rawPayload,
        );
      }
    },
    [deliver, user],
  );

  const start = useCallback(
    async (rawPayload: string) => {
      const raw = rawPayload.trim();
      if (!user) {
        await deliver(
          { success: false, message: 'Please log in to record attendance.' },
          raw,
        );
        return;
      }
      if (aliveRef.current) setBusy(true);

      let prepared: PreparedCheckIn;
      try {
        prepared = await prepareCheckIn(raw, user.id);
      } catch {
        await deliver({ success: false, message: CONNECTION_ERROR }, raw);
        return;
      }

      if (!prepared.ok) {
        await deliver(prepared.result, raw);
        return;
      }

      if (prepared.needsFace) {
        // Pause before recording: the student must pass the face gate first.
        if (!aliveRef.current) return;
        setBusy(false);
        setFaceGate({
          eventTitle: prepared.event.title,
          onVerified: (proof) => {
            setFaceGate(null);
            if (aliveRef.current) setBusy(true);
            void register(prepared, proof);
          },
          onCancel: (reason) => {
            setFaceGate(null);
            void deliver(
              {
                success: false,
                message: reason ?? 'Face check cancelled — attendance was not recorded.',
                eventTitle: prepared.event.title,
                eventCode: prepared.event.event_code,
              },
              raw,
            );
          },
        });
        return;
      }

      await register(prepared);
    },
    [deliver, register, user],
  );

  return { busy, faceGate, start };
}
