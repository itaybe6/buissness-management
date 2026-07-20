import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { isVideoUrl } from "@/lib/media";

/**
 * Hero carousel for the event detail poster.
 * Touch-first: swipe to move, dots to jump. Arrows appear only from md up,
 * where there is no swipe affordance. Styling lives in the .evtd-car-* layer.
 */
function Slide({ url, active, index, total }: { url: string; active: boolean; index: number; total: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="evtd-car-fallback" aria-hidden>
        <Icon name="image_not_supported" size={34} />
      </span>
    );
  }

  if (isVideoUrl(url)) {
    return (
      <>
        <video
          src={url}
          className="evtd-car-media"
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="evtd-car-play"
          aria-label="הפעלת הסרטון"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="play_arrow" size={30} />
        </a>
      </>
    );
  }

  return (
    <img
      src={url}
      alt={total > 1 ? `תמונה ${index + 1} מתוך ${total}` : "תמונת האירוע"}
      className="evtd-car-media"
      loading={active ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  );
}

export function EventMediaCarousel({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const count = urls.length;

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  function go(delta: number) {
    setIndex((i) => (i + delta + count) % count);
  }

  function onTouchStart(e: React.TouchEvent) {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    // Ignore mostly-vertical gestures so page scrolling still feels natural.
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    start.current = null;
  }

  if (count === 0) return null;

  return (
    <div
      className="evtd-car"
      onTouchStart={count > 1 ? onTouchStart : undefined}
      onTouchEnd={count > 1 ? onTouchEnd : undefined}
    >
      {urls.map((url, i) => (
        <div key={url} className="evtd-car-slide" data-active={i === index || undefined} aria-hidden={i !== index}>
          <Slide url={url} active={i === index} index={i} total={count} />
        </div>
      ))}

      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} className="evtd-car-nav evtd-car-nav--prev" aria-label="תמונה קודמת">
            <Icon name="chevron_right" size={20} />
          </button>
          <button type="button" onClick={() => go(1)} className="evtd-car-nav evtd-car-nav--next" aria-label="תמונה הבאה">
            <Icon name="chevron_left" size={20} />
          </button>

          <div className="evtd-car-dots" role="tablist" aria-label="מדיה של האירוע">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                role="tab"
                onClick={() => setIndex(i)}
                aria-label={`תמונה ${i + 1}`}
                aria-selected={i === index}
                className="evtd-car-dot"
                data-active={i === index || undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
