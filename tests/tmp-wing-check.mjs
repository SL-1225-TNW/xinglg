/* 一次性取证：东翼施工后的连通性与门楼梯自检。 */
import { launch, boot } from './harness.mjs';

const { browser, page, errors } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  const r = await page.evaluate(async () => {
    const M = window.__MOSS__, out = { problems: [], scenes: {} };
    const scenes = ['palace_f1', 'city_castle', 'palace_f3', 'palace_east_wing', 'palace_grounds', 'palace_gallery', 'palace_terrace'];
    function flood(map, sx, sy) {
      if (!map || map.solid[sx][sy]) return null;
      const seen = new Set([sx + ',' + sy]), q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
          if (seen.has(k) || map.solid[nx][ny]) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return seen;
    }
    for (const id of scenes) {
      const map = M.MAPS[id];
      if (!map) { out.problems.push('缺场景 ' + id); continue; }
      let start = null;
      if (map.indoor && map.enter) start = [map.enter.x, map.enter.y];
      else {
        const anchor = (M.INTERACTABLES[id] || []).filter(i => i.kind !== 'palaceLocked')[0];
        if (anchor && anchor.stand && anchor.stand.length) start = anchor.stand[0];
      }
      if (!start) { out.scenes[id] = { walkable: 0, reach: -1 }; continue; }
      const seen = flood(map, start[0], start[1]);
      if (!seen) { out.problems.push(id + ' 入口 (' + start + ') 不可走'); continue; }
      let walk = 0; for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) if (!map.solid[x][y]) walk++;
      const un = [];
      for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++)
        if (!map.solid[x][y] && !seen.has(x + ',' + y)) un.push([x, y]);
      out.scenes[id] = { w: map.w, h: map.h, walkable: walk, reach: seen.size, unreachable: un.length, sample: un.slice(0, 8) };
      (map.doors || []).forEach(d => (d.stand || []).forEach(s => {
        if (!seen.has(s[0] + ',' + s[1])) out.problems.push(id + ' 门 ' + d.id + ' 站位 (' + s + ') 走不通');
      }));
      (M.INTERACTABLES[id] || []).forEach(it => (it.stand || []).forEach(s => {
        if (!seen.has(s[0] + ',' + s[1])) out.problems.push(id + ' 交互 ' + it.id + ' 站位 (' + s + ') 走不通');
      }));
    }
    /* 服务路线：宫苑 → 后勤院 → 东翼南门 → 翼楼 → 西门 → 一层 → 事务台 */
    const g = M.MAPS.palace_grounds, seen = flood(g, 60, 90);
    const chain = [[97, 55], [97, 53], [97, 54], [98, 62]];
    out.yardChain = chain.map(p => p.join(',') + '=' + (seen && seen.has(p.join(','))));
    out.wingDoors = (M.MAPS.palace_east_wing.doors || []).map(d => ({ id: d.id, to: d.to, tx: d.tx, ty: d.ty }));
    out.f1WingDoor = (M.INTERACTABLES.palace_f1 || []).filter(i => i.kind === 'indoorExit').map(i => i.id + '->' + i.doorId);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('--- 控制台 ---');
  console.log([...new Set(errors)].join('\n') || '（无）');
} finally { await browser.close(); }
