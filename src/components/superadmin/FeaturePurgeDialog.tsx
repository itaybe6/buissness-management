import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Icon, Spinner } from "@/components/ui";
import { FEATURE_DATA, moduleLabel, purgePlanFor, tableRowsFor, totalRows } from "@/lib/featureData";
import { MODULE_BY_KEY } from "@/lib/features";
import type { ApplyFeaturesResult } from "@/api/businesses";
import type { FeatureDataReport } from "@/lib/featureData";
import type { FeatureKey } from "@/types/database";

/**
 * The airlock in front of an irreversible delete.
 *
 * Switching a module off wipes that module's data for the business, so this is
 * deliberately not a yes/no box: it shows the real row counts per table, names
 * the modules dragged down by the dependency cascade, says out loud what
 * survives, and only arms the button once the super admin has typed the
 * business name. After confirming, the same panel plays back what was deleted
 * — the receipt is the last thing left of that data.
 */

type Phase = "review" | "working" | "done";

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const reduce = useReducedMotion();
  const target = useMotionValue(0);
  const spring = useSpring(target, { stiffness: 70, damping: 18, mass: 0.7 });
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const t = setTimeout(() => target.set(value), delay);
    return () => clearTimeout(t);
  }, [value, delay, reduce, target]);

  useMotionValueEvent(spring, "change", (v) => setShown(Math.round(v)));

  return <>{shown.toLocaleString("he-IL")}</>;
}

/** The module being switched off, as a reactor that spins up while deleting. */
function PurgeCore({ keys, phase }: { keys: FeatureKey[]; phase: Phase }) {
  const reduce = useReducedMotion();
  const lead = MODULE_BY_KEY.get(keys[0]);

  return (
    <div className="purge-core" data-phase={phase}>
      <span className="purge-core-ring purge-core-ring--outer" aria-hidden />
      <span className="purge-core-ring purge-core-ring--mid" aria-hidden />
      {!reduce && <span className="purge-core-sweep" aria-hidden />}

      <AnimatePresence mode="wait">
        {phase === "done" ? (
          <motion.span
            key="done"
            className="purge-core-glyph purge-core-glyph--done"
            initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -25 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
          >
            <Icon name="delete_forever" size={30} />
          </motion.span>
        ) : (
          <motion.span
            key="live"
            className="purge-core-glyph"
            animate={
              reduce || phase !== "working"
                ? {}
                : { x: [0, -1.5, 1.5, -1, 1, 0], transition: { duration: 0.4, repeat: Infinity } }
            }
          >
            <Icon name={lead?.icon ?? "layers_clear"} size={30} />
          </motion.span>
        )}
      </AnimatePresence>

      {keys.length > 1 && <span className="purge-core-badge">+{keys.length - 1}</span>}
    </div>
  );
}

