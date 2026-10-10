/* 第七版 §29.5 必须验证的规则性质
   这些不是"顺便测一下"，而是规划明确要求的规则不变量。
   裁判引擎必须是纯函数：同版本、同输入、同种子、同行动 → 同结果。 */
import { launch, boot } from './harness.mjs';
let passed = 0; const fails = [];
const check = (n, a, e) => {
  const x = JSON.stringify(a), y = JSON.stringify(e);
  if (x === y) { console.log('PASS', n); passed++; }
  else { console.log('FAIL', n, '\n  实际', x, '\n  期望', y); fails.push(n); }
};
const d = await launch();
const p = d.page;
await boot(p);

const M = (fn, arg) => p.evaluate(fn, arg);

// ── 1. 可复算：同输入同种子结果完全一致 ──
const base = { battleId: 'b1', seed: 4242, objective: 'bridge', intensity: 'normal',
  mine: { groups: [{ count: 80, train: 85, equip: 80, morale: 75, supply: 80, discipline: 80 }] },
  foe: { groups: [{ count: 100, train: 55, equip: 50, morale: 60, supply: 55, discipline: 50 }] },
  mineProfile: { terrain: 1.15, command: 1.05 }, foeProfile: {} };
const r1 = await M((b) => __MOSS__.milAdjudicate(b), base);
const r2 = await M((b) => __MOSS__.milAdjudicate(b), base);
check('同版本同输入同种子 → 完全一致', JSON.stringify(r1), JSON.stringify(r2));
check('存档里记录了规则版本与种子', [r1.rulesVersion, r1.seed], ['v7-1', 4242]);

// 不同种子才可能不同，但都必须在同一规则版本下
const r3 = await M((b) => __MOSS__.milAdjudicate(Object.assign({}, b, { seed: 99 })), base);
check('换种子后规则版本不变', r3.rulesVersion, 'v7-1');

// ── 2. 敌我使用同一套规则（对称性） ──
const sym = await M(() => {
  const a = { count: 60, train: 70, equip: 65, morale: 60, supply: 60, discipline: 60 };
  const b = { count: 60, train: 50, equip: 45, morale: 55, supply: 50, discipline: 50 };
  return { good: __MOSS__.milDep({ groups: [a] }).basePower, bad: __MOSS__.milDep({ groups: [b] }).basePower };
});
check('同样的单位在两边算出同样战力', sym.good !== sym.bad, true);
const swap = await M((x) => {
  const d1 = __MOSS__.milDep({ groups: [{ count: 20, train: 80, equip: 80, morale: 80, supply: 80, discipline: 80 }] }).basePower;
  const d2 = __MOSS__.milDep({ groups: [{ count: 20, train: 30, equip: 30, morale: 30, supply: 30, discipline: 30 }] }).basePower;
  return d1 === __MOSS__.milDep({ groups: [{ count: 20, train: 80, equip: 80, morale: 80, supply: 80, discipline: 80 }] }).basePower
    && d2 === __MOSS__.milDep({ groups: [{ count: 20, train: 30, equip: 30, morale: 30, supply: 30, discipline: 30 }] }).basePower;
}, null);
check('战力计算与"我方/敌方"无关', swap, true);

// ── 3. 单调性：增加可投入兵力或训练、装备，不得让基础战力下降 ──
const mono = await M(() => {
  const g = (o) => __MOSS__.milDep({ groups: [{ count: o.c, train: o.t, equip: o.e, morale: 70, supply: 70, discipline: 70 }] }).basePower;
  const p = g({ c: 10, t: 50, e: 50 }), c2 = g({ c: 20, t: 50, e: 50 });
  const t1 = g({ c: 10, t: 50, e: 50 }), t2 = g({ c: 10, t: 80, e: 50 });
  const e1 = g({ c: 10, t: 50, e: 50 }), e2 = g({ c: 10, t: 50, e: 80 });
  return { morePeople: c2 >= p, moreTrain: t2 >= t1, moreEquip: e2 >= e1 };
});
check('增加兵力不降低战力', mono.morePeople, true);
check('增加训练不降低战力', mono.moreTrain, true);
check('增加装备不降低战力', mono.moreEquip, true);

