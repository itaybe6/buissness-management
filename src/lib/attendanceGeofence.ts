import { ATTENDANCE_RADIUS_DEFAULT_M } from "@/lib/constants";
import type { Business, UserRole } from "@/types/database";

/**
 * The manager-controlled gate on an employee's clock-in.
 *
 * Three business settings decide whether an employee standing outside the
 * restaurant can punch in: `attendance_geofence_enabled`, the exempt-role list,
 * and `location_radius_m`. Getting this wrong either locks a whole shift out of
 * the clock or lets people punch in from home, so the rules live here rather
 * than inside the punch hook.
 */

export type GeofenceBusiness = Pick<
  Business,
  "attendance_geofence_enabled" | "attendance_geofence_exempt_roles" | "location_lat" | "location_lng" | "location_radius_m"
>;

/**
 * How much of the browser's own uncertainty we hand to the employee.
 *
 * A fix reports `accuracy` — the radius it believes it is somewhere inside. If
 * the business radius is 100 m and the phone is sure only to ±40 m, then a
 * measured 130 m may well be 90 m in reality, so we widen the gate by the
 * accuracy. The cap stops a deliberately vague fix from widening it forever.
 */
export const ACCURACY_SLACK_CAP_M = 100;

/**
 * Above this, the fix says nothing about where the person is.
 *
 * Desktops with no WiFi scan fall back to IP geolocation and report accuracies
 * in the kilometres — that is where "you are 3,689 m away" comes from. Such a
 * fix can neither prove nor disprove presence, so we block and say why instead
 * of accusing the employee of being somewhere they are not.
 */
export const UNRELIABLE_ACCURACY_M = 500;

export interface GeofenceRules {
  /** The business switched geofencing on. */
  enabled: boolean;
  /** This role was excluded by the manager. */
  exempt: boolean;
  /** Location must be checked before the punch is accepted. */
  required: boolean;
  /** Allowed distance from the business address, in metres. */
  radiusM: number;
  /** Geofencing is on but the manager never set the business address. */
  missingLocation: boolean;
}

export function resolveGeofenceRules(
  business: GeofenceBusiness | null | undefined,
  role: UserRole | null | undefined,
): GeofenceRules {
  const enabled = business?.attendance_geofence_enabled ?? false;
  const exempt = Boolean(role && business?.attendance_geofence_exempt_roles?.includes(role));
  const required = enabled && !exempt;
  return {
    enabled,
    exempt,
    required,
    radiusM: business?.location_radius_m ?? ATTENDANCE_RADIUS_DEFAULT_M,
    missingLocation: required && (business?.location_lat == null || business?.location_lng == null),
  };
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Metres the gate is widened by, given the fix's own uncertainty. */
export function accuracySlackMeters(accuracyM: number | null | undefined): number {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) return 0;
  return Math.min(accuracyM, ACCURACY_SLACK_CAP_M);
}

/** A fix this vague cannot place anyone anywhere. */
export function isUnreliableAccuracy(accuracyM: number | null | undefined): boolean {
  if (accuracyM == null) return false;
  return !Number.isFinite(accuracyM) || accuracyM > UNRELIABLE_ACCURACY_M;
}

export interface PunchPosition {
  lat: number;
  lng: number;
  /** Radius of the fix's uncertainty circle, in metres. Unknown when omitted. */
  accuracyM?: number | null;
}

export type ClockInDecision =
  /** Punch is accepted; `within` is what gets stored on the attendance row. */
  | {
      allowed: true;
      reason: "no_geofence" | "exempt" | "inside_radius";
      within: boolean;
      distanceM: number | null;
      accuracyM: number | null;
    }
  /** Punch is refused, with the message the employee sees. */
  | {
      allowed: false;
      reason: "missing_business_location" | "no_position" | "low_accuracy" | "outside_radius";
      message: string;
      distanceM: number | null;
      accuracyM: number | null;
    };

/** "142 מ׳" / "3.7 ק״מ" — kilometres once metres stop being readable. */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} ק״מ`;
  return `${Math.round(meters)} מ׳`;
}

/**
 * Decide whether a clock-in attempt is accepted.
 * `position` is null when the browser has no fix yet — callers only pass one
 * when the geofence actually requires it.
 */
export function evaluateClockIn(input: {
  business: GeofenceBusiness | null | undefined;
  role: UserRole | null | undefined;
  position?: PunchPosition | null;
}): ClockInDecision {
  const rules = resolveGeofenceRules(input.business, input.role);

  if (!rules.required) {
    return {
      allowed: true,
      reason: rules.exempt && rules.enabled ? "exempt" : "no_geofence",
      within: false,
      distanceM: null,
      accuracyM: null,
    };
  }

  if (rules.missingLocation) {
    return {
      allowed: false,
      reason: "missing_business_location",
      message: "מיקום העסק לא הוגדר. פנו למנהל.",
      distanceM: null,
      accuracyM: null,
    };
  }

  if (!input.position) {
    return {
      allowed: false,
      reason: "no_position",
      message: "לא ניתן לקבל מיקום מהדפדפן",
      distanceM: null,
      accuracyM: null,
    };
  }

  const accuracyM = input.position.accuracyM ?? null;
  const d = distanceMeters(
    input.position.lat,
    input.position.lng,
    input.business!.location_lat!,
    input.business!.location_lng!,
  );

  // Order matters: an unreliable fix is judged before the distance, because the
  // distance it produced is not evidence of anything.
  if (isUnreliableAccuracy(accuracyM)) {
    return {
      allowed: false,
      reason: "low_accuracy",
      message: Number.isFinite(accuracyM ?? Number.POSITIVE_INFINITY)
        ? `לא הצלחנו לאתר אתכם במדויק (דיוק של ±${formatDistance(accuracyM!)} בלבד). החתימו מהנייד עם GPS דלוק, לא ממחשב.`
        : "לא הצלחנו לאתר אתכם במדויק. החתימו מהנייד עם GPS דלוק, לא ממחשב.",
      distanceM: d,
      accuracyM,
    };
  }

  if (d > rules.radiusM + accuracySlackMeters(accuracyM)) {
    return {
      allowed: false,
      reason: "outside_radius",
      message: `אתם במרחק ${formatDistance(d)} מהעסק — מחוץ לרדיוס (${rules.radiusM} מ׳)`,
      distanceM: d,
      accuracyM,
    };
  }

  return { allowed: true, reason: "inside_radius", within: true, distanceM: d, accuracyM };
}
