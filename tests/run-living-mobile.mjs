/* 手机触屏验收；解锁和位置使用隔离夹具，按钮通过真实 tap 操作。 */
import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
let passed=0;
function check(name,a,b){assert.deepEqual(a,b,name);passed++;console.log('PASS',name);}
const {browser,page,errors}=await launch({viewport:{width:390,height:844},touch:true});
try{
 await boot(page);await page.locator('#tutorialSkip').click();
 await page.evaluate(()=>{const m=__MOSS__,s=m.state;s.sceneId='town';s.player={x:14,y:22,face:'up'};s.bridgeRepaired=true;s.coins=500;s.energy=10;s.inventory.berry=2;m.startGame(s);});
 await page.waitForTimeout(350);await page.locator('#quickFood').tap();
 check('手机快捷吃野莓恢复体力',await page.evaluate(()=>__MOSS__.state.energy),25);
 await page.locator('#touchAct').tap();
 await page.getByRole('button',{name:/150/}).tap();
 check('手机办证扣款并解锁',await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.exploration.city]),[350,true]);
 await page.getByRole('button',{name:'向下移动',exact:true}).tap();
 await page.keyboard.down('ArrowDown');await page.waitForTimeout(400);await page.keyboard.up('ArrowDown');
 await page.waitForFunction(()=>__MOSS__.state.sceneId==='city');await page.waitForTimeout(400);
 await page.evaluate(()=>{const m=__MOSS__,s=m.state;const b=m.livingInfo().city.buildings.find(b=>b.id==='bakery');s.player={x:b.door.x,y:b.door.y+1,face:'up'};m.startGame(s);});
 await page.locator('#touchAct').tap();await page.waitForFunction(()=>__MOSS__.state.sceneId==='city_bakery');await page.waitForTimeout(300);
 check('手机进入面包房',await page.evaluate(()=>__MOSS__.state.sceneId),'city_bakery');
 await page.evaluate(()=>{const m=__MOSS__;m.state.player={x:12,y:12,face:'up'};m.startGame(m.state);});
 await page.waitForTimeout(400);await page.locator('#touchAct').tap();
 await page.getByRole('button',{name:'买一个面包 · 30 金',exact:true}).tap();
 check('手机服务台交易有效',await page.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.bread]),[320,1]);
 await page.getByRole('button',{name:'离开',exact:true}).tap();
 await page.evaluate(()=>{const m=__MOSS__;m.state.sceneId='city';m.state.player={x:100,y:82,face:'up'};m.startGame(m.state);m.saveNow();});
 await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).tap();
 check('手机恢复大城市坐标',await page.evaluate(()=>[__MOSS__.state.player.x,__MOSS__.state.player.y]),[100,82]);
 await page.locator('#btnMenu').tap();await page.getByRole('button',{name:'全境地图（M）',exact:true}).tap();
 check('手机显示城区地图',await page.locator('.city-plan').isVisible(),true);
 check('旋转手机的地图逻辑宽度未溢出窗口',await page.locator('.city-plan').evaluate(e=>e.offsetWidth<=e.parentElement.clientWidth),true);
 await page.screenshot({path:'output/playwright/living-city-mobile.png'});
 check('手机全过程无浏览器报错',errors,[]);
}finally{await browser.close();}
console.log(`手机生活与城市验收 ${passed}/${passed} 通过`);
