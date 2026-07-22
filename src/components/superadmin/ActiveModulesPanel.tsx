import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { Icon, Switch } from "@/components/ui";
import {
  FEATURE_DOMAINS,
  MODULE_BY_KEY,
  applyFeatureToggle,
  dependentsOf,
  featureStateFromKeys,
  missingRecommendations,
  modulesInDomain,
  type FeatureDomainId,
  type FeatureModule,
} from "@/lib/features";
import type { FeatureKey } from "@/types/database";

const SPRING = { stiffness: 280, damping: 28, mass: 0.6 };
const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

type ModuleLayout = "cinema" | "portrait" | "orbit";

/**
 * Each module gets its own visual treatment so the rack reads as a set of
 * distinct worlds rather than a grid of identical switches.
 */
const MODULE_ART: Record<FeatureKey, { layout: ModuleLayout; span: string; decor: string }> = {
  // core
  attendance: { layout: "cinema", span: "module-capsule--lead", decor: "decor-arc" },
  shifts: { layout: "portrait", span: "module-capsule--tail", decor: "decor-grid" },
  tasks: { layout: "cinema", span: "module-capsule--full", decor: "decor-lines" },
  // workforce
  payroll: { layout: "cinema", span: "module-capsule--wide", decor: "decor-dots" },
  agreements: { layout: "portrait", span: "module-capsule--third", decor: "decor-rings" },
  shift_reports: { layout: "cinema", span: "module-capsule--full", decor: "decor-wave" },
  // operations
  inventory: { layout: "cinema", span: "module-capsule--lead", decor: "decor-stripe" },
  faults: { layout: "portrait", span: "module-capsule--tail", decor: "decor-grid" },
  waste: { layout: "orbit", span: "module-capsule--full", decor: "decor-rings" },
  // growth
  events: { layout: "cinema", span: "module-capsule--full", decor: "decor-wave" },
};

function ModuleCapsule({
  module,
  enabled,
  index,
  lockedBy,
  breaks,
  onToggle,
}: {
  module: FeatureModule;
  enabled: boolean;
  index: number;
  /** Module that must be turned on first — renders this capsule as locked. */
  lockedBy: FeatureModule | null;
  /** Modules that will switch off along with this one. */
  breaks: FeatureModule[];
  onToggle: () => void;
}) {
  const art = MODULE_ART[module.key];
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [7, -7]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-7, 7]), SPRING);

  const onMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x);
    py.set(y);
    el.style.setProperty("--spot-x", `${x * 100}%`);
    el.style.setProperty("--spot-y", `${y * 100}%`);
  };

  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
    ref.current?.style.setProperty("--spot-x", "50%");
    ref.current?.style.setProperty("--spot-y", "50%");
  };

  const meta = (
    <>
      {lockedBy && (
        <span className="module-capsule-dep module-capsule-dep--locked">
          <Icon name="lock" size={13} />
          דורש {lockedBy.label}
        </span>
      )}
      {!lockedBy && enabled && breaks.length > 0 && (
        <span className="module-capsule-dep">
          <Icon name="link" size={13} />
          כיבוי יכבה גם {breaks.map((b) => b.label).join(", ")}
        </span>
      )}
    </>
  );

  const body = (
    <>
      <span className="module-capsule-title">{module.label}</span>
      <p className="module-capsule-desc">{module.desc}</p>
      {meta}
    </>
  );

  return (
    <motion.button
      ref={ref}
      type="button"
      layout
      initial={reduce ? false : { opacity: 0, transform: "translateY(18px) scale(0.97)" }}
      animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
      transition={{ duration: 0.55, delay: reduce ? 0 : index * 0.07, ease: EASE }}
      onClick={onToggle}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-enabled={enabled}
      data-module={module.key}
      data-layout={art.layout}
      data-locked={!!lockedBy}
      title={lockedBy ? `הפעלת ${module.label} תדליק אוטומטית את ${lockedBy.label}` : module.dependencyNote}
      style={{ "--spot-x": "50%", "--spot-y": "50%", perspective: 900 } as CSSProperties}
      className={`module-capsule group ${art.span}`}
      aria-pressed={enabled}
    >
      <motion.span
        className="module-capsule-tilt"
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
      >
        <span className="module-capsule-frame">
          <span className={`module-capsule-decor ${art.decor}`} aria-hidden />
          <span className="module-capsule-spotlight" aria-hidden />
          <span className="module-capsule-watermark" aria-hidden>
            <Icon name={module.icon} size={120} />
          </span>

          {art.layout === "cinema" && (
            <span className="module-capsule-inner module-capsule-inner--cinema">
              <span className="module-capsule-stage">
                <span className="module-capsule-icon-ring">
                  <Icon name={module.icon} size={28} />
                </span>
              </span>
              <span className="module-capsule-content">
                <span className="module-capsule-head">
                  <Switch checked={enabled} />
                </span>
                {body}
              </span>
            </span>
          )}

          {art.layout === "portrait" && (
            <span className="module-capsule-inner module-capsule-inner--portrait">
              <span className="module-capsule-head">
                <span className="module-capsule-icon-ring module-capsule-icon-ring--sm">
                  <Icon name={module.icon} size={24} />
                </span>
                <Switch checked={enabled} />
              </span>
              {body}
            </span>
          )}

          {art.layout === "orbit" && (
            <span className="module-capsule-inner module-capsule-inner--orbit">
              <span className="module-capsule-orbit-wrap">
                <span className="module-capsule-orbit-ring" aria-hidden />
                <span className="module-capsule-icon-ring module-capsule-icon-ring--orbit">
                  <Icon name={module.icon} size={22} />
                </span>
              </span>
              <span className="module-capsule-content module-capsule-content--orbit">
                <span className="module-capsule-head">
                  <Switch checked={enabled} />
                </span>
                {body}
              </span>
            </span>
          )}

          <span className="module-capsule-shine" aria-hidden />
        </span>
      </motion.span>
    </motion.button>
  );
}

