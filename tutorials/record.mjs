// Records the tutorial videos.
//   node record.mjs                 → every scene
//   node record.mjs employee        → one series
//   node record.mjs employee/02     → scenes whose id starts with this
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openPhone } from "./lib/harness.mjs";
import { SERIES } from "./scenes/index.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const filter = process.argv[2] ?? "";
const jobs = Object.entries(SERIES).flatMap(([series, scenes]) =>
  scenes.map((s) => ({ ...s, key: `${series}/${s.id}`, series })),
).filter((s) => s.key.startsWith(filter));

if (!jobs.length) {
  console.error(`no scene matches "${filter}"`);
  process.exit(1);
}

for (const job of jobs) {
  const outFile = path.join(ROOT, "out", job.series, `${job.id}.mp4`);
  await mkdir(path.dirname(outFile), { recursive: true });
  const t0 = Date.now();
  process.stdout.write(`● ${job.key} — ${job.title} … `);
  const phone = await openPhone({ userId: job.user, outFile, time: job.time, mutate: job.mutate });
  try {
    await job.run(phone);
  } catch (e) {
    await phone.page.screenshot({ path: path.join(ROOT, "shots", `fail-${job.id}.png`) }).catch(() => {});
    // What was on screen when it failed — the quickest way to fix a selector.
    const ui = await phone.page
      .evaluate(() =>
        [...document.querySelectorAll("button, [role=tab], input, textarea, select, label")]
          .filter((el) => el.getClientRects().length)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}: ${(el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent).replace(/\s+/g, " ").trim().slice(0, 70)}`),
      )
      .catch(() => []);
    await writeFile(path.join(ROOT, "shots", `fail-${job.id}.txt`), [...new Set(ui)].join("\n")).catch(() => {});
    await phone.close().catch(() => {});
    console.log("FAILED");
    throw e;
  }
  await phone.close();
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s → out/${job.series}/${job.id}.mp4`);
}
