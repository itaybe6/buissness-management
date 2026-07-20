import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import {
  avatarCoverScale,
  clampAvatarOffset,
  cropAvatarToFile,
} from "@/lib/cropAvatarImage";

const VIEWPORT = 280;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function AvatarCropModal({
  open,
  file,
  onClose,
  onConfirm,
  saving,
}: {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (cropped: File) => void | Promise<void>;
  saving?: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const coverScale = image ? avatarCoverScale(image.naturalWidth, image.naturalHeight, VIEWPORT) : 1;
  const displayScale = coverScale * zoom;

  const clampOffset = useCallback(
    (x: number, y: number, z: number) => {
      if (!image) return { x, y };
      const s = coverScale * z;
      return clampAvatarOffset(image.naturalWidth, image.naturalHeight, VIEWPORT, s, x, y);
    },
    [image, coverScale],
  );

  useEffect(() => {
    if (!open || !file) {
      setImage(null);
      setPreviewUrl(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setLoadError(null);
      return;
    }
    let cancelled = false;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setLoadError("לא ניתן לטעון את התמונה");
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [open, file]);

  useEffect(() => {
    setOffset((o) => clampOffset(o.x, o.y, zoom));
  }, [zoom, clampOffset]);

  function handleZoomChange(value: number) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    setZoom(z);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!image || saving) return;
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !image) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => clampOffset(o.x + dx, o.y + dy, zoom));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  async function handleSave() {
    if (!image) return;
    const cropped = await cropAvatarToFile(image, {
      viewportPx: VIEWPORT,
      scale: displayScale,
      offsetX: offset.x,
      offsetY: offset.y,
    });
    await onConfirm(cropped);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="התאמת תמונה"
      subtitle="גררו את התמונה והגדילו/הקטינו כדי למקם אותה בעיגול"
      icon="crop"
      maxWidth={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ביטול
          </Button>
          <Button
            icon="check"
            className="flex-1"
            loading={saving}
            disabled={!image || !!loadError}
            onClick={() => void handleSave()}
          >
            שמירת תמונה
          </Button>
        </>
      }
    >
      <div className="avatar-crop">
        {loadError ? (
          <p className="avatar-crop-error">{loadError}</p>
        ) : (
          <>
            <div
              className="avatar-crop-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              aria-label="גרירה להזזת התמונה"
            >
              {image && previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  className="avatar-crop-img"
                  style={{
                    width: image.naturalWidth * coverScale,
                    height: image.naturalHeight * coverScale,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
                  }}
                />
              ) : (
                <span className="avatar-crop-placeholder" aria-hidden />
              )}
              <span className="avatar-crop-ring" aria-hidden />
            </div>

            <label className="avatar-crop-zoom">
              <span className="avatar-crop-zoom-label">זום</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={!image || saving}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="avatar-crop-zoom-input"
              />
            </label>
            <p className="avatar-crop-hint">גררו בתוך העיגול כדי למקם את הפנים במרכז</p>
          </>
        )}
      </div>
    </Modal>
  );
}
