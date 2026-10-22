/* M1 第三幕 S029—S038 专项。夹具给 M0／P0-2 已验收的核验函、航路凭证与
 * 第二幕完成状态；所有事务与演出步骤均走到操作台／剧情入口按 E、点击真实按钮产生。
 * 三条接应分工分别从空白旧档开始；重载走正式“继续游戏”，跨日走真实结算函数。
 * devSwitchScene 只证明局部交互与回归，不冒充新档自然路线或实体手机验收。
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, walkTo, winText } from './harness.mjs';
const single = process.argv.includes('--single-file');
const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
let p = r.page, checks = 0;
const eq = (a, b, n) => { assert.deepEqual(a, b, n); checks++; console.log('PASS', n); };
const ok = (v, n) => { assert.ok(v, n); checks++; console.log('PASS', n); };
const work = () => p.evaluate(() => window.__MOSS__.state.story.tideWork.records);
const chap = () => p.evaluate(() => window.__MOSS__.state.story.tideChapter.records);
async function click(text) {
  await p.locator('.win-body button').filter({ hasText: text }).first().click();
  await p.waitForTimeout(80);
}
async function at(site) {
  await closeWin(p);
  const point = await p.evaluate(id => {
    const M = window.__MOSS__;
    for (const sc of Object.keys(M.INTERACTABLES)) {
      const it = M.INTERACTABLES[sc].find(i => i.work === id);
      if (it) return { sc, x: it.x, y: it.y, stand: it.stand };
    }
  }, site);
  assert.ok(point, site);
  await p.evaluate(pt => window.__MOSS__.devSwitchScene(pt.sc, pt.stand[0][0], pt.stand[0][1]), point);
  let opened = false;
  for (const [x, y] of point.stand) {
    const ax = x + (x - point.x), ay = y + (y - point.y);
    if (!await walkTo(p, ax, ay, 8000)) continue;
    if (!await walkTo(p, x, y, 8000)) continue;
    await p.keyboard.press('e');
    await p.waitForTimeout(100);
    if (await p.locator('.win-title').filter({ hasText: /报关棚|货箱堆场|缆桩|分拣台|复诊记录/ }).count()) { opened = true; break; }
    await closeWin(p);
  }
  ok(opened, '真实 E 打开 ' + site);
}
async function load(seed) {
  const ctx = await r.browser.newContext({ viewport: { width: 1100, height: 820 } });
  p = await ctx.newPage();
  p.on('pageerror', e => r.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') r.errors.push(m.text()); });
  await p.goto(r.page.url());
  await p.evaluate(s => { localStorage.clear(); localStorage.setItem('moss-farm-v2', JSON.stringify(s)); }, seed);
  await p.reload();
  await p.getByRole('button', { name: /继续游戏/ }).click();
  await p.waitForFunction(() => window.__MOSS__.state && document.getElementById('boot').hidden);
  return ctx;
}
async function entry(sid) {
  await closeWin(p);
  const e = await p.evaluate(id => window.__MOSS__.STORY_ENTRIES.find(e => e.storyScene === id), sid);
  assert.ok(e, sid);
  await p.evaluate(e => window.__MOSS__.devSwitchScene(e.scene, e.x, e.y), e);
  await p.keyboard.press('e');
  await p.waitForTimeout(100);
  ok((await p.locator('.win-title').textContent()).startsWith(sid + ' ·'), '真实 E 进入 ' + sid);
}
/* 五处操作台：全部走到位置按 E，点真实按钮产生事实。
 * variant 0 走正路，1 与 2 换另一种做法——两种做法都要留下真实记录。 */
