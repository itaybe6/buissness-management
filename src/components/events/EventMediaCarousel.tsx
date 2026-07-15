import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import { isVideoUrl } from "@/lib/media";

function MediaItem({ url, alt }: { url: string; alt?: string }) {
  if (isVideoUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="relative block h-full w-full bg-black">
        <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        <span className="absolute inset-0 grid place-items-center bg-black/35 text-white">
          <Icon name="play_circle" size={44} />
        </span>
      </a>
    );
  }
  return <img src={url} alt={alt ?? "מדיה"} className="h-full w-full object-cover" />;
}

export function EventMediaCarousel({ urls, tall }: { urls: string[]; tall?: boolean }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);
  const count = urls.length;

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, count - 1)));
  }, [count]);

  function go(delta: number) {
    setIndex((i) => (i + delta + count) % count);
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
    touchStart.current = null;
  }

  if (count === 0) return null;

  return (
    <div
      className={`fault-media group relative w-full overflow-hidden bg-surface-2 ${tall ? "fault-media--tall" : "h-36"}`}
      onTouchStart={count > 1 ? onTouchStart : undefined}
      onTouchEnd={count > 1 ? onTouchEnd : undefined}
    >
      <div key={index} className="absolute inset-0 animate-fadeIn">
        <MediaItem url={urls[index]} />
      </div>

      {count > 1 && (
        <>
          <span className="fault-media-scrim" aria-hidden />
          <span className="fault-media-count">
            {index + 1}/{count}
          </span>

          <button
            type="button"
            onClick={() => go(-1)}
            className="fault-media-nav fault-media-nav--prev"
            aria-label="תמונה קודמת"
          >
            <Icon name="chevron_right" size={22} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="fault-media-nav fault-media-nav--next"
            aria-label="תמונה הבאה"
          >
            <Icon name="chevron_left" size={22} />
          </button>

          <div className="fault-media-dots">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`תמונה ${i + 1}`}
                aria-current={i === index}
                className={`fault-media-dot ${i === index ? "fault-media-dot--active" : ""}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
