// Explicit save fixtures for identity, corruption, future schemas, import and multi-tab recovery.
import {launch,boot} from './harness.mjs';
import assert from 'node:assert/strict';
const {browser,page,errors}=await launch();
try{
 await boot(page); await page.evaluate(()=>{__MOSS__.state.coins=777;__MOSS__.saveNow();});
 const payload=await page.evaluate(()=>__MOSS__.serialize());
 await page.evaluate(()=>__MOSS__.switchSaveIdentity(null));
 await page.evaluate(p=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify({...p,savedAt:123456}));},payload);
 await page.reload();assert.equal(await page.evaluate(()=>__MOSS__.saves.read().payload.savedAt),123456);
 assert.ok(await page.evaluate(()=>localStorage.getItem('moss-farm-v2')));
 await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 await page.evaluate(()=>__MOSS__.switchSaveIdentity('11111111-1111-4111-8111-111111111111'));
 assert.equal(await page.evaluate(()=>__MOSS__.state),null);
 assert.equal(await page.locator('#hudCoins .hud-value').textContent(),'—');
 assert.equal(await page.evaluate(()=>__MOSS__.saves.read()),null);
 await page.getByRole('button',{name:'开始新的游戏',exact:true}).click();
 await page.evaluate(()=>{__MOSS__.state.coins=111;__MOSS__.saveNow();__MOSS__.switchSaveIdentity('22222222-2222-4222-8222-222222222222');});
 await page.getByRole('button',{name:'开始新的游戏',exact:true}).click();
 await page.evaluate(()=>{__MOSS__.state.coins=222;__MOSS__.saveNow();__MOSS__.switchSaveIdentity('11111111-1111-4111-8111-111111111111');});
 await page.getByRole('button',{name:'继续游戏',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.state.coins),111);
 await page.evaluate(()=>__MOSS__.switchSaveIdentity(null));await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'导入存档',exact:true}).click();
 await page.locator('#importText').fill(JSON.stringify({...payload,coins:888}));await page.getByRole('button',{name:'导入并覆盖',exact:true}).click();
 assert.equal(await page.evaluate(()=>__MOSS__.state.coins),888);
 assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes(':backup:')&&JSON.parse(localStorage[k]).reason==='import')));
 // Same-origin second page uses the same guest namespace. First page must stop writing.
 const other=await page.context().newPage();await other.goto(page.url());
 await other.getByRole('button',{name:'继续游戏',exact:true}).click();
 await other.evaluate(()=>{__MOSS__.state.coins=999;__MOSS__.saveNow();});
 await page.getByRole('dialog',{name:'另一个页面更新了存档',exact:true}).waitFor();
 await page.evaluate(()=>__MOSS__.saveNow());assert.equal(await page.evaluate(()=>__MOSS__.saves.read().payload.coins),999);
 await other.close();
 await page.reload();
 await page.evaluate(p=>{localStorage.clear();localStorage.setItem('moss-farm-v2',JSON.stringify({...p,version:3,newFeature:'retained'}));},payload);
 await page.reload();assert.equal(await page.getByRole('button',{name:'开始新的游戏',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'导出原始存档',exact:true}).count(),1);
 assert.equal(await page.evaluate(()=>__MOSS__.saves.read().payload.newFeature),'retained');
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('moss-farm-v2:guest','broken');});await page.reload();
 assert.equal(await page.getByRole('button',{name:'导出损坏的原始数据',exact:true}).count(),1);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'重新开始（清空当前进度）',exact:true}).click();
 assert.equal(await page.evaluate(()=>__MOSS__.saves.read().payload.totalDay),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: browser legacy savedAt, A/B/guest isolation, clear HUD, import backup, same-origin tabs, future export, corrupt recovery');
}finally{await browser.close();}
