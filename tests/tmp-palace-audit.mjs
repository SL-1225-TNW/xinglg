/* 一次性取证：把宫城的房间、房门、交互物与路线连通性抓成 JSON，供复审文档使用。 */
import fs from 'node:fs';
import { launch, boot } from './harness.mjs';

const { browser, page, errors } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  const data = await page.evaluate(() => {
    const M = window.__MOSS__;
    const out = { floors: M.PALACE_FLOORS, stairs: M.PALACE_STAIRS, rooms: {}, scenes: [] };
    for (const f of M.PALACE_FLOORS) {
      const id = f.sceneId, map = M.MAPS[id];
      const props = (map.roomDef && map.roomDef.props) || [];
      const spots = (map.roomDef && map.roomDef.spots) || [];
      const roomDoors = props.filter(p => p.t === 'palaceRoomDoor');
      out.rooms[id] = {
        w: map.w, h: map.h, floor: map.roomDef && map.roomDef.floor,
        doors: roomDoors.map(d => ({ id: d.id, x: d.x, y: d.y, h: d.h, side: d.side, label: d.label })),
        props: props.filter(p => p.t !== 'partition').map(p => ({ t: p.t, x: p.x, y: p.y, w: p.w, h: p.h, flat: !!p.flat })),
        partitions: props.filter(p => p.t === 'partition').map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })),
        stairs: props.filter(p => /Steps$/.test(p.t)).map(p => ({ t: p.t, x: p.x, y: p.y, w: p.w, h: p.h })),
        interactables: (M.INTERACTABLES[id] || []).map(i => ({
          id: i.id, kind: i.kind, x: i.x, y: i.y, label: i.label,
          service: i.service, to: i.to, tx: i.tx, ty: i.ty,
          stand: i.stand, note: (i.note || '').slice(0, 40)
        }))
      };
    }
    for (const id of ['palace_grounds', 'palace_gallery', 'palace_terrace']) {
      const map = M.MAPS[id];
      out.scenes.push({
        id, name: map.name, w: map.w, h: map.h, indoor: !!map.indoor,
        exits: (map.exits || []).map(e => ({ x: e.x, y: e.y, to: e.to, tx: e.tx, ty: e.ty })),
        buildings: (map.buildings || []).map(b => ({ id: b.id, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind })),
        decor: (map.decor || []).length,
        interactables: (M.INTERACTABLES[id] || []).map(i => ({ id: i.id, kind: i.kind, x: i.x, y: i.y, label: i.label, to: i.to, tx: i.tx, ty: i.ty, stand: i.stand, note: (i.note || '').slice(0, 50) }))
      });
    }
    /* 洪水填充：从各层入口落点出发，算出可达格集合与不可达格 */
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
    out.reach = {};
    for (const f of M.PALACE_FLOORS) {
      const map = M.MAPS[f.sceneId];
      const entry = map.enter;
      const seen = entry ? flood(map, entry.x, entry.y) : null;
      let walk = 0; for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) if (!map.solid[x][y]) walk++;
      const unreachable = [];
      if (seen) for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++)
        if (!map.solid[x][y] && !seen.has(x + ',' + y)) unreachable.push([x, y]);
      out.reach[f.sceneId] = { entry, walkable: walk, reachable: seen ? seen.size : 0, unreachableCount: unreachable.length, unreachableSample: unreachable.slice(0, 12) };
    }
    /* 后勤院围起来的地块是否与宫苑连通 */
    const g = M.MAPS.palace_grounds;
    const fromGate = flood(g, 60, 90);
    out.reach.palace_grounds = { fromCityGate: fromGate ? fromGate.size : 0 };
    for (const p of [[97, 57], [98, 57], [97, 62], [60, 46], [60, 49], [60, 93], [60, 94]]) {
      out.reach.palace_grounds['at_' + p.join('_')] = !!(fromGate && fromGate.has(p.join(',')));
    }
    return out;
  });
  fs.mkdirSync('output/palace', { recursive: true });
  fs.writeFileSync('output/palace/palace-audit.json', JSON.stringify(data, null, 1), 'utf8');
  console.log('已写入 output/palace/palace-audit.json');
  console.log([...new Set(errors)].join('\n') || '（无报错）');
} finally { await browser.close(); }
