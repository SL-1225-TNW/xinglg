/* 白蔷薇宫城 · 楼层布局契约（docs/palace-p1-contract.md §2 / §3 / §6 / §7 / §12）
   纯只读验收：不向游戏注入任何数据，只读 window.__MOSS__ 上的 MAPS / INTERACTABLES /
   PALACE_STAIRS，对 MAPS.solid 做洪水填充，逐层验证：
     1. 入口落点可达该层所有门 / 交互物 / 楼梯触发格
     2. 楼梯数据契约（stand 非空、落点可走、落点距触发格 ≥3、反向成对）
     3. 大楼梯逐层对齐（所有触发点落在同一条楼梯坐标带上；同层上下梯分处两头）
     4. 没有孤立区域：可走格全部连通，且确实围出了房间
     5. 露台栏杆是实心碰撞，没有通向虚空的假门
   功能未实现时整体为红；每条失败都带楼层与坐标，可直接定位。 */
import fs from 'node:fs';
import path from 'node:path';
import { launch, boot } from './harness.mjs';

const INDOORS = ['palace_f1', 'city_castle', 'palace_f3'];
const TERRACE = 'palace_terrace';
/* 契约 §3 规定的尺寸 */
const SIZE = {
  palace_f1: [64, 48], city_castle: [64, 48], palace_f3: [64, 48], palace_terrace: [40, 28]
};
/* 房间识别半径：被实心家具在 ±R 格内同时从横向与纵向围住的格算“房间里” */
const ROOM_R = 4;
/* 契约 §6.1：楼梯落点必须与每个触发格相距 ≥3 */
const MIN_STAIR_GAP = 3;

let checks = 0;
const failed = [];
function ok(name, cond, detail) {
  if (cond) { checks++; console.log('PASS', name); return true; }
  failed.push(name + (detail ? ' · ' + detail : ''));
  console.log('FAIL', name + (detail ? ' · ' + detail : ''));
  return false;
}

