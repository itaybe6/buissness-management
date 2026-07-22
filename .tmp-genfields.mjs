// TEMP tooling — turns the scanned tofes-101 geometry into a SignatureField preset.
import fs from "node:fs";

const pages = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const P1 = pages.find((p) => p.page === 1);
const P2 = pages.find((p) => p.page === 2);
const W = P1.width; // 595.3
const H = P1.height; // 841.9

const fields = [];
const r3 = (n) => +n.toFixed(4);
const push = (id, page, x, y, x2, y2, label, kind = "text") =>
  fields.push({ id, page, x: r3(x / W), y: r3(y / H), w: r3((x2 - x) / W), h: r3((y2 - y) / H), kind, label });

/**
 * A row of cells: `bounds` are the vertical rules right-to-left (RTL), so
 * bounds[i]..bounds[i+1] is cell i. `top`/`bottom` is the writing band.
 */
function row(page, bounds, top, bottom, cells) {
  cells.forEach(([id, label], i) => {
    if (!label) return;
    const right = bounds[i];
    const left = bounds[i + 1];
    push(id, page, left + 2, top, right - 2, bottom, label);
  });
}

/* ---------------- page 1 ---------------- */

// א. פרטי המעסיק — box 154.2..182.6, rules at 414.9 / 209 / 130.3
row(0, [540.2, 414.9, 209, 130.3, 28.7], 166, 180.5, [
  ["f101_emp_name", "שם המעסיק"],
  ["f101_emp_address", "כתובת המעסיק"],
  ["f101_emp_phone", "טלפון"],
  ["f101_emp_tax_file", "מספר תיק ניכויים"],
]);

// ב. פרטי העובד/ת — row 1, band 210.9..236.5, rules 438.1 / 313.9 / 210 / 119
row(0, [540.2, 438.1, 313.9, 210, 119, 28.7], 224.5, 235, [
  ["f101_id_number", "מספר זהות"],
  ["f101_last_name", "שם משפחה"],
  ["f101_first_name", "שם פרטי"],
  ["f101_birth_date", "תאריך לידה"],
  ["f101_aliya_date", "תאריך עליה"],
]);

// ב. row 2 — passport cell (392.5..540.2) spans the full 236.5..266.1 band
push("f101_passport", 0, 394.5, 250, 538, 264, "מספר דרכון");

// ב. row 2 — private address, sub-columns 228.8 / 202.6 / 108.4 above the caption strip
row(0, [392.5, 228.8, 202.6, 108.4, 28.7], 248.5, 258.5, [
  ["f101_street", "רחוב/שכונה"],
  ["f101_house_no", "מספר"],
  ["f101_city", "עיר/ישוב"],
  ["f101_zip", "מיקוד"],
]);

// ב. row 3 — free text that follows a checkbox
push("f101_health_fund", 0, 30, 293.5, 70, 303, "שם קופת החולים");

// ב. row 4 — contact, band 305.8..327.9, rules 361 / 205.4
row(0, [540.2, 361, 205.4, 28.7], 315, 326, [
  ["f101_email", "דואר אלקטרוני"],
  ["f101_phone", "מספר טלפון"],
  ["f101_mobile", "טלפון נייד"],
]);

// ד. תאריך תחילת העבודה — small box 30.8..121.4 / 370.5..391.5
push("f101_start_date", 0, 33, 379, 119, 389, "תאריך תחילת העבודה");

// ג. פרטי ילדים — table 258..543.5 / 367.9..667.7, header row ends ~384
// columns: שם | מספר זהות | תאריך לידה | טור 1 | טור 2
for (let i = 0; i < 8; i++) {
  const top = 386 + i * 15.6;
  row(0, [540.5, 440, 340, 268, 258], top + 1.5, top + 13.5, [
    ["f101_child" + (i + 1) + "_name", "שם הילד/ה"],
    ["f101_child" + (i + 1) + "_id", "מספר זהות"],
    ["f101_child" + (i + 1) + "_birth", "תאריך לידה"],
    ["f101_child" + (i + 1) + "_col1", "1"],
  ]);
}

