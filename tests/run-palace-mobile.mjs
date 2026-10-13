/* 白蔷薇宫城 P1 · 手机端（测试组自有文件，验收口径见 docs/palace-p1-contract.md §10 / §11）
 *
 * 竖屏 390×844 与横屏 844×390 各跑一遍；全部用真实触屏点按（locator.tap / touchscreen.tap），
 * 不用键盘。站位仍用 devSwitchScene 放到楼梯 stand 格，触发一律走 #touchAct 或画布点按。
 *
 * 跑法：cd 项目根目录 && node tests/run-palace-mobile.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, boot } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'output', 'playwright');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 844, height: 390 }];

/* 可读下限取自现有手机档样式（styles.css：.hud-value 手机字号 11~12px，触屏按钮 44px）。
   楼层牌是常驻芯片，宽高下限只用来排掉被压扁/零尺寸的元素（竖排窄标签也要放行），
   真正能不能读由字号 ≥11px、矩形在视口内、中心点 elementFromPoint 命中三条一起判。 */
const MIN_FONT = 11, MIN_W = 24, MIN_H = 28;
const FLOOR_WORDS = ['一层', '二层', '三层'];

let checks = 0;
const failed = [];
const warned = [];
function T(name, cond, detail) {
  checks++;
  if (cond) console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
  else { failed.push(name); console.log('  ✗ ' + name + '\n      ' + (detail || '（无详情）')); }
  return !!cond;
}
function W(msg) { warned.push(msg); console.log('  ! ' + msg); }
function section(title) { console.log('\n── ' + title); }
const winOpen = p => p.evaluate(() => !document.getElementById('windowLayer').hidden);
const sceneOf = p => p.evaluate(() => window.__MOSS__.state.sceneId);
const where = p => p.evaluate(() => {
  const M = window.__MOSS__;
  return { scene: M.state.sceneId, x: M.state.player.x, y: M.state.player.y };
});

/* 找宫城楼层牌：先按约定 id/class，再兜底扫“可见 + 带层字 + 尺寸像芯片”的元素 */
function readFloorSign(p) {
  return p.evaluate(() => {
    const sel = '#hudFloor,#floorSign,#palaceFloor,#palaceFloorSign,#floor-sign,#floorTag,.floor-chip,.palace-floor,[data-palace-floor],[data-floor-sign]';
    let el = document.querySelector(sel);
    let how = '约定选择器';
    if (!el) {
      how = '文本兜底扫描';
      const cands = [...document.querySelectorAll('button,div,span')].filter(n => {
        const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
        if (r.width < 20 || r.height < 12 || r.width > innerWidth * 0.9) return false;
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        return /层|楼/.test(n.textContent || '');
      }).sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
      el = cands[0] || null;
    }
    if (!el) return { found: false, how };
    const r = el.getBoundingClientRect();
    let font = 0;
    for (const n of [el].concat([...el.querySelectorAll('*')]))
      font = Math.max(font, parseFloat(getComputedStyle(n).fontSize) || 0);
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      found: true, how, id: el.id || '', cls: String(el.className || '').slice(0, 60),
      text: (el.textContent || '').trim().slice(0, 40),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      font: Math.round(font * 10) / 10, vw: innerWidth, vh: innerHeight,
      inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      hitOk: hit === el || el.contains(hit),
      cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2)
    };
  });
}

function findStair(p, scene, to) {
  return p.evaluate(({ scene, to }) => {
    const list = window.__MOSS__.INTERACTABLES[scene] || [];
    const hit = list.filter(o => o.kind === 'palaceStair' && o.to === to)[0];
    if (!hit) return null;
    return { id: hit.id, x: hit.x, y: hit.y, label: hit.label || '', stand: (hit.stand || []).map(s => [s[0], s[1]]) };
  }, { scene, to });
}
async function pose(p, scene, x, y) {
  await p.evaluate(([s, tx, ty]) => {
    const M = window.__MOSS__; M.closeWindow(); M.devSwitchScene(s, tx, ty);
  }, [scene, x, y]);
  await p.waitForTimeout(240);
}
/* 把玩家放进指定宫城场景：优先门的 enter 落点，再试房间中心，最后找第一块可行走地。
   §1~§4 都要真的“人在宫城里”，不能因为楼梯还没接上就在农场里量楼层牌。 */
function poseInto(p, scene) {
  return p.evaluate(s => {
    const M = window.__MOSS__, map = M.MAPS[s];
    if (!map) return null;
    const cx = Math.floor(map.w / 2), cy = Math.floor(map.h / 2);
    const cands = [];
    if (map.enter) cands.push([map.enter.x, map.enter.y]);
    cands.push([cx, cy], [cx, cy - 1], [cx + 1, cy], [cx - 1, cy], [cx, cy + 1]);
    outer: for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) {
      if (!M.isSolid(s, x, y)) { cands.push([x, y]); break outer; }
    }
    for (const c of cands) if (!M.isSolid(s, c[0], c[1])) return c;
    return null;
  }, scene).then(at => (at ? pose(p, scene, at[0], at[1]).then(() => at) : null));
}
async function shot(p, name) {
  await p.screenshot({ path: path.join(SHOTS, 'palace-mobile-' + name + '.png') })
    .catch(e => W('截图失败 ' + name + '：' + e.message));
}
const closeWin = async p => {
  if (!(await winOpen(p))) return;
  await p.locator('.win-close').first().tap().catch(() => p.evaluate(() => window.__MOSS__.closeWindow()));
  await p.waitForTimeout(180);
};

