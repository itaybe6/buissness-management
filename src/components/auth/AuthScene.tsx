import type { ReactNode } from "react";
import { DotGrid, SilkShader } from "@/components/bits";

/**
 * The dark "silk" stage shared by the sign-in and reset-password screens.
 *
 * Always dark regardless of the app theme — it's the front door, and the
 * shader needs the ink to glow against. Layers, back to front:
 * silk shader → springy dot grid → grain/vignette → content.
 *
 * Deliberately clean: no brand bar, marketing copy or feature strip, just
 * the glass panel centred on the stage.
 */

export function AuthScene({ children }: { children: ReactNode }) {
  return (
    <div className="lg-root">
      <div className="lg-bg" aria-hidden>
        <SilkShader className="lg-silk" intensity={1.1} />
        <DotGrid className="lg-dots" />
        <div className="lg-beam" />
        <div className="lg-grain" />
        <div className="lg-vignette" />
      </div>

      <main className="lg-stage">
        <section className="lg-panel-col">{children}</section>
      </main>

      <footer className="lg-foot">
        <div className="lg-copy">© {new Date().getFullYear()} AMI · ניהול עסקים חכם</div>
      </footer>
    </div>
  );
}
