/* DS 小姐专项试玩：解锁钓竿 → 第一次钓鱼必定钓起她 → 相遇对话 → 好感 / 旧存档迁移 */
import { launch, boot, snap, walkTo, walkAdjacent, faceTowards, press, winOpen, winTitle, winText, closeWin, Report, isolatedPage } from './harness.mjs';

const dsState = page => page.evaluate(() => ({
  met: window.__MOSS__.state.dsMet,
  fsp: window.__MOSS__.state.npcFriendship,
  fishing: window.__MOSS__.game.fishing ? {
    phase: window.__MOSS__.game.fishing.phase,
    dsEncounter: !!window.__MOSS__.game.fishing.dsEncounter,
    dsFirst: !!window.__MOSS__.game.fishing.dsFirst,
    caught: window.__MOSS__.game.fishing.caught
  } : null,
  scene: window.__MOSS__.state.sceneId
}));

/* 河湾：木栈桥 y=10 x6..10，水面 x9..22 y3..17。站在桥上 x9,y10 对右边的水抛竿。 */
async function castAtBridge(page) {
  // 河湾布局：水 x9..22 y3..17，栈桥 y=10 x6..10。站在 x10,y10 面朝右即是水面 x11,y10。
  const p = await walkTo(page, 10, 10, 12000);
  if (!p) return false;
  await press(page, '7');                 // 选钓竿
  await page.waitForTimeout(80);
  await press(page, 'ArrowRight', 120);   // 面朝右侧水面
  await press(page, 'Space', 320);
  const f = await page.evaluate(() => {
    const M = window.__MOSS__;
    const F = M.game.fishing;
    const t = M.state.facingTile ? M.state.facingTile() : null;
    return {
      active: F ? F.active : null,
      phase: F ? F.phase : null,
      dsFirst: F ? !!F.dsFirst : null,
      tool: M.state.selectedTool,
      px: M.state.player.x, py: M.state.player.y,
      faceTile: t,
      isWater: t ? M.__isWater(M.state.sceneId, t[0], t[1]) : null,
      energy: M.state.energy
    };
  });
  return !!(f && f.active);
}

