/* R3-C2：岗位评价双路线、周期养护责任与已发生结果的呈现。

   验收重点：
   - 岗位评价有两条来源：不先出事也能靠汛前预防加固拿到，旧事故档原样保留
   - 读档不再把预防路线打回「必须先处理事故」——这是本轮最关键的一条回归
   - 养护是周期责任：显示下次检视日、工作范围与联系人，评价按周期结算
   - 延期、交接、退出都有入口；离岗与交班都不清掉未处理的安全事件
   - 预防／应急／恢复三种已发生结果，在现场与三个人物对话里是三种说法
   - 边界：坏档归一化幂等、远程旧按钮、反复点击、低体力、长期离开

   夹具只负责把工程推到「施工已完成」；岗位评价、养护、延期交接与对话
   都走真实按钮与真实位置，不直接调函数改状态。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,closeWin,clickWin,winText} from './harness.mjs';
const single=process.argv.includes('--single-file');let count=0;
const eq=(a,b,n)=>{assert.deepEqual(a,b,n);count++;console.log('PASS',n);};
const r=await launch(single?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=r.page;
const info=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.projects.riverbay_gate)));
const eng=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.eng)));
const btn=t=>p.locator('.win button',{hasText:t}).count();
async function at(site='gauge'){await closeWin(p);await p.evaluate(s=>__MOSS__.devSwitchScene('waterworks',s==='gauge'?20:22,s==='gauge'?19:15),site);await p.waitForTimeout(150);await p.keyboard.press('e');}
async function night(){await p.evaluate(()=>{__MOSS__.closeWindow();__MOSS__.performSettlement(false);__MOSS__.closeWindow();});await p.waitForTimeout(100);}
/* 夹具：把工程推到「方案已定、工序做完、可以封闸」。此前的勘测与物流由既有用例覆盖。 */
async function toTrial(high=true){await p.evaluate(high=>{const M=__MOSS__;M.engFixtureToScheme('balanced');const q=M.state.professionalLife.projects.riverbay_gate;q.phase='build';q.kit=1;q.build=4;q.mode='self';if(high)q.survey={level:3,day:M.state.totalDay,east:'cracked',silt:'heavy'};M.state.timeMinutes=480;M.state.energy=100;M.state.inventory={};},high);await at('riverbay_pit');await clickWin(p,'封闸并启动试运行');await closeWin(p);}
/* 夹具：把职业线退回到「已签署独立报告、尚未取得岗位评价」，用于对比两条路线。 */
async function toStageOne(){await p.evaluate(()=>{const M=__MOSS__;M.resetCareerForTest();const q=M.state.professionalLife.projects.riverbay_gate;q.survey={level:2,day:1,east:'sound',silt:'light'};q.phase='certify';const e=M.state.professionalLife.eng;e.stage=1;M.state.timeMinutes=480;M.state.energy=100;M.state.inventory={wood:1,stone:1};});}
try{
  await boot(p);await p.locator('#tutorialSkip').click();
  /* 基线存档留在 Node 侧：reload 会重建页面上下文，挂在 window 上的副本会丢 */
  const BASE=await p.evaluate(()=>JSON.stringify(__MOSS__.serialize()));
  const restore=()=>p.evaluate(raw=>window.__MOSS__.replaceSave(JSON.parse(raw)),BASE);

  /* ---------- 一、岗位评价：不必等出事 ---------- */
  await toStageOne();
  await at('gauge');
  eq(await btn('旧闸预防性加固')>0,true,'没有事故时坝顶水尺出现预防性巡检');
  eq((await winText(p)).includes('另一条路'),true,'控制室说明还有预防这一条路');
  await closeWin(p);await at('gauge');
  await clickWin(p,'旧闸预防性加固（木材1');
  let e=await eng();
  eq(e.stage,2,'预防完成即取得岗位评价');
  eq(e.postEval,'preventive','岗位评价来源记为预防');
  eq(e.incident,'','预防路线不伪造一次旧事故');
  eq(await p.evaluate(()=>[__MOSS__.invCount('wood'),__MOSS__.invCount('stone')]),[0,0],'预防加固只扣真实材料各一份');
  await closeWin(p);await at('gauge');
  eq(await btn('旧闸预防性加固'),0,'预防不能重复刷');
  eq((await eng()).postEval,'preventive','反复打开面板不改写岗位评价来源');
  await closeWin(p);
  /* 关键回归：读档后不能被打回「必须先处理事故」 */
  await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
  e=await eng();
  eq(e.stage,2,'预防路线读档后不回退阶段');
  eq(e.postEval,'preventive','预防路线读档后仍记为预防');
  eq(await p.evaluate(()=>__MOSS__.state.professionalLife.projects.riverbay_gate.phase),'certify','读档后工程进度未被预防动作改写');
  await closeWin(p);
  /* 预防之后照样能拿岗位与预算：事故不再是唯一入口 */
  eq((await p.evaluate(()=>{return __MOSS__.engStep('post');})),true,'预防路线可以直接接受岗位');
  eq((await p.evaluate(()=>{return __MOSS__.engStep('budget');})),true,'预防路线可以直接申请机构拨付');
  eq((await eng()).postEval,'preventive','拿岗位不改变岗位评价来源');

  /* 已发生事故的旧档原样保留 */
  await restore();
  await toStageOne();
  await p.evaluate(()=>{__MOSS__.engStep('incident','channel');});
  e=await eng();
  eq(e.postEval,'incident','事故路线记为事故处置');
  eq(e.preventive,'','事故路线不补记一次预防');
  /* 旧档只带 incident、不带新字段：读档要补回事故来源，而不是改判成预防 */
  const legacy=await p.evaluate(()=>{const M=__MOSS__;const raw=M.serialize();raw.professionalLife.eng.preventive='';raw.professionalLife.eng.postEval='';const a=M.normalizeSaveForTest(raw),b=M.normalizeSaveForTest(a);return {inc:a.professionalLife.eng.incident,ev:a.professionalLife.eng.postEval,idem:JSON.stringify(a.professionalLife.eng)===JSON.stringify(b.professionalLife.eng)};});
  eq(legacy.inc,'channel','旧事故档保留已发生的事故');
  eq(legacy.ev,'incident','旧事故档补回事故来源而不是预防');
  eq(legacy.idem,true,'职业记录归一化幂等');

  /* ---------- 二、养护是周期责任 ---------- */
  await restore();
  await toTrial(false);
  await night();
  await at('gauge');
  await clickWin(p,'复核试运行并签署验收');
  let pj=await info();
  eq(pj.phase,'accepted','低风险正常跨夜验收');
  eq(pj.duty.status,'active','验收即接下周期养护责任');
  eq(pj.duty.cycle,3,'养护周期为 3 天');
  eq(pj.duty.nextDay,pj.duty.startDay+3,'下次检视日在一个周期之后');
  let txt=await winText(p);
  eq(txt.includes('下次检视日'),true,'面板显示下次检视日');
  eq(txt.includes('销钉与渗水复查'),true,'面板显示工作范围');
  eq(txt.includes('诺娅'),true,'面板显示联系人');
  await closeWin(p);
  /* 未到期不给按钮 */
  await p.evaluate(()=>{__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;__MOSS__.devSwitchScene('waterworks',20,19);});
  await p.evaluate(()=>{__MOSS__.state.totalDay+=1;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});
  await at('gauge');
  eq(await btn('闸门养护检视'),0,'周期未到不给检视按钮');
  eq((await info()).duty.overdue,0,'未到下次检视日不算逾期');
  await closeWin(p);
  /* 到期检视：下一个检视日按周期推进 */
  await p.evaluate(()=>{__MOSS__.state.totalDay+=2;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});
  await at('gauge');
  eq(await btn('闸门养护检视')>0,true,'到下次检视日可以检视');
  await clickWin(p,'闸门养护检视');
  pj=await info();
  eq(pj.duty.done,1,'检视次数真实累加');
  eq(pj.duty.nextDay,pj.duty.lastDay+3,'下次检视日按周期推进');
  eq(pj.duty.evalCount,0,'单次检视不给评价');
  const careersBefore=await p.evaluate(()=>__MOSS__.state.professionalLife.careers.engineering);
  await closeWin(p);
  /* 反复点击不重复结算 */
  await at('gauge');
  eq(await btn('闸门养护检视'),0,'周期内不再出现检视按钮');
  await closeWin(p);
  /* 走完一个周期才结算一次评价 */
  for(let k=0;k<2;k++){await p.evaluate(()=>{__MOSS__.state.totalDay+=3;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});await at('gauge');await clickWin(p,'闸门养护检视');await closeWin(p);}
  pj=await info();
  eq(pj.duty.done,3,'连续按期检视三次');
  eq(pj.duty.evalCount,1,'评价按周期结算一次而不是每次都涨');
  eq(await p.evaluate(()=>__MOSS__.state.professionalLife.careers.engineering),careersBefore+1,'资历只涨一次');

  /* ---------- 三、逾期只留记录不发评价 ---------- */
  const trustBefore=await p.evaluate(()=>__MOSS__.state.professionalLife.trust);
  await p.evaluate(()=>{__MOSS__.state.totalDay+=10;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});
  await at('gauge');
  eq((await winText(p)).includes('逾期'),true,'长期离开后面板显示逾期');
  await clickWin(p,'闸门养护检视');
  pj=await info();
  eq(pj.duty.overdue,1,'逾期被记入在案');
  eq(pj.duty.evalCount,1,'逾期补做不发评价');
  eq(await p.evaluate(()=>__MOSS__.state.professionalLife.trust),trustBefore,'逾期补不加互信');
  await closeWin(p);

  /* ---------- 四、延期、交接与退出 ---------- */
  await p.evaluate(()=>{__MOSS__.state.totalDay+=3;__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});
  await at('gauge');
  await clickWin(p,'申请延期一个周期');
  pj=await info();
  eq(pj.duty.deferCount,1,'延期被记录');
  eq(pj.duty.defers.length,1,'延期留下天数记录');
  eq(pj.duty.nextDay,pj.duty.defers[0].to,'延期把下次检视日往后推一个周期');
  await closeWin(p);
  for(let k=0;k<2;k++){await p.evaluate(()=>{__MOSS__.state.energy=100;__MOSS__.state.timeMinutes=480;});await at('gauge');await clickWin(p,'申请延期一个周期');await closeWin(p);}
  pj=await info();
  eq(pj.duty.deferCount,3,'延期累计到上限');
  await at('gauge');
  eq(await btn('申请延期一个周期'),0,'延期封顶后不再给按钮');
  eq((await winText(p)).includes('延期已用满'),true,'封顶后向玩家说明要交接或退出');
  await closeWin(p);

  /* 交接后责任记录与玩家记录都保留 */
  const doneBefore=(await info()).duty.done;
  await at('gauge');
  await clickWin(p,'交接给继任工程员');
  pj=await info();
  eq(pj.duty.status,'handed','责任可以交接出去');
  eq(pj.duty.successor!=='',true,'继任人可查');
  eq(pj.duty.done,doneBefore,'交接不抹掉自己做过的检视');
  eq(pj.duty.deferCount,3,'交接不抹掉延期记录');
  await closeWin(p);await at('gauge');
  eq(await btn('闸门养护检视'),0,'交接后不再有检视按钮');
  eq((await winText(p)).includes('仍记在你名下'),true,'交接后玩家责任仍可查');
  await closeWin(p);

  /* ---------- 五、离岗不清掉未处理的安全事件 ---------- */
  /* 试运行阶段还没验收，根本不存在养护责任，交接与退出都无对象 */
  await restore();
  await toTrial(true);await night();await night();
  eq((await info()).safety.status,'failed','漏检后留下未处理的安全事件');
  eq((await info()).duty.status,'none','未验收时不存在养护责任');
  eq(await p.evaluate(()=>__MOSS__.engStep('handover')),false,'未验收时接口层也拒绝交接');
  eq(await p.evaluate(()=>__MOSS__.engStep('release')),false,'未验收时接口层也拒绝退出');

  /* 夹具：构造「已验收且养护在岗，但安全记录仍未处理」的坏档，
     用来证明交班与离岗都不会顺手把未处理事件抹掉。 */
  await restore();
  await toTrial(true);await night();await night();
  await p.evaluate(()=>{const M=__MOSS__;const q=M.state.professionalLife.projects.riverbay_gate;q.phase='accepted';q.trialDay=M.state.totalDay-1;q.safety={status:'failed',route:'',deadline:1,inspectionDay:0,repairDay:0};q.duty={status:'active',cycle:3,startDay:1,nextDay:1,lastDay:1,endDay:0,done:1,sinceEval:1,evalCount:0,overdue:0,deferCount:0,defers:[],successor:'',reason:''};});
  await at('gauge');
  eq((await info()).safety.status,'failed','坏档里安全事件仍未处理');
  eq(await btn('交接给继任工程员')>0,true,'交接入口仍然可见，玩家知道有这个选项');
  eq((await winText(p)).includes('闸门还有未处理的安全事件'),true,'向前玩家说明为什么现在不能交班');
  await clickWin(p,'交接给继任工程员');
  eq((await info()).duty.status,'active','点交接不会真的交出去');
  eq((await info()).safety.status,'failed','点交接不会抹掉未处理事件');
  await closeWin(p);
  eq(await p.evaluate(()=>__MOSS__.engStep('handover')),false,'接口层同样拒绝带着未处理事件交接');
  eq(await p.evaluate(()=>__MOSS__.engStep('release')),false,'接口层同样拒绝带着未处理事件退出');
  eq((await info()).duty.status,'active','被拒绝后责任仍然在自己名下');
  eq((await info()).safety.status,'failed','被拒绝后未处理事件原样保留');

  /* 处理完之后才能离岗，且离岗不抹安全记录 */
  await restore();
  await toTrial(true);await night();await night();
  eq((await info()).safety.status,'failed','走恢复路线');
  await at('riverbay_pit');
  await clickWin(p,'应急控水：先保农田');
  await clickWin(p,'自行补修（不用材料）');
  await closeWin(p);await night();
  await at('riverbay_pit');await clickWin(p,'隔夜复查销钉');await closeWin(p);
  await night();await at('gauge');await clickWin(p,'复核试运行并签署验收');
  await closeWin(p);await at('gauge');
  await clickWin(p,'结束养护岗位');
  pj=await info();
  eq(pj.duty.status,'released','安全记录处理完后可以离岗');
  eq(pj.safety.route,'recover','离岗不改写也不清空安全记录');
  eq(pj.safety.status,'clear','离岗后安全事件仍留在工程记录里');
  await closeWin(p);await at('gauge');
  eq(await btn('闸门养护检视'),0,'离岗后不再有检视按钮');
  await closeWin(p);

  /* ---------- 六、三种已发生结果，三个人三种说法 ---------- */
  await restore();
  await toTrial(true);
  await at('riverbay_pit');await clickWin(p,'现场检查销钉');await closeWin(p);
  await at('riverbay_pit');await clickWin(p,'自行加固（不用材料）');
  eq((await info()).safety.route,'prevent','预防路线留下 prevent 标记');
  await closeWin(p);
  let d=await p.evaluate(()=>{const M=__MOSS__;return {noya:M.__npcDialogue('water_engineer'),martin:M.__npcDialogue('mill_martin')};});
  eq(d.noya.includes('预警那天就守住'),true,'预防结果：诺娅说的是主动');
  eq(d.martin.includes('在预警期就加固'),true,'预防结果：马丁依据现场加固记录反馈');
  eq(d.noya!==d.martin,true,'预防结果诺娅与马丁说法不同');
  await at('gauge');
  eq((await winText(p)).includes('没人拍桌子'),true,'预防结果：议事屋口径出现在面板里');
  await closeWin(p);

  await restore();
  await toTrial(true);await night();await night();
  await at('riverbay_pit');await clickWin(p,'应急控水：先保通航');await clickWin(p,'自行补修（不用材料）');await closeWin(p);
  await night();await at('riverbay_pit');await clickWin(p,'隔夜复查销钉');
  eq((await info()).safety.route,'recover','恢复路线留下 recover 标记');
  await closeWin(p);
  d=await p.evaluate(()=>{const M=__MOSS__;return {noya:M.__npcDialogue('water_engineer'),martin:M.__npcDialogue('mill_martin')};});
  eq(d.noya.includes('出了事才动'),true,'恢复结果：诺娅说的是流程太晚');
  eq(d.martin.includes('完成隔夜复查'),true,'恢复结果：马丁依据实际补修复查反馈');
  eq(d.noya!==d.martin,true,'恢复结果诺娅与马丁说法不同');
  await at('gauge');
  eq((await winText(p)).includes('贵得多'),true,'恢复结果：议事屋口径出现在面板里');
  await closeWin(p);
  /* 读档后口径不变 */
  await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
  const d2=await p.evaluate(()=>__MOSS__.__npcDialogue('water_engineer'));
  eq(d2.includes('出了事才动'),true,'读档后诺娅仍按已发生的恢复事实说话');
  await at('gauge');
  eq((await winText(p)).includes('贵得多'),true,'读档后议事屋口径不变');
  await closeWin(p);
  /* 没有结果时不硬塞 */
  await restore();
  eq((await p.evaluate(()=>__MOSS__.state.professionalLife.projects.riverbay_gate.safety.route)),'','新档没有已发生的处置');
  eq((await p.evaluate(()=>__MOSS__.engProjectInfo().outcome)),'','无结果时不编造结论');

  /* ---------- 七、坏档与边界 ---------- */
  const norm=await p.evaluate(()=>{const M=__MOSS__;const raw=M.serialize();const q=raw.professionalLife.projects.riverbay_gate;q.phase='accepted';q.duty={status:'weird',cycle:'x',nextDay:'y',done:-3,sinceEval:99,defers:'nope',successor:123};const a=M.normalizeSaveForTest(raw),b=M.normalizeSaveForTest(a);return {duty:a.professionalLife.projects.riverbay_gate.duty,idem:JSON.stringify(a.professionalLife.projects.riverbay_gate.duty)===JSON.stringify(b.professionalLife.projects.riverbay_gate.duty)};});
  eq(norm.duty.status,'none','坏状态压回安全值');
  eq(norm.duty.cycle,3,'坏周期压回默认值');
  eq(norm.duty.done,0,'负数计数压回 0');
  eq(norm.duty.defers,[],'坏延期记录压回空数组');
  eq(norm.duty.successor,'','非字符串继任人压回空串');
  eq(norm.idem,true,'坏档归一化幂等');

  /* 已验收却没有责任记录的旧档（R3-C2 之前）要接回养护循环，而不是永久失去它 */
  const legacyDuty=await p.evaluate(()=>{const M=__MOSS__;const raw=M.serialize();const q=raw.professionalLife.projects.riverbay_gate;q.survey={level:2,day:1,east:'sound',silt:'light'};q.practice='mill';q.scheme='balanced';q.stone=true;q.kit=1;q.build=4;q.mode='self';q.trialDay=18;q.phase='accepted';q.maintDay=20;q.maintCount=2;delete q.duty;delete q.safety;const a=M.normalizeSaveForTest(raw),b=M.normalizeSaveForTest(a);const d=a.professionalLife.projects.riverbay_gate.duty;return {phase:a.professionalLife.projects.riverbay_gate.phase,status:d.status,nextDay:d.nextDay,cycle:d.cycle,done:d.done,idem:JSON.stringify(a.professionalLife.projects.riverbay_gate.duty)===JSON.stringify(b.professionalLife.projects.riverbay_gate.duty)};});
  eq(legacyDuty.phase,'accepted','旧档确实停在已验收');
  eq(legacyDuty.status,'active','已验收旧档接回养护责任');
  eq(legacyDuty.nextDay,20+legacyDuty.cycle,'旧档从最后一次养护日按周期起算');
  eq(legacyDuty.done,0,'旧档迁移不凭空补检视次数');
  eq(legacyDuty.idem,true,'旧档养护迁移幂等');

  /* 远程旧按钮：控制台不能代替现场检视 */
  const remote=await p.evaluate(()=>{const M=__MOSS__;const before=JSON.stringify(M.state.professionalLife.projects.riverbay_gate.duty);const r=M.engRemoteProbe('water');return {unchanged:JSON.stringify(M.state.professionalLife.projects.riverbay_gate.duty)===before,probe:r};});
  eq(remote.unchanged,true,'远程探针不改动养护责任');
  const far=await p.evaluate(()=>__MOSS__.engRemoteProbe('water'));
  eq(far.unchanged,true,'控制室远程点不动现场工序');

  /* 长期离开后逾期与离岗都按真实经过计算 */
  await restore();
  await toTrial(false);await night();await at('gauge');await clickWin(p,'复核试运行并签署验收');await closeWin(p);
  await p.evaluate(()=>{__MOSS__.state.totalDay+=40;});
  await at('gauge');
  const od=await info();
  eq(od.duty.overdue,0,'长期离开本身不记逾期，要等玩家真的补做');
  eq((await winText(p)).includes('逾期 37 天'),true,'长期离开后如实显示逾期天数');
  await clickWin(p,'申请延期一个周期');
  eq((await info()).duty.overdue,1,'逾期后延期仍保留逾期责任');
  eq((await info()).duty.defers[0].lateDays,37,'延期记录保存申请时真实逾期天数');
  const late=await p.evaluate(()=>{const M=__MOSS__,n=M.normalizeSaveForTest(M.serialize());return n.professionalLife.projects.riverbay_gate.duty.defers[0].lateDays;});
  eq(late,37,'读档归一化不抹掉延期前的逾期');
  await closeWin(p);
  eq(r.errors,[],'R3-C2 全流程无页面异常');
}finally{await r.browser.close();}
console.log(`R3岗位与周期养护 ${count} 项通过${single?'（单文件）':''}`);
