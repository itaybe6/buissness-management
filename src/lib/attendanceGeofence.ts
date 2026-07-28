import { ATTENDANCE_RADIUS_M } from "@/lib/constants";
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
    radiusM: business?.location_radius_m ?? ATTENDANCE_RADIUS_M,
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

export type ClockInDecision =
  /** Punch is accepted; `within` is what gets stored on the attendance row. */
  | { allowed: true; reason: "no_geofence" | "exempt" | "inside_radius"; within: boolean; distanceM: number | null }
  /** Punch is refused, with the message the employee sees. */
  | { allowed: false; reason: "missing_business_location" | "outside_radius"; message: string; distanceM: number | null };

/**
 * Decide whether a clock-in attempt is accepted.
 * `position` is null when the browser has no fix yet — callers only pass one
 * when the geofence actually requires it.
 */
export function evaluateClockIn(input: {
  business: GeofenceBusiness | null | undefined;
  role: UserRole | null | undefined;
  position?: { lat: number; lng: number } | null;
}): ClockInDecision {
  const rules = resolveGeofenceRules(input.business, input.role);

  if (!rules.required) {
    return {
      allowed: true,
      reason: rules.exempt && rules.enabled ? "exempt" : "no_geofence",
      within: false,
      distanceM: null,
    };
  }

  if (rules.missingLocation) {
    return {
      allowed: false,
      reason: "missing_business_location",
      message: "מיקום העסק לא הוגדר. פנו למנהל.",
      distanceM: null,
    };
  }

  if (!input.position) {
    return {
      allowed: false,
      reason: "outside_radius",
      message: "לא ניתן לקבל מיקום מהדפדפן",
      distanceM: null,
    };
  }

  const d = distanceMeters(
    input.position.lat,
    input.position.lng,
    input.business!.location_lat!,
    input.business!.location_lng!,
  );

  if (d > rules.radiusM) {
    return {
      allowed: false,
      reason: "outside_radius",
      message: `אתם במרחק ${Math.round(d)} מ׳ מחוץ לרדיוס (${rules.radiusM} מ׳)`,
      distanceM: d,
    };
  }

  return { allowed: true, reason: "inside_radius", within: true, distanceM: d };
}
