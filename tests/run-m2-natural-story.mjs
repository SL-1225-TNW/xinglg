/* 全新存档连续五幕：只以真实键鼠改变玩法状态；__MOSS__ 只读路线和结果。
 * 不注入任务、物品、金钱、时间或落点。--resume 仅用于开发诊断，读取本套件
 * 通过真实操作保存的检查点；默认与 CI 必须从新档开始。公共地图仅用已到访节点。
 * 第四幕段（王都）：河港柜台真实办理皇家驿路接驳登记 → 潮汐港北口步行进
 * 王都驿站街 → 五处操作台逐场真实办理 → D01—D05 全部完成。
 * 第五幕：真实办理邻领确认、白松复测，首次步行入谷并完成十场。
 * 自动化用时不代表初见玩家时长，也不代表实体手机手感。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch,boot,snap,walkTo,walkAdjacent,faceTowards,clickTile,pickTool,closeWin,winOpen,winTitle,winText,sleepViaMenu,dismissSettlement } from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
const {browser,errors}=r; let page=r.page;
const started=Date.now(); let checks=0;
function check(c,n){assert.ok(c,n);checks++;console.log('PASS',n);}
function eq(a,b,n){assert.deepEqual(a,b,n);checks++;console.log('PASS',n);}
const rad = Array.from({ length: 8 }, (_, i) => [7 + i, 8]);
const pot = [[7, 7], [8, 7]];
const str = [[15, 8], [16, 8]];
const nodes = s => Object.entries(s.nodes).map(([key, value]) => ({ ...value, x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }));
async function walk(x, y) { assert.ok(await walkTo(page, x, y, 25000), '走到 ' + x + ',' + y); }
async function adjacent(x, y) { assert.ok(await walkAdjacent(page, x, y), '邻近 ' + x + ',' + y); }
async function select(slot, label) {
  await pickTool(page, slot);
  await page.locator('#typePick button').filter({ hasText: label }).click();
}
async function plant(tiles, name) {
  await go('farm');
  for (const [x, y] of tiles) { await adjacent(x, y); await pickTool(page, 1); await clickTile(page, x, y); }
  await select(2, name);
  for (const [x, y] of tiles) { await adjacent(x, y); await clickTile(page, x, y); }
}
async function care() {
  await go('farm');
  const s = await snap(page);
  for (const [key, plot] of Object.entries(s.plots)) {
    if (!plot.crop || plot.mature || plot.water) continue;
    const [x, y] = key.split(',').map(Number);
    await adjacent(x, y); await pickTool(page, 3); await clickTile(page, x, y);
    check((await snap(page)).plots[key].water, '浇水 ' + key);
  }
}
async function rest() {
  await care();
  const day = (await snap(page)).day;
  assert.ok(await sleepViaMenu(page), '通过暂停菜单睡觉');
  await dismissSettlement(page);
  eq((await snap(page)).day, day + 1, '正常睡眠推进一天');
}
async function collect(wood, stone) {
  for (let n = 0; n < 80; n++) {
    await go('farm'); await care();
    const s = await snap(page);
    if ((s.inv.wood || 0) >= wood && (s.inv.stone || 0) >= stone) return;
    const type = (s.inv.stone || 0) < stone ? 'stone' : 'tree';
    const node = nodes(s).filter(v => v.type === type && v.active)
      .sort((a, b) => Math.abs(a.x - s.px) + Math.abs(a.y - s.py) - Math.abs(b.x - s.px) - Math.abs(b.y - s.py))[0];
    const cost = type === 'tree' ? 12 : 8;
    if (!node || s.energy < cost) { await rest(); continue; }
    await adjacent(node.x, node.y); await pickTool(page, type === 'tree' ? 5 : 6);
    for (let i = 0; i < (type === 'tree' ? 3 : 2); i++) await clickTile(page, node.x, node.y);
    const item = type === 'tree' ? 'wood' : 'stone';
    eq((await snap(page)).inv[item], (s.inv[item] || 0) + (type === 'tree' ? 5 : 3), '正常采集 ' + item);
  }
  throw Error('采集未能完成');
}
async function mature(tiles) {
  for (let n = 0; n < 20; n++) {
    const s = await snap(page);
    if (tiles.every(([x, y]) => s.plots[x + ',' + y]?.mature)) return;
    await rest();
  }
  throw Error('作物未成熟');
}
async function harvest(tiles) {
  await go('farm'); await pickTool(page, 4);
  for (const [x, y] of tiles) { await adjacent(x, y); await clickTile(page, x, y); }
}
async function interact(x, y) {
  await adjacent(x, y); await faceTowards(page, x, y); await page.keyboard.press('e');
  await page.waitForTimeout(200);
}
async function shop() { await go('town'); await interact(8, 7); check((await winTitle(page)).includes('种子铺'), '实际走到商店开门'); }
async function quest(id, name) {
  await go('town'); await interact(id === 3 ? 26 : 14, 9);
  await page.locator('.win .quest').filter({ hasText: name }).getByRole('button', { name: '交付材料', exact: true }).click();
  await page.waitForTimeout(400);
  eq((await snap(page)).quests[id], 'done', '交付委托 ' + id);
  await closeWin(page);
}
const scene=async()=> (await snap(page)).scene;
async function click(re){
  const bs=page.locator('.win button'); const names=await bs.allTextContents();
  const i=names.findIndex(n=>typeof re==='string'?n.includes(re):re.test(n));
  assert.ok(i>=0,'找不到 '+re+'；现有 '+names.join('|'));
  await bs.nth(i).click(); await page.waitForTimeout(120);
}
async function cityTransfer(x,y){
 if(await scene()!=='city')return;
  const names={castle:'城堡与仪式核心',park:'北部公园',garden:'花园住宅',oldtown:'西坡老城',craft:'手工业街',commerce:'市政商业区',university:'白蔷薇大学',industry:'东南工业码头',workers:'工人生活街',station:'南门驿站'};
  const id=await page.evaluate(([x,y])=>{
   const M=__MOSS__,p=M.state.player;let best=null,dist=Math.abs(x-p.x)+Math.abs(y-p.y);
   for(const id of Object.keys(M.state.travel.discovered||{}).filter(k=>k.startsWith('city.district.'))){const pv=M.travelPreview(id);if(!pv.ok||!pv.landing)continue;const d=Math.abs(x-pv.landing.x)+Math.abs(y-pv.landing.y);if(d+60<dist){dist=d;best=id;}}
   return best;
  },[x,y]);
 if(id){await closeWin(page);await page.keyboard.press('m');await page.getByRole('button',{name:names[id.split('.').pop()],exact:true}).click();await page.waitForTimeout(850);console.log('PUBLIC DISTRICT',id);}
}
async function point(it){
  await closeWin(page);
  if(it.scene==='city')await cityTransfer(it.x,it.y);
  const candidates=it.stand||[[it.x,it.y+1],[it.x-1,it.y],[it.x+1,it.y],[it.x,it.y-1]];
  for(const [x,y]of candidates){
    let went=await walkTo(page,x,y,180000);
    if(await scene()!==it.scene&&await dayRolled()){
      console.log('DAY ROLL','自动睡眠打断现场步行，次日照原入口续行 '+it.scene);
      await go(it.scene);went=await walkTo(page,x,y,180000);
    }
    if(!went)continue;
    if(await scene()!==it.scene) return false;
    await faceTowards(page,it.x,it.y);await page.keyboard.press('e');await page.waitForTimeout(850);
    if(await scene()!==it.scene||await page.locator('.win-title').count())return true;
  }
  throw Error('无法交互 '+JSON.stringify(it));
}
/* 22:00 自动睡眠会把玩家送回农场：那是产品既有规则，玩家第二天照原路继续走。
   所以长距离步行前先主动过夜，被自动睡眠打断时认清「天结束」结算再续行，
   不算产品缺陷、不改落点、不用传送跳过入口。 */
