/* 第九版第一部主线《长风有归处》· M0 切片 —— 序章验收
 *
 * 覆盖：P01 回忆／读信／旧日相识、回忆可跳过与可回看、门牌旁的旧信入口、
 *      P02 的入门成果门槛、未修桥时的镇内替代演出（S005-T / S006-T）、
 *      证据与选择的存档往返、旧档补送信。
 *
 * 走法：每场戏都要玩家真的走到那一格按 E 才开。跨场景的下一场不替玩家
 *      瞬移——面板会写清地点，测试也必须走过去。
 *
 * 夹具边界：
 *   · 入门成果（农田里一格已下种的作物）写成 state.plots —— 这是更早阶段
 *     已经做过的农事，用来让 P02 的门槛成立，不是主线自己发的东西。
 *   · 老档夹具用「新档序列化后删掉 story 字段 + 改成第 8 天」，
 *     模拟第九版主线之前的真实存档。
 *   不写：任务阶段、证据、选择、剧情进度。这些必须由按钮产生。
 *
 *   node tests/run-m0-story.mjs
 *   node tests/run-m0-story.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winTitle, winText, walkTo, faceTowards, snap, isolatedPage } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (n, a, b) => { assert.deepEqual(a, b, n + '（实际 ' + JSON.stringify(a) + '）'); checks++; console.log('PASS', n); };
const ok = (n, c) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const story = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.storyState())));
const taskStatus = id => p.evaluate(i => window.__MOSS__.storyTaskStatus(i), id);
const scene = () => p.evaluate(() => window.__MOSS__.state.sceneId);
const entryOf = id => p.evaluate(eid => {
  const M = window.__MOSS__;
  for (const k in M.INTERACTABLES) {
    const hit = (M.INTERACTABLES[k] || []).find(i => i.id === eid);
    if (hit) return { scene: k, x: hit.x, y: hit.y, label: hit.label, stand: hit.stand };
  }
  return null;
}, id);
const bodyBtns = async () => (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
const footBtns = async () => (await p.locator('.win-foot button').allTextContents()).map(s => s.trim()).filter(Boolean);

async function clickBody(re) {
  const list = await bodyBtns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, '正文里找不到按钮 ' + re + '；现有：' + list.join(' | '));
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(200);
  return list[i];
}
async function clickFoot(re) {
  const list = await footBtns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, '页脚里找不到按钮 ' + re + '；现有：' + list.join(' | '));
  await p.locator('.win-foot button').nth(i).click();
  await p.waitForTimeout(240);
  return list[i];
}
/* 一直点「继续」，直到本场台词走完（分支隐藏的台词会自动跳过） */
async function runToEnd(sceneId, max = 40) {
  for (let i = 0; i < max; i++) {
    const done = await p.evaluate(s => {
      const M = window.__MOSS__;
      const rec = (M.storyState().scenes[s] || { idx: 0 }).idx;
      const def = M.STORY_SCENES[s];
      return rec >= (def ? def.lines.length : 0);
    }, sceneId);
    if (done) return true;
    const list = await footBtns();
    const i2 = list.findIndex(b => /^继续$/.test(b));
    if (i2 < 0) return false;
    await p.locator('.win-foot button').nth(i2).click();
    await p.waitForTimeout(190);
  }
  return false;
}
async function endScene(re) { return clickFoot(re || /继续|回到门前/); }

/* 走到入口旁边的可站格，面朝入口按 E。
   用的是入口四周真正能站的格，不依赖 stand 列表——stand 里有几格紧挨着
   工具目标（田地、矿点），那些格已经被有意排除。 */
