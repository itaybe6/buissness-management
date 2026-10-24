import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/* ════════════════════════════════════════════════════════════
   ClickSparks — one listener for the whole app. Pressing a
   primary action throws a ring of short sparks from the press
   point. Opt in more elements with `data-spark`; opt out with
   `data-spark="off"`. Colour comes from `--rb-spark` on the
   element (falls back to the primary ink).
   ════════════════════════════════════════════════════════════ */
const SPARK_TARGETS = '.ui-btn--primary, .ui-btn--danger, [data-spark]:not([data-spark="off"])';

export function ClickSparks() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    function onDown(e: PointerEvent) {
      if (reduce.matches || e.button !== 0) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(SPARK_TARGETS);
      if (!el || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return;

      const color = getComputedStyle(el).getPropertyValue("--rb-spark").trim();
      const burst = document.createElement("span");
      burst.className = "rb-spark";
      burst.style.left = `${e.clientX}px`;
      burst.style.top = `${e.clientY}px`;
      if (color) burst.style.setProperty("--rb-spark-c", color);
      for (let i = 0; i < 8; i++) {
        const ray = document.createElement("i");
        ray.style.setProperty("--a", `${i * 45 + 22.5}deg`);
        burst.appendChild(ray);
      }
      document.body.appendChild(burst);
      window.setTimeout(() => burst.remove(), 520);
    }

    document.addEventListener("pointerdown", onDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return null;
}

/* ════════════════════════════════════════════════════════════
   PointerGlow — feeds `--gx/--gy` (px inside the element) and
   `--ge` (0..1, how close the pointer is to the edge) to the
   `.rb-glow` element under a mouse. The CSS turns that into a
   spotlight plus a border that lights up near the pointer.
   rAF-batched, mouse-only, one listener for the whole app.
   ════════════════════════════════════════════════════════════ */
export function PointerGlow() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    let lastEvent: PointerEvent | null = null;
    let active: HTMLElement | null = null;

    function apply() {
      raf = 0;
      const e = lastEvent;
      if (!e) return;
      const el = (e.target as Element | null)?.closest<HTMLElement>(".rb-glow") ?? null;
      if (active && active !== el) active.removeAttribute("data-glow-on");
      active = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const edge = Math.min(x, y, r.width - x, r.height - y);
      const near = Math.max(0, 1 - edge / Math.min(90, Math.min(r.width, r.height) / 2));
      el.style.setProperty("--gx", `${x.toFixed(1)}px`);
      el.style.setProperty("--gy", `${y.toFixed(1)}px`);
      el.style.setProperty("--ge", near.toFixed(3));
      el.setAttribute("data-glow-on", "");
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      lastEvent = e;
      if (!raf) raf = requestAnimationFrame(apply);
    }

    function onLeave() {
      active?.removeAttribute("data-glow-on");
      active = null;
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return null;
}

/* ════════════════════════════════════════════════════════════
   useMagnet — the element leans toward a nearby mouse.
   Writes a CSS variable pair (`--mx/--my`), so the element's own
   `transform` (hover/press states) stays in CSS.
   ════════════════════════════════════════════════════════════ */
export function useMagnet<T extends HTMLElement>(pull = 0.22, reach = 70) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    function onMove(e: PointerEvent) {
      if (raf || !el) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const inX = Math.abs(dx) < r.width / 2 + reach;
        const inY = Math.abs(dy) < r.height / 2 + reach;
        if (inX && inY) {
          el.style.setProperty("--mx", `${(dx * pull).toFixed(1)}px`);
          el.style.setProperty("--my", `${(dy * pull).toFixed(1)}px`);
          el.dataset.magnet = "on";
        } else if (el.dataset.magnet) {
          el.style.setProperty("--mx", "0px");
          el.style.setProperty("--my", "0px");
          delete el.dataset.magnet;
        }
      });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [pull, reach]);

  return ref;
}

/* ════════════════════════════════════════════════════════════
   CardSwap — a skewed 3D stack; every `delay` ms the front
   card drops away and slides back in behind the others.
   Pauses while hovered so a card can actually be read.
   ════════════════════════════════════════════════════════════ */
export function CardSwap({
  children,
  delay = 3800,
  distX = 46,
  distY = 40,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  distX?: number;
  distY?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const cards = Children.toArray(children);
  const count = cards.length;
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const orderRef = useRef(order);
  orderRef.current = order;
  const [dropping, setDropping] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || paused || count < 2) return;
    let swapTimer = 0;
    const id = window.setInterval(() => {
      setDropping(orderRef.current[0]);
      swapTimer = window.setTimeout(() => {
        setOrder((o) => [...o.slice(1), o[0]]);
        setDropping(null);
      }, 620);
    }, delay);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(swapTimer);
    };
  }, [reduce, paused, count, delay]);

  return (
    <div
      className={`rb-swap ${className}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {cards.map((card, idx) => {
        const isDropping = dropping === idx;
        /* While the front card drops, everyone behind it steps forward. The
           drop also sinks it behind the whole stack in z, so on its way back
           to the last slot it never crosses in front of the other cards. */
        let slot = order.indexOf(idx);
        if (dropping !== null && !isDropping) slot -= 1;
        const zIndex = isDropping ? count + 1 : count - slot;
        const pose = isDropping
          ? { x: 0, y: 420, z: -(count + 1) * 60, rotateZ: -4, opacity: 0 }
          : {
              x: -slot * distX,
              y: -slot * distY,
              z: -slot * 60,
              rotateZ: 0,
              opacity: slot > 2 ? 0 : 1 - slot * 0.12,
            };
        return (
          <motion.div
            key={idx}
            className="rb-swap-card"
            initial={false}
            animate={pose}
            transition={
              isDropping
                ? { duration: 0.6, ease: [0.55, 0, 0.75, 0.2] }
                : { type: "spring", stiffness: 140, damping: 20, mass: 0.9 }
            }
            style={{ zIndex }}
          >
            {card}
          </motion.div>
        );
      })}
    </div>
  );
}
