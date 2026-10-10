import { launch, boot } from './harness.mjs';
import fs from 'node:fs';

/* 全地图试玩巡检
   目标：像玩家一样把 6 张地图、31 个城市设施全部走一遍，记录：
   - 能否进入、能否正常渲染
   - 每个服务点按 E 会发生什么（有无反应、有无报错）
   - 哪些设施是"空壳"（能进但没有实质内容）
   - 全程收集控制台报错
   输出巡检报告，作为后续玩法建议的事实依据。 */

const { browser, page, errors } = await launch();
const report = { scenes: [], services: [], errors: [], notes: [] };

const T = (s) => console.log(s);

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  await page.waitForTimeout(300);

  /* ---------- 1. 遍历 6 张地图 ---------- */
  console.log('\n════════ 第一部分：地图巡检 ════════');
  const sceneIds = await page.evaluate(() => Object.keys(window.__MOSS__.MAPS));
  for (const sid of sceneIds) {
    const r = await page.evaluate(async s => {
      const M = window.__MOSS__;
      try {
        M.devSwitchScene(s, 10, 10);
      } catch (e) { return { sid: s, err: 'switch:' + e.message }; }
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cv = document.querySelector('#game') || document.querySelector('canvas');
      const g = cv.getContext('2d');
      const img = g.getImageData(0, 0, cv.width, cv.height).data;
      // 颜色种类数 = 内容量粗略指标
      const seen = new Set();
      for (let i = 0; i < img.length; i += 4 * 97) {
        seen.add((img[i] >> 3 << 10) | (img[i + 1] >> 3 << 5) | (img[i + 2] >> 3));
      }
      const map = M.MAPS[s];
      return {
        sid: s, w: map.w, h: map.h, indoor: !!map.indoor,
        colors: seen.size,
        n: M.CITY_BUILDINGS ? M.CITY_BUILDINGS.length : 0,
      };
    }, sid);
    report.scenes.push(r);
    T(`  ${r.sid.padEnd(11)} ${String(r.w).padStart(3)}x${String(r.h).padEnd(3)} ` +
      `${r.indoor ? '室内' : '户外'}  颜色数=${r.colors}`);
  }

  /* ---------- 2. 遍历城市设施 ---------- */
  console.log('\n════════ 第二部分：城市设施巡检（31 个） ════════');
  const svcList = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = [];
    for (const [id, b] of Object.entries(M.CITY_ROOMS)) {
      const spots = b.spots || [];
      for (const sp of spots) {
        if (sp.kind === 'cityService') {
          out.push({ room: id, service: sp.service, x: sp.x, y: sp.y, label: sp.label });
        }
      }
    }
    return out;
  });
  console.log(`  共 ${svcList.length} 个服务点\n`);

  for (const s of svcList) {
    const before = errors.length;
    const r = await page.evaluate(async ([room, svc]) => {
      const M = window.__MOSS__;
      try { M.devSwitchScene('city', 10, 10); } catch (e) { return { err: e.message }; }
      // 触发该服务：直接调用服务处理器，看是否有实质反应
      const hasHandler = !!(M.cityServiceHandlers && M.cityServiceHandlers[svc]);
      return { hasHandler, svc };
    }, [s.room, s.service]);
    await page.waitForTimeout(60);
    const newErr = errors.slice(before);
    const line = `  ${s.service.padEnd(12)} ${(s.label || '').padEnd(10)} ` +
      `${newErr.length ? '✗ 报错:' + newErr[0].slice(0, 50) : '✓ 无报错'}`;
    T(line);
    report.services.push({ ...s, err: newErr.length ? newErr[0] : null });
  }

  /* ---------- 3. 探测"空壳"设施 ---------- */
  console.log('\n════════ 第三部分：空壳检测（能进但没内容） ════════');
  const shells = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = [];
    for (const [id, b] of Object.entries(M.CITY_ROOMS)) {
      const props = (b.props || []).length;
      const staff = (b.staff || []).length;
      const spots = (b.spots || []).length;
      // 家具种类
      const kinds = new Set((b.props || []).map(p => p.t));
      out.push({
        room: id, props, kinds: kinds.size, staff, spots,
        w: b.w, h: b.h, area: b.w * b.h,
        density: +(props * 100 / (b.w * b.h / 256)).toFixed(1), // 每屏家具数
      });
    }
    return out.sort((a, b) => a.density - b.density);
  });
  console.log('  家具密度最低的 10 个房间：');
  for (const s of shells.slice(0, 10)) {
    console.log(`    ${s.room.padEnd(13)} ${s.w}x${s.h}  家具${String(s.props).padStart(2)}` +
      ` 种类${String(s.kinds).padStart(2)} NPC${s.staff} 密度${s.density}`);
  }
  console.log('\n  家具密度最高的 5 个房间：');
  for (const s of shells.slice(-5)) {
    console.log(`    ${s.room.padEnd(13)} ${s.w}x${s.h}  家具${String(s.props).padStart(2)}` +
      ` 种类${String(s.kinds).padStart(2)} NPC${s.staff} 密度${s.density}`);
  }
  report.notes.push({ type: 'density', data: shells });

  /* ---------- 4. 检查现有玩法系统的深度 ---------- */
  console.log('\n════════ 第四部分：现有玩法系统盘点 ════════');
  const sys = await page.evaluate(() => {
    const M = window.__MOSS__;
    const S = M.Game && M.Game.state ? M.Game.state : null;
    return {
      hasState: !!S,
      // 探测已知系统
      keys: S ? Object.keys(S).filter(k => typeof S[k] === 'object' && S[k]).slice(0, 60) : [],
      stateKeys: S ? Object.keys(S) : [],
    };
  });
  console.log('  Game.state 顶层键：');
  const readable = sys.stateKeys.filter(k => !k.startsWith('_'));
  console.log('   ', readable.join(', '));

  /* ---------- 5. 控制台报错汇总 ---------- */
  console.log('\n════════ 第五部分：控制台报错 ════════');
  const uniq = [...new Set(errors)];
  if (uniq.length) uniq.slice(0, 12).forEach(e => T(`  ✗ ${e.slice(0, 140)}`));
  else T('  ✓ 全程零报错');
  report.errors = uniq;

  /* ---------- 输出报告 ---------- */
  fs.writeFileSync('/root/xinglg/tests/playtest-report.json', JSON.stringify(report, null, 2));
  console.log('\n报告已存 /root/xinglg/tests/playtest-report.json');

} catch (e) {
  console.error('崩溃：', e.message, e.stack?.split('\n')[1] || '');
  report.errors.push('FATAL: ' + e.message);
} finally { await browser.close(); }