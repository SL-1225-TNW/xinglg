/* 白蔷薇宫城 · 存档迁移与往返不变式（docs/palace-p1-contract.md §8）
   锁死四条性质：
     1. 旧档迁移：没有 palace 字段、玩家停在 city_castle 的存档读入后，
        落到 palace_f1 门厅、落点可走，且任务 / 好感 / 供货 / 通行证原样保留
     2. 迁移只做一次：迁移后的存档再存再读，玩家坐标不被二次挪动
     3. 往返不变式：保存 → 加载 → 保存，palace 字段与场景坐标完全一致
     4. 新档不被动：全新开局 palace.layoutVersion 也是 1，但玩家不被挪动
   预置存档一律走独立上下文：主页面在卸载时（game.js beforeunload → saveNow）
   会把运行中的存档写回去，抢掉我们埋的旧档。 */
import fs from 'node:fs';
import { launch, boot, isolatedPage } from './harness.mjs';

const SAVE_KEY = 'moss-farm-v2';
const F1 = 'palace_f1';          // 迁移落点：一层门厅（契约 §8）
const LEGACY_SCENE = 'city_castle';   // 旧版二层的 ID，扩层后仍沿用

let checks = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) { checks++; console.log('PASS', name); return true; }
  failed.push(name + (detail ? ' · ' + detail : ''));
  console.log('FAIL', name + (detail ? ' · ' + detail : ''));
  return false;
}
const eqText = a => JSON.stringify(a);

/* 在独立上下文里把 raw 写进存档键 → 重载 → 点“继续游戏” → 返回页面句柄 */
async function loadSave(browser, raw) {
  const c = await isolatedPage(browser, () => { localStorage.clear(); }, { width: 1100, height: 820 });
  await c.page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, raw]);
  await c.page.reload();
  await c.page.waitForFunction(() => !!window.__MOSS__);
  await c.page.locator('.boot-actions button').first().click();
  await c.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  await c.page.waitForTimeout(250);
  return c;
}
const readSave = page => page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
/* 迁移前后都要比的那几项 */
const watch = page => page.evaluate(() => {
  const s = window.__MOSS__.state;
  return {
    scene: s.sceneId, x: s.player.x, y: s.player.y,
    quests: JSON.stringify(s.questProgress), friend: JSON.stringify(s.npcFriendship),
    shipping: JSON.stringify(s.shipping), permitCity: !!(s.exploration && s.exploration.city),
    coins: s.coins, day: s.totalDay, palace: s.palace ? JSON.parse(JSON.stringify(s.palace)) : null
  };
});

const run = await launch();
let seed;
fs.mkdirSync('output/playwright', { recursive: true });
try {
  const p = run.page;
  await boot(p);

  /* --- 造一份真实形态的旧档：正常流程跑出一份存档，删掉 palace，
         把玩家改成停在 city_castle，再写回。 --- */
  seed = await p.evaluate(([key, legacyScene]) => {
    const M = window.__MOSS__;
    /* 先给存档一点内容，迁移后要能逐项比对“没丢” */
    M.state.totalDay = 6; M.state.coins = 4321;
    M.state.questProgress[1] = 'done'; M.state.questProgress[2] = 'unlocked';
    M.state.npcFriendship.yaya = 33; M.state.npcFriendship.aqi = 21;
    M.state.shipping.radish = 7;
    /* 停在 city_* 需要城市通行证，否则读档守卫（game.js normalizeSave）
       会先把人弹回小镇，测的就不是宫殿迁移了 */
    M.state.exploration.city = true;
    M.saveNow();
    const raw = JSON.parse(localStorage.getItem(key));
    delete raw.palace;                       // 旧档没有 palace 字段
    raw.sceneId = legacyScene;
    raw.player = { x: 17, y: 7, face: 'down' };
    return {
      raw: JSON.stringify(raw),
      before: {
        quests: JSON.stringify(raw.questProgress), friend: JSON.stringify(raw.npcFriendship),
        shipping: JSON.stringify(raw.shipping), permitCity: raw.exploration.city === true,
        coins: raw.coins, day: raw.totalDay, scene: raw.sceneId,
        pos: [raw.player.x, raw.player.y]
      }
    };
  }, [SAVE_KEY, LEGACY_SCENE]);

  /* 核对的是即将埋进 localStorage 的那份旧档原文，不是运行中游戏自己写的存档 */
  ok('旧档确实不带 palace 字段', !('palace' in JSON.parse(seed.raw)),
    '旧档原文里意外带了 palace 字段');
  ok('旧档玩家停在 ' + LEGACY_SCENE, seed.before.scene === LEGACY_SCENE && eqText(seed.before.pos) === '[17,7]',
    eqText(seed.before.scene) + ' @ ' + eqText(seed.before.pos));
} finally {
  await run.ctx.close();   // 关掉主页面，卸载时的自动保存不再干扰后面埋的档
}

