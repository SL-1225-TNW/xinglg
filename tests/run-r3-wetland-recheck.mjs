/* R3-D：湿地／河湾水位复查（P0-1）。
   复查只写一次；登记前要求许可、原因查明与栖息地修复三件事均已完成；
   复查只读工程与湿地已存事实，不在工程未验收时把水位归功于工程；
   接受普通调查、辨迹／识矿两种入口（未学天赋时不让按钮出现，但不强迫）；
   重载存档、重复点击、空白老档都能保持单一记录。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, boot, clickWin, closeWin } from './harness.mjs';

const single = process.argv.includes('--single-file');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const eq = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log('PASS', label);
};
const ok = (cond, label) => { assert.ok(cond, label); checks++; console.log('PASS', label); };

async function freshRun() {
  const run = await launch(single ? { url: pathToFileURL(path.join(root, '苔芽农场-单文件版.html')).href } : {});
  const p = run.page;
  await boot(p);
  await p.locator('#tutorialSkip').click();
  return { run, p };
}
/* 直接以真实字段铺设工程记录，绕过 engFixture*（避免被 fixtures 改成 accepted）。
   选择 phase ∈ { 'survey', 'scheme', 'build', 'trial', 'accepted' }。 */
async function setProject(p, scheme, phase) {
  return p.evaluate(({ scheme, phase }) => {
    const M = __MOSS__;
    M.state.totalDay = Math.max(M.state.totalDay || 1, 10);
    const pj = M.professionalLifeState().projects.riverbay_gate;
    if (!pj || typeof pj !== 'object') return { error: 'no_project' };
    pj.id = 'riverbay_gate';
    pj.scheme = scheme;
    pj.phase = phase;
    pj.survey = { level: 2, day: 10, east: 'sound', silt: 'light' };
    pj.practice = 'mill';
    pj.opinions = { mill: true, meadow: true, port: true };
    pj.funds = pj.funds || { granted: 150, spent: 0, donated: 0, tx: {} };
    pj.funds.granted = 150;
    pj.stone = true; pj.stoneDay = 10; pj.kit = (scheme === 'balanced') ? 1 : 1;
    if (phase === 'build' || phase === 'trial') pj.build = 1;
    pj.buildDay = 10;
    pj.schemeDay = 10;
    pj.trialDay = phase === 'accepted' || phase === 'trial' ? Math.max(1, M.state.totalDay - 1) : 0;
    pj.mode = 'self';
    pj.crew = { day: 0, paid: 0 };
    pj.maintDay = 0; pj.maintCount = 0;
    pj.emergency = '';
    if (phase === 'accepted') {
      var SCHEMES = __MOSS__.ENG_SCHEMES;
      pj.build = (SCHEMES[pj.scheme] && SCHEMES[pj.scheme].build.length) || 3;
    }
    __MOSS__.deriveWaterworksFromProject(M.professionalLifeState(), M.professionalLifeState().waterworks);
    return { phase: __MOSS__.professionalLifeState().projects.riverbay_gate.phase, scheme: __MOSS__.professionalLifeState().projects.riverbay_gate.scheme };
  }, { scheme, phase });
}
async function setWetland(p, opts) {
  return p.evaluate((opts) => {
    const M = __MOSS__;
    const w = M.wetlandLifeState();
    w.permit = !!opts.permit;
    w.causeFound = !!opts.causeFound;
    w.upstreamSample = w.causeFound;
    w.outfallSample = w.causeFound;
    w.surveyCount = w.causeFound ? Math.max(1, w.surveyCount || 0) : 0;
    w.baselineBirdCount = 5;
    w.birdCount = 5;
    if (opts.habitat === 'reeds' || opts.habitat === 'open_water') {
      w.habitat = opts.habitat;
      w.restoredDay = opts.restoredDay || M.state.totalDay;
      w.plantSamples = w.habitat === 'reeds' ? 4 : 0;
      w.stewardship = 50;
    } else {
      w.habitat = null;
      w.restoredDay = 0;
    }
    if (opts.recheck) w.recheck = opts.recheck;
    else w.recheck = null;
    return { ok: true };
  }, opts);
}
async function grantTalent(p, id) {
  return p.evaluate((id) => {
    const c = __MOSS__.charState();
    c.talents = c.talents || {};
    c.talents[id] = true;
    __MOSS__.state.char = __MOSS__.state.char || {};
    __MOSS__.state.char.talents = c.talents;
    return { ok: true };
  }, id);
}
async function openRecheck(p) {
  return p.evaluate(() => {
    __MOSS__.devSwitchScene('wetland_observation', 10, 6);
    __MOSS__.openWetlandSite('wetland_recheck');
  });
}
async function readRecheck(p) {
  return p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.wetlandLifeState().recheck)));
}
async function caseUnaccepted() {
  const { run, p } = await freshRun();
  try {
    const r1 = await setProject(p, 'conservative', 'scheme');
    ok(r1 && r1.phase === 'scheme', '夹具把工程阶段停在 scheme');
    await setWetland(p, { permit: true, causeFound: true, habitat: 'reeds', restoredDay: 12 });
    await openRecheck(p);
    await p.waitForSelector('.win');
    const win = await p.locator('.win').first().innerText();
    ok(win.includes('水位复查'), '面板标题包含水位复查');
    ok(win.indexOf('工程尚未验收') >= 0, '工程尚未验收时显式说明');
    ok(win.indexOf('牧场与磨坊供水优先') < 0, '未验收时不写灌溉优先的话');
    ok(win.indexOf('水深保住航道') < 0, '未验收时不写通航优先的话');
    const normalBtn = await p.locator('.win button', { hasText: '水位复查 · 普通调查 · 10分钟' }).count();
    eq(normalBtn, 1, '普通调查按钮可见');
    const talentBtn = await p.locator('.win button', { hasText: '辨迹／识矿' }).count();
    eq(talentBtn, 0, '未学天赋时辨迹／识矿按钮隐藏');
    await clickWin(p, '水位复查 · 普通调查 · 10分钟');
    await p.waitForFunction(() => !!__MOSS__.wetlandLifeState().recheck);
    const rec = await readRecheck(p);
    eq(rec.route, 'normal', '复查 route = normal');
    eq(rec.habitat, 'reeds', '复查 habitat 快照正确');
    ok(rec.engPhase !== 'accepted', '复查登记时工程阶段未验收');
    ok(rec.note.indexOf('尚未验收') >= 0, '复查 note 显式说明未验收');
    await closeWin(p);
    await openRecheck(p);
    await p.waitForSelector('.win');
    const normalBtnAgain = await p.locator('.win button', { hasText: '水位复查 · 普通调查 · 10分钟' }).count();
    eq(normalBtnAgain, 0, '已登记后普通调查按钮消失');
    const talentBtnAgain = await p.locator('.win button', { hasText: '辨迹／识矿' }).count();
    eq(talentBtnAgain, 0, '已登记后辨迹／识矿按钮也消失');
  } finally {
    await run.browser.close();
  }
}

