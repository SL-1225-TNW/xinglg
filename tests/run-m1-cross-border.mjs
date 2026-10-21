/* M1 P0-2：合法跨封国专项。
 *
 * 四条进入路线（邻领线／航路线／皇家驿路线／山径线）各有自己的凭证：
 * 门禁不再只写一句「未解锁」，而是写清缺哪一项、到哪里办。
 * 三张凭证都在真实存在的柜台与工作台上办理，走的是真按钮、真面板、真走路；
 * 边界出口按凭证放行，没有凭证就停在路口并把缺项端出来。
 *
 * 夹具边界：只补更早阶段已到访的地方、既有到访凭证、湿地调查结论与体力金币，
 * 以及 M0 第一幕交付的民用资料核验函；跨境凭证一律在游戏里现办。
 * 本专项不代替自然取得第一幕的路线、实体手机手感与陌生玩家理解度。
 *
 *   node tests/run-m1-cross-border.mjs
 *   node tests/run-m1-cross-border.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winText, clickWin, walkTo } from './harness.mjs';

const single = process.argv.includes('--single-file');
const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {}), p = r.page;
let checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (a, n) => { assert.ok(a, n); checks++; console.log('PASS', n); };
const scene = () => p.evaluate(() => window.__MOSS__.state.sceneId);
const has = id => p.evaluate(i => window.__MOSS__.storyHasEvidence(i), id);
const missing = key => p.evaluate(k => window.__MOSS__.crossBorderMissing(k).map(q => q.id), key);
const open = key => p.evaluate(k => window.__MOSS__.crossBorderOpen(k), key);
const gate = key => p.evaluate(k => window.__MOSS__.extendedGateAllowed(k), key);
const reason = key => p.evaluate(k => window.__MOSS__.extendedGateReason(k), key);

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
  await p.waitForFunction(() => (!window.__MOSS__.sceneSwitch || !window.__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(260);
}
/* 走到某个出口格，走进去换场景 */
async function walkOut(sceneId, to) {
  const ex = await p.evaluate(sc => (window.__MOSS__.MAPS[sc].exits || []).map(e => ({ x: e.x, y: e.y, to: e.to })), sceneId);
  const target = ex.find(e => e.to === to);
  assert.ok(target, sceneId + ' 没有通往 ' + to + ' 的出口');
  await walkTo(p, target.x, target.y, 60000);
  await p.waitForTimeout(360);
  return (await scene()) === to;
}
/* 走到门口的某格，按 E 进室内（房间门是 extendedDoor 交互点）。
   门牌格本身能踩，所以先站到门的对侧，再一步踏上站位：这一步同时把脸转向门，
   否则按方向键会把人挪出门格，E 反而按不到门。 */
async function enterRoom(outdoor, room) {
  const door = await p.evaluate(([sc, rm]) => {
    const hit = (window.__MOSS__.INTERACTABLES[sc] || []).find(i => i.kind === 'extendedDoor' && i.to === rm);
    return hit ? { x: hit.x, y: hit.y, stand: hit.stand } : null;
  }, [outdoor, room]);
  assert.ok(door, outdoor + ' 里没有通往 ' + room + ' 的门');
  const cands = (door.stand && door.stand.length ? door.stand : [[door.x, door.y + 1], [door.x + 1, door.y], [door.x, door.y - 1], [door.x - 1, door.y]]);
  for (const [sx, sy] of cands) {
    const ax = sx + (sx - door.x), ay = sy + (sy - door.y);
    if (await walkTo(p, ax, ay, 45000) && await walkTo(p, sx, sy, 12000)) {
      await p.keyboard.press('e');
      await p.waitForTimeout(420);
      if ((await scene()) === room) return true;
      await closeWin(p);
      continue;
    }
    if (await walkTo(p, sx, sy, 45000)) {
      await p.keyboard.press('e');
      await p.waitForTimeout(420);
      if ((await scene()) === room) return true;
      await closeWin(p);
    }
  }
  return (await scene()) === room;
}
/* 走到某个工作台旁按 E（站位取自它自己的 stand 表；
   职业柜台的 work 带 profession: 前缀，两种写法都认） */
