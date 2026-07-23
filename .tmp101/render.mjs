import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import fs from "node:fs";

const opts = JSON.parse(process.argv[3] ?? "{}");
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync("public/tofes-101.pdf")), ...opts }).promise;
const page = await doc.getPage(1);
const scale = 2.0;
const vp = page.getViewport({ scale });
const canvas = createCanvas(vp.width, vp.height);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "white"; ctx.fillRect(0,0,vp.width,vp.height);
await page.render({ canvasContext: ctx, viewport: vp, canvasFactory: {
  create: (w,h)=>{const c=createCanvas(w,h);return {canvas:c,context:c.getContext('2d')}},
  reset:(o,w,h)=>{o.canvas.width=w;o.canvas.height=h},
  destroy:(o)=>{o.canvas.width=0;o.canvas.height=0},
}}).promise;
fs.writeFileSync(process.argv[2], canvas.toBuffer("image/png"));
console.log("wrote", process.argv[2], vp.width+"x"+vp.height);
