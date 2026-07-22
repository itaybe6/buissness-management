// TEMP tooling — extracts the printed vector rectangles / rules from a PDF page.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

const { OPS } = pdfjs;
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const { fnArray, argsArray } = await page.getOperatorList();

  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const rects = [];
  const hLines = [];
  const vLines = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, argsArray[i]);
    else if (fn === OPS.constructPath) {
      const [ops, coords] = argsArray[i];
      let c = 0;
      let cur = null;
      for (const op of ops) {
        if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(c, c + 4);
          c += 4;
          const [x0, y0] = apply(ctm, x, y);
          const [x1, y1] = apply(ctm, x + w, y + h);
          rects.push({
            x: +Math.min(x0, x1).toFixed(1),
            y: +(vp.height - Math.max(y0, y1)).toFixed(1), // top-left origin
            w: +Math.abs(x1 - x0).toFixed(1),
            h: +Math.abs(y1 - y0).toFixed(1),
          });
        } else if (op === OPS.moveTo) {
          cur = apply(ctm, coords[c], coords[c + 1]);
          c += 2;
        } else if (op === OPS.lineTo) {
          const next = apply(ctm, coords[c], coords[c + 1]);
          c += 2;
          if (cur) {
            const [ax, ay] = cur;
            const [bx, by] = next;
            if (Math.abs(ay - by) < 0.8 && Math.abs(bx - ax) > 3) {
              hLines.push({
                y: +(vp.height - (ay + by) / 2).toFixed(1),
                x0: +Math.min(ax, bx).toFixed(1),
                x1: +Math.max(ax, bx).toFixed(1),
              });
            } else if (Math.abs(ax - bx) < 0.8 && Math.abs(by - ay) > 3) {
              vLines.push({
                x: +((ax + bx) / 2).toFixed(1),
                y0: +(vp.height - Math.max(ay, by)).toFixed(1),
                y1: +(vp.height - Math.min(ay, by)).toFixed(1),
              });
            }
          }
          cur = next;
        } else if (op === OPS.curveTo) c += 6;
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) c += 4;
      }
    }
  }

  const boxes = rects.filter((r) => r.w > 12 && r.h > 7); // real boxes, not hairlines
  out.push({ page: p, width: vp.width, height: vp.height, rects, boxes, hLines, vLines });
  console.log(`page ${p}: ${boxes.length} boxes, ${hLines.length} h-lines, ${vLines.length} v-lines`);
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log("wrote", process.argv[3]);
