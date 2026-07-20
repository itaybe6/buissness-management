export function avatarCoverScale(naturalWidth: number, naturalHeight: number, viewport: number): number {
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

export function clampAvatarOffset(
  naturalWidth: number,
  naturalHeight: number,
  viewport: number,
  scale: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const sw = viewport / scale;
  const sh = viewport / scale;
  const sx = naturalWidth / 2 + (-viewport / 2 - offsetX) / scale;
  const sy = naturalHeight / 2 + (-viewport / 2 - offsetY) / scale;
  const sxClamped = Math.min(Math.max(sx, 0), Math.max(0, naturalWidth - sw));
  const syClamped = Math.min(Math.max(sy, 0), Math.max(0, naturalHeight - sh));
  return {
    x: -viewport / 2 - (sxClamped - naturalWidth / 2) * scale,
    y: -viewport / 2 - (syClamped - naturalHeight / 2) * scale,
  };
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא ניתן לטעון את התמונה"));
    };
    img.src = url;
  });
}

export async function cropAvatarToFile(
  image: HTMLImageElement,
  options: {
    viewportPx: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    outputSize?: number;
    quality?: number;
  },
): Promise<File> {
  const { viewportPx, scale, offsetX, offsetY, outputSize = 512, quality = 0.88 } = options;
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  const sw = viewportPx / scale;
  const sh = viewportPx / scale;
  const sx = nw / 2 + (-viewportPx / 2 - offsetX) / scale;
  const sy = nh / 2 + (-viewportPx / 2 - offsetY) / scale;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("דפדפן זה לא תומך בעריכת תמונות");

  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("שמירת התמונה נכשלה"))), "image/jpeg", quality);
  });

  return new File([blob], "avatar.jpg", { type: "image/jpeg", lastModified: Date.now() });
}
