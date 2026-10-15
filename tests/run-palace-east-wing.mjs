/* 东翼接手验收：地区/材料夹具只安排初始条件，通行和办事由真实输入完成。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, boot, walkTo, closeWin, clickWin, winText } from './harness.mjs';
let checks = 0;
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; console.log('PASS', msg); };
const scene = p => p.evaluate(() => __MOSS__.state.sceneId);
async function pose(p, id, x, y) {
  await p.evaluate(([id,x,y]) => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene(id,x,y); }, [id,x,y]);
  await p.waitForTimeout(250);
}
const run = await launch(), p = run.page;
try {
  await boot(p); await p.locator('#tutorialSkip').click();
  await p.evaluate(() => { __MOSS__.state.exploration.city = true; });
  const audit = await p.evaluate(() => {
    const M=__MOSS__, map=M.MAPS.palace_east_wing, seen=new Set(), q=[[1,19]];
    while(q.length){const [x,y]=q.pop(), k=x+','+y;
      if(x<0||y<0||x>=map.w||y>=map.h||map.solid[x][y]||seen.has(k))continue;
      seen.add(k); q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
    const bad=[];
    for(let x=0;x<map.w;x++)for(let y=0;y<map.h;y++)if(!map.solid[x][y]&&!seen.has(x+','+y))bad.push([x,y]);
    for(const it of M.INTERACTABLES.palace_east_wing)for(const s of it.stand||[])if(!seen.has(s.join(',')))bad.push([it.id,s]);
    return {bad, services:M.INTERACTABLES.palace_east_wing.filter(i=>['palaceSupply','kitchen','interiorProp'].includes(i.kind)).length};
  });
  eq(audit.bad, [], '翼楼全地面及交互站位连通');
  eq(audit.services, 6, '六处用途已登记为真实交互');
  await pose(p,'palace_grounds',97,54); await p.keyboard.press('e');
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_east_wing');
  eq(await scene(p),'palace_east_wing','从后勤院北侧实际进入东翼');
  eq(await walkTo(p,5,19),true,'从南门走到收货台');
  await p.keyboard.press('e');
  eq((await winText(p)).includes('春日采购单'),true,'未满足前置时收货台说明条件');
  await closeWin(p);
  await p.evaluate(()=>{__MOSS__.state.exploration.cityStories.supply='done';});
  await p.keyboard.press('e'); await clickWin(p,'查看并接受委托'); await clickWin(p,'接受委托');
  eq(await p.evaluate(()=>__MOSS__.state.exploration.cityStories.rose),'accepted','收货台接受既有春宴委托');
  const before=await p.evaluate(()=>__MOSS__.state.coins);
  await clickWin(p,'交付并完成');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before,'材料不足不发奖');
  await p.evaluate(()=>{__MOSS__.invAdd('strawberry',2);__MOSS__.invAdd('wood',5);});
  await clickWin(p,'交付并完成');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before+180,'交付真实物资结算原委托奖励');
  eq(await p.evaluate(()=>__MOSS__.state.exploration.cityStories.rose),'done','两处柜台共用唯一完成状态');
  eq(await p.evaluate(()=>__MOSS__.invCount('strawberry')),0,'草莓实际扣除');
  eq(await p.evaluate(()=>__MOSS__.invCount('seed_strawberry')),2,'奖励实际入包');
  await closeWin(p);
  eq(await walkTo(p,25,5),true,'收货台经走廊到厨房'); await p.keyboard.press('e');
  eq((await winText(p)).includes('料理'),true,'炉灶打开已有料理制作入口');
  await closeWin(p);
  eq(await walkTo(p,1,19),true,'厨房返回翼楼西门'); await p.keyboard.press('e');
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_f1');
  eq(await scene(p),'palace_f1','翼楼西门通主楼一层');
  eq(await walkTo(p,37,39),true,'从东门实际步行到门厅事务台'); await p.keyboard.press('e');
  eq((await winText(p)).includes('已完成'),true,'原门厅显示同一委托已完成');
  eq(await p.evaluate(()=>__MOSS__.state.coins),before+180,'原柜台不重复发奖'); await closeWin(p);
  eq(await walkTo(p,62,19),true,'从门厅走回东墙门'); await p.keyboard.press('e');
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_east_wing');
  eq(await scene(p),'palace_east_wing','主楼东门可返回侧翼');
  eq(await walkTo(p,8,22),true,'从西门走回南门'); await p.keyboard.press('e');
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_grounds');
  eq(await scene(p),'palace_grounds','南门可回后勤院且不自动弹回');
  await pose(p,'palace_east_wing',18,12);
  eq(await p.locator('#floorTag').innerText(),'东翼 · 地面层','东翼显示所在区域与导览入口');
  fs.mkdirSync('output/playwright',{recursive:true});
  await p.screenshot({path:'output/playwright/palace-east-wing.png'});
  await p.evaluate(()=>__MOSS__.saveNow()); await p.reload();
  await p.getByRole('button',{name:'继续游戏',exact:true}).click();
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_east_wing');
  eq(await scene(p),'palace_east_wing','翼楼存档可继续');
  eq(await p.evaluate(()=>__MOSS__.state.exploration.cityStories.rose),'done','交付状态读档保留');
  eq(run.errors,[],'桌面通行办事与读档无页面报错');
} finally { await run.browser.close(); }
const mobile=await launch({viewport:{width:390,height:844},touch:true});
try {
  const p=mobile.page;await boot(p);await p.locator('#tutorialSkip').tap();
  await p.evaluate(()=>{__MOSS__.state.exploration.city=true;});
  await pose(p,'palace_grounds',97,54);await p.locator('#touchAct').tap();
  await p.waitForFunction(()=>__MOSS__.state.sceneId==='palace_east_wing');
  eq(await scene(p),'palace_east_wing','手机触屏从后勤院进入');
  await pose(p,'palace_east_wing',25,5);await p.locator('#touchAct').tap();
  eq((await winText(p)).includes('料理'),true,'手机触屏打开炉灶');
  eq(mobile.errors,[],'手机入口与厨房无页面报错');
} finally {await mobile.browser.close();}
console.log(`东翼 ${checks} 项通过`);
