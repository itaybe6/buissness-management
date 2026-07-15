import { useEffect, useRef, type ChangeEvent } from "react";
import { Icon } from "@/components/ui";
import { isVideoFile } from "@/lib/media";

export type MediaEntry = { file: File; preview: string; isVideo: boolean };

function revokeMediaEntries(entries: MediaEntry[]) {
  entries.forEach(({ preview }) => URL.revokeObjectURL(preview));
}

export function EventMediaPicker({
  media,
  onChange,
}: {
  media: MediaEntry[];
  onChange: (next: MediaEntry[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef(media);
  mediaRef.current = media;

  useEffect(() => () => revokeMediaEntries(mediaRef.current), []);

  function addFiles(next: FileList | null) {
    if (!next?.length) return;
    const entries = Array.from(next).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      isVideo: isVideoFile(file),
    }));
    onChange([...media, ...entries]);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeMedia(index: number) {
    const entry = media[index];
    if (entry) URL.revokeObjectURL(entry.preview);
    onChange(media.filter((_, i) => i !== index));
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {media.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-[13px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
        >
          <Icon name="perm_media" size={34} />
          <span className="text-[13.5px] font-semibold">העלאת תמונות וסרטונים</span>
          <span className="text-[12px]">ניתן לבחור כמה קבצים · הקבצים יכווצו לפני העלאה</span>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {media.map(({ preview, isVideo }, i) => (
              <div key={preview} className="relative aspect-square overflow-hidden rounded-[11px] border border-border bg-surface-2">
                {isVideo ? (
                  <>
                    <video src={preview} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 text-white">
                      <Icon name="play_circle" size={28} />
                    </span>
                  </>
                ) : (
                  <img src={preview} alt={`תמונה ${i + 1}`} className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(i)}
                  className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="הסרת קובץ"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-border bg-surface-2 text-text-3 hover:border-accent-2 hover:text-ink"
            >
              <Icon name="add" size={24} />
              <span className="text-[11px] font-semibold">הוספה</span>
            </button>
          </div>
          <div className="text-[12px] text-text-3">
            {media.length} קבצים נבחרו
            {media.some((m) => m.isVideo) && media.some((m) => !m.isVideo)
              ? " · תמונות וסרטונים"
              : media.every((m) => m.isVideo)
                ? " · סרטונים"
                : " · תמונות"}
          </div>
        </div>
      )}
    </div>
  );
}

export function revokeEventMediaEntries(entries: MediaEntry[]) {
  revokeMediaEntries(entries);
}
