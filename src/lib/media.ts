const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|mkv|quicktime)$/i;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export function isVideoUrl(url: string): boolean {
  return VIDEO_EXT_RE.test(url.split("?")[0]);
}
