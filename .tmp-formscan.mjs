// TEMP tooling — scans a PDF's text layer and dumps items with top-left coords.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((i) => i.str && i.str.trim())
    .map((i) => {
      const [a, , , d, e, f] = i.transform;
      return {
        s: i.str,
        x: +e.toFixed(1),
        y: +(vp.height - f).toFixed(1), // top-left origin
        w: +i.width.toFixed(1),
        h: +(i.height || Math.abs(d) || Math.abs(a)).toFixed(1),
      };
    });
  out.push({ page: p, width: +vp.width.toFixed(1), height: +vp.height.toFixed(1), items });
  console.log(`page ${p}: ${vp.width.toFixed(0)}x${vp.height.toFixed(0)}pt, ${items.length} text items`);
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log("wrote", process.argv[3]);
