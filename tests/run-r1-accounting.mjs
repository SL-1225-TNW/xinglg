// Deliberate edge-case fixtures: these checks do not substitute for the natural new-save routes.
import assert from 'node:assert/strict';
import {launch,boot,closeWin} from './harness.mjs';
let checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const run=await launch();
try{
  const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
  const v=(fn,arg)=>p.evaluate(fn,arg);
  const normal=await v(()=>{
    const m=__MOSS__,a={level:6,attr:{int:8,sense:5,nerve:5,body:8,luck:5},attrPoints:9,talents:{save_strength:true},spentTalents:1,talentPoints:1};
    const b=m.normalizeChar(a,m.state.totalDay);
    const bad=m.normalizeChar({level:1,attr:{int:20,sense:20,nerve:20,body:20,luck:20},attrPoints:999,talents:{balanced_meal:true},talentPoints:8},1);
    return {good:b,bad,twice:JSON.stringify(b)===JSON.stringify(m.normalizeChar(b,m.state.totalDay))};
  });
  eq([normal.good.attrPoints,normal.good.spentTalents,normal.good.talentPoints],[9,1,1],'属性 15 点预算与天赋 2 点预算分开归一化');
  eq(Object.values(normal.bad.attr).reduce((a,b)=>a+b,0)+normal.bad.attrPoints,35,'坏档五属性总和不能突破 1 级 35 点');
  eq([normal.bad.talentPoints,normal.bad.spentTalents],[0,0],'1 级不能靠导入获得天赋点');
  eq(normal.twice,true,'角色账本归一化幂等');
  await v(c=>{__MOSS__.state.char=c;__MOSS__.state.coins=100;},normal.good);
  await p.keyboard.press('p');await p.getByRole('button',{name:'首次洗点免费 · 预览',exact:true}).click();
  eq(await p.locator('.win-title').innerText(),'洗点预览','真实洗点按钮不调用不存在函数');
  eq((await p.locator('.win-body').innerText()).includes('返还天赋点'),true,'预览分别展示两种返还');
  await p.getByRole('button',{name:'确认洗点（免费）',exact:true}).click();
  eq(await v(()=>{const m=__MOSS__,c=m.charState();return[c.attrPoints,c.talentPoints,c.spentTalents,c.washFree,m.state.coins];}),[15,2,0,false,100],'首次洗点正确返还且只免费一次');
  await p.getByRole('button',{name:'洗点（50 金）· 预览',exact:true}).click();
  await p.getByRole('button',{name:'确认洗点（50 金）',exact:true}).click();
  eq(await v(()=>[__MOSS__.state.coins,__MOSS__.charState().washFree]),[50,false],'第二次收费 50 金且不恢复免费');
  await v(()=>__MOSS__.saveNow());await p.reload();await p.locator('.boot-actions button').first().click();
  eq(await v(()=>[__MOSS__.charState().attrPoints,__MOSS__.charState().talentPoints,__MOSS__.charState().washFree]),[15,2,false],'洗点点数和收费标记实际重载保留');
  await v(()=>__MOSS__.devSwitchScene('house',9,3));await p.waitForTimeout(500);
  await p.keyboard.press('e');await p.getByRole('button',{name:'洗点预览',exact:true}).click();
  eq(await p.locator('.win-title').innerText(),'洗点预览','农舍手册进入同一个洗点预览');
  eq(await p.getByRole('button',{name:'确认洗点（50 金）',exact:true}).count(),1,'农舍手册不重新获得首次免费资格');
  await closeWin(p);
  const insufficient=await v(()=>{const m=__MOSS__;m.state.coins=0;const before=JSON.stringify(m.charState());const err=m.charApplyRespec();return[!!err,before===JSON.stringify(m.charState())];});
  eq(insufficient,[true,true],'付不起洗点费不修改账本');
  const daily=await v(()=>{const m=__MOSS__;m.state.char=m.normalizeChar(undefined,m.state.totalDay);const a=[m.grantDailyJobExp('a'),m.grantDailyJobExp('a'),m.grantDailyJobExp('b')];m.state.char=m.normalizeChar(m.charState(),m.state.totalDay);a.push(m.grantDailyJobExp('c'),m.grantDailyJobExp('d'));return a;});
  eq(daily,[20,0,20,20,0],'日常前三件封顶，重复/重载不能绕过');
  const samples=await v(()=>{
    const m=__MOSS__,c=m.normalizeChar({level:3,attr:{body:8},talents:{save_strength:true}},m.state.totalDay);m.state.char=c;
    m.state.energy=1;const result=m.charSpendEnergy(2);
    for(let i=0;i<9;i++){m.state.energy=100;m.charSpendEnergy(2);}
    m.state.char=m.normalizeChar(c,m.state.totalDay);m.state.energy=100;m.charSpendEnergy(2);
    return {result,after:m.state.energy,saved:m.charState().expDaily.__saveStrength};
  });
  eq(samples,{result:true,after:98,saved:10},'按减免后体力校验，重载保留每天 10 点减免上限');
  // Farming node fixture: only one hit remains; full inventory must reject before touching stamina/hp/counters.
  const node=await v(()=>{
    const m=__MOSS__;m.state.sceneId='farm';m.state.char=m.normalizeChar({level:3,attr:{body:8},talents:{save_strength:true}},m.state.totalDay);
    const key=Object.keys(m.state.resourceNodes).find(k=>m.state.resourceNodes[k].type==='tree');const xy=key.split(',').map(Number);
    m.state.resourceNodes[key].active=true;m.state.resourceNodes[key].hp=1;m.state.player.x=xy[0]-1;m.state.player.y=xy[1];
    m.state.inventory={stone:1980};m.state.energy=50;
    const before=JSON.stringify(m.state.char);const rejected=m.useTool('axe',...xy);
    const failed=[rejected,m.state.energy,m.state.resourceNodes[key].hp,before===JSON.stringify(m.state.char)];
    m.state.inventory={};const c=m.charState(),exp=c.exp;const done=m.useTool('axe',...xy);
    return{failed,done,energy:m.state.energy,wood:m.state.inventory.wood,exp:c.exp-exp};
  });
  eq(node.failed,[false,50,1,true],'农场满包不扣体力、不回血、不消耗减免或改变资源');
  eq([node.done,node.energy,node.wood,node.exp],[true,47,5,2],'农场成功采集只扣减免后体力并发 2 经验');
  const forest=await v(()=>{
    const m=__MOSS__;m.state.sceneId='forest';m.state.inventory={};m.state.char=m.normalizeChar(undefined,m.state.totalDay);
    const key=Object.keys(m.EXPLORE_NODES.forest).find(k=>m.EXPLORE_NODES.forest[k].type==='tree');const xy=key.split(',').map(Number);
    m.state.exploration.nodes['forest:'+key]={hp:1,day:m.state.totalDay};m.state.energy=50;
    const done=m.gatherExplore('axe',...xy);return[done,m.state.energy,m.charState().exp];
  });
  eq(forest,[true,46,2],'森林成功采集不重复扣体力并发经验');
  const forestFull=await v(()=>{
    const m=__MOSS__;m.state.inventory={stone:1980};m.state.char=m.normalizeChar({level:3,attr:{body:8},talents:{save_strength:true}},m.state.totalDay);
    const key=Object.keys(m.EXPLORE_NODES.forest).find(k=>m.EXPLORE_NODES.forest[k].type==='tree');
    m.state.exploration.nodes['forest:'+key]={hp:1,day:m.state.totalDay};m.state.energy=50;
    const before=JSON.stringify(m.charState()),result=m.gatherExplore('axe',...key.split(',').map(Number));
    return[result,m.state.energy,m.state.exploration.nodes['forest:'+key].hp,before===JSON.stringify(m.charState())];
  });
  eq(forestFull,[false,50,1,true],'森林满包拒绝也不扣减免或体力');
  eq(run.errors,[],'浏览器无错误');
}finally{await run.browser.close();}
console.log('R1 结算与防回归 '+checks+' 项通过');
