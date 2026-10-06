import assert from 'node:assert/strict';import{launch,boot}from'./harness.mjs';
const{browser,page,errors}=await launch({viewport:{width:390,height:844},touch:true});
try{
 await boot(page);await page.locator('#tutorialSkip').click();
 await page.evaluate(()=>{let m=__MOSS__,s=m.state;s.sceneId='town';s.player={x:14,y:2,face:'up'};s.bridgeRepaired=true;s.coins=500;s.inventory.wood=100;s.inventory.stone=50;m.startGame(s);});
 await page.locator('#touchAct').tap();
 await page.getByRole('button',{name:'确认修复 / 升级',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.exploreState().forest),true);
 await page.evaluate(()=>__MOSS__.openExploreSite('forest'));await page.waitForFunction(()=>__MOSS__.state.sceneId==='forest');await page.waitForTimeout(300);
 await page.screenshot({path:'/tmp/explore-mobile.png'});
 await page.evaluate(()=>{let m=__MOSS__;m.state.player={x:30,y:5,face:'up'};m.startGame(m.state);});await page.locator('#touchAct').tap();await page.getByRole('button',{name:'确认修复 / 升级',exact:true}).click();assert.equal(await page.evaluate(()=>__MOSS__.exploreState().mine),true);
 await page.evaluate(()=>__MOSS__.openExploreSite('mine'));await page.waitForFunction(()=>__MOSS__.state.sceneId==='mine1');await page.waitForTimeout(300);await page.screenshot({path:'/tmp/explore-mobile-mine.png'});
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS phone portrait-lock layout, touch forest gate, touch mine gate, mining scene rendering');
}finally{await browser.close();}
