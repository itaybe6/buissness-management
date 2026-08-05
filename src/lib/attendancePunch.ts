import {
  evaluateClockIn,
  formatDistance,
  resolveGeofenceRules,
  type ClockInDecision,
  type GeofenceBusiness,
} from "@/lib/attendanceGeofence";
import { geolocationFailureMessage, getBestPosition, type PositionFix } from "@/lib/geolocation";
import type { UserRole } from "@/types/database";

/**
 * One clock-in attempt, end to end: read the manager's rules, get a location fix
 * only if they call for one, and turn both into a single decision.
 *
 * The employee punch card and the manager attendance page used to each carry
 * their own copy of this flow (and their own haversine), which is how they drifted
 * apart. Both call this now.
 */

export interface ClockInAttempt {
  decision: ClockInDecision;
  /** The fix the decision was made from — null when no location was needed or none arrived. */
  position: PositionFix | null;
}

/** Stop hunting for a better fix once it is this precise — half the radius, within reason. */
export function targetAccuracyFor(radiusM: number): number {
  return Math.max(20, Math.min(radiusM / 2, 50));
}

export async function attemptClockIn(input: {
  business: GeofenceBusiness | null | undefined;
  role: UserRole | null | undefined;
  maxWaitMs?: number;
  getPosition?: typeof getBestPosition;
}): Promise<ClockInAttempt> {
  const { business, role } = input;
  const rules = resolveGeofenceRules(business, role);

  // No geofence, an exempt role, or a business address the manager never set:
  // decided without ever asking the browser for a location.
  if (!rules.required || rules.missingLocation) {
    return { decision: evaluateClockIn({ business, role }), position: null };
  }

  const getPosition = input.getPosition ?? getBestPosition;
  let fix: PositionFix;
  try {
    fix = await getPosition({
      targetAccuracyM: targetAccuracyFor(rules.radiusM),
      maxWaitMs: input.maxWaitMs ?? 8000,
    });
  } catch (error) {
    return {
      decision: {
        allowed: false,
        reason: "no_position",
        message: geolocationFailureMessage(error),
        distanceM: null,
        accuracyM: null,
      },
      position: null,
    };
  }

  return {
    decision: evaluateClockIn({
      business,
      role,
      position: { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM },
    }),
    position: fix,
  };
}

/** The confirmation line after an accepted punch — includes the distance when one was measured. */
export function clockInSuccessText(decision: ClockInDecision): string {
  if (!decision.allowed) return "";
  if (decision.reason === "exempt") return "כניסה הוחתמה · ללא בדיקת מיקום";
  if (decision.distanceM == null) return "כניסה הוחתמה";
  return `כניסה הוחתמה · ${formatDistance(decision.distanceM)} מהעסק`;
}