async function pressSite(workId) {
  const it = await p.evaluate(id => {
    const M = window.__MOSS__, sc = M.state.sceneId;
    const hit = (M.INTERACTABLES[sc] || []).find(i => i.kind === 'extendedLife' && (i.work === id || i.work === 'profession:' + id));
    return hit ? { x: hit.x, y: hit.y, stand: hit.stand } : null;
  }, workId);
  assert.ok(it, '当前场景没有工作台 ' + workId);
  const cands = (it.stand && it.stand.length ? it.stand : [[it.x, it.y + 1], [it.x - 1, it.y], [it.x + 1, it.y], [it.x, it.y - 1]]);
  for (const [sx, sy] of cands) {
    if (!await walkTo(p, sx, sy, 30000)) continue;
    await p.keyboard.press('e');
    await p.waitForTimeout(360);
    if (await winOpen(p)) return true;
    await closeWin(p);
  }
  return false;
}
/* 从室内走回门内侧按 E 出门 */
async function leaveRoom(room) {
  const back = await p.evaluate(rm => {
    const d = (window.__MOSS__.MAPS[rm].doors || [])[0];
    return d && d.stand && d.stand.length ? { x: d.stand[0][0], y: d.stand[0][1] } : null;
  }, room);
  if (!back) return false;
  await walkTo(p, back.x, back.y, 25000);
  await p.keyboard.press('e');
  await p.waitForTimeout(520);
  return (await scene()) !== room;
}
/* 站到边界出口上被拦下，并取回路口面板的文字。
   同一处出口只弹一次面板（免得把人锁在面板里），所以先走开再站回去。
   面板文字在弹出的瞬间抓：走位过程里弹窗会被走位脚本顺手关掉。 */
async function blockedAtExit(to, off) {
  await walkOut('neighbor_border', to);
  await closeWin(p);
  await p.evaluate(() => { window.__gatePanelText = ''; });
  await walkTo(p, off[0], off[1], 25000);
  await walkOut('neighbor_border', to);
  await p.waitForTimeout(240);
  return p.evaluate(() => window.__gatePanelText || '');
}

