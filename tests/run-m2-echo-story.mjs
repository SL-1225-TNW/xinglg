/* 第五幕专项：第四幕十项现场事实与入谷三道门槛是已验收夹具；初次旧档不含第五幕字段。
 * 十场全部由真实 E／按钮产生：入谷登记走村落口，六处操作台走面板办理。
 * 两分支（伊文再访对白、父女私下说过话）、缺一份证据不阻断、只读回看、
 * 正式读档、坏档归一化与「普通到访不设王都许可门槛」的边界都覆盖；浏览器严格串行。
 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,walkTo,faceTowards} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let p=r.page,checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const click=async text=>{await p.getByRole('button',{name:text,exact:true}).click();};

async function load(seed){
 const ctx=await r.browser.newContext({viewport:{width:1100,height:820}});
 p=await ctx.newPage();
 p.on('pageerror',e=>r.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});
 await p.goto(r.page.url());
 await p.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));},seed);
 await p.reload();
 await click('继续游戏');
 await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);
 return ctx;
}

/* 前章夹具：第四幕十项现场事实、三道门槛的两份凭证与 E02 的两份互证来源。 */
async function makeSave(o={}){
 return await p.evaluate(opt=>{
  const M=__MOSS__,s=M.state,st=M.storyState();
  s.coins=400;s.totalDay=20;s.timeMinutes=540;s.plots={};s.weather={today:'sun',tomorrow:'sun'};
  M.STORY_TASKS.filter(t=>t.act<6).forEach(t=>st.tasks[t.id]='done');
  st.choices.a03_question='A';st.choices.a04_stance='A';st.lenaStance='cautious';
  for(const id of ['civil_check','neighbor_pass','echo_guide','neighbor_confirm'])
   st.evidence[id]={id,title:id,source:'已验收前章夹具',day:19};
  st.evidence.lena_receipt={id:'lena_receipt',title:'母亲保留的查询回单',source:'S015 · 议事厅档案角',day:19};
  const w=M.wetlandLifeState();Object.assign(w,{permit:true,upstreamSample:true,outfallSample:true,surveyCount:1,causeFound:true});
  st.tideChapter={records:{}};
  for(const [k,choice] of [['sort','chain'],['read','read'],['letter','sent'],['dispatch','kept'],['rescue','A']])
   st.tideChapter.records[k]={choice,source:'C03/C05 已验收前章',day:19,text:'前章已验收现场事实'};
  st.capitalChapter={records:{},permitUntil:26};
  const capChoices={arrival:'registered',lodging:'A',intake:'classified',witness:'A',original:'viewed',
   compare:'indexed',questions:'answered',resolution:'A',permit:'limited',departure:'deferred'};
  for(const k of ['arrival','lodging','intake','witness','original','compare','questions','resolution','permit','departure'])
   st.capitalChapter.records[k]={day:19,choice:capChoices[k],text:'第四幕已验收现场事实',source:'王都 · 调查公署'};
  st.pineWork={records:{ledger:{choice:'copy',day:19,source:'白松驿舍 · 赫莎出示的停宿页与烟道记录',
   text:'灾后第二年鲁恩在此停宿，托过一封去南线收容站的信。',weather:'sun'}}};
  st.echoChapter={records:{route_recheck:{day:19,choice:'rechecked',text:'近期路线复测：山径外段与旧官道分岔通行，北坡线可作近期安全路线。',
   source:'白松驿舍 · 赫莎的停运登记簿 · 赫莎'}}};
  if(opt.metIven)st.flags.echo_met_iven=true;
  if(opt.metRuen)st.flags.echo_met_ruen=true;
  if(opt.visited)st.flags.echoVisited=true;
  if(opt.privacy)st.choices.e02_lena_privacy='B';
  if(opt.dropQuery)delete st.evidence.lena_receipt;
  if(opt.dropLedger)delete st.pineWork.records.ledger;
  if(opt.dropPermit)delete st.capitalChapter.records.permit;
  if(opt.expirePermit)st.capitalChapter.permitUntil=19;
  if(opt.dropNeighbor)delete st.evidence.neighbor_confirm;
  if(opt.dropRecheck)delete st.echoChapter.records.route_recheck;
  if(opt.dropD05)delete st.tasks['MQ1-D05'];
  return M.serialize();
 },o);
}

