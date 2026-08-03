import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Icon } from "@/components/ui";
import {
  ALL_FEATURE_KEYS,
  FEATURE_DOMAINS,
  FEATURE_MODULES,
  MODULE_BY_KEY,
  applyFeatureToggle,
  dependentsOf,
  enabledKeysOf,
  featureStateFromKeys,
  missingRecommendations,
  type FeatureModule,
} from "@/lib/features";
import type { FeatureKey } from "@/types/database";

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

const DOMAIN_LABEL = new Map(FEATURE_DOMAINS.map((d) => [d.id, d.label]));

/**
 * One flat wall of features — no domain tabs, no switches. The card *is* the
 * control: click it and the whole surface flips to the lit state.
 * The decor class is the only thing that differs between cards, so each one
 * still reads as its own thing without breaking the single-accent palette.
 */
const CARD_ART: Record<FeatureKey, string> = {
  attendance: "fpk-art--arc",
  shifts: "fpk-art--grid",
  tasks: "fpk-art--lines",
  payroll: "fpk-art--dots",
  agreements: "fpk-art--rings",
  shift_reports: "fpk-art--wave",
  inventory: "fpk-art--stripe",
  waste: "fpk-art--rings",
  faults: "fpk-art--grid",
  events: "fpk-art--wave",
};

function FeatureCard({
  module,
  enabled,
  index,
  pulls,
  breaks,
  pending,
  onToggle,
}: {
  module: FeatureModule;
  enabled: boolean;
  index: number;
  /** Features this click would switch on as well (hard requirements). */
  pulls: FeatureModule[];
  /** Features this click would switch off as well (they depend on it). */
  breaks: FeatureModule[];
  /** Waiting on the purge dialog — still lit, but marked for removal. */
  pending?: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--spot-y", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const onLeave = () => {
    const el = ref.current;
    el?.style.setProperty("--spot-x", "50%");
    el?.style.setProperty("--spot-y", "50%");
  };

  const note = pending
    ? { icon: "hourglass_top", text: "ממתין לאישור מחיקה" }
    : enabled
      ? breaks.length > 0
        ? { icon: "link", text: `כיבוי יכבה גם ${breaks.map((b) => b.label).join(", ")}` }
        : null
      : pulls.length > 0
        ? { icon: "bolt", text: `ידליק גם ${pulls.map((p) => p.label).join(", ")}` }
        : null;

  return (
    // Entrance is CSS, not Motion: Motion would leave an inline transform on the
    // button and the hover lift / press-in would never apply.
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-on={enabled}
      data-pending={!!pending}
      data-feature={module.key}
      aria-pressed={enabled}
      title={module.dependencyNote}
      style={{ "--spot-x": "50%", "--spot-y": "50%", "--i": index } as CSSProperties}
      className={`fpk-card ${CARD_ART[module.key]}`}
    >
      <span className="fpk-card-art" aria-hidden />
      <span className="fpk-card-spot" aria-hidden />
      <span className="fpk-card-rail" aria-hidden />
      <span className="fpk-card-watermark" aria-hidden>
        <Icon name={module.icon} size={112} />
      </span>

      <span className="fpk-card-top">
        <span className="fpk-card-icon">
          <Icon name={module.icon} size={24} />
        </span>
        <span className="fpk-card-mark" aria-hidden>
          <span className="fpk-card-burst" />
          <Icon name="check" size={17} className="fpk-card-mark-on" />
          <Icon name="add" size={17} className="fpk-card-mark-off" />
        </span>
      </span>

      <span className="fpk-card-body">
        <span className="fpk-card-eyebrow">{DOMAIN_LABEL.get(module.domain)}</span>
        <span className="fpk-card-title">{module.label}</span>
        <span className="fpk-card-desc">{module.desc}</span>
      </span>

      <span className="fpk-card-foot">
        {note && (
          <span className="fpk-card-note">
            <Icon name={note.icon} size={13} />
            {note.text}
          </span>
        )}
        <span className="fpk-card-state">{pending ? "נמחק" : enabled ? "פעיל" : "כבוי"}</span>
      </span>
    </button>
  );
}