for (const viewport of VIEWPORTS) {
  const vp = viewport.width + '×' + viewport.height;
  console.log('\n======== 手机视口 ' + vp + ' ========');
  const run = await launch({ viewport, touch: true });
  try {
    const p = run.page;
    await boot(p);
    await p.locator('#tutorialSkip').tap().catch(() => { });

    section(vp + ' 触屏控件与场景准备');
    const actBox = await p.locator('#touchAct').boundingBox();
    const actInView = !!actBox && actBox.x >= 0 && actBox.y >= 0 &&
      actBox.x + actBox.width <= viewport.width && actBox.y + actBox.height <= viewport.height;
    T(vp + ' #touchAct 在视口内可点', actInView, JSON.stringify(actBox));

    const hasF1 = await p.evaluate(() => !!(window.__MOSS__.MAPS.palace_f1 && window.__MOSS__.INTERACTABLES.palace_f1));
    if (!T(vp + ' palace_f1 已登记（进一层才谈得上楼层牌）', hasF1, hasF1 ? '' : 'MAPS/INTERACTABLES 里没有 palace_f1')) {
      W('一层场景不存在：楼层牌、导览、楼梯三组断言都要等场景存在才成立');
      T(vp + ' 全程浏览器无报错', [...new Set(run.errors)].length === 0, [...new Set(run.errors)].slice(0, 4).join(' | '));
      continue;
    }
    const spot = await poseInto(p, 'palace_f1');
    T(vp + ' 能站进一层（门内落点可行走）', !!spot, spot ? '站位 (' + spot + ')' : 'palace_f1 里找不到任何可行走格');

    const up = await findStair(p, 'palace_f1', 'city_castle');
    T(vp + ' palace_f1 有上二层的 palaceStair', !!up,
      up ? up.id + ' · ' + up.label : 'palace_f1 里没有 kind=palaceStair 且 to=city_castle 的楼梯');
    if (up) await pose(p, 'palace_f1', up.stand[0][0], up.stand[0][1]);

    section(vp + ' §1 楼层牌可见可读');
    const sign = await readFloorSign(p);
    if (!T(vp + ' 宫城场景内有楼层牌', sign.found,
      sign.found ? '定位 ' + sign.how + ' · ' + (sign.id || sign.cls) + ' 文案「' + sign.text + '」'
        : '找不到楼层牌元素（查找方式：' + sign.how + '）· 当前场景 ' +
          await sceneOf(p))) {
      T(vp + ' 楼层牌在视口内且尺寸非零', false, '没有楼层牌元素可测（需 ≥' + MIN_W + '×' + MIN_H + '）');
      T(vp + ' 楼层牌字号可读', false, '没有楼层牌元素（需 ≥' + MIN_FONT + 'px）');
      T(vp + ' 楼层牌未被遮挡、能点到', false, '没有楼层牌元素');
    } else {
      console.log('      定位 ' + sign.how + ' · ' + (sign.id || sign.cls) + ' 文案「' + sign.text + '」');
      T(vp + ' 楼层牌在视口内且尺寸非零', sign.inView && sign.w >= MIN_W && sign.h >= MIN_H,
        '矩形 ' + sign.w + '×' + sign.h + ' @(' + sign.x + ',' + sign.y + ')，视口 ' + sign.vw + '×' + sign.vh +
        '，下限 ' + MIN_W + '×' + MIN_H + (sign.inView ? '' : ' · 越出视口'));
      T(vp + ' 楼层牌字号可读', sign.font >= MIN_FONT, '实测 ' + sign.font + 'px，下限 ' + MIN_FONT + 'px');
      T(vp + ' 楼层牌未被遮挡、能点到', sign.hitOk,
        sign.hitOk ? '中心点 (' + sign.cx + ',' + sign.cy + ') 命中自身' : '中心点 (' + sign.cx + ',' + sign.cy + ') 命中的是别的元素');
    }

    section(vp + ' §2 楼梯可用触屏按钮触发');
    if (!up) W('没有上二层楼梯，触屏上楼与落点连按两项断言跳过');
    else {
      await pose(p, 'palace_f1', up.stand[0][0], up.stand[0][1]);
      await p.locator('#touchAct').tap();
      await p.waitForTimeout(560);
      const landed = await where(p);
      T(vp + ' #touchAct 能从一层上到二层', landed.scene === 'city_castle',
        '触屏交互后 → ' + landed.scene + ' (' + landed.x + ',' + landed.y + ')');
      await shot(p, viewport.width + '-f2');
      /* 触屏连按两次不该弹回 */
      await p.locator('#touchAct').tap();
      await p.waitForTimeout(380);
      await p.locator('#touchAct').tap();
      await p.waitForTimeout(380);
      const after = await sceneOf(p);
      T(vp + ' 落点连按两次触屏交互不弹回', after === 'city_castle', '连按后 → ' + after);
    }

    section(vp + ' §3 楼层导览可开可读');
    if (!sign.found) W('没有楼层牌，跳过楼层导览相关断言');
    else if (!sign.inView) W('楼层牌越出视口（' + sign.x + ',' + sign.y + ' ' + sign.w + '×' + sign.h + '），导览点不开');
    else {
      await p.touchscreen.tap(sign.cx, sign.cy);
      await p.waitForTimeout(460);
      const guide = await p.evaluate(() => {
        const layer = document.getElementById('windowLayer');
        const win = document.querySelector('#windowLayer .win, #windowLayer .window, #windowLayer .modal');
        const M = window.__MOSS__;
        if (!layer || layer.hidden || !win) return { open: false, hasUiWin: !!(M.ui && M.ui.window) };
        const body = document.querySelector('#windowLayer .win-body, #windowLayer .window-body');
        const titleEl = document.querySelector('#windowLayer .win-title');
        const r = win.getBoundingClientRect();
        return {
          open: true, title: titleEl ? titleEl.textContent : '',
          text: (win.innerText || '').slice(0, 600),
          inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          vw: innerWidth, vh: innerHeight,
          sw: body ? body.scrollWidth : 0, cw: body ? body.clientWidth : 0,
          noOverflow: body ? body.scrollWidth <= body.clientWidth + 1 : true
        };
      });
      if (!T(vp + ' 点楼层牌能打开楼层导览窗口', guide.open,
        guide.open ? '标题「' + guide.title + '」'
          : '点 (' + sign.cx + ',' + sign.cy + ') 后没有窗口（ui.window=' + !!guide.hasUiWin + '）')) {
        W('楼层导览打不开：可读性断言一并跳过');
      } else {
        console.log('      导览正文前 120 字：' + guide.text.replace(/\s+/g, ' ').slice(0, 120));
        T(vp + ' 楼层导览完整在视口内', guide.inView,
          '窗口 ' + guide.rect.w + '×' + guide.rect.h + ' @(' + guide.rect.x + ',' + guide.rect.y + ')，视口 ' + guide.vw + '×' + guide.vh);
        T(vp + ' 楼层导览正文无横向溢出', guide.noOverflow,
          guide.noOverflow ? '' : '正文 scrollWidth ' + guide.sw + ' > clientWidth ' + guide.cw);
        const hitWords = FLOOR_WORDS.filter(w => guide.text.indexOf(w) >= 0);
        T(vp + ' 导览里能看到楼层名（一层/二层/三层至少一个）', hitWords.length > 0,
          '正文里找到：' + (hitWords.join(' ') || '一个都没有'));
        await shot(p, viewport.width + '-guide');
      }
      await closeWin(p);
    }

    section(vp + ' §4 画布点按触发（实现未接线时只警告）');
    if (!up) W('没有上二层楼梯，画布点按断言跳过');
    else {
      await pose(p, 'palace_f1', up.stand[0][0], up.stand[0][1]);
      const pt = await p.evaluate(([x, y]) => window.__MOSS__.tileToScreen(x, y), [up.x, up.y]);
      const cv = await p.locator('#world').boundingBox();
      const onScreen = !!cv && pt[0] >= cv.x && pt[0] <= cv.x + cv.width && pt[1] >= cv.y && pt[1] <= cv.y + cv.height;
      if (!onScreen) {
        W('台阶格 ' + up.x + ',' + up.y + ' 不在当前镜头内（屏幕坐标 ' + pt.map(Math.round) + '），画布点按跳过');
      } else {
        await p.touchscreen.tap(pt[0], pt[1]);
        await p.waitForTimeout(560);
        const landed = await sceneOf(p);
        if (landed === 'city_castle') T(vp + ' 画布点按台阶能上楼', true, '点屏幕坐标 ' + pt.map(Math.round) + ' → ' + landed);
        else if (landed === 'palace_f1') W('画布点按台阶没触发（仍在 ' + landed + '）：实现未接线画布点按时只警告');
        else T(vp + ' 画布点按台阶能上楼', false, '点 (' + pt.map(Math.round) + ') 后场景变成 ' + landed);
      }
      await shot(p, viewport.width + '-stair');
    }

    const errs = [...new Set(run.errors)];
    T(vp + ' 全程浏览器无报错', errs.length === 0, errs.slice(0, 4).join(' | '));
  } finally {
    await run.browser.close();
  }
}

console.log('\n======== 宫城手机端报告 ========');
console.log('断言 ' + checks + ' 项，失败 ' + failed.length + ' 项，警告 ' + warned.length + ' 条');
if (failed.length) { console.log('\n--- 失败明细 ---'); failed.forEach(f => console.log('  ✗ ' + f)); }
if (warned.length) { console.log('\n--- 警告（不计失败） ---'); warned.forEach(w => console.log('  ! ' + w)); }
console.log('==================================\n');
process.exitCode = failed.length ? 1 : 0;
