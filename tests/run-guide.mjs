/* 新手引导验收：第一部分只用实际键鼠从新游戏走完教程；后半段显式使用存档夹具测边界。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch,boot,snap,pos,walkTo,walkAdjacent,faceTowards,pickTool,clickTile,closeWin,sleepViaMenu,dismissSettlement,GAME_URL} from './harness.mjs';
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
/* 读真实画布，数"提示框虚线"本身的颜色像素：rgba(161,189,88,.8) 混在耕地上就是 (157,173,85)，
   草地/泥土/角色本身都没有这个颜色，所以按精确颜色计数既不会误报，也不用管相机偏移。
   画布后备尺寸固定 384×256，缩放只改 CSS 尺寸，所以直接按画布像素取样。 */
const ringScore=()=>page.evaluate(()=>{const M=window.__MOSS__,c=document.getElementById('world');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4){if(Math.abs(d[i]-157)<8&&Math.abs(d[i+1]-173)<8&&Math.abs(d[i+2]-85)<8)n++;}return n;});
try{
 await boot(page);await title('1/9');
 await page.keyboard.press('1');await page.waitForTimeout(250);eq('只选工具不算移动',(await guide()).flags.moved,undefined);
 // 站在草地/道路上时，角色四周不能出现虚线提示框（否则框会一直跟着人挡视线）
 eq('站在草地时角色周围没有提示框',await ringScore(),0);
 ok('草地（第 1 步）不提示脚下四格',!(await page.locator('#tutorialText').innerText()).includes('脚下四格'));
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(330);await page.keyboard.up('ArrowLeft');await title('2/9');
 // 站进田里（脚下那块可耕种）才标出角色四周可用格
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(700);await page.keyboard.up('ArrowUp');await page.waitForTimeout(300);
 eq('走进田里后仍在第二步',(await page.locator('#tutorialTitle').innerText()).includes('2/9'),true);
 assert.ok((await snap(page)).py<9,'从草地跨进田里：'+JSON.stringify(await pos(page)));
 const fieldRing=await ringScore();
 ok('站进田里才出现角色周围提示框',fieldRing>20,fieldRing);
 ok('田里的引导文案点明脚下四格',await page.waitForFunction(()=>document.getElementById('tutorialText').textContent.includes('脚下四格'),null,{timeout:3000}).then(()=>true).catch(()=>false));
 await page.screenshot({path:'output/playwright/guide-ring-in-field.png'});
 await page.keyboard.down('ArrowDown');await page.waitForTimeout(700);await page.keyboard.up('ArrowDown');await page.waitForTimeout(250);
 await walk(9,9);
 const plots=[[9,8],[10,8],[11,8]];
 await pickTool(page,2);await clickTile(page,9,9);eq('未翻土/距离不足的播种不推进',(await guide()).flags.seeded,undefined);
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
 // 收入断言要含每日 50 金补助：教程跨 3 晚 = 80 奖励 + 3×50 补助 = 230
 eq('获得真实委托奖励',(await snap(page)).coins,80+3*50);await refresh();eq('完成状态刷新后保留',(await guide()).status,'done');
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
 // 储物箱视觉：读实际画布，确认木箱确实画在室内，而不是仅检测绘制函数存在。
 // 照 run-fixes 的做法：缩放从 getTransform().a 取，读像素前先 drawImage 到 1:1 采样画布。
 await enter();await page.screenshot({path:'output/playwright/guide-chest.png'});
 const chest=await page.evaluate(()=>{const M=window.__MOSS__,g=document.querySelector('#world').getContext('2d');
  const scale=g.getTransform().a;
  const s=document.createElement('canvas');s.width=16;s.height=16;
  const sg=s.getContext('2d');sg.imageSmoothingEnabled=false;
  const x=13*16-Math.round(M.cam.x),y=2*16-Math.round(M.cam.y);
  sg.drawImage(g.canvas,Math.round(x)*scale,Math.round(y)*scale,16*scale,16*scale,0,0,16,16);
  const d=sg.getImageData(0,0,16,16).data;
// 木箱画面实测配色（室内无阴影压暗）：主体 184,121,63；箱盖 227,174,101；高光 233,196,119；缝隙阴影 53,41,31
 let body=0,lid=0,shade=0;
 for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];
  if(r>=172&&r<=196&&gg>=110&&gg<=132&&b>=54&&b<=72)body++;
  if(r>=215&&r<=239&&gg>=163&&gg<=185&&b>=90&&b<=112)lid++;
  if(r>=222&&r<=244&&gg>=185&&gg<=207&&b>=108&&b<=130)shade++;}
 return {body,lid,shade,scale};});
 eq('储物箱箱体在实际画面可见',chest.body>30,true);
 eq('储物箱箱盖在实际画面可见',chest.lid>25,true);
 eq('储物箱有明暗层次（不是纯色块）',chest.shade>5,true);eq('边界夹具过程无控制台错误',errors,[]);
 const mobile=await launch({viewport:{width:390,height:844},touch:true});
 try{const p=mobile.page;await boot(p);await p.waitForTimeout(300);ok('触屏显示对应操作提示',(await p.locator('#tutorialText').innerText()).includes('屏幕方向键'));
 const before=await snap(p);const b=await p.getByRole('button',{name:'向左移动',exact:true}).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(400);await p.mouse.up();await p.waitForTimeout(300);ok('触屏方向键实际推进移动引导',(await snap(p)).px<before.px&&(await p.locator('#tutorialTitle').innerText()).includes('2/9'));
 // 竖屏手机/平板下 #app 被 transform:matrix(0,1,-1,0,0,0) 旋转 90°，逻辑尺寸变成横屏。
 // getBoundingClientRect 返回旋转后的视觉盒子，宽高会转置，一比就错。这里用 offsetWidth/offsetHeight
 // （不受 transform 影响）判断元素在游戏内坐标系里的真实尺寸。
 // 强制横屏是设计：rotatedPlay() = 触屏设备且竖屏即旋转，手机平板一视同仁。
 const layoutOf=async(vp,touch)=>{const mm=await launch({viewport:vp,touch});
  try{const pp=mm.page;await boot(pp);await pp.waitForTimeout(300);
   return await pp.evaluate(()=>{const app=document.getElementById('app');
    const el=id=>document.getElementById(id);
    const m=id=>{const e=el(id);return e?{w:e.offsetWidth,h:e.offsetHeight,top:e.offsetTop,left:e.offsetLeft}:null;};
    const r=window.innerWidth, h=window.innerHeight, rotated=h>r;
    return {app:{w:app.offsetWidth,h:app.offsetHeight},
     farmAssist:m('farmAssist'),world:m('world'),touchUse:m('touchUse'),
     rotated,visual:{w:rotated?h:r,h:rotated?r:h}};});
  }finally{await mm.browser.close();}};
 const boxes=await p.evaluate(()=>{const app=document.getElementById('app');
  const m=id=>{const e=document.getElementById(id);return {id,w:e.offsetWidth,h:e.offsetHeight,
   top:e.offsetTop,left:e.offsetLeft};};
  return {app:{w:app.offsetWidth,h:app.offsetHeight},farmAssist:m('farmAssist'),world:m('world'),touchUse:m('touchUse')};});
 ok('手机引导条横向铺开不挤成竖条',boxes.farmAssist.w>boxes.app.w*0.5);
 ok('手机引导条高度合理（单行浮层不是整列）',boxes.farmAssist.h<boxes.app.h*0.5);
 ok('手机引导条在画布上方不压画面',boxes.farmAssist.top+boxes.farmAssist.h<=boxes.app.h);
 ok('手机工具按钮仍在屏内',boxes.touchUse.top+boxes.touchUse.h<=boxes.app.h);
 // 平板同样强制横屏：竖屏视口应旋转成横屏逻辑尺寸，横屏视口原样使用，引导条都不能被挤成竖列
 for(const vp of [{width:768,height:1024},{width:1024,height:768}]){
  const b=await layoutOf(vp,true);
  eq('平板'+vp.width+'x'+vp.height+' 强制横屏尺寸正确',[b.app.w,b.app.h],[b.visual.w,b.visual.h]);
  ok('平板'+vp.width+'x'+vp.height+' 引导条横向铺开',b.farmAssist.w>b.app.w*0.5);
  ok('平板'+vp.width+'x'+vp.height+' 引导条不压画面',b.farmAssist.top+b.farmAssist.h<=b.app.h);}
 await p.screenshot({path:'output/playwright/guide-mobile.png'});await p.getByRole('button',{name:'稍后再学',exact:true}).click();await p.waitForTimeout(300);
 ok('触屏按钮能暂停',(await p.locator('#tutorialTitle').innerText()).includes('已暂停'));
 await p.getByRole('button',{name:'继续引导',exact:true}).click();await p.waitForTimeout(300);
 ok('触屏按钮能继续并保留进度',(await p.locator('#tutorialTitle').innerText()).includes('2/9'));eq('触屏无控制台错误',mobile.errors,[]);
 }finally{await mobile.browser.close();}
 console.log('新手引导验收 '+passed+'/'+passed+' 通过');fs.appendFileSync('output/playwright/guide-results.log','新手引导验收 '+passed+'/'+passed+' 通过\n');
}catch(error){await page.screenshot({path:'output/playwright/guide-failed.png'});console.error(await guide(),await daily(),await page.locator('#tutorialTitle').innerText());throw error;}finally{await browser.close();}
