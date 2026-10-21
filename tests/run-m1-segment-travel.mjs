/* M1 P0-1：逻辑与界面专项。夹具提供已验收商旅路线、金币、作物牲畜；
 * 公付用例提供 M0 已取得的核验函。预约与取消点真实按钮，逐日用正式
 * performSettlement 推进；此专项不声称自然跨境入口、实体手机或剧情幕已完成。 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin } from './harness.mjs';
const single = process.argv.includes('--single-file');
const r = await launch(single ? {url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{}), p=r.page;
let checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
const snap=()=>p.evaluate(()=>JSON.parse(JSON.stringify({plan:__MOSS__.farmPlanState(),coins:__MOSS__.state.coins,day:__MOSS__.state.totalDay,scene:__MOSS__.state.sceneId,player:__MOSS__.state.player})));
async function sleep(){await closeWin(p);await p.evaluate(()=>{__MOSS__.state.weather.tomorrow='sun';__MOSS__.performSettlement(true);});await closeWin(p);}
async function panel(){await p.evaluate(()=>__MOSS__.openFarmSchedulePanel());}
async function book(name,n=3,pay='自费'){await panel();await p.getByRole('button',{name:new RegExp('^'+name+' · '+n+' 天 · .*（'+pay+'）$')}).click();}
try {
  await boot(p);await p.locator('#tutorialSkip').click();
  eq(await p.evaluate(()=>__MOSS__.normalizeFarmPlan({}).journey),null,'旧计划不补造旅行');
  ok(!(await p.evaluate(()=>__MOSS__.segmentJourneyPreview('pine',3))).ok,'未满足既有通行条件不能预约');
  await p.evaluate(()=>{const M=__MOSS__;M.professionalLifeState().routes.trade=4;M.professionalLifeState().passes.visit=true;M.state.coins=2000;
    /* P0-2 规则变更：跨地区现在按凭证放行，夹具补上 M0 的核验函与四张跨境凭证；
       门槛本身由 tests/run-m1-cross-border.mjs 单独守着。 */
    M.storyRecordEvidence('civil_check','S017 · 宫城一层门厅');
    ['neighbor_pass','tide_route','capital_pass','echo_guide'].forEach(id=>M.storyRecordEvidence(id,'夹具 · P0-2 跨境凭证'));});
  for(const [key,name,scene] of [['pine','白松驿村','ms1_pine_village'],['tide','潮汐港','ms1_tide_docks'],['capital','王都','ms1_capital_street'],['echo','回声谷','ms1_echo_village']]) {
    const before=await snap();const pv=await p.evaluate(k=>__MOSS__.segmentJourneyPreview(k,3),key);
    ok(pv.ok,name+'可安排：'+pv.reason);await book(name);
    let s=await snap();eq(s.coins,before.coins-pv.total,name+'只扣预存费');
    eq(s.scene,before.scene,name+'预约当天不瞬移');
    ok(!await p.evaluate(()=>__MOSS__.bookSegmentJourney('tide',3)),name+'不重复预约扣钱');
    await sleep();s=await snap();eq(s.scene,scene,name+'首日到达公共落点');eq(s.plan.journey.log.length,1,name+'逐日记账');
    const once=s;await p.evaluate(()=>__MOSS__.applyFarmPlanTick());eq(await snap(),once,name+'同日推进幂等');
    eq(await p.evaluate(()=>{const a=__MOSS__.normalizeFarmPlan(__MOSS__.farmPlanState());return JSON.stringify(a)===JSON.stringify(__MOSS__.normalizeFarmPlan(a));}),true,name+'在途存档归一化幂等');
    await sleep();eq((await snap()).scene,scene,name+'中途过夜不送回农场');
    await sleep();s=await snap();eq(s.scene,'farm',name+'末日安全返程');eq(s.plan.booked,false,name+'完成收口');eq(s.plan.journey.log.length,3,name+'三天各记一账');
    ok(await p.evaluate(()=>{const s=__MOSS__.state,m=__MOSS__.MAPS[s.sceneId];return !__MOSS__.isSolid(s.sceneId,s.player.x,s.player.y)&&!(m.exits||[]).some(e=>e.x===s.player.x&&e.y===s.player.y);}),name+'返程不落墙与出口');
  }
  await book('潮汐港',7);await sleep();let s=await snap();const balance=s.coins;
  await panel();await p.getByRole('button',{name:/^取消剩余计划/}).click();s=await snap();
  eq(s.coins-balance,96,'七天走一天只退六天费用');eq(s.scene,'farm','提前取消安全返程');
  await p.evaluate(()=>__MOSS__.cancelFarmPlan());eq((await snap()).coins,s.coins,'重复取消不退款');
  await p.evaluate(()=>{__MOSS__.state.story.evidence.civil_check={title:'民用资料核验函',source:'S017',day:1};__MOSS__.state.coins=0;});
  await book('白松驿村',3,'公付');await sleep();s=await snap();eq(s.coins,0,'公付费用不进入钱包、不领离农补助');
  eq(s.plan.journey.log[0].fare,8,'公共支付有路费账');eq(s.plan.journey.log[0].guide,4,'公共支付有向导账');eq(s.plan.journey.log[0].reception,2,'公共支付有接应账');
  await p.evaluate(()=>__MOSS__.cancelFarmPlan());eq((await snap()).coins,0,'公付取消不向玩家退款');
  await book('王都',7,'公付');
  for(let i=0;i<7;i++) await sleep();
  s=await snap();eq(s.plan.journey.log.length,7,'七天行程完整逐日结算');eq(s.scene,'farm','七天完整返程');
  await book('回声谷',3,'公付');await sleep();
  const seed=await p.evaluate(()=>JSON.stringify(__MOSS__.serialize()));
  const qc=await r.browser.newContext(),q=await qc.newPage();await q.goto(p.url());
  await q.evaluate(s=>{localStorage.clear();localStorage.setItem('moss-farm-v2',s);},seed);
  await q.reload();await q.locator('.boot-actions button',{hasText:'继续'}).first().click();
  await q.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);
  eq(await q.evaluate(()=>__MOSS__.farmPlanState().journey.log.length),1,'真实读档保留在途支付账');
  await q.evaluate(()=>__MOSS__.applyFarmPlanTick());eq(await q.evaluate(()=>__MOSS__.farmPlanState().journey.log.length),1,'读档后当日不重复支付');
  await qc.close();
  await p.evaluate(()=>{__MOSS__.state.weather.tomorrow='rain';__MOSS__.performSettlement(true);});await closeWin(p);
  s=await snap();eq(s.plan.journey.log.length,1,'雨天暂停不记支出');eq(s.scene,'ms1_echo_village','雨天留在当地');
  await p.evaluate(()=>__MOSS__.resumePlanToday());eq((await snap()).plan.journey.log.length,2,'接受雨天条件后只推进一天');
  await p.evaluate(()=>__MOSS__.cancelFarmPlan());
  await p.evaluate(()=>{const M=__MOSS__;M.state.coins=500;M.state.plots['6,4']={tilled:true,crop:'radish',age:0,mature:false,water:false};M.state.structures.push({id:'segment-coop',device:'coop',x:12,y:8,livestock:{fedDay:-1,wateredDay:-1,pending:0,lastProductDay:1,mood:0,fedQty:0,stock:0}});});
  ok(!(await p.evaluate(()=>__MOSS__.segmentJourneyPreview('pine',3))).ok,'未约照料拒绝离农');
  await p.evaluate(()=>__MOSS__.bookFarmCare(3));
  ok(/口粮/.test((await p.evaluate(()=>__MOSS__.segmentJourneyPreview('pine',3))).reason),'约了照料但缺粮仍拒绝');
  await p.evaluate(()=>{__MOSS__.state.inventory.radish=30;});await book('白松驿村',3,'公付');await sleep();
  await p.evaluate(()=>{__MOSS__.state.inventory.radish=0;__MOSS__.state.inventory.potato=0;__MOSS__.state.inventory.strawberry=0;});
  await sleep();s=await snap();eq(s.plan.deliveredDays,1,'途中缺粮暂停、不冒充完成');eq(s.plan.journey.log.length,1,'暂停日不记交通支出');
  await panel();await p.getByRole('button',{name:/^取消剩余计划/}).click();eq((await snap()).scene,'farm','缺粮后可提前返程');
  await p.evaluate(()=>{__MOSS__.state.structures=[];__MOSS__.state.plots={};__MOSS__.cancelFarmCare();__MOSS__.bookFarmPlan(3);});
  eq((await snap()).plan.journey,null,'普通计划清除上一段旅行类型');
  eq(r.errors,[],'无浏览器异常');
  console.log(`M1 分段旅行 ${checks} 项通过${single?'（单文件）':''}`);
} finally {await r.browser.close();}

