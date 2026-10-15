import {launch,boot} from './harness.mjs';
const r=await launch(),p=r.page;
try{await boot(p);await p.locator('#tutorialSkip').click();for(const [name,sc,x,y] of [['stairs','palace_f1',31,40],['rooms','palace_f1',30,26],['second','city_castle',31,34],['third','palace_f3',31,34]]){await p.evaluate(([sc,x,y])=>__MOSS__.devSwitchScene(sc,x,y),[sc,x,y]);await p.waitForTimeout(150);await p.screenshot({path:'output/playwright/palace-wayfinding-'+name+'.png'});}console.log(r.errors);}finally{await r.browser.close();}
