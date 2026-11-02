/* 公共窗口逐窗巡检专项（UI/UX Polish 1.0 · 阶段 1 第二批）。
 *
 * 覆盖：8 个真实可达的主要窗口 × 5 种视口，逐窗检查边界、滚动、焦点、
 * 关闭目标、正文字号、窗口挂点、按钮可读性与禁用原因可见性。
 *
 * 取证边界：
 * - 只用真实键鼠/触摸打开窗口；不注入状态、不调用 devOpen*、不改日期。
 * - 禁用原因按「可见原因节点或自述文案」判定，允许上溯一层容器；
 *   title / hover 不算原因（手机上没有 hover）。
 * - 本条是布局与可用性证据，不代表真机手感；实体手机与初见玩家仍未测。
 * --baseline 只记录改造前截图，不作为通过证据。
 */
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { launch, boot, Report } from './harness.mjs';

const single = process.argv.includes('--single-file');
const baseline = process.argv.includes('--baseline');
const rep = new Report();
const dir = new URL(`../output/playwright/ui-polish/${baseline ? 'before' : single ? 'single' : 'after'}/`, import.meta.url);
await mkdir(dir, { recursive: true });

const VIEWPORTS = [[1280, 860, false], [1512, 982, false], [2560, 1600, false], [390, 844, true], [844, 390, true]];

/* 八个主要窗口：键位与手机入口都是玩家真实能走到的地方。 */
const WINDOWS = [
  { id: 'bag', name: 'bag', key: 'b', title: '背包', touch: '#touchBag' },
  { id: 'quest', name: 'quest', key: 'j', title: '委托日志', touch: '#touchQuest' },
  { id: 'pause', name: 'pause', key: 'Escape', title: '暂停', touch: '#btnMenu' },
  { id: 'character', name: 'character', key: 'p', title: '角色', touch: '#touchChar' },
  { id: 'workrecords', name: 'records', key: 'n', title: '农务与矿山记录', touch: '#btnRecords' },
  { id: 'craft', name: 'craft', key: 'c', title: '制作', touch: '#touchCraft' },
  { id: 'worldmap', name: 'map', key: 'm', title: '蔷薇谷', touch: '#touchMap' },
  { id: 'field_journal', name: 'journal', key: 'f', title: '森林书', touch: null }
];

/* 打开窗口：桌面走键位，触屏走常驻按钮；森林书没有常驻触屏按钮，
   按真实玩家路径从暂停菜单进入。 */
async function openWindow(page, w, touch) {
  if (!touch) { await page.keyboard.press(w.key); return; }
  if (w.touch) { await page.locator(w.touch).tap(); return; }
  await page.locator('#btnMenu').tap();
  await page.locator('.win').waitFor();
  const btn = page.locator('.win button', { hasText: '森林书' }).first();
  await btn.scrollIntoViewIfNeeded();
  await btn.tap();
}

/* 逐窗体检：边界、溢出、关闭目标、可访问标题、正文字号、挂点、
   空按钮与禁用原因。禁用原因只认可见节点或自述文案，不认 title。 */
async function inspectWindow(page) {
  return page.evaluate(() => {
    const win = document.querySelector('.win');
    const body = win.querySelector('.win-body');
    const close = win.querySelector('.win-close');
    const r = win.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const btns = Array.from(win.querySelectorAll('button'));
    const REASON = '.ui-reason, .travel-blocked, .req-chip, .quest-next, .item-desc, .char-talent-why';
    const SELF = /(不足|未解锁|上限|已满|不能|还没有|没有|不可|未开放|未到|待|需|缺|暂停|无法|尚未|只能|已)/;
    /* 按钮文字不该被挤成逐字竖排：窗口宽度够放下整句时必须一行。 */
    const squeezed = [];
    const bodyW = body.clientWidth;
    btns.forEach(b => {
      const label = (b.innerText || '').trim();
      if (!label || label.length > 10) return;
      const cs = getComputedStyle(b);
      const fs = parseFloat(cs.fontSize);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const need = label.length * fs + pad;
      if (need > bodyW) return;
      const range = document.createRange();
      range.selectNodeContents(b);
      const lines = range.getClientRects().length;
      if (lines > 1) squeezed.push({ label: label.slice(0, 12), lines, need: Math.round(need) });
    });
    const bad = [];
    btns.filter(b => b.disabled).forEach(b => {
      const label = (b.innerText || '').trim();
      let ok = false;
      for (let n = b.parentElement, i = 0; n && i < 2; n = n.parentElement, i++) {
        const found = Array.from(n.querySelectorAll(REASON)).filter(x => {
          const rr = x.getBoundingClientRect();
          return rr.width > 0 && rr.height > 0 && (x.innerText || '').trim().length > 0;
        });
        if (found.length) { ok = true; break; }
      }
      if (!ok && SELF.test(label)) ok = true;
      if (!ok) bad.push({ label: label.slice(0, 20), title: (b.getAttribute('title') || '').slice(0, 30) });
    });
    return {
      inside: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      overflow: body.scrollWidth <= body.clientWidth + 1,
      close: c.width >= 44 && c.height >= 44,
      labelled: win.getAttribute('aria-labelledby') === win.querySelector('.win-title').id && !!win.querySelector('.win-title').id,
      font: parseFloat(getComputedStyle(body).fontSize),
      device: document.documentElement.dataset.device,
      winId: win.dataset.windowId || '',
      kind: win.dataset.kind || '',
      emptyBtns: btns.filter(b => !(b.innerText || '').trim()).length,
      disabledCount: btns.filter(b => b.disabled).length,
      squeezed,
      bad
    };
  });
}

