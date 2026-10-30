/* 十一人实体在场专项：莱娜的岗位时段与剧情会合、弥拉的去向与实体位置。
 *
 * 夹具（文件头声明，均不证明自然路线可达）：
 *   - devSwitchScene：把玩家放到指定场景落点，只为定位，不代表玩家走得到。
 *   - state.timeMinutes：设定时段（越界夹具）。
 *   - state.story.choices / state.story.scenes / state.story.*Chapter.records：
 *     写入已发生的剧情事实（合法夹具：这些事实由主线场次与回执产生），
 *     本套件只验证实体位置、对白与记录是否一致。
 *   - 背包里放一份 bread、npcFriendship 归零：用于验证好感与赠礼边界。
 *   - 临时改写普通邮递员的注册场景及日程，模拟普通 NPC 跨场景；读档后恢复注册表。
 * 真实输入：走到人物旁按 E 搭话、走到柜台按 E 开面板并点击寄信。
 * 不证明：自然路线可达、真机手感、初见玩家理解度。 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, faceTowards, interactWith, winTitle } from './harness.mjs';

const single = process.argv.includes('--single-file');
const { browser, page: p, errors } = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
let checks = 0;
function ok(name, condition) { assert.ok(condition, name); checks++; console.log('PASS ' + name); }
function eq(name, actual, expected) {
  assert.equal(actual, expected, name + '（实际 ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expected) + '）');
  checks++; console.log('PASS ' + name);
}

async function place(id) {
  return await p.evaluate(k => {
    const pl = __MOSS__.npcPlace(k);
    return pl ? { scene: pl.scene, x: pl.x, y: pl.y, state: pl.override ? pl.override.state : null } : null;
  }, id);
}
async function setTime(m) { await p.evaluate(mm => { __MOSS__.state.timeMinutes = mm; }, m); }
async function goto(scene, x, y) {
  await closeWin(p);
  await p.evaluate(([sc, xx, yy]) => { __MOSS__.devSwitchScene(sc, xx, yy); }, [scene, x, y]);
  await p.waitForTimeout(240);
}
/* 走到人物旁边按 E 搭话，返回对话正文。人物位置取运行时坐标，场景取在场解析结果。
 * 换日或切场景会重算在场位置，但运行时坐标由游戏循环刷新（开窗时暂停），
 * 所以先等她走到本时段的落点再靠近。 */
async function talkAt(id, scene) {
  await closeWin(p);
  const pl = await place(id);
  assert.ok(pl && pl.scene === scene, id + ' 不在 ' + scene + '（实际 ' + JSON.stringify(pl) + '）');
  for (let i = 0; i < 25; i++) {
    const rt = await p.evaluate(k => { const n = __MOSS__.__npcRuntime[k]; return { x: Math.round(n.x), y: Math.round(n.y), scene: n.scene }; }, id);
    if (rt.scene === pl.scene && rt.x === pl.x && rt.y === pl.y) break;
    await p.waitForTimeout(120);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const pos = await p.evaluate(k => { const n = __MOSS__.__npcRuntime[k]; return { x: Math.round(n.x), y: Math.round(n.y) }; }, id);
    for (const [x, y] of [[pos.x, pos.y + 1], [pos.x - 1, pos.y], [pos.x + 1, pos.y], [pos.x, pos.y - 1]]) {
      if (await p.evaluate(([sc, xx, yy]) => __MOSS__.isSolid(sc, xx, yy), [scene, x, y])) continue;
      await goto(scene, x, y);
      const now = await p.evaluate(k => { const n = __MOSS__.__npcRuntime[k]; return { x: Math.round(n.x), y: Math.round(n.y) }; }, id);
      if (Math.abs(now.x - x) + Math.abs(now.y - y) !== 1) break;
      await faceTowards(p, now.x, now.y);
      await p.keyboard.press('e');
      await p.waitForTimeout(180);
      if (await p.locator('.dlg-body').count()) return await p.locator('.dlg-body').innerText();
      await closeWin(p);
    }
  }
  const rt = await p.evaluate(k => { const n = __MOSS__.__npcRuntime[k]; return { x: Math.round(n.x), y: Math.round(n.y), scene: n.scene }; }, id);
  throw new Error('无法与 ' + id + ' 搭话（场景 ' + scene + '，在场 ' + JSON.stringify(await place(id)) + '，运行时 ' + JSON.stringify(rt) + '，玩家 ' + JSON.stringify(await p.evaluate(() => [__MOSS__.state.player.x, __MOSS__.state.player.y])) + '）');
}
/* 当前角色经验：交谈与赠礼都不得增加主线经验，也不得新增一次性发放记录。 */
async function expSnapshot() {
  return await p.evaluate(() => {
    const c = __MOSS__.state.char || {};
    return { exp: c.exp || 0, level: c.level || 1, grants: Object.keys(c.expGrants || {}).sort().join(',') };
  });
}
async function friendship(id) { return await p.evaluate(k => __MOSS__.state.npcFriendship[k] || 0, id); }

