import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch} from './harness.mjs';
for (const file of ['index.html','苔芽农场-单文件版.html']) {
 for (const mode of ['phone','tablet','computer']) {
  const {browser,page,errors}=await launch({viewport:{width:390,height:844},touch:false});
  try {
   await page.addInitScript(() => {
    window.orientationCalls=[];
    Element.prototype.requestFullscreen=async()=>{window.orientationCalls.push('fullscreen');};
    Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async mode=>{window.orientationCalls.push(mode);throw new Error('simulated unsupported browser');}});
   });
   await page.goto(pathToFileURL(path.resolve(file)).href);
   await page.locator('#deviceSelect').click();
   assert(await page.locator('#devicePicker').isVisible());
   assert.equal(await page.locator('#devicePicker [data-device]').count(),3);
   await page.locator(`#devicePicker [data-device="${mode}"]`).click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('moss-device-mode')),mode);
   await page.reload();
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.device),mode);
   await page.getByRole('button',{name:'开始新的游戏',exact:true}).click();
   await page.waitForTimeout(150);
   assert.equal(await page.locator('#rotatePrompt').isVisible(),mode!=='computer');
   if(mode!=='computer') {
    assert(await page.evaluate(()=>orientationCalls.includes('fullscreen')&&orientationCalls.includes('landscape')));
    assert((await page.locator('#rotateText').innerText()).includes('未能自动'));
    const before=await page.evaluate(()=>window.__MOSS__.state.timeMinutes);
    await page.keyboard.press(' ');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.__MOSS__.state.timeMinutes),before);
   } else assert.equal(await page.evaluate(()=>orientationCalls.length),0);
   await page.setViewportSize({width:844,height:390});
   await page.waitForTimeout(100);
   assert(!(await page.locator('#rotatePrompt').isVisible()));
   assert.equal(await page.locator('#touch').isVisible(),mode!=='computer');
   const bounds=await page.evaluate(()=>{
    const c=document.getElementById('world').getBoundingClientRect();
    return c.x>=0 && c.y>=0 && c.right<=innerWidth && c.bottom<=innerHeight;
   });
   assert(bounds);
   if(mode!=='computer') await page.getByRole('button',{name:'背包 (B)',exact:true}).click();
   else await page.keyboard.press('b');
   assert(await page.locator('#windowLayer').isVisible());
   assert.equal(errors.length,0,errors.join('\n'));
   console.log('PASS',file,mode,'选择/持久化/横屏回退/旋转/输入');
  } finally {await browser.close();}
 }
}