for (const [width, height, touch] of VIEWPORTS) {
  const { browser, page, errors } = await launch({
    viewport: { width, height },
    touch,
    url: new URL(single ? '../苔芽农场-单文件版.html' : '../index.html', import.meta.url).href
  });
  try {
    await boot(page);
    for (const w of WINDOWS) {
      await openWindow(page, w, touch);
      await page.locator('.win').waitFor();
      await page.screenshot({ path: fileURLToPath(new URL(`${width}x${height}-${w.name}.png`, dir)) });
      if (!baseline) {
        const m = await inspectWindow(page);
        rep.ok(`${width} ${w.name} 真实入口`, (await page.locator('.win-title').innerText()).includes(w.title));
        rep.ok(`${width} ${w.name} 窗口在屏内`, m.inside, JSON.stringify(m));
        rep.ok(`${width} ${w.name} 正文无横向溢出`, m.overflow, JSON.stringify(m));
        rep.ok(`${width} ${w.name} 关闭目标44px`, m.close, JSON.stringify(m));
        rep.ok(`${width} ${w.name} 可访问标题`, m.labelled);
        rep.ok(`${width} ${w.name} 正文至少15px`, m.font >= 15, `实际 ${m.font}px`);
        rep.ok(`${width} ${w.name} 设备模式`, touch ? m.device !== 'computer' : m.device === 'computer', m.device);
        rep.ok(`${width} ${w.name} 窗口挂点`, m.winId === w.id, `实际 ${m.winId} / 期望 ${w.id}`);
        rep.ok(`${width} ${w.name} 无空按钮`, m.emptyBtns === 0, `空按钮 ${m.emptyBtns} 个`);
        rep.ok(`${width} ${w.name} 按钮文字不竖排`, m.squeezed.length === 0, JSON.stringify(m.squeezed));
        rep.ok(`${width} ${w.name} 禁用原因可见`, m.bad.length === 0, JSON.stringify(m.bad));
        await page.locator('.win-body').hover();
        await page.mouse.wheel(0, 800);
        rep.ok(`${width} ${w.name} 滚动后关闭入口可见`, await page.locator('.win-close').isVisible());
      }
      if (touch) await page.locator('.win-close').tap();
      else await page.locator('.win-close').click();
      if (!baseline) rep.ok(`${width} ${w.name} 关闭生效`, await page.locator('#windowLayer').isHidden());
    }

    /* 地图深一层：选到旧矿山后，矿层传送按钮禁用时必须有可见原因。
       这条覆盖「只有 title 说明」的旧缺口，必须靠真实点击走到。 */
    if (!baseline) {
      await openWindow(page, WINDOWS.find(w => w.id === 'worldmap'), touch);
      await page.locator('.win').waitFor();
      const mine = page.locator('.atlas-place', { hasText: '旧矿山' }).first();
      await mine.scrollIntoViewIfNeeded();
      if (touch) await mine.tap(); else await mine.click();
      await page.locator('.win').waitFor();
      await page.screenshot({ path: fileURLToPath(new URL(`${width}x${height}-map-mine.png`, dir)) });
      const mineInfo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.win-body button'));
        const levelBtns = btns.filter(b => (b.innerText || '').indexOf('旧矿山 ·') === 0);
        const withReason = levelBtns.filter(b => {
          const box = b.closest('.ui-reason-item');
          const note = box ? box.querySelector('.ui-reason') : null;
          if (!note) return false;
          const rr = note.getBoundingClientRect();
          return rr.width > 0 && rr.height > 0 && (note.innerText || '').trim().length > 0;
        });
        return { total: levelBtns.length, withReason: withReason.length, disabled: levelBtns.filter(b => b.disabled).length };
      });
      rep.ok(`${width} 地图矿层按钮已出现`, mineInfo.total > 0, JSON.stringify(mineInfo));
      rep.ok(`${width} 地图矿层禁用原因可见`, mineInfo.disabled > 0 && mineInfo.withReason === mineInfo.disabled, JSON.stringify(mineInfo));
      if (touch) await page.locator('.win-close').tap();
      else await page.locator('.win-close').click();
    }
    if (!baseline) rep.eq(`${width} 无浏览器错误`, errors, []);
  } finally { await browser.close(); }
}
if (baseline) console.log('BASELINE 五视口八窗口截图已记录，不构成验收');
else {
  const pass = rep.summary();
  if (!pass) process.exitCode = 1;
  else console.log(`PASS UI Polish 公共窗口逐窗巡检${single ? '（单文件版）' : ''} ${rep.passed.length} 项通过`);
}
