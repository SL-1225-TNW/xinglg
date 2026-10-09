import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
const r=await launch();let count=0;
try{
 const p=r.page;await boot(p);await p.locator('#tutorialSkip').click();
 // Observe actual rain painting on the canvas, rather than checking a source string.
 await p.evaluate(()=>{const stroke=CanvasRenderingContext2D.prototype.stroke;window.__rainStrokes=0;CanvasRenderingContext2D.prototype.stroke=function(...args){if(String(this.strokeStyle).replace(/\s/g,'')==='rgba(200,225,240,0.45)')window.__rainStrokes++;return stroke.apply(this,args);};__MOSS__.state.weather.today='rain';});
 const rooms=await p.evaluate(()=>Object.keys(__MOSS__.MAPS).filter(k=>__MOSS__.MAPS[k].indoor||/^mine[123]$/.test(k)));
 for(const sc of [...rooms,'farm','wetland']){
  await p.evaluate(sc=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(sc,3,3);__MOSS__.openBag();window.__rainStrokes=0;},sc);
  await p.waitForTimeout(120);
  const strokes=await p.evaluate(()=>window.__rainStrokes);
  assert.equal(strokes>0,!rooms.includes(sc),sc+' rain visibility');count++;console.log('PASS',sc,'实际画布雨线',strokes);
 }
 assert.deepEqual(r.errors,[]);count++;console.log(`室内天气 ${count}/${count} PASS`);
}finally{await r.browser.close();}
