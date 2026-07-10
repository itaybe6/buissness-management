import { useEffect, useState } from "react";

/** Subscribe to a CSS media query. Safe for Vite CSR (no SSR). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Tailwind `md:` breakpoint — 768px and up. */
export function useIsMdUp(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
