/* F04 专项：F03 接应、前章档案与初始落点为夹具；本人核名与补正通过真实 E 和按钮。
 * 不代表从新档自然走到终幕；--single-file 复跑入库产物。 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,faceTowards} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const click=async s=>{await p.getByRole('button',{name:s,exact:true}).click();await p.waitForTimeout(80);};
async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});p=await ctx.newPage();
 p.on('pageerror',e=>r.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();await click('继续游戏');await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);return ctx;
}
async function at(sid){
 await closeWin(p);const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);
 const it=await p.evaluate(([sc,w])=>{const x=__MOSS__.INTERACTABLES[sc].find(v=>v.work===w||v.id===w);return x?{...x,scene:sc}:null;},[e.scene,e.workSite]);
 assert.ok(it,'缺现场操作台 '+sid);const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);assert.ok(stand);
 await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[e.scene,stand]);await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(200);
 await click('办理 '+sid+' · '+e.label);ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'现场进入 '+sid);
}
async function finish(sid){
 await click('核对已办记录，继续');
 for(let n=0;n<20;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line)break;assert.ok(!line.step&&!line.choice,'尚有未处理事务');await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 const scene=await p.evaluate(()=>__MOSS__.state.sceneId);await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);eq(await p.evaluate(()=>__MOSS__.state.sceneId),scene,'跨场不瞬移 '+sid);
}
const roster=['与弥拉核对接应和旧门牌','请鲁恩本人确认到达时间并签名','与莱娜复核留守和未答复记录'];
const records=['核对原签核页及登记副本','对照救援事实与结项改写','领取伯兰书面说明','领取奥蕾尔正式调查通知'];
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=6).forEach(t=>st.tasks[t.id]='done');['MQ1-F01','MQ1-F02','MQ1-F03'].forEach(id=>st.tasks[id]='done');
  const rec=(choice,day,text)=>({day,choice,text,source:'真实前章夹具'});
  const ek=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'];
  const ec=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};ek.forEach((k,i)=>st.echoChapter.records[k]=rec(ec[i],17,'第五幕 '+k));
  const dk=['arrival','lodging','intake','witness','original','compare','questions','resolution','permit','departure'];
  const dc=['registered','A','classified','A','viewed','indexed','answered','A','limited','deferred'];
  st.capitalChapter={records:{},permitUntil:50};dk.forEach((k,i)=>st.capitalChapter.records[k]=rec(dc[i],16,'第四幕 '+k));
  st.pineChapter={records:{help:rec('A',15,'分头协作')}};
  const receipts=Object.fromEntries(['route','medical','food','receiver'].map(k=>[k,{day:18,source:'白松驿舍',text:'已确认 '+k}]));
  const snapshot={assignmentDay:18,care:'家务核对',roster:'第五幕 confirm',receipts};
  st.finaleChapter={records:{prepare:rec('preview',15,'筹备'),home:rec('A',15,'家务'),replies:rec('confirmed',18,'回执'),assignment:rec('A',18,'分工'),march:rec('A',19,'安全线'),reception:rec('received',19,'弥拉与孩子到达；留守和未答复未变')},
   support:{sentDay:17,receipts,checks:['names','handoff','experience'],experience:{id:'public',day:18}},
   f03:{attempts:[{startDay:19,role:'A',snapshot,steps:['water','sign','slope','detour'].map(id=>({id,day:19}))}],reception:['mira','care','pending'].map(id=>({id,day:19}))}};
  return M.serialize();
 });
 for(const recovered of [false,true]){
  const seed=structuredClone(base);
  if(recovered){const c=seed.story.finaleChapter,a=c.f03.attempts[0];a.steps=[];a.stop={reason:'unsafe',day:19};a.recovery={choice:'handover',day:19};a.verificationDay=19;c.records.march.choice='recovered';c.records.march.text='经恢复交接，主角并非全程在场';}
  const ctx=await load(seed);const original=await p.evaluate(()=>({capital:__MOSS__.capitalChapterState().records,echo:__MOSS__.echoChapterState().records}));
  await at('S065');eq(await p.getByRole('button',{name:'登记本人核名与照护',exact:true}).count(),0,'未核名不可登记');
  await click(roster[0]);eq(await p.getByRole('button',{name:roster[1],exact:true}).count(),1,'本人确认步骤单独出现');
  await click(roster[1]);await click(roster[2]);await click('登记本人核名与照护');
  let c=await p.evaluate(()=>__MOSS__.finaleChapterState());
  ok(c.records.roster.text.includes('鲁恩本人确认到达并签名'),'鲁恩本人确认才记录到达');ok(c.records.roster.text.includes('未答复户留空'),'未答复户不自动迁居');
  if(recovered)ok(c.records.roster.text.includes('并非全程在场'),'恢复路线不冒充全程在场');
  await finish('S065');await at('S066');
  for(const label of records)await click(label);await click('登记补正附页和调查通知');
  c=await p.evaluate(()=>__MOSS__.finaleChapterState());ok(c.records.amendment.text.includes('不删除、不覆盖'),'补正保留原件与历史');
  ok(c.records.amendment.text.includes('私人住址与病情不公开'),'个人信息不公开');
  eq(await p.evaluate(()=>({capital:__MOSS__.capitalChapterState().records,echo:__MOSS__.echoChapterState().records})),original,'前章原记录未改写');
  await finish('S066');eq(await p.evaluate(()=>__MOSS__.storyState().tasks['MQ1-F04']),'done','F04 两场完成');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f04.case.length),4,'补正步骤正式读档保留');
  c=await p.evaluate(()=>__MOSS__.serialize().story);const broken=structuredClone(c);broken.finaleChapter.f04.roster.pop();
  const fractional=structuredClone(c);['roster','case'].forEach(k=>fractional.finaleChapter.f04[k].forEach(v=>{v.minute+=0.25;}));
  const compatible=await p.evaluate(raw=>__MOSS__.normalizeStory(raw),fractional);
  eq(compatible.finaleChapter.f04.roster.length,3,'旧档小数时钟保留核名记录');
  eq(compatible.finaleChapter.f04.case.length,4,'旧档小数时钟保留补正记录');
  const fixed=await p.evaluate(raw=>__MOSS__.normalizeStory(raw),broken);
  eq(!!fixed.finaleChapter.records.roster,false,'缺本人核对不能保留核名结果');eq(!!fixed.finaleChapter.records.amendment,false,'坏档不能保留伪造补正');
  eq(fixed.tasks['MQ1-F04'],'active','坏档不能保留完成标记');await ctx.close();
 }
 eq(r.errors,[],'无浏览器错误');console.log('PASS 终幕 F04 核名与补正 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
