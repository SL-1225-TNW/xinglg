import { launch, boot } from './harness.mjs';

/* 探索等级显示：explorationTier() 返回 0..3，UI 必须显示 1..4。
   回归锁：防止有人把 +1 去掉，第 0 级又变成不可见的 "Lv 0 / 3"。 */

const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】explorationTier() 仍返回 0..3（逻辑未动）');
  const raw = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = [];
    for (const p of [0, 19, 20, 34, 35, 69, 70, 200]) {
      const e = M.exploreState();
      const old = e.explorePoints;
      e.explorePoints = p;
      out.push({ p, tier: M.explorationTier() });
      e.explorePoints = old;
    }
    return out;
  });
  const expect = { 0: 0, 19: 0, 20: 1, 34: 1, 35: 2, 69: 2, 70: 3, 200: 3 };
  for (const r of raw) {
    T(`探索度 ${String(r.p).padStart(3)} → tier ${r.tier}`, r.tier === expect[r.p],
      r.tier === expect[r.p] ? '' : `应为 ${expect[r.p]}`);
  }

  console.log('\n【2】委托门槛逻辑未受影响（minTier 仍按 0 起算）');
  const q = await page.evaluate(() => {
    const M = window.__MOSS__;
    const qs = M.WORLD_QUESTS.map(q => ({ id: q.id, minTier: q.minTier }));
    return qs;
  });
  const tiers = q.map(x => x.minTier).filter(v => typeof v === 'number');
  console.log('  各委托 minTier:', q.map(x => `${x.id}=${x.minTier}`).join(', '));
  T('minTier 取值都在 1..3（无人误用 4）', tiers.every(v => v >= 1 && v <= 3),
    tiers.join(','));

console.log('\n【3】UI 真实渲染验证：直接渲染委托页与探索日志');
  // 6928 的说明文字在 renderQuestTab 的 explore 分支，需先设 QUEST_TAB='explore' 再开窗口
  const ui = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = { questTab: [], journal: [] };
    const e = M.exploreState();
    const old = e.explorePoints;
    e.explorePoints = 0;

    // (a) 委托页 explore tab 的说明段落
    try {
      M.openQuestLog && M.openQuestLog();
      document.querySelectorAll('#windowRoot p, .win-body p, .win p').forEach(p => {
        const t = (p.textContent || '').trim();
        if (/探索度|探索等级/.test(t)) out.questTab.push(t);
      });
    } catch (err) { out.questTab.push('ERR:' + err.message); }

    // (b) 探索日志 meta 行（6989）
    try {
      M.openFieldJournal && M.openFieldJournal();
      document.querySelectorAll('.forest-journal-meta span, .forest-journal-meta strong').forEach(s => {
        const t = (s.textContent || '').trim();
        if (t) out.journal.push(t);
      });
    } catch (err) { out.journal.push('ERR:' + err.message); }

    e.explorePoints = old;
    return out;
  });

  const lines = [...ui.questTab, ...ui.journal].filter(Boolean);
  console.log('  委托页文本:'); ui.questTab.forEach(t => console.log('    ' + t));
  console.log('  探索日志 meta:'); ui.journal.forEach(t => console.log('    ' + t));

  const errLines = lines.filter(t => t.startsWith('ERR:'));
  T('两处渲染调用无异常', errLines.length === 0, errLines.join(' | '));

  const lv0 = lines.filter(t => /Lv\s*0\b/.test(t) || /探索等级\s*0\b/.test(t) || /等级\s*0\s*\/\s*3/.test(t));
  T('不出现 "Lv 0"', lv0.length === 0, lv0[0] || '');

  // 真断言：必须至少抓到一行，且至少一行是 1 起
  const realLines = lines.filter(t => !t.startsWith('ERR:'));
  T('抓到至少一行等级文本', realLines.length > 0, realLines.join(' || '));
  const lv1 = realLines.filter(t => /Lv\s*1\b/.test(t) || /等级\s*1\s*\/\s*3/.test(t));
  T('存在 Lv 1 行', lv1.length > 0, lv1[0] || '（没有，抓到的行: ' + realLines.join(' | ') + '）');
  if (!lv1.length && realLines.length) {
    console.log('  ⚠ 抓到行但不是 Lv 1，需人工核对渲染条件');
    fails.push('Lv 1 行断言');
  }

  console.log('\n【4】零控制台报错');
  const e2 = [...new Set(errors)];
  T('无报错', e2.length === 0, e2.slice(0, 3).join(' | '));

  console.log('\n======== 汇总 ========');
  console.log(fails.length ? `失败 ${fails.length} 项` : '全部通过：显示 1..4，逻辑仍 0..3');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally { await browser.close(); }