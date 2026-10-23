/* 第三幕家书照料专项：前章与既有鸡舍为已验收夹具；预约、睡眠、寄信、回看、读档由真实按钮产生。
 * 场景落点用开发夹具，仅证明照料快照逻辑，不冒充自然路线。缺料由真实结算耗尽口粮产生。
 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin,walkTo,sleepViaMenu,dismissSettlement,winTitle} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{}),p=r.page;
let checks=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const ok=(a,n)=>{assert.ok(a,n);checks++;console.log('PASS',n);};
async function sleep(){await closeWin(p);ok(await sleepViaMenu(p),'真实睡眠');await dismissSettlement(p);}
async function reload(){await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.state&&document.getElementById('boot').hidden);}
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 await p.evaluate(()=>{
  const M=__MOSS__,s=M.state,st=M.storyState();s.coins=500;s.totalDay=20;s.timeMinutes=540;
  s.plots={};s.weather={today:'sun',tomorrow:'sun'};s.inventory.radish=2;
  s.structures.push({id:'letter-coop',device:'coop',x:12,y:8,livestock:{fedDay:-1,wateredDay:-1,pending:0,lastProductDay:20,mood:0,fedQty:0,stock:0}});
  M.STORY_TASKS.filter(t=>t.id!=='MQ1-C05').forEach(t=>st.tasks[t.id]='done');
  st.started=true;
  const mk=(choice,text)=>({choice,day:20,text,source:'C03 已验收夹具'});
  st.tideChapter={records:{sort:mk('chain','材料分好类'),read:mk('read','阅读材料已完成')}};
 });
 await p.keyboard.press('j');await p.getByRole('button',{name:/长期安排 · 农场照料/}).click();
 await p.getByRole('button',{name:/^农场照料|照料委托/}).first().click();
 await p.getByRole('button',{name:/预约 3 天 · 24 金/}).click();
 eq(await p.evaluate(()=>__MOSS__.farmCareState().booked),true,'真实预约三天');
 await sleep();
 eq(await p.evaluate(()=>__MOSS__.farmCareState().deliveredDays),1,'第一次结算真实照料成功');
 eq(await p.evaluate(()=>__MOSS__.state.inventory.radish||0),0,'口粮真实耗尽');
 await sleep();
 eq(await p.evaluate(()=>__MOSS__.farmCareState().shortageDays),1,'第二次结算真实缺料');
 const facts=await p.evaluate(()=>({care:JSON.parse(JSON.stringify(__MOSS__.farmCareState())),gap:__MOSS__.farmPlanCareGap(3),day:__MOSS__.state.totalDay}));
 ok(!facts.gap.ok,'预约末日不足以覆盖未来三天');
 const e=await p.evaluate(()=>__MOSS__.STORY_ENTRIES.find(e=>e.storyScene==='S037'));
 await closeWin(p);await p.evaluate(e=>__MOSS__.devSwitchScene(e.scene,e.x,e.y),e);await p.keyboard.press('e');
 for(let i=0;i<25;i++){
  if(await p.getByRole('button',{name:/寄出核验申请与家书 ·/}).count())break;
  await p.locator('.win-foot button').filter({hasText:/^继续$/}).click();
 }
 await p.getByRole('button',{name:/寄出核验申请与家书 ·/}).click();
 const letter=await p.evaluate(()=>JSON.parse(JSON.stringify(__MOSS__.state.story.tideChapter.records.letter)));
 ok(letter.text.includes('已照料 1 天，缺料 1 天'),'家书区分真实成功与缺料天数');
 ok(letter.text.includes('还差')&&letter.text.includes('鸡舍还缺口粮'),'家书写明覆盖不足与缺料原因');
 ok(letter.text.includes('第 '+facts.day+' 天'),'家书记录寄信当天日期');
 await closeWin(p);await sleep();
 ok(await p.evaluate(()=>__MOSS__.farmCareState().shortageDays>1),'寄信后照料事实继续变化');
 eq(await p.evaluate(()=>__MOSS__.state.story.tideChapter.records.letter),letter,'跨日不改寄信快照');
 await reload();
 eq(await p.evaluate(()=>__MOSS__.state.story.tideChapter.records.letter),letter,'正式继续游戏保留寄信快照');
 eq(r.errors,[],'家书照料无浏览器错误');
 console.log('PASS 家书照料快照：'+checks+' 项（'+(single?'单文件版':'源码')+'）');
}finally{await r.browser.close();}
