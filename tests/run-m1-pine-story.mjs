/* M1 第二幕 S019—S028 专项。夹具给 M0 已验收的任务完成、P0-2 通行凭证及场景落点；
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
async function entry(sid) {
  await closeWin(p);
  const e=await p.evaluate(id=>window.__MOSS__.STORY_ENTRIES.find(e=>e.storyScene===id),sid);
  assert.ok(e,sid);
  await p.evaluate(e=>window.__MOSS__.devSwitchScene(e.scene,e.x,e.y),e);
  await p.keyboard.press('e'); await p.waitForTimeout(100);
  ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'真实 E 进入 '+sid);
}
async function stove() {
  if((await records()).repair) return;
  await at('ms1_pine_stove');
  await click('撑开窗户');await click('移开灶旁');await click('停火等待');await click('取赫莎备好');
}
async function supper() {
  if((await records()).supper) return;
  await at('ms1_pine_supper');await click('我洗菜备料');
}
async function ledger() {
  if(!(await records()).recent) {await at('ms1_pine_supper');await click('旅人说上个月');}
  if(!(await records()).ledger) {await at('ms1_pine_ledger');await click('伊文记过');}
}
async function guide() {
  if(await p.evaluate(()=>!!window.__MOSS__.state.story.evidence.echo_guide)) return;
  await at('ms1_pine_ledger');await click('约定赫莎带路');
}
async function roads(variant) {
  const defs=[['rock','标出裂边',['标清承重点','请赫莎带队']],['water','核对水痕',['沿已核验的高岸','随赫莎绕回']],['bridge','核对旧桥',['沿已核验的背风','退回稳固路段']]];
  for(let i=0;i<defs.length;i++) {
    const [key,inspect,choices]=defs[i];
    const current=await p.evaluate(()=>({day:window.__MOSS__.state.totalDay,weather:window.__MOSS__.state.weather.today}));
    const rec=(await records())[key+'Route'];
    if(rec&&rec.day===current.day&&rec.weather===current.weather) continue;
    await at('ms1_path_fork'+(i+1));await click(inspect);await click(choices[variant]);
  }
}
async function play(sid,variant) {
  await entry(sid);
  if(sid==='S022'&&variant) ok((await winText(p)).includes('不重修'),'提前修灶显示回忆接续，不制造第二次故障');
  for(let n=0;n<50;n++) {
    const line=await p.evaluate(sid=>{
      const M=window.__MOSS__,d=M.STORY_SCENES[sid],s=M.state.story.scenes[sid];
      const l=d.lines[s.idx];return !l?null:{step:l.step,choice:l.choice};
    },sid);
    if(!line) break;
    if(line.choice) {
      await p.locator('.story-options button').nth(variant).click();await p.waitForTimeout(60);
    } else if(line.step) {
      if(sid==='S020') await click('确认此次民用行程');
      if(sid==='S022') {await stove();await entry(sid);}
      if(sid==='S023') {await supper();await entry(sid);}
      if(sid==='S024') {await ledger();await entry(sid);}
      if(sid==='S025') {await guide();await entry(sid);}
      if(sid==='S026') {
        await roads(variant);await entry(sid);
        if(!variant) {
          await closeWin(p);await p.evaluate(()=>window.__MOSS__.sleepOnceForTest());
          await entry(sid);
          eq(await p.locator('.win-body button').filter({hasText:'核对已办记录，继续'}).count(),0,'跨夜后旧观察不能完成 B04');
          await roads(variant);await entry(sid);
        }
      }
      if(sid==='S027') await click('按分工安置旅人');
      if(sid==='S028') await click('核对留存副本');
      await click('核对已办记录，继续');
    } else {
      await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();await p.waitForTimeout(40);
    }
  }
  const before=await p.evaluate(()=>window.__MOSS__.state.sceneId);
  await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();await p.waitForTimeout(100);
  eq(await p.evaluate(s=>window.__MOSS__.state.story.scenes[s].seen,sid),true,sid+' 场次真正结案');
  eq(await p.evaluate(()=>window.__MOSS__.state.sceneId),before,sid+' 不替玩家换场景');
}
try {
  await boot(p);await p.locator('#tutorialSkip').click();
  const base=await p.evaluate(()=>{
    const M=window.__MOSS__,s=M.serialize();
    s.totalDay=12;s.timeMinutes=540;s.energy=100;s.coins=800;
    s.weather={today:'sun',tomorrow:'sun'};s.plots={};s.animals=[];
    M.STORY_TASKS.filter(t=>t.act<3).forEach(t=>s.story.tasks[t.id]='done');
    s.story.started=true;
    s.story.evidence.civil_check={id:'civil_check',title:'核验函',source:'M0 已验收夹具',day:11};
    s.story.evidence.neighbor_pass={id:'neighbor_pass',title:'邻领登记',source:'P0-2 已验收夹具',day:11};
    delete s.story.pineWork;delete s.story.pineChapter;
    return s;
  });
  const noLetter=structuredClone(base);delete noLetter.story.evidence.civil_check;
  const locked=await load(noLetter);
  eq(await p.evaluate(()=>window.__MOSS__.storyTaskStatus('MQ1-B01')),'locked','没有核验函不能开始第二幕');
  await p.evaluate(()=>window.__MOSS__.openStoryScene('S019'));
  ok(!await p.evaluate(()=>!!window.__MOSS__.state.story.scenes.S019),'缺函不能绕过任务闸门开场');
  await locked.close();
  for(const variant of [0,1]) {
    const ctx=await load(base);
    eq(await p.evaluate(()=>window.__MOSS__.state.story.pineChapter.records),{},'旧档不补做第二幕事务');
    const layout=await p.evaluate(()=>{
      const M=window.__MOSS__,bad=[];
      for(const e of M.STORY_ENTRIES.filter(e=>e.task.startsWith('MQ1-B'))) {
        if(M.isSolid(e.scene,e.x,e.y))bad.push(e.id+' solid');
        if(M.INTERACTABLES[e.scene].some(i=>i.id!==e.id&&i.x===e.x&&i.y===e.y))bad.push(e.id+' overlap');
      }return bad;
    });
    eq(layout,[],'十个剧情入口可站且不与既有入口同格');
    await p.evaluate(()=>window.__MOSS__.openStoryScene('S019'));
    ok(!await p.evaluate(()=>!!window.__MOSS__.state.story.scenes.S019),'主线日志不能远程开演');
    await closeWin(p);await p.evaluate(()=>window.__MOSS__.openStoryScene('S028'));
    ok(!await p.evaluate(()=>!!window.__MOSS__.state.story.tasks['MQ1-B05']),'不能跳过前章开启终场');
    if(variant) {await stove();await supper();await ledger();await guide();await roads(variant);}
    for(let i=19;i<=28;i++) await play('S0'+i,variant);
    const st=await p.evaluate(()=>window.__MOSS__.serialize());
    eq(['B01','B02','B03','B04','B05'].map(id=>st.story.tasks['MQ1-'+id]),Array(5).fill('done'),'五个任务按序完成');
    eq(st.story.pineChapter.records.help.choice,variant?'B':'A','救助分工按选择留档');
    ok(st.story.pineChapter.records.transfer.text.includes('潮汐港'),'转交单指向下一段真实目的地');
    ok(st.story.pineChapter.records.transfer.text.includes('留存号'),'错过信使仍有副本续查办法');
    eq(await p.evaluate(()=>window.__MOSS__.storyTaskStatus('MQ1-C01')),'locked','第三幕仍明确未实装');
    const review=await p.evaluate(()=>{
      const M=window.__MOSS__,before=M.serialize();delete before.savedAt;
      M.openStoryScene('S027');
      const after=M.serialize();delete after.savedAt;
      return {before,after};
    });
    ok((await winText(p)).includes('只回看'),'已演回看只读');
    eq(await p.locator('.win-body button').count(),0,'回看不能重新选择或再次办理救助');
    eq(review.after,review.before,'回看不改状态、时间或奖励（序列化时间戳不属于玩法状态）');
    const reload=await load(st);
    eq(await p.evaluate(()=>window.__MOSS__.state.story.pineChapter.records),st.story.pineChapter.records,'正式读档保留登记、救助与转交单');
    await p.evaluate(()=>window.__MOSS__.openStoryLog());
    ok((await winText(p)).includes('潮汐港转交单副本'),'主线日志可回看转交单证据');
    await reload.close();await ctx.close();
  }
  const broken=structuredClone(base);
  broken.story.evidence.pine_chapter_transfer={id:'pine_chapter_transfer',title:'伪副本',source:'bad',day:12};
  broken.story.pineChapter={records:{help:{choice:'C',day:-1,text:'bad',source:'bad'},transfer:{choice:'copy',day:12,text:'bad',source:'bad'}}};
  const bad=await load(broken);
  eq(await p.evaluate(()=>window.__MOSS__.state.story.pineChapter.records),{},'坏档不留下无救助的副本');
  ok(!await p.evaluate(()=>!!window.__MOSS__.state.story.evidence.pine_chapter_transfer),'坏档证据索引同步清理');
  await bad.close();eq(r.errors,[],'全程无控制台错误');
  console.log('PASS 白松第二幕：'+checks+' 项（'+(single?'单文件版':'源码')+'）');
} finally {await r.browser.close();}
