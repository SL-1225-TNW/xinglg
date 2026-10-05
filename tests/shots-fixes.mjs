/* 三项新功能的画面证据：铲除提示、委托方向指示、分页结算与收成记录。
   只截图，不做断言（断言在 run-fixes.mjs 里）。 */
import {launch, boot, snap, winText, clickWin, closeWin} from './harness.mjs';
import path from 'node:path';

const OUT = 'output/playwright';
const {browser, page, errors} = await launch();

async function fixture(patch = {}) {
  if (await page.evaluate(() => !!window.__MOSS__.ui.window)) await page.keyboard.press('Escape');
  const base = await page.evaluate(() => JSON.parse(JSON.stringify(window.__MOSS__.state)));
  await page.evaluate(({base, patch}) => {
    const s = JSON.parse(JSON.stringify(base));
    Object.assign(s, patch);
    window.__MOSS__.startGame(s);
  }, {base, patch});
  await page.waitForTimeout(260);
}

try {
  await boot(page);
  const noGuide = await page.evaluate(() => window.__MOSS__.TUTORIAL_DONE);

  /* 1. 农场里看着镇上的任务板：屏幕边缘的金色箭头 + 委托条说明去向 */
  await fixture({player:{x:9,y:10,face:'down'},
    questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'}, tutorial:noGuide});
  await page.screenshot({path:path.join(OUT, 'quest-arrow-farm.png')});

  /* 2. 站进镇上：目标格上的金色角标 + 方位距离 */
  await fixture({sceneId:'town', player:{x:8,y:10,face:'right'},
    questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'}, tutorial:noGuide});
  await page.screenshot({path:path.join(OUT, 'quest-mark-town.png')});

  /* 3. 铲掉刚播下的萝卜：种子收回背包。
     必须显式写回 sceneId——上一张在镇上拍的图把场景留在 town，
     不写就会拍到"这里没有可以耕种的土地。"而不是铲除提示。 */
  await fixture({sceneId:'farm', player:{x:9,y:10,face:'up'}, inventory:{},
    plots:{'9,9':{tilled:true,water:true,crop:'radish',age:0,mature:false,harvested:false,regrow:0}},
    tutorial:noGuide});
  await page.keyboard.press('9');
  await page.keyboard.press('Space');
  await page.waitForTimeout(280);
  await page.screenshot({path:path.join(OUT, 'shovel-recover-seed.png')});

  /* 4. 结算演出：逐页截下来 */
  const jam = {id:'j1',device:'jam_jar',x:9,y:9,input:1,startDay:1,ready:false};
  await fixture({player:{x:9,y:10,face:'down'}, inventory:{radish:20,strawberry:5},
    plots:{'9,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0},
           '10,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0},
           '11,7':{tilled:true,water:true,crop:'radish',age:2,mature:false,harvested:false,regrow:0}},
    shipping:{radish:2}, structures:[jam], tutorial:noGuide});
  await page.evaluate(() => window.__MOSS__.performSettlement(false));
  await page.waitForTimeout(320);
  const names = ['settle-1-sold', 'settle-2-crop', 'settle-3-jam', 'settle-4-weather'];
  for (let i = 0; i < names.length; i++) {
    await page.screenshot({path:path.join(OUT, names[i] + '.png')});
    console.log(names[i] + ' → ' + (await winText(page)).replace(/\s+/g, ' ').slice(0, 70));
    await clickWin(page, '开始新的一天');
    await page.waitForTimeout(180);
  }

  /* 5. 收成记录页 */
  await page.evaluate(() => window.__MOSS__.openSettleLog());
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(OUT, 'settle-5-log.png')});
  await closeWin(page);
  console.log('errors =', errors);
} finally {
  await browser.close();
}
