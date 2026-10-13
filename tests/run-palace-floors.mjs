/* 白蔷薇宫城 P1 · 楼层通行端到端（测试组自有文件，验收口径见 docs/palace-p1-contract.md §11）
 *
 * 全程真按键：城市城堡门 → 宫苑 → 一层门厅 → 二层王座厅 → 三层起居 → 翼楼露台 → 原路返回。
 * 站位用 devSwitchScene 直接放到交互物的 stand 格，省掉长距离寻路；
 * 触发动作一律是真实按键（page.keyboard.press('e')），不调 activateInteractable 抄近路。
 *
 * 跑法：cd 项目根目录 && node tests/run-palace-floors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, boot } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(ROOT, 'output', 'playwright');
const SINGLE_FILE = pathToFileURL(path.join(ROOT, '苔芽农场-单文件版.html')).href;
fs.mkdirSync(SHOTS, { recursive: true });

/* 契约 §2 的五个宫城场景；§6 的门类交互物不计入“每层有内容” */
const FLOOR_SCENES = ['palace_grounds', 'palace_f1', 'city_castle', 'palace_f3', 'palace_terrace'];
/* §2 的楼层编号只覆盖三层室内，宫苑与露台是户外，palaceFloorOf 对它们返回 null 是对的 */
const NUMBERED_FLOORS = ['palace_f1', 'city_castle', 'palace_f3'];
const DOOR_KINDS = ['indoorExit', 'indoorEntrance', 'palaceStair'];

let checks = 0;
const failed = [];
const warned = [];
function T(name, cond, detail) {
  checks++;
  if (cond) console.log('  ✓ ' + name + (detail ? '  ' + detail : ''));
  else { failed.push(name); console.log('  ✗ ' + name + '\n      ' + (detail || '（无详情）')); }
  return !!cond;
}
/* 实现方可能没做的部分走警告，不计入失败（朝向这类可选接线） */
function W(msg) { warned.push(msg); console.log('  ! ' + msg); }
function section(title) { console.log('\n── ' + title); }
const describe = spec => 'kind=' + (spec.kind || (spec.kindIn || []).join('/')) +
  (spec.to ? ' → ' + spec.to : '') + (spec.service ? ' service=' + spec.service : '');

/* ---------- 页面侧小工具 ---------- */
const where = p => p.evaluate(() => {
  const M = window.__MOSS__;
  return { scene: M.state.sceneId, x: M.state.player.x, y: M.state.player.y, face: M.state.player.face };
});
const hasScene = (p, scene) => p.evaluate(s =>
  !!(window.__MOSS__.MAPS[s] && window.__MOSS__.INTERACTABLES[s]), scene);
const walkable = (p, scene, x, y) => p.evaluate(([s, tx, ty]) =>
  !window.__MOSS__.isSolid(s, tx, ty), [scene, x, y]);

async function pose(p, scene, x, y) {
  await p.evaluate(([s, tx, ty]) => {
    const M = window.__MOSS__; M.closeWindow(); M.devSwitchScene(s, tx, ty);
  }, [scene, x, y]);
  await p.waitForTimeout(200);
}

/* 按契约 §6.1 的数据形状找交互物：{id,x,y,stand,kind,to,tx,ty,label} */
function findIt(p, scene, spec) {
  return p.evaluate(({ scene, spec }) => {
    const list = window.__MOSS__.INTERACTABLES[scene] || [];
    const hit = list.filter(o => (!spec.kind || o.kind === spec.kind) &&
      (!spec.kindIn || spec.kindIn.indexOf(o.kind) >= 0) &&
      (!spec.to || o.to === spec.to) && (!spec.service || o.service === spec.service))[0];
    if (!hit) return null;
    return {
      id: hit.id, kind: hit.kind, to: hit.to || null, doorId: hit.doorId || null,
      tx: hit.tx, ty: hit.ty, x: hit.x, y: hit.y, label: hit.label || '',
      stand: (hit.stand || []).map(s => [s[0], s[1]])
    };
  }, { scene, spec });
}

