import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,walkTo,closeWin,clickWin,winText} from './harness.mjs';
let checks=0;const eq=(a,b,name)=>{assert.deepEqual(a,b,name);checks++;console.log('PASS',name);};
const single=process.argv.includes('--single-file');const r=await launch(single?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=r.page;
const stage=()=>p.evaluate(()=>__MOSS__.state.industry.stage),coins=()=>p.evaluate(()=>__MOSS__.state.coins);
async function pose(id,x,y){await p.evaluate(([id,x,y])=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(id,x,y);},[id,x,y]);await p.waitForTimeout(200);}
async function settled(id){await p.waitForFunction(id=>__MOSS__.state.sceneId===id,id);await p.waitForTimeout(250);}
async function reload(){await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_quay_store'||__MOSS__.state.sceneId==='port_office');}
async function enter(id){const d=await p.evaluate(id=>__MOSS__.INTERACTABLES.city.find(i=>i.id===id),id);eq(await walkTo(p,...d.stand[0],90000),true,'实际步行到'+id);await p.keyboard.press('e');await settled(d.to);}
async function leave(door){const d=await p.evaluate(id=>__MOSS__.MAPS[__MOSS__.state.sceneId].doors.find(d=>d.id===id),door);eq(await walkTo(p,...d.stand[0]),true,'走到'+door+'门');await p.keyboard.press('e');await settled('city');}
async function workAt(id,x,y,label){await pose(id,x,y);await p.keyboard.press('e');await clickWin(p,label);}
async function nextBatch(){await p.evaluate(()=>{__MOSS__.state.totalDay++;__MOSS__.state.timeMinutes=420;__MOSS__.state.energy=100;__MOSS__.state.inventory={wood:2};});await workAt('city_quay_store',31,10,'登记木材2');await closeWin(p);await workAt('city_sawmill',18,9,'批次细剖');await closeWin(p);await workAt('city_quay_store',33,15,'核验板材6并入库');}
try{
 await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.state.inventory={};});
 const audit=await p.evaluate(()=>{const M=__MOSS__,bad=[];
  for(const id of ['city_quay_store','city_sawmill','city_shipyard','port_office']){const m=M.MAPS[id],seen=new Set(),q=[[m.enter.x,m.enter.y]];
   while(q.length){const [x,y]=q.pop(),k=x+','+y;if(x<0||y<0||x>=m.w||y>=m.h||m.solid[x][y]||seen.has(k))continue;seen.add(k);q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
   for(let x=0;x<m.w;x++)for(let y=0;y<m.h;y++)if(!m.solid[x][y]&&!seen.has(x+','+y))bad.push(id+':isolated '+x+','+y);
   for(const it of M.INTERACTABLES[id])if(it.kind==='industryWork'||it.kind==='indoorExit')for(const s of it.stand)if(!seen.has(s.join(',')))bad.push(id+':blocked '+it.id);
  }
  const sign=M.INTERACTABLES.city.find(i=>i.id==='industry_yard_guide');for(const s of sign.stand)if(M.isSolid('city',...s))bad.push('guide stand');
  for(const id of ['warehouse_loading','sawmill_loading','shipyard','foundry','boiler','watermill']){const it=M.INTERACTABLES.city.find(i=>i.id===id);if(!M.findPath('city',...sign.stand[0],...it.stand[0]))bad.push('city path '+id);}
  return bad;
 });eq(audit,[],'货仓、车间、船棚、港口工位和厂区通路均可达');
 await pose('city',485,343);await p.keyboard.press('e');eq((await winText(p)).includes('城市工业码头与下游河港是两处地点'),true,'导览明确两个河港地点');await closeWin(p);
 await enter('warehouse_loading');eq(await walkTo(p,31,10),true,'装卸门可走到批次登记');await p.keyboard.press('e');await clickWin(p,'登记木材2');eq(await stage(),0,'缺木材不建立批次');
 await p.evaluate(()=>__MOSS__.invAdd('wood',2));await clickWin(p,'登记木材2');eq(await stage(),1,'仓库接收原料');eq(await p.evaluate(()=>__MOSS__.invCount('wood')),0,'木材只扣一次');await closeWin(p);await reload();eq(await stage(),1,'保管原料读档保留');
 await p.evaluate(()=>__MOSS__.state.totalDay++);await leave('loading');await enter('sawmill_loading');eq(await walkTo(p,18,9),true,'进料门可找到带锯');await p.keyboard.press('e');await p.evaluate(()=>__MOSS__.state.energy=0);await clickWin(p,'批次细剖');eq(await stage(),1,'体力不足不丢原料');
 await p.evaluate(()=>{__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=__MOSS__.CFG.dayEnd-1;});await clickWin(p,'批次细剖');eq(await stage(),1,'时间不足不丢原料');
 await p.evaluate(()=>__MOSS__.state.timeMinutes=420);await clickWin(p,'批次细剖');eq(await stage(),2,'一次锯切得到保管板材6');eq(await p.evaluate(()=>__MOSS__.invCount('plank')),0,'保管板材不同时复制到背包');await closeWin(p);
 fs.mkdirSync('output/playwright',{recursive:true});await p.screenshot({path:'output/playwright/industry-sawmill.png'});
 await leave('loading');await enter('warehouse_loading');eq(await walkTo(p,33,15),true,'装卸门到成品核验台');await p.keyboard.press('e');await clickWin(p,'核验板材6并入库');eq(await stage(),3,'成品核验入库');
 await p.evaluate(()=>{__MOSS__.state.inventory={stone:__MOSS__.CFG.stack*__MOSS__.CFG.bagSlots};});await clickWin(p,'取回成品');eq(await stage(),3,'满包不能吞掉仓库成品');eq(await p.evaluate(()=>__MOSS__.invCount('plank')),0,'满包不提前出库');
 await clickWin(p,'送至下游河港待发');eq(await stage(),3,'未满足河港条件不发送不可达货物');
 await p.evaluate(()=>{__MOSS__.state.inventory={};});await clickWin(p,'本地装运至船棚');eq(await stage(),5,'本地装运使用同一批板材');await closeWin(p);await reload();eq(await stage(),5,'待签收货物读档保留');
 await leave('loading');await enter('shipyard');eq(await walkTo(p,7,14),true,'船棚原门找到收货位');await p.keyboard.press('e');const before=await coins();await clickWin(p,'签收板材6');eq(await stage(),6,'收货位签收消耗保管货物');eq(await coins(),before+234,'按既有代销价结算234金');await clickWin(p,'签收板材6');eq(await coins(),before+234,'重复签收不多发货款');eq(await p.evaluate(()=>__MOSS__.professionalLifeState().routes.trade),1,'真实运输增加一次商旅经历');await closeWin(p);
 await workAt('city_quay_store',31,10,'登记木材2');eq(await stage(),6,'当天不能开始第二个结清批次');await closeWin(p);
 await nextBatch();const noSale=await coins();await clickWin(p,'取回成品');eq(await stage(),6,'次日可选择取回板材');eq(await p.evaluate(()=>__MOSS__.invCount('plank')),6,'取回六块真实板材');eq(await coins(),noSale,'自用取回不另外发货款');await closeWin(p);
 await nextBatch();await p.evaluate(()=>{const q=__MOSS__.professionalLifeState();q.routes.trade=2;q.port.manifestChecked=true;q.port.shipment='clinic';q.port.settled=false;});await clickWin(p,'送至下游河港待发');eq(await stage(),3,'地区旧运单未签收时不占用水运');
 await p.evaluate(()=>{__MOSS__.professionalLifeState().port.settled=true;__MOSS__.invAdd('cargo_manifest',1);});
 const legacy=await p.evaluate(()=>({port:JSON.stringify(__MOSS__.professionalLifeState().port),manifest:__MOSS__.invCount('cargo_manifest')}));
 await clickWin(p,'送至下游河港待发');eq(await stage(),4,'水运预装仍用原工业批次');await closeWin(p);
 await pose('port_office',8,7);eq(await stage(),4,'玩家换场景不替货物办理装船');await reload();eq(await stage(),4,'港口与城市共享持久批次');
 await p.evaluate(()=>{const q=__MOSS__.professionalLifeState();q.waterworks.certified=true;q.waterworks.allocation='navigation';__MOSS__.state.timeMinutes=450;});await p.keyboard.press('e');eq((await winText(p)).includes('30分钟'),true,'水运沿用通航优先耗时');await clickWin(p,'工业板材装船');eq(await stage(),5,'河港正式装船后才可签收');eq(await p.evaluate(()=>__MOSS__.state.timeMinutes),480,'水运实际消耗30分钟');await closeWin(p);
 await workAt('city_shipyard',7,14,'签收板材6');eq(await stage(),6,'船棚可签收水运批次');eq(await p.evaluate(()=>__MOSS__.state.industry.lastReceipt.route),'river','保存水运签收来源');eq(await p.evaluate(()=>({port:JSON.stringify(__MOSS__.professionalLifeState().port),manifest:__MOSS__.invCount('cargo_manifest')})),legacy,'工业运输不改地区旧运单及物品');await closeWin(p);
 await nextBatch();await clickWin(p,'送至下游河港待发');eq(await stage(),4,'下一批可再次选择水运');await clickWin(p,'调回港口待发货物');eq(await stage(),3,'未装船可调回待发货物');await clickWin(p,'取回成品');eq(await p.evaluate(()=>__MOSS__.invCount('plank')),6,'调回货物仅有一份可领取');await closeWin(p);
 const n=await p.evaluate(()=>{const M=__MOSS__,raw=M.serialize(),a=M.normalizeSaveForTest(raw),b=M.normalizeSaveForTest(a),old={...raw};delete old.industry;return{a:a.industry,b:b.industry,old:M.normalizeSaveForTest(old).industry};});eq(n.a,n.b,'工业批次归一化幂等');eq(n.old,{stage:0,serial:0,route:null,completedDay:-1,lastReceipt:null},'旧档补空工业批次');eq(r.errors,[],'工业生产与两地运输无页面报错');
}finally{await r.browser.close();}
const mobile=await launch({viewport:{width:390,height:844},touch:true});
try{const p=mobile.page;await boot(p);await p.locator('#tutorialSkip').tap();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.devSwitchScene('city',476,338);});await p.waitForTimeout(200);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_quay_store');eq(await p.locator('#floorTag').innerText(),'厂区 · 货仓','手机可从货仓装卸门进入');await p.locator('#floorTag').tap();eq((await winText(p)).includes('下一步')||(await winText(p)).includes('货仓右侧登记桌'),true,'手机导览可查看工业下一步');await closeWin(p);eq(mobile.errors,[],'手机工业门与导览无报错');}finally{await mobile.browser.close();}
console.log(`工业区 ${checks} 项通过${single?'（单文件）':''}`);
