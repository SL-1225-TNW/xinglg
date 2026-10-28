/* 后日谈专项：F05 与之前的档案、各场初始落点为夹具；来物、约定、选择和收尾由真实 E 与按钮产生。
 * 不代表新档自然走到后日谈；--single-file 复跑入库产物。 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,faceTowards,walkTo} from './harness.mjs';
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
 assert.ok(it,'缺现场入口 '+sid);const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);assert.ok(stand,'入口缺可用站位 '+sid);
 await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[e.scene,stand]);await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(200);
 await click('办理 '+sid+' · '+e.label);ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'现场进入 '+sid);
}
async function next(sid,choice){
 for(let n=0;n<25;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line||line.step)return;
  if(line.choice){assert.notEqual(choice,undefined,'缺选择 '+sid);await p.locator('.story-options button').nth(choice).click();}
  else await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 throw Error('未到事务步骤 '+sid);
}
async function finish(sid){
 await click('核对已办记录，继续');await next(sid);
 const sc=await p.evaluate(()=>__MOSS__.state.sceneId);await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);eq(await p.evaluate(()=>__MOSS__.state.sceneId),sc,'跨场不瞬移 '+sid);
}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=7).forEach(t=>st.tasks[t.id]='done');
  const rec=(choice,day,text)=>({day,choice,text,source:'前章现场夹具'});
  const ek=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'],ec=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};ek.forEach((k,i)=>st.echoChapter.records[k]=rec(ec[i],12,'第五幕 '+k));
  const dk=['arrival','lodging','intake','witness','original','compare','questions','resolution','permit','departure'],dc=['registered','A','classified','A','viewed','indexed','answered','A','limited','deferred'];
  st.capitalChapter={records:{},permitUntil:50};dk.forEach((k,i)=>st.capitalChapter.records[k]=rec(dc[i],11,'第四幕 '+k));
  st.pineChapter={records:{help:rec('A',11,'分头协作')}};
  const receipts=Object.fromEntries(['route','medical','food','receiver'].map(k=>[k,{day:15,source:'白松驿舍',text:'确认 '+k}]));
  const snapshot={assignmentDay:15,care:'家务核对',roster:'第五幕 confirm',receipts},steps=(ids,day)=>ids.map((id,i)=>({id,day,minute:600+i}));
  st.finaleChapter={records:{prepare:rec('preview',13,'筹备'),home:rec('A',13,'家务'),replies:rec('confirmed',15,'回执'),assignment:rec('A',15,'分工'),march:rec('A',16,'安全线'),reception:rec('received',16,'弥拉与孩子到达'),roster:rec('confirmed',17,'本人核名'),amendment:rec('appended',17,'保留原件'),settlement:rec('C',18,'安置、联络和维护'),route_map:rec('posted',18,'修订地图')},
   support:{sentDay:14,receipts,checks:['names','handoff','experience'],experience:{id:'public',day:15}},
   f03:{attempts:[{startDay:16,role:'A',snapshot,steps:['water','sign','slope','detour'].map(id=>({id,day:16}))}],reception:['mira','care','pending'].map(id=>({id,day:16}))},
   f04:{roster:steps(['mira','ruen','others'],17),case:steps(['original','history','statement','notice'],17)},
   f05:{arrangements:steps(['mira','ruen','stay','maintenance','participation'],18),map:steps(['facts','limits','post'],18)}};
  st.finaleChapter.f04.case.forEach((v,i)=>{v.minute=610+i;});
  st.finaleChapter.f05.arrangements[3].reviewDay=25;st.finaleChapter.f05.arrangements[4].choice='C';st.finaleChapter.f05.map.forEach((v,i)=>{v.minute=610+i;});
  return M.serialize();
 });
 for(let mode=0;mode<3;mode++){
  const seed=structuredClone(base);if(mode===2){seed.farmCare.shortageDays=2;seed.farmCare.lastSummary='饲料不足，照料暂停';}
  const ctx=await load(seed);const before=await p.evaluate(()=>({day:__MOSS__.state.totalDay,time:__MOSS__.state.timeMinutes,coins:__MOSS__.state.coins,seeds:__MOSS__.state.inventory.seed_radish||0,weather:structuredClone(__MOSS__.state.weather)}));
  await at('S069');await next('S069');
  const order=mode===1?['查看来信']:['查看修订地图','查看食谱','查看来信'];
  for(const label of order)await click(label);await click('收好三件来物');
  eq(await p.evaluate(()=>__MOSS__.state.inventory.seed_radish),before.seeds+3,'普通种子一次性领取');
  ok(await p.evaluate(()=>__MOSS__.state.unlockedRecipes.includes('epilogue_soup')),'食谱实际解锁');
  await finish('S069');await at('S070');await next('S070');await click('张贴经允许的后续消息');await finish('S070');
  await at('S071');await next('S071',mode%2);
  if(mode===2)ok((await p.locator('.win-body').textContent()).includes('缺料 2 天'),'家务缺料按账本如实提示');
  await click('与伊文约定到访');await finish('S071');
  await at('S072');await next('S072',mode%2);await click('回应伊文的敲门');await finish('S072');
  await at('S073');await next('S073',mode);await click('记下自己的选择');await finish('S073');
  eq(await p.evaluate(()=>__MOSS__.state.sceneId),'house','结尾继续留在农舍');
  await next('S074');
  ok(await p.evaluate(()=>__MOSS__.storyState().tasks['MQ1-G03']!=='done'),'未完成普通收尾不能结束本部');
  if(mode===2){
   await click('去门边保存并关门');
   const door=await p.evaluate(()=>__MOSS__.INTERACTABLES.house.find(x=>x.kind==='indoorExit'));
   ok(await walkTo(p,door.stand[0][0],door.stand[0][1]),'真实走到农舍门旁');await faceTowards(p,door.x,door.y);await p.keyboard.press('e');await p.waitForTimeout(100);
   /* 关窗后主循环恢复走时；在同一真实点击事件的捕获／冒泡阶段读动作前后时钟。 */
   await p.evaluate(()=>{
    window.__epilogueDoorClock={};
    const match=e=>e.target.closest('button')?.textContent.trim()==='保存并关门';
    const before=e=>{if(match(e))window.__epilogueDoorClock.before=__MOSS__.state.timeMinutes;};
    const after=e=>{if(match(e)){window.__epilogueDoorClock.after=__MOSS__.state.timeMinutes;document.removeEventListener('click',before,true);document.removeEventListener('click',after);}};
    document.addEventListener('click',before,true);document.addEventListener('click',after);
   });
   await click('保存并关门');const doorClock=await p.evaluate(()=>window.__epilogueDoorClock);
   ok(Number.isFinite(doorClock.before)&&Number.isFinite(doorClock.after),'真实关门点击取得动作前后时钟');
   eq(doorClock.after,doorClock.before,'关门动作不偷推进时钟');
   ok(await p.evaluate(()=>__MOSS__.storyState().epilogueChapter.doorClosed),'关门状态真实记录');
   const book=await p.evaluate(()=>__MOSS__.INTERACTABLES.house.find(x=>x.id==='h_book'));
   ok(await walkTo(p,book.stand[0][0],book.stand[0][1]),'真实回到桌旁');await faceTowards(p,book.x,book.y);await p.keyboard.press('e');await p.waitForTimeout(100);
   await click('办理 S074 · 自己选择的收尾');
  }else{
   const closingTime=await p.evaluate(()=>__MOSS__.state.timeMinutes);await click(mode===1?'重读赫莎与娜汀的来信':'整理现有种子');
   eq(await p.evaluate(()=>__MOSS__.state.timeMinutes),closingTime,'普通收尾不偷推进时钟');
  }
  await finish('S074');
  eq(await p.evaluate(()=>__MOSS__.storyState().tasks['MQ1-G03']),'done','完成普通事务后结束本部');
  eq(await p.evaluate(()=>__MOSS__.storyState().flags.firstPartComplete),true,'结局记录唯一写入');
  eq(await p.evaluate(()=>__MOSS__.state.totalDay),before.day,'读信与收尾不推进世界日');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before.coins,'后日谈不代扣或清债');
  eq(await p.evaluate(()=>__MOSS__.state.weather),before.weather,'后日谈不改季节天气');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.state.inventory.seed_radish),before.seeds+3,'正式读档不重发种子');
  const c=await p.evaluate(()=>__MOSS__.storyState().epilogueChapter);eq(c.records.visit.choice,mode%2?'letter':'together','到访分支正式读档保留');
  eq(c.records.future.choice,['A','B','C'][mode],'结尾态度正式读档保留');
  const charBeforeReview=await p.evaluate(()=>structuredClone(__MOSS__.serialize().char));
  await closeWin(p);const e=await p.evaluate(()=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene==='S069'));
  const it=await p.evaluate(([sc,id])=>{const x=__MOSS__.INTERACTABLES[sc].find(v=>v.id===id);return {...x,scene:sc};},[e.scene,e.workSite]);
  const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);assert.ok(stand);
  await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[e.scene,stand]);await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(200);await click('回看三件来物');
  ok((await p.locator('.win-body').textContent()).includes('赫莎'),'已领取来信仍可回看');
  eq(await p.evaluate(()=>__MOSS__.state.inventory.seed_radish),before.seeds+3,'回看不重发种子');
  eq(await p.evaluate(()=>__MOSS__.serialize().char),charBeforeReview,'回看不重复发经验');
  await ctx.close();
 }
 {
  const missing=structuredClone(base);delete missing.story.tasks['MQ1-F05'];
  const ctx=await load(missing);await p.evaluate(()=>__MOSS__.openStoryScene('S069'));
  eq(await p.evaluate(()=>!!__MOSS__.storyState().scenes.S069),false,'未完成 F05 不能开演后日谈');await ctx.close();
 }
 eq(r.errors,[],'无浏览器错误');console.log('PASS 终幕后日谈 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
