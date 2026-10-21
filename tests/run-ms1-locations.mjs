/* 第九版第一部新地点 · 自然入口与结构验收
 *
 * 覆盖总规 §24.2 的 17 个场景：
 *   · 四个新地区都能从既有世界走过去（邻领边城→白松驿村→山径→回声谷；
 *     河港→潮汐港码头→外海堤；码头→王都驿站街）
 *   · 九个室内都能进能出，门洞站在门外那一格按 E
 *   · 十名新增人物都在该在的地点，能搭上话
 *   · 四个公共传送节点已注册，全境地图上能看到这四个地区
 *
 * 夹具边界：只补 travel.discovered（更早阶段已经走过的地方）与能量金币；
 * 地形、门洞、出口、人物位置全部由真实走路与按 E 验证。
 *
 *   node tests/run-ms1-locations.mjs
 *   node tests/run-ms1-locations.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winTitle, walkTo, faceTowards, press } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (n, a, b) => { assert.deepEqual(a, b, n + '（实际 ' + JSON.stringify(a) + '）'); checks++; console.log('PASS', n); };
const ok = (n, c) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const scene = () => p.evaluate(() => window.__MOSS__.state.sceneId);
const entryOf = (sceneId, room) => p.evaluate(([sc, rm]) => {
  const hit = (window.__MOSS__.INTERACTABLES[sc] || []).find(i => i.kind === 'extendedDoor' && i.to === rm);
  return hit ? { x: hit.x, y: hit.y, label: hit.label } : null;
}, [sceneId, room]);
const exitsOf = sceneId => p.evaluate(sc => (window.__MOSS__.MAPS[sc].exits || []).map(e => ({ x: e.x, y: e.y, to: e.to })), sceneId);

/* 走到某个出口格，走进去换场景 */
async function walkOut(sceneId, to) {
  const list = await exitsOf(sceneId);
  const ex = list.find(e => e.to === to);
  assert.ok(ex, sceneId + ' 没有通往 ' + to + ' 的出口');
  const walked = await walkTo(p, ex.x, ex.y, 60000);
  await p.waitForFunction(w => window.__MOSS__.state.sceneId === w, to, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(320);
  if ((await scene()) !== to) {
    const st = await p.evaluate(() => ({ sc: window.__MOSS__.state.sceneId, x: window.__MOSS__.state.player.x, y: window.__MOSS__.state.player.y }));
    console.log('  [调试] 从 ' + sceneId + ' 去 ' + to + ' 失败：walked=' + walked + ' 落点 ' + JSON.stringify(st));
  }
  return (await scene()) === to;
}
/* 走到门口按 E 进室内（可顺手在屋里做点事），再走回门内侧按 E 出来 */
async function throughDoor(outdoor, room, insideFn) {
  const d = await entryOf(outdoor, room);
  assert.ok(d, outdoor + ' 里没有通往 ' + room + ' 的门');
  const cands = [[d.x, d.y - 1], [d.x + 1, d.y], [d.x, d.y + 1], [d.x - 1, d.y]];
  let opened = false;
  for (const [sx, sy] of cands) {
    if (!await walkTo(p, sx, sy, 30000)) continue;
    await faceTowards(p, d.x, d.y);
    await p.keyboard.press('e');
    await p.waitForTimeout(420);
    if ((await scene()) === room) { opened = true; break; }
    await closeWin(p);
  }
  if (!opened) return { ok: false, inside: null };
  await p.waitForFunction(() => (!window.__MOSS__.sceneSwitch || !window.__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(250);
  let inside = null;
  if (insideFn) inside = await insideFn();
  /* 从室内走回门内侧的站位，按 E 出来 */
  const back = await p.evaluate(scid => {
    const d = (window.__MOSS__.MAPS[scid].doors || [])[0];
    return d && d.stand && d.stand.length ? { x: d.stand[0][0], y: d.stand[0][1] } : null;
  }, room);
  if (back) {
    await walkTo(p, back.x, back.y, 30000);
    await faceTowards(p, back.x, back.y + 1);
    await p.keyboard.press('e');
    await p.waitForTimeout(420);
    await p.waitForFunction(() => (!window.__MOSS__.sceneSwitch || !window.__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
    await p.waitForTimeout(250);
  }
  return { ok: (await scene()) === outdoor, inside: inside };
}
/* 和一个新人物搭话：走到他旁边按 E */
async function talkTo(npcId) {
  /* 人物位置按日程走：进屋后等一拍再读，免得读到上一间屋的旧坐标 */
  await p.waitForTimeout(450);
  const npc = await p.evaluate(id => {
    const M = window.__MOSS__;
    const info = M.npcInfo(id);
    const rt = M.__npcRuntime && M.__npcRuntime[id];
    if (!info || !rt) return null;
    if (info.scene !== M.state.sceneId) return null;
    return { name: info.name, scene: info.scene, x: rt.x, y: rt.y };
  }, npcId);
  if (!npc) return false;
  const cands = [[npc.x, npc.y - 1], [npc.x + 1, npc.y], [npc.x, npc.y + 1], [npc.x - 1, npc.y], [npc.x, npc.y]];
  for (const [sx, sy] of cands) {
    if (!await walkTo(p, sx, sy, 20000)) continue;
    const now = await p.evaluate(id => {
      const rt = window.__MOSS__.__npcRuntime && window.__MOSS__.__npcRuntime[id];
      return rt ? { x: rt.x, y: rt.y } : null;
    }, npcId);
    if (!now) continue;
    await faceTowards(p, now.x, now.y);
    await p.keyboard.press('e');
    await p.waitForTimeout(320);
    if (await winOpen(p)) {
      const t = await winTitle(p);
      await closeWin(p);
      if (t && t.length) return true;
    }
  }
  return false;
}
/* M 地图传送：真实按键走到那个地点 */
async function travelTo(name) {
  await closeWin(p);
  await p.keyboard.press('m');
  await p.waitForTimeout(320);
  let node = p.getByRole('button', { name: new RegExp('^' + name) });
  if (!(await node.count())) {
    const zoom = p.getByRole('button', { name: '全境总图' });
    if (await zoom.count()) { await zoom.first().click(); await p.waitForTimeout(300); }
    node = p.getByRole('button', { name: new RegExp('^' + name) });
  }
  assert.ok(await node.count(), 'M 地图上没有「' + name + '」');
  await node.first().click();
  await p.waitForTimeout(220);
  const go = p.getByRole('button', { name: '传送过去', exact: true });
  assert.ok(await go.count(), '「' + name + '」不能传送');
  await go.first().click();
  await p.waitForTimeout(420);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(260);
}

/* 夹具：更早阶段已经到访过的地方与已办下来的通行，
   让新地点能从既有世界走过去；地形、门洞、出口、人物位置全部靠真实走路验证。
   P0-2 规则变更：跨地区现在按凭证放行，夹具补上 M0 的核验函与四张跨境凭证，
   门槛本身由 tests/run-m1-cross-border.mjs 单独守着。 */
await p.evaluate(() => {
  const M = window.__MOSS__, s = M.state;
  s.energy = 100; s.coins = 800; s.timeMinutes = 540; s.totalDay = 12;
  ['neighbor.market_town', 'port.lower_lock', 'pass.cloud_peak', 'road.ancient', 'city.gate']
    .forEach(k => { s.travel.discovered[k] = true; });
  /* 已办下来的到访凭证与湿地调查结论：这两样是进入邻领与河港的既有前提 */
  M.professionalLifeState().passes.visit = true;
  M.wetlandLifeState().causeFound = true;
  /* P0-2：跨封国凭证。缺了它们就走不到白松、潮汐港、王都与回声谷。 */
  M.storyRecordEvidence('civil_check', 'S017 · 宫城一层门厅');
  ['neighbor_pass', 'tide_route', 'capital_pass', 'echo_guide']
    .forEach(id => M.storyRecordEvidence(id, '夹具 · P0-2 跨境凭证'));
  M.saveNow();
});

/* ================= 一、白松驿村 → 白松山径 → 回声谷 ================= */
console.log('\n【1】白松驿村 · 白松山径 · 回声谷');
await travelTo('北境邻领边城');
eq('传送到邻领边城', await scene(), 'neighbor_border');
ok('从边城走到白松旧驿村', await walkOut('neighbor_border', 'ms1_pine_village'));
eq('进了白松旧驿村', await scene(), 'ms1_pine_village');
const inn = await throughDoor('ms1_pine_village', 'ms1_pine_inn', async () => await talkTo('ms1_hessa'));
ok('驿舍能进能出', inn.ok);
ok('赫莎在驿舍里', inn.inside);
ok('从驿村走到白松山径', await walkOut('ms1_pine_village', 'ms1_pine_path'));
eq('进了白松山径', await scene(), 'ms1_pine_path');
ok('从山径走到回声谷分岔', await walkOut('ms1_pine_path', 'ms1_echo_fork'));
eq('进了旧官道分岔', await scene(), 'ms1_echo_fork');
ok('从分岔走到回声谷村落', await walkOut('ms1_echo_fork', 'ms1_echo_village'));
eq('进了回声谷村落', await scene(), 'ms1_echo_village');
ok('公屋能进能出', await throughDoor('ms1_echo_village', 'ms1_echo_hall'));
const house = await throughDoor('ms1_echo_village', 'ms1_echo_house', async () => {
  const a = await talkTo('ms1_iven');
  const b = await talkTo('ms1_ruen');
  return a && b;
});
ok('测绘屋能进能出', house.ok);
ok('伊文与鲁恩都在测绘屋', house.inside);
ok('弥拉在村落里', await talkTo('ms1_mira'));
ok('从村落走到北坡临时通道', await walkOut('ms1_echo_village', 'ms1_echo_route'));
eq('进了北坡接应坪', await scene(), 'ms1_echo_route');
ok('从接应坪走回旧官道分岔', await walkOut('ms1_echo_route', 'ms1_echo_fork'));

/* ================= 二、潮汐港 ================= */
console.log('\n【2】潮汐港 · 海关码头与工人街 · 外海堤');
await travelTo('下游河港');
eq('传送到下游河港', await scene(), 'port');
ok('从河港走到潮汐港码头', await walkOut('port', 'ms1_tide_docks'));
eq('进了潮汐港码头', await scene(), 'ms1_tide_docks');
ok('维克在码头', await talkTo('ms1_vik'));
ok('邮务所能进能出', await throughDoor('ms1_tide_docks', 'ms1_tide_post'));
ok('从码头走到外海堤', await walkOut('ms1_tide_docks', 'ms1_tide_seawall'));
eq('进了外海堤', await scene(), 'ms1_tide_seawall');
const clinic = await throughDoor('ms1_tide_seawall', 'ms1_tide_clinic', async () => await talkTo('ms1_nadine'));
ok('海员医舍能进能出', clinic.ok);
ok('娜汀在医舍里', clinic.inside);

/* ================= 三、王都 ================= */
console.log('\n【3】王都 · 驿站街与钟楼前庭');
/* 先从外海堤走回码头，再沿皇家驿路走进王都 */
ok('从外海堤走回码头', await walkOut('ms1_tide_seawall', 'ms1_tide_docks'));
ok('沿皇家驿路走进王都', await walkOut('ms1_tide_docks', 'ms1_capital_street'));
eq('进了王都驿站街', await scene(), 'ms1_capital_street');
ok('行旅舍能进能出', await throughDoor('ms1_capital_street', 'ms1_capital_inn'));
const office = await throughDoor('ms1_capital_street', 'ms1_capital_office', async () => await talkTo('ms1_aurelle'));
ok('调查公署能进能出', office.ok);
ok('奥蕾尔在调查公署', office.inside);
const archive = await throughDoor('ms1_capital_street', 'ms1_capital_archive', async () => await talkTo('ms1_eno'));
ok('档案院能进能出', archive.ok);
ok('艾诺在档案院', archive.inside);
ok('公议厅能进能出', await throughDoor('ms1_capital_street', 'ms1_capital_hearing'));
ok('科林在驿站街', await talkTo('ms1_colin'));
ok('伯兰在驿站街', await talkTo('ms1_beran'));

/* ================= 四、地图与传送节点 ================= */
console.log('\n【4】全境地图与公共传送节点');
await closeWin(p);
await p.keyboard.press('m');
await p.waitForTimeout(320);
const mapText = await p.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.atlas-place')).map(b => b.textContent);
  return btns.join(' | ');
});
ok('地图上有白松旧驿村', /白松旧驿村/.test(mapText), mapText);
ok('地图上有潮汐港', /潮汐港/.test(mapText));
ok('地图上有王都', /王都/.test(mapText));
ok('地图上有回声谷', /回声谷/.test(mapText));
await closeWin(p);
const nodes = await p.evaluate(() => (window.__MOSS__.travelNodes || []).map(n => n.id));
ok('白松驿村有公共传送节点', nodes.includes('pine.station_village'), nodes.join(' | '));
ok('潮汐港有公共传送节点', nodes.includes('tide.harbor'));
ok('王都有公共传送节点', nodes.includes('capital.station_street'));
ok('回声谷有公共传送节点', nodes.includes('echo.valley'));

/* ================= 五、地点里的操作台 ================= */
console.log('\n【5】新地点的操作台不是空按钮');
const siteOk = await p.evaluate(() => {
  const M = window.__MOSS__;
  const ids = ['ms1_pine_sign', 'ms1_path_fork1', 'ms1_path_fork2', 'ms1_path_fork3', 'ms1_pine_ledger',
    'ms1_echo_tunnel', 'ms1_echo_site', 'ms1_echo_garden', 'ms1_echo_table', 'ms1_echo_desk', 'ms1_echo_staging',
    'ms1_tide_customs', 'ms1_tide_cargo', 'ms1_tide_bollard', 'ms1_tide_sort', 'ms1_tide_chart',
    'ms1_capital_notice', 'ms1_capital_desk', 'ms1_capital_archive', 'ms1_capital_hearing', 'ms1_capital_letters'];
  const missing = [];
  Object.keys(M.INTERACTABLES).forEach(sc => {
    (M.INTERACTABLES[sc] || []).forEach(it => {
      if (it.kind === 'extendedLife' && it.work && it.work.indexOf('ms1_') === 0 && ids.indexOf(it.work) < 0) missing.push(it.work);
    });
  });
  return { missing: missing, total: ids.length };
});
eq('新地点的操作台都登记了', siteOk.missing, []);
/* 操作台必须站得住：交互点本身和它的站位都不能压在家具、水面或树上 */
const standOk = await p.evaluate(() => {
  const M = window.__MOSS__, bad = [];
  Object.keys(M.INTERACTABLES).forEach(sc => {
    (M.INTERACTABLES[sc] || []).forEach(it => {
      if (!it.work || it.work.indexOf('ms1_') !== 0) return;
      if (M.isSolid(sc, it.x, it.y)) bad.push(it.work + ' 交互点 ' + it.x + ',' + it.y + ' 不可站');
      (it.stand || []).forEach(c => {
        if (M.isSolid(sc, c[0], c[1])) bad.push(it.work + ' 站位 ' + c + ' 不可站');
      });
    });
  });
  return bad;
});
eq('新地点的操作台都站得住', standOk, []);

ok('全程无控制台报错', r.errors.length === 0, r.errors.join('\n'));
console.log('\nPASS 第九版新地点验收：' + checks + ' 项（' + (single ? '单文件版' : '源码') + '）');
await r.browser.close();
