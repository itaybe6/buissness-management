import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";
import fs from "node:fs";
const doc = await pdfjs.getDocument({ data:new Uint8Array(fs.readFileSync("public/tofes-101.pdf")), verbosity:0 }).promise;
const page=await doc.getPage(1); const scale=3;
const vp=page.getViewport({scale});
const canvas=createCanvas(vp.width,vp.height); const ctx=canvas.getContext("2d");
ctx.fillStyle="white";ctx.fillRect(0,0,vp.width,vp.height);
await page.render({canvasContext:ctx,viewport:vp,canvasFactory:{create:(w,h)=>{const c=createCanvas(w,h);return{canvas:c,context:c.getContext('2d')}},reset:(o,w,h)=>{o.canvas.width=w;o.canvas.height=h},destroy:(o)=>{o.canvas.width=0}}}).promise;
// crop the מין/מצב משפחתי band: PDF y ~530-560 -> canvas y = (842-560)*scale .. (842-530)*scale
const py0=(841.89-565)*scale, py1=(841.89-535)*scale;
const cw=vp.width, ch=py1-py0;
const crop=createCanvas(cw,ch); const cc=crop.getContext("2d");
cc.drawImage(canvas,0,py0,cw,ch,0,0,cw,ch);
fs.writeFileSync(".tmp101/crop_marital.png", crop.toBuffer("image/png"));
console.log("ok",cw,ch);
