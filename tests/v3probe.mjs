import { launch, GAME_URL, boot, snap, pos, walkTo, pickTool, clickTile, winOpen, winTitle } from "./harness.mjs";
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(500);
console.log("initial ok, plots:", Object.keys((await snap(page)).plots));
// 种一块萝卜
await walkTo(page, 7, 9);
await pickTool(page, 1); await clickTile(page, 7, 8);
await pickTool(page, 2); await clickTile(page, 7, 8);
await page.waitForTimeout(300);
console.log("plot:", JSON.stringify((await snap(page)).plots["7,8"]));
// 农舍进入
await walkTo(page, 3, 5);
await page.keyboard.press("e");
await page.waitForTimeout(700);
console.log("scene after E at door:", (await snap(page)).scene, "pos", await pos(page));
if ((await snap(page)).scene === "house") {
  await page.waitForTimeout(300);
  await page.screenshot({ path: "../output/playwright/v3-house.png" });
  await walkTo(page, 13, 3);
  await page.keyboard.press("e");
  await page.waitForTimeout(300);
  console.log("chest window:", await winTitle(page));
  await page.keyboard.press("Escape");
  await walkTo(page, 10, 9);
  await page.keyboard.press("e");
  await page.waitForTimeout(300);
  console.log("calendar window:", await winTitle(page));
  await page.keyboard.press("Escape");
  await walkTo(page, 8, 2);
  await page.keyboard.press("e");
  await page.waitForTimeout(300);
  console.log("handbook window:", await winTitle(page));
  await page.keyboard.press("Escape");
  await walkTo(page, 2, 3);
  await page.keyboard.press("e");
  await page.waitForTimeout(300);
  console.log("bed window:", await winTitle(page));
  await page.screenshot({ path: "../output/playwright/v3-bed.png" });
  await page.keyboard.press("Escape");
  await walkTo(page, 7, 11);
  await page.waitForTimeout(800);
  console.log("after exit:", (await snap(page)).scene, await pos(page));
}
await page.waitForTimeout(300);
await page.screenshot({ path: "../output/playwright/v3-crop.png" });
console.log("errors:", errors);
await browser.close();