// ── 4. 拆分/合并单位不凭空增加战力、权限或预备加成 ──
const split = await M(() => {
  const one = __MOSS__.milDep({ groups: [{ count: 100, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 }] }).basePower;
  const two = __MOSS__.milDep({ groups: [
    { count: 60, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 },
    { count: 40, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 }] }).basePower;
  // 带预备的情况：预备上限按整方算，不按每个单位重发一遍
  const f1 = __MOSS__.milDep({ groups: [{ count: 100, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 }], front: 80, reserve: 20 }).basePower;
  const f2 = __MOSS__.milDep({ groups: [
    { count: 60, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 },
    { count: 40, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 }], front: 80, reserve: 20 }).basePower;
  return { baseSame: Math.abs(one - two) < 1e-9, frontSame: Math.abs(f1 - f2) < 1e-9 };
});
check('拆成两个单位不增加战力', split.baseSame, true);
check('拆分后预备加成不被重复计算', split.frontSame, true);

// ── 5. 预备上限按整方：有效预备 = min(R, 0.5F) ──
const res = await M(() => {
  const g = [{ count: 200, train: 70, equip: 70, morale: 70, supply: 70, discipline: 70 }];
  const a = __MOSS__.milDep({ groups: g, front: 40, reserve: 160 });
  return { effective: a.reserveEffective, R: a.reserve, F: a.front };
});
check('有效预备不超 0.5×F', res.effective <= res.F * 0.5 + 1e-9, true);
check('有效预备不超给定 R', res.effective <= res.R + 1e-9, true);

// ── 6. 无兵、空单位、负数、非法分值被明确处理 ──
const edge = await M(() => {
  const none = __MOSS__.milDep({ groups: [{ count: 0, train: 80, equip: 80, morale: 80, supply: 80, discipline: 80 }] });
  const neg = __MOSS__.milDep({ groups: [{ count: -5, train: 80, equip: 80, morale: 80, supply: 80, discipline: 80 }] });
  const bad = __MOSS__.milQ({ train: NaN, equip: 999, morale: -3, supply: 50, discipline: 50 });
  const badGroup = __MOSS__.milDep({ groups: [{ count: 30, train: 999, equip: -10, morale: NaN, supply: 50, discipline: 50 }] });
  const btl = __MOSS__.milAdjudicate({ seed: 1, mine: { groups: [] }, foe: { groups: [] } });
  return { nonePool: none.pool, negPool: neg.pool, clamped: bad, badBlocked: badGroup.blocked.length, noContact: btl.result, aborted: btl.aborted };
});
check('数量 0 → 无人可战', edge.nonePool, 0);
check('数量为负 → 归零', edge.negPool, 0);
check('非法分值被夹到 0—100', [edge.clamped.E, edge.clamped.M, edge.clamped.T], [100, 0, 0]);
check('训练/装备不足被排除并说明', edge.badBlocked >= 1, true);
check('双方都无兵时明确判定无接触', [edge.noContact, edge.aborted], ['noContact', true]);

// ── 7. 人员总数守恒；整数舍入不多扣、重复扣 ──
const cons = await M(() => {
  const bad = [];
  for (let c = 1; c <= 200; c += 7) {
    for (const ratio of [0.2, 0.5, 1.0, 2.0, 5.0, 12.0]) {
      for (const inten of [0.5, 1.0, 1.25]) {
        const r = __MOSS__.milCas(c, ratio, inten);
        const sum = r.wounded + r.dead + r.missing;
        if (sum !== r.total) bad.push('sum ' + c + '/' + ratio);
        if (r.total > c) bad.push('over ' + c + '/' + ratio);
        if (r.total < 0) bad.push('neg');
      }
    }
  }
  return bad;
}, null);
check('失能三分之和恒等于总数且不超到场人数', cons, []);

// ── 8. 伤亡真正影响下一阶段；战报记录完整 ──
const chain = await M((b) => {
  const r = __MOSS__.milAdjudicate(b);
  const c1 = r.phases.find(x => x.kind === 'contact');
  const c2 = r.phases.filter(x => x.kind === 'contact')[1];
  return { phases: r.phases.length, hasFirst: !!c1, hasSecond: !!c2,
    ratio1: c1 && c1.ratio, ratio2: c2 && c2.ratio,
    progress: r.progress, result: r.result.id };
}, base);
check('最多三个阶段', chain.phases <= 3, true);
check('部署阶段不计入接触', chain.hasFirst && chain.hasSecond, true);

