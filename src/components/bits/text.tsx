import { useEffect, useRef, useState, type CSSProperties, type ElementType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/components/motion/shared-motion";

/* ════════════════════════════════════════════════════════════
   BlurText — words come out of a blur one after another.
   Split by words, not letters: Hebrew reads as words and a
   per-letter split would break up kerning on some fonts.
   ════════════════════════════════════════════════════════════ */
export function BlurText({
  text,
  as: Tag = "span",
  className = "",
  delay = 0,
  stagger = 0.07,
  duration = 0.6,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <Tag className={className}>{text}</Tag>;

  const words = text.split(" ");
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          aria-hidden
          className="rb-blur-word"
          initial={{ opacity: 0, filter: "blur(12px)", y: "0.35em" }}
          animate={{ opacity: 1, filter: "blur(0px)", y: "0em" }}
          transition={{ duration, delay: delay + i * stagger, ease: EASE_OUT }}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </Tag>
  );
}

/* ════════════════════════════════════════════════════════════
   ShinyText — a light sweep that crosses the text forever.
   Pure CSS (see .rb-shiny); speed is the sweep period.
   ════════════════════════════════════════════════════════════ */
export function ShinyText({
  children,
  className = "",
  speed = 4,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}) {
  return (
    <span className={`rb-shiny ${className}`} style={{ "--rb-shiny-speed": `${speed}s` } as CSSProperties}>
      {children}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   DecryptedText — characters scramble, then lock in place
   from the start of the string to its end.
   ════════════════════════════════════════════════════════════ */
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+=<>/";

export function DecryptedText({
  text,
  className = "",
  delay = 0,
  speed = 38,
  charset = GLYPHS,
}: {
  text: string;
  className?: string;
  delay?: number;
  /** ms per scramble tick */
  speed?: number;
  charset?: string;
}) {
  const reduce = useReducedMotion();
  const [out, setOut] = useState(reduce ? text : "");

  useEffect(() => {
    if (reduce) {
      setOut(text);
      return;
    }
    let tick = 0;
    let id = 0;
    const total = text.length * 3 + 4;
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        tick++;
        const locked = Math.floor(tick / 3);
        let s = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (i < locked || ch === " ") s += ch;
          else s += charset[Math.floor(Math.random() * charset.length)];
        }
        setOut(s);
        if (tick >= total) {
          window.clearInterval(id);
          setOut(text);
        }
      }, speed);
    }, delay * 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [text, delay, speed, charset, reduce]);

  return (
    <span className={`rb-decrypt ${className}`} aria-label={text}>
      <span aria-hidden>{out || " "}</span>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   CountUp — eases a number into view the first time it's seen,
   and re-tweens from the old value when `to` changes.
   ════════════════════════════════════════════════════════════ */
export function CountUp({
  to,
  from = 0,
  duration = 1.4,
  delay = 0,
  className = "",
  format = (v: number) => Math.round(v).toLocaleString("he-IL"),
}: {
  to: number;
  from?: number;
  duration?: number;
  delay?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(from);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      current.current = to;
      el.textContent = format(to);
      return;
    }

    let raf = 0;
    let timer = 0;
    const run = () => {
      const start = performance.now();
      const a = current.current;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / (duration * 1000));
        const e = 1 - Math.pow(1 - p, 4);
        const v = a + (to - a) * e;
        current.current = v;
        el.textContent = format(v);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    if (started.current) {
      run();
    } else {
      el.textContent = format(from);
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        started.current = true;
        timer = window.setTimeout(run, delay * 1000);
      });
      io.observe(el);
      return () => {
        io.disconnect();
        window.clearTimeout(timer);
        cancelAnimationFrame(raf);
      };
    }
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, reduce]);

  return <span ref={ref} className={`rb-countup ${className}`} />;
}

/* ════════════════════════════════════════════════════════════
   RotatingText — cycles words; each letter rolls in on a
   stagger inside a clipped line box.
   ════════════════════════════════════════════════════════════ */
export function RotatingText({
  words,
  interval = 2400,
  className = "",
  stagger = 0.028,
}: {
  words: string[];
  interval?: number;
  className?: string;
  stagger?: number;
}) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce || words.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => window.clearInterval(id);
  }, [reduce, words.length, interval]);

  const word = words[i] ?? "";
  return (
    <span className={`rb-rotate ${className}`} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={word} className="rb-rotate-word" aria-label={word}>
          {Array.from(word).map((ch, k) => (
            <motion.span
              key={k}
              aria-hidden
              className="rb-rotate-char"
              initial={reduce ? false : { y: "110%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={reduce ? undefined : { y: "-110%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26, delay: k * stagger }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
