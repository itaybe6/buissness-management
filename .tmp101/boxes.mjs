import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
const { OPS } = pdfjs;
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const ap=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const doc = await pdfjs.getDocument({ data:new Uint8Array(fs.readFileSync("public/tofes-101.pdf")), verbosity:0 }).promise;
for(let p=1;p<=doc.numPages;p++){
  const page=await doc.getPage(p); const ol=await page.getOperatorList();
  const tc=await page.getTextContent();
  const texts=tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],w:i.width,h:i.height}));
  let ctm=[1,0,0,1,0,0]; const st=[]; const rects=[];
  for(let i=0;i<ol.fnArray.length;i++){
    const fn=ol.fnArray[i],args=ol.argsArray[i];
    if(fn===OPS.save)st.push(ctm.slice());
    else if(fn===OPS.restore)ctm=st.pop()??ctm;
    else if(fn===OPS.transform)ctm=mul(ctm,args);
    else if(fn===OPS.constructPath){
      const[ops,coords]=args; let c=0; let seg=[]; let start=null,cur=null;
      for(const op of ops){
        if(op===OPS.rectangle){const[x,y,w,h]=coords.slice(c,c+4);c+=4;const p1=ap(ctm,x,y),p2=ap(ctm,x+w,y+h);rects.push({x:Math.min(p1[0],p2[0]),y:Math.min(p1[1],p2[1]),w:Math.abs(p2[0]-p1[0]),h:Math.abs(p2[1]-p1[1]),t:'rect'});}
        else if(op===OPS.moveTo){start=cur=ap(ctm,coords[c],coords[c+1]);c+=2;seg=[cur];}
        else if(op===OPS.lineTo){cur=ap(ctm,coords[c],coords[c+1]);c+=2;seg.push(cur);
          if(seg.length>=4){const xs=seg.map(q=>q[0]),ys=seg.map(q=>q[1]);const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);
            if(seg.length<=6&&w>4&&w<16&&h>4&&h<16){rects.push({x:Math.min(...xs),y:Math.min(...ys),w,h,t:'loop'});seg=[cur];}}}
        else if(op===OPS.curveTo)c+=6; else if(op===OPS.curveTo2||op===OPS.curveTo3)c+=4;
      }
    }
  }
  // square-ish small boxes
  const sq=rects.filter(r=>r.w>=5&&r.w<=14&&r.h>=5&&r.h<=14&&Math.abs(r.w-r.h)<4);
  // dedupe
  const uniq=sq.filter((r,i)=>!sq.some((g,j)=>j<i&&Math.abs(g.x-r.x)<2&&Math.abs(g.y-r.y)<2));
  console.log(`\n=== page ${p}: small squares=${uniq.length}`);
  for(const r of uniq.sort((a,b)=>b.y-a.y||a.x-b.x)){
    // nearest text on same baseline
    let lab='',best=1e9;
    for(const t of texts){const oy=Math.min(r.y+r.h,t.y+t.h)-Math.max(r.y,t.y);if(oy<2)continue;const d=Math.min(Math.abs(t.x-(r.x+r.w)),Math.abs(r.x-(t.x+t.w)));if(d<best&&d<60){best=d;lab=t.s.trim();}}
    console.log(`  x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)} ${r.t} | ${lab}`);
  }
}
