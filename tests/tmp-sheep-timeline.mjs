// 诊断：羊 3 天周期 + totalDay 推进
import { launch, boot, sleepViaMenu, dismissSettlement, closeWin } from './harness.mjs';
const { browser, page } = await launch();
try {
  await boot(page);
  await page.locator('#tutorialSkip').click().catch(() => { });
  await page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    s.inventory.wood = 40; s.inventory.stone = 20; s.npcFriendship.yaya = 30;
    M.devLivestock.craft('pasture');
    M.devLivestock.place('pasture', 12, 8);
  });
  const raw = () => page.evaluate(() => {
    const M = window.__MOSS__, s = M.state;
    const st = s.structures.filter(x => x.device === 'pasture')[0];
    return { totalDay: s.totalDay, ls: st ? JSON.parse(JSON.stringify(st.livestock)) : null };
  });
  console.log('放置后    ', JSON.stringify(await raw()));
  for (let i = 1; i <= 4; i++) {
    const ok = await sleepViaMenu(page);
    const dis = await dismissSettlement(page).catch(() => 'throw');
    await closeWin(page).catch(() => { });
    console.log(`睡#${i} ok=${ok} dismiss=${dis}`, JSON.stringify(await raw()));
    await page.evaluate(() => {
      const M = window.__MOSS__;
      M.state.energy = 99; M.state.inventory.potato = 10;
      M.devLivestock.feed(12, 8); M.devLivestock.water(12, 8);
    });
  }
} finally { await browser.close(); }