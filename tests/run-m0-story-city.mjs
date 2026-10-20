/* 第九版第一部主线《长风有归处》· M0 切片 —— 第一幕验收
 *
 * 覆盖：A01 城门与邮局、A02 图书馆与学院的叠图对照、A03 花园接待的
 *      观察—先找谁—公开/私谈三段、A04 的谨慎/公开选择与后果、
 *      A05 宫城与旅馆的出发准备，以及城市通行这道社会门槛。
 *
 * 走法：每一场都要真的走到那一格按 E 才开；跨场景的下一场不瞬移，
 *      玩家得自己走过去，面板会把地点写清楚。
 *
 * 夹具边界：
 *   · state.bridgeRepaired=true      —— 更早阶段已交付的修桥委托（通行证的前置）
 *   · coins=600 / energy=100 / totalDay=10 —— 让「办证 150 金」和走路够用
 *   · 农田里一格已下种的作物          —— 经营路线的入门成果
 *   · travel.discovered 补几个公共地点 —— 更早阶段已经走过，省掉的是路不是内容
 *   不写：主线任务阶段、证据、选择、剧情进度。这些必须由按钮产生。
 *
 *   node tests/run-m0-story-city.mjs
 *   node tests/run-m0-story-city.mjs --single-file
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, winOpen, winTitle, winText, walkTo, faceTowards, snap } from './harness.mjs';

const single = process.argv.includes('--single-file');
let checks = 0;
const eq = (n, a, b) => { assert.deepEqual(a, b, n + '（实际 ' + JSON.stringify(a) + '）'); checks++; console.log('PASS', n); };
const ok = (n, c) => { assert.ok(c, n); checks++; console.log('PASS', n); };

const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
const p = r.page;
await boot(p);
await p.locator('#tutorialSkip').click().catch(() => { });

const story = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.storyState())));
const taskStatus = id => p.evaluate(i => window.__MOSS__.storyTaskStatus(i), id);
const scene = () => p.evaluate(() => window.__MOSS__.state.sceneId);
const entryOf = id => p.evaluate(eid => {
  const M = window.__MOSS__;
  for (const k in M.INTERACTABLES) {
    const hit = (M.INTERACTABLES[k] || []).find(i => i.id === eid);
    if (hit) return { scene: k, x: hit.x, y: hit.y, label: hit.label, stand: hit.stand };
  }
  return null;
}, id);
const bodyBtns = async () => (await p.locator('.win-body button').allTextContents()).map(s => s.trim()).filter(Boolean);
const footBtns = async () => (await p.locator('.win-foot button').allTextContents()).map(s => s.trim()).filter(Boolean);

async function clickBody(re) {
  const list = await bodyBtns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, '正文里找不到按钮 ' + re + '；现有：' + list.join(' | '));
  await p.locator('.win-body button').nth(i).click();
  await p.waitForTimeout(200);
  return list[i];
}
async function clickFoot(re) {
  const list = await footBtns();
  const i = list.findIndex(b => re.test(b));
  assert.ok(i >= 0, '页脚里找不到按钮 ' + re + '；现有：' + list.join(' | '));
  await p.locator('.win-foot button').nth(i).click();
  await p.waitForTimeout(240);
  return list[i];
}
async function runToEnd(sceneId, max = 40) {
  for (let i = 0; i < max; i++) {
    const done = await p.evaluate(s => {
      const M = window.__MOSS__;
      const rec = (M.storyState().scenes[s] || { idx: 0 }).idx;
      const def = M.STORY_SCENES[s];
      return rec >= (def ? def.lines.length : 0);
    }, sceneId);
    if (done) return true;
    const list = await footBtns();
    const i2 = list.findIndex(b => /^继续$/.test(b));
    if (i2 < 0) return false;
    await p.locator('.win-foot button').nth(i2).click();
    await p.waitForTimeout(180);
  }
  return false;
}
async function endScene() { return clickFoot(/继续|回到门前/); }
/* 叠图面板里每处参照各有三个按钮，按参照名定位那一行再点 */
async function clickRef(refName, label) {
  const row = p.locator('.story-ref', { hasText: refName });
  assert.ok(await row.count(), '叠图面板里没有「' + refName + '」这一行');
  const btn = row.locator('button', { hasText: label }).first();
  assert.ok(await btn.count(), '「' + refName + '」这一行没有「' + label + '」按钮');
  await btn.click();
  await p.waitForTimeout(220);
  return true;
}

