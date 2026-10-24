import { useEffect, useRef, useState } from "react";

/**
 * Flowing "silk / dark veil" backdrop — a single full-screen fragment shader
 * (domain-warped fbm folded into soft light bands) in the app's ink palette.
 *
 * Built for a screen many people open on cheap phones:
 *  - renders at a fraction of the CSS size (`resolution`) and lets the GPU
 *    upscale — the image is all soft gradients, so nothing visibly softens;
 *  - stops the loop while the tab is hidden or the canvas is off-screen;
 *  - draws one still frame under `prefers-reduced-motion`;
 *  - falls back to a CSS gradient (`.rb-silk--fallback`) without WebGL.
 */

type RGB = [number, number, number];

interface SilkShaderProps {
  className?: string;
  /** Base ink the veil sits on. 0..1 per channel. */
  base?: RGB;
  /** Main glow hue. */
  glow?: RGB;
  /** Bright sheen on the band crests. */
  sheen?: RGB;
  speed?: number;
  /** Overall brightness multiplier. */
  intensity?: number;
  /** 0 = flat edges (for in-page heroes), 1 = full corner falloff. */
  vignette?: number;
  /** Render scale vs. CSS pixels (before DPR). */
  resolution?: number;
  /** Bend the light around the mouse. */
  interactive?: boolean;
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform vec3 uBase;
uniform vec3 uGlow;
uniform vec3 uSheen;
uniform float uIntensity;
uniform float uVignette;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes.xy) / uRes.y;
  float t = uTime * 0.055;

  vec2 m = (uMouse - 0.5 * uRes.xy) / uRes.y;
  float md = length(p - m);
  float lens = exp(-md * md * 5.0) * uMouseOn;
  p += (p - m) * 0.22 * lens;

  vec2 q = vec2(fbm(p * 1.35 + t), fbm(p * 1.35 - t + 3.1));
  vec2 r = vec2(fbm(p * 1.7 + 2.0 * q + vec2(1.7, 9.2) + t * 1.3),
                fbm(p * 1.7 + 2.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.15 + 2.4 * r);

  /* Domain-warped fbm skews low (median ~0.28) — stretch it to 0..1. */
  float fn = clamp((f - 0.12) / 0.5, 0.0, 1.0);

  float bands = sin((p.x * 0.9 + p.y * 2.3 + f * 4.2 + t * 2.4) * 3.14159);
  float crest = smoothstep(0.55, 1.0, bands) * smoothstep(0.35, 0.9, fn);

  vec3 col = mix(uBase, uGlow * 0.55, smoothstep(0.0, 1.0, fn));
  col += uSheen * crest * 0.55;
  col += uGlow * fn * fn * 0.45;
  col += uGlow * lens * 0.25;
  col *= uIntensity;
  /* Soft shoulder so the crests glow instead of clipping to white. */
  col = 1.0 - exp(-col * 1.4);

  float vig = smoothstep(1.3, 0.2, length((uv - 0.5) * vec2(1.25, 1.0)) * 1.35);
  col *= mix(1.0 - 0.65 * uVignette, 1.0, vig);

  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function SilkShader({
  className = "",
  base = [0.02, 0.024, 0.04],
  glow = [0.47, 0.53, 1.0],
  sheen = [0.86, 0.9, 1.0],
  speed = 1,
  intensity = 1,
  vignette = 1,
  resolution = 0.5,
  interactive = true,
}: SilkShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  /* Colours are read once; callers pass literals. */
  const colors = useRef({ base, glow, sheen });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      setFailed(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uMouseOn = gl.getUniformLocation(prog, "uMouseOn");
    gl.uniform3fv(gl.getUniformLocation(prog, "uBase"), colors.current.base);
    gl.uniform3fv(gl.getUniformLocation(prog, "uGlow"), colors.current.glow);
    gl.uniform3fv(gl.getUniformLocation(prog, "uSheen"), colors.current.sheen);
    gl.uniform1f(gl.getUniformLocation(prog, "uIntensity"), intensity);
    gl.uniform1f(gl.getUniformLocation(prog, "uVignette"), vignette);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scale = 1;

    function resize() {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      scale = dpr * resolution;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    }

    /* Mouse in canvas pixels (GL y is bottom-up); eased toward the target. */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0, on: 0, ton: 0 };

    function onMove(e: PointerEvent) {
      if (e.pointerType !== "mouse" || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouse.tx = (e.clientX - rect.left) * scale;
      mouse.ty = (rect.height - (e.clientY - rect.top)) * scale;
      mouse.ton =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
          ? 1
          : 0;
      if (mouse.on === 0 && mouse.x === 0) {
        mouse.x = mouse.tx;
        mouse.y = mouse.ty;
      }
    }
    function onLeave() {
      mouse.ton = 0;
    }

    let raf = 0;
    let visible = true;
    let last = performance.now();
    /* Start mid-flow so the first frame already has structure. */
    let t = 14;

    function frame(now: number) {
      raf = 0;
      if (!gl) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * speed;
      const k = 1 - Math.pow(0.0015, dt);
      mouse.x += (mouse.tx - mouse.x) * k;
      mouse.y += (mouse.ty - mouse.y) * k;
      mouse.on += (mouse.ton - mouse.on) * k * 0.6;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uMouseOn, mouse.on);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      schedule();
    }

    function schedule() {
      if (raf || reduce || !visible || document.hidden) return;
      raf = requestAnimationFrame(frame);
    }

    function drawStill() {
      if (!gl) return;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, 0, 0);
      gl.uniform1f(uMouseOn, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce || !raf) drawStill();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = performance.now();
      schedule();
    });
    io.observe(canvas);

    function onVisibility() {
      last = performance.now();
      schedule();
    }
    document.addEventListener("visibilitychange", onVisibility);

    if (interactive && !reduce) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }

    resize();
    drawStill();
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      /* Free GPU objects but keep the context: StrictMode remounts onto the
         same <canvas>, and a lost context can't be fetched again. */
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [interactive, resolution, speed, intensity, vignette]);

  return (
    <div className={`rb-silk ${failed ? "rb-silk--fallback" : ""} ${className}`} aria-hidden>
      {!failed && <canvas ref={canvasRef} className="rb-silk-canvas" />}
    </div>
  );
}
