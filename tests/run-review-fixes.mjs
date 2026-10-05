/* 针对审查缺陷的回归；时间与室内位置使用隔离夹具，其余经键鼠操作。 */
import assert from 'node:assert/strict';
import { launch, boot, walkTo, clickTile } from './harness.mjs';

const { browser, page, errors } = await launch();
let passed = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  console.log('PASS', name); passed++;
}
async function finishSettlement() {
  while (await page.evaluate(() => __MOSS__.ui.window?.id === 'settlement')) {
    await page.getByRole('button', {name:'开始新的一天',exact:true}).click();
  }
}
try {
  await boot(page);
  await walkTo(page,10,10);
  await page.keyboard.press('1'); await clickTile(page,10,9);
  await page.keyboard.press('2'); await clickTile(page,10,9);
  check('真实播种进入浇水步骤', (await page.locator('#tutorialTitle').innerText()).includes('4/9'), true);
  const before = await page.evaluate(() => ({energy:__MOSS__.state.energy,seeds:__MOSS__.state.inventory.seed_radish}));
  await page.keyboard.press('9'); await clickTile(page,10,9);
  check('浇水步骤不能铲掉幼苗',await page.evaluate(() => __MOSS__.state.plots['10,9'].crop),'radish');
  check('拒绝铲除不改变体力和种子',await page.evaluate(() => ({energy:__MOSS__.state.energy,seeds:__MOSS__.state.inventory.seed_radish})),before);
  await page.keyboard.press('3'); await clickTile(page,10,9);
  check('幼苗仍可浇水并推进教程',(await page.locator('#tutorialTitle').innerText()).includes('5/9'),true);
  check('教程没有地点距离文案',/目标在|金色角标|约 \d+ 格/.test(await page.locator('#tutorialText').innerText()),false);
  await page.getByRole('button',{name:'稍后再学',exact:true}).click();
  await page.keyboard.press('9'); await clickTile(page,10,9);
  check('暂停引导后仍可自由铲除',await page.evaluate(()=>__MOSS__.state.plots['10,9'].crop),null);

  const icons = await page.evaluate(() => {
    function image(selector) { return document.querySelector(selector).toDataURL(); }
    return {pick:image('#hotbar .slot:nth-child(6) canvas'),water:image('#hotbar .slot:nth-child(3) canvas')};
  });
  check('6 号槽镐子和水壶图标不同',icons.pick===icons.water,false);
  await page.keyboard.press('b');
  const bagPick=await page.locator('.item',{hasText:'镐子'}).locator('canvas').evaluate(c=>c.toDataURL());
  check('6 号槽与背包镐子像素完全一致',icons.pick,bagPick);
  await page.keyboard.press('Escape');

  await page.evaluate(()=>__MOSS__.state.timeMinutes=600);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'睡觉（结束今天）',exact:true}).click();
  await page.getByRole('button',{name:'确认睡觉',exact:true}).click();
  await page.waitForFunction(()=>__MOSS__.ui.window?.id==='settlement');
  check('手动睡觉重置到 06:00',await page.evaluate(()=>__MOSS__.state.timeMinutes),360);
  await finishSettlement();
  await page.evaluate(()=>__MOSS__.state.timeMinutes=1319.99);
  await page.waitForFunction(()=>__MOSS__.ui.window?.id==='settlement');
  check('22:00 自动睡觉重置到 06:00',await page.evaluate(()=>__MOSS__.state.timeMinutes),360);
  await finishSettlement(); await page.waitForTimeout(400);
  check('自动睡觉之后时钟继续推进',await page.evaluate(()=>__MOSS__.state.timeMinutes>360),true);
  await page.evaluate(()=>__MOSS__.saveNow());
  await page.reload(); await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  check('刷新后保存的是早上时间',await page.evaluate(()=>__MOSS__.state.timeMinutes<400),true);

  await page.evaluate(()=>{
    const s=__MOSS__.state;s.sceneId='house';s.player={x:13,y:3,face:'up'};__MOSS__.startGame(s);
    window.reviewHints=[];window.reviewPlaceTags=[];
    const old=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(t,x,y,...a){
      if(t==='E 打开储物箱')reviewHints.push({x,y});
      if(/（去.*）|(?:种子铺|小桥施工点|出货箱|任务板) .*方.*格/.test(t))reviewPlaceTags.push(t);
      return old.call(this,t,x,y,...a);
    };
  });
  await page.waitForTimeout(800);
  const hint=await page.evaluate(()=>({actual:reviewHints.at(-1),expected:{x:13*16+8-Math.round(__MOSS__.cam.x),y:2*16-8-Math.round(__MOSS__.cam.y)+10},tags:reviewPlaceTags}));
  check('储物箱 E 提示跟随镜头坐标',Math.abs(hint.actual.x-hint.expected.x)<=1&&hint.actual.y===hint.expected.y,true);
  check('室内没有地点导航文字',hint.tags,[]);
  check('无浏览器控制台错误',errors,[]);
  console.log(`\n审查修复 ${passed}/${passed} 通过。`);
} finally { await browser.close(); }
