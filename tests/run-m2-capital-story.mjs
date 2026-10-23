/* 第四幕专项：C05、合法跨境凭证和前章材料是已验收夹具；初次旧档不含第四幕字段。
 * devSwitchScene 只定位局部入口，不冒充新档连续路线。全部第四幕事实由真实 E／按钮产生。
 * 两分支、失败重排、只读回看、正式读档及坏档归一化均覆盖；浏览器严格串行。
 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,walkTo,faceTowards,sleepViaMenu,dismissSettlement} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const click=async text=>{await p.getByRole('button',{name:text,exact:true}).click();};
async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});p=await ctx.newPage();p.on('pageerror',e=>r.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();await click('继续游戏');await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);return ctx;
}
async function at(sid,open=true){
 await closeWin(p);
 const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(e=>e.storyScene===id),sid);
 const stand=await p.evaluate(e=>{const M=__MOSS__,it=M.INTERACTABLES[e.scene].find(i=>e.workSite?i.work===e.workSite:i.id===e.id);return it?.stand;},e);
 ok(stand?.length,'入口有真实站位 '+sid);
 await p.evaluate(([e,s])=>__MOSS__.devSwitchScene(e.scene,s[0],s[1]),[e,stand[0]]);
 await p.keyboard.press('e');
 if(open&&e.workSite)await click('办理 '+sid+' · '+e.label);
 if(open)ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'真实 E 开演 '+sid);
}
const actionLabels={arrival:'核对皇家驿路凭证并登记到站',witness:'登记科林自愿说明与亲历边界',original:'出示许可，现场调阅三托盘原件',resolution:'确认补正与公开范围',permit:'登记有限范围、双方人员与续约条件',departure:'收好疑点覆纸，保留现住意见空栏'};
async function visitCapital(){
 await closeWin(p);await p.evaluate(()=>__MOSS__.devSwitchScene('ms1_capital_street',18,28));
 for(const [room,site]of [['inn','letters'],['office','desk'],['archive','archive'],['hearing','hearing']]){
  const dest='ms1_capital_'+room;
  const door=await p.evaluate(to=>__MOSS__.INTERACTABLES.ms1_capital_street.find(i=>i.to===to),dest);
  let entered=false;
  for(const [x,y]of [[door.x,door.y+1],[door.x+1,door.y],[door.x-1,door.y]]){
   if(!await walkTo(p,x,y,30000))continue;await faceTowards(p,door.x,door.y);await p.keyboard.press('e');await p.waitForTimeout(350);
   if(await p.evaluate(to=>__MOSS__.state.sceneId===to,dest)){entered=true;break;}await closeWin(p);
  }
  ok(entered,'从王都街道真实步行进门 '+room);
  const point=await p.evaluate(([sc,site])=>__MOSS__.INTERACTABLES[sc].find(i=>i.work==='ms1_capital_'+site),[dest,site]);
  ok(await walkTo(p,...point.stand[0],15000),'从室内门口走到操作台 '+room);await p.keyboard.press('e');
  ok(await p.locator('.win-body button').filter({hasText:/办理 S0/}).count(),'既有操作台有实际办理入口 '+room);await closeWin(p);
  const back=await p.evaluate(sc=>__MOSS__.MAPS[sc].doors[0],dest);
  ok(await walkTo(p,...back.stand[0],15000),'从操作台步行返回门内 '+room);await faceTowards(p,back.stand[0][0],back.stand[0][1]+1);await p.keyboard.press('e');await p.waitForTimeout(350);
  eq(await p.evaluate(()=>__MOSS__.state.sceneId),'ms1_capital_street','真实出门 '+room);
 }
 eq(await p.evaluate(()=>__MOSS__.capitalChapterState().records),{},'提前游览不补造已办理事实');
}
async function step(sid,key,v){
 if(key==='lodging'){
  if(v){await click('先去吃饭，稍后回留言板');await at(sid);}
  const before=await p.evaluate(()=>({coins:__MOSS__.state.coins,day:__MOSS__.state.totalDay}));
  await click(v?'饭后回到留言板，核材料并确认床位':'一起核材料并确认专款床位');
  eq(await p.evaluate(()=>({coins:__MOSS__.state.coins,day:__MOSS__.state.totalDay})),before,'必要住宿不扣私人钱且不自动过夜');
 }else if(key==='intake'){
  await click('把异议抄件当作档案原件');ok((await p.locator('.req-chip').last().textContent()).includes('抄件不能冒充原件'),'错分材料有反馈');
  for(const s of ['岸上接应 → 亲见','异议抄件 → 转交材料','责任推测 → 尚待核验'])await click(s);
  await click('提交分类并领取有限查阅许可');
 }else if(key==='compare'){
  for(const s of ['正式结项日','灾害当日','异议提交日','旧图汇编日'])await click('日期卡：'+s);
  await click('最后签核人：科林');await click('依据：已完成逐户核验');await click('核对日期与签核，登记可核副本');
  eq(await p.evaluate(()=>!!__MOSS__.capitalChapterState().records.compare),false,'错误日期签核不产生副本');
  ok((await p.locator('.req-chip').last().textContent()).includes('对照未通过'),'错误可定位并重排');
  await click('重排日期卡');for(const s of ['灾害当日','异议提交日','旧图汇编日','正式结项日'])await click('日期卡：'+s);
  await click('最后签核人：伯兰');await click('依据：未附新增逐户名单');await click('核对日期与签核，登记可核副本');
 }else if(key==='questions'){
  await click('指控所有人蓄意隐瞒');ok((await p.locator('.req-chip').last().textContent()).includes('不能证明'),'无依据指控可改述');
  await click('引用私人短笺：承认伊文自己的南线选择');await click(v?'凭登记编号请艾诺补核差异':'引用副本：说明原页与结项差异');await click('引用当前风险图：不把危险说成安全');await click('提交三项有来源的回答');
 }else await click(actionLabels[key]);
 const record=await p.evaluate(k=>__MOSS__.capitalChapterState().records[k],key);
 ok(record?.source&&record.day>0,'现场记录来源与日期 '+key);
 await click('核对已办记录，继续');
}
async function play(sid,v){
 await at(sid);
 for(let n=0;n<80;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx];},sid);
  if(!line)break;
  if(line.choice)await p.locator('.story-options button').nth(v).click();
  else if(line.step)await step(sid,line.action,v);
  else await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 const scene=await p.evaluate(()=>__MOSS__.state.sceneId);
 await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),scene,'下一场不替玩家切图 '+sid);
}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.coins=400;s.totalDay=20;s.timeMinutes=540;s.plots={};s.weather={today:'sun',tomorrow:'sun'};
  M.STORY_TASKS.filter(t=>t.act<5).forEach(t=>st.tasks[t.id]='done');
  st.choices.a03_question='A';st.choices.a04_stance='A';st.lenaStance='cautious';
  for(const id of ['civil_check','capital_pass'])st.evidence[id]={id,title:id,source:'已验收前章夹具',day:19};
  const w=M.wetlandLifeState();Object.assign(w,{permit:true,upstreamSample:true,outfallSample:true,surveyCount:1,causeFound:true});
  st.tideChapter={records:{}};for(const [k,choice]of [['sort','chain'],['read','read'],['letter','sent'],['dispatch','kept'],['rescue','A']])st.tideChapter.records[k]={choice,source:'C03/C05 已验收前章',day:19,text:k==='sort'?'异议是抄件，原件留王都':k==='read'?'伊文选择南线，北侧名单未核完':'本人同意的同行证言与寄信'};
  delete st.capitalChapter;return M.serialize();
 });
 for(const missing of ['chapter','credential','source']){
  const s=structuredClone(base);if(missing==='chapter')delete s.story.tasks['MQ1-C05'];if(missing==='credential')delete s.story.evidence.capital_pass;if(missing==='source')delete s.story.tideChapter.records.read;
  const ctx=await load(s);eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-D01')),'locked','缺前置不能解锁 '+missing);await p.evaluate(()=>__MOSS__.openStoryScene('S039'));eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S039),false,'不能绕过门槛开演 '+missing);await ctx.close();
 }
 for(const v of [0,1]){
  const s=structuredClone(base);if(v){s.story.choices.a03_question='B';s.story.choices.a04_stance='B';s.story.lenaStance='public';}
  const ctx=await load(s);
  eq(await p.evaluate(()=>__MOSS__.capitalChapterState().records),{},'旧档不补造第四幕事实');
  eq(await p.evaluate(()=>__MOSS__.STORY_TASKS.filter(t=>t.act===5).length),5,'第四幕五任务');
  const layout=await p.evaluate(()=>{const M=__MOSS__,bad=[];for(const e of M.STORY_ENTRIES.filter(e=>e.task.startsWith('MQ1-D'))){const hits=M.INTERACTABLES[e.scene].filter(i=>i.x===e.x&&i.y===e.y);if(hits.length!==1)bad.push(e.storyScene+' overlap');const it=hits[0];if(!it?.stand?.some(([x,y])=>!M.isSolid(e.scene,x,y)))bad.push(e.storyScene+' blocked');}return bad;});
  eq(layout,[],'十场共用操作台无重叠入口且站位可通行');
  await p.evaluate(()=>__MOSS__.openStoryScene('S039'));eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S039),false,'日志不能远程开演');
  await p.evaluate(()=>__MOSS__.openStoryScene('S048'));eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S048),false,'不能跳到终场');
  if(!v)await visitCapital();
  await play('S039',v);await play('S040',v);
  ok((await p.evaluate(()=>__MOSS__.storyDMissing('S041'))).includes('会面约在'),'预约日未到有明确提示');
  if(v){await closeWin(p);ok(await sleepViaMenu(p),'真实过夜到预约日');await dismissSettlement(p);ok((await p.evaluate(()=>__MOSS__.storyDMissing('S041'))).includes('会面约在'),'预约日早晨仍待午后或改约');}
  await at('S040',false);await click('改约今日空档');
  for(let i=41;i<=48;i++)await play('S0'+i,v);
  const done=await p.evaluate(()=>__MOSS__.serialize());
  eq(['D01','D02','D03','D04','D05'].map(k=>done.story.tasks['MQ1-'+k]),Array(5).fill('done'),'五任务按序完成');
  const c=done.story.capitalChapter;
  eq(Object.keys(c.records).length,10,'十项现场事实齐全');
  ok(c.records.intake.text.includes(v?'public':'cautious'),'引用 A04 真实态度');
  ok(c.records.intake.text.includes(v?'追问离开原因':'先问亲眼见闻'),'引用 A03 真实提问');
  ok(c.records.intake.text.includes('C03/C05 已验收前章'),'前章材料来源进入快照');
  eq(c.records.witness.choice,v?'B':'A','两种语气均有自愿说明');
  ok(c.records.resolution.text.includes(v?'遮去':'未确认责任'),'公开与谨慎结果分开');
  ok(c.records.permit.text.includes('不是安全通行证'),'许可不替代入谷安全复测');
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-E01')),'locked','未实装第五幕不伪解锁');
  await closeWin(p);await p.evaluate(()=>__MOSS__.openStoryScene('S046'));
  ok((await p.locator('.win-title').textContent()).includes('已演回看'),'已演只读回看');
  eq(await p.evaluate(()=>__MOSS__.serialize().story),done.story,'回看不改分支日期事实');
  eq(await p.evaluate(()=>__MOSS__.serialize().char),done.char,'回看不重复发放经验');
  for(const size of [{width:390,height:844},{width:844,height:390}]){await p.setViewportSize(size);ok(await p.locator('.win').evaluate(e=>e.scrollWidth<=e.clientWidth+2),'回看窗口无横向溢出 '+size.width);}
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.capitalChapterState()),c,'正式读档保留全部第四幕事实');
  const bad=await p.evaluate(()=>{const M=__MOSS__,raw=M.serialize().story;raw.capitalChapter.records.intake={day:-1,text:'坏档',source:'伪造',choice:'x'};return M.normalizeStory(raw);});
  eq(Object.keys(bad.capitalChapter.records),['arrival','lodging'],'坏档缺前置裁掉后续记录');
  eq(Object.keys(bad.evidence).filter(k=>k.startsWith('capital_chapter_')).length,2,'坏档证据索引同源清理');
  if(v){
   const expired=structuredClone(done);expired.totalDay=c.permitUntil+1;expired.timeMinutes=540;
   const savedPage=p,expiredCtx=await load(expired);await at('S047',false);
   await click('重新核对范围并续约七天');eq(await p.evaluate(()=>__MOSS__.capitalChapterState().permitUntil),expired.totalDay+7,'过期许可可现场续约');
   eq(await p.evaluate(()=>__MOSS__.capitalChapterState().records),c.records,'续约不改原许可与剧情历史快照');
   eq(await p.getByRole('button',{name:'重新核对范围并续约七天',exact:true}).count(),0,'当日不能重复续约');
   await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.capitalChapterState().permitUntil),expired.totalDay+7,'续约有效期正式读档保留');
   await expiredCtx.close();p=savedPage;
  }
  await ctx.close();
 }
 eq(r.errors,[],'第四幕无浏览器错误');console.log('PASS 第四幕王都 '+checks+' 项（'+(single?'单文件':'源码')+'）');
}finally{await r.browser.close();}
