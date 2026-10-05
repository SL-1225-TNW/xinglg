import { launch, boot, walkTo } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await walkTo(page, 3, 5);
await page.keyboard.press("e"); await page.waitForTimeout(700);
await walkTo(page, 2, 3);
const info = await page.evaluate(()=>{
  const pt = window.__MOSS__.tileToScreen(2,2);
  const el = document.elementFromPoint(pt[0], pt[1]);
  const tip = document.getElementById("tileTip");
  return { pt, tag: el && el.tagName, id: el && el.id, cls: el && el.className,
           tipHidden: tip.hidden, tipDisplay: getComputedStyle(tip).display,
           tipRect: tip.getBoundingClientRect(), fade: getComputedStyle(document.getElementById("fade")).opacity };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
