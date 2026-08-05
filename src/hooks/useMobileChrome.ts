import { useLayoutEffect } from "react";

type MobileChrome = "surface" | "ink" | "worker" | "sidebar";

const CHROME_THEME_COLOR: Record<MobileChrome, { light: string; dark: string }> = {
  surface: { light: "#ffffff", dark: "#151c28" },
  ink: { light: "#242b38", dark: "#282e3a" },
  worker: { light: "#191e25", dark: "#191e25" },
  sidebar: { light: "#151c28", dark: "#1c2432" },
};

interface UseMobileChromeOptions {
  menuOpen: boolean;
  inkHero: boolean;
  inkHeaderSolid: boolean;
  workerHero?: boolean;
  theme: "light" | "dark";
}

/** Syncs status-bar / overscroll chrome with the visible mobile header or drawer. */
export function useMobileChrome({
  menuOpen,
  inkHero,
  inkHeaderSolid,
  workerHero = false,
  theme,
}: UseMobileChromeOptions) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(max-width: 767px)");

    function resolve(): MobileChrome {
      if (!mq.matches) return "surface";
      if (menuOpen) return "sidebar";
      if (workerHero && !inkHeaderSolid) return "worker";
      if (inkHero && !inkHeaderSolid) return "ink";
      return "surface";
    }

    function apply() {
      const chrome = resolve();
      root.setAttribute("data-mobile-chrome", chrome);

      const themeColor = CHROME_THEME_COLOR[chrome][theme];
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);

      const statusBarStyle =
        chrome === "surface" && theme === "light" ? "default" : "black-translucent";
      document
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        ?.setAttribute("content", statusBarStyle);
    }

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.removeAttribute("data-mobile-chrome");
    };
  }, [menuOpen, inkHero, inkHeaderSolid, workerHero, theme]);
}