async function caseConservative() {
  const { run, p } = await freshRun();
  try {
    const r1 = await setProject(p, 'conservative', 'accepted');
    eq(r1.phase, 'accepted', '夹具把工程阶段推到 accepted');
    await setWetland(p, { permit: true, causeFound: true, habitat: 'reeds', restoredDay: 14 });
    await openRecheck(p);
    await p.waitForSelector('.win');
    const win = await p.locator('.win').first().innerText();
    ok(win.indexOf('工程已验收 · 方案 = 保守排水') >= 0, '面板事实显示保守排水方案');
    ok(win.indexOf('灌溉优先') >= 0, '面板事实里写明灌溉优先');
    await clickWin(p, '水位复查 · 普通调查 · 10分钟');
    await p.waitForFunction(() => !!__MOSS__.wetlandLifeState().recheck);
    const rec = await readRecheck(p);
    eq(rec.engScheme, 'conservative', '登记 scheme=conservative');
    eq(rec.engAlloc, 'irrigation', '登记 alloc=irrigation');
    eq(rec.engPhase, 'accepted', '登记 phase=accepted');
    ok(rec.note.indexOf('保守排水') >= 0, 'note 提到保守排水');
    ok(rec.note.indexOf('牧场与磨坊供水优先') >= 0, 'note 写灌溉优先效果');
    await p.evaluate(() => __MOSS__.saveNow());
    await p.reload();
    await p.getByRole('button', { name: '继续游戏', exact: true }).click();
    await openRecheck(p);
    await p.waitForSelector('.win');
    const afterReload = await readRecheck(p);
    eq(afterReload.day, rec.day, '重载后复查 day 不变');
    eq(afterReload.route, 'normal', '重载后复查 route 不变');
    eq(afterReload.engScheme, 'conservative', '重载后复查 scheme 不变');
  } finally {
    await run.browser.close();
  }
}

