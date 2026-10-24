// Dev helper: a contact sheet (one frame every N seconds) to review a video.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
const [file, every = "2.5", cols = "6"] = process.argv.slice(2);
const tmp = mkdtempSync(path.join(os.tmpdir(), "sheet-"));
copyFileSync(file, path.join(tmp, "in.mp4"));
const r = spawnSync(ffmpeg, ["-y", "-i", "in.mp4", "-vf", `fps=1/${every},scale=260:-1,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black,tile=${cols}x4`, "sheet%02d.png"], { cwd: tmp, encoding: "utf8" });
if (r.status) console.log(r.stderr.slice(-800));
const dur = spawnSync(ffmpeg, ["-i", "in.mp4"], { cwd: tmp, encoding: "utf8" }).stderr.match(/Duration: ([\d:.]+)/)?.[1];
const base = path.basename(file, ".mp4");
for (const n of ["01", "02", "03"]) {
  try { copyFileSync(path.join(tmp, `sheet${n}.png`), `shots/sheet-${base}-${n}.png`); console.log(`shots/sheet-${base}-${n}.png`); } catch {}
}
console.log("duration", dur);
