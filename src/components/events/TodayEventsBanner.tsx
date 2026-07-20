import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useBusinessId } from "@/lib/db";
import { useEvents } from "@/api/events";
import { daysUntilEvent } from "@/components/events/eventTime";
import { isVideoUrl } from "@/lib/media";
import type { EventRecord } from "@/types/database";

/** Poster background for the card — first image wins, then video, then the aurora fallback. */
function Cover({ media }: { media: string[] }) {
  const [failed, setFailed] = useState(false);
  const url = media.find((u) => !isVideoUrl(u)) ?? media[0] ?? null;

  if (!url || failed) {
    return (
      <span className="tdev-poster" aria-hidden>
        <span className="evt-poster-aurora evt-poster-aurora--1" />
        <span className="evt-poster-aurora evt-poster-aurora--2" />
        <span className="evt-poster-grid" />
      </span>
    );
  }

  if (isVideoUrl(url)) {
    return <video src={url} muted playsInline preload="metadata" onError={() => setFailed(true)} />;
  }

  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function TodayEventCard({ event, from }: { event: EventRecord; from: string }) {
  const media = event.media_urls ?? [];

  return (
    <Link
      to={`/events/${event.id}`}
      state={{ from, fromLabel: "דשבורד" }}
      className="tdev-card"
      aria-label={`אירוע היום: ${event.title}`}
    >
      <span className="tdev-media" aria-hidden>
        <Cover media={media} />
      </span>
      <span className="tdev-scrim" aria-hidden />
      <span className="tdev-sheen" aria-hidden />

      <div className="tdev-content">
        <span className="tdev-pill">
          <span className="evt-live-dot" aria-hidden />
          קורה היום
        </span>
        <h3 className="tdev-title">{event.title}</h3>
        {event.description && <p className="tdev-desc">{event.description}</p>}
      </div>

      <span className="tdev-cta" aria-hidden>
        <Icon name="chevron_left" size={20} />
      </span>
    </Link>
  );
}

/**
 * Events happening today, surfaced on the worker and manager dashboards.
 * Renders nothing when the events module is off or nothing is on today.
 */
export function TodayEventsBanner() {
  const businessId = useBusinessId();
  const { hasFeature } = useAuth();
  const location = useLocation();
  const enabled = hasFeature("events");
  const { data: events = [] } = useEvents(enabled ? businessId : null);

  const todays = useMemo(
    () => events.filter((e) => daysUntilEvent(e.event_date) === 0),
    [events],
  );

  if (!enabled || todays.length === 0) return null;

  return (
    <section className="tdev" aria-label={todays.length === 1 ? "האירוע של היום" : "האירועים של היום"}>
      {todays.length > 1 && (
        <p className="tdev-head">
          <Icon name="celebration" size={15} />
          {todays.length} אירועים היום
        </p>
      )}
      {todays.map((e) => (
        <TodayEventCard key={e.id} event={e} from={`${location.pathname}${location.search}`} />
      ))}
    </section>
  );
}