/* 不认 kind，只认“去哪”：先找 to=目标的交互物，再按门定义反查 doorId 对应的门口交互物。
   门系统的 exit_* 只有 doorId、没有 to，两种都兜住，免得把可达的门判成不可达。 */
function findDoorTo(p, scene, to) {
  return p.evaluate(({ scene, to }) => {
    const M = window.__MOSS__, list = M.INTERACTABLES[scene] || [];
    const pack = (o, how) => ({
      id: o.id, kind: o.kind, to: o.to || null, doorId: o.doorId || null,
      tx: o.tx, ty: o.ty, x: o.x, y: o.y, label: o.label || '', how,
      stand: (o.stand || []).map(s => [s[0], s[1]])
    });
    const byTo = list.filter(o => o.kind !== 'palaceStair' && o.to === to)[0];
    if (byTo) return pack(byTo, 'to=' + to);
    const door = ((M.MAPS[scene] || {}).doors || []).filter(d => d.to === to)[0];
    if (door) {
      const byDoor = list.filter(o => o.doorId === door.id)[0];
      if (byDoor) return pack(byDoor, 'doorId=' + door.id);
    }
    return null;
  }, { scene, to });
}

/* 真按一次 E，等 doSwitchScene 的淡入淡出（200ms + 30ms）走完 */
async function pressE(p) {
  await p.keyboard.press('e');
  await p.waitForTimeout(520);
  return where(p);
}
const winOpen = p => p.evaluate(() => !document.getElementById('windowLayer').hidden);
async function closeWin(p) {
  if (!(await winOpen(p))) return;
  await p.evaluate(() => window.__MOSS__.closeWindow());
  await p.waitForTimeout(150);
}

/* ---------- 一段跨层：站到触发物 → 真按 E → 校验落点 ---------- */
async function runLeg(p, leg, tag) {
  const label = tag + ' ' + leg.from + ' → ' + leg.to;
  if (!(await hasScene(p, leg.from))) {
    T(label, false, '场景 ' + leg.from + ' 还没进 MAPS/INTERACTABLES（功能未实现？）');
    return null;
  }
  let it = await findIt(p, leg.from, leg.find);
  if (!it && leg.tolerant) it = await findDoorTo(p, leg.from, leg.to);
  if (!it) {
    T(label, false, leg.from + ' 里找不到 ' + describe(leg.find) +
      ' 的交互物' + (leg.tolerant ? '（也没有任何通往 ' + leg.to + ' 的门）' : ''));
    return null;
  }
  if (!it.stand.length) {
    T(label, false, it.id + '（' + it.kind + '）没有 stand 站位，站不上就触发不了');
    return null;
  }
  const stand = it.stand[0];
  if (!(await walkable(p, leg.from, stand[0], stand[1]))) {
    T(label, false, it.id + ' 的站位 (' + stand + ') 不是可行走格');
    return null;
  }
  await pose(p, leg.from, stand[0], stand[1]);
  const landed = await pressE(p);
  const ok = T(label, landed.scene === leg.to,
    landed.scene === leg.to
      ? it.id + '（' + it.kind + (it.how ? ' · ' + it.how : '') + '）站位 (' + stand + ') 按 E · 落点 (' +
        landed.x + ',' + landed.y + ') 面朝 ' + landed.face
      : '按 E 后仍在 ' + landed.scene + ' (' + landed.x + ',' + landed.y + ') · 触发物 ' + it.id);
  /* 契约 §7 写死了某些门的 kind，实现用了等价的其他 kind 时只警告 */
  if (ok && leg.expectKind && it.kind !== leg.expectKind)
    W(label + ' 用的是 ' + it.kind + '，契约 §7 写的是 ' + leg.expectKind + '（可达即通过，记此差异）');
  return { ok, landed, it };
}

