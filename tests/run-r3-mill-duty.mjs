/* R3-D/P0-2：风铃磨坊的可重复工程养护复核。
   联系人马丁；与控制室、河港面板共用同一份事实。
   验收要点：
   - 六个状态（未到期 / 到期 / 逾期 / 延期 / 交接 / 退出）在面板都能看到；
   - 工程方案（保守排水 / 兼顾通航）影响同一份事实的额度读法，不靠重新存字段；
   - 重复点击、重载存档、跨周期、交接、退出都不会触发额外结算或叠加评价；
   - 河港面板与船闸值守室只读同一份事实，没有按钮。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, boot, closeWin, clickWin, winText } from './harness.mjs';

const single = process.argv.includes('--single-file');
let count = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); count++; console.log('PASS', n); };
const ok = (c, n) => { assert.ok(c, n); count++; console.log('PASS', n); };

const r = await launch(single ? { url: pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href } : {}), p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click();

const info = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate)));
const millState = () => p.evaluate(() => JSON.parse(JSON.stringify(__MOSS__.wetlandLifeState()))); // not used but keeps harness warm

async function setProjectAccepted(scheme, dayOffset = 10) {
  await p.evaluate(({ scheme, dayOffset }) => {
    const M = __MOSS__;
    M.engFixtureAccepted(scheme);
    const pj = M.professionalLifeState().projects.riverbay_gate;
    pj.phase = 'accepted';
    pj.scheme = scheme;
    /* 把 nextDay 设到玩家能即时看到「到期」「逾期」的位置 */
    const today = Math.max(10, dayOffset);
    /* 确保 pj.duty 存在且 status='active'，再覆盖日期字段 */
    pj.duty = pj.duty || {};
    pj.duty.status = 'active';
    pj.duty.startDay = today;
    pj.duty.lastDay = today;
    pj.duty.nextDay = today + (pj.duty.cycle || 3);
    pj.duty.done = pj.duty.done || 0;
    pj.duty.sinceEval = pj.duty.sinceEval || 0;
    pj.duty.evalCount = pj.duty.evalCount || 0;
    pj.duty.deferCount = pj.duty.deferCount || 0;
    pj.duty.overdue = pj.duty.overdue || 0;
    pj.duty.defers = pj.duty.defers || [];
    pj.duty.cycle = pj.duty.cycle || 3;
    pj.maintDay = today;
    M.state.totalDay = today;
    M.state.coins = 80;
    M.state.energy = 100;
    M.state.timeMinutes = 480;
    M.state.inventory = { wood: 6, stone: 6, iron_ore: 2 };
    M.deriveWaterworksFromProject(M.professionalLifeState(), M.professionalLifeState().waterworks);
    /* 关掉未处理的安全事件，让交接/退出不被前置条件卡住 */
    pj.safety = pj.safety || {};
    pj.safety.status = 'clear';
    return { phase: pj.phase, status: pj.duty.status, nextDay: pj.duty.nextDay };
  }, { scheme, dayOffset });
}
async function atMillDuty() {
  await closeWin(p);
  await p.evaluate(() => {
    __MOSS__.devSwitchScene('mill_workshop', 15, 11);
    __MOSS__.openMillLife('mill_duty');
  });
  await p.waitForSelector('.win');
}
async function atProfession(site) {
  await closeWin(p);
  await p.evaluate((s) => {
    const map = { gauge: ['waterworks', 20, 19], water: ['waterworks', 22, 15], port: ['port_office', 10, 6], lock: ['port_lockhouse', 4, 4] };
    const m = map[s];
    __MOSS__.devSwitchScene(m[0], m[1], m[2]);
    __MOSS__.openProfessionSite(s);
  }, site);
  await p.waitForSelector('.win');
}
async function winHas(s) {
  return (await winText(p)).includes(s);
}
async function btnCount(text) {
  return p.locator('.win button', { hasText: text }).count();
}
async function advanceTo(day) {
  await p.evaluate((d) => { __MOSS__.state.totalDay = d; }, day);
}

/* ============ A：未到期（active, today<nextDay） ============ */
await setProjectAccepted('conservative');
const setup1 = await info();
ok(setup1.phase === 'accepted' && setup1.scheme === 'conservative', '夹具：工程已验收，方案=conservative');
await atMillDuty();
ok(await winHas('磨坊工程养护'), '磨坊面板标题显示「磨坊工程养护」');
ok(await winHas('马丁'), '磨坊面板联系人写「马丁」');
ok(await winHas('下次检视日'), '未到期时显示「下次检视日」');
ok(!(await winHas('逾期')), '未到期时不写「逾期」');
ok((await btnCount('磨坊工程养护检视')) === 0, '未到期不挂检视按钮');
ok((await btnCount('申请延期一个周期')) === 1, '延期按钮仍可见');
/* 河港面板读同一份事实（只读，没有按钮） */
await atProfession('port');
ok(await winHas('水利联系'), '河港面板显示「水利联系」');
ok(await winHas('未到期') || await winHas('下次检视日') || await winHas('累计检视'), '河港面板给出可读的当前事实');
ok((await btnCount('磨坊工程养护检视')) === 0, '河港面板没有挂检视按钮（只读）');

