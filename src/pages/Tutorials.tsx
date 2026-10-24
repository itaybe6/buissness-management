import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyState, ErrorState, Icon, PageLoader } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { InkStage } from "@/components/bits";
import { useAuth } from "@/lib/auth";
import type { UserRole } from "@/types/database";

/** One recorded tutorial — written by tutorials/publish.mjs into public/tutorials/manifest.json. */
interface TutorialVideo {
  id: string;
  title: string;
  /** Seconds. */
  duration: number;
  src: string;
  poster: string;
}

type Series = "employee" | "manager";
type Manifest = Record<Series, TutorialVideo[]>;

const SERIES_LABEL: Record<Series, string> = { employee: "עובדים", manager: "הנהלה" };
/** Roles that also see the management series. */
const MANAGEMENT_ROLES: UserRole[] = ["manager", "department_manager", "office_manager"];
const WATCHED_KEY = "tutorials_watched";

function readWatched(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Tutorials() {
  const { profile } = useAuth();
  const isManagement = MANAGEMENT_ROLES.includes(profile?.role ?? "employee");
  const [series, setSeries] = useState<Series>(isManagement ? "manager" : "employee");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [watched, setWatched] = useState(readWatched);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tutorials-manifest"],
    queryFn: async () => {
      const res = await fetch("/tutorials/manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("manifest");
      return (await res.json()) as Manifest;
    },
    staleTime: Infinity,
  });

  const tabs: Series[] = isManagement ? ["employee", "manager"] : ["employee"];
  const videos = useMemo(() => data?.[series] ?? [], [data, series]);
  const totalMinutes = Math.max(1, Math.round(videos.reduce((s, v) => s + v.duration, 0) / 60));
  const open = openIndex != null ? videos[openIndex] : null;

  useEffect(() => {
    if (!open) return;
    setWatched((prev) => {
      if (prev.has(open.id)) return prev;
      const next = new Set(prev).add(open.id);
      try {
        localStorage.setItem(WATCHED_KEY, JSON.stringify([...next]));
      } catch {
        /* private mode — the mark just won't persist */
      }
      return next;
    });
  }, [open]);

  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="לא ניתן לטעון את סרטוני ההדרכה" onRetry={() => refetch()} />;

  return (
    <div className="pyx-page">
      <InkStage className="tut-hero">
        <div className="srx-bar">
          <h1 className="srx-page-title">סרטוני הדרכה</h1>
        </div>
        {videos.length > 0 && (
          <div className="tut-meta">
            {videos.length} סרטונים · {totalMinutes} דק׳ צפייה
          </div>
        )}
        {tabs.length > 1 && (
          <div className="usx-roles tut-tabs" role="tablist" aria-label="סדרת סרטונים">
            {tabs.map((s) => {
              const active = s === series;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="usx-role"
                  data-active={active}
                  onClick={() => setSeries(s)}
                >
                  {active && (
                    <motion.span
                      layoutId="tut-tab-pill"
                      className="usx-role-pill"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span>{SERIES_LABEL[s]}</span>
                  <b>{data[s]?.length ?? 0}</b>
                </button>
              );
            })}
          </div>
        )}
      </InkStage>

      <div className="tut-body">
        {videos.length === 0 ? (
          <EmptyState icon="smart_display" title="עוד אין סרטונים בסדרה הזו" />
        ) : (
          <div className="tut-grid">
            {videos.map((v, i) => (
              <button key={v.id} type="button" className="tut-card" onClick={() => setOpenIndex(i)}>
                <span className="tut-thumb">
                  <img src={v.poster} alt="" loading="lazy" />
                  <span className="tut-play" aria-hidden>
                    <Icon name="play_arrow" size={26} />
                  </span>
                  <span className="tut-time">{formatDuration(v.duration)}</span>
                </span>
                <span className="tut-info">
                  <span className="tut-num">{i + 1}</span>
                  <span className="tut-title">{v.title}</span>
                  {watched.has(v.id) && (
                    <span className="tut-watched" title="נצפה" aria-label="נצפה">
                      <Icon name="check_circle" size={18} />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!open}
        onClose={() => setOpenIndex(null)}
        title={open?.title}
        subtitle={open ? `${openIndex! + 1} מתוך ${videos.length}` : undefined}
        icon="smart_display"
        maxWidth={460}
        footer={
          <>
            <Button
              variant="secondary"
              icon="arrow_forward"
              disabled={!openIndex}
              onClick={() => setOpenIndex((i) => (i ? i - 1 : i))}
              className="flex-1"
            >
              הקודם
            </Button>
            <Button
              icon="arrow_back"
              disabled={openIndex == null || openIndex >= videos.length - 1}
              onClick={() => setOpenIndex((i) => (i != null && i < videos.length - 1 ? i + 1 : i))}
              className="flex-1"
            >
              הבא
            </Button>
          </>
        }
      >
        {open && (
          <video
            key={open.id}
            className="tut-video"
            src={open.src}
            poster={open.poster}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        )}
      </Modal>
    </div>
  );
}
