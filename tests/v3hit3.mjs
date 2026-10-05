import { launch, boot } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await page.evaluate(()=>{const M=window.__MOSS__;const st=JSON.parse(JSON.stringify(M.state));st.sceneId="house";st.player={x:6,y:7,face:"up"};M.startGame(st);});
await page.waitForTimeout(900);
const hit = await page.evaluate(()=>{
  const out=[];
  for (const [x,y] of [[975,485],[960,470],[985,495]]) {
    const el=document.elementFromPoint(x,y);
    out.push({x,y,tag:el&&el.tagName,id:el&&el.id,cls:el&&(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)});
  }
  const r=document.getElementById("world").getBoundingClientRect();
  return { out, canvas:[r.left,r.top,r.width,r.height] };
});
console.log(JSON.stringify(hit,null,1));
await browser.close();
