/* 公共窗口真实入口专项：仅清空存档建新档，不注入状态或调用 devOpen。
 * --baseline 只记录改造前截图；不作为通过证据。手机使用实际设备选择。
 */
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { launch, boot, Report } from './harness.mjs';
const single = process.argv.includes('--single-file');
const baseline = process.argv.includes('--baseline');
const rep = new Report();
const dir = new URL(`../output/playwright/ui-polish/${baseline ? 'before' : single ? 'single' : 'after'}/`, import.meta.url);
await mkdir(dir, { recursive: true });
for (const [width, height, touch] of [[1280,860,false],[1512,982,false],[2560,1600,false],[390,844,true],[844,390,true]]) {
  const { browser, page, errors } = await launch({viewport:{width,height},touch,
    url:new URL(single ? '../苔芽农场-单文件版.html' : '../index.html', import.meta.url).href});
  try {
    await boot(page);
    for (const [name, key, selector, title] of [['bag','b','#touchBag','背包'],['quest','j','#touchQuest','委托日志'],['menu','Escape','#btnMenu','暂停']]) {
      if (touch) await page.locator(selector).tap();
      else await page.keyboard.press(key);
      await page.locator('.win').waitFor();
      await page.screenshot({path:fileURLToPath(new URL(`${width}x${height}-${name}.png`,dir))});
      if (!baseline) {
        rep.ok(`${width} ${name} 真实入口`, (await page.locator('.win-title').innerText()).includes(title));
        const m = await page.evaluate(() => {
          const win=document.querySelector('.win'), body=win.querySelector('.win-body'), close=win.querySelector('.win-close');
          const r=win.getBoundingClientRect(), c=close.getBoundingClientRect();
          return {inside:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
            overflow:body.scrollWidth<=body.clientWidth+1,
            close:c.width>=44&&c.height>=44,
            labelled:win.getAttribute('aria-labelledby')===win.querySelector('.win-title').id&&!!win.querySelector('.win-title').id,
            font:parseFloat(getComputedStyle(body).fontSize),
            device:document.documentElement.dataset.device};
        });
        rep.ok(`${width} ${name} 窗口在屏内`,m.inside,JSON.stringify(m));
        rep.ok(`${width} ${name} 正文无横向溢出`,m.overflow,JSON.stringify(m));
        rep.ok(`${width} ${name} 关闭目标44px`,m.close,JSON.stringify(m));
        rep.ok(`${width} ${name} 可访问标题`,m.labelled);
        rep.ok(`${width} ${name} 正文至少15px`,m.font>=15);
        rep.ok(`${width} ${name} 设备模式`,touch ? m.device!=='computer' : m.device==='computer',m.device);
        await page.locator('.win-body').hover();
        await page.mouse.wheel(0,800);
        rep.ok(`${width} ${name} 滚动后关闭入口可见`,await page.locator('.win-close').isVisible());
      }
      if(touch) await page.locator('.win-close').tap();
      else await page.locator('.win-close').click();
      if(!baseline) rep.ok(`${width} ${name} 关闭生效`,await page.locator('#windowLayer').isHidden());
    }
    if(!baseline) rep.eq(`${width} 无浏览器错误`,errors,[]);
  } finally { await browser.close(); }
}
if (baseline) console.log('BASELINE 五视口三入口截图已记录，不构成验收');
else {
  const pass=rep.summary();
  if(!pass) process.exitCode=1;
  else console.log(`PASS UI Polish 公共窗口${single?'（单文件版）':''} ${rep.passed.length} 项通过`);
}

