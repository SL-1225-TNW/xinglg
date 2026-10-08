import { launch, boot } from './harness.mjs';
import fs from 'node:fs';

/* 城市设施配方现状盘点：直接从运行时 __MOSS__ 取权威数据，
   不靠正则猜源码结构。输出所有服务的 id / 名称 / 产出 / 原料。 */
const { browser, page, errors } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  const data = await page.evaluate(() => {
    const M = window.__MOSS__;
    // CITY_ROOMS 里每个服务点应该有家具/服务引用
    const rooms = M.CITY_ROOMS || {};
    const out = { roomKeys: Object.keys(rooms), buildings: [], services: [] };

    // 从 CITY_BUILDINGS 拿建筑（带 service 名）
    (M.CITY_BUILDINGS || []).forEach(b => {
      out.buildings.push({
        id: b.id, name: b.name || '', kind: b.kind || '',
        w: b.w, h: b.h, service: b.service || b.svc || null,
      });
    });

    // 尝试从 state 或全局找服务定义表
    for (const key of ['CITY_SERVICES', 'SERVICES', 'CITY_SERVICE_DEFS']) {
      const t = M[key];
      if (t) {
        out.services.push({ from: key, defs: Array.isArray(t) ? t : Object.entries(t).map(([k, v]) => ({ id: k, ...v })) });
      }
    }

    // NPC 表里带 service 的
    (Object.keys(M.NPCS || {})).forEach(k => {
      const n = M.NPCS[k];
      if (n && n.service) out.services.push({ from: 'NPC', id: k, name: n.name, service: n.service });
    });

    // RECIPES —— 现有配方，谁消耗什么
    out.recipes = (M.RECIPES || []).map(r => ({
      out: r.out, n: r.n, cost: r.cost || r.need || null, station: r.station || r.at || null,
    }));

    out.items = Object.keys(M.ITEMS || {});
    return out;
  });

  fs.writeFileSync('/root/xinglg/tests/shots/city_services_inventory.json', JSON.stringify(data, null, 2));

  console.log('=== CITY_ROOMS 键 ===');
  console.log(' ', data.roomKeys.join(', '));
  console.log('\n=== CITY_BUILDINGS (' + data.buildings.length + ') ===');
  data.buildings.forEach(b => console.log(`  ${String(b.id).padEnd(16)} ${String(b.kind).padEnd(12)} ${String(b.service || '-').padEnd(16)} ${b.w}x${b.h}  ${b.name || ''}`));
  console.log('\n=== 服务定义表 ===');
  data.services.forEach(s => {
    if (s.from === 'NPC') console.log(`  [NPC] ${s.id} → ${s.service}  ${s.name || ''}`);
    else console.log(`  [${s.from}] ${s.defs ? s.defs.length + ' 项' : ''}`);
  });
  console.log('\n=== RECIPES (' + (data.recipes || []).length + ') ===');
  (data.recipes || []).forEach(r => console.log(`  ${JSON.stringify(r.out)} x${r.n}  cost=${JSON.stringify(r.cost)}  @${r.station}`));
  console.log('\n=== ITEMS (' + data.items.length + ') ===');
  console.log(' ', data.items.join(', '));
  console.log('\n存 tests/shots/city_services_inventory.json');

  const e2 = [...new Set(errors)];
  console.log(e2.length ? '\n报错: ' + e2.slice(0, 3).join(' | ') : '\n零报错');
} catch (e) { console.error('崩溃:', e.message); } finally { await browser.close(); }