// Runs the built app in a phone-sized Chromium against the in-memory demo
// backend, records the screen, and gives scenes a small API for captions and
// visible taps. Nothing here talks to the real Supabase project: the app is
// built pointing at demo.supabase.co and every request to it is answered locally.

import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MockDb } from "./postgrest.mjs";
import { buildDemoData, DEMO_DATE, DEMO_TIME, ts } from "./demo-data.mjs";
import { OVERLAY_SCRIPT } from "./overlay.mjs";
import { startScreencast, encode } from "./recorder.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = path.join(ROOT, ".app");
export const APP_ORIGIN = "https://lemon-cafe.demo";
const SUPABASE = "https://demo.supabase.co";

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".json": "application/json",
};

/** A syntactically valid (unsigned) JWT so supabase-js treats the session as real. */
function fakeJwt(sub, email) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, role: "authenticated", aud: "authenticated", exp: 4102444800 })}.demo`;
}

function sessionFor(profile) {
  const user = {
    id: profile.id,
    aud: "authenticated",
    role: "authenticated",
    email: profile.email,
    email_confirmed_at: "2026-06-01T09:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: profile.full_name },
    created_at: "2026-06-01T09:00:00Z",
  };
  return {
    access_token: fakeJwt(profile.id, profile.email),
    refresh_token: "demo-refresh",
    token_type: "bearer",
    expires_in: 3600 * 24 * 365,
    expires_at: 4102444800,
    user,
  };
}

/**
 * Open a recording phone session.
 * @param {object} opts
 * @param {string} opts.userId   profile to sign in as (null = start on the login page)
 * @param {string} opts.outFile  final .mp4 path
 * @param {string} [opts.time]   HH:MM wall clock at start (default DEMO_TIME)
 */
export async function openPhone({ userId, outFile, time = DEMO_TIME, date = DEMO_DATE, mutate }) {
  const data = buildDemoData();
  mutate?.(data);
  const startMs = Date.parse(ts(date, time));
  const realStart = Date.now();
  // Rows the app creates get the demo clock, not today's real date.
  const db = new MockDb(data, () => new Date(startMs + (Date.now() - realStart)));

  const browser = await chromium.launch({ headless: true, executablePath: findHeadlessShell(), args: ["--force-device-scale-factor=2", "--lang=he-IL"] });
  const VIEW = { width: 390, height: 844 };
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    colorScheme: "light",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  });

  await context.clock.install({ time: startMs });

  const profile = userId ? data.profiles.find((p) => p.id === userId) : null;
  const unhandled = new Set();

  // ---- the app itself, served from the build -----------------------------------------
  await context.route(`${APP_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    let file = path.join(APP_DIR, decodeURIComponent(url.pathname));
    if (!path.extname(file) || !existsSync(file)) file = path.join(APP_DIR, "index.html");
    const body = await readFile(file);
    await route.fulfill({ status: 200, body, contentType: MIME[path.extname(file)] ?? "application/octet-stream" });
  });

  // ---- the fake Supabase -------------------------------------------------------------
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
      "access-control-expose-headers": "content-range",
    };
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (table.startsWith("rpc/")) {
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "null" });
      }
      const res = db.handle(method, table, url.searchParams, req.headers(), req.postData());
      return route.fulfill({ status: res.status, headers: { ...cors, ...res.headers }, body: res.body });
    }

    if (url.pathname.startsWith("/auth/v1/")) {
      const p = url.pathname.slice("/auth/v1/".length);
      if (p === "token") {
        // Password sign-in on the login screen: any demo email maps to its profile.
        const body = JSON.parse(req.postData() || "{}");
        const who = data.profiles.find((x) => x.email === body.email) ?? profile;
        if (!who) return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }) });
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(sessionFor(who)) });
      }
      if (p === "user") {
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(sessionFor(profile ?? data.profiles[0]).user) });
      }
      if (p === "logout") return route.fulfill({ status: 204, headers: cors });
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "{}" });
    }

    if (url.pathname.startsWith("/storage/v1/")) {
      if (method === "GET") {
        const local = path.join(ROOT, "assets", path.basename(url.pathname));
        if (existsSync(local)) {
          return route.fulfill({ status: 200, headers: cors, body: await readFile(local), contentType: MIME[path.extname(local)] });
        }
        return route.fulfill({ status: 404, headers: cors, body: "" });
      }
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ Key: "demo/upload", path: "demo/upload" }) });
    }

    if (url.pathname.startsWith("/functions/v1/")) {
      let result = { ok: true };
      if (url.pathname.endsWith("/create-user")) {
        // The real function creates an auth user and a DB trigger adds the profile — do the latter here.
        const body = JSON.parse(req.postData() || "{}");
        const id = randomUUID();
        const now = db.now().toISOString();
        db.table("profiles").push({
          id,
          business_id: data.businesses[0].id,
          department_id: body.department_id ?? null,
          full_name: body.full_name ?? null,
          avatar_url: null,
          email: body.email ?? null,
          phone: body.phone ?? null,
          role: body.role ?? "employee",
          hourly_rate: body.hourly_rate != null && body.hourly_rate !== "" ? Number(body.hourly_rate) : 35.4,
          wage_type: body.wage_type ?? "hourly",
          bonus_pct: 0,
          pension_active: !!body.pension_active,
          birth_date: null,
          active: true,
          created_at: now,
          updated_at: now,
        });
        result = { user: { id }, id };
      }
      return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(result) });
    }

    unhandled.add(`${method} ${url.pathname}`);
    return route.fulfill({ status: 404, headers: cors, body: "{}" });
  });

  // Fonts are the only outside requests allowed; everything else is cut off.
  await context.route(/^https?:\/\/(?!lemon-cafe\.demo|demo\.supabase\.co|fonts\.googleapis\.com|fonts\.gstatic\.com)/, (route) => {
    unhandled.add(`external ${route.request().url().slice(0, 80)}`);
    return route.abort();
  });

  await context.addInitScript(
    ({ session }) => {
      try {
        localStorage.setItem("avichai_theme", "light");
        if (session) localStorage.setItem("sb-demo-auth-token", JSON.stringify(session));
      } catch {}
    },
    { session: profile ? sessionFor(profile) : null },
  );
  await context.addInitScript(OVERLAY_SCRIPT);

  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn("[page error]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.warn("[console]", m.text().slice(0, 200));
  });

  const SIZE = { width: VIEW.width * 2, height: VIEW.height * 2 };
  const cast = outFile ? await startScreencast(page, path.basename(outFile, ".mp4"), SIZE) : null;
  /** Wall-clock second the finished video starts at (drops the blank loading frames). */
  let trimStart = Date.now() / 1000;

  const phone = {
    page,
    db,
    data,
    async goto(route) {
      await page.goto(`${APP_ORIGIN}${route}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await settle(page);
    },
    /** Mark where the finished video should begin (drops the blank loading frames). */
    markStart() {
      trimStart = Date.now() / 1000;
    },
    async wait(ms) {
      await page.waitForTimeout(ms);
    },
    async caption(text, holdMs = 0) {
      await page.evaluate((t) => window.__tut.caption(t), text);
      if (holdMs) await page.waitForTimeout(holdMs);
    },
    async hideCaption() {
      await page.evaluate(() => window.__tut.caption(null));
    },
    async titleCard(title, subtitle, holdMs = 2600) {
      await page.evaluate(([t, s]) => window.__tut.title(t, s), [title, subtitle]);
      await page.waitForTimeout(holdMs);
      await page.evaluate(() => window.__tut.title(null));
      await page.waitForTimeout(450);
    },
    async endCard(title, subtitle, holdMs = 2600) {
      await page.evaluate(([t, s]) => window.__tut.title(t, s, true), [title, subtitle]);
      await page.waitForTimeout(holdMs);
    },
    /** Show a tap ripple on the element, then tap it. */
    async tap(locator, { pause = 650 } = {}) {
      const loc = typeof locator === "string" ? page.locator(locator) : locator;
      await loc.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const box = await loc.first().boundingBox();
      if (!box) throw new Error(`tap target not visible: ${loc}`);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.evaluate(([x, y]) => window.__tut.tap(x, y), [x, y]);
      await page.waitForTimeout(260);
      await loc.first().click({ timeout: 8000 });
      await page.waitForTimeout(pause);
    },
    /** Point at an element without tapping it (a soft highlight ring). */
    async point(locator, holdMs = 1400) {
      const loc = typeof locator === "string" ? page.locator(locator) : locator;
      await loc.first().scrollIntoViewIfNeeded();
      const box = await loc.first().boundingBox();
      if (!box) return;
      await page.evaluate((b) => window.__tut.ring(b), box);
      await page.waitForTimeout(holdMs);
      await page.evaluate(() => window.__tut.ring(null));
    },
    /** Draw a handwritten-looking signature across a canvas with the pointer. */
    async signature(locator) {
      const loc = typeof locator === "string" ? page.locator(locator) : locator;
      const box = await loc.first().boundingBox();
      const cx = box.x + box.width * 0.5;
      const cy = box.y + box.height * 0.55;
      const w = box.width * 0.36;
      const h = box.height * 0.22;
      // Cursive loops: the pen drifts right-to-left while circling, so it crosses back on itself.
      const point = (t) => ({
        x: cx + w * (1 - 2 * t) + w * 0.2 * Math.cos(2 * Math.PI * 4.5 * t),
        y: cy - h * Math.sin(2 * Math.PI * 4.5 * t) * (0.7 + 0.5 * Math.sin(Math.PI * t * 1.3)),
      });
      let p = point(0);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      for (let i = 1; i <= 48; i++) {
        p = point(i / 48);
        await page.mouse.move(p.x, p.y);
      }
      // the underline flourish
      await page.mouse.move(cx + w * 0.9, cy + h * 1.2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    },
    async type(locator, text, { delay = 70 } = {}) {
      const loc = typeof locator === "string" ? page.locator(locator) : locator;
      await phone.tap(loc, { pause: 200 });
      await loc.first().pressSequentially(text, { delay });
      await page.waitForTimeout(400);
    },
    /** Smooth-scroll the page (or the main scroll container) by dy pixels. */
    async scroll(dy, ms = 900) {
      await page.evaluate(
        ([dy]) => {
          const candidates = [document.scrollingElement, ...document.querySelectorAll("main, .app-main-column, [data-scroll]")];
          const el = candidates.find((e) => e && e.scrollHeight > e.clientHeight + 4) ?? document.scrollingElement;
          el.scrollBy({ top: dy, behavior: "smooth" });
        },
        [dy],
      );
      await page.waitForTimeout(ms);
    },
    async scrollTo(locator, ms = 900) {
      const loc = typeof locator === "string" ? page.locator(locator) : locator;
      await loc.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      await page.waitForTimeout(ms);
    },
    async close() {
      await page.waitForTimeout(300);
      const end = Date.now() / 1000;
      if (cast) await cast.stop();
      await context.close();
      await browser.close();
      if (unhandled.size) console.warn("[mock] unhandled:", [...unhandled].join(" | "));
      if (cast) {
        await mkdir(path.dirname(outFile), { recursive: true });
        await encode(cast, { from: trimStart, to: end, outFile, ...SIZE });
      }
    },
  };
  return phone;
}

/**
 * A headless-shell Chromium (old headless mode). Only it screencasts the emulated
 * phone viewport itself; full Chrome in new headless mode captures its 500px-wide
 * window instead, which stretched the video and left a blank strip beside the app.
 * Playwright's own build when installed, else any complete one already on the machine.
 */
function findHeadlessShell() {
  const own = chromium.executablePath();
  if (existsSync(own) && /headless_shell|chrome-headless-shell/.test(own)) return own;
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().reverse() : [];
  for (const dir of dirs) {
    if (!existsSync(path.join(base, dir, "INSTALLATION_COMPLETE"))) continue;
    for (const exe of ["chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/headless_shell.exe"]) {
      if (existsSync(path.join(base, dir, exe))) return path.join(base, dir, exe);
    }
  }
  throw new Error("No headless-shell Chromium found — run: npx playwright install chromium-headless-shell");
}

async function settle(page) {
  // Wait for loaders / skeletons to clear and fonts to be ready.
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(700);
}
