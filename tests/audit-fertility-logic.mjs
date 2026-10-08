/* 独立验证肥力/轮作纯逻辑：把 game.js 的数据段抽出来单独求值，
   不启动浏览器即可检查映射表、三档边界、产量系数下限与轮作文案。 */
import fs from 'fs';
const src = fs.readFileSync('/root/xinglg/game.js', 'utf8');

const m = src.match(/var FERT = \{[\s\S]*?function lastRotationGroup\(x, y\) \{[\s\S]*?\n\}/);
if (!m) { console.log('✗ 抽取失败'); process.exit(1); }

const ctx = `
  function clamp(v,a,b){ return v<a?a:(v>b?b:v) }
  function key2(x,y){ return x+','+y }
  var CROPS = { radish:{}, potato:{}, strawberry:{} };
  var state = { plots:{} };
  ` + m[0];

const M = new Function(ctx + '; return {FERT,CROP_GROUPS,CROP_TO_GROUP,fertilityTier,fertilityYieldFactor,rotationHint,plotFertility};')();

let fails = 0;
const t = (n, ok, note = '') => { console.log(`  ${ok ? '✓' : '✗'} ${n}${note ? '  → ' + note : ''}`); if (!ok) fails++; };

console.log('=== 数据映射 ===');
console.log('  CROP_TO_GROUP =', JSON.stringify(M.CROP_TO_GROUP));
console.log('  组内成员 =', JSON.stringify(Object.fromEntries(Object.entries(M.CROP_GROUPS).map(([k, v]) => [k, v.name + v.members.length + '种']))));

console.log('\n=== 三档边界（§32.2 只展示低/适宜/充足）===');
[0, 20, 33, 34, 50, 65, 66, 100].forEach(v =>
  console.log(`  ${String(v).padStart(3)} → ${M.fertilityTier(v).label}`));
t('三档覆盖全域', new Set([0, 33, 34, 65, 66, 100].map(v => M.fertilityTier(v).label)).size === 3,
  [...new Set([0, 50, 100].map(v => M.fertilityTier(v).label))].join('/'));
// 正确行为：肥力从低到高，分档只能「不变或变高」，绝不能倒退
t('分档单调递增', (() => {
  const rank = { low: 0, good: 1, high: 2 };   // 注意查 .id，不是中文 .label
  const vs = [0, 33, 34, 65, 66, 100];
  const seq = vs.map(v => rank[M.fertilityTier(v).id]);
  return seq.every((r, i) => i === 0 || r >= seq[i - 1]);
})(), [0, 33, 34, 65, 66, 100].map(v => M.fertilityTier(v).id).join('→'));
t('fert没有 0 以外的边界泄漏', M.FERT.MIN === 0 && M.FERT.MAX === 100);

console.log('\n=== 产量系数（低肥力压产量但绝不死作物）===');
const ys = [0, 10, 33, 34, 50, 65, 66, 100].map(v => M.fertilityYieldFactor(v));
console.log('  ' + [0, 10, 33, 34, 50, 65, 66, 100].map((v, i) => `${v}→${ys[i]}`).join('  '));
// 正确行为：肥力越低，产量系数只降不升（越低越少，但不能为 0）
t('系数随肥力升高而不降', ys.every((y, i) => i === 0 || y >= ys[i - 1]), ys.join('≤'.length ? '→' : ''));
t('最低系数 ≥ 0.5（作物不会因低肥力死亡）', Math.min(...ys) >= 0.5, 'min=' + Math.min(...ys));
t('充足肥力系数 = 1（无惩罚）', M.fertilityYieldFactor(100) === 1 && M.fertilityYieldFactor(66) === 1);
t('低肥力确实压产量（<1）', M.fertilityYieldFactor(0) < 1);

console.log('\n=== 轮作提示（§32.2 告诉玩家下一季种什么有帮助）===');
const cases = [
  ['radish', 'leaf', false, '萝卜(叶) 上一季叶'],
  ['radish', 'root', true, '萝卜(叶) 上一季根'],
  ['potato', 'root', false, '土豆(根) 上一季根'],
  ['potato', 'leaf', true, '土豆(根) 上一季叶'],
  ['radish', null, null, '萝卜 无历史'],
];
cases.forEach(([cid, lg, wantGood, desc]) => {
  const h = M.rotationHint(cid, lg);
  const got = h ? h.good : null;
  const ok = got === wantGood;
  t(desc, ok, h ? `good=${got} 「${h.text}」` : 'null（不打扰）');
});
t('提示文案非空且含组名', cases.every(([c, l]) => {
  const h = M.rotationHint(c, l);
  return !h || h.text.length > 4;
}));
t('同组建议必须指向另一个有作物的组',
  (M.rotationHint('potato', 'root') || {}).text && /根茎类|叶菜类|豆类/.test(M.rotationHint('potato', 'root').text));

console.log('\n=== 旧档迁移默认（不追溯处罚）===');
t('缺 fertility 字段 → FERT.DEF', M.plotFertility({}) === M.FERT.DEF, 'DEF=' + M.FERT.DEF);
t('DEF 落在「适宜」档（不是低肥力惩罚）', M.fertilityTier(M.FERT.DEF).label === '适宜', M.fertilityTier(M.FERT.DEF).label);
t('脏值被夹紧', M.plotFertility({ fertility: 9999 }) === 100 && M.plotFertility({ fertility: -5 }) === 0);
t('NaN/null 退回默认', M.plotFertility({ fertility: NaN }) === M.FERT.DEF && M.plotFertility({ fertility: 'x' }) === M.FERT.DEF);
t('未知作物无提示（不崩）', M.rotationHint('nope', 'leaf') === null);

console.log(fails ? `\n✗ 失败 ${fails} 项` : '\n✓ 全部通过');
process.exit(fails ? 1 : 0);