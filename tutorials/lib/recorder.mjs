// Screen capture through the Chrome DevTools screencast: full device-pixel
// frames written to disk as they arrive, then stitched into a constant-rate
// H.264 MP4 with ffmpeg. Frames and the encode live under the OS temp dir —
// ffmpeg on Windows is unreliable with the Hebrew characters in the repo path.

import { writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { writeMusicWav } from "./music.mjs";

export async function startScreencast(page, name, { width, height }) {
  const dir = path.join(os.tmpdir(), "tutorial-frames", name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  const writes = [];
  let badSize = null;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    // Every frame must be exactly the phone screen, or the video gets stretched.
    const buf = Buffer.from(data, "base64");
    const size = jpegSize(buf);
    if (size && (size.width !== width || size.height !== height)) badSize ??= `${size.width}x${size.height}`;
    const file = `${String(frames.length).padStart(6, "0")}.jpg`;
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 });
    writes.push(writeFile(path.join(dir, file), buf));
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width, maxHeight: height, everyNthFrame: 1 });

  return {
    dir,
    frames,
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await Promise.all(writes);
      if (badSize) throw new Error(`screencast frames are ${badSize}, expected ${width}x${height}`);
    },
  };
}

/** Width/height from a JPEG's SOF marker (null when not found). */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function run(args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}):\n${err.slice(-1500)}`))));
  });
}

/**
 * Encode captured frames between wall-clock seconds `from` and `to` into `outFile`.
 * Screencast frames only arrive when the screen changes, so each frame is held
 * until the next one (concat demuxer durations) and ffmpeg resamples to 30 fps.
 */
export async function encode(cast, { from, to, outFile, width, height }) {
  const frames = cast.frames;
  if (!frames.length) throw new Error("no frames captured");
  let first = frames.findLastIndex((f) => f.t <= from);
  if (first < 0) first = 0;
  const lines = [];
  for (let i = first; i < frames.length; i++) {
    const start = Math.max(frames[i].t, from);
    const end = Math.min(i + 1 < frames.length ? frames[i + 1].t : to, to);
    if (end <= start) continue;
    lines.push(`file '${frames[i].file}'`, `duration ${(end - start).toFixed(4)}`);
    if (end >= to) break;
  }
  // concat demuxer ignores the last duration unless the file is repeated
  lines.push(lines[lines.length - 2]);
  await writeFile(path.join(cast.dir, "list.txt"), lines.join("\n"));
  const tmpOut = path.join(cast.dir, "out.mp4");
  // Background music cut to the video's exact length (fades are baked in).
  await writeMusicWav(path.join(cast.dir, "music.wav"), to - from);
  await run(
    [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-i", "music.wav",
      "-map", "0:v",
      "-map", "1:a",
      "-vf", `fps=30,scale=${width}:${height}:flags=lanczos,setsar=1,format=yuv420p`,
      "-af", "loudnorm=I=-20:TP=-2:LRA=7",
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      "out.mp4",
    ],
    cast.dir,
  );
  await copyFile(tmpOut, outFile);
  await rm(cast.dir, { recursive: true, force: true });
}