/* ============ B：到期（active, today>=nextDay）按期执行 ============ */
await atMillDuty();
const dutyBefore = (await info()).duty;
const targetNextDay = dutyBefore.nextDay;
await advanceTo(targetNextDay);
const beforeClick = await p.evaluate(() => ({ totalDay: __MOSS__.state.totalDay, nextDay: __MOSS__.state.professionalLife.projects.riverbay_gate.duty.nextDay }));
await atMillDuty();
ok((await btnCount('磨坊工程养护检视')) === 1, '到期检视按钮可见（totalDay=' + beforeClick.totalDay + ' nextDay=' + beforeClick.nextDay + '）');
await clickWin(p, '磨坊工程养护检视');
const dutyAfter = (await info()).duty;
eq(dutyAfter.lastDay, targetNextDay, '检视后 lastDay 推到今天');
eq(dutyAfter.done, dutyBefore.done + 1, '检视后 done+1');
eq(dutyAfter.nextDay, targetNextDay + dutyBefore.cycle, '检视后 nextDay 推后一个 cycle');
eq(dutyAfter.sinceEval, 1, 'sinceEval=1 (距离 evalCount 还差一个 cycle)');
eq(dutyAfter.evalCount, dutyBefore.evalCount, '本期还没攒够，不发 eval');
/* 河港面板随即读到同一条事实 */
await atProfession('port');
ok(await winHas('累计检视 ' + (dutyBefore.done + 1)), '河港面板读到 done+1');
ok((await btnCount('磨坊工程养护检视')) === 0, '河港面板没有重复结算的按钮');

/* ============ C：跨周期（3 次后拿到首次评价） ============ */
const dB = (await info()).duty;
await advanceTo(dB.nextDay);
await atMillDuty();
await clickWin(p, '磨坊工程养护检视');
const dC1 = (await info()).duty;
await advanceTo(dC1.nextDay);
await atMillDuty();
await clickWin(p, '磨坊工程养护检视');
const dC2 = (await info()).duty;
eq(dC2.done, dB.done + 2, '两次连续检视后 done+2');
eq(dC2.evalCount, dB.evalCount + 1, '累计 3 次检视触发一次 evalCount');
eq(dC2.sinceEval, 0, '走完一个周期后 sinceEval 清零');

/* ============ D：方案 = balanced 时额度语 ============ */
await setProjectAccepted('balanced');
await atMillDuty();
ok(await winHas('兼顾通航'), 'balanced 方案下面板写「兼顾通航」');
ok(await winHas('额度'), '面板同时显示额度说明');
ok(!(await winHas('保守排水')), 'balanced 方案下面板不写「保守排水」');

/* ============ E：逾期（state.totalDay > nextDay）补做只留记录 ============ */
await setProjectAccepted('conservative', 10);
const dE0 = (await info()).duty;
await advanceTo(dE0.nextDay + 2);
await atMillDuty();
ok(await winHas('逾期 2 天'), '面板显示「逾期 2 天」');
ok(await winHas('补做只留记录'), '逾期补救说明挂出');
const evalBump = (await p.evaluate(() => __MOSS__.professionalLifeState().careers.engineering)) | 0;
await clickWin(p, '磨坊工程养护检视');
const dE1 = (await info()).duty;
eq(dE1.overdue, dE0.overdue + 1, '补做一次后 overdue+1');
eq(dE1.evalCount, dE0.evalCount, '逾期补做不评');
const evalAfter = (await p.evaluate(() => __MOSS__.professionalLifeState().careers.engineering)) | 0;
eq(evalAfter, evalBump, '逾期补做不 bumpCareer');

/* ============ F：延期（封顶前可用，超额 3 次后禁用） ============ */
const ENG_DUTY_MAX_DEFER_LOCAL = await p.evaluate(() => __MOSS__.ENG_DUTY_MAX_DEFER);
await setProjectAccepted('conservative', 10);
const dF0 = (await info()).duty;
await atMillDuty();
await clickWin(p, '申请延期一个周期');
const dF1 = (await info()).duty;
eq(dF1.deferCount, dF0.deferCount + 1, '延期 1 次后 deferCount+1');
eq(dF1.nextDay, dF0.nextDay + dF0.cycle, '延期一次后 nextDay 推后一个 cycle');
ok(dF1.defers.length === dF0.defers.length + 1, 'defers 记录追加');
/* 反复延期到上限 */
for (let i = 0; i < ENG_DUTY_MAX_DEFER_LOCAL; i++) {
  const dd = (await info()).duty;
  await advanceTo(dd.nextDay - 1);
  await atMillDuty();
  if (await btnCount('申请延期一个周期')) await clickWin(p, '申请延期一个周期');
}
const dF2 = (await info()).duty;
eq(dF2.deferCount, ENG_DUTY_MAX_DEFER_LOCAL, '延期累计到上限');
await atMillDuty();
eq(await btnCount('申请延期一个周期'), 0, '到达上限后延期按钮消失');
ok(await winHas('延期已用满 ' + ENG_DUTY_MAX_DEFER_LOCAL + ' 次'), '延期上限提示挂出');