/* 走到场次入口：操作台走面板，单独入口直接按 E。 */
async function at(sid){
 await closeWin(p);
 const e=await p.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);
 ok(!!e,'场次有入口登记 '+sid);
 const it=await p.evaluate(e=>{const M=__MOSS__,list=M.INTERACTABLES[e.scene]||[];
  const own=list.find(i=>i.id===e.id),site=list.find(i=>i.work===e.workSite);
  const f=own||site;return f?{stand:f.stand||[],own:!!own}:null;},e);
 ok(it&&it.stand.length,'入口有真实站位 '+sid);
 await p.evaluate(([e,s])=>__MOSS__.devSwitchScene(e.scene,s[0],s[1]),[e,it.stand[0]]);
 await p.keyboard.press('e');
 await p.waitForTimeout(220);
 if(!it.own)await click('办理 '+sid+' · '+e.label);
 ok((await p.locator('.win-title').textContent()).startsWith(sid+' ·'),'真实 E 开演 '+sid);
}
const mainButtons={
 entry:'核对核验手续与近期路线，登记入谷',roster:'查阅居民自记的送药与换粮簿',
 letters:'核对未寄出的信与旧图抄页',reply:'与莱娜、鲁恩分别核对旧信',
 labor:'记录本户意愿与可协助事项',readback:'把记录读回本人并逐户分列',
 rescue:'对照当年的救援选择与结项改写',slope:'在界绳内核坡体、水痕与北坡线',
 confirm:'逐户确认去向，未答复的留空',plan:'登记去向建议与协作分工'
};
async function step(sid,key){
 if(key==='reply'){
  await click('让他一次把十二年都认下来');
  ok((await p.locator('.req-chip').last().textContent()).includes('分开记'),'尝试联系与后来退缩必须分开记');
  await click('确认：确实尝试联系过');
  await click('确认：最后一封是自己停下的');
 }else if(key==='labor'){
  await click('记下：全村意见一致，都先留下');
  ok((await p.locator('.req-chip').last().textContent()).includes('意见一致'),'不能替住户写成意见一致');
  await click('记下：弥拉想带孩子离开，需要上学与看病的通路');
  await click('记下：另一户希望留下，需核通路与照护条件');
 }else if(key==='readback'){
  await click('写成：意见一致');
  ok((await p.locator('.req-chip').last().textContent()).includes('逐户分列'),'不能写成意见一致');
  await click('逐户分列：弥拉（离开）·另一户（留下）·未同意户（只记匿名需求）');
 }else if(key==='rescue'){
  await click('伊文的责任：把北侧住户写成迁居完成');
  ok((await p.locator('.req-chip').last().textContent()).includes('不互相抵销'),'伊文的责任与伯兰的改写不互相抵销');
  await click('伊文的责任：南线先送重伤者，说会带第二批回来');
  await click('伯兰的改写：把北侧住户写成迁居完成');
 }else if(key==='slope'){
  await click('进旧隧道内部看一眼');
  ok((await p.locator('.req-chip').last().textContent()).includes('不进入'),'旧隧道未核验不进入');
  for(const s of ['核坡体','核水痕','核旧石基','核北坡线'])await click(s);
 }else if(key==='confirm'){
  await click('替还没答复的一户填上去向');
  ok((await p.locator('.req-chip').last().textContent()).includes('留空'),'本人没答复的去向要留空');
  await click('确认弥拉：带孩子离开（本人已答复）');
  await click('确认另一户：先留下，待通路与照护条件核验（本人已答复）');
 }
 await click(mainButtons[key]);
 const rec=await p.evaluate(k=>__MOSS__.echoChapterState().records[k],key);
 ok(rec&&rec.source&&rec.day>0,'现场记录有来源与日期 '+key);
 await click('核对已办记录，继续');
}
async function play(sid,v){
 await at(sid);
 for(let n=0;n<90;n++){
  const line=await p.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx];},sid);
  if(!line)break;
  if(line.choice)await p.locator('.story-options button').nth(v).click();
  else if(line.step)await step(sid,line.action);
  else await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 const scene=await p.evaluate(()=>__MOSS__.state.sceneId);
 await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),scene,'下一场不替玩家切图 '+sid);
}
/* 六个操作台都要能真的走到并列出办理项。 */
async function visitSites(){
 const sites=await p.evaluate(()=>{const M=__MOSS__,out=[];
  for(const sc of Object.keys(M.INTERACTABLES))for(const it of M.INTERACTABLES[sc]||[])
   if(it.work&&M.ECHO_SITES.indexOf(it.work)>=0)out.push({site:it.work,scene:sc,x:it.x,y:it.y,stand:it.stand});
  return out;});
 eq(sites.length,6,'回声谷六处操作台都注册了');
 for(const s of sites){
  await closeWin(p);
  ok(s.stand&&s.stand.length,'操作台有真实站位 '+s.site);
  await p.evaluate(([s])=>__MOSS__.devSwitchScene(s.scene,s.stand[0][0],s.stand[0][1]),[s]);
  await p.keyboard.press('e');
  await p.waitForTimeout(220);
  const n=await p.locator('.win-body button').filter({hasText:/S0(4[9]|5[0-8])/}).count();
  ok(n>0,'操作台列出可办理的第五幕场次 '+s.site);
  const gate=await p.locator('.win-body').textContent();
  ok(gate.includes('入谷三道门槛'),'操作台写明入谷门槛 '+s.site);
  await closeWin(p);
 }
}
/* 三道门槛的两处办理点：邻领权限确认（阿丽娅）与近期路线复测（赫莎）。 */
async function visitGates(){
 await closeWin(p);
 const pt=await p.evaluate(()=>__MOSS__.extendedActionPoints['neighbor_case']);
 ok(pt&&pt.scene==='neighbor_office','邻领权限确认在领地联络处');
 await p.evaluate(([pt])=>__MOSS__.devSwitchScene(pt.scene,pt.x,pt.y+1),[pt]);
 await p.keyboard.press('e');
 await p.waitForTimeout(220);
 ok((await p.locator('.win-body').textContent()).includes('邻领权限确认'),'联络处有邻领权限确认');
 await closeWin(p);
 const pt2=await p.evaluate(()=>__MOSS__.extendedActionPoints['ms1_pine_ledger']);
 ok(pt2&&pt2.scene==='ms1_pine_inn','近期路线复测在白松驿舍');
 await p.evaluate(([pt2])=>__MOSS__.devSwitchScene(pt2.scene,pt2.x,pt2.y+1),[pt2]);
 await p.keyboard.press('e');
 await p.waitForTimeout(220);
 const innBody=await p.locator('.win-body').textContent();
 ok(innBody.includes('近期路线复测'),'驿舍有近期路线复测');
 await closeWin(p);
}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await makeSave();

 /* --- 门槛：缺一项都不解锁，也不许远程开演 --- */
 for(const miss of ['dropD05','dropPermit','expirePermit','dropNeighbor','dropRecheck','dropGuide']){
  const s=structuredClone(base);
  if(miss==='dropGuide')delete s.story.evidence.echo_guide;
  else if(miss==='dropD05')delete s.story.tasks['MQ1-D05'];
  else if(miss==='dropPermit')delete s.story.capitalChapter.records.permit;
  else if(miss==='expirePermit')s.story.capitalChapter.permitUntil=19;
  else if(miss==='dropNeighbor')delete s.story.evidence.neighbor_confirm;
  else if(miss==='dropRecheck')delete s.story.echoChapter.records.route_recheck;
  const ctx=await load(s);
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-E01')),'locked','缺一项不能解锁 '+miss);
  await p.evaluate(()=>__MOSS__.openStoryScene('S049'));
  eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S049),false,'不能绕过门槛开演 '+miss);
  await ctx.close();
 }
 /* --- 边界：普通到访不设王都许可门槛，但官方核验任务要 --- */
 {
  const s=structuredClone(base);
  delete s.story.capitalChapter.records.permit;
  const ctx=await load(s);
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-E01')),'locked','官方核验任务仍要王都许可');
  eq(await p.evaluate(()=>__MOSS__.extendedGateAllowed('ms1_echo')),true,'普通到访不因王都许可被挡住');
  ok(await p.evaluate(()=>!!(__MOSS__.NPCS.ms1_iven&&__MOSS__.NPCS.ms1_ruen&&__MOSS__.NPCS.ms1_mira)),'伊文、鲁恩、弥拉照常在场');
  await ctx.close();
 }
 /* --- 回归：新档路径的 echoChapter.draft 必须自带数组默认值 --- */
 {
  const ctx=await load(structuredClone(base));
  const fresh=await p.evaluate(()=>{const M=__MOSS__;
   const a=M.newStoryState().echoChapter.draft,b=M.freshState().story.echoChapter.draft;
   return {a:Object.keys(a).sort().join(','),b:Object.keys(b).sort().join(',')};});
  eq(fresh.a,'checks,confirmed,readback,reply,wishes','新档 story 状态的 draft 带五个数组默认值');
  eq(fresh.b,'checks,confirmed,readback,reply,wishes','新游戏状态的 draft 带五个数组默认值');
  /* 运行态被换成新档的空 draft 形状时，访问器要补齐，否则面板读 p.reply.length 会炸。 */
  const shape=await p.evaluate(()=>{const M=__MOSS__;
   M.state.story.echoChapter={records:{},draft:{}};
   const d=M.echoChapterState().draft;
   return {keys:Object.keys(d).sort().join(','),
    ok:['reply','wishes','readback','checks','confirmed'].every(k=>Array.isArray(d[k]))};});
  eq(shape.keys,'checks,confirmed,readback,reply,wishes','运行态 draft 缺数组时访问器补齐');
  ok(shape.ok,'五个 draft 数组都可用');
  await ctx.close();
 }
 /* --- 主流程：两个分支各走一遍十场 --- */
 for(const v of [0,1]){
  const s=structuredClone(base);
  if(v){s.story.flags.echo_met_iven=true;s.story.choices.e02_lena_privacy='B';}
  const ctx=await load(s);
  eq(await p.evaluate(()=>Object.keys(__MOSS__.echoChapterState().records).filter(k=>k!=='route_recheck')),[],'旧档不补造第五幕现场事实');
  eq(await p.evaluate(()=>__MOSS__.STORY_TASKS.filter(t=>t.act===6).length),5,'第五幕五任务');
  const layout=await p.evaluate(()=>{const M=__MOSS__,bad=[];
   for(const e of M.STORY_ENTRIES.filter(e=>e.task.startsWith('MQ1-E'))){
    const hits=M.INTERACTABLES[e.scene].filter(i=>i.x===e.x&&i.y===e.y);
    if(e.siteScene===e.scene)continue;
    if(hits.length>1)bad.push(e.storyScene+' overlap');
    const own=M.INTERACTABLES[e.scene].filter(i=>i.id===e.id);
    if(own.length&&!own[0].stand.some(([x,y])=>!M.isSolid(e.scene,x,y)))bad.push(e.storyScene+' blocked');
   }return bad;});
  eq(layout,[],'第五幕入口不重叠且站位可通行');
  await p.evaluate(()=>__MOSS__.openStoryScene('S050'));
  eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S050),false,'不能跳到第二场');
  await p.evaluate(()=>__MOSS__.openStoryScene('S058'));
  eq(await p.evaluate(()=>!!__MOSS__.state.story.scenes.S058),false,'不能跳到终场');
  if(!v)await visitSites();
  await visitGates();
  await play('S049',v);
  const e01=await p.evaluate(()=>__MOSS__.echoChapterState().records.entry);
  ok(e01&&e01.text.includes('官方核验任务'),'入谷登记写明只覆盖官方核验任务');
  await play('S050',v);
  const roster=await p.evaluate(()=>__MOSS__.echoChapterState().records.roster);
  ok(roster.text.includes('没写的没有那一行'),'住户自记簿不补造未记录的住户');
  await play('S051',v);
  const letters=await p.evaluate(()=>__MOSS__.echoChapterState().records.letters);
  ok(letters.text.includes('母亲保留的查询回单'),'E02 引用母亲保留的查询回单');
  ok(letters.text.includes('白松驿舍停宿与捎信账页'),'E02 引用第二幕的停宿捎信账页');
  const s51=await p.evaluate(()=>__MOSS__.STORY_SCENES.S051.lines.filter(l=>!l.when||l.when(__MOSS__.storyState().choices)).map(l=>l.text||''));
  ok(s51.some(t=>t.includes('上次我问你为什么留在这里'))===!!v,'伊文再访对白按已重逢切换');
  ok(s51.some(t=>t.includes('你到了。'))===!v,'首次重逢才说「你到了」');
  /* 行为回归：把运行态 draft 换成修 bug 前新档的空对象形状（不经过读档归一化），
     第五幕面板仍要能正常办理，不能读 p.reply.length 炸掉。 */
  if(!v){await p.evaluate(()=>{__MOSS__.state.story.echoChapter.draft={};});}
  await play('S052',v);
  if(!v)ok(await p.evaluate(()=>Array.isArray(__MOSS__.echoChapterState().draft.reply)),'新档形状的 draft 也能正常办理');
  const reply=await p.evaluate(()=>__MOSS__.echoChapterState().records.reply);
  ok(reply.text.includes('尝试联系过')&&reply.text.includes('不是邮局退回'),'尝试联系与后来退缩分开记');
  ok(reply.text.includes('暂不原谅')&&!reply.text.includes('已原谅'),'不替居民下原谅的结论');
  const s52=await p.evaluate(()=>__MOSS__.STORY_SCENES.S052.lines.filter(l=>!l.when||l.when(__MOSS__.storyState().choices)).map(l=>l.text||''));
  ok(s52.some(t=>t.includes('见面时没谈完的'))===!!v,'父女已私下说过话则走「今天继续」');
  ok(s52.some(t=>t.includes('先别叫我那个'))===!v,'莱娜首次见父亲保留她的重逢');
  await play('S053',v);
  const labor=await p.evaluate(()=>__MOSS__.echoChapterState().records.labor);
  ok(labor.text.includes('弥拉')&&labor.text.includes('另一户'),'至少两户分别记录');
  ok(!labor.text.includes('意见一致'),'逐户记录不写意见一致');
  await play('S054',v);
  const readback=await p.evaluate(()=>__MOSS__.echoChapterState().records.readback);
  ok(readback.text.includes('匿名需求'),'未同意者只计匿名需求');
  await play('S055',v);
  const rescue=await p.evaluate(()=>__MOSS__.echoChapterState().records.rescue);
  ok(rescue.text.includes('伊文的选择')&&rescue.text.includes('伯兰的改写'),'责任与改写分别记录');
  ok(rescue.text.includes('不互相抵销'),'责任与改写不互相抵销');
  await play('S056',v);
  const slope=await p.evaluate(()=>__MOSS__.echoChapterState().records.slope);
  ok(slope.text.includes('未进入旧隧道'),'不进入未核验的旧隧道');
  ok(slope.text.includes('正式核验人员'),'路线安全由正式核验人员确认');
  await play('S057',v);
  const confirm=await p.evaluate(()=>__MOSS__.echoChapterState().records.confirm);
  ok(confirm.text.includes('留空'),'未答复的一户留空');
  await play('S058',v);
  const plan=await p.evaluate(()=>__MOSS__.echoChapterState().records.plan);
  ok(plan.text.includes('不决定谁配获救'),'去向建议不决定谁配获救');
  ok(plan.choice===(v?'B':'A'),'去向建议按选择记录');
  const done=await p.evaluate(()=>__MOSS__.serialize());
  eq(['E01','E02','E03','E04','E05'].map(k=>done.story.tasks['MQ1-'+k]),Array(5).fill('done'),'五任务按序完成');
  const c=done.story.echoChapter;
  eq(Object.keys(c.records).length,11,'十项现场事实加一条门槛记录');
  eq(await p.evaluate(()=>__MOSS__.storyTaskStatus('MQ1-F01')),'locked','终幕未实装不伪解锁');
  await closeWin(p);await p.evaluate(()=>__MOSS__.openStoryScene('S056'));
  ok((await p.locator('.win-title').textContent()).includes('已演回看'),'已演只读回看');
  eq(await p.evaluate(()=>__MOSS__.serialize().story),done.story,'回看不改分支与日期事实');
  eq(await p.evaluate(()=>__MOSS__.serialize().char),done.char,'回看不重复发放经验');
  for(const size of [{width:390,height:844},{width:844,height:390}]){
   await p.setViewportSize(size);
   ok(await p.locator('.win').evaluate(e=>e.scrollWidth<=e.clientWidth+2),'回看窗口无横向溢出 '+size.width);}
  await p.reload();await click('继续游戏');
  eq(await p.evaluate(()=>__MOSS__.echoChapterState().records),c.records,'正式读档保留全部第五幕事实');
  const bad=await p.evaluate(()=>{const M=__MOSS__,raw=M.serialize().story;
   raw.echoChapter.records.rescue={day:-1,text:'坏档',source:'伪造',choice:'x'};
   raw.echoChapter.records.plan={day:25,choice:'A',text:'伪造',source:'伪造'};
   return M.normalizeStory(raw);});
  ok(!bad.echoChapter.records.rescue,'坏档缺前置裁掉后续记录');
  ok(!bad.echoChapter.records.plan,'坏档不补造办理记录');
  eq(await p.evaluate(()=>__MOSS__.SCHEMA_VERSION||'2'),'2','不升存档版本');
  await ctx.close();
 }
 /* --- E02 缺一份来源：仍能走完，但记录要写明缺哪一份 --- */
 {
  const s=structuredClone(base);
  delete s.story.evidence.lena_receipt;
  delete s.story.pineWork.records.ledger;
  const ctx=await load(s);
  await play('S049',0);await play('S050',0);await play('S051',0);
  const letters=await p.evaluate(()=>__MOSS__.echoChapterState().records.letters);
  ok(letters.text.includes('缺：'),'缺来源时记录写明缺哪一份');
  ok(letters.text.includes('母亲保留的查询回单')&&letters.text.includes('白松驿舍停宿与捎信账页'),'两份缺项都写进记录');
  await play('S052',0);
  const reply=await p.evaluate(()=>__MOSS__.echoChapterState().records.reply);
  ok(reply.text.includes('缺：'),'E02 末场也写明缺项');
  await ctx.close();
 }
 /* --- 提前探索：来过谷里、伊文鲁恩照常出现并直答 --- */
 {
  const s=structuredClone(base);
  s.story.flags.echoVisited=true;
  const ctx=await load(s);
  await p.evaluate(()=>__MOSS__.doSwitchScene('ms1_echo_village',16,11));
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='ms1_echo_village',null,{timeout:8000});
  eq(await p.evaluate(()=>__MOSS__.storyEchoVisited()),true,'进过谷里就算来过');
  await play('S049',0);
  const s49=await p.evaluate(()=>__MOSS__.STORY_SCENES.S049.lines.filter(l=>!l.when||l.when(__MOSS__.storyState().choices)).map(l=>l.text||''));
  ok(s49.some(t=>t.includes('上次来的时候，我在这里问过路')),'已入谷者走莱娜回访对白');
  await ctx.close();
 }
 {
  const s=structuredClone(base);
  s.story.flags.echo_met_iven=true;s.story.flags.echo_met_ruen=true;
  const ctx=await load(s);
  const npc=await p.evaluate(()=>{const r=__MOSS__.npcRuntime.ms1_iven;return r?{x:r.x,y:r.y}:null;});
  ok(!!npc,'伊文在测绘屋在场');
  await p.evaluate(([n])=>__MOSS__.devSwitchScene('ms1_echo_house',n.x,n.y+1),[npc]);
  await faceTowards(p,npc.x,npc.y);
  await p.keyboard.press('e');
  await p.waitForTimeout(260);
  const body=await p.locator('.win-body').textContent();
  ok(body.includes('已重逢、待补全旧事'),'提前遇见伊文显示已重逢待补全旧事');
  ok(['异议','别替我改口','等最后一条路画完'].some(t=>body.includes(t)),'提前遇见照常直答自己的事');
  await ctx.close();
 }
 eq(r.errors,[],'第五幕无浏览器错误');
 console.log('PASS 第五幕回声谷 '+checks+' 项（'+(single?'单文件':'源码')+'）');
}finally{await r.browser.close();}
