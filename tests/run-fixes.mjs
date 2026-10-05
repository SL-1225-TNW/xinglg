/* 修复回归：独立浏览器、明确的边界夹具，操作经真实键盘/按钮完成。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch, boot, GAME_URL, snap, lastToast} from './harness.mjs';

const {browser, page, errors} = await launch();
let passed = 0;
function eq(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  passed++;
  console.log('PASS', name);
}
try {
  await page.goto(GAME_URL);
  await page.waitForFunction(() => !!window.__MOSS__);
  for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Space', 'e', 'b', 'c', 'j', '1', '8', 'Escape']) {
    await page.keyboard.press(k);
  }
  eq('启动页快捷键不报错', errors, []);
  eq('启动页快捷键不启动游戏', await page.evaluate(() => window.__MOSS__.state), null);
  await boot(page);
  const base = await page.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.state)));
  async function fixture(patch = {}) {
    if (await page.evaluate(() => !!window.__MOSS__.ui.window)) await page.keyboard.press('Escape');
    await page.evaluate(({base, patch}) => {
      const s = JSON.parse(JSON.stringify(base));
      Object.assign(s, patch);
      window.__MOSS__.startGame(s);
    }, {base, patch});
    await page.waitForTimeout(100);
  }
  const shopPlayer = {x:8, y:8, face:'up'};
  await fixture({sceneId:'town', player:shopPlayer, inventory:{radish:1980}});
  await page.keyboard.press('e');
  await page.locator('.shop-row', {hasText:'土豆种子'}).locator('button', {hasText:'买 1 份'}).click();
  let s = await snap(page);
  eq('20格已满，新种子不能买入', [s.slots, s.inv.seed_potato || 0, s.coins], [20,0,50]);
  eq('满背包购买显示原因', /背包满/.test(await lastToast(page)), true);

  const mature = {tilled:true,water:true,crop:'potato',age:5,mature:true,harvested:false,regrow:0};
  await fixture({player:{x:9,y:10,face:'up'}, inventory:{radish:1980}, plots:{'9,9':mature}});
  await page.keyboard.press('4'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('满背包不能收获新物品', [s.slots,s.inv.potato || 0,s.plots['9,9'].mature], [20,0,true]);

  await fixture({sceneId:'town', player:shopPlayer, inventory:{radish:1981}, overloaded:true});
  await page.keyboard.press('e');
  await page.locator('.win .item', {hasText:'萝卜'}).locator('button', {hasText:'卖全部'}).click();
  await page.locator('.shop-row', {hasText:'土豆种子'}).locator('button', {hasText:'买 1 份'}).click();
  eq('整理超额背包后恢复正常购买', (await snap(page)).inv.seed_potato, 1);

  await fixture({inventory:{wood:10,radish:1881}});
  await page.keyboard.press('c');
  await page.locator('.win .item', {hasText:'木箱'}).locator('button', {hasText:'制作'}).click();
  s = await snap(page);
  eq('扣料腾格后可制作新物品', [s.slots,s.inv.wood || 0,s.inv.dev_chest], [20,0,1]);

  await fixture({inventory:{wood:10,dev_chest:99,radish:1782}});
  await page.keyboard.press('c');
  await page.locator('.win .item', {hasText:'木箱'}).locator('button', {hasText:'制作'}).click();
  s = await snap(page);
  eq('扣料腾格后可跨99叠加边界', [s.slots,s.inv.wood || 0,s.inv.dev_chest], [20,0,100]);

  await fixture({inventory:{wood:11,radish:1881}});
  await page.keyboard.press('c');
  eq('真正放不下时提示空间不足', await page.locator('.win .item', {hasText:'木箱'}).locator('button', {hasText:'空间不足'}).isDisabled(), true);
  s = await snap(page);
  eq('失败制作不吞材料', [s.inv.wood,s.inv.dev_chest || 0], [11,0]);

  const allSoil = {};
  for (let x=6;x<=21;x++) for (let y=4;y<=9;y++) allSoil[x+','+y] = {tilled:true,water:false,crop:null,age:0,mature:false,harvested:false,regrow:0};
  await fixture({player:{x:9,y:10,face:'up'}, inventory:{dev_chest:1}, plots:allSoil});
  await page.keyboard.press('8'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('种植区全部翻土后仍可放设备', [s.structures.length,s.inv.dev_chest || 0], [1,0]);
  eq('设备下不保留土地记录', s.plots['9,9'], undefined);
  await page.keyboard.press('e');
  await page.getByRole('button', {name:'收起木箱',exact:true}).click();
  await page.keyboard.press('1'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('收起设备后土地可再次耕种', [s.structures.length,s.inv.dev_chest,!!s.plots['9,9']], [0,1,true]);

  await fixture({player:{x:9,y:10,face:'up'}, inventory:{dev_chest:1}, plots:{'9,9':mature}});
  await page.keyboard.press('8'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('放设备不能覆盖作物', [s.structures.length,s.inv.dev_chest,s.plots['9,9'].crop], [0,1,'potato']);

  await fixture({player:{x:9,y:10,face:'down'}});
  await page.waitForTimeout(350);
  const render = await page.evaluate(() => {
    const M=window.__MOSS__,g=document.querySelector('#world').getContext('2d');
    const x=Math.round(M.game.ppos.x)-Math.round(M.cam.x),y=Math.round(M.game.ppos.y)-Math.round(M.cam.y);
    const d=g.getImageData(Math.round(x-8),Math.round(y-16),16,12).data;
    let orange=0, eyes=0;
    for(let i=0;i<d.length;i+=4){if(d[i]===218&&d[i+1]===119&&d[i+2]===88)orange++;if(d[i]===23&&d[i+1]===20&&d[i+2]===16)eyes++;}
    return {orange,eyes};
  });
  eq('玩家画面绘制橙色Clawd身体', render.orange>170, true);
  eq('玩家画面有两只方眼', render.eyes===8 || render.eyes===4, true);
  for(const [key,face] of [['ArrowLeft','left'],['ArrowRight','right'],['ArrowUp','up'],['ArrowDown','down']]){
    await page.keyboard.down(key);await page.waitForTimeout(280);await page.keyboard.up(key);
    eq('Clawd方向 '+face, await page.evaluate(()=>window.__MOSS__.state.player.face), face);
  }
  await page.waitForTimeout(300);
  fs.mkdirSync('output/playwright',{recursive:true});
  await page.screenshot({path:'output/playwright/clawd-desktop.png'});
  const sprite = await page.evaluate(() => {
    const M=window.__MOSS__,src=document.querySelector('#world');
    const c=document.createElement('canvas');c.width=192;c.height=144;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.drawImage(src,Math.round(M.game.ppos.x-M.cam.x-16),Math.round(M.game.ppos.y-M.cam.y-21),32,24,0,0,192,144);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync('output/playwright/clawd-player.png',Buffer.from(sprite,'base64'));
  const before=await snap(page);
  await page.evaluate(()=>window.__MOSS__.saveNow());await page.reload();
  await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  s=await snap(page);
  eq('更换角色后存档坐标和资源恢复', [s.px,s.py,s.coins,s.inv,s.quests], [before.px,before.py,before.coins,before.inv,before.quests]);
  eq('回归全过程无控制台错误', errors, []);
  console.log(`\n修复回归 ${passed}/${passed} 通过。`);
} finally { await browser.close(); }
