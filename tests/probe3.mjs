import { launch, boot, snap, pos } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
const info = await page.evaluate(() => {
  const M = window.__MOSS__;
  const out = {};
  for (let y = 9; y <= 15; y++) {
    let row = "";
    for (let x = 0; x <= 6; x++) row += M.isSolid("farm", x, y) ? "#" : ".";
    out["y" + y] = row;
  }
  out.path21_23 = M.findPath("farm", 2, 11, 2, 13);
  out.path212_3_12 = M.findPath("farm", 2, 11, 3, 12);
  out.path_from_1_5 = M.findPath("farm", 1, 5, 3, 12);
  out.player = [M.state.player.x, M.state.player.y];
  out.ppos = [M.game.ppos.x, M.game.ppos.y];
  out.scene = M.state.sceneId;
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
