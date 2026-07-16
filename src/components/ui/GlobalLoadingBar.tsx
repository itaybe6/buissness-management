import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Fixed top progress bar that sweeps whenever any react-query
 * request (fetch or mutation) is in flight, anywhere in the app.
 * Appears only after a short delay so instant loads never flash it,
 * and lingers briefly so back-to-back requests read as one sweep.
 */
export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching + mutating > 0;
  const [active, setActive] = useState(false);

  useEffect(() => {
    const t = busy
      ? setTimeout(() => setActive(true), 180)
      : setTimeout(() => setActive(false), 260);
    return () => clearTimeout(t);
  }, [busy]);

  return (
    <div className="app-progress" data-active={active} aria-hidden="true">
      <span className="app-progress-bar" />
    </div>
  );
}
