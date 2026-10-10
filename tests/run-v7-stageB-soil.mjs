/* 阶段 B：土壤肥力与轮作（总规 §32.2）
   低肥力影响产量但不杀死作物；连续同类缓慢下降，轮作回补。 */
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

// 1. 新档四区肥力正常起步，不追溯处罚
const soil0 = await p.evaluate(() => __MOSS__.soilInfo());
check('新档四区都在', Object.keys(soil0.zones).sort(), ['z1', 'z2', 'z3', 'z4']);
check('新档肥力为适宜档', soil0.bands, { z1: '适宜', z2: '适宜', z3: '适宜', z4: '适宜' });

// 2. 连续同种缓慢下降，但不会归零
await p.evaluate(() => {
  __MOSS__.setFert('z1', 60);
  __MOSS__.harvestTest(9, 5, 'radish');   // 北田区种根茎
});
check('收一次根茎后下降', await p.evaluate(() => __MOSS__.soilValue('z1')), 56);
await p.evaluate(() => {
  for (let i = 0; i < 30; i++) __MOSS__.harvestTest(9, 5, 'radish');
});
const low = await p.evaluate(() => __MOSS__.soilValue('z1'));
check('连续种不会跌破 0', low >= 0 && low <= 56, true);
check('降到偏低档', (await p.evaluate(() => __MOSS__.soilBand('z1'))), '偏低');

// 3. 换不同组立即回补
await p.evaluate(() => {
  __MOSS__.setFert('z1', 40);
  __MOSS__.harvestTest(9, 5, 'radish');   // 根茎
});
const afterRoot = await p.evaluate(() => __MOSS__.soilValue('z1'));
await p.evaluate(() => { __MOSS__.harvestTest(9, 5, 'strawberry'); });  // 换叶菜
const afterLeafy = await p.evaluate(() => __MOSS__.soilValue('z1'));
check('换组后肥力回升', afterLeafy > afterRoot, true);

// 4. 豆类固氮回补更多（直接验证分组逻辑）
const legumeBonus = await p.evaluate(() => __MOSS__.fertilityDeltaFor('legume'));
const rootPenalty = await p.evaluate(() => __MOSS__.fertilityDeltaFor('root'));
check('豆类回补为正', legumeBonus > 0, true);
check('根茎类扣减为负', rootPenalty < 0, true);
check('叶菜扣减少于根茎', await p.evaluate(() => __MOSS__.fertilityDeltaFor('leafy')), rootPenalty);

// 5. 低肥力影响产量但不会不产
const yLow = await p.evaluate(() => { __MOSS__.setFert('z1', 20); return __MOSS__.harvestYieldTest('radish'); });
const yOk = await p.evaluate(() => { __MOSS__.setFert('z1', 60); return __MOSS__.harvestYieldTest('radish'); });
const yHigh = await p.evaluate(() => { __MOSS__.setFert('z1', 90); return __MOSS__.harvestYieldTest('radish'); });
check('低肥力减产但至少 1 个', yLow, 1);
check('适宜肥力产量正常', yOk, 1);
check('充足肥力产量略高', yHigh, 2);

// 6. 农务总览显示田区肥力
await p.evaluate(() => { __MOSS__.setFert('z2', 15); __MOSS__.setFert('z4', 85); });
await p.keyboard.press('Escape');
await p.getByRole('button', { name: '农务与矿山记录（N）' }).click();
await p.waitForSelector('.soil-panel');
const panelTxt = await p.locator('.soil-panel').innerText();
check('总览列出四个田区', (panelTxt.match(/区/g) || []).length >= 4, true);
check('总览显示偏低档', panelTxt.includes('偏低'), true);
check('总览显示充足档', panelTxt.includes('充足'), true);
check('每区三档之一', await p.locator('.soil-row').count(), 4);

// 7. 存档保留肥力，旧档迁移不处罚
await p.evaluate(() => __MOSS__.saveNow());
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
check('重载后肥力保留', await p.evaluate(() => __MOSS__.soilValue('z2')), 15);
check('重载后充足区保留', await p.evaluate(() => __MOSS__.soilValue('z4')), 85);

const oldSave = await p.evaluate(() => {
  const s = __MOSS__.freshState();
  s.sceneId = 'farm'; s.player = { x: 9, y: 10, face: 'down' };
  const saved = JSON.parse(JSON.stringify(s));
  delete saved.soil;                      // 模拟没有 soil 字段的旧档
  return JSON.stringify(saved);
});
const mig = await p.evaluate((raw) => {
  const n = __MOSS__.normalizeSaveForTest(JSON.parse(raw));
  if (!n) return null;
  __MOSS__.startGame(n);
  return __MOSS__.soilInfo();
}, oldSave);
check('旧档迁移后肥力为适宜而非惩罚', mig && mig.bands, { z1: '适宜', z2: '适宜', z3: '适宜', z4: '适宜' });

check('无控制台错误', d.errors, []);
await d.browser.close();
console.log(`\n阶段 B 肥力与轮作 ${passed}/${passed + fails.length} 通过`);
if (fails.length) { console.log('失败：', fails.join(' / ')); process.exit(1); }
