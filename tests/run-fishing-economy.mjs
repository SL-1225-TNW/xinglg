import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot} from './harness.mjs';
for (const file of ['index.html','苔芽农场-单文件版.html']) {
 const {browser,page,errors}=await launch({url:pathToFileURL(path.resolve(file)).href});
 const pose=async(scene,x,y,extra={})=>{
  if(await page.evaluate(()=>!!__MOSS__.ui.window)) await page.keyboard.press('Escape');
  await page.evaluate(({scene,x,y,extra})=>{const m=window.__MOSS__,s=m.state;Object.assign(s,extra);s.sceneId=scene;s.player={x,y,face:'up'};m.game.fishing=null;m.startGame(s);},{scene,x,y,extra});
  await page.waitForTimeout(100);
 };
 const clickTile=async(x,y)=>{const p=await page.evaluate(([x,y])=>window.__MOSS__.tileToScreen(x,y),[x,y]);await page.mouse.click(...p);};
 const finish=async()=>{await page.getByRole('button',{name:'翻到最后',exact:true}).click();await page.getByRole('button',{name:'开始新的一天',exact:true}).click();};
 try {
  await boot(page);await page.locator('#tutorialSkip').click();
  await pose('farm',25,18);
  assert.equal(await page.evaluate(()=>__MOSS__.useTool('fish',26,18)),false,'未解锁鱼竿不能钓鱼');
  await page.evaluate(()=>{__MOSS__.state.inventory.tool_rod=1;});await pose('farm',25,18);
  await page.keyboard.press('7');const energy=await page.evaluate(()=>__MOSS__.state.energy);
  await clickTile(28,18);
  assert(await page.evaluate(()=>__MOSS__.game.fishing?.active),'岸边点击 3 格以内池塘水面应该抛竿');
  assert.equal(await page.evaluate(()=>__MOSS__.state.energy),energy-4);
  assert.equal(await page.evaluate(()=>__MOSS__.game.fishing.dsFirst),false,'池塘不触发河湾 DS 初遇');
  await page.waitForFunction(()=>__MOSS__.game.fishing?.phase==='bite');await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>__MOSS__.game.fishing.phase),'catch');
  // 把已经通过真实抛竿/咬钩操作的小游戏推进到成功边界，校验鱼获与初遇归属。
  await page.evaluate(()=>{const f=__MOSS__.game.fishing;f.progress=.999;f.fishY=f.barY+32;f.targetY=f.fishY;f.turnT=2;});
  await page.waitForFunction(()=>__MOSS__.game.fishing?.phase==='result');
  assert(await page.evaluate(()=>Object.keys(__MOSS__.state.inventory).some(k=>k.startsWith('fish_')&&__MOSS__.state.inventory[k]>0)),'池塘成功钓鱼应发放鱼获');
  assert.equal(await page.evaluate(()=>__MOSS__.state.dsMet),false);
  await page.keyboard.press('Escape');await pose('farm',25,18);
  const before=await page.evaluate(()=>__MOSS__.state.energy);await clickTile(29,18);
  assert.equal(await page.evaluate(()=>!!__MOSS__.game.fishing),false,'太远的水面不能抛竿');
  assert.equal(await page.evaluate(()=>__MOSS__.state.energy),before);
  await pose('riverside',10,10);await page.keyboard.press('7');await clickTile(11,10);
  assert(await page.evaluate(()=>__MOSS__.game.fishing?.dsFirst),'河湾仍保留首次 DS 相遇');
  await page.waitForFunction(()=>__MOSS__.ui.window?.id==='ds_meet');
  assert(await page.evaluate(()=>__MOSS__.state.dsMet && !__MOSS__.game.fishing),'河湾初遇后应正常结束钓鱼');
  await page.keyboard.press('Escape');
  console.log('PASS',file,'钓竿解锁/池塘鼠标抛竿/咬钩/鱼获/距离/河湾初遇');

  await pose('town',20,8,{coins:100,inventory:{tool_rod:1,wood:4,stone:2}});await page.keyboard.press('e');
  assert(await page.getByText('阿栎木工作坊',{exact:true}).isVisible(),'木匠房屋门口 E 应打开作坊');
  await page.getByRole('button',{name:'买 1 个 · 6 金',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.wood]),[94,5]);
  await page.getByRole('button',{name:'卖 1 个 · 3 金',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.wood]),[97,4]);
  await page.getByRole('button',{name:'卖全部 · 12 金',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.wood||0]),[109,0]);
  await page.getByRole('button',{name:'买 1 个 · 70 金',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.dev_chest]),[39,1]);
  await page.evaluate(()=>__MOSS__.state.coins=0);await page.getByRole('button',{name:'买 1 个 · 6 金',exact:true}).click();
  assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.wood||0),0,'钱不够不能买');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{__MOSS__.state.inventory={seed_radish:__MOSS__.CFG.stack*__MOSS__.CFG.bagSlots};__MOSS__.state.coins=1000;});
  await page.keyboard.press('e');await page.getByRole('button',{name:'买 1 个 · 6 金',exact:true}).click();
  assert.equal(await page.evaluate(()=>__MOSS__.state.coins),1000,'背包满不能扣钱');
  await page.keyboard.press('Escape');
  await pose('town',8,8,{inventory:{wood:8,stone:4,berry:1}});await page.keyboard.press('e');
  await page.getByRole('button',{name:'出售全部可售物品',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone]),[8,4],'种子铺一键出售不应清掉制作材料');
  await page.keyboard.press('Escape');
  console.log('PASS',file,'作坊入口/买卖价格/木箱/余额不足/背包满/材料保护');

  await pose('farm',9,10,{coins:100,shipping:{radish:1},settleHistory:[],totalDay:1});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'睡觉（结束今天）',exact:true}).click();
  await page.getByRole('button',{name:'确认睡觉',exact:true}).click();
  await page.waitForFunction(()=>__MOSS__.ui.window?.id==='settlement');
  assert.equal(await page.evaluate(()=>__MOSS__.state.coins),168,'手动睡觉应有出货 18 + 补助 50');
  assert((await page.locator('#windowLayer').innerText()).includes('每日补助'));
  assert.equal(await page.evaluate(()=>__MOSS__.state.settleHistory.at(-1).dailyAllowance),50);
  await finish();
  await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  assert.equal(await page.evaluate(()=>__MOSS__.state.coins),168,'刷新不能重复领每日补助');
  assert.equal(await page.evaluate(()=>__MOSS__.state.settleHistory.at(-1).dailyAllowance),50,'补助记录应能读回');
  await page.evaluate(()=>__MOSS__.state.timeMinutes=1319.99);
  await page.waitForFunction(()=>__MOSS__.ui.window?.id==='settlement');
  assert.equal(await page.evaluate(()=>__MOSS__.state.coins),218,'自动过夜也应获得 50');
  assert.equal(await page.evaluate(()=>__MOSS__.state.totalDay),3);
  console.log('PASS',file,'手动/自动每日补助/出货叠加/记录/刷新不重复领取');
  assert.equal(errors.length,0,errors.join('\n'));
 } finally {await browser.close();}
}

