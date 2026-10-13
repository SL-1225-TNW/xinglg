import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
let checks=0;
function eq(a,b,n){assert.deepEqual(a,b,n);checks++;console.log('PASS',n);}
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  const run=await launch({viewport,touch:true});try{
    const p=run.page;await boot(p);await p.locator('#tutorialSkip').tap();
    await p.locator('#touchChar').tap();
    await p.locator('.char-attr').filter({hasText:'健康'}).getByRole('button',{name:/\+1 点/}).tap();
    eq(await p.evaluate(()=>__MOSS__.charState().attr.body),6,'触屏加点 '+viewport.width);
    await p.getByRole('button',{name:'首次洗点免费 · 预览',exact:true}).tap();
    await p.getByRole('button',{name:'确认洗点（免费）',exact:true}).tap();
    eq(await p.evaluate(()=>[__MOSS__.charState().attr.body,__MOSS__.charState().attrPoints,__MOSS__.charState().washFree]),[5,10,false],'触屏真实洗点 '+viewport.width);
    await p.locator('.win-close').tap();
    // Location fixture only; input and route transaction use the shipped touch controls.
    await p.evaluate(()=>__MOSS__.devSwitchScene('town',14,10));await p.waitForTimeout(500);
    await p.locator('#touchAct').tap();await p.getByRole('button',{name:'小镇入门',exact:true}).tap();
    await p.getByRole('button',{name:'报名公共水泵维修 · 5分钟 / 0体力',exact:true}).tap();
    eq(await p.evaluate(()=>__MOSS__.rookieState().engineering),1,'触屏报名真实入门任务 '+viewport.width);
    eq(await p.evaluate(()=>{const b=document.querySelector('.win-body');return b.scrollWidth<=b.clientWidth+1;}),true,'任务页无横向溢出 '+viewport.width);
    await p.screenshot({path:'output/playwright/r1-mobile-'+viewport.width+'.png'});
    eq(run.errors,[],'触屏控制台无错误 '+viewport.width);
  }finally{await run.browser.close();}
}
console.log('R1 手机界面 '+checks+' 项通过');
