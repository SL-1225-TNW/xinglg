/* 固定站位与状态的版面截图；不作为真实流程完成证据。 */
import {launch,boot} from './harness.mjs';
const r=await launch({viewport:{width:1280,height:860}});
try{
 const p=r.page;await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=600;__MOSS__.state.construction.civicStage=4;__MOSS__.state.construction.civicChoice='access';});
 for(const [id,x,y,name]of [
  ['city_hall_upper',11,8,'hall-upper'],['city_market_upper',21,14,'market-upper'],['farm_attic',10,7,'attic'],
  ['city_tailor_upper',15,13,'shop-house'],['city_home1_garden',10,14,'garden-home'],
  ['palace_west_wing',27,14,'west-wing'],['palace_west_upper',14,12,'west-upper'],
  ['palace_chapel_upper',25,19,'chapel-upper'],['palace_keep_upper',21,18,'keep']
 ]){await p.evaluate(([id,x,y])=>__MOSS__.devSwitchScene(id,x,y),[id,x,y]);await p.waitForTimeout(180);await p.screenshot({path:'output/playwright/construction-'+name+'.png'});}
 if(r.errors.length)throw Error(r.errors.join('\n'));console.log('9处建设版面截图完成（固定站位）');
}finally{await r.browser.close();}