/* ============ G：交接（移交工程员） ============ */
const ENG_DUTY_SUCCESSOR_LOCAL = await p.evaluate(() => __MOSS__.ENG_DUTY_SUCCESSOR || '玛尔');
await setProjectAccepted('conservative', 10);
const dG0 = (await info()).duty;
await atMillDuty();
await clickWin(p, '交接磨坊工程养护给继任者');
const dG1 = (await info()).duty;
eq(dG1.status, 'handed', '交接后 status=handed');
eq(dG1.successor, ENG_DUTY_SUCCESSOR_LOCAL, '交接后记录继任');
eq(dG1.done, dG0.done, '交接后检视/延期/逾期记录全部保留');
ok(await winHas('已经交出'), '面板显示「责任已经交出」');
eq(await btnCount('磨坊工程养护检视'), 0, '交接后检视按钮消失');
/* 河港面板仍读同一条事实（不需要重新结算） */
await atProfession('port');
ok(await winHas('已经' + ('handed' ? '交出' : '结束')), '河港面板读到「已经交出」');
ok(await winHas('累计检视 ' + dG0.done), '河港面板读到 done 数值');
eq(await btnCount('磨坊工程养护检视'), 0, '交接状态下河港面板仍只读');

/* ============ H：退出 / 释放岗位 ============ */
await setProjectAccepted('conservative', 10);
const dH0 = (await info()).duty;
await atMillDuty();
await clickWin(p, '结束养护岗位');
const dH1 = (await info()).duty;
eq(dH1.status, 'released', '释放后 status=released');
eq(dH1.done, dH0.done, '释放后检视/延期/逾期记录完整保留');
await atProfession('port');
ok(await winHas('已经' + ('released' ? '结束' : '交出')), '河港面板读到「已经结束」');

/* ============ I：船闸值守室读同一份事实 ============ */
await setProjectAccepted('conservative', 10);
await atMillDuty();
const winMill = await winText(p);
await atProfession('lock');
const winLock = await winText(p);
ok(winLock.includes('水利联系') && winLock.includes('累计检视'), '船闸面板读出同一份事实（水利联系 + 累计检视）');
ok(winLock.includes('保守排水'), '船闸面板读到方案名');
eq(await btnCount('磨坊工程养护检视'), 0, '船闸值守室没有挂检视按钮');

/* ============ J：重载存档后事实不变 ============ */
await setProjectAccepted('conservative', 10);
const dJ0 = (await info()).duty;
await advanceTo(dJ0.nextDay);  // 推进到 nextDay，按钮才挂上
await atMillDuty();
await clickWin(p, '磨坊工程养护检视');
const dJBefore = (await info()).duty;
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.getByRole('button', { name: '继续游戏', exact: true }).click();
const dJAfter = (await info()).duty;
eq(dJAfter.lastDay, dJBefore.lastDay, '重载后 lastDay 不变');
eq(dJAfter.done, dJBefore.done, '重载后 done 不变');
eq(dJAfter.nextDay, dJBefore.nextDay, '重载后 nextDay 不变');
eq(dJAfter.evalCount, dJBefore.evalCount, '重载后 evalCount 不变');
/* 重复点检视：now < nextDay → 按钮不挂，记录不增长 */
await atMillDuty();
eq(await btnCount('磨坊工程养护检视'), 0, '同一周期内重复点不开按钮');
const dJDone = (await info()).duty;
eq(dJDone.done, dJBefore.done, '重复打开面板不会增长 done');

/* ============ K：模式未验收时不应该出现在这里（不挂按钮） ============ */
await setProjectAccepted('conservative', 10);
await p.evaluate(() => { __MOSS__.state.professionalLife.projects.riverbay_gate.phase = 'build'; __MOSS__.state.professionalLife.projects.riverbay_gate.duty.status = 'none'; });
await atMillDuty();
eq(await btnCount('磨坊工程养护检视'), 0, '工程未验收时检视按钮不挂');
ok(await winHas('旧工程缺少养护起始日期') || await winHas('从今天在磨坊接回养护责任'), '未验收状态下显示接回/起始提示');

console.log(`R3-D 磨坊工程养护复核 ${count} 项通过${single ? '（单文件版）' : ''}`);