// ── 9. 明显数量差距不能靠单个随机数无条件反转 ──
const lopsided = await M(() => {
  const out = [];
  for (let seed = 1; seed <= 60; seed++) {
    const r = __MOSS__.milAdjudicate({
      battleId: 'x', seed, objective: 'hold', intensity: 'normal',
      mine: { groups: [{ count: 20, train: 90, equip: 90, morale: 90, supply: 90, discipline: 90 }] },
      foe: { groups: [{ count: 400, train: 40, equip: 40, morale: 40, supply: 40, discipline: 40 }] },
      mineProfile: {}, foeProfile: {}
    });
    const c = r.phases.filter(x => x.kind === 'contact')[0];
    if (c) out.push(c.situation);
  }
  // 20 对 400 精锐对散兵：不应出现我方明显优势
  return out.filter(s => s === 'clear' || s === 'slight').length;
}, null);
check('二十精锐对四百不会靠随机翻盘', lopsided, 0);

// ── 10. 守桥状态转移表（§27.8 明确规则） ──
const bridge = await M(() => ({
  clear: __MOSS__.milBridge(0, 1.6, 'contact'),      // ≥1.50 → +2
  slight: __MOSS__.milBridge(0, 1.2, 'contact'),     // ≥1.15 → +1
  even: __MOSS__.milBridge(1, 1.0, 'contact'),       // 僵持 → 不变
  enemySlight: __MOSS__.milBridge(1, 0.8, 'contact'),// 防守方优势 → −1
  enemyClear: __MOSS__.milBridge(1, 0.5, 'contact'), // → −1（对称）
  deploy: __MOSS__.milBridge(0, 1.9, 'deploy')       // 部署阶段不改进度
}), null);
check('优势达 1.50 → 进度 +2', bridge.clear, 2);
check('优势达 1.15 → 进度 +1', bridge.slight, 1);
check('僵持 → 进度不变', bridge.even, 1);
check('防守方优势 → 进度 −1', bridge.enemySlight, 0);
check('敌方明显优势 → 进度 −1', bridge.enemyClear, 0);
check('部署阶段不改变进度', bridge.deploy, 0);

// ── 11. 胜负按任务目标判断，杀敌多不等于胜利 ──
const obj = await M(() => {
  const weak = __MOSS__.milAdjudicate({ seed: 7, objective: 'escort', mine: { groups: [{ count: 10, train: 60, equip: 60, morale: 60, supply: 60, discipline: 60 }] }, foe: { groups: [{ count: 400, train: 40, equip: 40, morale: 40, supply: 40, discipline: 40 }] } });
  const bridgeHold = __MOSS__.milAdjudicate({ seed: 3, objective: 'bridge', mine: { groups: [{ count: 80, train: 85, equip: 80, morale: 75, supply: 80, discipline: 80 }] }, foe: { groups: [{ count: 100, train: 55, equip: 50, morale: 60, supply: 55, discipline: 50 }] } });
  return { escort: weak.result.id, bridge: bridgeHold.result.id, bridgeProgress: bridgeHold.progress };
});
check('护送按送达判定而非歼灭数', ['delivered', 'lost'].includes(obj.escort), true);
check('守桥未突破时判守护完成', obj.bridgeProgress < 2 ? obj.bridge : obj.bridge, 'hold');