export function FeaturePicker({
  enabledSet,
  onChange,
  onRequestDisable,
  pendingOff,
  title = "בחירת פיצ'רים",
  lede = "לחיצה על כרטיס מדליקה או מכבה אותו. מה שכבוי פשוט לא קיים עבור העסק — לא בתפריט ולא בנתונים.",
}: {
  enabledSet: Set<FeatureKey>;
  /** Every key the click changed, including the dependency cascade. */
  onChange: (changes: { key: FeatureKey; enabled: boolean }[]) => void;
  /**
   * When given, switching a feature *off* is handed to the parent instead of
   * applied — an existing business loses that feature's data, so it goes
   * through confirmation first. `cascade` is the clicked key plus everything
   * that depends on it. Switching on stays free and still goes to `onChange`.
   */
  onRequestDisable?: (key: FeatureKey, cascade: FeatureKey[]) => void;
  /** Features awaiting that confirmation — still lit, but marked. */
  pendingOff?: Set<FeatureKey>;
  title?: string;
  lede?: string;
}) {
  const [cascade, setCascade] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const state = useMemo(() => featureStateFromKeys(enabledSet), [enabledSet]);
  const total = ALL_FEATURE_KEYS.length;
  const on = enabledSet.size;
  const advice = useMemo(() => missingRecommendations(state), [state]);

  useEffect(() => {
    if (!cascade) return;
    const t = setTimeout(() => setCascade(null), 4200);
    return () => clearTimeout(t);
  }, [cascade]);

  function toggle(key: FeatureKey) {
    const next = !state[key];

    // Switching off destroys data — when the parent owns that decision, hand it
    // the whole cascade and change nothing until it comes back.
    if (!next && onRequestDisable) {
      const { turnedOff } = applyFeatureToggle(state, key, false);
      onRequestDisable(key, [key, ...turnedOff]);
      return;
    }

    const result = applyFeatureToggle(state, key, next);

    onChange([
      { key, enabled: next },
      ...result.turnedOn.map((k) => ({ key: k, enabled: true })),
      ...result.turnedOff.map((k) => ({ key: k, enabled: false })),
    ]);

    const names = (keys: FeatureKey[]) =>
      keys.map((k) => MODULE_BY_KEY.get(k)?.label).filter(Boolean).join(", ");
    const label = MODULE_BY_KEY.get(key)?.label;

    if (result.turnedOn.length) setCascade(`הודלק אוטומטית גם ${names(result.turnedOn)} — ${label} לא עובד בלעדיו`);
    else if (result.turnedOff.length) setCascade(`כובה אוטומטית גם ${names(result.turnedOff)} — תלוי ב${label}`);
    else setCascade(null);
  }

  function setAll(enabled: boolean) {
    setCascade(null);

    if (!enabled && onRequestDisable) {
      const lit = enabledKeysOf(state);
      if (lit.length) onRequestDisable(lit[0], lit);
      return;
    }

    onChange(ALL_FEATURE_KEYS.map((key) => ({ key, enabled })));
  }

  const pct = total ? on / total : 0;
  const R = 19;
  const C = 2 * Math.PI * R;

  return (
    <section className="fpk">
      <header className="fpk-head">
        <span className="fpk-head-icon">
          <Icon name="apps" size={22} />
        </span>
        <div className="fpk-head-copy">
          <h2 className="fpk-title">{title}</h2>
          <p className="fpk-lede">{lede}</p>
        </div>
        <span className="fpk-ring-wrap" aria-label={`${on} מתוך ${total} פיצ'רים פעילים`}>
          <svg className="fpk-ring" viewBox="0 0 48 48" aria-hidden>
            <circle className="fpk-ring-track" cx="24" cy="24" r={R} />
            <circle
              className="fpk-ring-fill"
              cx="24"
              cy="24"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
            />
          </svg>
          <span className="fpk-ring-value">{on}</span>
        </span>
      </header>

      <div className="fpk-tools">
        <button type="button" className="fpk-tool" onClick={() => setAll(true)} disabled={on === total}>
          <Icon name="select_all" size={16} />
          הפעל הכל
        </button>
        <button type="button" className="fpk-tool" onClick={() => setAll(false)} disabled={on === 0}>
          <Icon name="remove_selection" size={16} />
          נקה הכל
        </button>
        <span className="fpk-tools-spacer" />
        <span className="fpk-tools-count">
          <b>{on}</b> מתוך {total} פיצ'רים
        </span>
      </div>

      <AnimatePresence mode="wait">
        {cascade && (
          <motion.p
            key={cascade}
            className="fpk-cascade"
            role="status"
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EASE }}
          >
            <Icon name="account_tree" size={16} />
            {cascade}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="fpk-grid">
        {FEATURE_MODULES.map((m, idx) => {
          const lit = enabledSet.has(m.key);
          return (
            <FeatureCard
              key={m.key}
              module={m}
              enabled={lit}
              index={idx}
              pulls={
                lit
                  ? []
                  : applyFeatureToggle(state, m.key, true).turnedOn.map((k) => MODULE_BY_KEY.get(k)!)
              }
              breaks={
                lit ? dependentsOf(m.key).filter((k) => enabledSet.has(k)).map((k) => MODULE_BY_KEY.get(k)!) : []
              }
              pending={pendingOff?.has(m.key)}
              onToggle={() => toggle(m.key)}
            />
          );
        })}
      </div>

      {advice.length > 0 && (
        <div className="fpk-advice">
          <Icon name="lightbulb" size={17} />
          <div>
            {advice.slice(0, 2).map(({ module, missing }) => (
              <p key={module.key}>
                <b>{module.label}</b> יעבוד טוב יותר עם {missing.map((x) => x.label).join(" ו")}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
