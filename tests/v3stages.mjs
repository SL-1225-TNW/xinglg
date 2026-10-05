import { launch, boot, snap, walkTo } from "./harness.mjs";
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(300);
// 夹具：同一行放三种作物的四个阶段 + 一块空耕地 + 干湿对比
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  const P = (crop, age, extra) => Object.assign({tilled:true, water:true, crop, age, mature:false, harvested:false, regrow:0}, extra||{});
  s.plots = {
    "6,8": P("radish", 0),
    "7,8": P("radish", 1),
    "8,8": P("radish", 2),
    "9,8": P("radish", 3, {mature:true}),
    "10,8": P("potato", 0),
    "11,8": P("potato", 2),
    "12,8": P("potato", 4),
    "13,8": P("potato", 5, {mature:true}),
    "14,8": P("strawberry", 0),
    "15,8": P("strawberry", 2),
    "16,8": P("strawberry", 5),
    "17,8": P("strawberry", 6, {mature:true}),
    "18,8": P("strawberry", 6, {harvested:true, regrow:1}),
    "19,8": {tilled:true, water:false, crop:null, age:0, mature:false, harvested:false, regrow:0},
    "6,7": {tilled:true, water:true, crop:null, age:0, mature:false, harvested:false, regrow:0}
  };
  s.player = {x:12, y:9, face:"up"};
  window.__MOSS__.saveNow();
});
await page.evaluate(()=>{ const M=window.__MOSS__; M.game.ppos.x=12*16+8; M.game.ppos.y=9*16+12; });
await page.waitForTimeout(500);
const r = await page.evaluate(()=>{ const b=document.getElementById("viewport").getBoundingClientRect(); return {l:b.left,t:b.top,w:b.width,h:b.height}; });
await page.screenshot({ path: "../output/playwright/v3-stages-zoom.png", clip: { x:r.l+ (6*16/384)*r.w, y:r.t+ (6*16/256)*r.h, width:(14*16/384)*r.w, height:(4*16/256)*r.h } });
console.log("errors:", errors);
await browser.close();