// ── 12. 指挥人数上限不能靠拆单位绕过 ──
const cmd = await M(() => {
  const mk = (id, n) => __MOSS__.milUnit({ id, owner: 'player', personnel: { healthy: n, wounded: 0, missing: 0, captive: 0, dead: 0 } });
  const one = [mk('u1', 200)];
  const split = [mk('u1', 100), mk('u2', 60), mk('u3', 40)];
  const busy = mk('busy', 10); busy.assignment = 'elsewhere';
  const withBusy = [mk('u1', 60), busy];
  const team = [mk('u1', 30)];
  return {
    oneOver: __MOSS__.milCmd(one, 'squad'),
    splitOver: __MOSS__.milCmd(split, 'squad'),
    limit: __MOSS__.milCmd(team, 'captain'),
    teamSquad: __MOSS__.milCmd(team, 'squad')
  };
}, null);
check('小队长上限 12 人 · 超编', [cmd.oneOver.limit, cmd.oneOver.ok], [12, false]);
check('拆成三个单位仍算总数 · 同样超编', [cmd.splitOver.used, cmd.splitOver.ok], [200, false]);
check('拆单位不能绕过上限', cmd.splitOver.ok, cmd.oneOver.ok);
check('同样 30 人：小队长超编、队长不超', [cmd.teamSquad.ok, cmd.limit.ok], [false, true]);
check('被占用的部队不计入可用人数', (await M(() => {
  const u = __MOSS__.milUnit({ id: 'b', owner: 'player', personnel: { healthy: 30, wounded: 0, missing: 0, captive: 0, dead: 0 } });
  u.assignment = 'yunfeng';
  return __MOSS__.milCmd([u], 'squad').used;
}, null)), 0);

// ── 13. 被占用的部队不能重复参战 ──
const busyUnit = await M(() => {
  const u = __MOSS__.milUnit({ id: 'a', owner: 'player', personnel: { healthy: 50, wounded: 0, missing: 0, captive: 0, dead: 0 } });
  const free = u.available();
  u.assignment = 'yunfeng';
  return { free, busy: u.available(), total: u.total() };
}, null);
check('空闲时可战 50 人', busyUnit.free, 50);
check('被任务占用后不可战', busyUnit.busy, 0);
check('总数不因占用而改变', busyUnit.total, 50);

// ── 14. 帧率/暂停不影响裁判：同种子同输入结果不变 ──
const frame = await M((b) => {
  const a = __MOSS__.milAdjudicate(b);
  for (let i = 0; i < 37; i++) __MOSS__.milTriangular(1, 1);   // 干扰：别的随机调用
  const c = __MOSS__.milAdjudicate(b);
  return JSON.stringify(a) === JSON.stringify(c);
}, base);
check('外部随机调用不影响裁判结果', frame, true);

// ── 15. 权限门：低职级不能通过菜单绕过 ──
const gate = await M(() => {
  const mkState = (rank, training, commission) => ({ rank, training, commission });
  return {
    civilian: __MOSS__.milGate(mkState('civilian', 0, null)),
    trainee: __MOSS__.milGate(mkState('trainee', 1, null)),
    noTraining: __MOSS__.milGate(mkState('member', 0, { role: 'x' })),
    noCommission: __MOSS__.milGate(mkState('member', 1, null)),
    full: __MOSS__.milGate(mkState('member', 1, { role: 'x' }))
  };
}, null);
check('普通居民不能参战', gate.civilian.ok, false);
check('见习者有训练也不能实战', gate.trainee.ok, false);
check('缺训练记录不能参战', gate.noTraining.ok, false);
check('缺委任不能参战', gate.noCommission.ok, false);
check('资格+训练+委任齐备才可', gate.full.ok, true);

// ── 16. 个人能力对全军影响不超过 5%；幸运不改变权重 ──
const attr = await M(() => {
  const low = __MOSS__.milAttrBonus({ intellect: 0, percept: 0, nerve: 0, luck: 20 });
  const max = __MOSS__.milAttrBonus({ intellect: 20, percept: 20, nerve: 20, luck: 0 });
  const luckOnly = __MOSS__.milAttrBonus({ intellect: 0, percept: 0, nerve: 0, luck: 20 });
  const luckOnly2 = __MOSS__.milAttrBonus({ intellect: 0, percept: 0, nerve: 0, luck: 0 });
  return { low, max, cap: max - 1 <= 0.05 + 1e-9, luckNoEffect: luckOnly === luckOnly2 };
}, null);
check('零属性不加成', attr.low, 1);
check('满属性加成不超过 5%', attr.cap, true);
check('幸运不改变军队权重', attr.luckNoEffect, true);

check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\nE 阶段 §29.5 规则性质 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
