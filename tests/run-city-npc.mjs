import { launch, boot, closeWin } from './harness.mjs';

/* 实机验证：15 栋室内是否真的有 NPC 站在场上、且不在墙上/家具里 */
const ROOMS = [
  ['boiler', 'boilerman'], ['sawmill', 'sawyer'], ['foundry', 'smith_f'],
  ['watermill', 'miller'], ['shipyard', 'shipwright'], ['quay_store', 'quay_steward'],
  ['uni_main', 'professor'], ['uni_wing', 'lecturer'], ['uni_lab', 'researcher'],
  ['uni_dorm', 'student'], ['bank', 'banker'], ['exchange', 'broker'],
  ['gold', 'vaultkeeper'], ['market_hall', 'market_clerk'], ['townhall', 'civic_clerk'],
];

const { browser, page, errors } = await launch();
const fails = [];
const T = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${d ? '  ' + d : ''}`); if (!c) fails.push(n); };

try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  console.log('\n【1】NPCS 表里 15 人都在');
  const inTable = await page.evaluate(list => list.map(([room, npc]) => {
    const n = window.__MOSS__.NPCS[npc];
    return { room, npc, exists: !!n, scene: n && n.scene, name: n && n.name,
      style: n && n.style, lines: n && (n.lines || []).length,
      sched: n && (n.schedule || []).length };
  }), ROOMS);
  for (const r of inTable) {
    T(`${r.room.padEnd(11)} ${r.npc.padEnd(12)}`, r.exists && r.scene === 'city_' + r.room,
      r.exists ? `${r.name}·${r.name} style=${r.style} 台词${r.lines} 4段=${r.sched}` : 'NPCS 表里没有');
  }

  console.log('\n【2】走进每栋室内看是否真画出来（npcRuntime 有坐标）');
  for (const [room, npc] of ROOMS) {
    await page.evaluate(r => window.__MOSS__.devSwitchScene('city_' + r, 2, 2), room);
    await page.waitForTimeout(220);
    const rt = await page.evaluate(n => {
      const R = window.__MOSS__.npcRuntime || {};
      const v = R[n];
      return v ? { x: v.x, y: v.y, scene: v.scene } : null;
    }, npc);
    if (!T(`${room.padEnd(11)} 运行时有实体`, !!rt, rt ? `(${rt.x},${rt.y})` : 'npcRuntime 无此人')) continue;
    // 站到 NPC 旁边，按 E 应该能开对话
    const talked = await page.evaluate(([n]) => {
      const M = window.__MOSS__, s = M.state, R = M.npcRuntime[n];
      if (!R) return { err: 'no runtime' };
      s.player.x = R.x; s.player.y = R.y + 1; s.player.face = 'up';
      return { at: [R.x, R.y] };
    }, [npc]);
    if (talked.err) { T(`${room} 靠近 NPC`, false, talked.err); continue; }
    await page.waitForTimeout(120);
    await page.keyboard.press('e');
    await page.waitForTimeout(240);
    const opened = await page.evaluate(() => {
      const w = document.querySelector('#win');
      return w && !w.hidden ? { title: (document.querySelector('#win .win-title') || {}).textContent,
        body: (document.querySelector('#win .win-body') || {}).innerText } : null;
    });
    const isNpcWin = opened && /NPCS\[npc\]|undefined/.test('') === false && opened.title && opened.title.length > 0;
    T(`${room.padEnd(11)} 可对话`, isNpcWin && !!opened.body,
      isNpcWin ? `「${opened.title}」${opened.body.slice(0, 18).replace(/\n/g, ' ')}…` : '未打开窗口');
    await closeWin(page);
  }

  console.log('\n【3】NPC 不与家具/墙体重叠');
  const overlap = await page.evaluate(list => {
    const M = window.__MOSS__, bad = [];
    for (const [room, npc] of list) {
      const def = M.CITY_ROOMS[room]; if (!def) continue;
      const R = M.npcRuntime[npc]; if (!R) continue;
      for (const p of (def.props || [])) {
        if (R.x >= p.x && R.x < p.x + p.w && R.y >= p.y && R.y < p.y + p.h) {
          bad.push(`${room}:${npc}(${R.x},${R.y}) 压在 ${p.t} 上`);
        }
      }
      if (R.x <= 0 || R.y <= 0 || R.x >= def.w || R.y >= def.h) {
        bad.push(`${room}:${npc}(${R.x},${R.y}) 出界 ${def.w}x${def.h}`);
      }
    }
    return bad;
  }, ROOMS);
  T('无重叠/出界', overlap.length === 0, overlap.slice(0, 6).join(' | ') || '15 人全部合法');

  console.log('\n【4】控制台无报错');
  const uniq = [...new Set(errors)];
  T('无报错', uniq.length === 0, uniq.slice(0, 5).join(' | ') || '');

  console.log('\n======== 汇总 ========');
  console.log(fails.length ? `失败 ${fails.length} 项` : '全部通过');
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error('崩溃：', e.message);
  fails.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} finally { await browser.close(); }
