// Dev helper: run a few steps as a demo user, dumping the screen after each.
//   node explore.mjs avi /route 'click:.selector' 'text:דוח חדש' 'wait:800'
import { openPhone } from "./lib/harness.mjs";
import { USERS } from "./lib/demo-data.mjs";
const [who, route, ...steps] = process.argv.slice(2);
const phone = await openPhone({ userId: USERS[who], outFile: null });
await phone.goto(route);
const dump = async (n) => {
  await phone.page.screenshot({ path: `shots/explore-${n}.png`, fullPage: false });
  const ui = await phone.page.evaluate(() =>
    [...document.querySelectorAll("button, [role=tab], input, textarea, select, label, h1, h2, h3")]
      .filter((e) => e.getClientRects().length)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}${e.type && e.tagName === "INPUT" ? `[${e.type}]` : ""}: ${(e.getAttribute("aria-label") || e.getAttribute("placeholder") || e.textContent).replace(/\s+/g, " ").trim().slice(0, 60)}`),
  );
  console.log(`\n--- step ${n} (shots/explore-${n}.png)\n` + [...new Set(ui)].join("\n"));
};
let n = 0;
for (const step of steps) {
  const [kind, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (kind === "click") await phone.page.locator(arg).first().click();
  else if (kind === "text") await phone.page.getByText(arg, { exact: false }).first().click();
  else if (kind === "role") await phone.page.getByRole("button", { name: new RegExp(arg) }).first().click();
  else if (kind === "scroll") await phone.page.evaluate((y) => window.scrollBy(0, Number(y)), arg);
  await phone.wait(1000);
  if (kind === "dump" || steps.indexOf(step) === steps.length - 1) await dump(++n);
}
if (!steps.length) await dump(0);
await phone.close();