const run = await launch();
try {
  const p = run.page;
  await boot(p);
  await p.locator('#tutorialSkip').click({ timeout: 2000 }).catch(() => { });

  /* 整段分析在页面内跑一次：把地图数据拉进浏览器比逐格 evaluate 快得多，
     也避免成千上万次跨进程往返。 */
  const records = await p.evaluate((arg) => {
    const { INDOORS, TERRACE, SIZE, ROOM_R, MIN_STAIR_GAP } = arg;
    const M = window.__MOSS__;
    const out = [];
    const add = (name, cond, detail) => {
      const c = !!cond;
      out.push({ name, cond: c, detail: detail || '' });
      return c;      // 少数几处要靠返回值决定要不要继续分析该层
    };
    const key = t => t[0] + ',' + t[1];
    const text = list => list.map(t => '(' + t[0] + ',' + t[1] + ')').join(' ');

    /* 只取契约声明的字段，避免记录里混入函数导致序列化失败 */
    const slimStair = s => ({
      id: s.id, x: s.x, y: s.y, kind: s.kind, to: s.to, tx: s.tx, ty: s.ty, label: s.label,
      stand: Array.isArray(s.stand) ? s.stand.map(q => [q[0], q[1]]) : []
    });
    const slimProp = it => ({
      id: it.id, kind: it.kind, x: it.x, y: it.y,
      stand: Array.isArray(it.stand) ? it.stand.map(q => [q[0], q[1]]) : []
    });

    /* —— 探针面（契约 §9）—— */
    const missing = ['PALACE_FLOORS', 'PALACE_STAIRS', 'palaceFloorOf', 'palaceStairFrom']
      .filter(k => M[k] === undefined || M[k] === null);
    add('宫殿探针齐全（PALACE_FLOORS / PALACE_STAIRS / palaceFloorOf / palaceStairFrom）',
      missing.length === 0, missing.length ? '缺失：' + missing.join('、') : '');

    const floors = Array.isArray(M.PALACE_FLOORS) ? M.PALACE_FLOORS : [];
    /* 楼层表只登记真正的楼层；露台是三层可达的局部场地，不必是楼层 */
    const declared = floors.map(f => f && f.sceneId).filter(Boolean);
    const noFloor = INDOORS.filter(s => declared.indexOf(s) < 0);
    add('楼层表覆盖三层室内场景', noFloor.length === 0,
      noFloor.length ? 'PALACE_FLOORS 未声明：' + noFloor.join('、') + '（现有 ' + JSON.stringify(declared) + '）' : '');
    if (typeof M.palaceFloorOf === 'function') {
      const noHit = INDOORS.filter(s => { try { return !M.palaceFloorOf(s); } catch (e) { return true; } });
      add('palaceFloorOf 对三层室内场景都能认领楼层', noHit.length === 0,
        noHit.length ? '认不出：' + noHit.join('、') : '');
    }
    const badShape = floors.filter(f => !f || typeof f.sceneId !== 'string' || typeof f.order !== 'number' || !f.label);
    add('楼层表字段形状完整（id/label/sceneId/order）', badShape.length === 0,
      badShape.length ? '缺字段的楼层：' + JSON.stringify(badShape) : '');

    const stairs = (Array.isArray(M.PALACE_STAIRS) ? M.PALACE_STAIRS : []).map(slimStair);
    const stairScene = {};   // 楼梯 id → 所属场景（先用 palaceStairFrom 归属，探针缺失时退回 INTERACTABLES）
    for (const id of INDOORS.concat([TERRACE])) {
      let owned = null;
      if (typeof M.palaceStairFrom === 'function') {
        try { owned = M.palaceStairFrom(id); } catch (e) { owned = null; }
      }
      if (Array.isArray(owned)) {
        for (const s of owned) if (s && s.id) stairScene[s.id] = id;
      } else {
        for (const it of (M.INTERACTABLES[id] || [])) {
          if (it.kind === 'palaceStair' && it.id) stairScene[it.id] = id;
        }
      }
    }
    const stairsIn = id => stairs.filter(s => stairScene[s.id] === id);

    /* —— 地图工具 —— */
    const structural = id => {
      const map = M.MAPS[id];
      if (!map) return 'MAPS 里没有 ' + id;
      if (!map.indoor && id !== TERRACE) return id + ' 不是室内场景';
      if (!Array.isArray(map.solid) || map.solid.length < map.w) return 'solid 外层长度不足（期望 solid[x][y]，w=' + map.w + '）';
      for (let x = 0; x < map.w; x++) {
        if (!map.solid[x] || map.solid[x].length < map.h) return 'solid[' + x + '] 长度 < h=' + map.h + '，solid 必须是 [x][y]';
      }
      return '';
    };
    const free = (map, x, y) =>
      x >= 0 && y >= 0 && x < map.w && y < map.h && map.solid[x][y] === 0;
    const flood = (map, starts) => {
      const seen = new Set(), q = [];
      for (const s of starts) {
        if (!free(map, s[0], s[1]) || seen.has(key(s))) continue;
        seen.add(key(s)); q.push(s);
      }
      let head = 0;
      while (head < q.length) {
        const c = q[head++];
        for (const n of [[c[0] + 1, c[1]], [c[0] - 1, c[1]], [c[0], c[1] + 1], [c[0], c[1] - 1]]) {
          if (seen.has(key(n)) || !free(map, n[0], n[1])) continue;
          seen.add(key(n)); q.push(n);
        }
      }
      return seen;
    };
    /* 走不到的坐标明细（最多列 8 个，避免刷屏） */
    const missed = (reach, tiles) => tiles.filter(t => !reach.has(key(t)));
    const missText = list => list.length > 8
      ? text(list.slice(0, 8)) + ' …共 ' + list.length + ' 格'
      : text(list);
    /* “被围出的房间格”：±R 格内横向与纵向都被实心挡住，说明在家具围出的小空间里，
       而不是站在大厅中央。四邻域连通，大厅中轴永远不会被计入。 */
    const roomTiles = map => {
      const set = new Set();
      for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) {
        if (!free(map, x, y)) continue;
        let hB = false, vB = false;
        for (let d = 1; d <= ROOM_R && !(hB && vB); d++) {
          if (!hB && (!free(map, x - d, y) || !free(map, x + d, y))) hB = true;
          if (!vB && (!free(map, x, y - d) || !free(map, x, y + d))) vB = true;
        }
        if (hB && vB) set.add(key([x, y]));
      }
      return set;
    };

    /* —— 每层：入口落点可达性 + 无孤立区域 + 房间 —— */
    for (const id of INDOORS) {
      const bad = structural(id);
      if (!add('场景存在且 solid 结构为 [x][y]：' + id, bad === '', bad)) continue;
      const map = M.MAPS[id];

      add('尺寸符合契约 §3：' + id, map.w === SIZE[id][0] && map.h === SIZE[id][1],
        '实际 ' + map.w + '×' + map.h + ' / 期望 ' + SIZE[id][0] + '×' + SIZE[id][1]);

      const doors = map.doors || [];
      const own = stairsIn(id);
      /* 入口落点 = 通往别层的楼梯落点（从别的层走进来落在这里）∪ 每扇门的内侧落点 */
      const arrivals = stairs.filter(s => s.to === id).map(s => [s.tx, s.ty]);
      const doorEntries = [];
      for (const d of doors) {
        const e = d.enter || (d.stand && d.stand[0]);
        if (e) doorEntries.push([e.x, e.y]);
      }
      const starts = [];
      for (const s of arrivals.concat(doorEntries)) {
        if (s[0] === undefined || s[0] === null) continue;
        if (!starts.some(t => t[0] === s[0] && t[1] === s[1])) starts.push(s);
      }
      if (!add(id + ' 能确定入口落点', starts.length > 0,
        '既没有门内侧落点，也没有别的层通来的楼梯落点')) continue;

      const badStart = starts.filter(s => !free(map, s[0], s[1]));
      add(id + ' 全部入口落点可走', badStart.length === 0,
        '落在实心格里：' + missText(badStart));
      if (badStart.length === starts.length) {
        add(id + ' 入口可达性（跳过：没有可走的入口落点）', false, '所有入口落点都被家具或墙占了');
        continue;
      }

      const reach = flood(map, starts);

      /* 1a 每一扇门的内侧站位 */
      add(id + ' 至少有一扇门', doors.length > 0, 'doors 为空');
      for (const d of doors) {
        const stand = Array.isArray(d.stand) ? d.stand : [];
        const blocked = stand.filter(t => !free(map, t[0], t[1]));
        const un = missed(reach, stand.filter(t => free(map, t[0], t[1])));
        add(id + ' · 门 ' + d.id + ' 内侧站位从入口可达', blocked.length === 0 && un.length === 0,
          (blocked.length ? '不可走：' + missText(blocked) + '；' : '') +
          (un.length ? '从入口 ' + text(starts) + ' 走不通：' + missText(un) : '') +
          (blocked.length === 0 && un.length === 0 ? '' : '门洞在 (' + d.x + ',' + d.y + ')'));
      }
      /* 1b 每一个交互物的站位 */
      const props = (M.INTERACTABLES[id] || []).map(slimProp);
      add(id + ' 每个交互物都声明了站位 stand', props.every(it => it.stand.length > 0),
        '缺 stand 的交互物：' + props.filter(it => it.stand.length === 0).map(it => it.id + '(' + it.kind + ')').join('、'));
      for (const it of props.filter(q => q.stand.length)) {
        const blocked = it.stand.filter(t => !free(map, t[0], t[1]));
        const un = missed(reach, it.stand.filter(t => free(map, t[0], t[1])));
        add(id + ' · 交互物 ' + it.id + '(' + it.kind + ') 站位从入口可达', blocked.length === 0 && un.length === 0,
          (blocked.length ? '不可走：' + missText(blocked) + '；' : '') +
          (un.length ? '从入口 ' + text(starts) + ' 走不通：' + missText(un) : '') +
          '（实体在 (' + it.x + ',' + it.y + '））');
      }
      /* 1c 每一个楼梯的触发格 */
      for (const s of own) {
        const blocked = s.stand.filter(t => !free(map, t[0], t[1]));
        const un = missed(reach, s.stand.filter(t => free(map, t[0], t[1])));
        add(id + ' · 楼梯 ' + s.id + ' 触发格从入口可达', s.stand.length > 0 && blocked.length === 0 && un.length === 0,
          (s.stand.length === 0 ? 'stand 为空；' : '') +
          (blocked.length ? '触发格不可走：' + missText(blocked) + '；' : '') +
          (un.length ? '从入口 ' + text(starts) + ' 走不通：' + missText(un) : ''));
      }

      /* 每个入口落点都不是死区：站着不动也能走到本层任意一栋楼梯 */
      const ownStand = own.flatMap(s => s.stand);
      if (ownStand.length) {
        for (const s of starts) {
          if (!free(map, s[0], s[1])) continue;
          const one = flood(map, [s]);
          const un = missed(one, ownStand);
          add(id + ' · 落点 ' + key(s) + ' 不是死区（可走到本层楼梯）', un.length === 0,
            un.length ? '走不到这些楼梯触发格：' + missText(un) : '');
        }
      }

      /* 4 没有孤立区域 + 确实围出了房间 */
      let walkCount = 0;
      const orphans = [];
      for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) {
        if (!free(map, x, y)) continue;
        walkCount++;
        if (!reach.has(x + ',' + y)) orphans.push([x, y]);
      }
      add(id + ' 没有走不到的孤立可走格', orphans.length === 0,
        orphans.length ? '从入口 ' + text(starts) + ' 走不通的孤立格：' + missText(orphans) : '');
      const rooms = roomTiles(map);
      add(id + ' 围出了房间（家具圈出的封闭格 > 0）', rooms.size > 0,
        '整层没有任何被实心家具围出的格，像一个空大厅');
      const ratio = walkCount ? rooms.size / walkCount : 0;
      add(id + ' 房间格占可走格比例 > 5%（整层不能空荡）', ratio > 0.05,
        '房间格 ' + rooms.size + ' / 可走格 ' + walkCount + ' = ' + (ratio * 100).toFixed(1) + '%');
    }

    /* —— 2 楼梯数据契约 —— */
    add('PALACE_STAIRS 非空', stairs.length > 0, '一条楼梯都没有');
    for (const s of stairs) {
      const from = stairScene[s.id] || '未知场景';
      const tag = '楼梯 ' + s.id + '（' + from + ' → ' + (s.to || '?') + '）';
      /* 契约 §6.1 给的是 INTERACTABLES 里那条数据的形状；PALACE_STAIRS 是楼层表导出的
         副本，不强制重复 kind，所以这里核对“来源场景里确实登记着它”。 */
      const reg = ((M.INTERACTABLES[from] || []).filter(it => it.id === s.id)[0]) || null;
      add(tag + ' 在来源场景登记为 palaceStair 交互物', !!reg && reg.kind === 'palaceStair',
        reg ? '来源场景 ' + from + ' 里 kind=' + reg.kind
          : '来源场景 ' + from + ' 的 INTERACTABLES 里找不到 id=' + s.id);
      add(tag + ' stand 非空', Array.isArray(s.stand) && s.stand.length > 0, 'stand=' + JSON.stringify(s.stand));
      add(tag + ' 目标场景存在于 MAPS', !!M.MAPS[s.to], 'to=' + s.to);
      if (M.MAPS[s.to]) {
        const map = M.MAPS[s.to];
        add(tag + ' 落点 (' + s.tx + ',' + s.ty + ') 在目标场景可走',
          free(map, s.tx, s.ty), s.tx + ',' + s.ty + ' solid=' +
          (!map.solid[s.tx] || !map.solid[s.tx][s.ty] ? '越界' : map.solid[s.tx][s.ty]));
      }
      if (Array.isArray(s.stand) && s.stand.length) {
        const near = s.stand.map(t => ({ t, d: Math.abs(t[0] - s.tx) + Math.abs(t[1] - s.ty) }))
          .filter(r => r.d < MIN_STAIR_GAP);
        add(tag + ' 落点与每个触发格相距 ≥ ' + MIN_STAIR_GAP + ' 格',
          near.length === 0,
          near.length ? '距离不足：' + near.map(r => r.t[0] + ',' + r.t[1] + '→' + s.tx + ',' + s.ty + '（' + r.d + ' 格）').join('、')
            + '，上楼落地即可能触发下楼' : '');
      }
      /* 反向成对：目标场景里必须有一条楼梯指回本层 */
      const back = stairs.filter(o => o.to === from && o.id !== s.id);
      add(tag + ' 目标场景有反向楼梯能回来', back.length > 0,
        from + ' 里找不到任何 to 指回 ' + from + ' 的楼梯（单向死路）');
      if (back.length) {
        const bmap = M.MAPS[s.to];
        const backStand = back.flatMap(o => o.stand || []);
        const reach2 = bmap ? flood(bmap, [[s.tx, s.ty]]) : new Set();
        const un = missed(reach2, backStand.filter(t => free(bmap, t[0], t[1])));
        add(tag + ' 落点能走到反向楼梯的触发格', !bmap || un.length === 0,
          un.length ? '从 (' + s.tx + ',' + s.ty + ') 走不通到：' + missText(un) : '');
      }
    }

    /* —— 3 大楼梯逐层对齐 ——
       不变量是「三层共用同一条楼梯坐标带」，不是「各层的触发格集合完全相同」：
       一层只有上行梯、三层只有下行梯，集合本就不同（实现方与契约均如此）。
       真正的对齐含义：所有 palaceStair 触发点都落在同一段楼梯上，
       且同一层内不同方向的触发点分处楼梯两头（否则 findInteractable 的
       「正前方优先」会在两个方向之间挑错）。 */
    const tileSets = {};
    const stairTiles = {};
    for (const id of INDOORS) {
      const list = (M.INTERACTABLES[id] || []).filter(it => it.kind === 'palaceStair');
      const set = Array.from(new Set(list.map(it => it.x + ',' + it.y))).sort();
      tileSets[id] = set;
      stairTiles[id] = list;
      add(id + ' 声明了 palaceStair', set.length > 0, '没有 palaceStair 交互物');
    }
    const allTiles = Array.from(new Set(Object.values(tileSets).flat()));
    const xs = allTiles.map(t => +t.split(',')[0]), ys = allTiles.map(t => +t.split(',')[1]);
    const bandOk = xs.length > 0 && (Math.max(...xs) - Math.min(...xs)) <= 8 && ys.every(y => y === ys[0]);
    add('所有层的楼梯触发点落在同一条楼梯带上（y 相同，x 跨度 ≤8 格）', bandOk,
      '各层触发点 ' + Object.keys(tileSets).map(k => k + ':' + tileSets[k].join('/')).join('  '));
    for (const id of INDOORS) {
      const list = stairTiles[id];
      if (list.length < 2) continue;
      const dirs = list.map(it => it.dir || '').sort().join(',');
      add(id + ' 同层不同方向的触发点分处楼梯两头（不会挑错方向）',
        list[0].x !== list[1].x && dirs.indexOf('up') >= 0 && dirs.indexOf('down') >= 0,
        '触发点 ' + list.map(it => it.id + '@' + it.x + ',' + it.y).join(' '));
    }

    /* —— 5 露台栏杆 —— */
    const tbad = structural(TERRACE);
    if (add('场景存在且 solid 结构为 [x][y]：' + TERRACE, tbad === '', tbad)) {
      const map = M.MAPS[TERRACE];
      add('尺寸符合契约 §3：' + TERRACE, map.w === SIZE[TERRACE][0] && map.h === SIZE[TERRACE][1],
        '实际 ' + map.w + '×' + map.h + ' / 期望 ' + SIZE[TERRACE][0] + '×' + SIZE[TERRACE][1]);
      /* 唯一的合法开口是 exits 指向的室内门（契约 §7：露台 → 三层走 exits）。
         installIndoorDoors 会把门洞写进 solid=0，所以这里按“除合法出口外全实心”验收，
         其余四边任何一格漏风都算假门。 */
      const exits = map.exits || [];
      const opening = new Set(exits.map(e => e.x + ',' + e.y));
      const holes = [];
      for (let x = 0; x < map.w; x++) {
        for (const y of [0, map.h - 1]) {
          if (map.solid[x][y] !== 1 && !opening.has(x + ',' + y)) holes.push([x, y]);
        }
      }
      for (let y = 1; y < map.h - 1; y++) {
        for (const x of [0, map.w - 1]) {
          if (map.solid[x][y] !== 1 && !opening.has(x + ',' + y)) holes.push([x, y]);
        }
      }
      add(TERRACE + ' 临空边是实心碰撞（只留合法出口）', holes.length === 0,
        holes.length ? '这些栏杆格可以走出去：' + missText(holes) : '');
      add(TERRACE + ' 合法出口数量有限（没有假门）', opening.size <= 2,
        '边缘开口 ' + opening.size + ' 处：' + text(Array.from(opening).map(k => k.split(',').map(Number))));
      const voidDoors = exits.filter(e => !M.MAPS[e.to] || !free(M.MAPS[e.to], e.tx, e.ty));
      add(TERRACE + ' 每个出口都通向真实可走的场景（没有假门）', exits.length > 0 && voidDoors.length === 0,
        exits.length === 0 ? '没有任何出口，玩家从露台回不去'
          : '落点无效：' + voidDoors.map(e => e.to + ' @' + e.tx + ',' + e.ty).join('、'));
      add(TERRACE + ' 没有按 doors 安装的洞（户外栏杆不画假门）', !(map.doors || []).length,
        'doors：' + (map.doors || []).map(d => d.id + '@' + d.x + ',' + d.y).join('、'));
      if (exits.length && M.MAPS[exits[0].to]) {
        /* 起点是本场景这一侧的门口格 e.x/e.y；e.tx/e.ty 是对面场景里的落点，
           在户外图上越界，不能拿来当洪水填充的种子。 */
        const reach = flood(map, exits.map(e => [e.x, e.y]));
        const stand = (M.INTERACTABLES[TERRACE] || []).flatMap(it => Array.isArray(it.stand) ? it.stand : []);
        const un = missed(reach, stand.filter(t => free(map, t[0], t[1])));
        add(TERRACE + ' 从门口能走到全部交互物站位', un.length === 0,
          un.length ? '走不通：' + missText(un) : '');
      }
    }

    return out;
  }, { INDOORS, TERRACE, SIZE, ROOM_R, MIN_STAIR_GAP });

  for (const r of records) ok(r.name, r.cond, r.detail);

  /* 截图：功能已实现时能直接看到各层与露台 */
  fs.mkdirSync('output/playwright', { recursive: true });
  for (const id of INDOORS.concat([TERRACE])) {
    const has = await p.evaluate(s => !!(window.__MOSS__.MAPS[s]), id);
    if (!has) { console.log('  – 场景 ' + id + ' 尚未实现，跳过截图'); continue; }
    await p.evaluate(s => { window.__MOSS__.closeWindow(); window.__MOSS__.devSwitchScene(s, 2, 2); }, id);
    await p.waitForTimeout(320);
    await p.locator('canvas').first().screenshot({ path: 'output/playwright/palace-' + id + '.png' });
  }

  ok('无控制台错误', run.errors.length === 0, run.errors.slice(0, 5).join(' | '));
} finally {
  await run.browser.close();
}

console.log('\n================ 宫城布局契约 ================');
console.log(`通过 ${checks} 项，失败 ${failed.length} 项`);
if (failed.length) {
  console.log('\n--- 失败明细 ---');
  failed.forEach(f => console.log('  ✗ ' + f));
}
console.log('==============================================\n');
process.exitCode = failed.length ? 1 : 0;