export interface FeaturePurgeDialogProps {
  open: boolean;
  businessName: string;
  /** Modules being switched off, cascade included, lead module first. */
  keys: FeatureKey[];
  /** The module the super admin actually clicked — the rest came from the cascade. */
  leadKey: FeatureKey;
  /**
   * "module" — one switch was flipped, the rest of `keys` is its dependency
   * cascade. "plan" — a whole package was applied and several modules dropped
   * out at once, so no module is to blame for the others.
   */
  mode?: "module" | "plan";
  /** Name of the package being applied, when mode is "plan". */
  planLabel?: string;
  report: FeatureDataReport | undefined;
  reportLoading: boolean;
  reportError?: boolean;
  working: boolean;
  /** Set once the mutation resolves — switches the panel to the receipt. */
  result: ApplyFeaturesResult | null;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FeaturePurgeDialog({
  open,
  businessName,
  keys,
  leadKey,
  report,
  reportLoading,
  reportError,
  working,
  result,
  error,
  onCancel,
  onConfirm,
}: FeaturePurgeDialogProps) {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const plan = useMemo(() => purgePlanFor(keys), [keys]);
  const rows = useMemo(() => totalRows(plan, report), [plan, report]);
  const phase: Phase = result ? "done" : working ? "working" : "review";

  const cascade = keys.filter((k) => k !== leadKey);
  const nothingToDelete = !reportLoading && !reportError && rows === 0;
  const armed = nothingToDelete || typed.trim() === businessName.trim();

  useEffect(() => {
    if (open) setTyped("");
  }, [open, keys.join()]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "working") onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, phase, onCancel]);

  if (!open) return null;

  const keeps = [...new Set(keys.flatMap((k) => FEATURE_DATA[k]?.keeps ?? []))];
  const buckets = plan.storage;
  const deletedTables = Object.entries(result?.deleted ?? {});
  const filesRemoved = Object.values(result?.files ?? {}).reduce((a, b) => a + b, 0);

  return createPortal(
    <div className="purge-overlay" onClick={() => phase !== "working" && onCancel()}>
      <span className="purge-overlay-grid" aria-hidden />

      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-label={`כיבוי ${moduleLabel(leadKey)} ומחיקת הנתונים`}
        onClick={(e) => e.stopPropagation()}
        className="purge-card"
        data-phase={phase}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.94, rotateX: 8 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <span className="purge-aura" aria-hidden />
        {phase === "working" && !reduce && <span className="purge-scan" aria-hidden />}

        <header className="purge-head">
          <PurgeCore keys={keys} phase={phase} />
          <div className="purge-head-text">
            <span className="purge-kicker">
              <Icon name="warning" size={14} />
              פעולה בלתי הפיכה
            </span>
            <h2 className="purge-title">
              {phase === "done"
                ? "הנתונים נמחקו"
                : keys.length > 1
                  ? `כיבוי ${keys.length} מודולים ומחיקת הנתונים שלהם`
                  : `כיבוי ${moduleLabel(leadKey)} ומחיקת הנתונים שלו`}
            </h2>
            <p className="purge-sub">
              <Icon name="storefront" size={14} />
              {businessName}
            </p>
          </div>
          {phase !== "working" && (
            <button className="purge-close" onClick={onCancel} aria-label="ביטול">
              <Icon name="close" size={19} />
            </button>
          )}
        </header>

        <div className="purge-body">
          <AnimatePresence mode="wait">
            {phase === "done" ? (
              <motion.div
                key="receipt"
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="purge-receipt"
              >
                <div className="purge-receipt-total">
                  <span className="purge-receipt-num">
                    <CountUp value={result?.rows_total ?? 0} />
                  </span>
                  <span className="purge-receipt-label">שורות נמחקו לצמיתות</span>
                </div>

                {deletedTables.length > 0 ? (
                  <ul className="purge-receipt-list">
                    {deletedTables.map(([table, n], i) => (
                      <motion.li
                        key={table}
                        initial={reduce ? false : { opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05, duration: 0.35, ease: EASE }}
                      >
                        <Icon name="check" size={14} />
                        <span className="purge-receipt-table">{table}</span>
                        <b>{n.toLocaleString("he-IL")}</b>
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="purge-receipt-empty">לא היו נתונים למחיקה — המודול פשוט כובה.</p>
                )}

                {filesRemoved > 0 && (
                  <p className="purge-receipt-files">
                    <Icon name="folder_delete" size={15} />
                    נמחקו גם {filesRemoved.toLocaleString("he-IL")} קבצים מה-Storage
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="review"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                className="purge-review"
              >
                {cascade.length > 0 && (
                  <div className="purge-cascade">
                    <Icon name="account_tree" size={17} />
                    <span>
                      <b>{moduleLabel(leadKey)}</b> מפעיל את{" "}
                      {cascade.map((k) => moduleLabel(k)).join(", ")} — הנתונים של{" "}
                      {cascade.length > 1 ? "כולם" : "שניהם"} יימחקו יחד.
                    </span>
                  </div>
                )}

                <div className="purge-meter" data-empty={nothingToDelete}>
                  <div className="purge-meter-num">
                    {reportLoading ? (
                      <Spinner size={26} />
                    ) : reportError ? (
                      <Icon name="error" size={28} />
                    ) : (
                      <CountUp value={rows} delay={120} />
                    )}
                  </div>
                  <div className="purge-meter-text">
                    {reportLoading
                      ? "בודק כמה נתונים יש לעסק…"
                      : reportError
                        ? "לא הצלחנו לספור את הנתונים — אפשר להמשיך, המחיקה עצמה תדווח מה נמחק."
                        : nothingToDelete
                          ? "אין נתונים למודול הזה בעסק. הכיבוי לא ימחק כלום."
                          : "שורות יימחקו מהמסד. אין שחזור, אין סל מיחזור, אין גיבוי בתוך המערכת."}
                  </div>
                </div>

                <div className="purge-ledger">
                  {keys.map((key, ki) => {
                    const scope = FEATURE_DATA[key];
                    if (!scope) return null;
                    const tables = tableRowsFor(key, report);
                    const module = MODULE_BY_KEY.get(key);
                    return (
                      <motion.section
                        key={key}
                        className="purge-ledger-group"
                        initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(5px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ delay: ki * 0.09, duration: 0.45, ease: EASE }}
                      >
                        <header className="purge-ledger-head">
                          <span className="purge-ledger-icon">
                            <Icon name={module?.icon ?? "layers"} size={17} />
                          </span>
                          <span className="purge-ledger-name">{module?.label ?? key}</span>
                          {key !== leadKey && <span className="purge-ledger-tag">נגרר בתלות</span>}
                        </header>

                        <p className="purge-ledger-loses">{scope.loses}</p>

                        <ul className="purge-ledger-rows">
                          {tables.map(({ table, rows: n }, i) => (
                            <motion.li
                              key={`${table.table}|${table.where ?? ""}`}
                              data-zero={n === 0}
                              data-cascade={!!table.viaCascade}
                              initial={reduce ? false : { opacity: 0, x: 18 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: ki * 0.09 + 0.08 + i * 0.045, duration: 0.4, ease: EASE }}
                            >
                              <span className="purge-row-dot" aria-hidden />
                              <span className="purge-row-label">
                                {table.label}
                                {table.where && <em className="purge-row-scope">רק אלו של האירועים</em>}
                              </span>
                              <span className="purge-row-count">
                                {n == null ? "—" : n === 0 ? "ריק" : <CountUp value={n} delay={200} />}
                              </span>
                            </motion.li>
                          ))}
                        </ul>
                      </motion.section>
                    );
                  })}
                </div>

                {buckets.length > 0 && (
                  <div className="purge-files">
                    <Icon name="folder_delete" size={17} />
                    <span>
                      יימחקו גם קבצים מה-Storage: {buckets.map((b) => b.label).join(" · ")}
                    </span>
                  </div>
                )}

                {keeps.length > 0 && (
                  <div className="purge-keeps">
                    <div className="purge-keeps-head">
                      <Icon name="shield" size={16} />
                      מה נשאר במקום
                    </div>
                    <ul>
                      {keeps.map((k) => (
                        <li key={k}>
                          <Icon name="check_small" size={16} />
                          {k}
                        </li>
                      ))}
                      <li>
                        <Icon name="check_small" size={16} />
                        אפשר להדליק את המודול מחדש בכל רגע — הוא יחזור ריק
                      </li>
                    </ul>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="purge-error">
              <Icon name="error" size={18} />
              {error}
            </div>
          )}
        </div>

        <footer className="purge-foot">
          {phase === "done" ? (
            <button className="purge-btn purge-btn--done" onClick={onCancel}>
              <Icon name="check" size={19} />
              סגירה
            </button>
          ) : (
            <>
              {!nothingToDelete && (
                <label className="purge-gate" data-armed={armed}>
                  <span className="purge-gate-label">
                    להמשך, הקלידו את שם העסק: <b>{businessName}</b>
                  </span>
                  <span className="purge-gate-field">
                    <input
                      ref={inputRef}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      disabled={phase === "working"}
                      placeholder={businessName}
                      aria-label="הקלידו את שם העסק לאישור"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <AnimatePresence>
                      {armed && (
                        <motion.span
                          className="purge-gate-check"
                          initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={reduce ? undefined : { scale: 0.4, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 420, damping: 20 }}
                        >
                          <Icon name="lock_open" size={17} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </label>
              )}

              <div className="purge-actions">
                <button className="purge-btn purge-btn--ghost" onClick={onCancel} disabled={phase === "working"}>
                  ביטול
                </button>
                <button
                  className="purge-btn purge-btn--danger"
                  onClick={onConfirm}
                  disabled={!armed || phase === "working"}
                  data-armed={armed}
                >
                  {phase === "working" ? (
                    <>
                      <Spinner size={18} />
                      מוחק…
                    </>
                  ) : (
                    <>
                      <Icon name="delete_forever" size={19} />
                      {nothingToDelete ? "כיבוי המודול" : `מחיקה וכיבוי`}
                    </>
                  )}
                  <span className="purge-btn-fill" aria-hidden />
                </button>
              </div>
            </>
          )}
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