async function openEntry(eid, budget = 60000) {
  const e = await entryOf(eid);
  assert.ok(e, '找不到入口 ' + eid);
  const cands = [[e.x, e.y - 1], [e.x + 1, e.y], [e.x, e.y + 1], [e.x - 1, e.y]];
  for (const [sx, sy] of cands) {
    if (!await walkTo(p, sx, sy, budget)) continue;
    await faceTowards(p, e.x, e.y);
    await p.keyboard.press('e');
    await p.waitForTimeout(300);
    if (await winOpen(p)) return true;
    await closeWin(p);
  }
  return false;
}
async function gotoFarm() {
  if (await scene() === 'farm') return true;
  ok('走回农场', await walkTo(p, 0, 10, 30000));
  await p.waitForFunction(() => window.__MOSS__.state.sceneId === 'farm', null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(300);
  return (await scene()) === 'farm';
}
async function gotoTown() {
  if (await scene() === 'town') return true;
  ok('走到小镇', await walkTo(p, 31, 10, 30000));
  await p.waitForFunction(() => window.__MOSS__.state.sceneId === 'town', null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(300);
  return (await scene()) === 'town';
}
async function enterHouse() {
  ok('走到农舍门口', await walkTo(p, 3, 5, 30000));
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('e');
  await p.waitForTimeout(500);
  return (await scene()) === 'house';
}
async function leaveHouse() {
  ok('走到农舍门口要出去', await walkTo(p, 7, 10, 30000));
  await p.keyboard.press('ArrowDown');
  await p.keyboard.press('e');
  await p.waitForTimeout(500);
  return (await scene()) === 'farm';
}

/* ================= 一、序章：回忆 → 旧信 → 交出寄存的索引 ================= */
console.log('\n【1】MQ1-P01 一封信，一处屋檐');
/* 入口不能占用工具目标格：点田地会被入口抢走，锄地就做不成。
   同时检查独立剧情入口与复用的现场操作台。 */
const conflicts = await p.evaluate(() => {
  const M = window.__MOSS__, bad = [];
  const isTool = (sc, x, y) => {
    const map = M.MAPS[sc];
    if (!map) return false;
    const pa = map.plantArea;
    if (pa && x >= pa.x0 && x <= pa.x1 && y >= pa.y0 && y <= pa.y1) return true;
    if ((M.EXPLORE_NODES[sc] || {})[x + ',' + y]) return true;
    const list = (map.trees || []).concat(map.rocks || []).concat(map.berries || []);
    return list.some(pp => pp[0] === x && pp[1] === y);
  };
  const nearTool = (sc, x, y) => isTool(sc, x, y)
    || isTool(sc, x - 1, y) || isTool(sc, x + 1, y) || isTool(sc, x, y - 1) || isTool(sc, x, y + 1);
  M.STORY_ENTRIES.forEach(e => {
    const map = M.MAPS[e.scene];
    if (!map) { bad.push(e.id + ' 场景不存在'); return; }
    /* 入口登记在两种形态里：与操作台同场景时由操作台本身充当入口（按 work 找），
       跨场景时入口单独登记成可按 E 的点（按 id 找）。两种都要查到同一个格。 */
    const list = M.INTERACTABLES[e.scene] || [];
    const hit = list.find(i => i.id === e.id) || (e.workSite ? list.find(i => i.work === e.workSite) : null);
    if (!hit) { bad.push(e.id + ' 未登记'); return; }
    if (hit.x !== e.x || hit.y !== e.y) bad.push(e.id + ' 与现场坐标不一致');
    (M.INTERACTABLES[e.scene] || []).forEach(o => {
      if (o !== hit && o.x === e.x && o.y === e.y) bad.push(e.id + ' 与 ' + (o.id || o.work || o.kind) + ' 同格');
    });
    /* 入口格本身不能是工具目标：那就抢了锄地或采集 */
    if (isTool(e.scene, e.x, e.y)) bad.push(e.id + ' 落在工具目标上');
    /* 站位不能紧挨工具目标：站在那儿点工具会被入口抢走 */
    (hit.stand || []).forEach(c => { if (nearTool(e.scene, c[0], c[1])) bad.push(e.id + ' 站位 ' + c + ' 紧挨工具目标'); });
  });
  return bad;
});
eq('主线入口不占用工具目标格', conflicts, []);
const p01 = await entryOf('ms1_p01');
ok('农舍门牌旁有真实入口', !!p01 && p01.scene === 'farm', JSON.stringify(p01));
ok('走到门牌旁的旧信', await openEntry('ms1_p01', 20000));
eq('旧信面板标题', await winTitle(p), '一封信，一处屋檐');
ok('面板提供回忆入口', (await bodyBtns()).concat(await footBtns()).some(b => /回忆/.test(b)));

const before = await snap(p);
await clickFoot(/回忆/);
eq('进入回忆第一场', await winTitle(p), 'S000A · 旅途棚檐 · 雨后 · 回忆');
await runToEnd('S000A');
ok('回忆第一场出现整理物件的互动', (await bodyBtns()).some(b => /松脱的铜扣/.test(b)));
await clickBody(/松脱的铜扣/);
await clickBody(/伊文的短绳/);
await clickBody(/一块干补片/);
ok('三件摆齐后出现确认按钮', (await bodyBtns()).some(b => /三件都摆好了/.test(b)));
await clickBody(/三件都摆好了/);
ok('下一步是固定扣带', (await bodyBtns()).some(b => /先绕这一圈/.test(b)));
await clickBody(/把开口也绑住/);
ok('选错不会推进', (await bodyBtns()).some(b => /先绕这一圈/.test(b)) && !(await bodyBtns()).some(b => /扣带固定好了/.test(b)));
await clickBody(/先绕这一圈/);
ok('选对后出现确认按钮', (await bodyBtns()).some(b => /扣带固定好了/.test(b)));
await clickBody(/扣带固定好了/);
const afterMemory = await snap(p);
eq('回忆不改世界日期', afterMemory.day, before.day);
eq('回忆不改金币', afterMemory.coins, before.coins);
eq('回忆不改体力', afterMemory.energy, before.energy);
ok('回忆没有发放背包物品', Object.keys(afterMemory.inv).length === Object.keys(before.inv).length);
ok('回忆第一场结束给出下一步', (await footBtns()).some(b => /回到门前/.test(b)), (await footBtns()).join(' | '));
await clickFoot(/回到门前/);
eq('进入回忆第二场', await winTitle(p), 'S000B · 同一棚檐路口 · 傍晚 · 回忆');
await runToEnd('S000B');
ok('回忆第二场给出路线选择', (await bodyBtns()).some(b => /石路/.test(b)));
await clickBody(/林边。到浅水处再看看/);
ok('选择被记进存档', (await story()).choices.memory_route === 'B');
await runToEnd('S000B');
ok('回忆结束后回到门前', (await footBtns()).some(b => /回到门前/.test(b)), (await footBtns()).join(' | '));
await clickFoot(/回到门前/);
ok('回到门前后出现继续按钮', /看那封信/.test((await footBtns()).join(' ')), true);
await clickFoot(/看那封信/);
eq('进入 S001 门前', await winTitle(p), 'S001 · 苔芽农场门前 · 日');
await runToEnd('S001');
ok('S001 给出主角的第一句选择', (await bodyBtns()).some(b => /他大概又忘了看日历/.test(b)));
await clickBody(/他大概又忘了看日历/);
eq('选择已记录', (await story()).choices.p01_reply, 'A');
await runToEnd('S001');
await endScene();
eq('下一场在别处，不替玩家瞬移', await winTitle(p), '下一场在别处');
ok('写明下一场在农舍', /农舍/.test(await winText(p)));
await closeWin(p);
ok('走进农舍', await enterHouse());
ok('走到农舍桌上的旧信', await openEntry('ms1_p01_house', 30000));
eq('农舍打开 S002', await winTitle(p), 'S002 · 农舍 · 日');
await runToEnd('S002');
await endScene();
ok('P01 完成', await taskStatus('MQ1-P01') === 'done');
const st1 = await story();
eq('登记了旧信证据', !!st1.evidence.letter, true);
ok('证据带出处', /S002/.test(st1.evidence.letter.source), st1.evidence.letter.source);
eq('P02 已解锁', await taskStatus('MQ1-P02'), 'available');
ok('完成面板列出下一段', /MQ1-P02/.test(await winText(p)));
ok('记忆两场都记成已看', st1.scenes.S000A && st1.scenes.S000A.seen && st1.scenes.S000B && st1.scenes.S000B.seen);

/* ================= 二、记忆可跳过、可回看 ================= */
console.log('\n【2】回忆可回看');
await closeWin(p);
await p.keyboard.press('j');
await p.waitForTimeout(300);
ok('委托日志里有主线入口', /第一部主线/.test(await winText(p)));
await clickBody(/打开主线日志/);
ok('主线日志打开', /长风有归处/.test(await winTitle(p)));
ok('日志里能回看回忆场次', (await bodyBtns()).some(b => /S000A/.test(b)));
await closeWin(p);

/* ================= 三、P02：入门成果门槛 ================= */
console.log('\n【3】MQ1-P02 泥土记得来时雨');
const p02 = await entryOf('ms1_p02_farm');
ok('田边有真实入口', !!p02 && p02.scene === 'farm');
ok('回农场', await leaveHouse());
await p.evaluate(() => { window.__MOSS__.state.plots['8,5'] = { tilled: true, water: true, crop: 'radish', age: 1, mature: false, harvested: false, regrow: 0, fertility: 100, lastGroup: null, prevGroup: null }; });
await p.waitForTimeout(150);
ok('有农事成果后 P02 可开始', await taskStatus('MQ1-P02') === 'available');
ok('走到田边', await openEntry('ms1_p02_farm', 20000));
eq('田边入口打开 S003', await winTitle(p), 'S003 · 农场田边 · 日');
await runToEnd('S003');
await endScene();
eq('下一场在种子铺', await winTitle(p), '下一场在别处');
ok('写明下一场在小镇种子铺前', /种子铺/.test(await winText(p)));
await closeWin(p);
ok('走到小镇', await gotoTown());
ok('走到种子铺前的账册', await openEntry('ms1_p02_town', 30000));
eq('种子铺打开 S004', await winTitle(p), 'S004 · 小镇种子铺前 · 日');
await runToEnd('S004');
await endScene();
ok('P02 完成', await taskStatus('MQ1-P02') === 'done');
eq('P03 已解锁', await taskStatus('MQ1-P03'), 'available');

/* ================= 四、未修桥时的镇内替代演出 ================= */
console.log('\n【4】MQ1-P03 未修桥 → 镇内替代路线');
eq('桥未修时路线是镇内', await p.evaluate(() => window.__MOSS__.storyRouteFor(window.__MOSS__.STORY_TASKS.find(t => t.id === 'MQ1-P03'))), 'town');
const p03 = await entryOf('ms1_p03_town');
ok('任务板旁有真实入口', !!p03 && p03.scene === 'town');
ok('走到任务板旁的寄存木箱', await openEntry('ms1_p03_town', 30000));
eq('镇内替代第一场', await winTitle(p), 'S005-T · 小镇任务板旁 · 日');
await runToEnd('S005-T');
await endScene();
eq('同在镇上，接着演量架那场', await winTitle(p), 'S006-T · 阿栎木工作坊量架旁 · 日');
await runToEnd('S006-T');
ok('出现对齐木板的互动', (await bodyBtns()).some(b => /钉孔/.test(b)));
await clickBody(/水痕/);
ok('顺序不对不推进', !(await bodyBtns()).some(b => /三处参照都对上了/.test(b)));
await clickBody(/钉孔/);
await clickBody(/固定石/);
await clickBody(/水痕/);
ok('三处参照对齐后出现确认', (await bodyBtns()).some(b => /三处参照都对上了/.test(b)));
await clickBody(/三处参照都对上了/);
await runToEnd('S006-T');
await endScene();
ok('P03 完成', await taskStatus('MQ1-P03') === 'done');
const st3 = await story();
eq('登记了路线批注证据', !!st3.evidence.index, true);
ok('磨坊仍然锁着，没有越权进磨坊', (await p.evaluate(() => window.__MOSS__.state.bridgeRepaired)) === false);
ok('证据来源是镇内替代演出', /S006-T/.test(st3.evidence.index.source), st3.evidence.index.source);
eq('P04 已解锁', await taskStatus('MQ1-P04'), 'available');

/* ================= 五、P04：镇内寄存台 → 回农舍看图册 ================= */
console.log('\n【5】MQ1-P04 信末没有归期');
const p04 = await entryOf('ms1_p04_town');
ok('木工作坊的寄存台有真实入口', !!p04 && p04.scene === 'town');
ok('走到木工作坊的寄存台', await openEntry('ms1_p04_town', 30000));
eq('寄存台打开 S007-T', await winTitle(p), 'S007-T · 小镇木工作坊寄存台 · 日');
await runToEnd('S007-T');
await endScene();
eq('下一场要回农舍', await winTitle(p), '下一场在别处');
ok('写明下一场在农舍桌旁', /农舍桌旁/.test(await winText(p)));
await closeWin(p);
ok('走回农场', await gotoFarm());
ok('走进农舍', await enterHouse());
ok('走到农舍桌上的图册', await openEntry('ms1_p04_house', 30000));
eq('农舍打开 S008', await winTitle(p), 'S008 · 农舍桌旁 · 暮');
await runToEnd('S008');
ok('S008 给出第一幕前的选择', (await bodyBtns()).some(b => /先把家里安顿好|去看看他没画完/.test(b)));
await clickBody(/先把家里安顿好/);
eq('选择已记录', (await story()).choices.p04_choice, 'B');
await runToEnd('S008');
await endScene();
ok('P04 完成（序章收口）', await taskStatus('MQ1-P04') === 'done');
eq('第一幕还没有解锁（缺城市通行）', await taskStatus('MQ1-A01'), 'locked');

/* ================= 六、存档往返 ================= */
console.log('\n【6】存档往返与旧档');
await p.evaluate(() => window.__MOSS__.saveNow());
await p.waitForTimeout(400);
const savedJson = await p.evaluate(() => localStorage.getItem('moss-farm-v2'));
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const stReload = await story();
eq('读档后 P03 仍是完成', stReload.tasks['MQ1-P03'], 'done');
eq('读档后选择仍在', stReload.choices.memory_route, 'B');
eq('读档后证据仍在', !!stReload.evidence.index, true);
eq('读档后路线不变', await p.evaluate(() => window.__MOSS__.storyRouteFor(window.__MOSS__.STORY_TASKS.find(t => t.id === 'MQ1-P03'))), 'town');

/* 旧档：删掉 story 字段，模拟第九版主线之前的存档 */
const oldSave = JSON.parse(savedJson);
delete oldSave.story;
oldSave.totalDay = 8;
oldSave.sceneId = 'farm';
oldSave.player = { x: 9, y: 10, face: 'down' };
const iso = await isolatedPage(r.browser, eval(`() => { localStorage.clear(); localStorage.setItem('moss-farm-v2', ${JSON.stringify(JSON.stringify(oldSave))}); }`));
await iso.page.locator('.boot-actions button').first().click();
await iso.page.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const oldSt = await iso.page.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.storyState())));
eq('旧档读出后主线账本补成默认值', oldSt.tasks['MQ1-P03'], undefined);
eq('旧档没有被补出已看过的场次', Object.keys(oldSt.scenes).length, 0);
eq('旧档没有被补出证据', Object.keys(oldSt.evidence).length, 0);
eq('旧档天数保留', await iso.page.evaluate(() => window.__MOSS__.state.totalDay), 8);
ok('旧档没有控制台报错', iso.errors.length === 0, iso.errors.join('\n'));
/* 旧档在农场遇到旧信，走补送信而不是重做教程 */
const oldEntry = await iso.page.evaluate(() => {
  const M = window.__MOSS__;
  for (const k in M.INTERACTABLES) {
    const hit = (M.INTERACTABLES[k] || []).find(i => i.id === 'ms1_p01');
    if (hit) return { scene: k, x: hit.x, y: hit.y };
  }
  return null;
});
ok('旧档停在农场', await iso.page.evaluate(() => window.__MOSS__.state.sceneId) === 'farm');
/* 站到入口旁边并面朝它：站位要避开紧挨工具目标的那几格 */
await iso.page.evaluate(e => {
  const M = window.__MOSS__;
  M.state.player.x = e.x - 1; M.state.player.y = e.y;
  M.syncPlayer();
}, oldEntry);
await iso.page.waitForTimeout(250);
await iso.page.keyboard.press('ArrowRight');
await iso.page.keyboard.press('e');
await iso.page.waitForTimeout(320);
const oldTitle = await iso.page.evaluate(() => document.querySelector('.win-title') ? document.querySelector('.win-title').textContent : '');
eq('旧档在旧信处走补送信', oldTitle, '补送的信');
const oldFoot = (await iso.page.locator('.win-foot button').allTextContents()).join(' ');
ok('补送信提供拆信与回忆两个入口', /拆开信/.test(oldFoot) && /回忆/.test(oldFoot), oldFoot);
await iso.page.locator('.win-foot button').filter({ hasText: '拆开信' }).first().click();
await iso.page.waitForTimeout(320);
const oldSceneTitle = await iso.page.evaluate(() => document.querySelector('.win-title') ? document.querySelector('.win-title').textContent : '');
eq('补送信后进入 S001', oldSceneTitle, 'S001 · 苔芽农场门前 · 日');
ok('旧档主线没有报错', iso.errors.length === 0, iso.errors.join('\n'));
await iso.ctx.close();

ok('全程无控制台报错', r.errors.length === 0, r.errors.join('\n'));
console.log('\nPASS 第九版主线 M0 序章切片：' + checks + ' 项（' + (single ? '单文件版' : '源码') + '）');
await r.browser.close();
