/* 真实浏览器验证：尺寸、无遮挡按钮、旋转，以及打包版与源码版一致。 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { launch, boot } from './harness.mjs';

const cases = [
  [320,568,true], [390,844,true], [844,390,true],
  [768,1024,true], [1024,768,true], [1280,720,false],
  [1440,900,false], [1920,1080,false], [2560,1440,false]
];
for (const file of ['index.html', '苔芽农场-单文件版.html']) {
  for (const [width,height,touch] of cases) {
    const {browser,page,errors} = await launch({viewport:{width,height},touch,
      url:pathToFileURL(path.resolve(file)).href});
    try {
      await page.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('emulated fullscreen unavailable'); }; });
      await boot(page);
      // 新存档教程显示时与跳过后均检查，避免只对空页面算占比。
      for (const tutorial of [true,false]) {
        if (!tutorial) await page.locator('#tutorialSkip').click();
        await page.waitForTimeout(100);
        const m = await page.evaluate(() => {
          const rect = id => {
            const r=document.getElementById(id).getBoundingClientRect();
            return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};
          };
          const controls=['btnMenu',...(document.documentElement.dataset.device !== 'computer'
            ? ['touchUse','touchAct','touchBag','touchCraft','touchQuest'] : [])];
          return {world:rect('world'),stage:rect('stage'),width:innerWidth,height:innerHeight,
            scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,
            accessible:controls.every(id=>{
              const e=document.getElementById(id),r=e.getBoundingClientRect();
              const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
              return r.x>=0 && r.y>=0 && r.right<=innerWidth && r.bottom<=innerHeight
                && (hit===e || e.contains(hit));
            })};
        });
        assert(m.world.x>=0 && m.world.y>=0 && m.world.right<=m.width && m.world.bottom<=m.height, JSON.stringify(m));
        assert(m.scrollW<=m.width && m.scrollH<=m.height, '页面不应溢出');
        assert(m.world.w*m.world.h/(m.stage.w*m.stage.h)>.93, '画布应占舞台 93% 以上');
        assert(m.accessible, '操作按钮应可见且可点击');
        console.log(file,width,height,tutorial?'教程':'无教程', Math.round(m.world.w*m.world.h/(width*height)*100)+'%');
      }
      await page.setViewportSize({width:height,height:width});
      await page.waitForTimeout(100);
      assert(await page.evaluate(()=>document.getElementById('world').getBoundingClientRect().right<=innerWidth), '旋转后画布应重新适配');
      assert.equal(errors.length,0,errors.join('\n'));
    } finally { await browser.close(); }
  }
}