try {
  await boot(p);
  await p.locator('#tutorialSkip').click();
  /* 面板文字在弹出的瞬间抓下来：走位脚本会把路上的弹窗顺手关掉。 */
  await p.evaluate(() => {
    window.__gatePanelText = '';
    const layer = document.getElementById('windowLayer');
    if (!layer) return;
    new MutationObserver(() => {
      const body = document.querySelector('.win-body');
      if (body && !layer.hidden) window.__gatePanelText = body.innerText;
    }).observe(layer, { childList: true, subtree: true, characterData: true });
  });

  /* ================= 一、没有跨境事实时：门禁写清缺什么 ================= */
  console.log('\n【1】旧档没有跨境事实');
  eq(await missing('pine'), ['letter', 'register'], '邻领线缺核验函与邻领登记');
  eq(await missing('tide'), ['letter', 'portSurvey', 'route'], '航路线缺核验函、河港调查与航路引荐');
  eq(await missing('capital'), ['letter', 'portSurvey', 'coach'], '驿路线缺核验函、河港调查与接驳登记');
  eq(await missing('echo'), ['letter', 'register', 'guide'], '山径线缺核验函、邻领登记与向导带路');
  eq(await gate('ms1_pine'), false, '没有凭证不能进白松');
  ok((await reason('ms1_pine')).includes('核验函'), '未解锁理由点名核验函');
  ok((await reason('ms1_pine')).includes('邻领民用行程登记'), '未解锁理由点名邻领登记');
  ok((await reason('ms1_tide')).includes('航路引荐信'), '潮汐港未解锁理由点名航路引荐');
  eq(await p.evaluate(() => window.__MOSS__.segmentJourneyPreview('pine', 3).ok), false, '条件不齐不能预约白松行程');
  ok((await p.evaluate(() => window.__MOSS__.segmentJourneyPreview('pine', 3).reason)).includes('核验函'), '预约被拒时写出缺哪一项');
  eq((await p.evaluate(() => window.__MOSS__.worldRegionStatus({ id: 'ms1_pine' }))).includes('还缺'), true, '全境地图上写明还缺几项');
  eq(await p.evaluate(() => {
    window.__MOSS__.openCrossBorderPanel('pine');
    return true;
  }), true, '能打开跨境条件面板');
  await p.waitForTimeout(200);
  const panelText = await winText(p);
  ok(panelText.includes('还缺 · 民用资料核验函'), '面板逐项写明还缺什么');
  ok(panelText.includes('白蔷薇宫城'), '面板写明到哪里办');
  await closeWin(p);

  /* ================= 二、边界出口：没有凭证就停在路口 ================= */
  console.log('\n【2】边界出口按凭证放行');
  await p.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.energy = 100; s.coins = 800; s.timeMinutes = 540; s.totalDay = 12;
    ['neighbor.market_town', 'port.lower_lock', 'pass.cloud_peak', 'road.ancient', 'city.gate']
      .forEach(k => { s.travel.discovered[k] = true; });
    M.professionalLifeState().passes.visit = true;
    M.wetlandLifeState().causeFound = true;
    M.saveNow();
  });
  await travelTo('北境邻领边城');
  eq(await scene(), 'neighbor_border', '传到北境邻领边城');
  eq(await walkOut('neighbor_border', 'ms1_pine_village'), false, '没有凭证走不进白松');
  eq(await scene(), 'neighbor_border', '被拦在边城，没有换场景');
  const gateText = await blockedAtExit('ms1_pine_village', [41, 18]);
  ok(gateText.includes('民用资料核验函'), '路口面板点名核验函');
  ok(gateText.includes('邻领民用行程登记'), '路口面板点名邻领登记');
  await closeWin(p);

  /* 拿到核验函（M0 第一幕交付）以后仍然差登记 */
  await p.evaluate(() => window.__MOSS__.storyRecordEvidence('civil_check', 'S017 · 宫城一层门厅'));
  eq(await missing('pine'), ['register'], '有核验函以后只差邻领登记');
  const gateText2 = await blockedAtExit('ms1_pine_village', [41, 18]);
  eq(await scene(), 'neighbor_border', '只拿核验函仍然被拦在边城');
  ok(gateText2.includes('邻领民用行程登记'), '缺项刷新为邻领登记');
  ok(!gateText2.includes('还缺 · 民用资料核验函'), '核验函已具备，不再算缺项');
  await closeWin(p);

  /* ================= 三、阿丽娅的民用行程登记 ================= */
  console.log('\n【3】邻领边城 · 领地联络处');
  ok(await enterRoom('neighbor_border', 'neighbor_office'), '能进领地联络处');
  ok(await pressSite('neighbor_case'), '边界记录台有反应');
  ok((await winText(p)).includes('民用行程登记'), '联络处受理民用行程登记');
  ok((await winText(p)).includes('核验函'), '没有核验函时写明要带什么');
  await clickWin(p, '登记民用行程');
  await p.waitForTimeout(420);
  ok(await has('neighbor_pass'), '登记后邻领通行文书入库');
  const passRec = await p.evaluate(() => window.__MOSS__.state.story.evidence.neighbor_pass);
  ok(passRec.source.includes('阿丽娅'), '文书记着出处');
  ok(typeof passRec.day === 'number' && passRec.day > 0, '文书记着日期');
  ok((await winText(p)).includes('邻领通行文书在手'), '办完面板写明已登记');
  await closeWin(p);
  eq(await open('pine'), true, '邻领线条件齐了');
  eq(await gate('ms1_pine'), true, '白松门禁打开');
  ok(await leaveRoom('neighbor_office'), '从联络处走回街上');
  eq(await scene(), 'neighbor_border', '人在边城街上');
  ok(await walkOut('neighbor_border', 'ms1_pine_village'), '拿到文书后能走进白松');
  eq(await scene(), 'ms1_pine_village', '进了白松旧驿村');

  /* ================= 四、赫莎的带路约定 ================= */
  console.log('\n【4】白松驿舍 · 赫莎带路');
  ok(await enterRoom('ms1_pine_village', 'ms1_pine_inn'), '能进白松驿舍');
  ok(await pressSite('ms1_pine_ledger'), '停运登记簿有反应');
  ok((await winText(p)).includes('赫莎'), '登记簿上写明是谁带路');
  await clickWin(p, '约定赫莎带路');
  await p.waitForTimeout(420);
  ok(await has('echo_guide'), '带路约定入库');
  eq(await open('echo'), true, '山径线条件齐了');
  eq(await gate('ms1_echo'), true, '回声谷门禁打开');
  await closeWin(p);

  /* ================= 五、河港的航路引荐与驿路接驳 ================= */
  console.log('\n【5】下游河港 · 船务屋与船闸值守室');
  await travelTo('下游河港');
  eq(await scene(), 'port', '传到下游河港');
  /* 柜台办理：玩家要站在柜台边，柜台才受理（离得远会被拒） */
  ok(await enterRoom('port', 'port_office'), '能进船务屋');
  eq(await p.evaluate(() => {
    const M = window.__MOSS__, rt = M.__npcRuntime && M.__npcRuntime.port_mia;
    return !!(rt && M.NPCS.port_mia.scene === 'port_office');
  }), true, '米娅在船务屋里');
  ok(await pressSite('port'), '船务屋的运单核验台有反应');
  ok((await winText(p)).includes('航路引荐'), '船务屋办理航路引荐');
  await clickWin(p, '办理航路引荐');
  await p.waitForTimeout(420);
  ok(await has('tide_route'), '航路引荐入库');
  eq(await open('tide'), true, '航路线条件齐了');
  eq(await gate('ms1_tide'), true, '潮汐港门禁打开');
  await closeWin(p);
  /* 柜台上办完要自己走回街上：船闸值守室在街的另一头，门牌不在室内。 */
  ok(await leaveRoom('port_office'), '从船务屋走回河港街上');
  eq(await scene(), 'port', '人在河港街上');
  ok(await enterRoom('port', 'port_lockhouse'), '能进船闸值守室');
  eq(await p.evaluate(() => {
    const M = window.__MOSS__, rt = M.__npcRuntime && M.__npcRuntime.port_leon;
    return !!(rt && M.NPCS.port_leon.scene === 'port_lockhouse');
  }), true, '莱昂在船闸值守室里');
  ok(await pressSite('lock'), '船闸值守室的水尺台有反应');
  ok((await winText(p)).includes('皇家驿路'), '值守室办理皇家驿路接驳');
  await clickWin(p, '办理皇家驿路接驳登记');
  await p.waitForTimeout(420);
  ok(await has('capital_pass'), '驿路接驳登记入库');
  eq(await open('capital'), true, '驿路线条件齐了');
  eq(await gate('ms1_capital'), true, '王都门禁打开');
  await closeWin(p);

  /* ================= 六、凭证与证据一并入库，读档后仍然有效 ================= */
  console.log('\n【6】读档与长期安排');
  const seed = await p.evaluate(() => JSON.stringify(window.__MOSS__.serialize()));
  const qc = await r.browser.newContext(), q = await qc.newPage();
  await q.goto(p.url());
  await q.evaluate(s => { localStorage.clear(); localStorage.setItem('moss-farm-v2', s); }, seed);
  await q.reload();
  await q.locator('.boot-actions button', { hasText: '继续' }).first().click();
  await q.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  eq(await q.evaluate(() => window.__MOSS__.storyHasEvidence('neighbor_pass')), true, '读档后邻领文书还在');
  eq(await q.evaluate(() => window.__MOSS__.storyHasEvidence('tide_route')), true, '读档后航路引荐还在');
  eq(await q.evaluate(() => window.__MOSS__.storyHasEvidence('capital_pass')), true, '读档后驿路凭证还在');
  eq(await q.evaluate(() => window.__MOSS__.storyHasEvidence('echo_guide')), true, '读档后带路约定还在');
  eq(await q.evaluate(() => window.__MOSS__.crossBorderOpen('pine')), true, '读档后门禁判定一致');
  await qc.close();

  /* 长期安排面板里能直接看到跨境条件 */
  await p.evaluate(() => window.__MOSS__.openFarmSchedulePanel());
  await p.waitForTimeout(260);
  const planText = await winText(p);
  ok(planText.includes('跨境通行条件'), '长期安排里有跨境条件一栏');
  ok(planText.includes('已具备 · 民用资料核验函'), '条件齐了逐项标出来');
  await closeWin(p);

  eq(r.errors, [], '无浏览器异常');
  console.log(`M1 合法跨封国 ${checks} 项通过${single ? '（单文件）' : ''}`);
} finally { await r.browser.close(); }