export function ActiveModulesPanel({
  enabledSet,
  onToggle,
  onBulkChange,
  headerSlot,
}: {
  enabledSet: Set<FeatureKey>;
  /** Called for every module the toggle changed, including dependency cascades. */
  onToggle: (key: FeatureKey, enabled: boolean) => void;
  /** Optional bulk apply — when absent, cascades are emitted as individual onToggle calls. */
  onBulkChange?: (changes: { key: FeatureKey; enabled: boolean }[]) => void;
  /** Rendered in the panel header (e.g. the plan picker). */
  headerSlot?: React.ReactNode;
}) {
  const [activeDomain, setActiveDomain] = useState<FeatureDomainId>(FEATURE_DOMAINS[0].id);
  const [cascade, setCascade] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const state = useMemo(() => featureStateFromKeys(enabledSet), [enabledSet]);
  const total = MODULE_BY_KEY.size;
  const enabled = enabledSet.size;
  const advice = useMemo(() => missingRecommendations(state), [state]);

  useEffect(() => {
    if (!cascade) return;
    const t = setTimeout(() => setCascade(null), 4200);
    return () => clearTimeout(t);
  }, [cascade]);

  function handleToggle(key: FeatureKey) {
    const next = !state[key];
    const result = applyFeatureToggle(state, key, next);
    const changes = [
      { key, enabled: next },
      ...result.turnedOn.map((k) => ({ key: k, enabled: true })),
      ...result.turnedOff.map((k) => ({ key: k, enabled: false })),
    ];

    if (onBulkChange) onBulkChange(changes);
    else changes.forEach((c) => onToggle(c.key, c.enabled));

    const names = (keys: FeatureKey[]) => keys.map((k) => MODULE_BY_KEY.get(k)?.label).filter(Boolean).join(", ");
    if (result.turnedOn.length) setCascade(`הופעל אוטומטית גם: ${names(result.turnedOn)} — נדרש עבור ${MODULE_BY_KEY.get(key)?.label}`);
    else if (result.turnedOff.length) setCascade(`כובה אוטומטית גם: ${names(result.turnedOff)} — תלוי ב${MODULE_BY_KEY.get(key)?.label}`);
    else setCascade(null);
  }

  return (
    <section className="module-rack mb-6">
      <header className="module-rack-head">
        <div className="module-rack-head-glow" aria-hidden />
        <div className="module-rack-head-main">
          <h2 className="module-rack-title">מודולים פעילים</h2>
          <p className="module-rack-lede">
            כל מודול הוא עולם משלו. מה שכבוי כאן פשוט לא קיים עבור העסק — לא בתפריט ולא בנתונים.
          </p>
        </div>
        <div className="module-rack-meter" aria-label={`${enabled} מתוך ${total} מודולים פעילים`}>
          <span className="module-rack-meter-value">{enabled}</span>
          <span className="module-rack-meter-sep">/</span>
          <span className="module-rack-meter-total">{total}</span>
        </div>
      </header>

      {headerSlot}

      <div className="module-rack-shell">
        <nav className="module-rack-nav" aria-label="תחומי מודולים">
          {FEATURE_DOMAINS.map((domain) => {
            const on = activeDomain === domain.id;
            const keys = modulesInDomain(domain.id).map((m) => m.key);
            const lit = keys.filter((k) => enabledSet.has(k)).length;
            return (
              <button
                key={domain.id}
                type="button"
                onClick={() => setActiveDomain(domain.id)}
                className={`module-rack-nav-item ${on ? "is-active" : ""}`}
                title={domain.tagline}
              >
                {on && !reduce && (
                  <motion.span
                    layoutId="module-rack-nav-mark"
                    className="module-rack-nav-mark"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                {on && reduce && <span className="module-rack-nav-mark" />}
                <Icon name={domain.icon} size={17} className="module-rack-nav-icon" />
                <span className="module-rack-nav-label">{domain.label}</span>
                <span className="module-rack-nav-count">
                  {lit}/{keys.length}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="module-rack-stage">
          <div className="module-rack-stage-mesh" aria-hidden />

          <AnimatePresence mode="wait">
            {cascade && (
              <motion.div
                key={cascade}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                className="module-rack-cascade"
                role="status"
              >
                <Icon name="account_tree" size={17} />
                {cascade}
              </motion.div>
            )}
          </AnimatePresence>

          {FEATURE_DOMAINS.filter((d) => d.id === activeDomain).map((domain) => (
            <motion.div key={domain.id}>
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="module-rack-domain-tagline"
              >
                {domain.tagline}
              </motion.p>
              <motion.div
                initial={reduce ? false : { opacity: 0, filter: "blur(6px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.45, ease: EASE }}
                className="module-rack-grid"
              >
                {modulesInDomain(domain.id).map((m, idx) => {
                  const on = enabledSet.has(m.key);
                  const unmetDep = m.requires.find((k) => !enabledSet.has(k));
                  const willBreak = on
                    ? dependentsOf(m.key)
                        .filter((k) => enabledSet.has(k))
                        .map((k) => MODULE_BY_KEY.get(k)!)
                    : [];
                  return (
                    <ModuleCapsule
                      key={m.key}
                      module={m}
                      enabled={on}
                      index={idx}
                      lockedBy={!on && unmetDep ? MODULE_BY_KEY.get(unmetDep)! : null}
                      breaks={willBreak}
                      onToggle={() => handleToggle(m.key)}
                    />
                  );
                })}
              </motion.div>
            </motion.div>
          ))}

          {advice.length > 0 && (
            <div className="module-rack-advice">
              <Icon name="lightbulb" size={17} />
              <div>
                {advice.slice(0, 2).map(({ module, missing }) => (
                  <div key={module.key}>
                    <b>{module.label}</b> יעבוד טוב יותר עם {missing.map((x) => x.label).join(" ו")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
