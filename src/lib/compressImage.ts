function loadImage(file: File): Promise<HTMLImageElement> {
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

export async function compressImage(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.82 } = options ?? {};
  const img = await loadImage(file);

  let { width, height } = img;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("דפדפן זה לא תומך בכיווץ תמונות");

  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("כיווץ התמונה נכשל"))), "image/jpeg", quality);
  });

  const baseName = file.name.replace(/\.[^.]+$/, "") || "fault";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
