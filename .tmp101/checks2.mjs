import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const doc = await pdfjs.getDocument({ data:new Uint8Array(fs.readFileSync("public/tofes-101.pdf")), verbosity:0 }).promise;
for(let p=1;p<=doc.numPages;p++){
  const page=await doc.getPage(p);
  const tc=await page.getTextContent();
  const all=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),raw:i.str,x:i.transform[4],y:i.transform[5],w:i.width,h:i.height,f:i.fontName}));
  const boxes=all.filter(i=>i.s.length===1 && /[oq]/.test(i.s) && i.w>6&&i.w<16&&i.h>6&&i.h<18);
  console.log(`\n=== page ${p}: boxes=${boxes.length}`);
  const words=all.filter(i=>/[֐-׿]/.test(i.s));
  for(const b of boxes.sort((a,x)=>x.y-a.y||a.x-x.x)){
    // label to the RIGHT on same baseline (RTL: text right of box)
    let lab='',best=1e9;
    for(const t of words){const oy=Math.min(b.y+b.h,t.y+t.h)-Math.max(b.y,t.y);if(oy<3)continue;const gap=t.x-(b.x+b.w);if(gap>-3&&gap<8&&gap<best){best=gap;lab=t.s;}}
    console.log(`  ${b.s} x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)} | ${lab.slice(0,25)}`);
  }
}
