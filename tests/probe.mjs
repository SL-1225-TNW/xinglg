import { launch, boot, snap, hud, pos, walkTo, walkAdjacent, clickTile, useSpaceOn, pickTool, press, winOpen, winTitle, lastToast, closeWin } from './harness.mjs';

const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(400);

console.log('== 初始 ==', JSON.stringify(await snap(page)));
console.log('HUD', JSON.stringify(await hud(page)));
console.log('canvas rect', await page.evaluate(() => { const r = document.getElementById('world').getBoundingClientRect(); return [r.width, r.height, r.left, r.top]; }));
console.log('hotbar slots', await page.evaluate(() => document.querySelectorAll('.hotbar .slot').length));

// 走路
const p0 = await pos(page);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
const p1 = await pos(page);
console.log('走路 right:', p0, '->', p1);

// 走到 (8,8) 并锄地
console.log('walkTo(8,8):', await walkTo(page, 8, 8), await pos(page));
await pickTool(page, 1);
await useSpaceOn(page, 8, 7);
console.log('锄地 toast:', await lastToast(page), 'plots:', Object.keys((await snap(page)).plots));

// 点击式锄地
await pickTool(page, 1);
await clickTile(page, 9, 8);
console.log('点击锄地 toast:', await lastToast(page), 'plots:', Object.keys((await snap(page)).plots));

// 播种 + 浇水
await pickTool(page, 2);
await clickTile(page, 8, 7);
console.log('播种:', await lastToast(page));
await pickTool(page, 3);
await clickTile(page, 8, 7);
console.log('浇水:', await lastToast(page), 'energy:', (await snap(page)).energy);

// 收获（未成熟）
await pickTool(page, 4);
await clickTile(page, 8, 7);
console.log('收获未成熟:', await lastToast(page));

// 背包
await press(page, 'b');
console.log('背包标题:', await winTitle(page), '文本片段:', (await page.evaluate(() => document.querySelector('.win-body').innerText)).slice(0, 160).replace(/\n/g, ' | '));
await closeWin(page);
console.log('close ->', await winOpen(page));

// 商店（需要走到镇上，先测农舍睡觉）
console.log('errors:', errors);
await browser.close();
