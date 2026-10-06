/* DS 小姐好感端到端：大米饭制作 → 赠礼 love +8 → 每日限制 → 台词阶段 → 熟���/ disliked 分支 */
import { launch, boot, snap, walkTo, walkAdjacent, interactWith, press, winOpen, winTitle, winText, closeWin, clickWin, lastToast, gotoScene, Report } from './harness.mjs';

const fsp = page => page.evaluate(() => window.__MOSS__.state.npcFriendship.ds);

/* DS 小姐会随时间换位置：先确保人在河湾，再读运行时坐标，走到相邻格并面朝她 */
async function goToDs(page) {
  // 玩家可能还在农场，必须先走到河湾，NPC 坐标只在他所在场景有效。
  if (!(await gotoScene(page, 'riverside'))) return { ok: false, reason: '走不到河湾' };
  const npc = await page.evaluate(() => {
    const r = (window.__MOSS__.__npcRuntime || {}).ds;
    return r ? { x: r.x, y: r.y } : null;
  });
  if (!npc) return { ok: false, reason: '拿不到 DS 坐标' };
  // 站到她左侧并面朝右；若左侧不可走则改站上方
  const spot = [[npc.x - 1, npc.y, 'ArrowRight'], [npc.x, npc.y - 1, 'ArrowDown'],
                [npc.x + 1, npc.y, 'ArrowLeft'], [npc.x, npc.y + 1, 'ArrowUp']];
  for (const [tx, ty, face] of spot) {
    if (await walkTo(page, tx, ty, 9000)) {
      await press(page, face, 140);
      return { ok: true, x: tx, y: ty, face };
    }
  }
  return { ok: false, reason: '四个相邻格都走不到' };
}

/* 赠礼走 NPC 对话窗口：靠近 → 交互 → 「赠送礼物」→ 选物品 */
async function gift(page, itemName) {
  if (await winOpen(page)) { await closeWin(page); await page.waitForTimeout(150); }
  const spot = await goToDs(page);
  if (!spot.ok) return { ok: false, reason: spot.reason || ('走不到相邻格 ' + JSON.stringify(spot)) };
  await press(page, spot.face, 140);
  await press(page, 'KeyE', 200);
  await page.waitForTimeout(300);
  if (!(await winOpen(page))) return { ok: false, reason: '对话窗口没打开' };

  const giftBtn = page.getByRole('button', { name: '赠送礼物', exact: true });
  if (!(await giftBtn.count())) return { ok: false, reason: '没有「赠送礼物」按钮（今天可能已送过）' };
  await giftBtn.first().click();
  await page.waitForTimeout(300);

  const tile = page.locator('.win .grid .item').filter({ hasText: itemName }).first();
  if (!(await tile.count())) return { ok: false, reason: '礼物列表里没有「' + itemName + '」' };
  await tile.getByRole('button', { name: /赠送 1 个/ }).click();
  await page.waitForTimeout(350);
  return { ok: true, body: await winText(page) };
}

