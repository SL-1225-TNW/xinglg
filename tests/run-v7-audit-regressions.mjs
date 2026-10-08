import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const run = await launch();
let passed = 0;
const failures = [];
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); passed++; console.log('PASS', name); }
  catch { failures.push(name); console.log('FAIL', name, JSON.stringify({ actual, expected })); }
}
try {
  const p = run.page;
  await boot(p);
  await p.keyboard.press('m'); // Pause the world while arranging boundary cases.
  for (const [a, b, minutes] of [
    ['farm.home', 'town.square', 10], ['town.square', 'riverside.bank', 10],
    ['town.square', 'forest.gate', 30], ['forest.gate', 'mine.entrance', 30],
    ['farm.home', 'city.gate', 60], ['city.gate', 'mine.entrance', 90]
  ]) {
    check(`路线 ${a} ↔ ${b}`, await p.evaluate(([a,b]) => [__MOSS__.travelMinutesDebug(a,b), __MOSS__.travelMinutesDebug(b,a)], [a,b]), [minutes,minutes]);
  }
  const modern = await p.evaluate(() => {
    const s = __MOSS__.freshState();
    s.exploration.forest = s.exploration.mine = true;
    s.exploration.depth = 3;
    s.travel.discovered['mine.level2'] = true;
    const loaded = __MOSS__.normalizeSaveForTest(s);
    return !!loaded.travel.discovered['mine.level3'];
  });
  check('现代存档重载不把未到访第三层登记', modern, false);
  await p.evaluate(() => { __MOSS__.game.fishing = { active:true, phase:'wait' }; });
  check('钓鱼中不能直接传送', await p.evaluate(() => __MOSS__.travelPreview('town.square').ok), false);
  await p.evaluate(() => { __MOSS__.game.fishing = null; });
  await p.evaluate(() => {
    __MOSS__.closeWindow();
    const s = __MOSS__.freshState(); s.exploration.city = true;
    __MOSS__.startGame(s); __MOSS__.devSwitchScene('city',330,470);
  });
  await p.keyboard.press('m');
  check('未探索城堡街区不直接开放传送', await p.getByRole('button',{name:/城堡与仪式核心/}).isDisabled(), true);
  await p.keyboard.press('Escape');
  await p.evaluate(() => {
    __MOSS__.closeWindow();
    const s = __MOSS__.freshState();
    s.exploration.forest = s.exploration.mine = true; s.exploration.depth=3;
    __MOSS__.startGame(s); __MOSS__.devSwitchScene('mine2',13,21);
  });
  await p.keyboard.press('m');
  check('矿层捷径有真实界面入口', await p.getByRole('button',{name:/旧矿山 · 第二层/}).count()>0, true);
  await p.keyboard.press('Escape');
  const districts=await p.evaluate(()=>{
    const s=__MOSS__.freshState();s.exploration.city=true;__MOSS__.startGame(s);__MOSS__.devSwitchScene('city',330,470);
    const ds=__MOSS__.livingInfo().city.districts;
    ds.forEach(d=>s.travel.discovered['city.district.'+d.id]=true);
    return ds.map(d=>({id:d.id,name:d.name}));
  });
  for(const d of districts){
    await p.keyboard.press('m');
    const button=p.getByRole('button',{name:d.name,exact:true});
    check('已探索街区可传送 '+d.name,await button.isEnabled(),true);
    await button.click();
    check('街区安全落点 '+d.name,await p.evaluate(()=>!__MOSS__.isSolid('city',__MOSS__.state.player.x,__MOSS__.state.player.y)),true);
  }
  await p.evaluate(()=>{
    __MOSS__.state.energy=40;__MOSS__.state.timeMinutes=__MOSS__.CFG.dayEnd-5;
    __MOSS__.devOpenService('uni_main');
  });
  const beforeClass=await p.evaluate(()=>JSON.stringify([__MOSS__.state.inventory,__MOSS__.state.energy,__MOSS__.state.coins,__MOSS__.state.timeMinutes]));
  await p.getByRole('button',{name:/听讲并抄录/}).click();
  check('长加工时间不足，不扣料钱体力',await p.evaluate(()=>JSON.stringify([__MOSS__.state.inventory,__MOSS__.state.energy,__MOSS__.state.coins,__MOSS__.state.timeMinutes])),beforeClass);
  await p.evaluate(()=>__MOSS__.devOpenService('uni_dorm'));
  const beforeRest=await p.evaluate(()=>[__MOSS__.state.energy,__MOSS__.state.timeMinutes]);
  await p.getByRole('button',{name:/休息 1 小时/}).click();
  check('日终前不能零耗时刷休息',await p.evaluate(()=>[__MOSS__.state.energy,__MOSS__.state.timeMinutes]),beforeRest);
  await p.evaluate(()=>{
    const m=__MOSS__,s=m.state,ids=Object.keys(m.ITEMS).filter(id=>m.ITEMS[id].kind!=='tool'&&id!=='wood'&&id!=='plank');
    s.inventory={wood:2};ids.slice(0,m.CFG.bagSlots-1).forEach(id=>s.inventory[id]=1);
    s.energy=100;s.timeMinutes=360;m.devOpenService('sawmill');
  });
  check('满包加工的前提',await p.evaluate(()=>__MOSS__.countSlots()),await p.evaluate(()=>__MOSS__.CFG.bagSlots));
  await p.getByRole('button',{name:/细剖 ×6 板材/}).click();
  check('扣完材料腾出的格子可放产物',await p.evaluate(()=>[__MOSS__.state.inventory.wood||0,__MOSS__.state.inventory.plank]),[0,6]);
  await p.evaluate(()=>{
    __MOSS__.closeWindow();__MOSS__.startGame(__MOSS__.freshState());const s=__MOSS__.state;
    __MOSS__.devSwitchScene('town',14,10);
    s.timeMinutes=__MOSS__.CFG.dayEnd-5;s.shipping={radish:2};
    s.plots={'10,10':{tilled:true,crop:'radish',age:2,water:true,mature:false,harvested:false,regrow:0}};
  });
  await p.keyboard.press('m');await p.getByRole('button',{name:/^苔芽农场，已开放/}).click();
  check('夜归预览与实际次日6点起床一致',await p.locator('.travel-line').innerText().then(t=>t.includes('次日 06:00')),true);
  await p.getByRole('button',{name:'夜归并休息',exact:true}).click();
  await p.getByRole('button',{name:'确认夜归并休息',exact:true}).evaluate(el=>{el.click();el.click();});
  check('晚间返家双击只过一天',await p.evaluate(()=>__MOSS__.state.totalDay),2);
  check('夜归复用出货及作物日结算',await p.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.plots['10,10'].mature,Object.keys(__MOSS__.state.shipping).length]),[136,true,0]);
  check('夜归回到农舍',await p.evaluate(()=>__MOSS__.state.sceneId),'house');
  check('夜归日结算历史只有一条',await p.evaluate(()=>__MOSS__.state.settleHistory.length),1);
  await p.evaluate(()=>{__MOSS__.state.timeMinutes=__MOSS__.CFG.dayEnd;__MOSS__.closeWindow();});
  await p.waitForFunction(()=>__MOSS__.state.totalDay===3);
  check('恰好日终恢复游戏后正常结算',await p.evaluate(()=>__MOSS__.state.totalDay),3);
  check('控制台没有错误', run.errors, []);
} finally { await run.browser.close(); }
console.log(`V7 regression ${passed}/${passed+failures.length}`);
if (failures.length) process.exitCode=1;
