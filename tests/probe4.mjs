import { launch, boot, snap, pos } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(300);
async function stepLog(tx, ty, n=12) {
  for (let i=0;i<n;i++) {
    const cur = await pos(page);
    if (cur[0]===tx && cur[1]===ty) { console.log("ARRIVED", cur); return true; }
    const path = await page.evaluate(([sx,sy,x,y]) => window.__MOSS__.findPath("farm",sx,sy,x,y), [cur[0],cur[1],tx,ty]);
    if (!path || !path.length) { console.log("NOPATH", cur, path); return false; }
    const nxt = path[0];
    const key = nxt[0]>cur[0]?"ArrowRight":nxt[0]<cur[0]?"ArrowLeft":nxt[1]>cur[1]?"ArrowDown":"ArrowUp";
    await page.keyboard.down(key);
    const moved = await page.waitForFunction(([x,y])=>{const p=window.__MOSS__.state.player;return p.x!==x||p.y!==y;}, cur, {timeout:2500}).then(()=>true).catch(()=>false);
    await page.keyboard.up(key);
    const after = await pos(page);
    console.log(i, "cur",cur,"->",key,"next",nxt,"moved",moved,"after",after, "ppos", await page.evaluate(()=>[window.__MOSS__.game.ppos.x, window.__MOSS__.game.ppos.y]));
  }
  return false;
}
await stepLog(3,12);
await browser.close();
