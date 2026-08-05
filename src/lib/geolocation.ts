/**
 * Getting a usable location fix out of a browser is not a single call.
 *
 * The first fix a browser hands back is almost always the coarse one — derived
 * from WiFi access points, or from the IP address when there are none (a desktop
 * on ethernet). That fix can be kilometres off, and it is what makes an employee
 * standing in the doorway get told they are 3.6 km away. The precise GPS fix
 * lands a second or two later, so we watch for a short while, keep the best fix
 * seen, and stop as soon as one is accurate enough to decide with.
 *
 * Every fix carries `accuracyM` — the radius of the circle the device believes
 * it is somewhere inside. Callers must weigh it: a 3 km distance measured with a
 * ±5 km fix means nothing at all.
 */

export interface PositionFix {
  lat: number;
  lng: number;
  /** Radius of the uncertainty circle around (lat, lng), in metres. */
  accuracyM: number;
  /** When the device took the fix (epoch ms). */
  takenAt: number;
}

export type GeolocationFailureCode =
  /** The browser has no geolocation API at all. */
  | "unsupported"
  /** Served over plain http from a non-localhost origin — browsers block geolocation. */
  | "insecure_context"
  /** The user (or the OS) refused the permission. */
  | "permission_denied"
  /** No positioning source answered — location services off, no GPS/WiFi. */
  | "unavailable"
  /** Nothing arrived within the time budget. */
  | "timeout";

export class GeolocationFailure extends Error {
  readonly code: GeolocationFailureCode;

  constructor(code: GeolocationFailureCode, message: string) {
    super(message);
    this.name = "GeolocationFailure";
    this.code = code;
  }
}

/** What the employee is told when the fix never arrives — each cause has its own fix. */
export const GEOLOCATION_FAILURE_MESSAGES: Record<GeolocationFailureCode, string> = {
  unsupported: "הדפדפן הזה לא תומך באיתור מיקום. נסו מהנייד.",
  insecure_context: "איתור מיקום פועל רק בחיבור מאובטח (https). פנו למנהל.",
  permission_denied: "הגישה למיקום נחסמה. אשרו הרשאת מיקום לאתר בהגדרות הדפדפן ונסו שוב.",
  unavailable: "לא הצלחנו לקבל מיקום מהמכשיר. ודאו ששירותי המיקום דלוקים ונסו שוב.",
  timeout: "איתור המיקום ארך זמן רב מדי. צאו לאזור פתוח ונסו שוב.",
};

export function geolocationFailureMessage(error: unknown): string {
  if (error instanceof GeolocationFailure) return GEOLOCATION_FAILURE_MESSAGES[error.code];
  return GEOLOCATION_FAILURE_MESSAGES.unavailable;
}

function failureFromBrowser(error: GeolocationPositionError): GeolocationFailure {
  const code =
    error.code === error.PERMISSION_DENIED
      ? "permission_denied"
      : error.code === error.TIMEOUT
        ? "timeout"
        : "unavailable";
  return new GeolocationFailure(code, error.message || code);
}

export interface BestPositionOptions {
  /** Stop early once a fix is at least this accurate (metres). */
  targetAccuracyM?: number;
  /** Hard cap on how long the employee waits (ms). */
  maxWaitMs?: number;
  /** How long to keep waiting for a better fix after the first (coarse) one lands (ms). */
  graceAfterFirstFixMs?: number;
  /** Injected in tests. */
  geolocation?: Pick<Geolocation, "watchPosition" | "clearWatch">;
  /** Injected in tests; defaults to `window.isSecureContext`. */
  secureContext?: boolean;
}

/**
 * Resolve with the most accurate fix seen within the time budget.
 *
 * Rejects with a {@link GeolocationFailure} only when no fix arrived at all — a
 * poor fix still resolves, because the caller (not this helper) decides whether
 * the accuracy is good enough for what it is about to do.
 */
export function getBestPosition(options: BestPositionOptions = {}): Promise<PositionFix> {
  const targetAccuracyM = options.targetAccuracyM ?? 30;
  const maxWaitMs = options.maxWaitMs ?? 8000;
  const geo = options.geolocation ?? (typeof navigator !== "undefined" ? navigator.geolocation : undefined);
  const secure = options.secureContext ?? (typeof window === "undefined" || window.isSecureContext);

  if (!geo) {
    return Promise.reject(new GeolocationFailure("unsupported", "geolocation unavailable"));
  }
  if (!secure) {
    return Promise.reject(new GeolocationFailure("insecure_context", "geolocation requires a secure context"));
  }

  const graceAfterFirstFixMs = options.graceAfterFirstFixMs ?? 3500;
  const deadline = Date.now() + maxWaitMs;

  return new Promise<PositionFix>((resolve, reject) => {
    let best: PositionFix | null = null;
    let lastError: GeolocationFailure | null = null;
    let settled = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      if (watchId !== null) geo.clearWatch(watchId);
      timer = null;
      watchId = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (best) resolve(best);
      // A permission denial that arrives before any fix is the real story; a
      // silent timeout is the fallback.
      else reject(lastError ?? new GeolocationFailure("timeout", "no position within budget"));
    };

    timer = setTimeout(finish, maxWaitMs);

    watchId = geo.watchPosition(
      (pos) => {
        if (settled) return;
        const fix: PositionFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          // Spec says accuracy is always a non-negative number, but a missing or
          // absurd value must not read as "perfectly accurate".
          accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.max(0, pos.coords.accuracy) : Number.POSITIVE_INFINITY,
          takenAt: pos.timestamp,
        };
        const firstFix = best === null;
        if (!best || fix.accuracyM < best.accuracyM) best = fix;
        if (fix.accuracyM <= targetAccuracyM) {
          finish();
          return;
        }
        // A coarse first fix means the GPS is still warming up — but if it never
        // does (a desktop with nothing but an IP address), waiting out the whole
        // budget just leaves the employee staring at a spinner. Give the precise
        // fix a short grace period instead of the full one.
        if (firstFix) {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(finish, Math.max(0, Math.min(deadline - Date.now(), graceAfterFirstFixMs)));
        }
      },
      (error) => {
        if (settled) return;
        const failure = failureFromBrowser(error);
        lastError = failure;
        // A denial never improves, and once we hold a fix there is nothing left
        // to wait for. Anything else can be a transient error while the GPS
        // warms up, so we keep watching until the budget runs out.
        if (failure.code === "permission_denied" || best !== null) finish();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );

    // A fix delivered synchronously settles the promise before `watchId` exists,
    // so cleanup could not have cleared it — do that now instead of leaking a
    // watch that keeps the GPS awake.
    if (settled && watchId !== null) {
      geo.clearWatch(watchId);
      watchId = null;
    }
  });
}
