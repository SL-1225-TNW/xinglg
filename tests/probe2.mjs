import { launch, boot, snap, pos, walkTo, walkAdjacent, clickTile, pickTool, lastToast } from './harness.mjs';
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });

async function chop(tx, ty, tool, n) {
  const adj = await walkAdjacent(page, tx, ty);
  console.log(`  目标(${tx},${ty}) 站到`, adj, 'player=', await pos(page), 'tool=', tool);
  await pickTool(page, tool);
  for (let i = 0; i < n; i++) {
    await clickTile(page, tx, ty);
    console.log(`    第${i + 1}次 ->`, await lastToast(page), 'energy=', (await snap(page)).energy);
  }
}
await walkTo(page, 9, 10);
console.log('chop tree (2,9)'); await chop(2, 9, 5, 3);
console.log('chop tree (1,6)'); await chop(1, 6, 5, 3);
console.log('chop tree (3,13)'); await chop(3, 13, 5, 3);
console.log('mine (1,11)'); await chop(1, 11, 6, 2);
let s = await snap(page);
console.log('wood=', s.inv.wood, 'stone=', s.inv.stone, 'energy=', s.energy);
console.log('errors', errors);
await browser.close();