async function caseBalanced() {
  const { run, p } = await freshRun();
  try {
    const r1 = await setProject(p, 'balanced', 'accepted');
    eq(r1.phase, 'accepted', '夹具把工程阶段推到 accepted (balanced)');
    await setWetland(p, { permit: true, causeFound: true, habitat: 'open_water', restoredDay: 15 });
    await openRecheck(p);
    await p.waitForSelector('.win');
    const win = await p.locator('.win').first().innerText();
    ok(win.indexOf('工程已验收 · 方案 = 兼顾通航') >= 0, '面板事实显示兼顾通航方案');
    ok(win.indexOf('通航优先') >= 0, '面板事实里写明通航优先');
    await clickWin(p, '水位复查 · 普通调查 · 10分钟');
    await p.waitForFunction(() => !!__MOSS__.wetlandLifeState().recheck);
    const rec = await readRecheck(p);
    eq(rec.engScheme, 'balanced', '登记 scheme=balanced');
    eq(rec.engAlloc, 'navigation', '登记 alloc=navigation');
    ok(rec.note.indexOf('兼顾通航') >= 0, 'note 提到兼顾通航');
    ok(rec.note.indexOf('货运减少 10 分钟') >= 0, 'note 写通航效果');
  } finally {
    await run.browser.close();
  }
}

async function caseTalentRoute() {
  const { run, p } = await freshRun();
  try {
    await setProject(p, 'conservative', 'accepted');
    await setWetland(p, { permit: true, causeFound: true, habitat: 'reeds', restoredDay: 16 });
    await openRecheck(p);
    await p.waitForSelector('.win');
    const noTalent = await p.locator('.win button', { hasText: '辨迹／识矿' }).count();
    eq(noTalent, 0, '未学天赋时不显示天赋按钮');
    await closeWin(p);
    await grantTalent(p, 'read_tracks');
    await openRecheck(p);
    await p.waitForSelector('.win');
    const withTalent = await p.locator('.win button', { hasText: '辨迹／识矿' }).count();
    eq(withTalent, 1, '学辨迹后天赋按钮出现');
    await clickWin(p, '水位复查 · 辨迹／识矿 · 15分钟');
    await p.waitForFunction(() => !!__MOSS__.wetlandLifeState().recheck);
    const rec = await readRecheck(p);
    eq(rec.route, 'talent', '天赋路线登记为 talent');
    ok(rec.talentNote.indexOf('辨迹') >= 0, '天赋附注写入辨迹');
  } finally {
    await run.browser.close();
  }
}

async function caseGuards() {
  const { run, p } = await freshRun();
  try {
    await setProject(p, 'conservative', 'accepted');
    await setWetland(p, { permit: false, causeFound: false, habitat: null });
    await openRecheck(p);
    await p.waitForSelector('.win');
    const win = await p.locator('.win').first().innerText();
    ok(win.indexOf('登记巡护许可') >= 0, '缺许可时显示前置提示');
    ok(win.indexOf('对照水样与旧水道图') >= 0, '缺原因时显示前置提示');
    ok(win.indexOf('选择栖息地修复方式') >= 0, '缺栖息地修复时显示前置提示');
    let n = await p.locator('.win button', { hasText: '水位复查 · 普通调查 · 10分钟' }).count();
    eq(n, 0, '无前置时普通调查按钮不挂');
    n = await p.locator('.win button', { hasText: '辨迹／识矿' }).count();
    eq(n, 0, '无前置时天赋按钮不挂');
  } finally {
    await run.browser.close();
  }
}

async function caseLegacyShape() {
  const { run, p } = await freshRun();
  try {
    await setProject(p, 'conservative', 'accepted');
    await setWetland(p, { permit: true, causeFound: true, habitat: 'reeds', restoredDay: 17 });
    await p.evaluate(() => { __MOSS__.state.wetlandLife.recheck = undefined; });
    await p.evaluate(() => __MOSS__.saveNow());
    await p.reload();
    await p.getByRole('button', { name: '继续游戏', exact: true }).click();
    const raw = await p.evaluate(() => __MOSS__.wetlandLifeState().recheck);
    eq(raw, null, '老档缺字段归一化为 null');
    await openRecheck(p);
    await p.waitForSelector('.win');
    const n = await p.locator('.win button', { hasText: '水位复查 · 普通调查 · 10分钟' }).count();
    eq(n, 1, '老档用户可以重新登记');
  } finally {
    await run.browser.close();
  }
}

await caseUnaccepted();
await caseConservative();
await caseBalanced();
await caseTalentRoute();
await caseGuards();
await caseLegacyShape();
console.log(`R3-D 湿地／河湾水位复查 ${checks} 项通过${single ? '（单文件版）' : ''}`);
