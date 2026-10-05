import { launch, boot, snap, walkTo, pickTool, clickTile, faceTowards } from "./harness.mjs";
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(400);
// 种下三种作物各一格 + 一块空耕地，并浇其中两块
const T = [[7,8,"radish"],[8,8,"potato"],[9,8,"strawberry"],[10,8,null]];
await page.evaluate(() => { window.__MOSS__.state.inventory.seed_potato = 2; window.__MOSS__.state.inventory.seed_strawberry = 2; });
for (const [x,y,seed] of T) {
  await walkTo(page, x, 9);
  await pickTool(page,1); await clickTile(page,x,y);
  if (seed) { await pickTool(page,2); await page.evaluate(s=>{window.__MOSS__.state.selectedSeed=s;}, seed); await clickTile(page,x,y); }
}
// 浇两块
for (const [x,y] of [[7,8],[9,8]]) { await walkTo(page,x,9); await pickTool(page,3); await clickTile(page,x,y); }
await page.waitForTimeout(400);
await page.screenshot({ path: "../output/playwright/v3-crop-sown.png" });
console.log(" sown:", JSON.stringify((await snap(page)).plots));
// 推进到不同阶段（用夹具推进，仅为取画面）
await page.evaluate(() => {
  const s = window.__MOSS__.state;
  s.plots["7,8"].age = 1; s.plots["8,8"].age = 2; s.plots["9,8"].age = 5;
  s.plots["7,8"].mature = true;
  s.plots["9,8"].mature = true; s.plots["9,8"].harvested = false;
  s.weather = { today: "sun", tomorrow: "sun" };
  window.__MOSS__.saveNow();
});
await page.waitForTimeout(400);
await page.screenshot({ path: "../output/playwright/v3-crop-stages.png" });
// 悬停提示
await page.evaluate(() => { window.__MOSS__.game.hoverTile = [9,8]; });
await page.waitForTimeout(300);
const tip = await page.evaluate(() => { const n=document.getElementById("tileTip"); return {hidden:n.hidden, text:n.innerText, left:n.style.left, top:n.style.top}; });
console.log(" tooltip:", JSON.stringify(tip));
await page.screenshot({ path: "../output/playwright/v3-crop-tip.png" });
console.log("errors:", errors);
await browser.close();
