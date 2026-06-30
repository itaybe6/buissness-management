function pickRecorderMimeType(): string | null {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא ניתן לטעון את הסרטון"));
    };
    video.src = url;
  });
}

function scaleDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(2, Math.round(width * ratio)),
    height: Math.max(2, Math.round(height * ratio)),
  };
}

/** Re-encode video in the browser to reduce size before upload. Falls back to the original file on failure. */
export async function compressVideo(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; bitrate?: number; fps?: number },
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 720, bitrate = 900_000, fps = 24 } = options ?? {};

  if (typeof MediaRecorder === "undefined") return file;

  const mimeType = pickRecorderMimeType();
  if (!mimeType) return file;

  let sourceUrl: string | null = null;
  try {
    const video = await loadVideo(file);
    sourceUrl = video.src;

    const needsResize =
      video.videoWidth > maxWidth ||
      video.videoHeight > maxHeight ||
      file.size > 2 * 1024 * 1024;

    if (!needsResize) {
      URL.revokeObjectURL(sourceUrl);
      return file;
    }

    const { width, height } = scaleDimensions(video.videoWidth, video.videoHeight, maxWidth, maxHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(sourceUrl);
      return file;
    }

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] }));
      recorder.onerror = () => reject(new Error("כיווץ הסרטון נכשל"));

      recorder.start(250);
      video.currentTime = 0;

      const draw = () => {
        if (video.ended) return;
        ctx.drawImage(video, 0, 0, width, height);
        requestAnimationFrame(draw);
      };

      video.onended = () => {
        ctx.drawImage(video, 0, 0, width, height);
        recorder.stop();
      };

      void video.play().then(draw).catch(reject);
    });

    URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;

    if (blob.size >= file.size) return file;

    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "fault";
    return new File([blob], `${baseName}.${ext}`, {
      type: mimeType.split(";")[0],
      lastModified: Date.now(),
    });
  } catch {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    return file;
  }
}
