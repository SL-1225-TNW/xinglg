import { launch, boot, snap, walkTo, walkAdjacent, clickTile, pickTool } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await walkTo(page, 7, 9);
await pickTool(page, 1); await clickTile(page, 7, 8);
await pickTool(page, 2); await clickTile(page, 7, 8);
await page.waitForTimeout(400);
const dump = await page.evaluate(()=>{
  const g = document.getElementById("world").getContext("2d");
  const cam = window.__MOSS__.cam;
  const sx = 7*16 - Math.round(cam.x), sy = 8*16 - Math.round(cam.y);
  const d = g.getImageData(sx, sy, 16, 16).data;
  const rows=[]; const counts={};
  for(let y=0;y<16;y++){ let r=""; for(let x=0;x<16;x++){ const i=(y*16+x)*4; const k=`${d[i]},${d[i+1]},${d[i+2]}`; counts[k]=(counts[k]||0)+1; r+= (d[i+1]>d[i]+20?"G":(d[i]>150&&d[i]-d[i+1]>70?"R":".")); } rows.push(r); }
  return { cam, sx, sy, rows, top: Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6) };
});
console.log("cam",JSON.stringify(dump.cam),"sample",dump.sx,dump.sy);
console.log(dump.rows.join("\n"));
console.log("top colors:", JSON.stringify(dump.top));
await browser.close();
