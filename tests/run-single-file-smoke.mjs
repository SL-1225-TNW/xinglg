/* 单文件版冒烟测试：确认 DS 小姐功能在打包产物里同样可用 */
import { launch, boot, Report } from './harness.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '..', '苔芽农场-单文件版.html');

(async () => {
  const report = new Report();
  const { browser, page, errors } = await launch({ url: 'file://' + FILE });

  await boot(page, { fresh: true });
  const has = await page.evaluate(() => !!window.__MOSS__);
  report.ok('单文件版可启动', has, 'window.__MOSS__ 缺失');

  const ds = await page.evaluate(() => {
    const M = window.__MOSS__;
    return {
      npc: !!M.NPCS.ds,
      name: M.NPCS.ds && M.NPCS.ds.name,
      scene: M.NPCS.ds && M.NPCS.ds.scene,
      hasHearts: !!(M.NPCS.ds && M.NPCS.ds.heartLines),
      hasAvatar: !!(M.NPCS.ds && M.NPCS.ds.hair && M.NPCS.ds.shirt && M.NPCS.ds.accent),
      riceGiftable: M.__isGiftable ? M.__isGiftable('rice') : null,
      riceItem: !!M.ITEMS.rice,
      recipe: M.RECIPES.some(r => r.out === 'rice' && r.cost && r.cost.potato === 2)
    };
  });
  report.ok('DS 小姐数据完整', ds.npc && ds.hasHearts && ds.hasAvatar, JSON.stringify(ds));
  report.ok('DS 小姐住在河湾', ds.scene === 'riverside', String(ds.scene));
  report.ok('大米饭物品与配方存在', ds.riceItem && ds.recipe, JSON.stringify(ds));
  report.ok('大米饭可作为礼物', ds.riceGiftable === true, String(ds.riceGiftable));

  const line = await page.evaluate(() => {
    window.__MOSS__.state.npcFriendship.ds = 60;
    return window.__MOSS__.__npcDialogue('ds');
  });
  report.ok('DS 小姐有专属台词', typeof line === 'string' && line.length > 0, JSON.stringify(line));

  report.consoleErrors = errors;
  const pass = report.summary();
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
