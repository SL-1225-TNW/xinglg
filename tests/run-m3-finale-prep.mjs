/* M3 F01 筹备专项。第五幕任务与十项现场记录为已验收前章夹具；
 * devSwitchScene 只提供两处落点，不证明从新档自然到达。实际场次与操作以 E／按钮驱动。
 * 支持源码与 --single-file；自然入口和实体手机需另行验收。 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,faceTowards,sleepViaMenu,dismissSettlement} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const click=async text=>{await p.getByRole('button',{name:text,exact:true}).click();};
async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});
 p=await ctx.newPage();p.on('pageerror',e=>r.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());
 await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();await click('继续游戏');
 await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);
 return ctx;
}
async function at(sid){
 await closeWin(p);
 const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);
 ok(!!e,'场次入口 '+sid);
 const it=await p.evaluate(e=>{const i=__MOSS__.INTERACTABLES[e.scene].find(x=>x.work===e.workSite);return i?{...i,scene:e.scene}:null;},e);
 ok(!!it,'操作台存在 '+sid);
 const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);
 ok(!!stand,'入口有可通行站位 '+sid);
 await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[it.scene,stand]);
 await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(250);
 await click('办理 '+sid+' · '+e.label);
 ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'真实 E 开演 '+sid);
}
async function advanceToStep(sid,choice){
 for(let n=0;n<40;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  assert.ok(line,'场次提前结束 '+sid);
  if(line.step)return;
  if(line.choice)await p.locator('.story-options button').nth(choice).click();
  else await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 throw Error('未到筹备步骤 '+sid);
}
async function finish(sid,button){
 await click(button);await click('核对已办记录，继续');
 for(let n=0;n<20;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line)break;
  await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 const before=await p.evaluate(()=>__MOSS__.state.sceneId);
 await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),before,'下一场不瞬移 '+sid);
}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=6).forEach(t=>st.tasks[t.id]='done');
  const keys=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'];
  const choices=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};
  keys.forEach((k,i)=>st.echoChapter.records[k]={day:19,choice:choices[i],text:'已验收前章事实 '+k,source:'第五幕现场'});
  return M.serialize();
 });
 {
  const missing=structuredClone(base);delete missing.story.tasks['MQ1-E05'];delete missing.story.finaleChapter;
  const ctx=await load(missing);
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-F01')),'locked','未完成 E05 不解锁');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records),{},'旧档缺终幕字段不补造事实');
  await p.evaluate(()=>__MOSS__.openStoryScene('S059'));
  eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S059),false,'不能绕开前置远程开演');
  await ctx.close();
 }
 for(const v of [0,1]){
  const seed=structuredClone(base);
  if(!v)seed.plots['6,4']={tilled:true,water:false,crop:'radish',age:0,mature:false,harvested:false,regrow:0,fertility:70,lastGroup:'root',prevGroup:null};
  const ctx=await load(seed);
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-F01')),'available','前章完成解锁筹备');
  const before=await p.evaluate(()=>({day:__MOSS__.state.totalDay,coins:__MOSS__.state.coins,care:__MOSS__.farmCareState()}));
  await at('S059');await advanceToStep('S059',0);
  let text=await p.locator('.win-body').textContent();
  ok(text.includes('旧隧道封闭')&&text.includes('出发前须重新核验'),'说明封闭与出发前复核');
  ok(text.includes('行动窗口尚未启动')||text.includes('尚未开始三日行动窗口'),'筹备不启动倒计时');
  ok(text.includes(v?'家中没有需要委托':'未熟作物'),'如实显示家务状态');
  await finish('S059','记录筹备预览');
  await at('S060');await advanceToStep('S060',1);
  if(!v){
   eq(await p.getByRole('button',{name:'记录返家与照料选择',exact:true}).count(),0,'缺照料时不能声称安排成立');
   await click('先安排家务');
  }
  await finish('S060','记录返家与照料选择');
  const after=await p.evaluate(()=>({day:__MOSS__.state.totalDay,coins:__MOSS__.state.coins,care:__MOSS__.farmCareState(),story:__MOSS__.serialize().story}));
  eq(after.day,before.day,'筹备不推进世界日');eq(after.coins,before.coins,'筹备不扣个人金币');
  eq(after.care,before.care,'筹备不代办照料');
  eq(after.story.tasks['MQ1-F01'],'done','完成 F01');
  eq(after.story.finaleChapter.records.home.choice,v?'B':'A','家务选择按真实覆盖记录');
  eq(Object.keys(after.story.finaleChapter).sort(),['records'],'没有行动窗口计时字段');
  await p.reload();await click('继续游戏');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records),after.story.finaleChapter.records,'正式读档保留筹备记录');
  const saved=await p.evaluate(()=>__MOSS__.serialize());
  await p.evaluate(()=>__MOSS__.openStoryScene('S059'));
  ok((await p.locator('.win-title').textContent()).includes('已演回看'),'已演只读回看');
  eq(await p.evaluate(()=>__MOSS__.serialize().story),saved.story,'回看不修改记录与选择');
  eq(await p.evaluate(()=>__MOSS__.serialize().char),saved.char,'回看不重复奖励');
  await closeWin(p);
  ok(await sleepViaMenu(p),'通过菜单真实过夜');await dismissSettlement(p);
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records),after.story.finaleChapter.records,'跨日不改写筹备快照');
  await ctx.close();
 }
 eq(r.errors,[],'无浏览器错误');
 console.log('PASS 终幕 F01 筹备 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
