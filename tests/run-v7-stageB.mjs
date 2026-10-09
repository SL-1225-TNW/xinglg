import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, boot, walkTo, faceTowards } from './harness.mjs';
fs.mkdirSync('output/playwright',{recursive:true});
let passed=0;
function ok(name,value){assert.ok(value,name);passed++;console.log('PASS',name);}
function eq(name,value,expected){assert.deepEqual(value,expected,name);passed++;console.log('PASS',name);}
const run=await launch();
try {
  const p=run.page;await boot(p);
  await p.evaluate(()=>{
    const s=__MOSS__.state;
    s.plots={'10,10':{tilled:true,crop:'radish',age:0,water:false,mature:false,harvested:false,regrow:0},
      '11,10':{tilled:true,crop:'potato',age:5,water:false,mature:true,harvested:false,regrow:0},
      '12,10':{tilled:true,crop:'strawberry',age:6,water:true,mature:false,harvested:true,regrow:1}};
  });
  await p.keyboard.press('n');
  const body=await p.locator('.win-body').innerText();
  ok('农务按真实状态统计，成熟地块不计缺水',body.includes('待浇水 1 块 · 可收获 1 块'));
  ok('预测注明条件，萝卜最早第4天',body.includes('若从今天起每天浇水，最早第 4 天收获'));
  ok('再生作物按再生进度预测',body.includes('最早第 3 天收获'));
  const crop=p.getByRole('button',{name:/萝卜 · \(10,10\)/});await crop.click();
  eq('选中田块有可访问状态',await p.getByRole('button',{name:/萝卜 · \(10,10\)/}).getAttribute('aria-pressed'),'true');
  await p.screenshot({path:'output/playwright/v7-farm-records.png'});
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{
    const s=__MOSS__.freshState();s.exploration.forest=s.exploration.mine=true;s.exploration.depth=2;
    s.inventory.wood=10;s.inventory.stone=10;s.inventory.copper_ore=6;
    __MOSS__.startGame(s);__MOSS__.devSwitchScene('mine2',13,21);
  });
  eq('排水前新作业面不可走',await p.evaluate(()=>__MOSS__.isSolid('mine2',21,14)),true);
  async function useFacility(x,y,tx,ty,label){
    ok('可以步行抵达 '+label,await walkTo(p,x,y));await faceTowards(p,tx,ty);await p.keyboard.press('e');
    await p.getByRole('button',{name:label,exact:true}).click();
  }
  await useFacility(18,14,19,14,'修复排水泵');
  eq('未测量不能扣材料',await p.evaluate(()=>__MOSS__.state.inventory.wood),10);
  await p.keyboard.press('Escape');
  await useFacility(8,10,9,10,'记录水位');
  eq('西水位写入真实工程记录',await p.evaluate(()=>__MOSS__.state.exploration.mineWorks.west),true);
  await useFacility(16,15,17,15,'记录水位');
  eq('东水位写入真实工程记录',await p.evaluate(()=>__MOSS__.state.exploration.mineWorks.east),true);
  const before=await p.evaluate(()=>({e:__MOSS__.state.energy,c:__MOSS__.state.coins}));
  await useFacility(18,14,19,14,'修复排水泵');
  eq('修复准确扣三种材料',await p.evaluate(()=>[__MOSS__.state.inventory.wood,__MOSS__.state.inventory.stone,__MOSS__.state.inventory.copper_ore]),[4,2,3]);
  eq('工程没有隐藏金币支出',await p.evaluate(()=>__MOSS__.state.coins),before.c);
  eq('修复准确扣8体力',await p.evaluate(()=>__MOSS__.state.energy),before.e-8);
  eq('工程永久打开作业面',await p.evaluate(()=>__MOSS__.isSolid('mine2',21,14)),false);
  ok('新铁矿真实存在',await p.evaluate(()=>__MOSS__.exploreNode('mine2',23,13)?.def.item==='iron_ore'));
  await useFacility(21,14,22,14,'验收排水工程');
  eq('验收只发一次60金',await p.evaluate(()=>__MOSS__.state.coins),before.c+60);
  await faceTowards(p,22,14);await p.keyboard.press('e');
  eq('重复验收没有领奖按钮',await p.getByRole('button',{name:'验收排水工程',exact:true}).count(),0);
  eq('重复打开工程不再发钱',await p.evaluate(()=>__MOSS__.state.coins),before.c+60);
  await p.keyboard.press('Escape');
  await p.keyboard.press('n');await p.getByRole('button',{name:'矿山记录',exact:true}).click();
  const mineText=await p.locator('.win-body').innerText();
  ok('矿山记录包含真实观察到的铁矿坐标',mineText.includes('(23,13)'));
  ok('记录显示工程已验收',mineText.includes('已验收'));
  await p.screenshot({path:'output/playwright/v7-mine-records.png'});
  await p.keyboard.press('Escape');
  ok('排水后可实际走到新铁矿旁',await walkTo(p,22,13));
  await faceTowards(p,23,13);await p.keyboard.press('6');
  const ironBefore=await p.evaluate(()=>__MOSS__.state.inventory.iron_ore||0);
  for(let hit=0;hit<3;hit++){
    await p.keyboard.press('Space');await p.waitForFunction(()=>__MOSS__.game.swingT<=0);
  }
  eq('新作业面正常键盘采集获得3铁矿',await p.evaluate(()=>__MOSS__.state.inventory.iron_ore),ironBefore+3);
  await p.evaluate(()=>__MOSS__.saveNow());
  await p.reload();await p.waitForFunction(()=>!!window.__MOSS__);
  await p.locator('.boot-actions button').first().click();
  await p.waitForFunction(()=>document.getElementById('boot').hidden);
  eq('重载保留工程与调查',await p.evaluate(()=>[__MOSS__.state.exploration.mineWorks.inspected,!!__MOSS__.state.exploration.mineSurvey['mine2:23,13'],__MOSS__.isSolid('mine2',21,14)]),[true,true,false]);
  eq('读档不会刷新新矿石',await p.evaluate(()=>__MOSS__.exploreNode('mine2',23,13).saved.hp),0);
  await p.evaluate(()=>{__MOSS__.devSwitchScene('mine1',13,21);__MOSS__.devSwitchScene('mine2',13,21);});
  eq('换场景不会刷新新矿石',await p.evaluate(()=>__MOSS__.exploreNode('mine2',23,13).saved.hp),0);
  eq('新区域采集不需要军职',await p.evaluate(()=>__MOSS__.state.exploration.mineWorks.pump),true);
  eq('桌面控制台错误',run.errors,[]);
} finally {await run.browser.close();}
const mobile=await launch({viewport:{width:844,height:390},touch:true});
try {
  const p=mobile.page;await p.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('emulated');};});await boot(p);
  await p.getByRole('button',{name:'农务与矿山记录 (N)',exact:true}).tap();
  eq('手机可直接打开记录',await p.evaluate(()=>__MOSS__.ui.window.id),'workrecords');
  await p.getByRole('button',{name:'矿山记录',exact:true}).tap();
  ok('手机记录窗口不横向溢出',await p.locator('.win-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await p.screenshot({path:'output/playwright/v7-records-mobile.png'});
  eq('手机控制台错误',mobile.errors,[]);
} finally {await mobile.browser.close();}
console.log(`V7 stage B: ${passed}/${passed}`);