/* 走到入口旁边的可站格，面朝入口按 E（用真实相邻格，不依赖 stand 列表） */
async function openEntry(eid, budget = 60000) {
  const e = await entryOf(eid);
  assert.ok(e, '找不到入口 ' + eid);
  const cands = [[e.x, e.y - 1], [e.x + 1, e.y], [e.x, e.y + 1], [e.x - 1, e.y]];
  for (const [sx, sy] of cands) {
    if (!await walkTo(p, sx, sy, budget)) continue;
    await faceTowards(p, e.x, e.y);
    await p.keyboard.press('e');
    await p.waitForTimeout(300);
    if (await winOpen(p)) return true;
    await closeWin(p);
  }
  return false;
}
/* 用场景里的门出去 */
async function useExit(sceneId, exitId = 'exit_main', budget = 40000) {
  const it = await p.evaluate(([sc, eid]) => {
    const hit = (window.__MOSS__.INTERACTABLES[sc] || []).find(i => i.id === eid);
    return hit ? { x: hit.x, y: hit.y, stand: hit.stand } : null;
  }, [sceneId, exitId]);
  assert.ok(it, '场景 ' + sceneId + ' 里没有 ' + exitId);
  for (const [sx, sy] of it.stand || []) {
    if (!await walkTo(p, sx, sy, budget)) continue;
    await faceTowards(p, it.x, it.y);
    await p.keyboard.press('e');
    await p.waitForTimeout(500);
    if ((await scene()) !== sceneId) return true;
  }
  return false;
}
/* M 地图传送：点地点 → 点「传送过去」，是玩家真实入口 */
async function travelTo(name) {
  await closeWin(p);
  await p.keyboard.press('m');
  await p.waitForTimeout(300);
  let node = p.getByRole('button', { name: new RegExp('^' + name) });
  if (!(await node.count())) {
    const zoom = p.getByRole('button', { name: '全境总图' });
    if (await zoom.count()) { await zoom.first().click(); await p.waitForTimeout(300); }
    node = p.getByRole('button', { name: new RegExp('^' + name) });
  }
  assert.ok(await node.count(), 'M 地图上没有「' + name + '」');
  await node.first().click();
  await p.waitForTimeout(220);
  const go = p.getByRole('button', { name: '传送过去', exact: true });
  assert.ok(await go.count(), '「' + name + '」不能传送');
  await go.first().click();
  await p.waitForTimeout(360);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(220);
}
/* 城区图：街区按钮直接落在该街区的公共落点 */
async function travelToDistrict(name) {
  await closeWin(p);
  await p.keyboard.press('m');
  await p.waitForTimeout(320);
  let chip = p.getByRole('button', { name: new RegExp('^' + name) });
  if (!(await chip.count())) {
    const tab = p.getByRole('button', { name: '白蔷薇城区' });
    if (await tab.count()) { await tab.first().click(); await p.waitForTimeout(320); }
    chip = p.getByRole('button', { name: new RegExp('^' + name) });
  }
  assert.ok(await chip.count(), '城区图上没有「' + name + '」');
  assert.ok(!(await chip.first().isDisabled()), '「' + name + '」不能传送');
  await chip.first().click();
  await p.waitForTimeout(420);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(260);
}
/* 进城：走到城门口按 E 开门 */
async function enterCityRoom(buildingId, wantScene, budget = 120000) {
  const door = await p.evaluate(id => {
    const b = __MOSS__.CITY_BUILDINGS.filter(x => x.id === id)[0];
    return b ? { x: b.door.x, y: b.door.y } : null;
  }, buildingId);
  assert.ok(door, '城市里没有这栋楼：' + buildingId);
  ok('走到「' + wantScene + '」门口', await walkTo(p, door.x, door.y + 1, budget));
  await p.keyboard.press('ArrowUp');
  await p.keyboard.press('e');
  await p.waitForTimeout(500);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(350);
  return (await scene()) === wantScene;
}

/* ================= 夹具：更早阶段已经完成的事 ================= */
await p.evaluate(() => {
  const M = window.__MOSS__, s = M.state;
  s.energy = 100; s.coins = 600; s.timeMinutes = 540; s.totalDay = 10;
  s.bridgeRepaired = true;
  s.plots['8,5'] = { tilled: true, water: true, crop: 'radish', age: 1, mature: false, harvested: false, regrow: 0, fertility: 100, lastGroup: null, prevGroup: null };
  ['mill.village', 'city.gate', 'city.district.station', 'city.district.park',
   'city.district.university', 'city.district.oldtown', 'city.district.workers',
   'city.district.castle'].forEach(k => { s.travel.discovered[k] = true; });
  M.saveNow();
});