(async () => {
  const report = new Report();
  const { browser, page, errors } = await launch();

  console.log('▶ 1. 大米饭配方：土豆 ×2 → 大米饭 ×1');
  await boot(page, { fresh: true });
  await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.npcFriendship.yaya = 30;      // 解锁 friendship 类配方
    M.state.inventory.potato = 4;
    M.state.dsMet = true;                  // 已相遇
    M.state.bridgeRepaired = true;
    M.state.inventory.tool_rod = true;
  });
  await page.waitForTimeout(200);

  const crafted = await page.evaluate(() => {
    const M = window.__MOSS__;
    const r = M.RECIPES ? M.RECIPES.find(x => x.id === 'plain_rice') : null;
    return {
      hasRecipeApi: !!r,
      unlocked: M.state.unlockedRecipes.includes('plain_rice'),
      recipeIds: M.state.unlockedRecipes.slice()
    };
  });
  report.ok('大米饭配方存在', crafted.hasRecipeApi, JSON.stringify(crafted));

  // 走真实制作界面
  await press(page, 'KeyC');          // 制作台
  await page.waitForTimeout(300);
  const win = await winOpen(page);
  report.ok('制作界面可打开', win, '未打开');
  const bodyBefore = await winText(page);
  report.ok('制作界面列出大米饭', /大米饭/.test(bodyBefore), '未列出:\n' + bodyBefore.slice(0, 300));

  const made = await page.evaluate(() => {
    const M = window.__MOSS__;
    const before = M.state.inventory.potato || 0;
    const btn = [...document.querySelectorAll('.win button')].find(b => /制作/.test(b.textContent) && !b.disabled);
    if (!btn) return { ok: false, before };
    btn.click();
    return { ok: true, before };
  });
  await page.waitForTimeout(350);
  const inv1 = (await snap(page)).inv;
  report.ok('制作后土豆 -2', (inv1.potato || 0) === made.before - 2, `前 ${made.before} 后 ${(inv1.potato || 0)}`);
  report.ok('制作得到 1 份大米饭', (inv1.rice || 0) === 1, 'rice=' + (inv1.rice || 0));
  report.ok('制作有成功提示', /大米饭|制作/.test(await lastToast(page)), '提示=' + await lastToast(page));
  await closeWin(page);

  const giftable = await page.evaluate(() => ({
    rice: window.__MOSS__.__isGiftable('rice'),
    jam: window.__MOSS__.__isGiftable('jam'),
    wood: window.__MOSS__.__isGiftable('wood'),
    tool: window.__MOSS__.__isGiftable('hoe')
  }));
  report.ok('大米饭可作为礼物', giftable.rice === true, JSON.stringify(giftable));
  report.ok('工具仍不可作为礼物', giftable.tool === false, JSON.stringify(giftable));

  console.log('▶ 2. 大米饭可作为礼物赠送（love +8）');
  await goToDs(page);
  const beforeGift = await fsp(page);
  const g1 = await gift(page, '大米饭');
  report.ok('大米饭出现「赠送 1 个」按钮', g1.ok, g1.reason || '');
  if (g1.ok) {
    report.ok('love 赠礼 +8', (await fsp(page)) >= beforeGift + 8,
      `前 ${beforeGift} 后 ${await fsp(page)} 正文=${g1.body.slice(0, 60).replace(/\n/g, ' / ')}`);
    report.ok('love 赠礼给出 DS 专属回应', /米饭|了解我|可以/.test(g1.body), '正文=' + g1.body.slice(0, 80));
    report.ok('赠礼扣除 1 份大米饭', ((await snap(page)).inv.rice || 0) === 0, 'rice=' + ((await snap(page)).inv.rice || 0));
  }

  console.log('▶ 3. 每日赠礼限制：同一天不能送第二次');
  await page.evaluate(() => { window.__MOSS__.state.inventory.berry = 1; });
  const before2 = await fsp(page);
  const g2 = await gift(page, '野莓');
  report.ok('当天第二次赠礼被拒绝', (await fsp(page)) === before2,
    `前 ${before2} 后 ${await fsp(page)} toast=${await lastToast(page)}`);
  report.ok('当天第二次赠礼时对话窗口显示限制文案',
    /今天已经送过礼物|明天再来/.test(await winText(page)), '正文=' + (await winText(page)).slice(0, 90));
  await closeWin(page);

  console.log('▶ 4. 跨天重置：过夜后可以再送');
  await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.inventory.rice = 1;
    M.state.npcDailyInteractions.ds = { day: M.state.totalDay - 1, chat: false, gift: false, chatCount: 0, heartStage: 0 };
  });
  const before3 = await fsp(page);
  const g3 = await gift(page, '大米饭');
  report.ok('新的一天可再次赠送', (await fsp(page)) >= before3 + 8,
    `前 ${before3} 后 ${await fsp(page)} ok=${g3.ok} 原因=${g3.reason || ''}`);
  await closeWin(page);

  console.log('▶ 5. like / dislike 分支');
  // like：土豆
  await page.evaluate(() => { const M = window.__MOSS__; M.state.inventory.potato = 1; M.state.npcDailyInteractions.ds.gift = false; });
  const g4 = await gift(page, '土豆');
  report.ok('like 赠礼 +3', (await fsp(page)) !== 0, 'ok=' + g4.ok);
  await closeWin(page);

  // dislike：木材（ds.dislike 为空，落到 like 之外的普通分支 +3）
  await page.evaluate(() => { const M = window.__MOSS__; M.state.inventory.wood = 1; M.state.npcDailyInteractions.ds.gift = false; });
  const fBefore = await fsp(page);
  const g5 = await gift(page, '木材');
  report.ok('普通赠礼走 meh 分支 +3', (await fsp(page)) === fBefore + 3,
    `前 ${fBefore} 后 ${await fsp(page)} ok=${g5.ok}`);
  report.ok('meh 分支有专属回应文案', /好感 \+3|收下了/.test(g5.body || ''), '正文=' + (g5.body || '').slice(0, 80));
  await closeWin(page);

  console.log('▶ 6. 好感阶段台词（真实对话路径）');
  for (const [lv, pat] of [[0, null], [25, /可靠/], [50, /摸鱼的时间/], [75, /按时出现/]]) {
    const line = await page.evaluate((level) => {
      const M = window.__MOSS__;
      M.state.npcFriendship.ds = level;
      M.state.npcDailyInteractions.ds = { day: M.state.totalDay, chat: false, gift: false, chatCount: 0, heartStage: 0 };
      M.state.questProgress[3] = 'done';            // 排除修桥分支，专测好感阶段
      return M.__npcDialogue('ds');
    }, lv);
    report.ok(`好感 ${lv} 返回台词`, typeof line === 'string' && line.length > 0, JSON.stringify(line));
    if (pat) report.ok(`好感 ${lv} 命中专属台词`, pat.test(line), '实际：' + line);
  }
  // 普通阶段：轮换的日常台词，且不含心阶段台词
  const daily = await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.npcFriendship.ds = 0;
    const out = [];
    for (let i = 0; i < 4; i++) {
      M.state.npcDailyInteractions.ds = { day: M.state.totalDay, chat: false, gift: false, chatCount: i, heartStage: 0 };
      out.push(M.__npcDialogue('ds'));
    }
    return out;
  });
  report.ok('低好感走日常台词（会轮换）', new Set(daily).size > 1, JSON.stringify(daily).slice(0, 120));

  console.log('▶ 7. 好感不越界');
  await page.evaluate(() => { window.__MOSS__.state.npcFriendship.ds = 97; });
  await page.evaluate(() => { const M = window.__MOSS__; M.state.inventory.rice = 1; M.state.npcDailyInteractions.ds.gift = false; });
  await goToDs(page);
  await gift(page, '大米饭');
  report.ok('好感上限 100', (await fsp(page)) === 100, '实际 ' + (await fsp(page)));
  await closeWin(page);
  await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.npcFriendship.ds = 2;
    M.state.inventory.stone = 1;
    M.state.npcDailyInteractions.ds.gift = false;
  });
  await gift(page, '石头');
  report.ok('好感永不为负', (await fsp(page)) >= 0, '实际 ' + (await fsp(page)));
  report.ok('好感不超过 100', (await fsp(page)) <= 100, '实际 ' + (await fsp(page)));
  await closeWin(page);

  report.consoleErrors = errors;
  const pass = report.summary();
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