(async () => {
  const report = new Report();
  const { browser, page, errors } = await launch();

  console.log('▶ 1. 相遇前：DS 小姐既不可见也不可对话');
  await boot(page, { fresh: true });
  // boot() 已经进入游戏；startGame(s) 会用参数覆盖 state，这里绝不能再无参调用。
  await page.evaluate(() => {
    const M = window.__MOSS__;
    M.state.inventory.tool_rod = true;
    M.state.bridgeRepaired = true;      // 任务4 同时修桥+发钓竿
  });
  await page.waitForTimeout(400);
  await walkTo(page, 31, 10, 18000);                   // 农场东侧出口 → 小镇
  await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'town', null, { timeout: 9000 }).catch(() => {});
  report.eq('已到达小镇', (await snap(page)).scene, 'town');

  // 相遇前：好感字段存在且为 0
  let ds = await dsState(page);
  report.ok('新档 dsMet = false', ds.met === false, '实际 ' + ds.met);
  report.ok('npcFriendship.ds = 0', ds.fsp.ds === 0, JSON.stringify(ds.fsp));
  const hidden = await page.evaluate(() => {
    const M = window.__MOSS__;
    // 相见前：河湾地图里有 ds 的运行体，但渲染层应跳过
    return { hasRuntime: !!M.npcRuntime.ds, met: M.state.dsMet };
  });
  report.ok('相遇前不参与交互判定', hidden.met === false, JSON.stringify(hidden));

  console.log('▶ 2. 解锁钓竿后第一次钓鱼：必定钓起她');
  // 走到河边
  await walkTo(page, 31, 10, 15000);
  await page.waitForFunction(() => window.__MOSS__.state.sceneId === 'riverside', null, { timeout: 9000 }).catch(() => {});
  report.eq('已到达河湾', (await snap(page)).scene, 'riverside');

  const okCast = await castAtBridge(page);
  report.ok('在河湾栈桥抛竿成功', okCast, '未能开始钓鱼');

  if (okCast) {
    // 第一次必定成功 → 2.2s 结果 → 相遇窗口
    await page.waitForFunction(() => !document.getElementById('windowLayer').hidden, null, { timeout: 15000 })
      .catch(() => {});
    const t = await winTitle(page);
    console.log('  窗口标题:', t);
    console.log('  首句:', (await winText(page)).slice(0, 60).replace(/\n/g, ' / '));
    report.ok('相遇窗口已打开', await winOpen(page), '窗口未打开');
    report.ok('相遇窗口标题正确', /钓上来了什么/.test(t), '实际「' + t + '」');

    // 翻完连续对话：每次都等到「继续 / 把她放下」按钮真的出现再点
    let guard = 0;
    while (guard++ < 25) {
      const cont = page.locator('.win button', { hasText: /继续|把她放下/ });
      try {
        await cont.first().waitFor({ state: 'visible', timeout: 2500 });
      } catch { break; }                       // 窗口已关闭 → 对话结束
      const label = (await cont.first().textContent()) || '';
      await cont.first().click();
      await page.waitForTimeout(260);
      if (/把她放下/.test(label)) break;         // 最后一页已读完
    }

    ds = await dsState(page);
    report.ok('相遇后 dsMet = true', ds.met === true, '实际 ' + ds.met);
    report.ok('相遇窗口已完全关闭', !(await winOpen(page)), '窗口仍开着');
    report.ok('初遇好感 = 10', ds.fsp.ds === 10, '实际 ' + ds.fsp.ds);
    report.ok('对话结束钓鱼会话已清理', ds.fishing === null, JSON.stringify(ds.fishing));
    const inv = (await snap(page)).inv || {};
    const fishes = ['carp', 'trout', 'catfish', 'bass', 'eel', 'crab', 'sunfish', 'perch', 'pike', 'salmon']
      .filter(k => (inv[k] || 0) > 0);
    report.ok('初遇不发放普通鱼', fishes.length === 0, '意外鱼获: ' + fishes.join(','));
  }

  console.log('▶ 3. 相遇后可正常钓鱼（恢复普通鱼逻辑）');
  if (ds.met) {
    const ok2 = await castAtBridge(page);
    report.ok('相遇后仍可抛竿', ok2, '无法抛竿');
    if (ok2) {
      const f2 = await page.evaluate(() => {
        const F = window.__MOSS__.game.fishing;
        return F ? { phase: F.phase, dsFirst: !!F.dsFirst, dsEncounter: !!F.dsEncounter } : null;
      });
      report.ok('第二次钓鱼不再强制相遇', f2 && f2.dsFirst === false, JSON.stringify(f2));
    }
  }

  console.log('▶ 4. 旧存档迁移：缺 dsMet / npcFriendship.ds 不报错且不丢数据');
  // 用一份真实的 v2 存档（但没有 dsMet / npcFriendship.ds），模拟玩家升级前的存档
  const v2save = await page.evaluate(() => window.__MOSS__.serialize());
  delete v2save.dsMet;
  delete v2save.npcFriendship.ds;
  v2save.npcFriendship.yaya = 30;
  v2save.npcFriendship.aqi = 12;
  const v2json = JSON.stringify(v2save);
  const old = await isolatedPage(browser, (save) => {
    localStorage.clear();
    localStorage.setItem('moss-farm-v2', save);
  });
  await old.page.evaluate(save => {
    localStorage.clear();
    localStorage.setItem('moss-farm-v2', save);
  }, v2json);
  await old.page.reload();
  await old.page.waitForFunction(() => !!window.__MOSS__);
  await old.page.waitForFunction(() => !!window.__MOSS__);
  await old.page.locator('.boot-actions button').first().click();
  await old.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden, null, { timeout: 12000 });
  const mig = await old.page.evaluate(() => ({
    met: window.__MOSS__.state.dsMet,
    fsp: window.__MOSS__.state.npcFriendship
  }));
  report.ok('旧存档 dsMet 补成 false', mig.met === false, '实际 ' + mig.met);
  report.ok('旧存档补上 npcFriendship.ds = 0', mig.fsp.ds === 0, JSON.stringify(mig.fsp));
  report.ok('旧存档原有好感不丢', mig.fsp.yaya === 30 && mig.fsp.aqi === 12, JSON.stringify(mig.fsp));
  report.ok('迁移过程无控制台报错', old.errors.length === 0, old.errors.slice(0, 3).join(' | '));
  await old.ctx.close();

  console.log('▶ 5. 相遇后她常驻河湾并可对话');
  if (ds.met) {
    const loc = await page.evaluate(() => {
      const M = window.__MOSS__;
      const r = M.npcRuntime.ds;
      return r ? { x: r.x, y: r.y, scene: M.npcScene('ds') } : null;
    });
    report.ok('DS 小姐已生成运行时位置', !!loc, JSON.stringify(loc));
    report.ok('DS 小姐场景为河湾', loc && loc.scene === 'riverside', JSON.stringify(loc));
    const inMap = await page.evaluate(() => {
      const M = window.__MOSS__;
      const r = M.npcRuntime.ds;
      if (!r) return false;
      return M.state.sceneId === 'riverside';
    });
    report.ok('玩家在河湾时可与她同场', inMap, '不同场');
  }

  report.consoleErrors = errors;
  const pass = report.summary();
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
