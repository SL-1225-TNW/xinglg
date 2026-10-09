import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch,boot,walkTo,faceTowards} from './harness.mjs';
fs.mkdirSync('output/playwright',{recursive:true});
let passed=0;
function eq(name,a,b){assert.deepEqual(a,b,name);passed++;console.log('PASS',name);}
function ok(name,a){assert.ok(a,name);passed++;console.log('PASS',name);}
const run=await launch();
try{
 const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
 const v=fn=>p.evaluate(fn),close=()=>v(()=>__MOSS__.closeWindow());
 const pose=async(sc,x,y)=>{await close();await p.evaluate(({sc,x,y})=>__MOSS__.devSwitchScene(sc,x,y),{sc,x,y});await p.waitForTimeout(120);};
 const click=n=>p.getByRole('button',{name:n,exact:true}).click();
 const contact=async(site,x,y)=>{await close();const s=await p.evaluate(site=>__MOSS__.meadowSites[site],site);ok('实际步行到 '+site,await walkTo(p,x,y));await faceTowards(p,s.x,s.y);await p.keyboard.press('e');await p.waitForFunction(()=>__MOSS__.ui.window?.id==='meadowlife');};
 const enter=async(x,y,scene)=>{await close();ok('步行至 '+scene+' 门',await walkTo(p,x,y+1));await faceTowards(p,x,y);await p.keyboard.press('e');await p.waitForFunction(sc=>__MOSS__.state.sceneId===sc,scene);await p.waitForTimeout(450);};
 const exit=async()=>{await close();const dest=await v(()=>[Math.floor(__MOSS__.MAPS[__MOSS__.state.sceneId].w/2),__MOSS__.MAPS[__MOSS__.state.sceneId].h-1]);ok('步行离开室内',await walkTo(p,...dest));await p.waitForFunction(()=>__MOSS__.state.sceneId==='meadow');await p.waitForTimeout(450);};
 const night=async()=>{await close();await v(()=>{__MOSS__.performSettlement(false);__MOSS__.closeWindow();});};
 eq('旧档缺草甸字段默认为空',await v(()=>__MOSS__.normalizeSaveForTest({...__MOSS__.serialize(),meadowLife:undefined}).meadowLife.feedDays),[]);
 eq('未到访不能地图传送',await v(()=>__MOSS__.travelPreview('meadow.pasture').ok),false);
 await pose('town',4,18);ok('实际走到小镇步道',await walkTo(p,3,18));await faceTowards(p,2,18);await p.keyboard.press('e');await click('前往石楠草甸');await p.waitForFunction(()=>__MOSS__.state.sceneId==='meadow');await p.waitForTimeout(450);
 ok('首次步行入草甸登记到访',await v(()=>__MOSS__.travelStateInfo().discovered.includes('meadow.pasture')));
 await v(()=>{const s=__MOSS__.state;s.inventory.wood=20;s.inventory.stone=20;s.coins=300;});
 await contact('trough',19,16);await click('检查饮水槽 · 10分钟');
 const before=await v(()=>[__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone,__MOSS__.state.timeMinutes]);
 await v(()=>__MOSS__.state.energy=1);await click('修补饮水槽 · 木材6／石头8');eq('体力不足修槽不扣材料与时间',await v(()=>[__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone,__MOSS__.state.timeMinutes]),before);
 await v(()=>{__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=1310;});await click('修补饮水槽 · 木材6／石头8');eq('晚间不足完整耗时不扣材料',await v(()=>[__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone]),before.slice(0,2));
 await v(()=>__MOSS__.state.timeMinutes=450);await p.getByRole('button',{name:'修补饮水槽 · 木材6／石头8',exact:true}).evaluate(b=>{b.click();b.click();});
 eq('饮水槽双击只修一次',await v(()=>[__MOSS__.meadowLifeState().trough,__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone]),[true,before[0]-6,before[1]-8]);
 await contact('sheep',23,15);await click('观察新羊 · 10分钟');await click('喂小麦 ×1');eq('未咨询兽医不能喂养',await v(()=>__MOSS__.meadowLifeState().feedDays.length),0);
 await enter(29,12,'meadow_vet');ok('诊疗床碰撞真实',await v(()=>__MOSS__.isSolid('meadow_vet',11,4)));await contact('vet',9,8);await click('学习新羊照料 · 15分钟');eq('兽医意见写入状态',await v(()=>__MOSS__.meadowLifeState().advice),true);
 await exit();await enter(15,10,'meadow_barn');await contact('ranch',8,8);await click('购买小麦 ×2 · 14金');await click('购买小麦 ×2 · 14金');await click('购买牧草种籽 ×3 · 12金');
 const bought=await v(()=>__MOSS__.state.coins);await click('交付羊毛 ×2 · 60金');eq('没有剪毛记录不能提前领奖',await v(()=>__MOSS__.state.coins),bought);
 await exit();await contact('plot0',14,25);await click('播牧草 · 种籽 ×1');eq('播种扣真实种籽',await v(()=>__MOSS__.state.inventory.pasture_seed),2);await click('浇试种田 · 5分钟');const waterEnergy=await v(()=>__MOSS__.state.energy);await click('浇试种田 · 5分钟');eq('重复浇水不扣体力',await v(()=>__MOSS__.state.energy),waterEnergy);
 await contact('sheep',23,15);await click('喂小麦 ×1');const grain=await v(()=>__MOSS__.state.inventory.grain);await click('喂小麦 ×1');eq('同日重复喂养不扣料',await v(()=>[__MOSS__.meadowLifeState().feedDays.length,__MOSS__.state.inventory.grain]),[1,grain]);await click('剪毛 · 羊毛 ×2');eq('第一天不能刷羊毛',await v(()=>__MOSS__.state.inventory.wool||0),0);
 await contact('coop',7,13);await click('给鸡喂小麦 ×1');const chickGrain=await v(()=>__MOSS__.state.inventory.grain);await click('给鸡喂小麦 ×1');eq('鸡舍同日不重复扣粮',await v(()=>__MOSS__.state.inventory.grain),chickGrain);await click('收鸡蛋 ×2');eq('鸡蛋必须隔夜',await v(()=>__MOSS__.state.inventory.egg||0),0);
 await night();await pose('meadow',7,13);await p.keyboard.press('e');await click('收鸡蛋 ×2');eq('鸡舍正常隔夜产蛋',await v(()=>__MOSS__.state.inventory.egg),2);await click('收鸡蛋 ×2');eq('收蛋不能重复刷',await v(()=>__MOSS__.state.inventory.egg),2);await pose('meadow',23,15);await p.keyboard.press('e');await click('喂小麦 ×1');eq('正常跨日记录第二次喂养',await v(()=>__MOSS__.meadowLifeState().feedDays.length),2);
 const preShear=await v(()=>__MOSS__.serialize());await v(()=>{const bag={};Object.keys(__MOSS__.ITEMS).filter(k=>__MOSS__.ITEMS[k].kind!=='tool'&&k!=='wool').slice(0,20).forEach(k=>bag[k]=99);__MOSS__.state.inventory=bag;});eq('满包夹具20格',await v(()=>__MOSS__.countSlots()),20);await click('剪毛 · 羊毛 ×2');eq('满包剪毛不消耗周期',await v(()=>[__MOSS__.meadowLifeState().lastShear,__MOSS__.meadowLifeState().produced]),[0,0]);
 await p.evaluate(s=>__MOSS__.replaceSave(s),preShear);await v(()=>__MOSS__.openMeadowLife('sheep'));await click('剪毛 · 羊毛 ×2');eq('剪毛产物与来源记录同步',await v(()=>[__MOSS__.state.inventory.wool,__MOSS__.meadowLifeState().produced]),[2,2]);const shearEnergy=await v(()=>__MOSS__.state.energy);await click('剪毛 · 羊毛 ×2');eq('同日不能重复剪毛',await v(()=>[__MOSS__.state.inventory.wool,__MOSS__.state.energy]),[2,shearEnergy]);
 await contact('plot0',14,25);eq('只过一个浇水夜晚不能收草',await p.getByRole('button',{name:'割牧草 · 干草 ×3',exact:true}).count(),0);await click('浇试种田 · 5分钟');
 await enter(15,10,'meadow_barn');await contact('ranch',8,8);const coins=await v(()=>__MOSS__.state.coins);await click('交付羊毛 ×2 · 60金');eq('首份合同真实扣羊毛领奖',await v(()=>[__MOSS__.state.inventory.wool||0,__MOSS__.state.coins,__MOSS__.meadowLifeState().redeemed]),[0,coins+60,2]);await click('交付羊毛 ×2 · 60金');eq('重复合同不刷金币',await v(()=>__MOSS__.state.coins),coins+60);
 await close();await p.keyboard.press('m');ok('牧场室内地图标记草甸',(await p.locator('.atlas-place.here').textContent()).includes('石楠草甸'));await close();
 await v(()=>__MOSS__.saveNow());await p.reload();await click('继续游戏');eq('重载保留室内与照料合同',await v(()=>[__MOSS__.state.sceneId,__MOSS__.meadowLifeState().feedDays.length,__MOSS__.meadowLifeState().redeemed]),['meadow_barn',2,2]);
 await night();await pose('meadow',14,25);await p.keyboard.press('e');await click('割牧草 · 干草 ×3');eq('两次真实夜结算后收干草',await v(()=>[__MOSS__.state.inventory.pasture_hay,__MOSS__.meadowLifeState().plots[0]]),[3,null]);await click('播牧草 · 种籽 ×1');eq('收割后允许重新播种',await v(()=>!!__MOSS__.meadowLifeState().plots[0]),true);
 await contact('sheep',23,15);await click('喂牧草干草 ×1');eq('干草替代粮食并扣料',await v(()=>__MOSS__.state.inventory.pasture_hay),2);await click('剪毛 · 羊毛 ×2');eq('第三天尚未到三天剪毛间隔',await v(()=>__MOSS__.state.inventory.wool||0),0);
 await night();await night();await pose('meadow',23,15);await p.keyboard.press('e');await click('喂牧草干草 ×1');await click('剪毛 · 羊毛 ×2');eq('间隔三天后可再次剪毛',await v(()=>[__MOSS__.state.inventory.wool,__MOSS__.meadowLifeState().produced]),[2,4]);
 await enter(15,10,'meadow_barn');await contact('ranch',8,8);const weekCoins=await v(()=>__MOSS__.state.coins);await click('交付羊毛 ×2 · 60金');eq('合同七天冷却不能绕过',await v(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.wool]),[weekCoins,2]);
 for(let i=0;i<4;i++)await night();await pose('meadow_barn',8,8);await p.keyboard.press('e');const weekNow=await v(()=>__MOSS__.state.coins);await click('交付羊毛 ×2 · 60金');eq('七天后新合同可重复完成',await v(()=>[__MOSS__.state.coins,__MOSS__.meadowLifeState().redeemed]),[weekNow+60,4]);
 await close();await p.keyboard.press('n');await click('石楠草甸照料与合同');ok('N记录任务状态准确',(await p.locator('.win-body').textContent()).includes('首份羊毛合同完成'));await close();
 await pose('meadow',18,18);await p.screenshot({path:'output/playwright/phase-c-meadow.png'});await pose('meadow_vet',9,8);await p.screenshot({path:'output/playwright/phase-c-meadow-vet.png'});await pose('meadow_barn',8,8);await p.keyboard.press('e');await p.screenshot({path:'output/playwright/phase-c-meadow-contract.png'});
 const finalSave=await v(()=>__MOSS__.serialize());await v(()=>{__MOSS__.state.meadowLife.plots[1]={seedDay:__MOSS__.state.totalDay,waterDays:[]};__MOSS__.state.weather.today='rain';});await night();eq('雨天自动灌溉记录进入正常夜结算',await v(()=>__MOSS__.meadowLifeState().plots[1].waterDays.length),1);await v(()=>__MOSS__.state.weather.today='rain');await night();await pose('meadow',18,25);await p.keyboard.press('e');ok('两次雨夜可收牧草',await p.getByRole('button',{name:'割牧草 · 干草 ×3',exact:true}).count()===1);await p.evaluate(s=>__MOSS__.replaceSave(s),finalSave);
 eq('草甸返家正确耗时30分钟',await v(()=>__MOSS__.travelPreview('farm.home').minutes),30);eq('浏览器控制台零错误',run.errors,[]);
 for(const viewport of [{width:844,height:390},{width:390,height:844}]){const mobile=await launch({viewport,touch:true});try{const q=mobile.page;await boot(q);await q.locator('#tutorialSkip').click();await q.evaluate(()=>__MOSS__.devSwitchScene('meadow_vet',9,8));await q.locator('#touchAct').tap();await q.waitForFunction(()=>__MOSS__.ui.window?.id==='meadowlife');eq('手机 '+viewport.width+' 触屏打开兽医',await q.evaluate(()=>__MOSS__.ui.window.id),'meadowlife');ok('手机窗口无横向溢出',await q.evaluate(()=>{const b=document.querySelector('.win-body');return b.scrollWidth<=b.clientWidth+1;}));await q.getByRole('button',{name:'返回游戏',exact:true}).tap();await q.locator('#touchMap').tap();ok('手机室内地图标记草甸',(await q.locator('.atlas-place.here').textContent()).includes('石楠草甸'));await q.getByRole('button',{name:/^苔芽农场/}).tap();await q.getByRole('button',{name:'传送过去',exact:true}).tap();await q.waitForFunction(()=>__MOSS__.state.sceneId==='farm');eq('手机实际传送返家',await q.evaluate(()=>__MOSS__.state.sceneId),'farm');eq('手机控制台零错误',mobile.errors,[]);}finally{await mobile.browser.close();}}
 console.log(`阶段 C 草甸 ${passed}/${passed} PASS`);
}finally{await run.browser.close();}
