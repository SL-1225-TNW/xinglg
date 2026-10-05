import { launch, boot, walkTo, lastToast } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await walkTo(page, 3, 5);
await page.keyboard.press("e"); await page.waitForTimeout(700);
await walkTo(page, 2, 3);
const pt = await page.evaluate(()=>window.__MOSS__.tileToScreen(2,2));
await page.mouse.move(pt[0], pt[1]);
await page.waitForTimeout(200);
console.log("after move hoverTile:", await page.evaluate(()=>JSON.stringify(window.__MOSS__.game.hoverTile)));
await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up();
await page.waitForTimeout(200);
console.log("toast:", await lastToast(page));
// 再试一次直接 evaluate 触发，确认逻辑本身没问题
const direct = await page.evaluate(()=>window.__MOSS__.useTool('hoe', 2, 2));
console.log("direct useTool:", direct, "toast:", await lastToast(page));
await browser.close();