// ו. פרטי בן/בת הזוג — band 686.8..710.8, rules 437.8 / 314.2 / 210 / 119.3
row(0, [540.2, 437.8, 314.2, 210, 119.3, 28.7], 698.5, 709.5, [
  ["f101_spouse_id", "מספר זהות"],
  ["f101_spouse_last_name", "שם משפחה"],
  ["f101_spouse_first_name", "שם פרטי"],
  ["f101_spouse_birth", "תאריך לידה"],
  ["f101_spouse_aliya", "תאריך עליה"],
]);
push("f101_spouse_passport", 0, 394.5, 723, 538, 734, "מספר דרכון");

// ז. שינויים במהלך השנה — 3 rows between the rules 768 / 784.8 / 801.8 / 818.9
// columns: תאריך השינוי | פרטי השינוי | תאריך ההודעה | חתימת העובד/ת
[768, 784.8, 801.8].forEach((top, i) => {
  const bottom = [784.8, 801.8, 818.9][i];
  const n = i + 1;
  row(0, [538, 483.3, 189.8, 116.3, 30], top + 2, bottom - 2, [
    ["f101_chg" + n + "_date", "תאריך"],
    ["f101_chg" + n + "_detail", "פרטי השינוי"],
    ["f101_chg" + n + "_notified", "תאריך ההודעה"],
  ]);
  push("f101_chg" + n + "_sign", 0, 32, top + 2, 114, bottom - 2, "חתימה", "signature");
});

/* ---------------- page 2 ---------------- */

// ח. תאריכי שירות (סעיף 14)
push("f101_service_start", 1, 192, 414, 250, 425, "תאריך תחילת השירות");
push("f101_service_end", 1, 60, 414, 118, 425, "תאריך סיום השירות");
push("f101_miluim_days", 1, 330, 456, 372, 467, "ימי מילואים");

// ט. טבלת תיאום מס — 3 rows between 560.4 / 574.6 / 588.8, rules 444.3/309.8/231.3/173/100.4
[546.2, 560.4, 574.6].forEach((top, i) => {
  const bottom = [560.4, 574.6, 588.8][i];
  const n = i + 1;
  row(1, [538, 444.3, 309.8, 231.3, 173, 100.4, 30], top + 2, bottom - 2, [
    ["f101_inc" + n + "_payer", "שם המעסיק/משלם"],
    ["f101_inc" + n + "_address", "כתובת"],
    ["f101_inc" + n + "_tax_file", "מספר תיק ניכויים"],
    ["f101_inc" + n + "_type", "סוג ההכנסה"],
    ["f101_inc" + n + "_monthly", "הכנסה חודשית"],
    ["f101_inc" + n + "_tax", "המס שנוכה"],
  ]);
});

// י. הצהרה — תאריך + חתימת המבקש/ת, band 655.9..667.4
push("f101_declare_date", 1, 140, 645, 230, 660, "תאריך");
push("f101_declare_sign", 1, 34, 640, 128, 662, "חתימת המבקש/ת", "signature");

/* ------- checkboxes: every printed "o" / "q" glyph is a tick box ------- */
let cb = 0;
for (const p of [P1, P2]) {
  const pageIdx = p.page - 1;
  for (const it of p.items) {
    const s = it.s.trim();
    if (s !== "o" && s !== "q") continue;
    cb++;
    // the glyph's own box, nudged to sit on the printed square
    const size = Math.max(7, it.w);
    const left = it.x + (it.w - size) / 2;
    const top = it.y - size + 1.5;
    // nearest text to the left on the same baseline = what this box means
    const near = p.items
      .filter((o) => o.s.trim().length > 1 && Math.abs(o.y - it.y) < 3 && o.x < it.x)
      .sort((a, b) => b.x - a.x)[0];
    push(
      "f101_cb_p" + p.page + "_" + cb,
      pageIdx,
      left,
      top,
      left + size,
      top + size,
      (near?.s || "").trim().slice(0, 28) || "סמן",
    );
  }
}

console.log("text/signature fields:", fields.length - cb, " checkboxes:", cb, " total:", fields.length);
fs.writeFileSync(process.argv[3], JSON.stringify(fields, null, 1));
