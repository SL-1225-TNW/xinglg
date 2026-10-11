// Certificate is a boundary fixture. Career progression uses real UI buttons.
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';
const run = await launch();
let checks = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; console.log('PASS',label); };
try {
  const p=run.page; await boot(p); await p.locator('#tutorialSkip').click();
  const v=(fn,arg)=>p.evaluate(fn,arg);
  const click=name=>p.getByRole('button',{name,exact:true}).click();
  const info=()=>v(()=>__MOSS__.engInfo());
  const costs=()=>v(()=>{const s=__MOSS__.state;return [s.coins,s.energy,s.timeMinutes,__MOSS__.engInfo()];});
  for(const branch of ['field','channel']) {
    await v(()=>{const m=__MOSS__;m.closeWindow();m.resetCareerForTest();m.grantWaterworksCertificate();m.state.millLife.inspected=true;m.professionalLifeState().quarry.surveyed=true;m.professionalLifeState().port.manifestChecked=true;m.devSwitchScene('waterworks_control',8,6);m.state.energy=100;m.state.timeMinutes=450;m.openProfessionSite('water');});
    await click('签署第一份独立工程报告 · 40分钟');
    eq((await info()).stage,1,'签署按钮推进职业');
    await click(branch==='field'?'先堵缺口保麦田 · 记牺牲通航':'先泄水保船闸 · 记麦田延灌');
    eq([(await info()).stage,(await info()).post],[2,''],branch+' 事故不偷偷任职');
    await click('接受正式工程岗位 · 60分钟');
    eq((await info()).stage,4,branch+' 可正式任职');
    const hearing=branch==='field'?'把预算投向灌溉 · 牧场优先':'把预算投向通航 · 船队优先';
    let before=await costs();await click(hearing);
    eq(await costs(),before,'无预算说明会拒绝且不扣时间体力');
    await click('申请机构工程预算 · 150金');
    eq((await info()).budget,150,'只发放项目预算');
    before=await costs();await click('申请机构工程预算 · 150金');
    eq(await costs(),before,'重复申请不发钱不扣时间');
    await v(()=>__MOSS__.saveNow());await p.reload();await click('继续游戏');
    await v(()=>{__MOSS__.devSwitchScene('waterworks_control',8,6);__MOSS__.state.timeMinutes=750;__MOSS__.openProfessionSite('water');});
    before=await costs();await click('申请机构工程预算 · 150金');
    eq(await costs(),before,'重载后不能重复申请');
    await click(hearing);
    eq([(await info()).hearing,(await info()).budget],[branch==='field'?'irrigation':'navigation',0],'真实说明会按钮结算且无异常');
    eq((await info()).playerCoins,before[0],'公共工程不动个人金币');
    await v(()=>__MOSS__.saveNow());await p.reload();await click('继续游戏');
    eq([(await info()).hearing,(await info()).budget],[branch==='field'?'irrigation':'navigation',0],'说明会结果重载保留');
  }
  eq(run.errors,[],'浏览器无未捕获错误');
} finally { await run.browser.close(); }
console.log(`工程师真实界面 ${checks} 项通过`);
