import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,walkTo,closeWin,clickWin,winText,dismissSettlement} from './harness.mjs';
let checks=0;const eq=(a,b,name)=>{assert.deepEqual(a,b,name);checks++;console.log('PASS',name);};
const single=process.argv.includes('--single-file');
const run=await launch(single?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=run.page;
async function pose(id,x,y){await p.evaluate(([id,x,y])=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(id,x,y);},[id,x,y]);await p.waitForTimeout(200);}
async function settled(id){await p.waitForFunction(id=>__MOSS__.state.sceneId===id,id);await p.waitForTimeout(250);}
async function reload(){await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.state.sceneId.startsWith('city_'));}
async function enter(id){const d=await p.evaluate(id=>__MOSS__.INTERACTABLES.city.find(i=>i.id===id),id);eq(await walkTo(p,...d.stand[0],90000),true,'实际步行到'+id+'入口');await p.keyboard.press('e');await settled(d.to);}
async function leave(door='main'){const d=await p.evaluate(id=>__MOSS__.MAPS[__MOSS__.state.sceneId].doors.find(d=>d.id===id),door);eq(await walkTo(p,...d.stand[0]),true,'走到'+door+'返回门');await p.keyboard.press('e');await settled('city');}
const money=()=>p.evaluate(()=>__MOSS__.state.coins);
const mail=()=>p.evaluate(()=>__MOSS__.state.southGate.mailStage);
try{
 await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>__MOSS__.state.exploration.city=true);
 const audit=await p.evaluate(()=>{
  const M=__MOSS__,bad=[];
  for(const id of ['city_inn','city_inn_upper','city_post','city_carriage']){
   const m=M.MAPS[id],q=[[m.enter.x,m.enter.y]],seen=new Set();
   while(q.length){const [x,y]=q.pop(),k=x+','+y;if(x<0||y<0||x>=m.w||y>=m.h||m.solid[x][y]||seen.has(k))continue;seen.add(k);q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
   for(let x=0;x<m.w;x++)for(let y=0;y<m.h;y++)if(!m.solid[x][y]&&!seen.has(x+','+y))bad.push(id+':isolated '+x+','+y);
   for(const it of M.INTERACTABLES[id])if(['innStair','innBed','stationMail'].includes(it.kind)){
    for(const s of it.stand)if(!seen.has(s.join(',')))bad.push(id+':blocked '+it.id);
    if(it.kind==='innStair'){
     if(M.isSolid(it.to,it.tx,it.ty))bad.push('stair landing');
     const back=M.INTERACTABLES[it.to].find(b=>b.kind==='innStair'&&b.to===id);
     if(!back||back.stand.some(s=>Math.abs(it.tx-s[0])+Math.abs(it.ty-s[1])<3))bad.push('stair rebound');
    }
   }
  }
  for(const id of ['post_yard_entrance','south_gate_guide']){
   const it=M.INTERACTABLES.city.find(i=>i.id===id);for(const s of it.stand)if(M.isSolid('city',...s))bad.push(id+':blocked city stand');
  }
  const start=M.INTERACTABLES.city.find(i=>i.id==='south_gate_guide').stand[0];
  for(const id of ['inn','post','carriage','stable']){const d=M.INTERACTABLES.city.find(i=>i.id===id);if(!M.findPath('city',...start,...d.stand[0]))bad.push('yard route '+id);}
  return bad;
 });eq(audit,[],'旅馆、客房、邮局和马车站全部地面与操作站位连通');
 await pose('city',320,450);await enter('inn');eq(await walkTo(p,11,3),true,'旅馆原入口走到前台');
 await p.evaluate(()=>__MOSS__.state.coins=39);await p.keyboard.press('e');await clickWin(p,'登记客房 A');eq(await money(),39,'钱不足不扣房费');eq(await p.evaluate(()=>__MOSS__.state.southGate.booking),null,'钱不足不生成登记');
 await p.evaluate(()=>__MOSS__.state.coins=100);await clickWin(p,'登记客房 A');eq(await money(),60,'登记一次扣40金');
 eq(await p.locator('.win button').filter({hasText:'登记客房 A'}).count(),0,'已有登记不再提供重复收费');
 await clickWin(p,'取消当晚登记');eq(await money(),100,'取消当晚登记退回原房费');eq(await p.evaluate(()=>__MOSS__.state.southGate.booking),null,'取消清空登记');
 await clickWin(p,'登记客房 B');await closeWin(p);await reload();eq(await p.evaluate(()=>__MOSS__.state.southGate.booking.room),'b','房费与房间登记读档保留');eq(await money(),60,'读档不重复收费');
 eq(await walkTo(p,24,6),true,'前台步行到上楼平台');await p.keyboard.press('e');await settled('city_inn_upper');await p.keyboard.press('e');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'city_inn_upper','上楼连按不反弹');
 eq(await walkTo(p,7,12),true,'可穿过房门参观客房A');const day=await p.evaluate(()=>__MOSS__.state.totalDay);await p.keyboard.press('e');eq(await p.evaluate(()=>__MOSS__.state.totalDay),day,'登记B不能睡在A');
 eq(await walkTo(p,20,12),true,'从A经走廊到登记的B床旁');await p.keyboard.press('e');eq((await winText(p)).includes('明早在南门旅馆客房 B 醒来'),true,'确认窗口说明醒来位置');await clickWin(p,'再玩一会儿');eq(await p.evaluate(()=>__MOSS__.state.totalDay),day,'取消睡觉不推进日期');
 await p.evaluate(()=>{const M=__MOSS__;M.state.plots['7,8']={tilled:true,water:true,crop:'radish',age:0,mature:false,harvested:false,regrow:0,fertility:80};M.state.plots['8,8']={tilled:true,water:false,crop:'radish',age:0,mature:false,harvested:false,regrow:0,fertility:80};M.state.shipping={wood:1};M.state.weather={today:'sun',tomorrow:'sun'};M.state.energy=12;});
 const before=await money(),wood=await p.evaluate(()=>__MOSS__.ITEMS.wood.sell);
 await p.keyboard.press('e');await clickWin(p,'确认睡觉');await p.waitForFunction(day=>__MOSS__.state.totalDay===day+1,day);await dismissSettlement(p);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),'city_inn_upper','次日实际在客房内醒来');eq(await p.evaluate(()=>[__MOSS__.state.player.x,__MOSS__.state.player.y]),[20,12],'醒来位置在登记B床旁');
 eq(await p.evaluate(()=>__MOSS__.state.energy),100,'住宿恢复体力');eq(await money(),before+50+wood,'原补助和出货结算保留，床边不再收费');eq(await p.evaluate(()=>__MOSS__.state.plots['7,8'].age),1,'旅馆睡觉推进已浇水作物');eq(await p.evaluate(()=>__MOSS__.state.plots['8,8'].age),0,'旅馆不会代浇水');
 eq(await p.evaluate(()=>__MOSS__.state.southGate.booking),null,'次日释放当晚登记');eq(await p.evaluate(()=>__MOSS__.state.southGate.lastStay),{room:'b',day},'住宿结果留档');await reload();eq(await p.evaluate(()=>__MOSS__.state.sceneId),'city_inn_upper','醒来客房存档可继续');
 const nextDay=await p.evaluate(()=>__MOSS__.state.totalDay);await p.keyboard.press('e');eq(await p.evaluate(()=>__MOSS__.state.totalDay),nextDay,'过夜后不能用过期登记继续睡');
 fs.mkdirSync('output/playwright',{recursive:true});await p.screenshot({path:'output/playwright/south-gate-guestrooms.png'});
 eq(await walkTo(p,21,3),true,'客房走廊返回下梯');await p.keyboard.press('e');await settled('city_inn');await leave();
 await enter('post');eq(await walkTo(p,6,7),true,'邮局原入口找到分拣台');await p.keyboard.press('e');await clickWin(p,'分拣并领取邮袋');eq(await mail(),1,'分拣建立唯一在途邮袋');await closeWin(p);await reload();eq(await mail(),1,'在途邮袋读档保留');await p.evaluate(()=>__MOSS__.state.totalDay++);
 await leave('yard');const side=await p.evaluate(()=>__MOSS__.INTERACTABLES.city.find(i=>i.id==='post_yard_entrance'));
 await p.keyboard.press('e');await settled('city_post');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'city_post','邮局侧門可双向返回');await leave('yard');
 await enter('carriage');eq(await walkTo(p,6,5),true,'车马院入口找到邮件交接');await p.keyboard.press('e');await clickWin(p,'交邮件并领取回执');eq(await mail(),2,'邮袋转换为同单回执');await closeWin(p);await leave();
 await enter('post');eq(await walkTo(p,6,7),true,'回到分拣台提交回执');const pay=await money();await p.keyboard.press('e');await clickWin(p,'提交回执');eq(await mail(),3,'回执结清');eq(await money(),pay+20,'邮务报酬真实结算');await clickWin(p,'分拣并领取邮袋');eq(await money(),pay+20,'同日重复办理不多发奖');eq(await mail(),3,'同日不能再领取一袋');await closeWin(p);
 await p.evaluate(()=>__MOSS__.state.totalDay++);await p.keyboard.press('e');await clickWin(p,'分拣并领取邮袋');eq(await mail(),1,'次日可再次分拣');await closeWin(p);
 const normal=await p.evaluate(()=>{const M=__MOSS__,raw=M.serialize(),a=M.normalizeSaveForTest(raw),b=M.normalizeSaveForTest(a),old={...raw};delete old.southGate;return {a:a.southGate,b:b.southGate,old:M.normalizeSaveForTest(old).southGate};});eq(normal.a,normal.b,'南门记录归一化幂等');eq(normal.old,{booking:null,lastStay:null,mailStage:0,mailCompletedDay:-1},'旧档补空南门记录');
 await pose('city_inn',25,12);await p.keyboard.press('e');eq((await winText(p)).includes('成品进背包'),true,'一层厨房仍可实际使用');await closeWin(p);
 eq(run.errors,[],'住宿、日结算、邮局侧门与邮务流程无页面报错');
}finally{await run.browser.close();}
const mobile=await launch({viewport:{width:390,height:844},touch:true});
try{const p=mobile.page;await boot(p);await p.locator('#tutorialSkip').tap();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.devSwitchScene('city_inn',24,6);});await p.waitForTimeout(200);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_inn_upper');eq(await p.locator('#floorTag').innerText(),'旅馆 · 二层客房','手机旅馆楼梯和区域牌');await p.locator('#floorTag').tap();eq((await winText(p)).includes('住宿先在旅馆前台登记'),true,'手机导览可查看登记说明');await closeWin(p);await p.evaluate(()=>__MOSS__.devSwitchScene('city_inn_upper',21,3));await p.waitForTimeout(200);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_inn');eq(await p.locator('#floorTag').innerText(),'旅馆 · 一层前台','手机可下楼返回前台');eq(mobile.errors,[],'手机旅馆通路无报错');}finally{await mobile.browser.close();}
console.log(`南门 ${checks} 项通过${single?'（单文件）':''}`);
