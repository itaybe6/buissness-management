import { useLayoutEffect } from "react";

type MobileChrome = "surface" | "ink" | "worker" | "sidebar" | "auth";

const CHROME_THEME_COLOR: Record<MobileChrome, { light: string; dark: string }> = {
  surface: { light: "#ffffff", dark: "#151c28" },
  ink: { light: "#242b38", dark: "#282e3a" },
  worker: { light: "#191e25", dark: "#191e25" },
  sidebar: { light: "#151c28", dark: "#1c2432" },
  /* Auth screens have no header — the chrome matches --bg, the page itself. */
  auth: { light: "#f0f2f5", dark: "#0b0e16" },
};

/** Chromes light enough to keep the OS status bar in its dark-on-light style. */
const LIGHT_CHROME = new Set<MobileChrome>(["surface", "auth"]);

function applyChrome(chrome: MobileChrome, theme: "light" | "dark") {
  document.documentElement.setAttribute("data-mobile-chrome", chrome);

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", CHROME_THEME_COLOR[chrome][theme]);

  const statusBarStyle =
    LIGHT_CHROME.has(chrome) && theme === "light" ? "default" : "black-translucent";
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", statusBarStyle);
}

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
      applyChrome(resolve(), theme);
    }

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.removeAttribute("data-mobile-chrome");
    };
  }, [menuOpen, inkHero, inkHeaderSolid, workerHero, theme]);
}

/**
 * Pins one chrome for a page that renders outside the app shell (login, reset
 * password). Without it those pages keep whatever chrome the boot script left
 * on <html>, so the status-bar strip and the overscroll areas stay white while
 * the page itself paints --bg.
 */
export function usePageMobileChrome(chrome: MobileChrome, theme: "light" | "dark") {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(max-width: 767px)");

    function apply() {
      applyChrome(mq.matches ? chrome : "surface", theme);
    }

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      root.removeAttribute("data-mobile-chrome");
    };
  }, [chrome, theme]);
}
