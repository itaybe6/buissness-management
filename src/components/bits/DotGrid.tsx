import { useEffect, useRef } from "react";

/**
 * Springy dot lattice: the cursor pushes dots aside like jelly and lights
 * them up; a click sends a shockwave ring through the grid.
 *
 * The loop only runs while something is moving — once every dot has settled
 * and the cursor is still, it stops until the next pointer event. Touch
 * devices just get the static lattice (one draw, no listeners).
 */

interface DotGridProps {
  className?: string;
  gap?: number;
  size?: number;
  /** "r, g, b" of the resting dots. */
  baseRgb?: string;
  /** "r, g, b" of dots lit by the cursor. */
  activeRgb?: string;
  baseAlpha?: number;
  radius?: number;
  strength?: number;
}

export function DotGrid({
  className = "",
  gap = 28,
  size = 1.6,
  baseRgb = "255, 255, 255",
  activeRgb = "150, 165, 255",
  baseAlpha = 0.07,
  radius = 140,
  strength = 26,
}: DotGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const live = fine && !reduce;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let n = 0;
    /* Struct-of-arrays: home x/y, offset x/y, velocity x/y, glow. */
    let hx = new Float32Array(0);
    let hy = hx;
    let ox = hx;
    let oy = hx;
    let vx = hx;
    let vy = hx;
    let glow = hx;

    const pointer = { x: -9999, y: -9999, inside: false };
    const waves: { x: number; y: number; r: number; life: number }[] = [];

    function build() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.floor(w / gap) + 2;
      const rows = Math.floor(h / gap) + 2;
      const offX = (w - (cols - 1) * gap) / 2;
      const offY = (h - (rows - 1) * gap) / 2;
      n = cols * rows;
      hx = new Float32Array(n);
      hy = new Float32Array(n);
      ox = new Float32Array(n);
      oy = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      glow = new Float32Array(n);
      let i = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          hx[i] = offX + c * gap;
          hy[i] = offY + r * gap;
          i++;
        }
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${baseRgb}, ${baseAlpha})`;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (glow[i] > 0.02) continue;
        ctx.rect(hx[i] + ox[i] - size / 2, hy[i] + oy[i] - size / 2, size, size);
      }
      ctx.fill();
      for (let i = 0; i < n; i++) {
        const g = glow[i];
        if (g <= 0.02) continue;
        const s = size + g * 1.6;
        ctx.fillStyle = `rgba(${activeRgb}, ${baseAlpha + g * 0.85})`;
        ctx.beginPath();
        ctx.arc(hx[i] + ox[i], hy[i] + oy[i], s / 2 + 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    let raf = 0;
    let last = 0;

    function step(now: number) {
      raf = 0;
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      const r2 = radius * radius;
      let energy = 0;

      for (let k = waves.length - 1; k >= 0; k--) {
        const wv = waves[k];
        wv.r += 900 * dt;
        wv.life -= dt * 1.4;
        if (wv.life <= 0) waves.splice(k, 1);
      }

      for (let i = 0; i < n; i++) {
        const px = hx[i] + ox[i];
        const py = hy[i] + oy[i];
        let target = 0;

        if (pointer.inside) {
          const dx = px - pointer.x;
          const dy = py - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1;
            const f = 1 - d / radius;
            /* Settles at ~strength * 0.6px of displacement right under the cursor. */
            const push = f * f * strength * 0.055;
            vx[i] += (dx / d) * push;
            vy[i] += (dy / d) * push;
            target = f;
          }
        }

        for (let k = 0; k < waves.length; k++) {
          const wv = waves[k];
          const dx = hx[i] - wv.x;
          const dy = hy[i] - wv.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const band = 1 - Math.abs(d - wv.r) / 60;
          if (band > 0) {
            vx[i] += (dx / d) * band * wv.life * 1.6;
            vy[i] += (dy / d) * band * wv.life * 1.6;
            target = Math.max(target, band * wv.life);
          }
        }

        /* Spring home, damped. */
        vx[i] += -ox[i] * 0.09;
        vy[i] += -oy[i] * 0.09;
        vx[i] *= 0.82;
        vy[i] *= 0.82;
        ox[i] += vx[i];
        oy[i] += vy[i];
        glow[i] += (target - glow[i]) * 0.18;

        energy += Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(ox[i]) * 0.1 + glow[i];
      }

      draw();
      if (energy > 0.4 || waves.length || pointer.inside) schedule();
    }

    function schedule() {
      if (!raf && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(step);
      }
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse" || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
      schedule();
    }

    function onDown(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      /* Don't ripple behind form fields / buttons. */
      if ((e.target as Element | null)?.closest("input, button, a, label, textarea, select")) return;
      waves.push({ x, y, r: 0, life: 1 });
      schedule();
    }

    function onLeave() {
      pointer.inside = false;
      schedule();
    }

    build();
    draw();

    const ro = new ResizeObserver(() => {
      build();
      draw();
    });
    ro.observe(canvas);

    if (live) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [gap, size, baseRgb, activeRgb, baseAlpha, radius, strength]);

  return <canvas ref={canvasRef} className={`rb-dotgrid ${className}`} aria-hidden />;
}
