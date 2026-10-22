/* P0-3 白松独立现场事务。夹具只给 P0-2 已验收的通行凭证及场景落点；
 * 所有事务均走到操作台按 E、点击真实按钮产生。分支分别从空白旧档开始。
 * devSwitchScene / 天气日期夹具只证明局部交互与回归，不冒充新档自然路线或实体手机。
 * 重载走正式“继续游戏”，跨日走真实结算函数；不直接写事务完成字段。
 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, walkTo, winText } from './harness.mjs';
const single = process.argv.includes('--single-file');
const r = await launch(single ? { url: new URL('../苔芽农场-单文件版.html', import.meta.url).href } : {});
let p = r.page, checks = 0;
const eq = (a,b,n) => { assert.deepEqual(a,b,n); checks++; console.log('PASS',n); };
const ok = (v,n) => { assert.ok(v,n); checks++; console.log('PASS',n); };
const records = () => p.evaluate(() => window.__MOSS__.state.story.pineWork.records);
async function click(text) {
  await p.locator('.win-body button').filter({hasText:text}).first().click();
  await p.waitForTimeout(80);
}
async function at(site, changeScene = true) {
  await closeWin(p);
  const point = await p.evaluate(id => {
    const M=window.__MOSS__;
    for(const sc of Object.keys(M.INTERACTABLES)) {
      const it=M.INTERACTABLES[sc].find(i=>i.work===id);
      if(it) return {sc,x:it.x,y:it.y,stand:it.stand};
    }
  },site);
  assert.ok(point,site);
  if(changeScene) await p.evaluate(pt=>window.__MOSS__.devSwitchScene(pt.sc,pt.stand[0][0],pt.stand[0][1]),point);
  let opened=false;
  for(const [x,y] of point.stand) {
    const ax=x+(x-point.x), ay=y+(y-point.y);
    if(!await walkTo(p,ax,ay,8000)) continue;
    if(!await walkTo(p,x,y,8000)) continue;
    await p.keyboard.press('e');
    await p.waitForTimeout(100);
    if(await p.locator('.win-title').filter({hasText:/旧路牌|炉灶|共同晚餐|停运登记|碎石坡|浅溪|风口/}).count()) {opened=true;break;}
    await closeWin(p);
  }
  ok(opened,'真实 E 打开 '+site);
}
async function load(seed) {
  const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});
  p=await ctx.newPage();
  p.on('pageerror',e=>r.errors.push(e.message));
  p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
  await p.goto(r.page.url());
  await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
  await p.reload();
  await p.getByRole('button',{name:/继续游戏/}).click();
  await p.waitForFunction(()=>window.__MOSS__.state && document.getElementById('boot').hidden);
  return ctx;
}
try {
  await boot(p); await p.locator('#tutorialSkip').click();
  const base=await p.evaluate(()=>{
    const M=window.__MOSS__, s=M.serialize();
    s.totalDay=12;s.timeMinutes=540;s.energy=100;s.coins=800;
    s.weather={today:'sun',tomorrow:'sun'};
    s.story.evidence.civil_check={id:'civil_check',title:'核验函',source:'M0 已验收夹具',day:11};
    s.story.evidence.neighbor_pass={id:'neighbor_pass',title:'邻领登记',source:'P0-2 已验收夹具',day:11};
    delete s.story.pineWork;
    return s;
  });
  for(const variant of [0,1]) {
    const ctx=await load(base);
    eq(await records(),{},'旧档缺字段不补造事务 '+variant);
    const original=await p.evaluate(()=>({coins:window.__MOSS__.state.coins,inv:window.__MOSS__.state.inventory,tasks:window.__MOSS__.state.story.tasks}));
    await at('ms1_path_fork1');
    ok((await winText(p)).includes('约定带路'),'无向导时说明缺项');
    eq(await p.locator('.win-body button').count(),0,'无向导不能观察或选路');
    await at('ms1_pine_supper');
    ok((await winText(p)).includes('先完成：炉灶小事务'),'未修灶不能做晚餐');
    await at('ms1_pine_sign'); await click('核对停运告示');
    await at('ms1_pine_stove');
    eq(await p.locator('.win-body button').count(),1,'只有安全第一步可操作');
    await click('撑开窗户'); await click('移开灶旁'); await click('停火等待');
    eq(await p.locator('.win-body button').count(),2,'冷却后提供两种无天赋门槛修法');
    await click(variant?'取赫莎备好':'固定可修');
    eq((await records()).repair.choice,variant?'spare':'fix','修灶选择留档');
    await at('ms1_pine_stove',false);
    eq(await p.locator('.win-body button').count(),0,'修完重开不重复操作');
    await at('ms1_pine_supper');
    await click(variant?'我清理餐桌':'我洗菜备料'); await click('旅人说上个月');
    ok((await records()).recent.text.includes('不能据此确认亲子关系'),'见闻保留事实边界');
    await at('ms1_pine_ledger'); await click('伊文记过'); await click('约定赫莎带路');
    const ledger=(await records()).ledger;
    ok(ledger.text.includes('灾后第二年')&&ledger.text.includes('是否送达尚不明'),'历史时间与送达不确定性保留');
    eq(ledger.day,12,'查阅日期独立于历史日期');
    for(const [i,key,inspect,options] of [
      [1,'rock','标出裂边',['标清承重点','请赫莎带队']],
      [2,'water','核对水痕',['沿已核验的高岸','随赫莎绕回']],
      [3,'bridge','核对旧桥',['沿已核验的背风','退回稳固路段']]
    ]) {
      await at('ms1_path_fork'+i);
      eq(await p.locator('.win-body button').count(),1,'先观察再选路 '+key);
      await click(inspect);
      eq(await p.locator('.win-body button').count(),2,'每处有两种安全走法 '+key);
      await click(options[variant]);
      const record=(await records())[key+'Route'];
      eq(record.day,12,'选路写操作日 '+key);
      ok(record.source.includes('外段'),'选路只证明外段 '+key);
      await at('ms1_path_fork'+i,false);
      eq(await p.locator('.win-body button').count(),0,'同日重进不重复记录 '+key);
    }
    const all=await records();
    eq(Object.keys(all).length,14,'七处工作台共十四项事实');
    const after=await p.evaluate(()=>({coins:window.__MOSS__.state.coins,inv:window.__MOSS__.state.inventory,tasks:window.__MOSS__.state.story.tasks}));
    eq(after,original,'不偷扣物品金币、不替玩家完成剧情');
    await closeWin(p); await p.evaluate(()=>window.__MOSS__.openStoryLog());
    ok((await winText(p)).includes('白松现场记录'),'主线日志展示同一份事实');
    ok((await winText(p)).includes('赫莎出示'),'日志写出来源');
    const saved=await p.evaluate(()=>window.__MOSS__.serialize());
    const reload=await load(saved);
    eq(await records(),all,'正式读档完整保留记录与选择');
    await at('ms1_pine_ledger');
    eq(await p.locator('.win-body button').count(),0,'读档不重办证据或带路约定');
    if(variant===0) {
      await closeWin(p);
      await p.evaluate(()=>window.__MOSS__.sleepOnceForTest());
      await closeWin(p);
      await at('ms1_path_fork2');
      eq(await p.locator('.win-body button').count(),1,'跨日只能先重新观察');
      ok((await winText(p)).includes('当天、同一天气'),'旧观察不能授权新一天选路');
      await p.evaluate(()=>{window.__MOSS__.state.weather.today='rain';});
      await at('ms1_path_fork2'); await click('核对水痕'); await click('沿已核验的高岸');
      ok((await records()).waterRoute.text.includes('雨天水涨'),'雨天观察和选路保存天气快照');
      eq((await records()).ledger,ledger,'跨日不改写历史账页快照');
      await p.setViewportSize({width:390,height:844});
      await at('ms1_pine_supper');
      ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'390 像素面板不横向溢出');
      const broken=structuredClone(saved);
      broken.story.pineWork.records.vent.day=-1;
      broken.story.pineWork.records.rockRoute.choice='fly';
      broken.story.pineWork.records.waterLook.text={bad:true};
      broken.story.pineWork.records.phantom={choice:'free',day:12};
      const badctx=await load(broken), clean=await records();
      ok(!clean.vent&&!clean.clear&&!clean.cool&&!clean.repair&&!clean.supper&&!clean.recent,'损坏的前置不留下伪完成后续');
      ok(!clean.rockRoute&&!clean.waterLook&&!clean.waterRoute&&!clean.phantom,'非法选项、文本和未知键安全清除');
      ok(await p.evaluate(()=>!window.__MOSS__.state.story.evidence.pine_work_rockRoute&&!window.__MOSS__.state.story.evidence.pine_work_repair),'坏事务不会残留证据索引');
      eq(await p.evaluate(()=>{
        const M=window.__MOSS__,a=M.normalizeStory(M.state.story);return JSON.stringify(a)===JSON.stringify(M.normalizeStory(a));
      }),true,'归一化幂等');
      await badctx.close();
    }
    await reload.close(); await ctx.close();
  }
  eq(r.errors,[],'全程无控制台错误');
  console.log('PASS 白松现场事务：'+checks+' 项（'+(single?'单文件版':'源码')+'）');
} finally {await r.browser.close();}
