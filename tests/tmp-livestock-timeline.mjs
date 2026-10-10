// 临时诊断：把畜养跨天时间线原样打出来，用于定位契约
import { launch, boot, sleepViaMenu, dismissSettlement, closeWin } from './harness.mjs';

const { browser, page } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });

  await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.wood = 40; s.inventory.stone = 20; s.inventory.potato = 20;
    s.npcFriendship.yaya = 30;
    M.devLivestock.craft('coop');
    M.devLivestock.place('coop', 12, 5);
  });

  const raw = () => page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const st = s.structures.filter(x => x.device === 'coop')[0];
    return { totalDay: s.totalDay, ls: st.livestock === undefined ? 'undefined' : JSON.parse(JSON.stringify(st.livestock)) };
  });

  console.log('放置后  ', JSON.stringify(await raw()));
  await page.evaluate(() => {
    const M = window.__MOSS__; M.state.energy = 99;
    M.devLivestock.feed(12, 5); M.devLivestock.water(12, 5);
  });
  console.log('喂水后  ', JSON.stringify(await raw()));

  for (let i = 1; i <= 5; i++) {
    await sleepViaMenu(page);
    await dismissSettlement(page).catch(() => { });
    await closeWin(page).catch(() => { });
    console.log(`睡第${i}次后`, JSON.stringify(await raw()));
    await page.evaluate(() => {
      const M = window.__MOSS__;
      M.state.energy = 99; M.state.inventory.potato = 20;
      M.devLivestock.feed(12, 5); M.devLivestock.water(12, 5);
    });
    console.log(`  再喂水`, JSON.stringify(await raw()));
  }

  // settlement 里 totalDay 何时自增
  const order = await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const st = s.structures.filter(x => x.device === 'coop')[0];
    return { note: '看 sleep 前后 totalDay', before: s.totalDay };
  });
  console.log('当前', JSON.stringify(order));
} finally {
  await browser.close();
}