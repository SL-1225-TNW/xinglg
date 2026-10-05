import { launch, boot, walkTo, walkAdjacent, clickTile, pickTool, press, faceTowards, closeWin, winTitle } from "./harness.mjs";
const OUT = "../output/playwright/";
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(500);

async function park(x,y){ await page.evaluate(([px,py])=>{const M=window.__MOSS__;M.state.player={x:px,y:py,face:'up'};M.game.ppos.x=px*16+8;M.game.ppos.y=py*16+12;M.game.hoverTile=null;M.game.selectTile=null;},[x,y]); await page.waitForTimeout(400); }

// 1. 播种后的田地（真实操作：锄→播→浇）
await walkTo(page, 7, 9);
await pickTool(page,1); await clickTile(page,7,8);
await pickTool(page,2); await clickTile(page,7,8);
await pickTool(page,1); await clickTile(page,8,8);
await pickTool(page,2); await clickTile(page,8,8);
await walkTo(page,7,9); await pickTool(page,3); await clickTile(page,7,8);
await park(4,12);
await page.screenshot({ path: OUT+"v3-evidence-1-sown-field.png" });

// 2. 不同生长阶段 + 成熟提示
await page.evaluate(()=>{
  const P=(c,a,x)=>Object.assign({tilled:true,water:true,crop:c,age:a,mature:false,harvested:false,regrow:0},x||{});
  const s=window.__MOSS__.state;
  s.plots={"6,8":P("radish",0),"7,8":P("radish",1),"8,8":P("radish",2),"9,8":P("radish",3,{mature:true}),
  "10,8":P("potato",0),"11,8":P("potato",2),"12,8":P("potato",4),"13,8":P("potato",5,{mature:true}),
  "14,8":P("strawberry",0),"15,8":P("strawberry",2),"16,8":P("strawberry",5),"17,8":P("strawberry",6,{mature:true}),
  "18,8":P("strawberry",6,{harvested:true,regrow:1}),"19,8":{tilled:true,water:false,crop:null,age:0,mature:false,harvested:false,regrow:0}};
  s.player={x:12,y:10,face:"up"}; window.__MOSS__.saveNow();
});
await park(4,12);
await page.screenshot({ path: OUT+"v3-evidence-2-stages.png" });
const box = await page.evaluate(()=>{const r=document.getElementById("world").getBoundingClientRect();const s=r.width/384;const c=window.__MOSS__.cam;
  return {x:r.left+(5.5*16-c.x)*s, y:r.top+(7*16-c.y)*s, width:(15*16)*s, height:(3*16)*s};});
await page.screenshot({ path: OUT+"v3-evidence-3-stages-zoom.png", clip: box });

// 3. 地块信息浮层
await page.evaluate(()=>{ window.__MOSS__.game.hoverTile=[13,8]; });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT+"v3-evidence-4-tooltip.png" });
await page.evaluate(()=>{ window.__MOSS__.game.hoverTile=[18,8]; });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT+"v3-evidence-5-tooltip-regrow.png" });

// 4. 农舍室内
await page.evaluate(()=>{const s=window.__MOSS__.state;s.plots={};s.player={x:3,y:5,face:"up"};window.__MOSS__.saveNow();});
await walkTo(page,3,5);
await page.keyboard.press("e"); await page.waitForTimeout(800);
await walkTo(page,6,7);
await page.screenshot({ path: OUT+"v3-evidence-6-house.png" });
await walkTo(page,8,2); await faceTowards(page,8,3);
await page.keyboard.press("e"); await page.waitForTimeout(350);
await page.screenshot({ path: OUT+"v3-evidence-7-handbook.png" });
await closeWin(page);
await walkTo(page,10,9); await faceTowards(page,10,10);
await page.keyboard.press("e"); await page.waitForTimeout(350);
await page.screenshot({ path: OUT+"v3-evidence-8-calendar.png" });
await closeWin(page);
await walkTo(page,2,3); await faceTowards(page,1,2);
await page.keyboard.press("e"); await page.waitForTimeout(350);
await page.screenshot({ path: OUT+"v3-evidence-9-sleep.png" });
await closeWin(page);
await walkTo(page,7,11); await page.waitForTimeout(700);

// 5. 门口提示
await walkTo(page,3,5);
await faceTowards(page,3,4);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT+"v3-evidence-10-door-hint.png" });

// 6. 池塘游鱼
await page.evaluate(()=>{const s=window.__MOSS__.state;s.player={x:27,y:16,face:"down"};s.weather={today:"sun",tomorrow:"sun"};s.timeMinutes=10*60;window.__MOSS__.saveNow();});
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT+"v3-evidence-11-pond.png" });
const pb = await page.evaluate(()=>{const r=document.getElementById("world").getBoundingClientRect();const s=r.width/384;const c=window.__MOSS__.cam;
  return {x:r.left+(25*16-c.x)*s, y:r.top+(16*16-c.y)*s, width:(7*16)*s, height:(7*16)*s};});
await page.screenshot({ path: OUT+"v3-evidence-12-pond-zoom.png", clip: pb });
// 夜晚
await page.evaluate(()=>{ window.__MOSS__.state.timeMinutes=21*60+30; });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT+"v3-evidence-13-pond-night.png" });
// 雨天
await page.evaluate(()=>{ window.__MOSS__.state.timeMinutes=10*60; window.__MOSS__.state.weather={today:"rain",tomorrow:"sun"}; });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT+"v3-evidence-14-pond-rain.png" });
console.log("errors:", errors);
await browser.close();
