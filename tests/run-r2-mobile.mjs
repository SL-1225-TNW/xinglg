import assert from 'node:assert/strict';
import {launch,boot,walkTo} from './harness.mjs';
let n=0;function eq(a,b,msg){assert.deepEqual(a,b,msg);n++;console.log('PASS',msg);}
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 const r=await launch({viewport,touch:true}),p=r.page;
 try{
  await boot(p);await p.locator('#tutorialSkip').tap();
  await p.evaluate(()=>__MOSS__.devSwitchScene('town',17,14));await p.locator('#touchAct').tap();
  for(const kind of ['剑','刀']){
   await p.getByRole('button',{name:'免费试'+kind,exact:true}).tap();
   // 屏幕方向键：保持向上直到接近假人，在真实pointerup后停止。
   const up=p.locator('[data-dir="0,-1"]');await up.dispatchEvent('pointerdown',{pointerId:1,bubbles:true});await p.waitForTimeout(800);await up.dispatchEvent('pointerup',{pointerId:1,bubbles:true});
   await p.locator('#personalAttack').tap();await p.locator('#personalDodge').tap();
   await p.locator('#personalLeave').tap();await p.locator('#touchAct').tap();
  }
  eq(await p.evaluate(()=>__MOSS__.personalState().training),{sword:{hit:true,dodge:true},blade:{hit:true,dodge:true}},'手机攻击与闪避完成训练 '+viewport.width);
  await p.getByRole('button',{name:'领取旧刀',exact:true}).tap();await p.locator('.win-close').tap();
  await p.evaluate(()=>{const m=__MOSS__;m.state.exploration.forest=m.state.exploration.mine=true;m.devSwitchScene('mine1',14,21);});
  await p.locator('#touchAct').tap();await p.getByRole('button',{name:'进入旧河道穴居生物 · 伏身冲刺',exact:true}).tap();
  eq(await p.evaluate(()=>__MOSS__.personalCombat.enemy.kind),'rush','手机进入冲刺遭遇 '+viewport.width);
  await p.screenshot({path:'output/playwright/r2-mobile-'+viewport.width+'.png'});
  eq(await p.locator('#personalDodge').isVisible(),true,'手机有独立闪避按钮 '+viewport.width);
  eq(await p.evaluate(()=>{const el=document.querySelector('#personalControls'),r=el.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),true,'旋转后控件完整在屏内 '+viewport.width);
  if(viewport.width===844){await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='mine1');await p.waitForTimeout(350);}else{await p.locator('#personalDodge').tap();await p.locator('#personalLeave').tap();}
  eq(await p.evaluate(()=>[__MOSS__.state.sceneId,__MOSS__.personalCombat.active]),['mine1',false],'手机可撤回安全入口 '+viewport.width);
  await p.locator('#touchAct').tap();await p.getByRole('button',{name:'绕行标记河道',exact:true}).tap();
  eq(await p.evaluate(()=>__MOSS__.personalState().resolved.canal.method),'bypass','手机可走同奖非战斗解法 '+viewport.width);
  await p.locator('.win-close').tap();await p.locator('#touchChar').tap();await p.getByRole('button',{name:'武器',exact:true}).tap();
  eq(await p.evaluate(()=>{const b=document.querySelector('.win-body');return b.scrollWidth<=b.clientWidth+1;}),true,'手机装备和命名页无横向溢出 '+viewport.width);
  eq(r.errors,[],'手机无运行错误 '+viewport.width);
 }finally{await r.browser.close();}
}
console.log('R2手机训练与遭遇 '+n+' 项通过');
