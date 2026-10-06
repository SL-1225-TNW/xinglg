import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch} from './harness.mjs';
for (const file of ['index.html','苔芽农场-单文件版.html']) {
 for (const mode of ['phone','tablet','computer']) {
  const {browser,page,errors}=await launch({viewport:{width:390,height:844},touch:true});
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
   assert.equal(await page.locator('#rotatePrompt').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('rotated-play')),mode!=='computer');
   if (mode!=='computer') {
    assert(await page.evaluate(()=>orientationCalls.includes('fullscreen')&&orientationCalls.includes('landscape')));
    const app = await page.evaluate(()=>{const a=document.getElementById('app');return [a.clientWidth,a.clientHeight];});
    assert(app[0]>app[1], '系统锁竖屏时游戏仍应采用横向布局');
    await page.locator('#tutorialSkip').click();
    // 在旋转后的画面上真实点击相邻地块，校验触点逆变换，而不只检查 CSS。
    const target=await page.evaluate(()=>{const m=window.__MOSS__,p=m.state.player;return {tile:[p.x,p.y-1],point:m.tileToScreen(p.x,p.y-1)};});
    await page.touchscreen.tap(...target.point);
    assert.deepEqual(await page.evaluate(()=>window.__MOSS__.game.selectTile),target.tile, '旋转后的触摸选格坐标应正确');
    await page.mouse.click(...target.point);
    assert(await page.evaluate(k=>!!window.__MOSS__.state.plots[k],target.tile.join(',')), '旋转画面上的点击必须翻到正确的地块');
    const before=await page.evaluate(()=>window.__MOSS__.state.player.x);
    const dir=await page.locator('[data-dir="1,0"]').boundingBox();
    await page.mouse.move(dir.x+dir.width/2,dir.y+dir.height/2);
    await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
    assert(await page.evaluate(x=>window.__MOSS__.state.player.x>x,before), '竖屏锁定时游戏不应暂停');
    await page.getByRole('button',{name:'背包 (B)',exact:true}).click();
    assert(await page.locator('#windowLayer').isVisible());
    await page.keyboard.press('Escape');
   } else assert.equal(await page.evaluate(()=>orientationCalls.length),0);
   await page.setViewportSize({width:844,height:390});
   await page.waitForTimeout(100);
   assert(!(await page.evaluate(()=>document.documentElement.classList.contains('rotated-play'))));
   assert.equal(await page.locator('#touch').isVisible(),mode!=='computer');
   const bounds=await page.evaluate(()=>{
    const c=document.getElementById('world').getBoundingClientRect();
    return c.x>=0 && c.y>=0 && c.right<=innerWidth && c.bottom<=innerHeight;
   });
   assert(bounds);
   if(mode!=='computer') await page.getByRole('button',{name:'背包 (B)',exact:true}).click();
   else await page.keyboard.press('b');
   assert(await page.locator('#windowLayer').isVisible());
   if (mode !== 'computer') {
    await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(100);
    assert(await page.evaluate(()=>document.documentElement.classList.contains('rotated-play')));
    assert.equal(await page.locator('#rotatePrompt').count(),0, '从横屏回到系统锁定竖屏也不能弹提示');
    await page.getByRole('button',{name:'背包 (B)',exact:true}).click();
    assert(await page.locator('#windowLayer').isVisible());
   }
   assert.equal(errors.length,0,errors.join('\n'));
   console.log('PASS',file,mode,'选择/持久化/系统锁竖屏时横向布局/触点坐标/移动/切换方向');
  } finally {await browser.close();}
 }
}
