import fs from 'node:fs';
import {launch,boot} from './harness.mjs';
const results=[];
for(const options of [{viewport:{width:1280,height:860}},{viewport:{width:390,height:844},touch:true}]){
 const r=await launch(options);try{const p=r.page;await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>{__MOSS__.state.exploration.city=true;__MOSS__.devSwitchScene('palace_west_wing',27,14);});await p.waitForTimeout(300);
 const result=await p.evaluate(async()=>{const gaps=[];let last=await new Promise(requestAnimationFrame);for(let i=0;i<120;i++){const t=await new Promise(requestAnimationFrame);gaps.push(t-last);last=t;}gaps.sort((a,b)=>a-b);const map=__MOSS__.MAPS.palace_west_wing,c=map._roomCanvas;return {frames:gaps.length,medianMs:+gaps[60].toFixed(2),p95Ms:+gaps[114].toFixed(2),cache:c?{width:c.width,height:c.height,rgbaBytes:c.width*c.height*4}:null};});results.push({viewport:options.viewport,touch:!!options.touch,...result,errors:r.errors});
 }finally{await r.browser.close();}
}
fs.mkdirSync('output/construction-review',{recursive:true});fs.writeFileSync('output/construction-review/render.json',JSON.stringify({note:'Headless Chromium animation-frame observations on this host, not physical-device FPS or a standalone rendering benchmark.',results},null,2));console.log(JSON.stringify(results));
