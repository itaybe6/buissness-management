import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { SilkShader } from "./SilkShader";

/**
 * The silver silk that runs behind every ink hero in the app — the in-app
 * echo of the sign-in stage.
 *
 * `HeroSilk` is the bare layer (silk shader + dot field + lit bottom rim),
 * dropped as the first child of any existing hero; `InkStage` is a complete
 * full-bleed hero built around it. On phones the silk only fades out across
 * the status-bar strip (see pages.css), so the OS bar meets flat ink.
 * Colours follow the theme (the shader reads its palette once, so it's keyed
 * by theme).
 */
type RGB = [number, number, number];

const INK_BASE: Record<"light" | "dark", RGB> = {
  light: [0.141, 0.169, 0.22],
  dark: [0.157, 0.18, 0.227],
};

/* Cool silver light — the app is ink-on-grey, so no purple cast. */
const SILVER: RGB = [0.6, 0.65, 0.76];

export function HeroSilk({ base, intensity = 0.75 }: { base?: RGB; intensity?: number }) {
  const { theme } = useTheme();
  return (
    <div className="hero-silk" aria-hidden>
      <SilkShader
        key={theme}
        className="ink-stage-silk"
        base={base ?? INK_BASE[theme]}
        glow={SILVER}
        sheen={[0.92, 0.94, 0.98]}
        intensity={intensity}
        vignette={0}
        resolution={0.4}
      />
      <span className="ink-stage-dots" />
      <span className="ink-stage-sheen" />
    </div>
  );
}

export function InkStage({
  className = "",
  children,
  intensity = 0.75,
}: {
  className?: string;
  children: ReactNode;
  intensity?: number;
}) {
  return (
    <section className={`ink-stage ${className}`}>
      <HeroSilk intensity={intensity} />
      <div className="ink-stage-inner">{children}</div>
    </section>
  );
}