async function dayRolled(){
  if(!await winOpen(page))return false;
  if(/天结束/.test(await winTitle(page))){await dismissSettlement(page);return true;}
  await closeWin(page);return false;
}
/* 睡一觉会把人送回农场的床上，所以要回 go() 的循环里重新规划路线。 */
async function freshenDay(need,label){
  const end=await page.evaluate(()=>__MOSS__.CFG.dayEnd);
  const t=(await snap(page)).time;
  if(t+need<=end)return false;
  assert.ok(await sleepViaMenu(page),'长距离步行前真实过夜 '+label);
  await dismissSettlement(page);
  console.log('DAY ROLL','提前过夜',label,'第',(await snap(page)).day,'天');
  return true;
}
async function go(target){
  await closeWin(page);
  for(let hop=0;hop<24;hop++){
    const now=await scene(); if(now===target)return;
    if(hop===0){
      const node=await page.evaluate(to=>__MOSS__.travelNodes.find(n=>n.sceneId===to&&__MOSS__.state.travel.discovered[n.id]&&__MOSS__.travelPreview(n.id).ok),target);
      if(node){
        await page.keyboard.press('m');
        const world=page.getByRole('button',{name:'全境总图',exact:true});if(await world.count())await world.click();
        await page.waitForTimeout(250);
        /* 全境总图只列区域公共站；登记点若不在图上（例如白松／潮汐港的码头站），
           关掉地图改走真实步行路线，不把「没有按钮」当成传送失败。 */
        const station=page.getByRole('button',{name:new RegExp('^'+node.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first();
        if(await station.count()){
          await station.click();
          await click('传送过去');await page.waitForTimeout(950);
          eq(await scene(),target,'真实地图返回已到访公共站 '+target);return;
        }
        console.log('MAP FALLBACK',node.name,'不在全境总图，改步行');
        await closeWin(page);await page.waitForTimeout(200);
      }
    }
    const route=await page.evaluate(([start,target])=>{
      const M=__MOSS__, gates={cloud_pass:'cloud_pass',old_road:'old_road',neighbor:'neighbor_border',port:'port',wetland:'wetland',vineyard:'vineyard',clinic:'clinic',waterworks:'waterworks',border_camp:'border_camp',quarry:'quarry'};
      const edges={};
      for(const [id,map]of Object.entries(M.MAPS)){
        const doors=(map.doors||[]).map(e=>({...e,scene:id,type:'door'}));
        edges[id]=[...doors,...(map.exits||[]).filter(e=>!doors.some(d=>d.to===e.to)).map(e=>({...e,scene:id,type:'exit'})),...(M.INTERACTABLES[id]||[]).filter(i=>i.to||i.kind==='extendedGate').map(i=>({...i,to:i.to||gates[i.gate],scene:id,type:i.kind==='extendedGate'?'gate':'door'}))].filter(e=>M.MAPS[e.to]);
      }
      edges.farm.push({scene:'farm',to:'house',x:3,y:4,type:'door',stand:[[3,5]]});
      edges.town.push({scene:'town',to:'riverside',x:31,y:10,type:'exit'});
      const q=[[start,[]]],seen=new Set([start]);
      while(q.length){const [id,path]=q.shift();if(id===target)return path;for(const e of edges[id]||[])if(!seen.has(e.to)){seen.add(e.to);q.push([e.to,[...path,e]]);}}
      return null;
    },[now,target]);
    assert.ok(route?.length,'没有自然路线 '+now+' → '+target);
    const e=route[0];console.log('ROUTE',now,'→',e.to,e.x,e.y);
    const s0=await snap(page);
    if(await freshenDay((Math.abs(e.x-s0.px)+Math.abs(e.y-s0.py))*0.45+25,'步行至 '+e.to)){hop=-1;continue;}
    if(e.type==='exit')check(await walkTo(page,e.x,e.y,180000),'步行出口 '+e.to);
    else {await point(e);if(e.type==='gate')await click(/^前往 /);}
    await page.waitForTimeout(450);
    if(await scene()!==e.to){
      if(await dayRolled()){console.log('DAY ROLL','自动睡眠打断步行，次日照原路线续行');hop=-1;continue;}
    }
    eq(await scene(),e.to,'自然抵达 '+e.to);
  }
  throw Error('路线过长 '+target);
}
async function site(id){
 const it=await page.evaluate(id=>{for(const [sc,its]of Object.entries(__MOSS__.INTERACTABLES)){const it=its.find(i=>i.id===id||i.work===id);if(it)return {...it,scene:sc};}},id);
 assert.ok(it,'找不到现场 '+id);await go(it.scene);check(await point(it),'E 打开 '+id);
}
/* 按场景 + work 取注册表里的工位（含 stand），避免把站立格当交互格传给 point */
async function workSite(scene,work){
  const it=await page.evaluate(([sc,w])=>{const i=(__MOSS__.INTERACTABLES[sc]||[]).find(i=>i.work===w);return i?{...i,scene:sc}:null;},[scene,work]);
  assert.ok(it,'找不到工位 '+scene+'/'+work);return it;
}
async function checkpoint(name){
  const st=await page.evaluate(()=>__MOSS__.serialize());
  fs.writeFileSync(new URL('../output/natural-story-'+name+'.json',import.meta.url),JSON.stringify(st));
  console.log('CHECKPOINT',name,'day',st.totalDay,'coins',st.coins);
}
async function schedule(){
  await closeWin(page);await page.keyboard.press('j');await click('长期安排 · 农场照料');
}
async function journey(name,target){
  await schedule();
  const cancel=page.getByRole('button',{name:/^取消剩余计划/});
  if(await cancel.count()){await cancel.click();await schedule();}
  const gold=(await snap(page)).coins;
  await click(new RegExp('^'+name+' · 3 天 · .*（公付）$'));
  eq((await snap(page)).coins,gold,'公共旅行预约不进出个人钱包 '+name);
  for(let i=0;i<10;i++){
   check(await sleepViaMenu(page),'真实过夜推进 '+name);await dismissSettlement(page);
   if(await scene()===target){
    const j=await page.evaluate(()=>__MOSS__.farmPlanState().journey);
    eq(j.log.length,1,'首日到达并记一日真实旅行账 '+name);console.log('TRAVEL',name,JSON.stringify(j.log));return;
   }
   console.log('TRAVEL WAIT',name,JSON.stringify(await page.evaluate(()=>__MOSS__.farmPlanState().pausedReasons)));
  }
  throw Error('十天内未能出发 '+name);
}
async function openStory(sid){
  const e=await page.evaluate(sid=>__MOSS__.STORY_ENTRIES.find(e=>e.storyScene===sid),sid);
  if(!e){
    const anchor=await page.evaluate(id=>__MOSS__.STORY_ENTRIES.find(e=>e.task===__MOSS__.STORY_SCENES[id].task),sid);
    await go(anchor.scene);await point({...anchor,scene:anchor.scene});await closeWin(page);
    await page.keyboard.press('j');await click('打开主线日志');
    await page.locator('.panel-box.quest').filter({hasText:anchor.task+'.'}).getByRole('button',{name:'继续这一段',exact:true}).click();
    check((await winTitle(page)).startsWith(sid+' ·'),'同地点日志恢复 '+sid);return;
  }
  assert.ok(e,'没有剧情入口 '+sid);await go(e.scene);await point({...e,scene:e.scene});
  if(sid==='S001'&&!String(await winTitle(page)).startsWith('S001'))await click(/跳过回忆|拆开信/);
  check((await winTitle(page)).startsWith(sid+' ·'),'自然剧情入口 '+sid);
}
async function chapterWork(sid,line){
  const body=()=>page.locator('.win-body button');
  if(sid==='S022'){await site('ms1_pine_stove');for(const t of ['撑开窗户','移开灶旁','停火等待','取赫莎备好'])await click(t);}
  if(sid==='S023'){await site('ms1_pine_supper');await click('我洗菜备料');}
  if(sid==='S024'){await site('ms1_pine_supper');await click('旅人说上个月');await site('ms1_pine_ledger');await click('伊文记过');}
  if(sid==='S025'){await site('ms1_pine_ledger');await click('约定赫莎带路');}
  if(sid==='S026')for(const [i,a,b]of [[1,'标出裂边','标清承重点'],[2,'核对水痕','沿已核验的高岸'],[3,'核对旧桥','沿已核验的背风']]){await site('ms1_path_fork'+i);await click(a);await click(b);}
  if(sid==='S030')for(const [id,label]of [['customs','按清册逐件核对'],['cargo','按三标归置公共空箱']]){await site('ms1_tide_'+id);await click(label);}
  if(sid==='S031'){await site('ms1_tide_chart');await click('先问同意再取同行事实');}
  if(sid==='S033'){await site('ms1_tide_sort');await click('分三堆并查到转交号');}
  if(sid==='S035'){await site('ms1_tide_bollard');await click('逐个查缆桩');}
  await openStory(sid);
  const labels=await body().allTextContents();
  const action=labels.find(t=>/确认此次民用行程|按分工安置旅人|核对留存副本|分钟/.test(t));
  if(line.action&&action)await click(action);
  await click('核对已办记录，继续');
}
async function play(sid){
  /* S035 没有 step 行：缆桩准备在收场时由 storyCMissing 校验，必须先用真实入口办掉。 */
  if(sid==='S035'&&!await page.evaluate(()=>!!__MOSS__.tideWorkState().records.bollard)){await site('ms1_tide_bollard');await click('逐个查缆桩');await closeWin(page);}
  if(!(await winTitle(page)).startsWith(sid+' ·'))await openStory(sid);
  for(let n=0;n<100;n++){
   if(!(await winTitle(page)).startsWith(sid+' ·'))break;
   const line=await page.evaluate(id=>{const M=__MOSS__,rec=M.state.story.scenes[id];return M.STORY_SCENES[id].lines[rec?.idx||0]||null;},sid);
   if(!line){await click(/^继续$|回到门前/);break;}
   if(line.choice){await page.locator('.story-options button').first().click();}
   else if(line.step){
    if(line.mode==='items'){for(const text of line.order||line.picks)await click(text);await click(line.confirm||'确认');}
    else if(line.mode==='overlay'){
      for(const ref of line.refs){const row=page.locator('.story-ref').filter({hasText:ref.name});await row.getByRole('button',{name:{old:'只在旧图',new:'只在新版',both:'两张都有'}[ref.answer],exact:true}).click();}
      await click(line.options.find(o=>o.id===line.answer).text);
    }else if(line.mode==='reception'){
      while(await page.getByRole('button',{name:'先看看他站哪儿',exact:true}).count())await page.getByRole('button',{name:'先看看他站哪儿',exact:true}).first().click();
      while(await page.getByRole('button',{name:/先请他开口|再问这一位/}).count())await page.getByRole('button',{name:/先请他开口|再问这一位/}).first().click();
      await click('单独请到步道');await click('这一段到此为止');
    }else await chapterWork(sid,line);
   }else await click(/^继续$/);
  }
  if(!await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,sid)){
    const why=await page.evaluate(id=>{const M=__MOSS__;return (M.storyCMissing&&M.storyCMissing(id))||(M.storyBMissing&&M.storyBMissing(id))||'';},sid);
    if(why)console.log('MISSING',sid,why);
  }
  check(await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,sid),'自然完成 '+sid);
  if(!/^S\d/.test(await winTitle(page)))await closeWin(page);
}
/* ---------- 第四幕：王都 ---------- */
/* 剧情正文里的「继续」按钮在 .win-foot；操作台的办理按钮在 .win-body，
   两者分开点，避免把「核对已办记录，继续」当成正文推进。 */
async function storyNext(){
  await page.locator('.win-foot button').filter({hasText:/^继续$/}).first().click();
  await page.waitForTimeout(120);
}
async function enterDoor(from,to){
  const door=await page.evaluate(([sc,to])=>__MOSS__.INTERACTABLES[sc].find(i=>i.to===to),[from,to]);
  assert.ok(door,'找不到门 '+from+' → '+to);
  let entered=false;
  for(const [x,y]of [[door.x,door.y+1],[door.x+1,door.y],[door.x-1,door.y],[door.x,door.y-1]]){
    if(!await walkTo(page,x,y,30000))continue;
    await faceTowards(page,door.x,door.y);await page.keyboard.press('e');await page.waitForTimeout(400);
    if(await scene()===to){entered=true;break;}
    await closeWin(page);
  }
  check(entered,'真实步行进门 '+from+' → '+to);
}
const CAPITAL_BUTTONS={arrival:'核对皇家驿路凭证并登记到站',witness:'登记科林自愿说明与亲历边界',original:'出示许可，现场调阅三托盘原件',resolution:'确认补正与公开范围',permit:'登记有限范围、双方人员与续约条件',departure:'收好疑点覆纸，保留现住意见空栏'};
async function capitalStep(sid,key){
  if(key==='lodging'){
    const meal=await page.evaluate(()=>(__MOSS__.state.story.choices||{}).d01_meal);
    await click(meal==='B'?'饭后回到留言板，核材料并确认床位':'一起核材料并确认专款床位');
  }else if(key==='intake'){
    for(const s of ['岸上接应 → 亲见','异议抄件 → 转交材料','责任推测 → 尚待核验'])await click(s);
    await click('提交分类并领取有限查阅许可');
  }else if(key==='compare'){
    for(const s of ['灾害当日','异议提交日','旧图汇编日','正式结项日'])await click('日期卡：'+s);
    await click('最后签核人：伯兰');
    await click('依据：未附新增逐户名单');
    await click('核对日期与签核，登记可核副本');
  }else if(key==='questions'){
    await click('引用私人短笺：承认伊文自己的南线选择');
    await click('引用副本：说明原页与结项差异');
    await click('引用当前风险图：不把危险说成安全');
    await click('提交三项有来源的回答');
  }else await click(CAPITAL_BUTTONS[key]);
  const rec=await page.evaluate(k=>__MOSS__.capitalChapterState().records[k],key);
  check(!!(rec&&rec.source&&rec.day>0),'第四幕现场记录来源与日期 '+key);
}
/* 第四幕十场各有真实入口：操作台场按 workSite 找工位，街上两场按剧情入口格。 */
async function capitalEntry(sid){
  const e=await page.evaluate(id=>__MOSS__.STORY_ENTRIES.find(e=>e.storyScene===id),sid);
  assert.ok(e,'没有第四幕入口 '+sid);
  const it=await page.evaluate(e=>{const M=__MOSS__,list=M.INTERACTABLES[e.scene]||[];const i=e.workSite?list.find(x=>x.work===e.workSite):list.find(x=>x.id===e.id);return i?{...i,scene:e.scene}:null;},e);
  assert.ok(it,'找不到第四幕工位 '+sid);
  await go(it.scene);
  check(await point(it),'真实按 E 走到 '+sid+' 入口');
  if(e.workSite)await click('办理 '+sid+' · '+e.label);
  check((await winTitle(page)).startsWith(sid+' ·'),'真实开演 '+sid);
}
async function capitalPlay(sid){
  for(let n=0;n<80;n++){
   const line=await page.evaluate(id=>{const M=__MOSS__,rec=M.state.story.scenes[id];return M.STORY_SCENES[id].lines[rec?.idx||0]||null;},sid);
   if(!line)break;
   if(line.choice){await page.locator('.story-options button').first().click();await page.waitForTimeout(150);}
   else if(line.step){await capitalStep(sid,line.action);await click('核对已办记录，继续');}
   else await storyNext();
  }
  await storyNext();
  check(await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,sid),'自然完成 '+sid);
  const where=await page.evaluate(()=>__MOSS__.state.sceneId);
  check(await page.evaluate(id=>__MOSS__.state.story.scenes[id]?.seen,sid),'第四幕场次已记录 '+sid+'（'+where+'）');
}
async function capitalLeg(){
  /* 皇家驿路接驳在下游河港的船闸值守室：柜台按钮是真办，不是夹具。 */
  await go('port');
  await enterDoor('port','port_lockhouse');
  await site('profession:lock');
  await click('办理皇家驿路接驳登记');
  check(await page.evaluate(()=>__MOSS__.storyHasEvidence('capital_pass')),'真实办理皇家驿路接驳登记');
  /* 王都是首次到访：公共站此前未登记，不能靠地图传送，只能走皇家驿路北口。 */
  await go('ms1_tide_docks');
  check(!(await page.evaluate(()=>!!__MOSS__.state.travel.discovered['capital.station_street'])),'王都公共站此前未登记，不能用地图传送抵达');
  await go('ms1_capital_street');
  check(await page.evaluate(()=>!!__MOSS__.state.travel.discovered['capital.station_street']),'沿皇家驿路步行到访王都后自动登记公共站');
  eq(await page.evaluate(()=>__MOSS__.storyDEntryReason()===''),true,'第四幕门槛齐备：核验函、河港记录、接驳登记与第三幕材料');
}
async function capitalAct(){
  await capitalLeg();
  await capitalEntry('S039');await capitalPlay('S039');
  await capitalEntry('S040');await capitalPlay('S040');
  /* 入住把会面约在明天午后：回行旅舍留言板改约今日空档，不跳过预约门槛。 */
  await site('ms1_capital_letters');
  await click('改约今日空档');
  const ap=await page.evaluate(()=>__MOSS__.capitalChapterState());
  eq(ap.appointmentDay,(await snap(page)).day,'会面当场改约到今天');
  await capitalEntry('S041');await capitalPlay('S041');
  await capitalEntry('S042');await capitalPlay('S042');
  await capitalEntry('S043');await capitalPlay('S043');
  await capitalEntry('S044');await capitalPlay('S044');
  await capitalEntry('S045');await capitalPlay('S045');
  await capitalEntry('S046');await capitalPlay('S046');
  await capitalEntry('S047');await capitalPlay('S047');
  await capitalEntry('S048');await capitalPlay('S048');
  await checkpoint('capital');
}
/* 第五幕：所有门槛和场次均由真实步行、E 与按钮产生。 */
const ECHO_BUTTONS={entry:'核对核验手续与近期路线，登记入谷',roster:'查阅居民自记的送药与换粮簿',letters:'核对未寄出的信与旧图抄页',reply:'与莱娜、鲁恩分别核对旧信',labor:'记录本户意愿与可协助事项',readback:'把记录读回本人并逐户分列',rescue:'对照当年的救援选择与结项改写',slope:'在界绳内核坡体、水痕与北坡线',confirm:'逐户确认去向，未答复的留空',plan:'登记去向建议与协作分工'};
async function echoStep(key){
 const choices={reply:['确认：确实尝试联系过','确认：最后一封是自己停下的'],labor:['记下：弥拉想带孩子离开，需要上学与看病的通路','记下：另一户希望留下，需核通路与照护条件'],readback:['逐户分列：弥拉（离开）·另一户（留下）·未同意户（只记匿名需求）'],rescue:['伊文的责任：南线先送重伤者，说会带第二批回来','伯兰的改写：把北侧住户写成迁居完成'],slope:['核坡体','核水痕','核旧石基','核北坡线'],confirm:['确认弥拉：带孩子离开（本人已答复）','确认另一户：先留下，待通路与照护条件核验（本人已答复）']};
 for(const label of choices[key]||[])await click(label);
 await click(ECHO_BUTTONS[key]);
 const rec=await page.evaluate(k=>__MOSS__.echoChapterState().records[k],key);
 check(!!(rec&&rec.source&&rec.day>0),'第五幕现场记录来源与日期 '+key);
 await click('核对已办记录，继续');
}
async function echoEntry(sid){
 const e=await page.evaluate(id=>__MOSS__.STORY_ENTRIES.find(x=>x.storyScene===id),sid);
 assert.ok(e,'没有第五幕入口 '+sid);
 const it=await page.evaluate(e=>{const a=__MOSS__.INTERACTABLES[e.scene]||[];const own=a.find(i=>i.id===e.id);const site=a.find(i=>i.work===e.workSite);const i=own||site;return i?{...i,scene:e.scene,own:!!own}:null;},e);
 assert.ok(it,'找不到第五幕入口 '+sid);
 await go(it.scene);check(await point(it),'真实按 E 走到 '+sid+' 入口');
 if(!it.own)await click('办理 '+sid+' · '+e.label);
 check((await winTitle(page)).startsWith(sid+' ·'),'真实开演 '+sid);
}
async function echoPlay(sid){
 await echoEntry(sid);
 for(let n=0;n<90;n++){
  const line=await page.evaluate(id=>{const M=__MOSS__;return M.STORY_SCENES[id].lines[M.state.story.scenes[id].idx]||null;},sid);
  if(!line)break;
  if(line.choice){await page.locator('.story-options button').first().click();await page.waitForTimeout(150);}
  else if(line.step)await echoStep(line.action);
  else await storyNext();
 }
 const before=await scene();await storyNext();
 check(await page.evaluate(id=>__MOSS__.storySceneSeen(id),sid),'自然完成 '+sid);
 eq(await scene(),before,'下一场不替玩家切图 '+sid);
}
async function echoAct(){
 check(await page.evaluate(()=>__MOSS__.storyHasEvidence('echo_guide')),'前章真实取得赫莎带路约定');
 await site('neighbor_case');await click('按本地权限确认官方核验范围');
 check(await page.evaluate(()=>__MOSS__.storyHasEvidence('neighbor_confirm')),'真实办理邻领权限确认');
 await site('ms1_pine_ledger');await click('与赫莎、核验队复测近期路线');
 check(await page.evaluate(()=>!!__MOSS__.echoChapterState().records.route_recheck),'真实办理近期路线复测');
 check(!(await page.evaluate(()=>!!__MOSS__.state.travel.discovered['echo.valley'])),'回声谷公共站此前未登记');
 await go('ms1_echo_village');
 check(await page.evaluate(()=>!!__MOSS__.state.travel.discovered['echo.valley']),'首次步行入谷后登记公共站');
 for(let i=49;i<=58;i++)await echoPlay('S'+String(i).padStart(3,'0'));
 await checkpoint('echo');
}
try{
 const resume=process.argv.find(a=>a.startsWith('--resume='))?.slice(9);
 if(resume){
  const seed=JSON.parse(fs.readFileSync(new URL('../output/natural-story-'+resume+'.json',import.meta.url),'utf8'));
  const ctx=await browser.newContext();page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{if(!sessionStorage.getItem('natural-resume')){localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(seed));sessionStorage.setItem('natural-resume','1');}},seed);
  await page.goto(new URL(single?'../苔芽农场-单文件版.html':'../index.html',import.meta.url).href);
  await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  console.log('DIAGNOSTIC RESUME',resume,'不能代替默认新档验收');
 }else{await boot(page);await page.locator('#tutorialSkip').click();}
 if(!resume){
  eq((await snap(page)).bridge,false,'全新存档未修桥');
  await play('S001');await play('S002');
  await plant(rad,'萝卜');await plant(pot,'土豆');await care();
  for(const id of ['S003','S004','S005-T','S006-T','S007-T','S008']){
   if(!await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,id))await play(id);
  }
  eq((await snap(page)).bridge,false,'未修桥自然走完序章');
  await checkpoint('prologue');
 }
 if(!resume||resume==='prologue'){
  await collect(15,9);await mature(rad);await harvest(rad);
  await quest(1,'第一份收成');await quest(2,'木匠的准备');
  await collect(25,15);await mature(pot);await harvest(pot);await quest(3,'把小桥修好');
  eq((await snap(page)).bridge,true,'交付真实材料修桥');
  await shop();
  for(let n=0;n<4;n++){
    const row=page.locator('.shop-row').filter({hasText:'萝卜'}).filter({has:page.getByRole('button',{name:'卖 1 个',exact:true})});
    if(!await row.count())break;await row.first().getByRole('button',{name:'卖 1 个',exact:true}).click();
  }
  await checkpoint('bridge');
 }
 if(!['act1','pine','tide','capital'].includes(resume)){
  if(!await page.evaluate(()=>__MOSS__.exploreState().city)){await go('town');const permitGold=(await snap(page)).coins;await interact(14,21);await click('办理通行证');eq(permitGold-(await snap(page)).coins,150,'自然办证实际支付150金');}
  check(await page.evaluate(()=>__MOSS__.exploreState().city),'真实办城市通行证');
  for(let i=9;i<=18;i++){const id='S'+String(i).padStart(3,'0');if(!await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,id))await play(id);}
  await checkpoint('act1');
 }
 if(!['trade','pine','tide','capital'].includes(resume)){
  // 港口资格来自两批真实本地运输，木材仍须亲自采集；不写路线计数。
  await go('farm');await collect(19,0);
  for(let batch=0;batch<2;batch++){
    if(batch){check(await sleepViaMenu(page),'真实隔夜开始第二批运输');await dismissSettlement(page);}
    /* 工位一律按注册表里的交互物定位：point 要的是交互格，不是它旁边的站立格。 */
    for(const [sc,work,label,minutes,energy,stage]of [['city_quay_store','receive','登记木材2',5,0,1],['city_sawmill','saw','批次细剖',60,10,2],['city_quay_store','stock','核验板材6并入库',5,0,3],['city_quay_store','stock','本地装运至船棚',25,1,5],['city_shipyard','receipt','签收板材6',5,0,6]]){
      // 按钮存在不代表工序已成功：晚到或体力不足时真实过夜后返回原工位。
      let ready=false;
      for(let attempt=0;attempt<3;attempt++){
        await go(sc);await point(await workSite(sc,work));
        if(await freshenDay(minutes+10,label))continue;
        if((await snap(page)).energy<energy){await closeWin(page);assert.ok(await sleepViaMenu(page),'体力不足时真实过夜');await dismissSettlement(page);continue;}
        ready=true;break;
      }
      assert.ok(ready,'工序准备完成 '+label);
      await click(label);
      eq(await page.evaluate(()=>__MOSS__.state.industry.stage),stage,'真实工序完成 '+label);
      await closeWin(page);
    }
  }
  check(await page.evaluate(()=>__MOSS__.professionalLifeState().routes.trade>=2),'两批真实签收取得商旅到访资格');
  eq(await page.evaluate(()=>__MOSS__.professionalLifeState().passes.commission),false,'民用路线未取得接任务授权');
  await checkpoint('trade');
 }
 if(!['pine','tide','capital'].includes(resume)){
  /* 森林入口按注册表交互物定位：直接走到 (14,1) 会先踩上北出口进森林，取证不稳。 */
  await go('town');
  if(!await page.evaluate(()=>__MOSS__.exploreState().forest)){await site('forest_gate');await click('确认修复 / 升级');await closeWin(page);}
  check(await page.evaluate(()=>__MOSS__.exploreState().forest),'真实修通森林入口');
  await go('cloud_pass');if(!await page.evaluate(()=>!!__MOSS__.state.story.scenes.S019?.seen))await play('S019');
  await go('neighbor_office');await site('neighbor_case');await click('登记民用行程');
  await play('S020');
  await journey('白松驿村','ms1_pine_village');
  for(let i=21;i<=28;i++){const id='S'+String(i).padStart(3,'0');if(!await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,id))await play(id);}
  await checkpoint('pine');
 }
 if(!['tide','capital'].includes(resume)){
  await go('port_office');await site('profession:port');await click('办理航路引荐');
  await journey('潮汐港','ms1_tide_docks');
  for(let i=29;i<=38;i++){const id='S'+String(i).padStart(3,'0');if(!await page.evaluate(id=>!!__MOSS__.state.story.scenes[id]?.seen,id))await play(id);}
  await checkpoint('tide');
 }
 if(resume!=='capital')await capitalAct();
 const end=await page.evaluate(()=>({tasks:{...__MOSS__.state.story.tasks},scene:__MOSS__.state.sceneId,coins:__MOSS__.state.coins,day:__MOSS__.state.totalDay}));
 eq(Object.values(end.tasks).filter(v=>v==='done').length,24,'自然串联序章至第四幕二十四任务全部完成');
 const cap=await page.evaluate(()=>__MOSS__.capitalChapterState());
 eq(Object.keys(cap.records).length,10,'第四幕十项现场事实齐全');
 check(cap.records.permit.text.includes('不是安全通行证'),'王都许可不替代入谷安全线');
 check(cap.records.departure.text.includes('现住意见留空'),'启程前不替居民作决定');
 check(!!(await page.evaluate(()=>__MOSS__.storyHasEvidence('capital_pass'))),'皇家驿路接驳凭证留档');
 await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq(await page.evaluate(()=>__MOSS__.state.story.tasks),end.tasks,'自然取得的二十四任务在正式读档后保留');
 eq(await page.evaluate(()=>Object.keys(__MOSS__.capitalChapterState().records).length),10,'第四幕现场事实在正式读档后保留');
 await echoAct();
 const echo=await page.evaluate(()=>({tasks:{...__MOSS__.state.story.tasks},records:__MOSS__.echoChapterState().records}));
 eq(['E01','E02','E03','E04','E05'].map(k=>echo.tasks['MQ1-'+k]),Array(5).fill('done'),'第五幕五任务全部完成');
 eq(Object.keys(echo.records).length,11,'第五幕十项现场事实与路线复测齐全');
 await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq(await page.evaluate(()=>__MOSS__.state.story.tasks),echo.tasks,'五幕任务正式读档后保留');
 eq(await page.evaluate(()=>__MOSS__.echoChapterState().records),echo.records,'第五幕现场事实正式读档后保留');
 eq(errors,[],'自然路线无浏览器错误');
 console.log('PASS 五幕自然串联',checks,'项通过，自动化耗时秒',Math.round((Date.now()-started)/1000));
} catch(e){console.error('FAIL SNAPSHOT',JSON.stringify(await snap(page)));await checkpoint('failure');throw e;}
finally{await browser.close();}
