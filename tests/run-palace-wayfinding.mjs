import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
let count=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);count++;console.log('PASS',msg);};
const r=await launch(),p=r.page;
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const doors=await p.evaluate(()=>__MOSS__.palaceRoomDoors.map(d=>({scene:d.sceneId,x:d.x,y:d.y,h:d.h,name:d.label})));
 eq(doors.length,18,'三层共有18个具名房门');
 for(const d of doors){
  await p.evaluate(d=>__MOSS__.devSwitchScene(d.scene,d.x+1,d.y),d);
  await p.keyboard.down('ArrowLeft');
  try{await p.waitForFunction(d=>__MOSS__.state.player.x<=d.x-1,d);}finally{await p.keyboard.up('ArrowLeft');}
  eq(await p.evaluate(()=>__MOSS__.state.sceneId),d.scene,d.scene+' '+d.name+'门可实际步行穿过，保持同层');
  await p.keyboard.down('ArrowRight');
  try{await p.waitForFunction(d=>__MOSS__.state.player.x>=d.x+1,d);}finally{await p.keyboard.up('ArrowRight');}
  eq(await p.evaluate(()=>__MOSS__.state.sceneId),d.scene,d.name+'门可返回原走廊');
 }
 const money=await p.evaluate(()=>__MOSS__.state.coins);
 await p.evaluate(()=>__MOSS__.devSwitchScene('palace_f1',28,38));await p.keyboard.press('e');await p.waitForFunction(()=>__MOSS__.state.sceneId==='city_castle');await p.waitForTimeout(300);
 eq(await p.evaluate(()=>__MOSS__.state.coins),money,'从标记的上楼平台交互换层且不收费');
 await p.evaluate(()=>__MOSS__.devSwitchScene('city_castle',33,31));await p.keyboard.press('e');await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_f1');
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),'palace_f1','从下楼平台原路返回一层');
 eq(r.errors,[],'房门与台阶渲染无报错');
}finally{await r.browser.close();}
console.log('宫殿楼梯与房门 '+count+' 项通过');