/* 出门：优先按 E 用室内侧的交互物出门（门系统给的 indoorExit，或任何 to=目标 的门牌）；
   没有交互物才退回“走过门槛即切”的真键盘走法。 */
async function leaveRoom(p, scene, to, tag) {
  const label = tag + ' ' + scene + ' → ' + to;
  if (!(await hasScene(p, scene))) {
    T(label, false, '场景 ' + scene + ' 还没进 MAPS/INTERACTABLES（功能未实现？）');
    return false;
  }
  const it = (await findIt(p, scene, { kind: 'indoorExit' })) || (await findDoorTo(p, scene, to));
  if (it && it.stand.length) {
    await pose(p, scene, it.stand[0][0], it.stand[0][1]);
    const landed = await pressE(p);
    if (landed.scene === to) {
      T(label, true, '按 E 走 ' + it.id + '（' + it.kind + '）· 落点 (' + landed.x + ',' + landed.y + ')');
      return true;
    }
  }
  /* 兜底：站到门槛旁的可行走格，用方向键真的走出去。门槛不一定在房间边上，
     所以逐个试它四个正交邻居，谁能让场景切走就算谁。 */
  const door = await p.evaluate(s => {
    const M = window.__MOSS__, map = M.MAPS[s], e = (map.exits || [])[0];
    if (!e || e.to === undefined) return null;
    const dirs = { left: [-1, 0], up: [0, -1], right: [1, 0], down: [0, 1] };
    const sides = Object.keys(dirs).filter(k => {
      const d = dirs[k];
      return !M.isSolid(s, e.x + d[0], e.y + d[1]);
    }).map(k => ({ key: k, at: [e.x + dirs[k][0], e.y + dirs[k][1]] }));
    return { exit: [e.x, e.y], to: e.to, sides };
  }, scene);
  if (!door || door.to !== to || !door.sides.length) {
    T(label, false, scene + ' 既没有能按 E 出门的交互物，也没有通往 ' + to + ' 的门槛 exits');
    return false;
  }
  for (const side of door.sides) {
    await pose(p, scene, side.at[0], side.at[1]);
    await p.keyboard.down(side.key);
    try {
      await p.waitForFunction(want => window.__MOSS__.state.sceneId === want, to, { timeout: 1600 });
    } catch (e) { /* 这个方向没走出去就换下一个 */ }
    await p.keyboard.up(side.key);
    await p.waitForTimeout(260);
    const landed = await where(p);
    if (landed.scene === to) {
      T(label, true, '按 ' + side.key + ' 走过门槛 ' + door.exit + ' · 落点 (' + landed.x + ',' + landed.y + ')');
      return true;
    }
  }
  T(label, false, '在门槛 ' + door.exit + ' 的 ' + door.sides.length + ' 个可行走邻居上都按了方向键，仍留在 ' + scene);
  return false;
}

async function shot(p, scene, name) {
  if (!(await hasScene(p, scene))) { W('场景 ' + scene + ' 不存在，跳过截图 ' + name); return; }
  await p.waitForTimeout(260);
  await p.screenshot({ path: path.join(SHOTS, 'palace-' + name + '.png') })
    .catch(e => W('截图失败 ' + name + '：' + e.message));
}

