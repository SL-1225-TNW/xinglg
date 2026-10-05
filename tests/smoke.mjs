import { launch, boot, snap, hud, press, Report } from './harness.mjs';

const R = new Report();
const { browser, page, errors } = await launch();

await page.goto((await import('./harness.mjs')).GAME_URL);
await page.waitForTimeout(1200);

console.log('boot visible:', await page.evaluate(() => !document.getElementById('boot').hidden));
console.log('boot buttons:', await page.evaluate(() => [...document.querySelectorAll('.boot-actions button')].map(b => b.textContent)));
console.log('boot note:', await page.evaluate(() => document.getElementById('bootNote').textContent));
console.log('moss present:', await page.evaluate(() => !!window.__MOSS__));
console.log('errors:', errors);
if (errors.length) console.log('FULL:', errors.join('\n---\n'));

await browser.close();