try {
  /* --- 1 旧档迁移 --- */
  const m = await loadSave(run.browser, seed.raw);
  const after = await watch(m.page);

  ok('旧档读入后 state.palace 存在', !!after.palace, 'state.palace=' + eqText(after.palace));
  ok('旧档迁移后 palace.layoutVersion === 1',
    after.palace && after.palace.layoutVersion === 1,
    'layoutVersion=' + (after.palace ? after.palace.layoutVersion : '（无 palace）'));
  ok('旧档迁移后玩家落到一层门厅 ' + F1, after.scene === F1,
    '实际场景 ' + after.scene + ' @ (' + after.x + ',' + after.y + ')');
  const walkable = await m.page.evaluate(([sc, x, y]) => {
    const M = window.__MOSS__;
    if (!M.MAPS[sc]) return '场景不存在：' + sc;
    return M.MAPS[sc].solid[x][y] === 0;
  }, [after.scene, after.x, after.y]);
  ok('迁移落点不卡在墙里', walkable === true,
    (after.scene === F1 ? '' : '场景不是一层门厅，') + 'MAPS[' + after.scene + '].solid[' + after.x + '][' + after.y + ']=' +
    String(walkable));
  ok('迁移保留了任务进度', after.quests === seed.before.quests,
    '迁移前 ' + seed.before.quests + ' / 迁移后 ' + after.quests);
  ok('迁移保留了 NPC 好感', after.friend === seed.before.friend,
    '迁移前 ' + seed.before.friend + ' / 迁移后 ' + after.friend);
  ok('迁移保留了供货箱', after.shipping === seed.before.shipping,
    '迁移前 ' + seed.before.shipping + ' / 迁移后 ' + after.shipping);
  ok('迁移保留了已取得的城市通行证', after.permitCity === seed.before.permitCity && after.permitCity === true,
    '迁移前 ' + seed.before.permitCity + ' / 迁移后 ' + after.permitCity);
  ok('迁移保留了金币与天数', after.coins === seed.before.coins && after.day === seed.before.day,
    '金币 ' + seed.before.coins + '→' + after.coins + '，天数 ' + seed.before.day + '→' + after.day);
  ok('旧档迁移流程无控制台错误', m.errors.length === 0, m.errors.slice(0, 3).join(' | '));

  await m.page.locator('canvas').first().screenshot({ path: 'output/playwright/palace-save-migrated.png' }).catch(() => { });

  /* --- 2 迁移只执行一次 --- */
  await m.page.evaluate(() => window.__MOSS__.saveNow());
  const migratedRaw = await readSave(m.page);
  const m2 = await loadSave(run.browser, migratedRaw);
  const after2 = await watch(m2.page);
  ok('迁移后的存档会写回 palace.layoutVersion',
    after2.palace && after2.palace.layoutVersion === 1, 'palace=' + eqText(after2.palace));
  ok('迁移只执行一次（重开不再挪一次玩家）',
    after2.scene === after.scene && after2.x === after.x && after2.y === after.y,
    '第一次迁移落在 (' + after.scene + ',' + after.x + ',' + after.y + ') / 第二次读档后 (' +
    after2.scene + ',' + after2.x + ',' + after2.y + ')');
  const stillWalkable = await m2.page.evaluate(([sc, x, y]) => {
    const M = window.__MOSS__;
    return !!M.MAPS[sc] && M.MAPS[sc].solid[x][y] === 0;
  }, [after2.scene, after2.x, after2.y]);
  ok('二次读档后落点依然可走', stillWalkable === true,
    'MAPS[' + after2.scene + '].solid[' + after2.x + '][' + after2.y + ']=' + String(stillWalkable));
  ok('二次读档流程无控制台错误', m2.errors.length === 0, m2.errors.slice(0, 3).join(' | '));
  await m2.ctx.close();

  /* --- 3 存档往返不变式：保存 → 加载 → 保存 --- */
  const rawA = await readSave(m.page);
  const r1 = await loadSave(run.browser, rawA);
  await r1.page.evaluate(() => window.__MOSS__.saveNow());
  const rawB = await readSave(r1.page);
  const a = JSON.parse(rawA), b = JSON.parse(rawB);
  ok('往返后 palace 字段完全一致', eqText(a.palace) === eqText(b.palace),
    'A ' + eqText(a.palace) + ' / B ' + eqText(b.palace));
  ok('往返后场景一致', a.sceneId === b.sceneId, 'A ' + a.sceneId + ' / B ' + b.sceneId);
  ok('往返后玩家坐标一致',
    a.player.x === b.player.x && a.player.y === b.player.y,
    'A (' + a.player.x + ',' + a.player.y + ') / B (' + b.player.x + ',' + b.player.y + ')');
  ok('往返后 palace 仍带 layoutVersion', b.palace && b.palace.layoutVersion === 1,
    'palace=' + eqText(b.palace));
  ok('往返流程无控制台错误', r1.errors.length === 0, r1.errors.slice(0, 3).join(' | '));
  await r1.ctx.close();
  await m.ctx.close();

  /* --- 4 全新开局不经过迁移 --- */
  const fresh = await isolatedPage(run.browser, () => { localStorage.clear(); }, { width: 1100, height: 820 });
  await fresh.page.reload();
  await fresh.page.waitForFunction(() => !!window.__MOSS__);
  await fresh.page.locator('.boot-actions button', { hasText: '开始新的游戏' }).click();
  await fresh.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  await fresh.page.waitForTimeout(250);
  const newState = await fresh.page.evaluate(() => {
    const M = window.__MOSS__;
    const def = M.freshState();
    return {
      scene: M.state.sceneId, x: M.state.player.x, y: M.state.player.y,
      defScene: def.sceneId, defX: def.player.x, defY: def.player.y,
      palace: M.state.palace ? JSON.parse(JSON.stringify(M.state.palace)) : null
    };
  });
  ok('新档也有 palace.layoutVersion === 1',
    newState.palace && newState.palace.layoutVersion === 1, 'palace=' + eqText(newState.palace));
  ok('新档玩家没有被迁移挪动',
    newState.scene === newState.defScene && newState.x === newState.defX && newState.y === newState.defY,
    '新档 (' + newState.scene + ',' + newState.x + ',' + newState.y + ') / 基准 (' +
    newState.defScene + ',' + newState.defX + ',' + newState.defY + ')');
  const newWalk = await fresh.page.evaluate(([sc, x, y]) => {
    const M = window.__MOSS__;
    return !!M.MAPS[sc] && M.MAPS[sc].solid[x][y] === 0;
  }, [newState.scene, newState.x, newState.y]);
  ok('新档起始位置可走', newWalk === true,
    'MAPS[' + newState.scene + '].solid[' + newState.x + '][' + newState.y + ']=' + String(newWalk));
  ok('新开局流程无控制台错误', fresh.errors.length === 0, fresh.errors.slice(0, 3).join(' | '));

  fs.mkdirSync('output/playwright', { recursive: true });
  await fresh.page.locator('canvas').first()
    .screenshot({ path: 'output/playwright/palace-save-newgame.png' }).catch(() => { });
  await fresh.ctx.close();
} finally {
  await run.browser.close();
}

console.log('\n================ 宫城存档不变式 ================');
console.log(`通过 ${checks} 项，失败 ${failed.length} 项`);
if (failed.length) {
  console.log('\n--- 失败明细 ---');
  failed.forEach(f => console.log('  ✗ ' + f));
}
console.log('==============================================\n');
process.exitCode = failed.length ? 1 : 0;