async function doWork(variant) {
  const bad = variant === 1;
  await at('ms1_tide_customs'); await click(bad ? '只看板面就放行' : '按清册逐件核对');
  await at('ms1_tide_cargo'); await click(bad ? '按到货先后堆成一垛' : '按三标归置公共空箱');
  await at('ms1_tide_bollard'); await click(bad ? '只把绳理顺就位' : '逐个查缆桩与缆绳磨损');
  await at('ms1_tide_sort'); await click(bad ? '按件号合排' : '分三堆并查到转交号');
  await at('ms1_tide_chart'); await click(bad ? '直接抄走整份病历' : '先问同意再取同行事实');
}
async function play(sid, variant) {
  await entry(sid);
  for (let n = 0; n < 60; n++) {
    const line = await p.evaluate(sid => {
      const M = window.__MOSS__, d = M.STORY_SCENES[sid], s = M.state.story.scenes[sid];
      const l = d.lines[s.idx]; return !l ? null : { step: l.step, choice: l.choice, action: l.action };
    }, sid);
    if (!line) break;
    if (line.choice) {
      /* S035 的分工选项顺序固定为 A／B／C；分工变体决定选第几个。 */
      const idx = line.choice === 'c04_role' ? variant : 0;
      await p.locator('.story-options button').nth(idx).click();
      await p.waitForTimeout(60);
    } else if (line.step) {
      if (sid === 'S030') { await doWork(variant); await entry(sid); }
      if (sid === 'S031') { await entry(sid); }
      if (sid === 'S033') { await entry(sid); }
      if (sid === 'S035') { await entry(sid); }
      await click(/按三标归置公共空箱|重新按三标归箱|问过同意后取同行登记|重新询问本人同意|按船名与日期配对|按日期排序并分类|重新分三堆|整理三张材料|按分工完成岸上接应|补查磨损并换绳|寄出核验申请与家书|收好证言与材料副本/);
      await click('核对已办记录，继续');
    } else {
      await p.locator('.win-foot button').filter({ hasText: /^继续$/ }).click();
      await p.waitForTimeout(40);
    }
  }
  const before = await p.evaluate(() => window.__MOSS__.state.sceneId);
  await p.locator('.win-foot button').filter({ hasText: /^继续$/ }).click();
  await p.waitForTimeout(100);
  eq(await p.evaluate(s => window.__MOSS__.state.story.scenes[s].seen, sid), true, sid + ' 场次真正结案');
  eq(await p.evaluate(() => window.__MOSS__.state.sceneId), before, sid + ' 不替玩家换场景');
}
try {
  await boot(p); await p.locator('#tutorialSkip').click();
  /* 夹具直接改活状态：serialize() 末尾会深拷贝，改副本不会生效。 */
  const base = await p.evaluate(() => {
    const M = window.__MOSS__;
    const st = M.storyState();
    M.state.totalDay = 20; M.state.timeMinutes = 540; M.state.energy = 100; M.state.coins = 800;
    M.state.weather = { today: 'sun', tomorrow: 'sun' }; M.state.plots = {}; M.state.animals = [];
    M.STORY_TASKS.filter(t => t.act < 4).forEach(t => { st.tasks[t.id] = 'done'; });
    st.started = true;
    st.evidence.civil_check = { id: 'civil_check', title: '核验函', source: 'M0 已验收夹具', day: 19 };
    st.evidence.tide_route = { id: 'tide_route', title: '航路引荐信', source: 'P0-2 已验收夹具', day: 19 };
    /* 河港调查记录是航路线的既有前置（P0-2 夹具），不是第三幕新造的门槛。
   normalizeWetlandLife 要求许可与两个样本、调查次数齐备，causeFound 才成立。 */
    const wl = M.wetlandLifeState();
    wl.permit = true; wl.upstreamSample = true; wl.outfallSample = true;
    wl.surveyCount = 1; wl.causeFound = true;
    delete st.tideWork; delete st.tideChapter;
    return M.serialize();
  });
  const noRoute = structuredClone(base);
  delete noRoute.story.evidence.tide_route;
  const locked = await load(noRoute);
  eq(await p.evaluate(() => window.__MOSS__.storyTaskStatus('MQ1-C01')), 'locked', '没有航路凭证不能开始第三幕');
  ok((await p.evaluate(() => window.__MOSS__.storyCEntryReason())).includes('航路'), '缺项写明要办哪一项');
  await p.evaluate(() => window.__MOSS__.openStoryScene('S029'));
  ok(!await p.evaluate(() => !!window.__MOSS__.state.story.scenes.S029), '缺凭证不能绕过任务闸门开场');
  await locked.close();

  /* 三轮：第一轮走正路，其余两轮换事务做法与接应分工（A／B／C 各一轮）。 */
  for (const variant of [0, 1, 2]) {
    const ctx = await load(base);
    eq(await work(), {}, '旧档不补做潮汐港事务 ' + variant);
    eq(await chap(), {}, '旧档不补做第三幕记录 ' + variant);
    const layout = await p.evaluate(() => {
      const M = window.__MOSS__, bad = [];
      for (const e of M.STORY_ENTRIES.filter(e => e.task.startsWith('MQ1-C'))) {
        if (M.isSolid(e.scene, e.x, e.y)) bad.push(e.id + ' solid');
        if (M.INTERACTABLES[e.scene].some(i => i.id !== e.id && i.x === e.x && i.y === e.y)) bad.push(e.id + ' overlap');
      }
      return bad;
    });
    eq(layout, [], '十个第三幕入口可站且不与既有入口同格');
    await p.evaluate(() => window.__MOSS__.openStoryScene('S029'));
    ok(!await p.evaluate(() => !!window.__MOSS__.state.story.scenes.S029), '主线日志不能远程开演第三幕');
    await closeWin(p);
    await p.evaluate(() => window.__MOSS__.openStoryScene('S038'));
    ok(!await p.evaluate(() => !!window.__MOSS__.state.story.tasks['MQ1-C05']), '不能跳过前章开启第三幕终场');
    for (let i = 29; i <= 38; i++) await play('S0' + i, variant);
    const st = await p.evaluate(() => window.__MOSS__.serialize());
    eq(['C01', 'C02', 'C03', 'C04', 'C05'].map(id => st.story.tasks['MQ1-' + id]), Array(5).fill('done'), '五个任务按序完成');
    eq(st.story.tideChapter.records.rescue.choice, ['A', 'B', 'C'][variant], '接应分工按选择留档');
    eq(st.story.tideWork.records.chart.choice, variant === 1 ? 'copy' : 'consent', '病历取得方式按实际点击留档');
    ok(st.story.tideChapter.records.chart.text.includes('本人同意'), '病历取得写明本人同意');
    ok(st.story.tideChapter.records.sort.text.includes('档案院'), '抄件不能直接撤销工程，原件仍在档案院');
    ok(st.story.tideChapter.records.letter.text.includes('照料'), '家书按真实照料结果写');
    ok(st.story.tideChapter.records.letter.text.includes('没有需要委托') && st.story.tideChapter.records.letter.text.includes('缺料 0 天'), '空农场家书如实记录无需委托与零缺料');
    if (variant === 1) {
      ok(st.story.tideChapter.records.chart.text.includes('先前抄整本被拒'), '失败取得病历后必须明确重新取得同意');
      ok(st.story.tideChapter.records.cargo.text.includes('重新分箱'), '堵塞通道后明确重新归箱');
      ok(st.story.tideChapter.records.rescue.text.includes('更换不合用的绳'), '遗漏检查后接应前明确补查换绳');
    }
    ok(st.story.tideChapter.records.dispatch.text.includes('专款'), '公共差旅列任务专款，不动个人贷款');
    eq(await p.evaluate(() => window.__MOSS__.storyTaskStatus('MQ1-D01')), 'locked', '第四幕仍未实装');
    const review = await p.evaluate(() => {
      const M = window.__MOSS__, before = M.serialize(); delete before.savedAt;
      M.openStoryScene('S036');
      const after = M.serialize(); delete after.savedAt;
      return { before, after };
    });
    ok((await winText(p)).includes('只回看'), '已演回看只读');
    eq(await p.locator('.win-body button').count(), 0, '回看不能重新选择或再次办理接应');
    eq(review.after, review.before, '回看不改状态、时间或奖励（序列化时间戳不属于玩法状态）');
    const reload = await load(st);
    eq(await p.evaluate(() => window.__MOSS__.state.story.tideChapter.records), st.story.tideChapter.records, '正式读档保留第三幕记录');
    await p.evaluate(() => window.__MOSS__.openStoryLog());
    ok((await winText(p)).includes('潮汐港现场记录'), '主线日志可回看潮汐港事务');
    await reload.close(); await ctx.close();
  }
  const broken = structuredClone(base);
  broken.story.evidence.tide_chapter_dispatch = { id: 'tide_chapter_dispatch', title: '伪证言', source: 'bad', day: 20 };
  broken.story.tideChapter = { records: { dispatch: { choice: 'kept', day: 20, text: 'bad', source: 'bad' } } };
  const bad = await load(broken);
  eq(await p.evaluate(() => window.__MOSS__.state.story.tideChapter.records), {}, '坏档不留下缺前置的证言');
  ok(!await p.evaluate(() => !!window.__MOSS__.state.story.evidence.tide_chapter_dispatch), '坏档证据索引同步清理');
  await bad.close();
  eq(r.errors, [], '全程无控制台错误');
  console.log('PASS 潮汐港第三幕：' + checks + ' 项（' + (single ? '单文件版' : '源码') + '）');
} finally { await r.browser.close(); }
