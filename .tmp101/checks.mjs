import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const doc = await pdfjs.getDocument({ data:new Uint8Array(fs.readFileSync("public/tofes-101.pdf")), verbosity:0 }).promise;
for(let p=1;p<=doc.numPages;p++){
  const page=await doc.getPage(p);
  const tc=await page.getTextContent();
  // group by fontName
  const byFont={};
  for(const it of tc.items){ if(!it.str)continue; (byFont[it.fontName]??=[]).push(it); }
  console.log(`\n=== page ${p} fonts:`, Object.keys(byFont).map(f=>`${f}:${byFont[f].length}`).join('  '));
  // find short single-char items that look like box markers
  const marks=tc.items.filter(i=>i.str&&i.str.trim().length<=2&&/[oq❑□■▪■-◿]/.test(i.str));
  console.log('candidate marks:', marks.length);
  const seen={};
  for(const m of marks){ const cp=[...m.str.trim()].map(c=>c.codePointAt(0)).join(','); seen[`${m.fontName}|U+${cp}|"${m.str.trim()}"`]=(seen[`${m.fontName}|U+${cp}|"${m.str.trim()}"`]||0)+1; }
  for(const[k,v]of Object.entries(seen))console.log('  ',k,'x',v);
}