/* 终幕 F05 的真实链条：F01—F04 的记录与 F03/F04 步骤按终幕专项已验收的形状写入，
 * 安置回执必须由同一条链推导，归一化才会保留它（坏链会被当成坏档丢掉）。 */
async function installFinale(withSettlement) {
  await p.evaluate(withSettle => {
    const M = __MOSS__, s = M.state, st = M.storyState();
    s.totalDay = 20; s.timeMinutes = 540; s.coins = 400;
    M.STORY_TASKS.filter(t => t.act <= 6).forEach(t => st.tasks[t.id] = 'done');
    ['MQ1-F01', 'MQ1-F02', 'MQ1-F03', 'MQ1-F04'].forEach(id => st.tasks[id] = 'done');
    const rec = (choice, day, text) => ({ day, choice, text, source: '前章现场夹具' });
    const ek = ['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'];
    const ec = ['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
    st.echoChapter = { records: {} }; ek.forEach((k, i) => st.echoChapter.records[k] = rec(ec[i], 15, '第五幕 ' + k));
    const dk = ['arrival','lodging','intake','witness','original','compare','questions','resolution','permit','departure'];
    const dc = ['registered','A','classified','A','viewed','indexed','answered','A','limited','deferred'];
    st.capitalChapter = { records: {}, permitUntil: 50 }; dk.forEach((k, i) => st.capitalChapter.records[k] = rec(dc[i], 14, '第四幕 ' + k));
    st.pineChapter = { records: { help: rec('A', 14, '分头协作') } };
    const receipts = Object.fromEntries(['route','medical','food','receiver'].map(k => [k, { day: 17, source: '白松驿舍', text: '确认 ' + k }]));
    const steps = (ids, day) => ids.map((id, i) => ({ id, day, minute: 600 + i }));
    st.finaleChapter = {
      records: {
        prepare: rec('preview', 16, '筹备'), home: rec('A', 16, '家务'), replies: rec('confirmed', 17, '回执'),
        assignment: rec('A', 17, '分工'), march: rec('A', 18, '安全线'), reception: rec('received', 18, '弥拉与孩子到达；未答复留空'),
        roster: rec('confirmed', 19, '本人核名；留守与未答复分列'), amendment: rec('appended', 19, '保留原签核与改写历史')
      },
      support: { sentDay: 16, receipts, checks: ['names', 'handoff', 'experience'], experience: { id: 'public', day: 17 } },
      f03: {
        attempts: [{ startDay: 18, role: 'A', snapshot: { assignmentDay: 17, care: '家务核对', roster: '第五幕 confirm', receipts }, steps: ['water','sign','slope','detour'].map(id => ({ id, day: 18 })) }],
        reception: ['mira','care','pending'].map(id => ({ id, day: 18 }))
      },
      f04: { roster: steps(['mira','ruen','others'], 19), case: steps(['original','history','statement','notice'], 19) }
    };
    st.finaleChapter.f04.case.forEach((v, i) => { v.minute = 610 + i; });
    if (withSettle) {
      const arr = steps(['mira','ruen','stay','maintenance','participation'], 20);
      arr[3].reviewDay = arr[3].day + 7;
      arr[4].choice = 'A';
      st.finaleChapter.f05 = { arrangements: arr, map: [] };
      st.finaleChapter.records.settlement = {
        day: 20, choice: 'A', source: '白松驿舍 · S067',
        text: '弥拉本人同意临时接收，阿丽娅确认边城已有房间及孩子的就学申请接收渠道；实际入学仍待办理。鲁恩本人和娜汀确认后续照护联络，不代他决定迁居。留守家庭按本人意愿留守，赫莎提供联络渠道，未答复者不代为决定。伊文确认北坡临时维护并于第 27 天前复核；永久工程仍待后续。'
      };
    }
    M.saveNow();
  }, withSettlement);
}

try {
  await boot(p);
  await p.locator('#tutorialSkip').click().catch(() => {});

  /* 一、莱娜岗位：早班柜台 → 分信区理信 → 晚班柜台 */
  await setTime(480);
  const duty = await place('ms1_lena');
  eq('莱娜早班在邮局柜台', duty.scene + ':' + duty.x + ',' + duty.y, 'city_post:11,8');
  eq('早班状态是值班', duty.state, 'duty');
  await setTime(780);
  const sort = await place('ms1_lena');
  eq('莱娜午后离开柜台到分信区', sort.scene + ':' + sort.x + ',' + sort.y, 'city_post:14,6');
  ok('莱娜不再全天站同一格', sort.x !== duty.x || sort.y !== duty.y);
  await setTime(1200);
  eq('莱娜晚班回柜台', (await place('ms1_lena')).state, 'duty');

  /* 二、剧情会合：选了同行，她按约到农舍，邮局不再有她（单实体） */
  await p.evaluate(() => {
    const s = __MOSS__.state;
    s.story.choices.g02_lena = 'together';
    s.story.scenes.S072 = { seen: true, skipped: false, idx: 3, day: s.totalDay };
  });
  const meet = await place('ms1_lena');
  eq('会面当天莱娜在农舍', meet.scene + ':' + meet.x + ',' + meet.y, 'house:6,5');
  eq('剧情会合优先于岗位时段', meet.state, 'meeting');
  eq('会面期间邮局不再有莱娜', await p.evaluate(() => __MOSS__.npcScene('ms1_lena')), 'house');
  eq('小翎仍在邮局顶班', await p.evaluate(() => __MOSS__.npcScene('postie')), 'city_post');

  /* 真实输入：会面当天能在农舍找到她并搭话 */
  const meetTalk = await talkAt('ms1_lena', 'house');
  ok('会面当天能搭话并说明按约到场', meetTalk.includes('今天我按约来了农场'));

  /* 三、会合期间邮务服务仍可获得（真实按键办理寄信） */
  await goto('city_post', 15, 11);
  ok('邮局柜台面板照常打开', await interactWith(p, 15, 9));
  eq('邮局柜台面板标题', await winTitle(p), '驿站邮局');
  const coinsBefore = await p.evaluate(() => __MOSS__.state.coins);
  await p.locator('.win button', { hasText: '寄信给诺尔' }).first().click();
  await p.waitForTimeout(220);
  const coinsAfter = await p.evaluate(() => __MOSS__.state.coins);
  eq('会合期间寄信仍能办理', coinsBefore - coinsAfter, 15);
  eq('会合期间寄信仍记到诺尔好感', await p.evaluate(() => __MOSS__.state.npcFriendship.teacher || 0), 5);
  await closeWin(p);

  /* 四、会面结束次日她回邮局 */
  await p.evaluate(() => { __MOSS__.state.totalDay += 1; });
  const back = await place('ms1_lena');
  eq('会面次日莱娜回邮局柜台', back.scene + ':' + back.x + ',' + back.y, 'city_post:11,8');

  /* 五、好感与主线经验的边界 */
  await p.evaluate(() => {
    const s = __MOSS__.state;
    s.npcFriendship.ms1_lena = 0;
    delete s.npcDailyInteractions.ms1_lena;
    s.inventory = { bread: 1 };
    s.timeMinutes = 480;
  });
  const expBefore = await expSnapshot();
  const firstTalk = await talkAt('ms1_lena', 'city_post');
  ok('当天首次交谈有正文', firstTalk.length > 3);
  eq('当天首次交谈好感 +2', await friendship('ms1_lena'), 2);
  eq('交谈不发主线经验', (await expSnapshot()).exp, expBefore.exp);
  eq('交谈不新增一次性经验记录', (await expSnapshot()).grants, expBefore.grants);
  await closeWin(p);
  const repeatTalk = await talkAt('ms1_lena', 'city_post');
  ok('重复交谈仍有正文', repeatTalk.length > 3);
  eq('重复交谈不再加好感', await friendship('ms1_lena'), 2);
  eq('重复交谈不发主线经验', (await expSnapshot()).exp, expBefore.exp);
  await closeWin(p);

  /* 赠礼：只加好感，不发经验、不改剧情记录；当天一次 */
  await talkAt('ms1_lena', 'city_post');
  await p.locator('.win button', { hasText: '赠送礼物' }).first().click();
  await p.waitForTimeout(200);
  await p.locator('.win button', { hasText: '赠送 1 个' }).first().click();
  await p.waitForTimeout(220);
  eq('赠礼只加好感（通用偏好表命中）', await friendship('ms1_lena'), 10);
  eq('赠礼不发主线经验', (await expSnapshot()).exp, expBefore.exp);
  eq('赠礼不新增一次性经验记录', (await expSnapshot()).grants, expBefore.grants);
  eq('赠礼后背包少一份礼物', await p.evaluate(() => __MOSS__.state.inventory.bread || 0), 0);
  await closeWin(p);

  /* 六、弥拉：意愿、去向与实体位置 */
  await p.evaluate(() => {
    const s = __MOSS__.state;
    s.story.echoChapter.records = {};
    s.story.finaleChapter.records = {};
  });
  eq('未表达意愿时弥拉在回声谷', (await place('ms1_mira')).scene, 'ms1_echo_village');
  await installFinale(false);
  eq('表达意愿但未落实安置仍留在回声谷', (await place('ms1_mira')).scene, 'ms1_echo_village');
  await installFinale(true);
  const miraMoved = await place('ms1_mira');
  eq('安置回执成立后弥拉在边城', miraMoved.scene + ':' + miraMoved.x + ',' + miraMoved.y, 'neighbor_border:14,10');
  ok('旧址不再有弥拉', (await place('ms1_mira')).scene !== 'ms1_echo_village');
  eq('读档后弥拉仍在边城（不回退）', await p.evaluate(() => { const raw = __MOSS__.serialize(); __MOSS__.replaceSave(raw); return __MOSS__.npcScene('ms1_mira'); }), 'neighbor_border');

  /* 真实输入：边城能找到她并搭话，对白与安置记录一致。
   * 先进入边城（首次到访按既有规则记一次发现经验，属正常玩法），再比对搭话前后的经验。 */
  await goto('neighbor_border', 14, 11);
  const expBeforeMira = await expSnapshot();
  const miraTalk = await talkAt('ms1_mira', 'neighbor_border');
  ok('边城对白与安置记录一致', miraTalk.includes('临时房间已经安排好') && miraTalk.includes('入学手续还要办'));
  eq('弥拉搭话不发主线经验', (await expSnapshot()).exp, expBeforeMira.exp);
  eq('弥拉搭话不新增经验记录', (await expSnapshot()).grants, expBeforeMira.grants);

  /* 普通 NPC 没有自然跨场景日程，以注册表夹具触发通用换场景分支；
   * 只验证运行时落点、旧址交互、搭话及正式读档恢复，不声称自然迁居。 */
  await closeWin(p);
  const oldPostie = await p.evaluate(() => { const n=__MOSS__.npcRuntime.postie; return {scene:n.scene,x:Math.round(n.x),y:Math.round(n.y)}; });
  eq('迁场前普通邮递员在邮局', oldPostie.scene, 'city_post');
  await p.evaluate(() => {
    const n = __MOSS__.NPCS.postie;
    n.scene = 'house'; n.schedule = [{ from: 0, to: 1440, x: 6, y: 5 }];
  });
  await p.waitForFunction(() => { const n = __MOSS__.npcRuntime.postie; return n.scene === 'house' && n.x === 6 && n.y === 5 && n.path.length === 0; });
  eq('普通邮递员迁场落到新场景坐标且不沿旧路寻路', await p.evaluate(() => { const n = __MOSS__.npcRuntime.postie; return [n.scene,n.x,n.y,n.path.length].join(':'); }), 'house:6:5:0');
  eq('普通邮递员迁场后目标场景', await p.evaluate(() => __MOSS__.npcScene('postie')), 'house');
  await goto('city_post', 15, 11);
  ok('普通邮递员迁场后旧岗位不留可交互实体', await p.evaluate(({x,y}) => __MOSS__.__findNpcAdjacent(x,y+1,x,y) !== 'postie', oldPostie));
  ok('普通邮递员迁场后农舍可搭话', (await talkAt('postie', 'house')).trim().length > 3);
  await closeWin(p);
  await p.evaluate(() => __MOSS__.saveNow());
  await p.reload(); await p.getByRole('button', { name: '继续游戏', exact: true }).click();
  await p.waitForFunction(() => __MOSS__.npcRuntime.postie && __MOSS__.npcRuntime.postie.scene === 'city_post');
  eq('正式读档后普通邮递员回原场景', await p.evaluate(() => __MOSS__.npcScene('postie')), 'city_post');
  ok('正式读档后普通邮递员运行时落点匹配日程', await p.evaluate(() => { const M=__MOSS__, n=M.npcRuntime.postie, place=M.npcPlace('postie'); return n.scene===place.scene && n.x===place.x && n.y===place.y; }));
  ok('正式读档后普通邮递员仍可搭话', (await talkAt('postie', 'city_post')).trim().length > 3);

  ok('无页面错误', errors.length === 0);
  console.log('PASS 十一人实体在场与岗位会合' + (single ? '（单文件版）' : '') + ' ' + checks + ' 项通过');
} finally { await browser.close(); }
