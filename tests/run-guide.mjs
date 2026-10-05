/* 新手引导验收：第一部分只用实际键鼠从新游戏走完教程；后半段显式使用存档夹具测边界。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch,boot,snap,walkTo,walkAdjacent,faceTowards,pickTool,clickTile,closeWin,sleepViaMenu,dismissSettlement,GAME_URL} from './harness.mjs';
fs.mkdirSync('output/playwright',{recursive:true});
fs.writeFileSync('output/playwright/guide-results.log','');
let passed=0;
function eq(name,a,b){assert.deepEqual(a,b,name);passed++;const line='PASS '+name+'\n';process.stdout.write(line);fs.appendFileSync('output/playwright/guide-results.log',line);}
function ok(name,a){eq(name,!!a,true);}
const {browser,page,errors}=await launch();
const guide=()=>page.evaluate(()=>structuredClone(window.__MOSS__.state.tutorial));
const daily=()=>page.locator('#dailyTasks').innerText();
async function title(s){await page.waitForFunction(t=>document.getElementById('tutorialTitle').textContent.includes(t),s);ok('引导来到 '+s,(await page.locator('#tutorialTitle').innerText()).includes(s));}
async function walk(x,y){assert.ok(await walkTo(page,x,y,20000),'实际走到 '+x+','+y);}
async function tool(slot,x,y){assert.ok(await walkAdjacent(page,x,y));await pickTool(page,slot);await clickTile(page,x,y);await page.waitForTimeout(250);}
async function enter(){await walk(3,5);await page.keyboard.press('e');await page.waitForFunction(()=>window.__MOSS__.state.sceneId==='house');await page.waitForTimeout(350);}
async function leave(){await walk(7,11);await page.waitForFunction(()=>window.__MOSS__.state.sceneId==='farm');await page.waitForTimeout(350);}
async function refresh(){await page.waitForTimeout(1000);await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();await page.waitForTimeout(350);}
try{
 await boot(page);await title('1/9');
 await page.keyboard.press('1');await page.waitForTimeout(250);eq('只选工具不算移动',(await guide()).flags.moved,undefined);
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(330);await page.keyboard.up('ArrowLeft');await title('2/9');
 await pickTool(page,2);await clickTile(page,9,9);eq('未翻土/距离不足的播种不推进',(await guide()).flags.seeded,undefined);
 const plots=[[9,8],[10,8],[11,8]];
 await tool(1,9,8);await title('3/9');
 await tool(2,9,8);await title('4/9');
 for(const [x,y] of plots.slice(1)){await tool(1,x,y);await tool(2,x,y);}
 ok('今日待办统计三株缺水',(await daily()).includes('待浇水 3 块'));
 await page.getByRole('button',{name:'稍后再学',exact:true}).click();eq('暂停状态写入存档',(await guide()).status,'paused');
 const flags=(await guide()).flags;await refresh();eq('刷新保留暂停与完成步骤',[(await guide()).status,(await guide()).flags],['paused',flags]);
 await page.getByRole('button',{name:'继续引导',exact:true}).click();await title('4/9');
 await page.getByRole('button',{name:'跳过教程',exact:true}).click();eq('跳过隐藏任务卡',await page.locator('#tutorialCard').isVisible(),false);
 await refresh();eq('跳过后刷新不重新弹出',(await guide()).status,'skipped');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'继续新手引导',exact:true}).click();await title('4/9');
 await tool(1,14,8);await tool(3,14,8);eq('给空耕地浇水不冒充给作物浇水',(await guide()).flags.watered,undefined);
 await tool(3,9,8);await title('5/9');ok('浇一株待办减一',(await daily()).includes('待浇水 2 块'));
 for(const [x,y] of plots.slice(1))await tool(3,x,y);
 ok('浇完田待办归零',(await daily()).includes('待浇水 0 块'));
 await page.screenshot({path:'output/playwright/guide-watered.png'});
 await enter();await title('6/9');
 await page.screenshot({path:'output/playwright/guide-house.png'});
 await walk(2,3);await page.keyboard.press('e');await page.getByRole('button',{name:'再玩一会儿',exact:true}).click();
 eq('取消睡觉不完成引导',(await guide()).flags.slept,undefined);eq('取消睡觉不推进日期',(await snap(page)).day,1);
 await page.keyboard.press('e');await page.getByRole('button',{name:'确认睡觉',exact:true}).click();await page.waitForTimeout(400);await dismissSettlement(page);await title('7/9');
 eq('床上睡觉推进一天',(await snap(page)).day,2);eq('睡醒仍在室内',(await snap(page)).scene,'house');
 await refresh();await title('7/9');await leave();await walk(9,9);await faceTowards(page,9,8);await title('8/9');
 for(const [x,y] of plots)await tool(3,x,y);
 assert.ok(await sleepViaMenu(page));await dismissSettlement(page);await page.waitForTimeout(300);
 eq('第三天下雨',(await snap(page)).weather.today,'rain');ok('雨天待办不要求浇水',(await daily()).includes('待浇水 0 块')&&(await daily()).includes('雨天自动浇水'));
 const energy=(await snap(page)).energy;await tool(3,9,8);eq('雨天重复浇水不扣体力',(await snap(page)).energy,energy);
 assert.ok(await sleepViaMenu(page));await dismissSettlement(page);await page.waitForTimeout(300);
 ok('成熟待办显示三株',(await daily()).includes('可收获 3 株'));
 await tool(4,9,8);await title('9/9');ok('收获一株后待办减一',(await daily()).includes('可收获 2 株'));
 for(const [x,y] of plots.slice(1))await tool(4,x,y);
 eq('正常收获三颗萝卜',(await snap(page)).inv.radish,3);
 await walk(31,10);await page.waitForTimeout(400);await walk(14,10);await faceTowards(page,14,9);await page.keyboard.press('e');
 await page.locator('.win .quest').filter({hasText:'第一份收成'}).getByRole('button',{name:'交付材料',exact:true}).click();await closeWin(page);await page.waitForTimeout(300);
 eq('提交真实委托完成教程',(await guide()).status,'done');eq('完成后卡片自动收起',await page.locator('#tutorialCard').isVisible(),false);
 eq('获得真实委托奖励',(await snap(page)).coins,80);await refresh();eq('完成状态刷新后保留',(await guide()).status,'done');
 await page.screenshot({path:'output/playwright/guide-completed.png'});
 eq('正常教学全程无控制台错误',errors,[]);
 // 边界夹具：只用于旧存档、洒水器、背包满等无法在短教学内自然覆盖的情况。
 const saved=await page.evaluate(()=>window.__MOSS__.serialize());
 async function loadFixture(patch){await page.goto('about:blank');await page.goto(GAME_URL);await page.evaluate(v=>localStorage.setItem('moss-farm-v2',JSON.stringify(v)),{...saved,...patch});await page.reload();await page.getByRole('button',{name:'继续游戏',exact:true}).click();await page.waitForTimeout(300);}
 const crop={tilled:true,water:false,crop:'radish',age:0,mature:false,harvested:false,regrow:0};
 await loadFixture({tutorial:undefined,questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'},coins:321,plots:{'9,8':crop},sceneId:'farm',player:{x:9,y:9,face:'up'}});
 eq('旧存档不强制弹教程',(await guide()).status,'skipped');eq('旧存档金币保持',(await snap(page)).coins,321);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'继续新手引导',exact:true}).click();await title('4/9');
 eq('主动开启识别已种作物',(await guide()).flags.seeded,true);
 await loadFixture({tutorial:{status:'active',flags:{moved:true,tilled:true,seeded:true,watered:true,entered:true,slept:true,inspected:true},seedDay:1,plot:'9,8'},questProgress:{1:'unlocked',2:'locked',3:'locked',4:'locked'},sceneId:'farm',player:{x:9,y:9,face:'up'},inventory:{radish:1980},plots:{'9,8':{...crop,crop:'potato',age:5,mature:true}}});
 await tool(4,9,8);eq('满背包失败收获不会完成教程阶段',(await guide()).flags.harvested,undefined);ok('满背包作物仍计入待收获',(await daily()).includes('可收获 1 株'));
 await loadFixture({sceneId:'farm',player:{x:9,y:9,face:'up'},totalDay:4,weather:{today:'sun',tomorrow:'sun'},plots:{'9,8':crop,'10,7':crop,'11,8':{...crop,mature:true,age:3}},structures:[{id:'s1',device:'sprinkler',x:10,y:8}],tutorial:{status:'skipped',flags:{}}});
 assert.ok(await sleepViaMenu(page));await dismissSettlement(page);await page.waitForTimeout(300);
 ok('洒水器生效后待浇水为零',(await daily()).includes('待浇水 0 块'));ok('成熟作物单独统计',(await daily()).includes('可收获 1 株'));
 // 储物箱视觉：读实际画布，检查箱盖和金属包边，而非仅检测绘制函数存在。
 await enter();await page.screenshot({path:'output/playwright/guide-chest.png'});
 const chestPixels=await page.evaluate(()=>{const M=window.__MOSS__,g=document.getElementById('world').getContext('2d');const d=g.getImageData(13*16-Math.round(M.cam.x),2*16-Math.round(M.cam.y),16,16).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>180&&d[i+1]>100&&d[i+1]<225&&d[i+2]<160)n++;return n;});
 ok('箱盖与包边在实际画面可见',chestPixels>55);eq('边界夹具过程无控制台错误',errors,[]);
 const mobile=await launch({viewport:{width:390,height:844},touch:true});
 try{const p=mobile.page;await boot(p);await p.waitForTimeout(300);ok('触屏显示对应操作提示',(await p.locator('#tutorialText').innerText()).includes('屏幕方向键'));
 const before=await snap(p);const b=await p.getByRole('button',{name:'向左移动',exact:true}).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(400);await p.mouse.up();await p.waitForTimeout(300);ok('触屏方向键实际推进移动引导',(await snap(p)).px<before.px&&(await p.locator('#tutorialTitle').innerText()).includes('2/9'));
 const boxes=await p.evaluate(()=>['farmAssist','world','hotbar','touchUse'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right};}));
 ok('手机引导不遮盖画布',boxes[0].y+boxes[0].h<=boxes[1].y);ok('手机引导不横向溢出',boxes[0].right<=390);ok('手机工具按钮仍在屏内',boxes[3].y+boxes[3].h<=844);
 await p.screenshot({path:'output/playwright/guide-mobile.png'});await p.getByRole('button',{name:'稍后再学',exact:true}).click();await p.getByRole('button',{name:'继续引导',exact:true}).click();ok('触屏按钮能暂停和继续',(await p.locator('#tutorialTitle').innerText()).includes('2/9'));eq('触屏无控制台错误',mobile.errors,[]);
 }finally{await mobile.browser.close();}
 console.log('新手引导验收 '+passed+'/'+passed+' 通过');fs.appendFileSync('output/playwright/guide-results.log','新手引导验收 '+passed+'/'+passed+' 通过\n');
}catch(error){await page.screenshot({path:'output/playwright/guide-failed.png'});console.error(await guide(),await daily(),await page.locator('#tutorialTitle').innerText());throw error;}finally{await browser.close();}
