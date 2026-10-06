/* 修复回归：独立浏览器、明确的边界夹具，操作经真实键盘/按钮完成。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch, boot, GAME_URL, snap, lastToast, hud, winOpen, winTitle, winText, clickWin, closeWin} from './harness.mjs';

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

  await fixture({player:{x:9,y:10,face:'up'}, inventory:{dev_chest:1}, plots:{'9,9':{tilled:true,water:true,crop:'potato',age:5,mature:true,harvested:false,regrow:0}}});
  await page.keyboard.press('8'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('放设备不能覆盖作物', [s.structures.length,s.inv.dev_chest,s.plots['9,9'].crop], [0,1,'potato']);

  await fixture({player:{x:9,y:10,face:'down'}});
  await page.waitForTimeout(350);
  const render = await page.evaluate(() => {
    const M=window.__MOSS__,g=document.querySelector('#world').getContext('2d');
    const x=Math.round(M.game.ppos.x)-Math.round(M.cam.x),y=Math.round(M.game.ppos.y)-Math.round(M.cam.y);
    const scale=g.getTransform().a;
    const sample=document.createElement('canvas');sample.width=16;sample.height=12;
    const sg=sample.getContext('2d');sg.imageSmoothingEnabled=false;
    sg.drawImage(g.canvas,Math.round(x-8)*scale,Math.round(y-16)*scale,16*scale,12*scale,0,0,16,12);
    const d=sg.getImageData(0,0,16,12).data;
    let orange=0, eyes=0;
    for(let i=0;i<d.length;i+=4){if(d[i]===218&&d[i+1]===119&&d[i+2]===88)orange++;if(d[i]===23&&d[i+1]===20&&d[i+2]===16)eyes++;}
    return {orange,eyes,scale};
  });
  eq('玩家画面绘制橙色Clawd身体', render.orange>170, true);
  eq('玩家画面有两只方眼', render.eyes>=4 && render.eyes<=8, true);
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
    const scale=src.getContext('2d').getTransform().a;
    g.drawImage(src,(Math.round(M.game.ppos.x)-Math.round(M.cam.x)-16)*scale,(Math.round(M.game.ppos.y)-Math.round(M.cam.y)-21)*scale,32*scale,24*scale,0,0,192,144);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync('output/playwright/clawd-player.png',Buffer.from(sprite,'base64'));
  const before=await snap(page);
  await page.evaluate(()=>window.__MOSS__.saveNow());await page.reload();
  await page.getByRole('button',{name:'继续游戏',exact:true}).click();
  s=await snap(page);
  eq('更换角色后存档坐标和资源恢复', [s.px,s.py,s.coins,s.inv,s.quests], [before.px,before.py,before.coins,before.inv,before.quests]);

  /* ---------- 新增能力回归：小铲子 / 委托方向 / 分页结算 ---------- */
  /* 新手引导已经走完的状态直接用 game.js 里的 TUTORIAL_DONE：它带 origin，
     手写 {status:'done',flags:{}} 会因为缺 origin 让 tickTutorial 报错。 */
  const noGuide = await page.evaluate(() => window.__MOSS__.TUTORIAL_DONE);
  const sown = {tilled:true,water:true,crop:'radish',age:0,mature:false,harvested:false,regrow:0};
  await fixture({player:{x:9,y:10,face:'up'}, inventory:{}, plots:{'9,9':sown}, tutorial:noGuide});
  await page.keyboard.press('9'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('铲掉刚播下的作物退回种子', [s.plots['9,9'].crop, s.inv.seed_radish || 0, 100 - s.energy],
    [null, 1, 2]);
  eq('铲除刚播下的作物有明确说明', /种子已收回/.test(await lastToast(page)), true);

  const grown = {tilled:true,water:true,crop:'radish',age:1,mature:false,harvested:false,regrow:0};
  await fixture({player:{x:9,y:10,face:'up'}, inventory:{}, plots:{'9,9':grown}, tutorial:noGuide});
  await page.keyboard.press('9'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('铲掉长过一天的作物不退种子', [s.plots['9,9'].crop, s.inv.seed_radish || 0], [null, 0]);
  eq('不退种子时提示原因', /不退还/.test(await lastToast(page)), true);

  await fixture({player:{x:9,y:10,face:'up'}, inventory:{}, plots:{}, tutorial:noGuide});
  await page.keyboard.press('9'); await page.keyboard.press('Space');
  eq('空地上铲不出作物', /没有作物可以铲除/.test(await lastToast(page)), true);

  await fixture({player:{x:9,y:10,face:'up'}, inventory:{}, plots:{'9,9':sown},
    tutorial:{status:'active', flags:{tilled:false,planted:false,watered:false,harvested:false,talked:false,gift:false,shipped:false,fished:false}}});
  await page.keyboard.press('9'); await page.keyboard.press('Space');
  s = await snap(page);
  eq('新手引导期间不能铲除作物', [s.plots['9,9'].crop, s.inv.seed_radish || 0], ['radish', 0]);
  eq('引导期间铲除给出理由', /先跟着新手引导/.test(await lastToast(page)), true);

  /* 地点标记移除，但 HUD 的委托指引保留。直接记录绘制文字，避免把场景金色像素误认成标记。 */
  await page.evaluate(() => {
    window.reviewQuestTags = [];
    const old = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (/（去.*）|(?:种子铺|小桥施工点|出货箱|任务板) .*方.*格/.test(text)) reviewQuestTags.push(text);
      return old.call(this, text, ...args);
    };
  });
  await fixture({player:{x:9,y:10,face:'down'}, questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'}, tutorial:noGuide});
  await page.waitForTimeout(260);
  eq('农场里不再显示地点方向标记', await page.evaluate(() => reviewQuestTags), []);
  eq('农场里委托条指向出口并说明去向', /→ 先去小镇$/.test((await hud(page)).quest), true);

  /* 走进镇上：目标同场景应在目标格画标，条上写成具体的方位与距离 */
  await fixture({sceneId:'town', player:{x:8,y:10,face:'right'},
    questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'}, tutorial:noGuide});
  await page.waitForTimeout(260);
  eq('镇上委托条给出交付点与方位', /→ 任务板 右上方 \d+ 格$/.test((await hud(page)).quest), true);
  eq('投影函数算出待交付委托', (await page.evaluate(() =>
    window.__MOSS__.questTargets().map(t => t.label + '@' + t.scene))).join(','),
    '任务板@town,小桥施工点@town,出货箱@farm');
  eq('地标只留不在本场景的那个', (await page.evaluate(() =>
    window.__MOSS__.questTargets().filter(t => t.landmark).map(t => t.label))).join(','), '出货箱');
  eq('距离文案口径正确', await page.evaluate(() => window.__MOSS__.questDistText(0, 0)), '就在脚下');

  /* 分页结算：三株刚长到头的萝卜 + 出货箱 + 果酱罐，逐页看过去 */
  const jam = {id:'j1',device:'jam_jar',x:9,y:9,input:1,startDay:1,ready:false};
  await fixture({player:{x:9,y:10,face:'down'}, inventory:{radish:20,strawberry:5},
    plots:{'9,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0},
           '10,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0},
           '11,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0}},
    shipping:{radish:2}, structures:[jam], tutorial:noGuide});
  const pages = await page.evaluate(() => {
    const M = window.__MOSS__;
    return M.settlementPages({sold:[{id:'radish',name:'萝卜',qty:2,value:24}], income:24, matured:3,
      matureDetail:['萝卜','萝卜','萝卜'], jam:1, grew:[{name:'萝卜',stage:'嫩芽'}],
      day:1, auto:false, newDay:2, weatherFrom:'sun', weatherTo:'sun', quests:[], jamWaiting:0, fallback:false});
  });
  eq('结算页覆盖收入/庄稼/果酱/天气', pages.map(p => p.kind), ['sold','crop','jam','weather']);
  const titles = await page.evaluate(() => window.__MOSS__.settlementPages({
    sold:[{id:'radish',name:'萝卜',qty:2,value:24}], income:24, matured:3, matureDetail:['萝卜','萝卜','萝卜'],
    jam:1, grew:[{name:'萝卜',stage:'嫩芽'}], day:1, auto:false, newDay:2,
    weatherFrom:'sun', weatherTo:'sun', quests:['完成委托 1「第一份收成」，交付 萝卜 ×3。'], jamWaiting:0, fallback:false
  }).map(p => p.title));
  eq('委托消息也进入结算页', titles.includes('委托进展'), true);

  const preSettle = await snap(page);
  const today = preSettle.day;
  const income = await page.evaluate(() => window.__MOSS__.ITEMS.radish.sell * 2);
  await page.evaluate(() => window.__MOSS__.performSettlement(false));
  await page.waitForTimeout(300);
  eq('结算窗标题写着第几天结束', /天结束/.test(await winTitle(page)), true);
  eq('第一页标出出货收入', new RegExp(income + ' 金').test(await winText(page)), true);
  await clickWin(page, '开始新的一天');
  eq('点继续进入第二页', /田里的变化/.test(await winText(page)), true);
  eq('第二页记下成熟了几株', /萝卜 今天长熟了/.test(await winText(page)), true);
  eq('第二页不残留对象字面量', /\[object Object\]/.test(await winText(page)), false);
  await clickWin(page, '开始新的一天');
  eq('第三页报告果酱加工', /果酱罐/.test(await winText(page)), true);
  await clickWin(page, '开始新的一天');
  eq('最后一页讲天气与明天', /天气与明天/.test(await winText(page)), true);
  await clickWin(page, '开始新的一天');
  eq('看完最后一页窗口关闭', await winOpen(page), false);
  s = await snap(page);
  eq('结算包含出货收入和每日五十金补助', [s.shipping, s.coins, s.day], [{}, preSettle.coins + income + 50, today + 1]);
  const hist = await page.evaluate(() => window.__MOSS__.state.settleHistory);
  eq('收成记录留下当天收入与補助', [hist.length, hist[0].day, hist[0].income], [1, today, income + 50]);
  await page.evaluate(() => window.__MOSS__.openSettleLog());
  await page.waitForTimeout(150);
  eq('收成记录页能回看当天', new RegExp('第 ' + today + ' 天').test(await winText(page)), true);
  await closeWin(page);

  eq('回归全过程无控制台错误', errors, []);
  console.log(`\n修复回归 ${passed}/${passed} 通过。`);
} finally { await browser.close(); }
