import { launch, boot } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await page.evaluate(()=>{ const M=window.__MOSS__; M.state.player={x:27,y:16,face:"down"}; M.game.ppos.x=27*16+8; M.game.ppos.y=16*16+12; });
await page.waitForTimeout(1200);
const box = await page.evaluate(()=>{
  const r = document.getElementById("world").getBoundingClientRect();
  const s = r.width/384;
  const cam = window.__MOSS__.cam;
  const wx0=25*16, wy0=16*16, wx1=31*16, wy1=22*16;
  return { x: r.left + (wx0-cam.x)*s, y: r.top + (wy0-cam.y)*s,
           width: (wx1-wx0)*s, height: (wy1-wy0)*s };
});
await page.screenshot({ path: "../output/playwright/v3-pond-zoom.png", clip: box });
console.log("cam", await page.evaluate(()=>JSON.stringify(window.__MOSS__.cam)), "clip", JSON.stringify(box));
await browser.close();