/* ================= 一、序章（按按钮推进，桥已修所以走磨坊路线） ================= */
console.log('\n【1】序章：旧信 → 磨坊的测量板 → 议事屋的图册');
ok('走到农舍门前的旧信', await openEntry('ms1_p01', 30000));
const p01Title = await winTitle(p);
ok('旧档走补送信，新档走回忆入口', /补送的信|一封信，一处屋檐/.test(p01Title), p01Title);
if (/补送/.test(p01Title)) await clickFoot(/拆开信/);
else await clickFoot(/跳过回忆/);
eq('进入 S001', await winTitle(p), 'S001 · 苔芽农场门前 · 日');
await runToEnd('S001');
await clickBody(/我想先找到他/);
eq('选择已记录', (await story()).choices.p01_reply, 'B');
await runToEnd('S001');
await endScene();
eq('下一场在农舍，不瞬移', await winTitle(p), '下一场在别处');
await closeWin(p);
ok('走到农舍门口', await walkTo(p, 3, 5, 30000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(550);
eq('进了农舍', await scene(), 'house');
ok('走到农舍桌上的旧信', await openEntry('ms1_p01_house', 30000));
eq('农舍打开 S002', await winTitle(p), 'S002 · 农舍 · 日');
await runToEnd('S002');
await endScene();
ok('P01 完成', await taskStatus('MQ1-P01') === 'done');

/* P02：田边 → 种子铺 */
ok('出农舍回农场', await useExit('house'));
eq('回到农场', await scene(), 'farm');
ok('走到田边', await openEntry('ms1_p02_farm', 30000));
eq('田边打开 S003', await winTitle(p), 'S003 · 农场田边 · 日');
await runToEnd('S003');
await endScene();
eq('下一场在种子铺', await winTitle(p), '下一场在别处');
await closeWin(p);
await travelTo('芽芽小镇');
eq('传到小镇', await scene(), 'town');
ok('走到种子铺前的账册', await openEntry('ms1_p02_town', 30000));
eq('种子铺打开 S004', await winTitle(p), 'S004 · 小镇种子铺前 · 日');
await runToEnd('S004');
await endScene();
ok('P02 完成', await taskStatus('MQ1-P02') === 'done');

/* P03：桥已修 → 磨坊路线（机房 → 进水渠） */
eq('桥已修时路线是磨坊', await p.evaluate(() => window.__MOSS__.storyRouteFor(window.__MOSS__.STORY_TASKS.find(t => t.id === 'MQ1-P03'))), 'mill');
await travelTo('风铃磨坊与麦田村');
eq('传送到麦田村', await scene(), 'mill_village');
ok('走到磨坊机房门口', await walkTo(p, 29, 17, 60000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(500);
await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
await p.waitForTimeout(350);
eq('进入磨坊机房', await scene(), 'mill_workshop');
ok('走到机房里的测量板', await openEntry('ms1_p03_mill', 30000));
eq('机房打开 S005', await winTitle(p), 'S005 · 风铃磨坊机房 · 日');
await runToEnd('S005');
await endScene();
eq('下一场在进水渠，不瞬移', await winTitle(p), '下一场在别处');
await closeWin(p);
ok('出机房回麦田村', await useExit('mill_workshop'));
eq('回到麦田村', await scene(), 'mill_village');
ok('走到进水渠边的旧木板', await openEntry('ms1_p03_mill_village', 60000));
eq('进水渠打开 S006', await winTitle(p), 'S006 · 磨坊进水渠 · 日');
await runToEnd('S006');
ok('出现对齐木板的互动', (await bodyBtns()).some(b => /钉孔/.test(b)));
await clickBody(/固定石/);
ok('顺序不对不推进', !(await bodyBtns()).some(b => /三处参照都对上了/.test(b)));
await clickBody(/钉孔/);
await clickBody(/固定石/);
await clickBody(/水痕/);
await clickBody(/三处参照都对上了/);
await runToEnd('S006');
await endScene();
ok('P03 完成', await taskStatus('MQ1-P03') === 'done');
ok('登记了路线批注', !!(await story()).evidence.index);

/* P04：议事屋寄存柜 → 回农舍看图册 */
ok('走到村议事屋门口', await walkTo(p, 19, 12, 60000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(500);
await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
await p.waitForTimeout(350);
eq('进入议事屋', await scene(), 'mill_hall');
ok('走到议事屋的寄存柜', await openEntry('ms1_p04_hall', 30000));
eq('议事屋打开 S007', await winTitle(p), 'S007 · 麦田村议事屋 · 日');
await runToEnd('S007');
await endScene();
eq('下一场在农舍桌旁', await winTitle(p), '下一场在别处');
await closeWin(p);
ok('出议事屋', await useExit('mill_hall'));
await travelTo('苔芽农场');
eq('回到农场', await scene(), 'farm');
ok('走到农舍门口', await walkTo(p, 3, 5, 30000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(500);
eq('进了农舍', await scene(), 'house');
ok('走到农舍桌上的图册', await openEntry('ms1_p04_house', 30000));
eq('农舍打开 S008', await winTitle(p), 'S008 · 农舍桌旁 · 暮');
await runToEnd('S008');
ok('S008 给出第一幕前的选择', (await bodyBtns()).some(b => /先把家里安顿好|去看看他没画完/.test(b)));
await clickBody(/先把家里安顿好/);
eq('选择已记录', (await story()).choices.p04_choice, 'B');
await runToEnd('S008');
await endScene();
ok('P04 完成（序章收口）', await taskStatus('MQ1-P04') === 'done');

/* ================= 二、城市通行：明确的社会门槛 ================= */
console.log('\n【2】第一幕的门槛：城市通行');
eq('还没进城时 A01 未解锁', await taskStatus('MQ1-A01'), 'locked');
await useExit('house');
await travelTo('芽芽小镇');
eq('传到小镇', await scene(), 'town');
ok('走到城驿路按 E', await walkTo(p, 14, 22, 40000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(320);
eq('打开通行证窗口', await winTitle(p), '白蔷薇城 · 城市通行证');
const beforeCoins = await p.evaluate(() => window.__MOSS__.state.coins);
await clickFoot(/办理通行证/);
eq('办证扣掉 150 金', beforeCoins - (await p.evaluate(() => window.__MOSS__.state.coins)), 150);
ok('沿南方驿路走出小镇', await walkTo(p, 14, 23, 30000));
await p.waitForFunction(() => window.__MOSS__.state.sceneId === 'city', null, { timeout: 9000 }).catch(() => { });
await p.waitForTimeout(400);
eq('进入白蔷薇城', await scene(), 'city');
ok('进城后 A01 解锁', await taskStatus('MQ1-A01') === 'available');

/* ================= 三、A01 城门与邮局 ================= */
console.log('\n【3】MQ1-A01 城门内外，各有晨昏');
ok('走到南门的通行检查', await openEntry('ms1_a01_gate', 60000));
eq('南门打开 S009', await winTitle(p), 'S009 · 白蔷薇城南门 · 日');
await runToEnd('S009');
await endScene();
eq('下一场在邮局，不瞬移', await winTitle(p), '下一场在别处');
await closeWin(p);
ok('走进驿站邮局', await enterCityRoom('post', 'city_post'));
ok('走到分信柜旁的旧邮路', await openEntry('ms1_p01_city', 40000));
eq('邮局打开 S010', await winTitle(p), 'S010 · 驿站邮局 · 日');
ok('邮局里有莱娜', await p.evaluate(() => !!(__MOSS__.npcInfo && __MOSS__.npcInfo('ms1_lena'))));
await runToEnd('S010');
await endScene();
ok('A01 完成', await taskStatus('MQ1-A01') === 'done');
ok('A02 解锁', await taskStatus('MQ1-A02') === 'available');
await useExit('city_post');

/* ================= 四、A02 图书馆与学院 ================= */
console.log('\n【4】MQ1-A02 借一盏灯，读一页往事');
await travelToDistrict('白蔷薇大学');
eq('传到大学区', await scene(), 'city');
ok('走进蔷薇图书馆', await enterCityRoom('library', 'city_library'));
ok('走到馆藏旧图旁的阅览席', await openEntry('ms1_a02_library', 40000));
eq('图书馆打开 S011', await winTitle(p), 'S011 · 蔷薇图书馆 · 日');
await runToEnd('S011');
await endScene();
eq('下一场在学院，不瞬移', await winTitle(p), '下一场在别处');
await closeWin(p);
await useExit('city_library');
await travelToDistrict('白蔷薇大学');
ok('走进河岸学院', await enterCityRoom('academy', 'city_academy'));
ok('走到学院阅览桌', await openEntry('ms1_a02_academy', 40000));
eq('学院打开 S012', await winTitle(p), 'S012 · 学院阅览桌 · 日');
await runToEnd('S012');
ok('出现三处参照的对照', (await bodyBtns()).some(b => /只在旧图/.test(b)));
/* 每一处参照各自判断，判错只提示不推进 */
await clickRef('河弯', '只在新版');
ok('河弯判错不推进', !(await bodyBtns()).some(b => /地形改变/.test(b)));
await clickRef('河弯', '两张都有');
ok('河弯确认后还有别的参照要判', !(await bodyBtns()).some(b => /地形改变/.test(b)));
await clickRef('双峰', '只在新版');
ok('双峰判错不推进', !(await bodyBtns()).some(b => /地形改变/.test(b)));
await clickRef('双峰', '两张都有');
ok('双峰确认后还有渡口', !(await bodyBtns()).some(b => /地形改变/.test(b)));
await clickRef('渡口', '两张都有');
ok('渡口判错不推进', !(await bodyBtns()).some(b => /地形改变/.test(b)));
await clickRef('渡口', '只在旧图');
ok('三处参照都确认后才问结论', (await bodyBtns()).some(b => /地形改变/.test(b)));
await clickBody(/无法判断/);
ok('结论判错不推进', !(await bodyBtns()).some(b => /诺尔说得对/.test(b)));
await clickBody(/居民标注改变/);
await runToEnd('S012');
await endScene();
ok('A02 完成', await taskStatus('MQ1-A02') === 'done');
ok('登记了改版出处', !!(await story()).evidence.map_revision);
await useExit('city_academy');

/* ================= 五、A03 花园接待 ================= */
console.log('\n【5】MQ1-A03 花影不替人作答');
await travelToDistrict('北部公园');
eq('传到北部公园', await scene(), 'city');
ok('走到花园的接待桌', await openEntry('ms1_a03_garden', 90000));
eq('花园打开 S013', await winTitle(p), 'S013 · 白蔷薇城花园 · 日');
await runToEnd('S013');
ok('接待桌前有三位', (await bodyBtns()).some(b => /先看看他站哪儿/.test(b)));
await clickBody(/先看看他站哪儿/);
await clickBody(/先看看他站哪儿/);
await clickBody(/先看看他站哪儿/);
ok('三人都看清了', (await bodyBtns()).some(b => /先请他开口|再问这一位/.test(b)));
await clickBody(/先请他开口/);
ok('问过一位后拿到一条证言', !!(await story()).evidence.bell_testimony);
ok('还差一位才算摸清', (await bodyBtns()).some(b => /再问这一位/.test(b)));
await clickBody(/再问这一位/);
ok('两位都问过', (await bodyBtns()).some(b => /当着众人问|单独请到步道/.test(b)));
await clickBody(/单独请到步道/);
eq('私谈被记下', (await story()).flags.step_reception_mode, 'private');
ok('可以收束这一段', (await bodyBtns()).some(b => /这一段到此为止/.test(b)));
await clickBody(/这一段到此为止/);
await runToEnd('S013');
await endScene();
eq('同一花园，接着演步道那场', await winTitle(p), 'S014 · 同一花园 · 步道 · 日');
await runToEnd('S014');
ok('S014 给出主角的问题', (await bodyBtns()).some(b => /先问那个人亲眼见过什么/.test(b)));
await clickBody(/先问那个人亲眼见过什么/);
eq('问题已记录', (await story()).choices.a03_question, 'A');
await runToEnd('S014');
await endScene();
ok('A03 完成', await taskStatus('MQ1-A03') === 'done');

/* ================= 六、A04 选择与后果 ================= */
console.log('\n【6】MQ1-A04 那年未落的签名');
await travelToDistrict('西坡老城');
eq('传到西坡老城', await scene(), 'city');
ok('走进居民议事厅', await enterCityRoom('hall', 'city_hall'));
ok('走到议事厅档案角', await openEntry('ms1_a04_hall', 40000));
eq('议事厅打开 S015', await winTitle(p), 'S015 · 居民议事厅档案角 · 日');
await runToEnd('S015');
await endScene();
eq('同一议事厅，接着演门廊那场', await winTitle(p), 'S016 · 居民议事厅门廊 · 暮');
await runToEnd('S016');
ok('门廊给出公开/谨慎的选择', (await bodyBtns()).some(b => /让受影响的人也知道我们在查/.test(b)));
await clickBody(/让受影响的人也知道我们在查/);
eq('表态当场生效', (await story()).lenaStance, 'public');
await runToEnd('S016');
await endScene();
eq('表态已记录', (await story()).lenaStance, 'public');
ok('A04 完成', await taskStatus('MQ1-A04') === 'done');
ok('登记了逐户复核页副本', !!(await story()).evidence.household_page);
await useExit('city_hall');

/* ================= 七、A05 出发准备 ================= */
console.log('\n【7】MQ1-A05 蔷薇以北，长路初开');
await travelToDistrict('城堡与仪式核心');
eq('传到城堡核心区', await scene(), 'city');
const castleDoor = await p.evaluate(() => {
  const b = __MOSS__.CITY_BUILDINGS.filter(x => x.id === 'castle')[0];
  return b ? { x: b.door.x, y: b.door.y } : null;
});
ok('走到白蔷薇城堡门口', await walkTo(p, castleDoor.x, castleDoor.y + 1, 120000));
await p.keyboard.press('ArrowUp');
await p.keyboard.press('e');
await p.waitForTimeout(600);
await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
await p.waitForTimeout(400);
ok('进了宫城', /palace/.test(await scene()), await scene());
if (await scene() === 'palace_grounds') {
  const door = await p.evaluate(() => {
    const it = (window.__MOSS__.INTERACTABLES.palace_grounds || []).find(i => i.id === 'palace_main_door');
    return it ? { x: it.x, y: it.y, stand: it.stand } : null;
  });
  ok('走到宫城主门', await walkTo(p, door.stand[0][0], door.stand[0][1], 120000));
  await faceTowards(p, door.x, door.y);
  await p.keyboard.press('e');
  await p.waitForTimeout(700);
  await p.waitForFunction(() => (!__MOSS__.sceneSwitch || !__MOSS__.sceneSwitch.busy), null, { timeout: 9000 }).catch(() => { });
  await p.waitForTimeout(400);
}
eq('到一层门厅', await scene(), 'palace_f1');
ok('走到门厅事务台', await openEntry('ms1_a05_palace', 60000));
eq('门厅打开 S017', await winTitle(p), 'S017 · 宫城一层门厅 · 日');
await runToEnd('S017');
await endScene();
ok('登记了民用资料核验函', !!(await story()).evidence.civil_check);
eq('下一场在旅馆，不瞬移', await winTitle(p), '下一场在别处');
await closeWin(p);
await useExit('palace_f1');
await travelToDistrict('工人生活街');
ok('走进南门旅馆', await enterCityRoom('inn', 'city_inn'));
ok('走到旅馆行李桌', await openEntry('ms1_a05_inn', 40000));
eq('旅馆打开 S018', await winTitle(p), 'S018 · 南门旅馆行李桌 · 日');
await runToEnd('S018');
ok('S018 给出出发选择', (await bodyBtns()).some(b => /准备好了，我们出发/.test(b)));
await clickBody(/先等我回一趟农场/);
eq('出发选择已记录', (await story()).choices.a05_depart, 'B');
await runToEnd('S018');
await endScene();
ok('A05 完成（第一幕收口）', await taskStatus('MQ1-A05') === 'done');
ok('M0 之后的章节标为未实装', await p.evaluate(() => window.__MOSS__.storyTaskStatus('MQ1-B01')) === 'locked');

/* ================= 八、存档往返 ================= */
console.log('\n【8】第一幕存档往返');
await p.evaluate(() => window.__MOSS__.saveNow());
await p.waitForTimeout(400);
await p.reload();
await p.waitForFunction(() => !!window.__MOSS__);
await p.locator('.boot-actions button').first().click();
await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
const stReload = await story();
eq('读档后第一幕仍在', stReload.tasks['MQ1-A05'], 'done');
eq('读档后表态仍在', stReload.lenaStance, 'public');
eq('读档后接待方式仍在', stReload.flags.step_reception_mode, 'private');
eq('读档后证据仍在', !!stReload.evidence.civil_check, true);

ok('全程无控制台报错', r.errors.length === 0, r.errors.join('\n'));
console.log('\nPASS 第九版主线 M0 第一幕切片：' + checks + ' 项（' + (single ? '单文件版' : '源码') + '）');
await r.browser.close();
