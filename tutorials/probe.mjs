// Dev helper: open routes as a demo user, save full-page screenshots, and list
// the interactive elements (handy for writing scene selectors).
//   node probe.mjs avi /shifts /attendance
//   node probe.mjs avi --ui /tasks      (also print buttons / tabs / inputs)
import { openPhone } from "./lib/harness.mjs";
import { USERS } from "./lib/demo-data.mjs";

const args = process.argv.slice(2);
const who = args.shift() ?? "noa";
const ui = args.includes("--ui");
const routes = args.filter((a) => !a.startsWith("--"));
const phone = await openPhone({ userId: USERS[who], outFile: null });
for (const route of routes.length ? routes : ["/dashboard"]) {
  await phone.goto(route);
  await phone.wait(1500);
  const name = who + route.replace(/[\/?=&]+/g, "_");
  await phone.page.screenshot({ path: `shots/${name}.png`, fullPage: true });
  console.log(`\n=== ${route} -> shots/${name}.png`);
  if (ui) {
    const items = await phone.page.evaluate(() =>
      [...document.querySelectorAll("button, [role=tab], a[href], input, textarea, select")]
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          const label = el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent.replace(/\s+/g, " ").trim();
          return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[${el.getAttribute("role")}]` : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}: ${label.slice(0, 60)}`;
        }),
    );
    console.log([...new Set(items)].join("\n"));
  }
}
await phone.close();
