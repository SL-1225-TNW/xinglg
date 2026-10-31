/* 局部自然入口：使用已验收新档主线检查点，预置两位好感 25；不证明新档自然积累好感。
 * 其余状态来自 cc777daf 的自然路线；正常过夜、地图、步行、按 E 与按钮完成两段事件。 */
import assert from 'node:assert/strict';
import seedData from './fixture-ms1-life-save.mjs';
import {launch,snap,walkTo,walkAdjacent,faceTowards,closeWin,winOpen,winTitle,sleepViaMenu,dismissSettlement} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
const {browser,errors}=r;let page=r.page,checks=0;
function check(c,n){assert.ok(c,n);checks++;console.log('PASS',n);}
function eq(a,b,n){assert.deepEqual(a,b,n);checks++;console.log('PASS',n);}
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

async function event(id,sceneId,title,option,key){
 await go(sceneId);await closeWin(page);
 const pos=await page.evaluate(id=>{const n=__MOSS__.npcRuntime[id];return [Math.round(n.x),Math.round(n.y)];},id);
 check(!!await walkAdjacent(page,pos[0],pos[1]),'真实走近 '+id);
 await faceTowards(page,pos[0],pos[1]);await page.keyboard.press('e');await page.waitForTimeout(200);
 check(await page.locator('.dlg-body').count()===1,'真实搭话 '+id);
 await page.getByRole('button',{name:'一起 · '+title,exact:true}).click();
 await page.getByRole('button',{name:'愿意，看看吧',exact:true}).click();
 await page.getByRole('button',{name:option,exact:true}).click();
 eq(await page.evaluate(k=>[__MOSS__.state.story.flags[k],__MOSS__.state.story.choices[k]],key),[true,'A'],'真实完成 '+title);
 await closeWin(page);
}
try{
 const seed=structuredClone(seedData);seed.npcFriendship.ms1_lena=25;seed.npcFriendship.ms1_iven=25;
 await page.addInitScript(s=>{if(!sessionStorage.getItem('ms1-life-seed')){localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify(s));sessionStorage.setItem('ms1-life-seed','1');}},seed);
 await page.goto(new URL(single?'../苔芽农场-单文件版.html':'../index.html',import.meta.url).href);
 await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 check(await sleepViaMenu(page),'真实过夜结束莱娜的农舍会面');await dismissSettlement(page);
 await event('ms1_lena','city_post','挑纸与留白','纹理浅的纸','ms1_rel_lena');
 await event('ms1_iven','ms1_echo_house','两种画法','先画院墙','ms1_rel_iven');
 await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq(await page.evaluate(()=>[__MOSS__.state.story.flags.ms1_rel_lena,__MOSS__.state.story.flags.ms1_rel_iven]),[true,true],'两段事件正式读档保留');
 eq(errors,[],'局部自然路线无浏览器错误');
 console.log('PASS 人物生活局部自然入口'+(single?'（单文件版）':'')+' '+checks+' 项通过');
}finally{await browser.close();}
