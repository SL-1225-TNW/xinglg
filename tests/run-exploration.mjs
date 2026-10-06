import assert from 'node:assert/strict';
import path from 'node:path';import {pathToFileURL}from'node:url';
import{launch,boot,walkTo}from'./harness.mjs';
for(const file of ['index.html','苔芽农场-单文件版.html']){
const{browser,page,errors}=await launch({url:pathToFileURL(path.resolve(file)).href});
const pose=async(sc,x,y)=>{await page.evaluate(({sc,x,y})=>{let m=__MOSS__;m.state.sceneId=sc;m.state.player={x,y,face:'up'};m.game.fishing=null;m.state.energy=100;m.startGame(m.state);},{sc,x,y});};
const repair=async()=>{await page.getByRole('button',{name:'确认修复 / 升级',exact:true}).click();};
try{
await boot(page);await page.locator('#tutorialSkip').click();
await pose('town',14,2);await page.keyboard.press('e');await repair();assert.equal(await page.evaluate(()=>__MOSS__.exploreState().forest),false,'bridge prerequisite');
await page.keyboard.press('Escape');
await page.evaluate(()=>{let s=__MOSS__.state;s.bridgeRepaired=true;s.coins=1000;s.inventory.wood=100;s.inventory.stone=100;});
await page.keyboard.press('e');await repair();assert.equal(await page.evaluate(()=>__MOSS__.state.coins),920);
assert(await walkTo(page,14,0));await page.waitForFunction(()=>__MOSS__.state.sceneId==='forest');await page.waitForTimeout(300);
assert(await walkTo(page,30,5));await page.keyboard.press('e');await repair();assert.equal(await page.evaluate(()=>__MOSS__.exploreState().mine),true);
await page.keyboard.press('e');await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine1');await page.waitForTimeout(300);
assert(await walkTo(page,4,4));
for(let i=0;i<3;i++)assert(await page.evaluate(()=>__MOSS__.useTool('pickaxe',4,3)));
assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.copper_ore),3);
await page.evaluate(()=>{__MOSS__.state.inventory.hardwood=20;__MOSS__.state.inventory.copper_ore=20;});
assert(await walkTo(page,22,4));await page.keyboard.press('e');await page.getByRole('button',{name:'修复轨道',exact:true}).click();await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine2');await page.waitForTimeout(300);
assert.equal(await page.evaluate(()=>__MOSS__.exploreState().depth),2);
await pose('mine2',4,4);for(let i=0;i<3;i++)await page.evaluate(()=>__MOSS__.useTool('pickaxe',4,3));assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.iron_ore),3);
await page.evaluate(()=>__MOSS__.state.inventory.iron_ore=25);await pose('mine2',22,4);await page.keyboard.press('e');await page.getByRole('button',{name:'修复轨道',exact:true}).click();await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine3');await page.waitForTimeout(300);
await pose('mine3',4,4);for(let i=0;i<3;i++)await page.evaluate(()=>__MOSS__.useTool('pickaxe',4,3));assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.gem),1);
await page.evaluate(()=>__MOSS__.saveNow());await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.state.sceneId),'mine3');assert.equal(await page.evaluate(()=>__MOSS__.exploreState().depth),3);assert.equal(await page.evaluate(()=>__MOSS__.exploreNode('mine3',4,3).saved.hp),0);
await page.evaluate(()=>__MOSS__.state.totalDay+=2);assert.equal(await page.evaluate(()=>__MOSS__.exploreNode('mine3',4,3).saved.hp),0);await page.evaluate(()=>__MOSS__.state.totalDay++);assert.equal(await page.evaluate(()=>__MOSS__.exploreNode('mine3',4,3).saved.hp),3);
await pose('mine3',13,22);assert(await walkTo(page,13,23));await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine2');await page.waitForTimeout(300);
await pose('mine2',13,22);assert(await walkTo(page,13,23));await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine1');await page.waitForTimeout(300);
await pose('mine1',13,22);assert(await walkTo(page,13,23));await page.waitForFunction(()=>__MOSS__.state.sceneId==='forest');await page.waitForTimeout(300);
await pose('forest',11,10);assert(await page.evaluate(()=>__MOSS__.useTool('harvest',11,9)));assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.mushroom),2);
await pose('forest',6,13);for(let i=0;i<4;i++)assert(await page.evaluate(()=>__MOSS__.useTool('axe',6,12)));assert.equal(await page.evaluate(()=>__MOSS__.state.inventory.hardwood),16);
await pose('forest',3,7);await page.evaluate(()=>__MOSS__.state.inventory.tool_rod=1);assert(await page.evaluate(()=>__MOSS__.__toolFish(4,7)));assert.equal(await page.evaluate(()=>__MOSS__.game.fishing.dsFirst),false);
await pose('forest',23,11);await page.keyboard.press('e');await repair();await page.evaluate(()=>__MOSS__.state.inventory.mushroom=5);await page.keyboard.press('e');let before=await page.evaluate(()=>__MOSS__.state.coins);await page.getByRole('button',{name:'交付补给',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.state.coins),before+100);await page.getByRole('button',{name:'交付补给',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.state.coins),before+100);await page.keyboard.press('Escape');
await pose('forest',37,24);await page.keyboard.press('e');before=await page.evaluate(()=>__MOSS__.state.coins);await page.keyboard.press('e');assert.equal(await page.evaluate(()=>__MOSS__.state.coins),before);
await pose('town',20,8);await page.keyboard.press('e');await page.getByRole('button',{name:'升级钢制斧头与镐子',exact:true}).click();await repair();assert.equal(await page.evaluate(()=>__MOSS__.exploreState().tools),true);
await pose('forest',14,16);await page.screenshot({path:'/tmp/explore-forest.png'});await pose('mine3',13,12);await page.screenshot({path:'/tmp/explore-mine.png'});
assert.equal(errors.length,0,errors.join('\n'));console.log('PASS',file,'gates, walking, 3 floors, gathering, return routes, save reload, regen, fishing, daily request, treasure, steel tools');
}finally{await browser.close();}}
