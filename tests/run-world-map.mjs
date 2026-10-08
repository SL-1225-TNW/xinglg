import assert from 'node:assert/strict';
import {launch,boot} from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync('output/playwright',{recursive:true});
let passed=0;
function check(name,value,expected){assert.deepEqual(value,expected,name);console.log('PASS',name);passed++;}
const desktop=await launch();
try{
 const p=desktop.page;await boot(p);await p.keyboard.press('m');
 check('M 打开地图',await p.evaluate(()=>__MOSS__.ui.window.id),'worldmap');
 check('八个区域均可查看',await p.locator('.atlas-place').count(),8);
 check('农场显示当前位置',await p.locator('.atlas-place.here').innerText(),'苔芽农场 · 你在这里');
 const time=await p.evaluate(()=>__MOSS__.state.timeMinutes);await p.waitForTimeout(350);
 check('查看地图暂停时间',await p.evaluate(()=>__MOSS__.state.timeMinutes),time);
 const state=await p.evaluate(()=>JSON.stringify(__MOSS__.state));
 await p.getByRole('button',{name:'白蔷薇城，未解锁 · 小镇南口办理通行证',exact:true}).click();
 check('城市未解锁时显示办证条件',(await p.locator('.atlas-detail').innerText()).includes('白蔷薇城 · 未解锁'),true);
 check('选择地点不传送或修改进度',await p.evaluate(()=>JSON.stringify(__MOSS__.state)),state);
 await p.getByRole('button',{name:/溪畔河湾，未解锁/}).click();
 check('河湾显示真实修桥条件',(await p.locator('.atlas-detail').innerText()).includes('未解锁 · 修复小桥'),true);
 await p.screenshot({path:'output/playwright/world-map-desktop.png'});
 await p.keyboard.press('M');check('M 再按一次关闭',await p.evaluate(()=>__MOSS__.ui.window),null);
 await p.keyboard.press('Escape');await p.getByRole('button',{name:'全境地图（M）',exact:true}).click();
 check('暂停菜单可打开地图',await p.evaluate(()=>__MOSS__.ui.window.id),'worldmap');await p.keyboard.press('Escape');
 await p.evaluate(()=>{const s=__MOSS__.state;s.sceneId='house';s.player={x:7,y:10,face:'up'};s.bridgeRepaired=true;__MOSS__.startGame(s);});
 await p.keyboard.press('m');check('室内归属农场',await p.locator('.atlas-place.here').innerText(),'苔芽农场 · 你在这里');
 check('修桥后河湾开放状态正确',await p.getByRole('button',{name:/^溪畔河湾，已开放/}).count(),1);
 check('修桥后河湾成为可传送地点',await p.getByRole('button',{name:/^溪畔河湾，已开放，可传送/}).count(),1);
 check('桌面无报错',desktop.errors,[]);
}finally{await desktop.browser.close();}
const mobile=await launch({viewport:{width:844,height:390},touch:true});
try{
 const p=mobile.page;await p.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('emulated fullscreen unavailable');};});await boot(p);await p.keyboard.press('Escape');await p.getByRole('button',{name:'全境地图（M）',exact:true}).click();
 check('手机可从菜单打开地图',await p.locator('.world-atlas').isVisible(),true);
 check('所有地点按钮没有超出地图',await p.evaluate(()=>{const r=document.querySelector('.world-atlas').getBoundingClientRect();return [...document.querySelectorAll('.atlas-place')].every(b=>{const q=b.getBoundingClientRect();return q.left>=r.left&&q.right<=r.right&&q.bottom<=r.bottom;});}),true);
 await p.getByRole('button',{name:'白蔷薇城，未解锁 · 小镇南口办理通行证',exact:true}).click();
 await p.screenshot({path:'output/playwright/world-map-mobile.png'});
 check('手机无报错',mobile.errors,[]);
}finally{await mobile.browser.close();}
console.log(`地图验收 ${passed}/${passed} 通过`);
