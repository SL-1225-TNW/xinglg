/* F02 专项：F01 与第五幕成果、资格场景为夹具；devSwitchScene 只设初始落点。
 * 回执、授权、分工均通过真实 E、按钮及正常过夜产生；不代表从新档自然走到终幕。
 * --single-file 复跑包装产物。 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,faceTowards,sleepViaMenu,dismissSettlement} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0,readyForAuth=null;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const click=async text=>{await p.getByRole('button',{name:text,exact:true}).click();await p.waitForTimeout(100);};
async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});p=await ctx.newPage();
 p.on('pageerror',e=>r.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();await click('继续游戏');await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);return ctx;
}
async function site(scene,work){
 await closeWin(p);
 const it=await p.evaluate(([sc,w])=>{const i=__MOSS__.INTERACTABLES[sc].find(x=>x.work===w||x.id===w);return i?{...i,scene:sc}:null;},[scene,work]);
 assert.ok(it,'缺工位 '+scene+'/'+work);
 const stand=it.stand.find(([x,y])=>Math.abs(x-it.x)+Math.abs(y-it.y)===1);assert.ok(stand,'缺可通行站位 '+work);
 await p.evaluate(([sc,xy])=>__MOSS__.devSwitchScene(sc,xy[0],xy[1]),[scene,stand]);
 await faceTowards(p,it.x,it.y);await p.keyboard.press('e');await p.waitForTimeout(300);
}
async function at(sid){
 const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);assert.ok(e,'缺场次 '+sid);
 await site(e.scene,e.workSite);await click('办理 '+sid+' · '+e.label);
 ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'真实 E 与按钮开演 '+sid);
}
async function next(sid,choice){
 for(let n=0;n<35;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line)return;
  if(line.step)return;
  if(line.choice){if(choice!=null)await p.locator('.story-options button').nth(choice).click();else return;}
  else await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
}
async function finish(sid){
 await click('核对已办记录，继续');await next(sid);
 const sc=await p.evaluate(()=>__MOSS__.state.sceneId);await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),sc,'下一场不瞬移 '+sid);
}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=6).forEach(t=>st.tasks[t.id]='done');st.tasks['MQ1-F01']='done';
  const keys=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'];
  const choices=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};keys.forEach((k,i)=>st.echoChapter.records[k]={day:18,choice:choices[i],text:'已验收前章事实 '+k,source:'第五幕现场'});
  st.finaleChapter={records:{prepare:{day:19,choice:'preview',text:'前章筹备',source:'F01'},home:{day:19,choice:'A',text:'前章家务选择',source:'F01'}}};
  st.pineChapter={records:{help:{choice:'A',day:17,source:'白松山径',text:'分头协作'}}};
  return M.serialize();});
 {
  const missing=structuredClone(base);delete missing.story.tasks['MQ1-F01'];
  const ctx=await load(missing);eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-F02')),'locked','缺 F01 不解锁');
  await p.evaluate(()=>__MOSS__.openStoryScene('S061'));eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S061),false,'缺前置不能远程开演');
  const c=await p.evaluate(()=>__MOSS__.finaleChapterState());eq(c.support.sentDay,-1,'旧档不补造询问');eq(c.support.receipts,{},'旧档不补造回执');
  await ctx.close();
 }
 for(const v of [0,1]){
  const seed=structuredClone(base);seed.story.pineChapter.records.help.choice=v?'B':'A';if(v)seed.questProgress[1]='done';
  const ctx=await load(seed);
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-F02')),'available','F01 完成后可办理 F02');
  await at('S061');
  const day=await p.evaluate(()=>__MOSS__.state.totalDay);const gold=await p.evaluate(()=>__MOSS__.state.coins);
  await click('发送三处接应询问');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().support.sentDay),day,'真实发送询问并记录日期');
  eq(await p.evaluate(()=>Object.keys(__MOSS__.finaleChapterState().support.receipts).length),0,'发送不自动确认支持');
  eq(await p.getByRole('button',{name:'领取路线回执',exact:true}).count(),0,'当日不能提前领取');
  eq(await p.evaluate(()=>__MOSS__.state.coins),gold,'发送不扣个人金币');
  await closeWin(p);ok(await sleepViaMenu(p),'正常过夜等待回信');await dismissSettlement(p);
  eq(await p.evaluate(()=>__MOSS__.state.totalDay),day+1,'等待推进真实世界日');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().support.sentDay),day,'询问正式读档保留');
  await at('S061');
  eq(await p.getByRole('button',{name:'确认白松驿舍收货人',exact:true}).count(),0,'无供给回执不能确认收货人');
  await click('领取路线回执');
  const route=await p.evaluate(()=>__MOSS__.finaleChapterState().support.receipts.route);
  ok(route.text.includes(v?'主角与莱娜核回':'莱娜独立核回'),'B05 分支记实际回执协作');
  eq(await p.evaluate(()=>Object.keys(__MOSS__.finaleChapterState().support.receipts).length),1,'一份回执不自动补齐其余');
  await click('领取医疗回执');await click('领取供给回执');await click('确认白松驿舍收货人');
  const all=await p.evaluate(()=>__MOSS__.finaleChapterState().support.receipts);
  eq(Object.keys(all).sort(),['food','medical','receiver','route'],'四项支持分别确认');
  ok(Object.values(all).every(x=>x.day===day+1&&x.source),'回执留来源与真实日期');
  eq(await p.getByRole('button',{name:'领取路线回执',exact:true}).count(),0,'已领取不重复办理');
  await click('登记四份接应确认');await finish('S061');
  if(!v)readyForAuth=await p.evaluate(()=>__MOSS__.serialize());
  await at('S062');await next('S062');
  eq(await p.locator('.story-options button').count(),2,'无本次授权不显示军事选项');
  await p.locator('.story-options button').nth(v?1:0).click();await next('S062');
  eq(await p.getByRole('button',{name:'登记本次分工与交接',exact:true}).count(),0,'未核名交接不能完成');
  await click('核对接应名单');await click('读回接应交接点');
  await click(v?'核对真实补给清单':'与公共承办人核对民用接应');
  if(v){eq(await p.getByRole('button',{name:'登记本次分工与交接',exact:true}).count(),0,'共同照护仍须实际确认获助旅人协作');await click('与获助旅人确认安全坪搬运');}
  const before=await p.evaluate(()=>({coins:__MOSS__.state.coins,day:__MOSS__.state.totalDay}));
  await click('登记本次分工与交接');await finish('S062');
  const beforePreview=await p.evaluate(()=>__MOSS__.serialize().story);
  await click('查看出发预览');
  ok((await p.locator('.win-body').textContent()).includes('行动窗口没有启动'),'出发预览明确尚未启动');
  eq(await p.evaluate(()=>__MOSS__.serialize().story),beforePreview,'预览不修改剧情事实或启动计时');
  await closeWin(p);
  const done=await p.evaluate(()=>__MOSS__.serialize());
  eq(done.story.tasks['MQ1-F02'],'done','F02 两场完成');
  eq(done.story.finaleChapter.records.assignment.choice,v?'B':'A','实际分工已记录');
  ok(done.story.finaleChapter.records.assignment.text.includes(v?'获助旅人':'公共承办人'),'分支工作如实留档');
  eq(done.coins,before.coins,'登记不动个人金币');eq(done.totalDay,before.day,'登记分工不推进世界日');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().support.receipts),all,'四份回执正式读档保留');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records.assignment.choice),v?'B':'A','分工正式读档保留');
  const saved=await p.evaluate(()=>__MOSS__.serialize());await p.evaluate(()=>__MOSS__.openStoryScene('S062'));
  ok((await p.locator('.win-title').textContent()).includes('已演回看'),'回看只读');eq(await p.evaluate(()=>__MOSS__.serialize().story),saved.story,'回看不改记录');
  eq(await p.evaluate(()=>__MOSS__.serialize().char),saved.char,'回看不重复奖励');
  if(v){
   const normalized=await p.evaluate(raw=>{raw.finaleChapter.support.checks=raw.finaleChapter.support.checks.filter(k=>k!=='guest');return __MOSS__.normalizeStory(raw).finaleChapter;},structuredClone(saved.story));
   eq(!!normalized.records.assignment,false,'共同照护坏档缺本人搬运记录不能补造分工');
  }
  await ctx.close();
 }
 /* 军事资格是旧成果夹具；本次授权必须由联络处真实按钮产生。
    资格失效的运行态写入只用于回归授权撤销，不代表自然取得资格。 */
 {
  const seed=structuredClone(readyForAuth);
  seed.militaryLife={registered:true,rank:'squad_leader',commandLimit:12,appointmentDay:19,trainingDays:[17,18],
   unit:{id:'frontier_detail',count:0,wounded:0,training:1,scene:'camp'},battleRecords:[]};
  const ctx=await load(seed);
  ok(await p.evaluate(()=>__MOSS__.milChainStatus().ok),'军事资格、训练与有效委任夹具就绪');
  eq(await p.evaluate(()=>__MOSS__.finaleCanEscort()),false,'资格齐全仍不能省略本次授权');
  await at('S062');await next('S062');eq(await p.locator('.story-options button').count(),2,'未授权隐藏护送选项');
  await site('neighbor_office','neighbor_case');
  const funds=await p.evaluate(()=>({gold:__MOSS__.state.coins,budget:__MOSS__.militaryLifeState().institutionFund}));
  await click('申请本次北坡护送协作授权 · 15分钟');
  ok(await p.evaluate(()=>__MOSS__.finaleCanEscort()),'联络处真实办理本次授权');
  eq(await p.evaluate(()=>__MOSS__.state.coins),funds.gold,'本次授权不扣个人金币');
  eq(await p.evaluate(()=>__MOSS__.militaryLifeState().institutionFund),funds.budget,'本次授权不转用军费');
  const grant=await p.evaluate(()=>__MOSS__.serialize());
  await p.reload();await click('继续游戏');ok(await p.evaluate(()=>__MOSS__.finaleCanEscort()),'本次授权正式读档保留');
  await at('S062');await next('S062');eq(await p.locator('.story-options button').count(),3,'有效本次授权显示护送选项');
  await p.locator('.story-options button').nth(2).click();await next('S062');
  await p.evaluate(()=>{__MOSS__.state.militaryLife.core.commission.expiresDay=__MOSS__.state.totalDay-1;__MOSS__.openStoryScene('S062');});
  eq(await p.evaluate(()=>__MOSS__.finaleCanEscort()),false,'委任过期立即撤销护送资格');
  eq(await p.getByRole('button',{name:'登记本次分工与交接',exact:true}).count(),0,'过期后不能登记军事分工');
  await click('改选民用交接');
  await click('核对接应名单');await click('读回接应交接点');await click('与公共承办人核对民用接应');
  await click('登记本次分工与交接');await finish('S062');
  eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records.assignment.choice),'B','过期可改走民用保底');
  await ctx.close();
  {
   const c=await load(structuredClone(grant));await at('S062');await next('S062');
   await p.locator('.story-options button').nth(2).click();await next('S062');
   await click('核对接应名单');await click('读回接应交接点');await click('与公共承办人核对民用接应');
   await click('登记本次分工与交接');await finish('S062');
   eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records.assignment.choice),'C','有效授权可实际登记护送分工');
   await p.reload();await click('继续游戏');
   eq(await p.evaluate(()=>__MOSS__.finaleChapterState().records.assignment.choice),'C','合法护送分工正式读档保留');
   await c.close();
  }
  for(const mutation of ['rank','training','commission']){
   const s=structuredClone(grant),core=s.militaryLife.core;
   if(mutation==='rank'){s.militaryLife.rank='resident';s.militaryLife.registered=false;core.rank='civilian';}
   if(mutation==='training'){s.militaryLife.trainingDays=[];core.training=0;}
   if(mutation==='commission'){s.militaryLife.appointmentDay=0;core.commission=null;}
   const c=await load(s);
   eq(await p.evaluate(()=>__MOSS__.finaleCanEscort()),false,'缺 '+mutation+' 不能凭本次授权护送');
   await at('S062');await next('S062');eq(await p.locator('.story-options button').count(),2,'缺 '+mutation+' 不显示军事选项');
   await c.close();
  }
 }
 /* 前章入门经历是夹具；对应现场工作仍由真实按钮产生。 */
 for(const [kind,id,label] of [['engineering','engineering','复核标记并留下后续检查点'],['patrol','patrol','核新落石与已核绕路'],['trade','trade','核收货人和分批运送']]){
  const ctx=await load(structuredClone(readyForAuth));
  await p.evaluate(k=>{const M=__MOSS__;M.rookieState()[k]=M.ROOKIE_JOBS[k].steps.length;},kind);
  await at('S062');await next('S062');await p.locator('.story-options button').first().click();await next('S062');
  eq(await p.getByRole('button',{name:label,exact:true}).count(),1,'前章 '+kind+' 经历显示相应工作');
  await click(label);eq(await p.evaluate(()=>__MOSS__.finaleChapterState().support.experience.id),id,'实际办理 '+kind+' 工作才留档');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().support.experience.id),id,'工作经历正式读档保留 '+kind);
  await ctx.close();
 }
 /* 坏档不可造出缺失回执及超前的记录。 */
 {
  const result=await r.page.evaluate(()=>{const M=__MOSS__,raw=M.serialize().story;
   raw.finaleChapter={records:{prepare:{day:10,choice:'preview',text:'p',source:'s'},home:{day:10,choice:'A',text:'h',source:'s'},replies:{day:12,choice:'confirmed',text:'伪造',source:'s'}},
    support:{sentDay:11,receipts:{route:{day:12,text:'一份',source:'s'}},checks:['names','handoff','experience']}};
   return M.normalizeStory(raw).finaleChapter;});
  eq(!!result.records.replies,false,'坏档缺回执不能补造确认');eq(result.support.checks,[],'坏档缺确认不能补造分工');
 }
 eq(r.errors,[],'无浏览器错误');console.log('PASS 终幕 F02 支持与分工 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