/* ---------- 一次完整跑（源码入口与打包版共用同一套断言） ---------- */
async function runSuite(url, tag, tagShort) {
  const run = await launch(url ? { url } : {});
  try {
    const p = run.page;
    await boot(p);
    await p.locator('#tutorialSkip').click().catch(() => { });

    section(tag + ' §0 探针与场景登记');
    const probe = await p.evaluate(ids => {
      const M = window.__MOSS__;
      const out = {};
      ids.forEach(id => {
        out[id] = {
          map: !!(M.MAPS[id] && M.INTERACTABLES[id]),
          floor: typeof M.palaceFloorOf === 'function' ? M.palaceFloorOf(id) : null,
          stairs: typeof M.palaceStairFrom === 'function' && M.palaceStairFrom(id) ? M.palaceStairFrom(id).length : null
        };
      });
      return {
        hasFloors: Array.isArray(M.PALACE_FLOORS),
        hasStairs: Array.isArray(M.PALACE_STAIRS),
        hasFloorOf: typeof M.palaceFloorOf === 'function',
        hasStairFrom: typeof M.palaceStairFrom === 'function',
        scenes: out
      };
    }, FLOOR_SCENES);
    T(tag + ' 对外探针 PALACE_FLOORS / PALACE_STAIRS 存在', probe.hasFloors && probe.hasStairs,
      JSON.stringify([probe.hasFloors, probe.hasStairs]));
    T(tag + ' 对外探针 palaceFloorOf / palaceStairFrom 是函数', probe.hasFloorOf && probe.hasStairFrom,
      JSON.stringify([probe.hasFloorOf, probe.hasStairFrom]));
    const missing = FLOOR_SCENES.filter(id => !probe.scenes[id].map);
    T(tag + ' 五个宫城场景都已登记（§2）', missing.length === 0,
      missing.length ? '未登记：' + missing.join(' ') : FLOOR_SCENES.join(' '));
    T(tag + ' palaceFloorOf 能认出一/二/三层',
      NUMBERED_FLOORS.every(id => !probe.scenes[id].map || !!probe.scenes[id].floor),
      NUMBERED_FLOORS.map(id => id + '=' + JSON.stringify(probe.scenes[id].floor && probe.scenes[id].floor.order)).join(' '));
    T(tag + ' palaceFloorOf 对户外宫苑/露台返回 null（不占楼层号）',
      FLOOR_SCENES.filter(id => NUMBERED_FLOORS.indexOf(id) < 0).every(id => !probe.scenes[id].floor),
      FLOOR_SCENES.filter(id => NUMBERED_FLOORS.indexOf(id) < 0).map(id => id + '=' + JSON.stringify(probe.scenes[id].floor)).join(' '));

    section(tag + ' §1 完整游览链（真按键）');
    /* 城市通行证：宫苑的唯一入口在城里，这里只给通行证，不测办证流程本身 */
    await p.evaluate(() => {
      const M = window.__MOSS__, s = M.state;
      s.exploration.city = true;
      s.sceneId = 'city'; s.player = { x: 320, y: 165, face: 'up' };
      M.startGame(s);
    });
    await p.waitForTimeout(260);

    const gateSpec = { kindIn: ['palaceGate', 'cityDoor'], to: 'palace_grounds' };
    const gate = await findIt(p, 'city', gateSpec);
    T(tag + ' 城市城堡门已改成通往 palace_grounds（§7.1）', !!gate,
      gate ? gate.id + ' / ' + gate.kind + ' → ' + gate.to : 'city 里没有指向 palace_grounds 的门');
    if (gate) T(tagShort + ' 城堡门 kind 是契约约定的 palaceGate', gate.kind === 'palaceGate', '实际 kind=' + gate.kind);
    await runLeg(p, { from: 'city', to: 'palace_grounds', find: gateSpec }, tagShort);
    await shot(p, 'palace_grounds', 'grounds');

    await runLeg(p, {
      from: 'palace_grounds', to: 'palace_f1',
      find: { kind: 'indoorEntrance', to: 'palace_f1' }, tolerant: true, expectKind: 'indoorEntrance'
    }, tagShort);
    await shot(p, 'palace_f1', 'f1');

    await runLeg(p, { from: 'palace_f1', to: 'city_castle', find: { kind: 'palaceStair', to: 'city_castle' } }, tagShort);
    await shot(p, 'city_castle', 'f2');

    await runLeg(p, { from: 'city_castle', to: 'palace_f3', find: { kind: 'palaceStair', to: 'palace_f3' } }, tagShort);
    await shot(p, 'palace_f3', 'f3');

    await runLeg(p, {
      from: 'palace_f3', to: 'palace_terrace',
      find: { kind: 'indoorEntrance', to: 'palace_terrace' }, tolerant: true, expectKind: 'indoorEntrance'
    }, tagShort);
    await shot(p, 'palace_terrace', 'terrace');
    await leaveRoom(p, 'palace_terrace', 'palace_f3', tagShort + ' 露台回来');
    await shot(p, 'palace_f3', 'f3-back');

    section(tag + ' §2 原路返回（真按键）');
    await runLeg(p, { from: 'palace_f3', to: 'city_castle', find: { kind: 'palaceStair', to: 'city_castle' } }, tagShort);
    await shot(p, 'city_castle', 'f2-down');
    await runLeg(p, { from: 'city_castle', to: 'palace_f1', find: { kind: 'palaceStair', to: 'palace_f1' } }, tagShort);
    await leaveRoom(p, 'palace_f1', 'palace_grounds', tagShort + ' 主门');
    if (await findDoorTo(p, 'palace_grounds', 'city'))
      await runLeg(p, { from: 'palace_grounds', to: 'city', find: { to: 'city' }, tolerant: true }, tagShort);
    else
      await leaveRoom(p, 'palace_grounds', 'city', tagShort + ' 宫苑回城');
    await shot(p, 'city', 'back-city');

    section(tag + ' §3 落点不弹回 / 朝向对应（§6.1 落点距触发格 ≥3）');
    const STAIRS = [
      ['palace_f1', 'city_castle'], ['city_castle', 'palace_f3'],
      ['palace_f3', 'city_castle'], ['city_castle', 'palace_f1']
    ];
    for (const pair of STAIRS) {
      const from = pair[0], to = pair[1];
      const label = tagShort + ' ' + from + ' → ' + to;
      const res = await runLeg(p, { from, to, find: { kind: 'palaceStair', to } }, tagShort);
      if (!res || !res.ok) continue;
      const landed = res.landed, stair = res.it;
      /* 落点必须离开目标层所有楼梯的站位，否则站定就自动上下楼 */
      const far = await p.evaluate(([scene, x, y]) => {
        const M = window.__MOSS__, list = (M.INTERACTABLES[scene] || []).filter(o => o.kind === 'palaceStair');
        const ds = [];
        list.forEach(o => (o.stand || []).forEach(s => ds.push(Math.abs(s[0] - x) + Math.abs(s[1] - y))));
        return ds.length ? Math.min.apply(null, ds) : null;
      }, [to, landed.x, landed.y]);
      T(label + ' 落点距本层楼梯站位 ≥3 格', far !== null && far >= 3,
        '落点 (' + landed.x + ',' + landed.y + ') 到最近站位 ' + far + ' 格');
      /* 连按两次 E（手快）不能弹回上一层 */
      let opened = false;
      for (let i = 0; i < 2; i++) {
        await p.keyboard.press('e');
        await p.waitForTimeout(380);
        if (await winOpen(p)) { opened = true; await closeWin(p); }
      }
      const after = await where(p);
      T(label + ' 落点连按两次 E 不弹回', after.scene === to,
        '连按后 → ' + after.scene + ' (' + after.x + ',' + after.y + ')' + (opened ? ' · 期间弹出了窗口' : ''));
      /* 朝向：没做朝向只警告，并退一步断言落点确实是可站立格 */
      const dx = stair.x - landed.x, dy = stair.y - landed.y;
      const want = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
      if (landed.face === want) {
        T(label + ' 落点面朝走下来的那一侧', true, 'face=' + landed.face + ' · 台阶在 (' + stair.x + ',' + stair.y + ')');
      } else {
        W(label + ' 面朝走下来的那一侧：落点 face=' + landed.face + '，期望 ' + want + '（实现未设置朝向时不计失败）');
        const okTile = await walkable(p, to, landed.x, landed.y);
        T(label + ' 落点仍在目标层可站立格', okTile,
          '落点 (' + landed.x + ',' + landed.y + ')' + (okTile ? '' : ' 压在墙或家具上'));
      }
    }

    section(tag + ' §4 每层有可交互内容');
    const content = await p.evaluate(([ids, doorKinds]) => {
      const M = window.__MOSS__;
      return ids.map(id => {
        const list = M.INTERACTABLES[id] || [];
        const real = list.filter(o => doorKinds.indexOf(o.kind) < 0);
        return { id, total: list.length, real: real.length, kinds: real.map(o => o.kind) };
      });
    }, [FLOOR_SCENES, DOOR_KINDS]);
    for (const c of content)
      T(tag + ' ' + c.id + ' 至少 2 个非门类交互物', c.real >= 2,
        c.real >= 2 ? c.kinds.join(' ') : '非门类只有 ' + c.real + ' 个（共 ' + c.total + ' 个交互物）');

    section(tag + ' §5 一层能找管家塞琳的服务台');
    const svc = await findIt(p, 'palace_f1', { kind: 'cityService', service: 'castle' });
    if (!T(tag + ' palace_f1 有 cityService/castle 服务点', !!svc,
      svc ? svc.id + ' · ' + svc.label : 'palace_f1 的 INTERACTABLES 里没有 cityService + service=castle')) {
      W('管家服务点缺失，跳过“按 E 能叫出窗口”这一步');
    } else {
      await pose(p, 'palace_f1', svc.stand[0][0], svc.stand[0][1]);
      await p.keyboard.press('e');
      await p.waitForTimeout(520);
      const ui = await p.evaluate(() => {
        const M = window.__MOSS__, layer = document.getElementById('windowLayer');
        return {
          win: !!(M.ui && M.ui.window),
          layerOpen: !!layer && !layer.hidden,
          hasWin: !!document.querySelector('#windowLayer .win, #windowLayer .window, #windowLayer .modal')
        };
      });
      T(tag + ' 一层管家服务台按 E 弹出窗口', ui.win || (ui.layerOpen && ui.hasWin), JSON.stringify(ui));
      await shot(p, 'palace_f1', 'f1-service');
      await closeWin(p);
    }

    const errs = [...new Set(run.errors)];
    T(tag + ' 全程浏览器无报错', errs.length === 0, errs.slice(0, 4).join(' | '));
  } catch (e) {
    /* 页面起不来（打包产物过期、game.js 启动抛错等）也要落到可读的一条失败上，
       否则整份报告只剩一个未捕获异常，看不出是哪一步断的。 */
    const pageErrs = [...new Set(run.errors)].slice(0, 2).join(' | ');
    T(tag + ' 套件能跑完（页面启动 + 全部断言）', false,
      String(e && e.message || e).split('\n')[0] +
      (pageErrs ? ' · 页面报错：' + pageErrs : '') +
      (url ? ' · 打包产物可能比 game.js 旧，可先跑 node tests/build-single-file.mjs' : ''));
  } finally {
    await run.browser.close();
  }
}

console.log('白蔷薇宫城 · 楼层通行验收（契约 docs/palace-p1-contract.md）');
/* harness.launch 只在传 url 时才改全局 GAME_URL，所以源码入口必须先跑，打包版后跑 */
await runSuite('', '源码入口', '源码');
/* §11 验收对照 8：打包版与正常入口行为一致，重跑同一套游览链断言 */
await runSuite(SINGLE_FILE, '打包版', '打包');

console.log('\n======== 宫城楼层通行报告 ========');
console.log('断言 ' + checks + ' 项，失败 ' + failed.length + ' 项，警告 ' + warned.length + ' 条');
if (failed.length) { console.log('\n--- 失败明细 ---'); failed.forEach(f => console.log('  ✗ ' + f)); }
if (warned.length) { console.log('\n--- 警告（不计失败） ---'); warned.forEach(w => console.log('  ! ' + w)); }
console.log('=======================================\n');
process.exitCode = failed.length ? 1 : 0;
