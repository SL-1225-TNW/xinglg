/* lint-self.mjs 的元测试：拿「我真实犯过的错」当输入，确认检查器抓得到。
   检查器自己也会骗人，所以必须用已知正例验证它。

   注意断言写法：只断言「命中了某条规则」，不断言具体是哪条。
   同一种错误可能命中多条规则（如未导出既是 A 也是 G），锁死规则字母
   会在我调整规则归属时产生假失败——那正是元测试版的「断言方向反了」。

   用法：node tests/lint-self-selftest.mjs
*/
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINTER = path.join(__dirname, 'lint-self.mjs');

/* 最小可用的假 game.js：包含被调用的真实定义，但故意不 export 关键符号，
   这样「没导出」类错误能被真实检出；同时提供已导出符号作为对照组。 */
const FAKE_GAME = `
var ITEMS = { fish: { id: 'fish', name: '鱼', sell: 10 } };
var state = { coins: 0, totalDay: 1, inventory: {}, plots: {} };
function invCount(id) { return state.inventory[id] || 0; }
function bagAccepts(id, qty) { return qty > 0; }
function travelTo(id) { return { ok: true }; }
function travelLandingWalkable(nodeId) { return { ok: true }; }
function marketBuy(id, q) { return q > 0; }
function travelPreview(id) { return { ok: true, reason: '' }; }
function travelCommit(id) { return { ok: true }; }
function devMarketWeek() { return 1; }
function plotFertility(p) { return p.fert == null ? 1 : p.fert; }
function fancyIndex(x, y) { return x; }
window.__MOSS__ = {
  get state() { return state; },
  ITEMS: ITEMS,
  invCount: invCount,
  travelPreview: travelPreview,
  travelCommit: travelCommit,
  plotFertility: plotFertility,
  fancyIndex: fancyIndex,
  devMarket: { week: devMarketWeek, buy: marketBuy }
};
`;

const CASES = [
  {
    name: '符号存在性当功能可用（typeof 探测 + 直接判符号存在）',
    rule: /^(A|G)$/,
    file: 'audit-broken-a.mjs',
    body: `
const r = await page.evaluate(() => {
  const M = window.__MOSS__;
  return { has: typeof M.travelTo === 'function' };
});
t('快速传送可用', r.has);
`,
  },
  {
    name: '调用了源码有定义、但没 export 的符号',
    rule: /^(A|G)$/,
    file: 'audit-broken-b.mjs',
    body: `
const land = await page.evaluate(() => {
  const M = window.__MOSS__;
  return M.travelLandingWalkable('farm.home');
});
t('落点可走', land.ok);
`,
  },
  {
    name: '按错参数个数调用已导出函数（真实签名 2 参，测试只传 1 个）',
    rule: 'B',
    file: 'audit-broken-c.mjs',
    body: `
const r = await page.evaluate(() => {
  const M = window.__MOSS__;
  // 真实 bug：签名是 (x, y)，只传 1 个 → 静默走默认值，断言假绿
  return M.fancyIndex(7);
});
t('索引解析正确', r === 7);
`,
  },
  {
    name: '弱断言：try{调用}catch → ok=true',
    rule: 'C',
    file: 'audit-broken-d.mjs',
    body: `
const r = await page.evaluate(() => {
  const M = window.__MOSS__;
  try {
    const pv = M.travelPreview('farm.home');
    return { ok: true, usable: pv.ok };
  } catch (e) { return { ok: false, e: String(e) }; }
});
t('起点可用', r.ok);
`,
  },
  {
    name: '直接改 totalDay 不还原',
    rule: 'E',
    file: 'audit-broken-e.mjs',
    body: `
const w = await page.evaluate(() => {
  const M = window.__MOSS__;
  M.state.totalDay = 3;
  return M.devMarket.week();
});
t('第 3 天属第 1 周', w === 1);
`,
  },
  {
    name: '装饰态（不写入存档）却隐式入账成库存',
    rule: 'D',
    file: '../game.js',
    body: null,
    patchGame: src => src.replace(
      'function bagAccepts(id, qty)',
      `/* 装饰鱼：按需创建，不写入存档 */
function pondFishToInventory() {
  var n = 3;
  state.inventory.fish = (state.inventory.fish || 0) + n;
  return n;
}
function bagAccepts(id, qty)`
    ),
  },
];

let pass = 0, fail = 0;
const results = [];

console.log('\n════ 自检工具 · 元测试（拿我真实犯过的错当正例）════\n');

for (const c of CASES) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lintself-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.js'), c.patchGame ? c.patchGame(FAKE_GAME) : FAKE_GAME);

  if (c.body != null) {
    const tf = path.join(dir, 'tests', c.file);
    fs.mkdirSync(path.dirname(tf), { recursive: true });
    fs.writeFileSync(tf, c.body);
  }
  fs.copyFileSync(LINTER, path.join(dir, 'tests', 'lint-self.mjs'));

  let out;
  try {
    out = execFileSync(process.execPath, [path.join(dir, 'tests', 'lint-self.mjs')],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }

  const hitRules = [...new Set([...out.matchAll(/\[([A-G])\s/g)].map(x => x[1]))];
  const ok = hitRules.some(r => c.rule instanceof RegExp ? c.rule.test(r) : r === c.rule);
  results.push({ name: c.name, ok, hitRules });
  console.log(`${ok ? '✓' : '✗'} 规则 ${c.rule} · ${c.name}`);
  if (!ok) {
    fail++;
    console.log('    命中规则: [' + hitRules.join(',') + ']  期望: ' + c.rule);
    console.log(out.split('\n').filter(l => l.includes('[') || /ERROR|WARN/.test(l)).slice(0, 5).join('\n'));
  } else pass++;
}

/* 反向验证：干净的代码不该被报错（防误报回归） */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lintself-clean-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.js'), FAKE_GAME);
  fs.writeFileSync(path.join(dir, 'tests', 'clean.mjs'), `
const r = await page.evaluate(() => {
  const M = window.__MOSS__;
  const before = M.invCount('fish');
  const ok = M.devMarket.buy('fish', 2);
  return { before, after: M.invCount('fish'), ok };
});
t('买入两件鱼', r.ok === true && r.after === r.before + 2);
t('按钮文案存在', true);
`);
  fs.copyFileSync(LINTER, path.join(dir, 'tests', 'lint-self.mjs'));
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(dir, 'tests', 'lint-self.mjs')],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const noisy = /ERROR \d*[1-9]/.test(out);
  console.log(`${noisy ? '✗' : '✓'} 反向验证：干净代码零报错`);
  if (noisy) { fail++; console.log(out.split('\n').filter(l => l.includes('✗') || l.includes('!')).slice(0, 4).join('\n')); }
  else pass++;
}

console.log(`\n通过 ${pass} / ${pass + fail}`);
process.exit(fail ? 1 : 0);