import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,walkTo,closeWin,clickWin,winText} from './harness.mjs';
let checks=0;
const eq=(a,b,name)=>{assert.deepEqual(a,b,name);checks++;console.log('PASS',name);};
const bundled=process.argv.includes('--single-file');
const run=await launch(bundled?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=run.page;
async function pose(p,id,x,y){await p.evaluate(([id,x,y])=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(id,x,y);},[id,x,y]);await p.waitForTimeout(250);}
async function settled(id){await p.waitForFunction(id=>__MOSS__.state.sceneId===id,id);await p.waitForTimeout(250);}
async function reload(){await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.game?.running||!document.getElementById('startScreen')||__MOSS__.state.sceneId.startsWith('palace_'));}
async function receive(){await pose(p,'palace_east_wing',5,19);await p.keyboard.press('e');await clickWin(p,'查看后勤备餐');}
const stage=()=>p.evaluate(()=>__MOSS__.state.palace.provision.stage);
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 await p.evaluate(()=>{const M=__MOSS__;M.state.exploration.city=true;M.state.npcFriendship.yaya=30;});
 const audit=await p.evaluate(()=>{
  const M=__MOSS__,ids=['palace_basement','palace_east_wing','palace_east_upper'],bad=[],stairs=[];
  for(const id of ids){const map=M.MAPS[id],seen=new Set(),q=[[map.enter.x,map.enter.y]];
   while(q.length){const [x,y]=q.pop(),k=x+','+y;if(x<0||y<0||x>=map.w||y>=map.h||map.solid[x][y]||seen.has(k))continue;seen.add(k);q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
   for(let x=0;x<map.w;x++)for(let y=0;y<map.h;y++)if(!map.solid[x][y]&&!seen.has(x+','+y))bad.push(id+': isolated '+x+','+y);
   for(const it of M.INTERACTABLES[id]){
    for(const s of it.stand||[])if(!seen.has(s.join(',')))bad.push(id+': blocked '+it.id);
    if(it.kind==='palaceServiceStair'){
     stairs.push({id:it.id,scene:id,stand:it.stand[0],to:it.to});
     const target=M.MAPS[it.to];if(target.solid[it.tx][it.ty])bad.push(it.id+': blocked landing');
     const back=M.INTERACTABLES[it.to].find(x=>x.kind==='palaceServiceStair'&&x.to===id);
     if(!back||back.stand.some(s=>Math.abs(s[0]-it.tx)+Math.abs(s[1]-it.ty)<3))bad.push(it.id+': missing reverse or rebound');
    }
   }
  }
  return{bad,stairs,basementDoors:M.MAPS.palace_basement.doors.length};
 });
 eq(audit.bad,[],'三层后勤地面、站位、双向楼梯与落点全可达');
 eq(audit.stairs.length,4,'B1到二层有四段成对服务梯');eq(audit.basementDoors,0,'地下层没有直通地面的假门');
 for(const it of audit.stairs){await pose(p,it.scene,...it.stand);await p.keyboard.press('e');await settled(it.to);await p.keyboard.press('e');eq(await p.evaluate(()=>__MOSS__.state.sceneId),it.to,it.id+'实际换层且连按不反弹');}
 await receive();await clickWin(p,'领取备餐单');eq(await stage(),0,'未完成春宴不能领后续备餐');
 await p.evaluate(()=>{__MOSS__.state.exploration.cityStories.rose='done';});
 await clickWin(p,'领取备餐单');eq(await stage(),0,'缺土豆不建立货物进度');
 await p.evaluate(()=>{__MOSS__.invAdd('potato',2);__MOSS__.state.timeMinutes=__MOSS__.CFG.dayEnd-1;});
 await clickWin(p,'领取备餐单');eq(await stage(),0,'临近夜间不扣材料');eq(await p.evaluate(()=>__MOSS__.invCount('potato')),2,'时间不足原料保留');
 await p.evaluate(()=>{__MOSS__.state.timeMinutes=420;});await clickWin(p,'领取备餐单');eq(await stage(),1,'收货交出土豆并建立在途单');eq(await p.evaluate(()=>__MOSS__.invCount('potato')),0,'收货只扣一次原料');
 await closeWin(p);await reload();eq(await stage(),1,'收货后读档保留在途原料');
 await p.evaluate(()=>{__MOSS__.state.totalDay++;});
 eq(await walkTo(p,16,8),true,'收货区实际步行到下梯平台');await p.keyboard.press('e');await settled('palace_basement');
 eq(await walkTo(p,9,4),true,'从地下梯厅走到食材库');await p.keyboard.press('e');await clickWin(p,'登记食材入库');eq(await stage(),2,'跨日后入库继续原单');await closeWin(p);
 eq(await walkTo(p,25,5),true,'食材库步行到地下厨房');await p.keyboard.press('e');
 await p.evaluate(()=>{__MOSS__.state.energy=0;});await clickWin(p,'完成备餐');eq(await stage(),2,'体力不足不消耗在库食材');
 await p.evaluate(()=>{__MOSS__.state.energy=100;});await clickWin(p,'完成备餐');eq(await stage(),3,'厨房将原料转为在途饭菜');await closeWin(p);
 await pose(p,'palace_basement',24,5);await p.evaluate(()=>__MOSS__.invAdd('potato',2));await p.keyboard.press('e');
 eq((await winText(p)).includes('成品进背包'),true,'炉灶自用位置打开原料理界面');await clickWin(p,'开火');
 eq(await p.evaluate(()=>__MOSS__.invCount('rice')),1,'自用料理真实产出白米饭');eq(await stage(),3,'自用料理不消耗后勤单饭菜');await closeWin(p);
 fs.mkdirSync('output/playwright',{recursive:true});await p.screenshot({path:'output/playwright/palace-basement.png'});
 eq(await walkTo(p,19,15),true,'地下厨房走到上梯');await p.keyboard.press('e');await settled('palace_east_wing');
 eq(await walkTo(p,19,15),true,'地面层走到继续上楼的平台');await p.keyboard.press('e');await settled('palace_east_upper');
 eq(await walkTo(p,27,19),true,'到二层备餐台');await reload();eq(await stage(),3,'二层读档保留待交付饭菜');
 const before=await p.evaluate(()=>__MOSS__.state.coins);await p.keyboard.press('e');await clickWin(p,'交付备餐');eq(await stage(),4,'备餐台签收');eq(await p.evaluate(()=>__MOSS__.state.coins),before+45,'45金只结算一次');
 await clickWin(p,'交付备餐');eq(await p.evaluate(()=>__MOSS__.state.coins),before+45,'重复点击不再发奖');await closeWin(p);
 await p.screenshot({path:'output/playwright/palace-east-upper.png'});
 eq(await walkTo(p,1,19),true,'备餐层走到西门');await p.keyboard.press('e');await settled('city_castle');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'city_castle','后勤二层西门接主楼礼仪层');
 eq(await walkTo(p,62,19),true,'主楼二层走回后勤门');await p.keyboard.press('e');await settled('palace_east_upper');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'palace_east_upper','主楼二层可回备餐层');
 await receive();await p.evaluate(()=>__MOSS__.invAdd('potato',2));await clickWin(p,'领取备餐单');eq(await stage(),4,'当天不能重复领单');eq(await p.evaluate(()=>__MOSS__.invCount('potato')),2,'拒绝重复领单不扣材料');
 await p.evaluate(()=>__MOSS__.state.totalDay++);await clickWin(p,'领取备餐单');eq(await stage(),1,'下一游戏日可以开新单');await closeWin(p);
 await pose(p,'palace_basement',17,14);eq(await p.evaluate(()=>__MOSS__.questExitTile()),[19,15],'地下导航指向真实服务梯');
 eq(run.errors,[],'后勤流程无页面报错');
}finally{await run.browser.close();}
const mobile=await launch({viewport:{width:390,height:844},touch:true});
try{const p=mobile.page;await boot(p);await p.locator('#tutorialSkip').tap();await p.evaluate(()=>__MOSS__.state.exploration.city=true);
 await pose(p,'palace_east_wing',16,8);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_basement');eq(await p.locator('#floorTag').innerText(),'地下后勤 · B1','手机下梯及B1楼层牌');
 await p.locator('#floorTag').tap();eq((await winText(p)).includes('二层'),true,'手机导览包含全部后勤层');await closeWin(p);
 await pose(p,'palace_basement',19,15);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_east_wing');eq(await p.locator('#floorTag').innerText(),'东翼 · 地面层','手机服务梯返回地面');eq(mobile.errors,[],'手机服务梯无页面报错');
}finally{await mobile.browser.close();}
console.log(`后勤楼层 ${checks} 项通过${bundled?'（单文件）':''}`);
