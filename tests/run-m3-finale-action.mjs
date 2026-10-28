/* F03 专项：第五幕、F01／F02 与军事资格为旧成果夹具；devSwitchScene 只设初始落点。
 * 出发、分工、停下、恢复和接应均由真实 E 与按钮产生；不代表新档自然到终幕。
 * 超时与资格失效直接改日／委任仅用于边界回归；--single-file 复跑入库产物。 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,faceTowards} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;console.log('PASS',label);};
const ok=(a,label)=>{assert.ok(a,label);checks++;console.log('PASS',label);};
const click=async text=>{await p.getByRole('button',{name:text,exact:true}).click();await p.waitForTimeout(80);};
async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});p=await ctx.newPage();
 p.on('pageerror',e=>r.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();await click('继续游戏');await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);return ctx;
}
async function at(sid){
 await closeWin(p);
 const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);
 const it=await p.evaluate(([sc,w])=>{const i=__MOSS__.INTERACTABLES[sc].find(x=>x.work===w||x.id===w);return i?{...i,scene:sc}:null;},[e.scene,e.workSite]);
 assert.ok(it,'缺现场操作台 '+sid);const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);assert.ok(stand);
 await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[e.scene,stand]);
 await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(200);await click('办理 '+sid+' · '+e.label);
 ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'现场进入 '+sid);
}
async function advance(sid){
 for(let i=0;i<20;i++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line||line.step)return;await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 throw Error('未到事务步骤 '+sid);
}
async function finish(sid){
 await click('核对已办记录，继续');await advance(sid);
 const before=await p.evaluate(()=>__MOSS__.state.sceneId);await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),before,'跨场不瞬移 '+sid);
}
const actions={A:['观察水线','固定路牌','标记松动坡边为禁入','请核验员确认缓坡替代线'],B:['与弥拉确认同行并向赫莎交接','与莱娜确认陪护并交接照护需求','与赫莎核对马丁的公共物资交接'],C:['核对授权范围与警戒边界','在指定路段协助人员撤离','与赫莎复盘护送与接应']};
const reception=['与弥拉本人核对到达及孩子的陪护','与娜汀核对已到人员的照护','与莱娜核对未到及未答复记录'];
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=6).forEach(t=>st.tasks[t.id]='done');st.tasks['MQ1-F01']='done';st.tasks['MQ1-F02']='done';
  const keys=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'];
  const choices=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};keys.forEach((k,i)=>st.echoChapter.records[k]={day:18,choice:choices[i],text:'前章已核事实 '+k,source:'第五幕现场'});
  const rec=(choice,text,day=19)=>({day,choice,text,source:'前章现场'});
  const receipts=Object.fromEntries(['route','medical','food','receiver'].map(k=>[k,{day:19,text:'已确认 '+k,source:'白松驿舍'}]));
  st.finaleChapter={records:{prepare:rec('preview','筹备',17),home:rec('A','家务',17),replies:rec('confirmed','回执'),assignment:rec('A','分工')},
   support:{sentDay:18,receipts,checks:['names','handoff','experience'],experience:{id:'public',day:19},authorization:null}};
  st.pineChapter={records:{help:{choice:'A',day:17,source:'白松山径',text:'分头协作'}}};
  return M.serialize();
 });
 for(const role of ['A','B','C']){
  const seed=structuredClone(base);seed.story.finaleChapter.records.assignment.choice=role;
  if(role==='C'){
   seed.story.finaleChapter.support.authorization={day:19,source:'邻领联络处'};
   seed.militaryLife={registered:true,rank:'squad_leader',commandLimit:12,appointmentDay:19,trainingDays:[17,18],unit:{id:'frontier_detail',count:0,wounded:0,training:1,scene:'camp'},battleRecords:[]};
  }
  const ctx=await load(seed);await at('S063');await advance('S063');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts.length),0,role+' 读对白不启动窗口');
  const before=await p.evaluate(()=>({day:__MOSS__.state.totalDay,coins:__MOSS__.state.coins,weather:__MOSS__.state.weather}));
  await click('现在出发');let f=await p.evaluate(()=>__MOSS__.finaleChapterState().f03);
  eq(f.attempts[0].startDay,before.day,role+' 现场确认启动');eq(f.attempts[0].role,role,role+' 分工快照');
  await p.reload();await click('继续游戏');await at('S063');await advance('S063');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[0].startDay),before.day,role+' 读档不重置起始日');
  for(const label of actions[role])await click(label);
  await click('登记本段行动');await finish('S063');await at('S064');await advance('S064');
  for(const label of reception)await click(label);await click('登记接应与照护');await finish('S064');
  f=await p.evaluate(()=>__MOSS__.finaleChapterState().f03);
  eq(f.reception.length,3,role+' 三项现场核对');eq(await p.evaluate(()=>__MOSS__.storyState().tasks['MQ1-F03']),'done',role+' 两场完成');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before.coins,role+' 公共接应不扣私人金币');
  eq(await p.evaluate(()=>__MOSS__.state.weather),before.weather,role+' 不改农场天气');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.reception.length),3,role+' 接应正式读档保留');
  await ctx.close();
 }
 for(const mode of ['unsafe','late','left']){
  const ctx=await load(structuredClone(base));await at('S063');await advance('S063');await click('现在出发');await click(actions.A[0]);
  if(mode==='unsafe')await click('新测线不合格，停止推进');
  if(mode==='late'){await p.evaluate(()=>{__MOSS__.state.totalDay+=3;__MOSS__.openStoryScene('S063');});}
  if(mode==='left'){await closeWin(p);await p.evaluate(()=>__MOSS__.devSwitchScene('farm',10,10));await at('S063');await advance('S063');}
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[0].stop.reason),mode,mode+' 停止原因留档');
  await click(mode==='unsafe'?'补齐并约下一窗口':'交接本段，参与后续核名');
  const a=await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[0]);eq(a.steps.length,1,mode+' 恢复保留已完成段');
  if(mode==='unsafe'){
   await click('现在出发');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts.length),2,'重新约定保留两次窗口');
  }else{
   eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records.march.choice),'recovered',mode+' 明确经恢复交接');
  }
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[0].recovery.choice),mode==='unsafe'?'retry':'handover',mode+' 恢复正式读档保留');
  if(mode!=='unsafe'){
   await at('S063');await advance('S063');await finish('S063');await at('S064');await advance('S064');
   eq(await p.getByRole('button',{name:reception[0],exact:true}).count(),0,mode+' 未复核安全线不能登记接应');
   await click('请核验员确认恢复后的安全线');for(const label of reception)await click(label);
   await click('登记接应与照护');await finish('S064');
   ok((await p.evaluate(()=>__MOSS__.finaleChapterState().records.reception.text)).includes('并非全程在场'),mode+' 如实记录恢复交接');
  }
  await ctx.close();
 }
 {
  const seed=structuredClone(base);seed.story.finaleChapter.records.assignment.choice='C';
  seed.story.finaleChapter.support.authorization={day:19,source:'邻领联络处'};
  seed.militaryLife={registered:true,rank:'squad_leader',commandLimit:12,appointmentDay:19,trainingDays:[17,18],unit:{id:'frontier_detail',count:0,wounded:0,training:1,scene:'camp'},battleRecords:[]};
  const ctx=await load(seed);await at('S063');await advance('S063');await click('现在出发');await click(actions.C[0]);
  await p.evaluate(()=>{__MOSS__.state.militaryLife.core.commission.expiresDay=__MOSS__.state.totalDay-1;__MOSS__.openStoryScene('S063');});
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[0].stop.reason),'authorization','委任失效后停止护送');
  eq(await p.getByRole('button',{name:actions.C[1],exact:true}).count(),0,'失效后不再显示护送操作');
  await click('补齐并约下一窗口');await click('现在出发');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts[1].role),'B','资格失效后可改走民用保底');await ctx.close();
 }
 {
  const ctx=await load(structuredClone(base));
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f03.attempts.length),0,'旧档只补空窗口');
  const broken=await p.evaluate(()=>{const M=__MOSS__,s=M.serialize().story;s.finaleChapter.records.march={day:20,choice:'A',source:'伪造',text:'未发生'};return M.normalizeStory(s).finaleChapter;});
  eq(!!broken.records.march,false,'没有行动记录的坏档不能补造本段完成');await ctx.close();
 }
 eq(r.errors,[],'无浏览器错误');console.log('PASS 终幕 F03 行动与恢复 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
