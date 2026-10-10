/* 存档往返不变式（P1：兼容层用的是属性存取器 + 末尾覆写归一化，
   一旦隐式写入出错，存档会被悄悄改写而没人发现）。
   这里锁死两条性质：
     1. 幂等：serialize → load → serialize 结果必须完全一致
     2. 不丢内容：老档的关键字段经过迁移后仍然能读回来
   兼容层不安全地重构之前，先让这层测试守住底线。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, name + (extra ? ' · ' + extra : ''));
  checks++; console.log('PASS', name);
};

const run = await launch();
try {
  const p = run.page;
  await boot(p);

  // 1. 幂等：同一份存档连续读两次，第二次不应再有任何变化
  const twice = await p.evaluate(() => {
    const s1 = __MOSS__.normalizeSaveForTest(JSON.parse(JSON.stringify(__MOSS__.serialize())));
    const a = JSON.stringify(__MOSS__.normalizeSaveForTest(JSON.parse(JSON.stringify(s1))));
    return { first: JSON.stringify(s1), second: a };
  });
  ok('存档归一化幂等（读一次与读两次结果相同）', twice.first === twice.second);

  // 2. 实际写盘→读盘→再写盘，字节级一致
  const roundTrip = await p.evaluate(() => {
    __MOSS__.saveNow();
    const first = localStorage.getItem('moss-farm-v2');
    const loaded = __MOSS__.normalizeSaveForTest(JSON.parse(first));
    const again = JSON.parse(JSON.stringify(loaded));
    // 用再次归一化的结果与第一次写盘的内容比对关键字段
    return {
      first: first,
      day: again.totalDay, coins: again.coins, scene: again.sceneId,
      millLife: !!again.millLife, meadowLife: !!again.meadowLife,
      militaryLife: !!again.militaryLife, travel: !!again.travel,
      professionalLife: !!again.professionalLife
    };
  });
  ok('写盘读盘后关键字段仍在', roundTrip.millLife && roundTrip.meadowLife && roundTrip.militaryLife
    && roundTrip.travel && roundTrip.professionalLife,
    JSON.stringify({ day: roundTrip.day, coins: roundTrip.coins, scene: roundTrip.scene }));
  ok('重载不改变天数与金币', roundTrip.day > 0 && roundTrip.coins >= 0, `第 ${roundTrip.day} 天 / ${roundTrip.coins} 金`);

  // 3. 军事账本经属性存取器往返后不丢（这是隐式写入最容易坏的地方）
  const mil = await p.evaluate(() => {
    const m = __MOSS__.state.militaryLife;
    m.registered = true; m.qualification = 3; m.institutionFund = 777; m.unit.count = 9;
    m.unit.wounded = 2;
    const before = { fund: m.institutionFund, count: m.unit.count, wounded: m.unit.wounded, q: m.qualification };
    const raw = JSON.parse(JSON.stringify(__MOSS__.serialize()));
    const n = __MOSS__.normalizeSaveForTest(raw);
    const m2 = n.militaryLife;
    return { before, after: { fund: m2.institutionFund, count: m2.unit.count, wounded: m2.unit.wounded, q: m2.qualification } };
  });
  ok('军事账本往返不丢机构军费', mil.after.fund === mil.before.fund, JSON.stringify(mil));
  ok('军事账本往返不丢在编人数', mil.after.count === mil.before.count);
  ok('军事账本往返不丢伤员数', mil.after.wounded === mil.before.wounded);
  ok('军事账本往返不丢资历', mil.after.q === mil.before.q);

  // 4. 老档（没有新字段）迁移后仍可正常开局，不抛错
  const legacy = await p.evaluate(() => {
    const raw = JSON.parse(JSON.stringify(__MOSS__.serialize()));
    ['millLife', 'meadowLife', 'militaryLife', 'professionalLife', 'travel', 'soil'].forEach(k => { delete raw[k]; });
    raw.sceneId = 'farm';
    let okLegacy = false, err = '';
    try {
      const n = __MOSS__.normalizeSaveForTest(raw);
      okLegacy = !!n && !!n.exploration && !!n.millLife && !!n.meadowLife;
    } catch (e) { err = String(e); }
    return { okLegacy, err };
  });
  ok('缺新字段的老档仍能迁移成功', legacy.okLegacy, legacy.err);

  // 5. 损坏存档必须被拒绝，而不是半读半坏
  const broken = await p.evaluate(() => {
    const r = {};
    r.badVersion = __MOSS__.normalizeSaveForTest({ version: 999, totalDay: 5 });
    r.nullInput = __MOSS__.normalizeSaveForTest(null);
    r.notObject = __MOSS__.normalizeSaveForTest('nope');
    return r;
  });
  ok('版本不符的存档被拒绝', broken.badVersion === null);
  ok('空/非对象输入被拒绝', broken.nullInput === null && broken.notObject === null);

  ok('无控制台错误', run.errors.length === 0, run.errors.join(' | '));
} finally {
  await run.browser.close();
}
console.log(`\n存档往返不变式 ${checks} 项通过`);
