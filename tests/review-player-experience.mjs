/* 总规改写的界面审查：全新档、真实键盘打开菜单；不注入解锁、资源或角色位置。 */
import fs from 'node:fs';
import {launch,boot} from './harness.mjs';
const r=await launch();
try {
  const p=r.page;
  await boot(p);
  const evidence={basis:'2026-10-12 local working tree; fresh save; ordinary UI input',panels:[],errors:r.errors};
  fs.mkdirSync('output/playwright',{recursive:true});
  await p.screenshot({path:'output/playwright/player-review-start.png'});
  evidence.firstScreen=await p.locator('#app').innerText();
  await p.locator('#tutorialSkip').click();
  for(const [name,key] of [['背包','b'],['制作','c'],['任务','j'],['地图','m'],['记录','n'],['森林书','f'],['暂停菜单','Escape']]) {
    if(await p.evaluate(()=>!!__MOSS__.ui.window))await p.keyboard.press('Escape');
    await p.keyboard.press(key);
    await p.waitForTimeout(120);
    evidence.panels.push({name,key,text:await p.locator('#windowLayer').innerText()});
    if(name==='暂停菜单')await p.screenshot({path:'output/playwright/player-review-menu.png'});
  }
  evidence.runtime=await p.evaluate(()=>({
    sceneCount:Object.keys(__MOSS__.MAPS).length,
    indoorCount:Object.values(__MOSS__.MAPS).filter(m=>m.indoor).length,
    mapMarkerCount:__MOSS__.registeredRegions().length,
    publicTravelNodeCount:__MOSS__.travelNodes.length,
    stateKeys:Object.keys(__MOSS__.state),
    regions:__MOSS__.registeredRegions().map(r=>({id:r.id,name:r.name})),
  }));
  fs.writeFileSync('output/playwright/player-review-20261012.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({runtime:evidence.runtime,panels:evidence.panels.map(x=>({name:x.name,preview:x.text.slice(0,240)})),errors:r.errors},null,2));
}finally{await r.browser.close();}
