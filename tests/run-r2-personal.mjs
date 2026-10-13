import assert from 'node:assert/strict';
import {launch,boot,walkTo,closeWin} from './harness.mjs';
let checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const run=await launch();const p=run.page,v=f=>p.evaluate(f);
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 await p.keyboard.press('p');await p.getByRole('button',{name:'武器',exact:true}).click();
 ok((await p.locator('.win-body').innerText()).includes('训练牌 (17,13)'),'新档武器页指向真实免费联系人');await closeWin(p);
 ok(await walkTo(p,31,10,20000),'自然新档走到小镇');await p.waitForTimeout(400);
 ok(await walkTo(p,17,14,20000),'自然步行到训练牌');await p.keyboard.press('e');
 for(const kind of ['剑','刀']){
  await p.getByRole('button',{name:'免费试'+kind,exact:true}).click();
  eq(await v(()=>__MOSS__.state.sceneId),'r2_training','免费进入'+kind+'训练');
  await walkTo(p,7,7);await p.keyboard.press('ArrowUp');await p.keyboard.press('Space');await p.keyboard.press('Shift');
  await p.locator('#personalLeave').click();await p.keyboard.press('e');
 }
 eq(await v(()=>__MOSS__.personalState().training),{sword:{hit:true,dodge:true},blade:{hit:true,dodge:true}},'真实空格和Shift完成两形制训练');
 const before=await v(()=>[__MOSS__.state.coins,__MOSS__.state.inventory,__MOSS__.state.selectedTool]);
 await p.getByRole('button',{name:'领取旧剑',exact:true}).click();
 eq(await v(()=>[__MOSS__.state.coins,__MOSS__.state.inventory,__MOSS__.state.selectedTool]),before,'领取不扣钱、不占背包、不替换工具');
 eq(await v(()=>[__MOSS__.personalState().trained,__MOSS__.personalState().equipped]),[true,'sword'],'训练后独立装备旧剑');
 eq(await v(()=>__MOSS__.personalClaim('blade')),false,'不能再次领取训练奖励');
 await closeWin(p);await p.keyboard.press('p');await p.getByRole('button',{name:'武器',exact:true}).click();
 await p.getByRole('button',{name:'免费领取另一种旧刃',exact:true}).click();
 ok(await v(()=>!!__MOSS__.personalState().weapons.blade),'基础形制可免费补领');
 await p.getByLabel('剑的名字',{exact:true}).fill('林间晨光');await p.getByRole('button',{name:'保存名字',exact:true}).first().click();
 await closeWin(p);
 // 后续使用地点与材料夹具；动作、事务和真实输入仍走发布代码。
 await v(()=>{const m=__MOSS__;m.devSwitchScene('town',20,8);m.state.inventory.copper_ingot=2;m.state.inventory.wood=2;m.state.coins=50;});
 eq(await v(()=>__MOSS__.personalUpgrade('sword',0)),true,'铜装事务成功');
 eq(await v(()=>[__MOSS__.personalState().weapons.sword.tier,__MOSS__.state.coins,__MOSS__.state.inventory.copper_ingot||0]),[1,0,0],'材料、金币、原武器一次替换');
 await p.keyboard.press('p');await p.getByRole('button',{name:'武器',exact:true}).click();
 const snapshot=await v(()=>JSON.stringify([__MOSS__.personalState().weapons,__MOSS__.state.inventory,__MOSS__.state.coins,__MOSS__.state.timeMinutes]));
 eq(await v(()=>__MOSS__.personalUpgrade('sword',0)),false,'过期重复升级请求拒绝');
 eq(await v(()=>__MOSS__.personalUpgrade('sword',1)),false,'缺材料升级拒绝');
 eq(await v(()=>JSON.stringify([__MOSS__.personalState().weapons,__MOSS__.state.inventory,__MOSS__.state.coins,__MOSS__.state.timeMinutes])),snapshot,'失败升级不扣时间、钱或材料');await closeWin(p);
 await v(()=>{const m=__MOSS__;m.state.inventory.iron_ingot=4;m.state.inventory.coal=2;m.state.coins=120;m.state.timeMinutes=600;});
 eq(await v(()=>__MOSS__.personalUpgrade('sword',1)),true,'铁刃在小镇升级');
 await v(()=>{const m=__MOSS__;m.state.exploration.city=true;m.devSwitchScene('city_smith',13,7);m.state.inventory.steel_ingot=4;m.state.inventory.hardwood=2;m.state.coins=240;});
 eq(await v(()=>__MOSS__.personalUpgrade('sword',2)),false,'精钢需完成实际刃材故事');
 await v(()=>{__MOSS__.state.inventory.iron_ore=2;__MOSS__.state.inventory.charcoal=1;});
 eq(await v(()=>__MOSS__.personalSteelStory()),true,'霍尔故事实际消耗材料与时间');
 eq(await v(()=>__MOSS__.personalUpgrade('sword',2)),true,'城市精钢链完成');
 eq(await v(()=>[__MOSS__.personalState().weapons.sword.tier,__MOSS__.personalState().weapons.sword.name]),[3,'林间晨光'],'升级保留武器名字');
 await v(()=>{__MOSS__.saveNow();});await p.reload();await p.locator('.boot-actions button').first().click();
 eq(await v(()=>[__MOSS__.personalState().weapons.sword.tier,__MOSS__.personalState().weapons.sword.name]),[3,'林间晨光'],'装备、故事、名字真实读档保留');
 // 改用赠送旧刀验证基础武器，不用精钢伤害掩盖问题。
 await v(()=>{const m=__MOSS__;m.state.exploration.forest=true;m.state.exploration.mine=true;m.devSwitchScene('mine1',14,21);m.personalEquip('blade');m.state.timeMinutes=600;});
 await p.keyboard.press('e');await p.getByRole('button',{name:'进入缓慢矿穴生物 · 举爪预兆',exact:true}).click();
 await p.keyboard.press('Escape');
 const paused=await v(()=>JSON.stringify(__MOSS__.personalCombat));await p.waitForTimeout(400);
 eq(await v(()=>JSON.stringify(__MOSS__.personalCombat)),paused,'暂停冻结敌人、冷却、无敌与前摇');
 eq(await v(()=>!!__MOSS__.charApplyRespec()),true,'战斗暂停也不能洗点');await closeWin(p);
 let attempts=0;
 while(await v(()=>__MOSS__.personalCombat.active)&&attempts++<70){
  const d=await v(()=>{const m=__MOSS__,e=m.personalCombat.enemy;return [e.x-m.Game.ppos.x,e.y-m.Game.ppos.y];});
  const key=Math.abs(d[0])>Math.abs(d[1])?(d[0]>0?'ArrowRight':'ArrowLeft'):(d[1]>0?'ArrowDown':'ArrowUp');
  await p.keyboard.down(key);await p.waitForTimeout(35);await p.keyboard.up(key);await p.keyboard.press('Space');await p.waitForTimeout(120);
 }
 ok(await v(()=>__MOSS__.personalState().resolved.hollow?.method==='fight'),'赠送旧刀以真实键盘完成有预兆遭遇');
 eq(await v(()=>__MOSS__.state.sceneId),'mine1','胜利撤回安全入口');
 await p.keyboard.press('e');const coins=await v(()=>__MOSS__.state.coins);
 await p.getByRole('button',{name:'绕行标记河道',exact:true}).click();
 eq(await v(()=>__MOSS__.state.coins),coins+35,'非战斗路线给予同等35金');
 eq(await v(()=>__MOSS__.charState().expDaily.danger),20,'战斗与绕行共用危险经验计数');
 await closeWin(p);eq(await v(()=>__MOSS__.personalBypass('canal')),false,'同事件另一解法不重复领奖');
 // 模拟零血保护与晚间失败，敌人不以蹭血保存。
 await v(()=>{const m=__MOSS__;delete m.personalState().resolved.hollow;m.personalState().hp=1;m.state.timeMinutes=600;m.personalStart('hollow');});
 await p.waitForTimeout(3800);
 eq(await v(()=>[__MOSS__.state.sceneId,__MOSS__.personalState().hp]),['mine1',30],'受击归零退回入口恢复半血');
 ok(await v(()=>__MOSS__.state.timeMinutes>=660),'失败推进60分钟');
 await v(()=>{const m=__MOSS__;m.personalState().hp=10;m.state.energy=m.CFG.maxEnergy;m.state.inventory.bread=1;});
 eq(await v(()=>__MOSS__.eatItem('bread')),true,'满体力仍可用面包回血');
 eq(await v(()=>__MOSS__.personalState().hp),22,'只有已注明食物回血12点');
 await v(()=>{__MOSS__.saveNow();});await p.reload();await p.locator('.boot-actions button').first().click();
 eq(await v(()=>[__MOSS__.personalState().resolved.canal.method,__MOSS__.personalState().hp]),['bypass',22],'危险解法、当前血量和唯一结算持久化');
 eq(run.errors,[],'R2浏览器无报错');
}finally{await run.browser.close();}
console.log('R2刀剑与危险流程 '+checks+' 项通过');

