import { Icon } from "@/components/ui";
import { PLANS, type FeatureState, enabledKeysOf } from "@/lib/features";
import type { BusinessPlan } from "@/types/database";

/**
 * Subscription packages. Picking one replaces the whole module set;
 * touching an individual module afterwards drops the business to "custom".
 */
export function PlanPicker({
  plan,
  state,
  onPick,
}: {
  plan: BusinessPlan;
  state: FeatureState;
  onPick: (plan: Exclude<BusinessPlan, "custom">) => void;
}) {
  const customCount = enabledKeysOf(state).length;

  return (
    <div className="plan-picker">
      {PLANS.map((p) => {
        const active = plan === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            data-active={active}
            className="plan-card"
            aria-pressed={active}
          >
            <span className="plan-card-glow" aria-hidden />
            <span className="plan-card-top">
              <span className="plan-card-icon">
                <Icon name={p.icon} size={18} />
              </span>
              {active && <Icon name="check_circle" size={19} className="plan-card-check" />}
            </span>
            <span className="plan-card-label">{p.label}</span>
            <span className="plan-card-tagline">{p.tagline}</span>
            <span className="plan-card-meta">
              <span>{p.modules.length} מודולים</span>
              <span>{p.suggestedSeats == null ? "ללא הגבלת משתמשים" : `עד ${p.suggestedSeats} משתמשים`}</span>
            </span>
          </button>
        );
      })}

      <div className="plan-card" data-tone="custom" data-active={plan === "custom"} aria-hidden={plan !== "custom"}>
        <span className="plan-card-glow" aria-hidden />
        <span className="plan-card-top">
          <span className="plan-card-icon">
            <Icon name="tune" size={18} />
          </span>
          {plan === "custom" && <Icon name="check_circle" size={19} className="plan-card-check" />}
        </span>
        <span className="plan-card-label">מותאם אישית</span>
        <span className="plan-card-tagline">נבחר אוטומטית ברגע שמשנים מודול בודד מתוך חבילה</span>
        <span className="plan-card-meta">
          <span>{customCount} מודולים נבחרו</span>
        </span>
      </div>
    </div>
  );
}
