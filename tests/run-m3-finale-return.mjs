/* F05 专项：F04 与前章事实、初始落点为夹具；接收、联络、维护和修订图由真实 E 与按钮产生。
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
 const sc=await p.evaluate(()=>__MOSS__.state.sceneId);await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 ok(await p.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'完成 '+sid);eq(await p.evaluate(()=>__MOSS__.state.sceneId),sc,'跨场不瞬移 '+sid);
}
const acts=['与弥拉及阿丽娅确认临时接收','与鲁恩及娜汀确认后续照护','与赫莎核对留守家庭联络渠道','与伊文确认临时维护与复核日期'];
const modes=['提交有限协作申请','通过赫莎转交独立联络单','领取个人经历记录'];
const map=['核对本人同意和现住记录','核对季节限制与复核日期','与伊文张贴不含私人地址的修订图'];
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const base=await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.totalDay=20;s.timeMinutes=540;s.coins=400;s.plots={};
  M.STORY_TASKS.filter(t=>t.act<=6).forEach(t=>st.tasks[t.id]='done');['MQ1-F01','MQ1-F02','MQ1-F03','MQ1-F04'].forEach(id=>st.tasks[id]='done');
  const rec=(choice,day,text)=>({day,choice,text,source:'前章现场夹具'});
  const ek=['entry','roster','letters','reply','labor','readback','rescue','slope','confirm','plan'],ec=['registered','read','checked','A','recorded','listed','separated','marked','listed','A'];
  st.echoChapter={records:{}};ek.forEach((k,i)=>st.echoChapter.records[k]=rec(ec[i],15,'第五幕 '+k));
  const dk=['arrival','lodging','intake','witness','original','compare','questions','resolution','permit','departure'],dc=['registered','A','classified','A','viewed','indexed','answered','A','limited','deferred'];
  st.capitalChapter={records:{},permitUntil:50};dk.forEach((k,i)=>st.capitalChapter.records[k]=rec(dc[i],14,'第四幕 '+k));
  st.pineChapter={records:{help:rec('A',14,'分头协作')}};
  const receipts=Object.fromEntries(['route','medical','food','receiver'].map(k=>[k,{day:17,source:'白松驿舍',text:'确认 '+k}]));
  const snapshot={assignmentDay:17,care:'家务核对',roster:'第五幕 confirm',receipts};
  const steps=(ids,day)=>ids.map((id,i)=>({id,day,minute:600+i}));
  st.finaleChapter={records:{prepare:rec('preview',16,'筹备'),home:rec('A',16,'家务'),replies:rec('confirmed',17,'回执'),assignment:rec('A',17,'分工'),march:rec('A',18,'安全线'),reception:rec('received',18,'弥拉与孩子到达；未答复留空'),roster:rec('confirmed',19,'本人核名；留守与未答复分列'),amendment:rec('appended',19,'保留原签核与改写历史')},
   support:{sentDay:16,receipts,checks:['names','handoff','experience'],experience:{id:'public',day:17}},
   f03:{attempts:[{startDay:18,role:'A',snapshot,steps:['water','sign','slope','detour'].map(id=>({id,day:18}))}],reception:['mira','care','pending'].map(id=>({id,day:18}))},
   f04:{roster:steps(['mira','ruen','others'],19),case:steps(['original','history','statement','notice'],19)}};
  st.finaleChapter.f04.case.forEach((v,i)=>{v.minute=610+i;});return M.serialize();
 });
 for(let mode=0;mode<3;mode++){
  const ctx=await load(structuredClone(base));const before=await p.evaluate(()=>({coins:__MOSS__.state.coins,military:__MOSS__.serialize().militaryLife}));
  await at('S067');eq(await p.locator('.story-options button').count(),3,'三种参与方式可选');await p.locator('.story-options button').nth(mode).click();
  for(const action of acts)await click(action);await click(modes[mode]);await click('登记接收、联络与临时维护');
  let c=await p.evaluate(()=>__MOSS__.finaleChapterState());eq(c.records.settlement.choice,['A','B','C'][mode],'只登记本人选择');
  eq(c.f05.arrangements[3].reviewDay,c.f05.arrangements[3].day+7,'临时维护保留明确复核日期');
  ok(c.records.settlement.text.includes('未答复者不代为决定'),'未答复者不自动迁居');
  if(mode===0)ok(c.records.settlement.text.includes('等待单独审核'),'申请不等于任命');
  if(mode===1)ok(c.records.settlement.text.includes('未登记供货、报酬或任期'),'联络不虚构供货与报酬');
  await finish('S067');await at('S068');for(const action of map)await click(action);await click('登记修订地图');
  c=await p.evaluate(()=>__MOSS__.finaleChapterState());ok(c.records.route_map.text.includes('不公开私人地址与病情'),'地图保护私人资料');
  ok(c.records.route_map.text.includes('永久工程尚未完成'),'临时路线不冒充永久工程');await finish('S068');
  eq(await p.evaluate(()=>__MOSS__.storyState().tasks['MQ1-F05']),'done','F05 两场完成');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before.coins,'登记不扣私人金币');
  eq(await p.evaluate(()=>__MOSS__.serialize().militaryLife),before.military,'不授予军事岗位');
  await p.reload();await click('继续游戏');eq(await p.evaluate(()=>__MOSS__.finaleChapterState().f05.map.length),3,'地图核对读档保留');
  const legacy=await p.evaluate(()=>{const M=__MOSS__,s=M.serialize().story;['arrangements','map'].forEach(k=>s.finaleChapter.f05[k].forEach(v=>{v.minute+=0.25;}));return M.normalizeStory(s);});
  eq(legacy.finaleChapter.f05.arrangements.length,5,'旧档小数时钟保留安置记录');eq(legacy.finaleChapter.f05.map.length,3,'旧档小数时钟保留地图记录');
  const broken=await p.evaluate(()=>{const M=__MOSS__,s=M.serialize().story;s.finaleChapter.f05.arrangements[3].reviewDay+=1;return M.normalizeStory(s);});
  eq(!!broken.finaleChapter.records.settlement,false,'坏复核日期不保留安置完成');eq(!!broken.finaleChapter.records.route_map,false,'坏档不补造已张贴地图');
  await ctx.close();
 }
 eq(r.errors,[],'无浏览器错误');console.log('PASS 终幕 F05 安置与地图 '+checks+' 项通过'+(single?'（单文件）':'（源码）'));
}finally{await r.browser.close();}
