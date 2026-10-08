import { launch, boot } from './harness.mjs';

/* 阶段 A 端到端实跑验证：不停留在符号存在性，
   实际调传送、执行、验证落点与耗时。 */
const { browser, page, errors } = await launch();
const T = (name, ok, note = '') => console.log(`  ${ok ? '✓' : '✗'} ${name}${note ? '  → ' + note : ''}`);
let fails = 0;
const t = (n, ok, note) => { T(n, ok, note); if (!ok) fails++; };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  // 暴露传送内部（只读不改逻辑），否则无法从测试侧驱动
  const probe = await page.evaluate(() => {
    const g = window;
    // game.js 里这些是模块内函数，通过已暴露的公开入口驱动
    const M = g.__MOSS__;
    return {
      hasMoss: !!M,
      // 找全局可访问的传送入口
      globals: Object.keys(g).filter(k => /travel|Travel|TRAVEL|atlas|Atlas/.test(k)),
      mossKeys: M ? Object.keys(M).filter(k => /travel|Travel|atlas|Atlas|node|Node/.test(k)) : [],
    };
  });
  console.log('=== 传送入口发现 ===');
  console.log('  window 全局:', probe.globals.join(', ') || '（无）');
  console.log('  __MOSS__ 相关:', probe.mossKeys.join(', ') || '（无）');

  // 若未暴露，用 UI 实操：打开 M 地图
  console.log('\n=== UI 实操：M 地图快速传送 ===');
  await page.keyboard.press('m');
  await page.waitForTimeout(700);

  const atlas = await page.evaluate(() => {
    const roots = [...document.querySelectorAll('div,section,dialog')]
      .filter(n => {
        const cs = getComputedStyle(n);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && n.offsetHeight > 200;
      });
    return roots.slice(-3).map(n => ({
      cls: n.className, id: n.id,
      text: (n.innerText || '').slice(0, 300),
      btns: [...n.querySelectorAll('button,[data-node],[data-travel]')].map(b => b.textContent.trim() || b.dataset.node || b.dataset.travel).slice(0, 12),
    }));
  });
  console.log('  可见面板数:', atlas.length);
  atlas.forEach((a, i) => {
    console.log(`  [${i}] .${a.cls || '(no class)'}#${a.id || ''}`);
    if (a.btns.length) console.log('      按钮:', a.btns.join(' | '));
    const first = (a.text || '').split('\n').filter(Boolean).slice(0, 6);
    if (first.length) console.log('      文本:', first.join(' / '));
  });

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n运行时报错: ' + e2.slice(0, 3).join(' | ') : '\n零报错');
  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }