/* 已验收边界夹具，真实触屏检视、延期与交接；不代替自然新档证据。 */
import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const r=await launch({viewport,touch:true});try{
  const p=r.page;await boot(p);await p.locator('#tutorialSkip').tap();
  await p.evaluate(()=>{const M=__MOSS__;M.state.totalDay=3;M.engFixtureAccepted('balanced');const q=M.state.professionalLife.projects.riverbay_gate;M.state.totalDay=q.duty.nextDay;M.state.energy=100;M.state.timeMinutes=480;M.devSwitchScene('waterworks',20,19);});await p.waitForTimeout(200);await p.locator('#touchAct').tap();
  const button=t=>p.locator('.win button',{hasText:t}).first();
  await button('闸门养护检视').tap();eq(await p.evaluate(()=>__MOSS__.state.professionalLife.projects.riverbay_gate.duty.done),1,viewport.width+'手机真实完成周期检视');
  await button('申请延期一个周期').tap();eq(await p.evaluate(()=>__MOSS__.state.professionalLife.projects.riverbay_gate.duty.deferCount),1,viewport.width+'手机延期记录保存');
  eq(await p.evaluate(()=>{const b=document.querySelector('.win-body');return b.scrollWidth<=b.clientWidth+1;}),true,viewport.width+'养护与延期长文无横向溢出');
  const safety=await p.evaluate(()=>JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate.safety));
  await button('交接给继任工程员').tap();eq(await p.evaluate(()=>__MOSS__.state.professionalLife.projects.riverbay_gate.duty.status),'handed',viewport.width+'手机可交接责任');
  eq(await p.evaluate(()=>JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate.safety)),safety,viewport.width+'交接保留安全记录');
  eq(await p.locator('.win button',{hasText:'闸门养护检视'}).count(),0,viewport.width+'交接后不能重复检视');
  await p.screenshot({path:'output/playwright/r3-duty-mobile-'+viewport.width+'.png'});eq(r.errors,[],viewport.width+'养护触屏无异常');
 }finally{await r.browser.close();}
}
console.log(`R3养护手机 ${checks} 项通过`);
