// Copies the recorded videos into the app (public/tutorials/<series>/), cuts a
// poster frame for each, and writes public/tutorials/manifest.json — the list
// the סרטוני הדרכה page reads. Run after `node record.mjs`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import { SERIES } from "./scenes/index.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "..", "public", "tutorials");
/** Seconds into the video for the poster: past the title card, on the first app screen. */
const POSTER_AT = 4.2;

const manifest = {};
for (const [series, scenes] of Object.entries(SERIES)) {
  manifest[series] = [];
  mkdirSync(path.join(PUBLIC, series), { recursive: true });
  for (const scene of scenes) {
    const src = path.join(ROOT, "out", series, `${scene.id}.mp4`);
    if (!existsSync(src)) {
      console.warn(`skip ${series}/${scene.id} — not recorded`);
      continue;
    }
    // ffmpeg on Windows struggles with the Hebrew repo path — work in the temp dir.
    const tmp = mkdtempSync(path.join(os.tmpdir(), "publish-"));
    copyFileSync(src, path.join(tmp, "in.mp4"));
    const probe = spawnSync(ffmpeg, ["-i", "in.mp4"], { cwd: tmp, encoding: "utf8" }).stderr;
    const [, h, m, s] = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const duration = Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 10) / 10;
    spawnSync(ffmpeg, ["-y", "-ss", String(POSTER_AT), "-i", "in.mp4", "-frames:v", "1", "-vf", "scale=520:-2", "-q:v", "3", "poster.jpg"], { cwd: tmp });
    copyFileSync(path.join(tmp, "in.mp4"), path.join(PUBLIC, series, `${scene.id}.mp4`));
    copyFileSync(path.join(tmp, "poster.jpg"), path.join(PUBLIC, series, `${scene.id}.jpg`));
    rmSync(tmp, { recursive: true, force: true });
    manifest[series].push({
      id: `${series}/${scene.id}`,
      title: scene.title,
      duration,
      src: `/tutorials/${series}/${scene.id}.mp4`,
      poster: `/tutorials/${series}/${scene.id}.jpg`,
    });
    console.log(`✓ ${series}/${scene.id}  ${duration}s`);
  }
}
writeFileSync(path.join(PUBLIC, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest → public/tutorials/manifest.json`);
