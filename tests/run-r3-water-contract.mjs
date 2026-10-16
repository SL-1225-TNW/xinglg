/* R3-D：水利工程验收后河港复检运单。
   已验收工程只作为明确边界夹具；接受合同、备货、实际装运、逾期处理、签收和存档均走真实按钮。
   复用 cargo_manifest 与唯一 port.shipment 货运账，不把原施工石料运单当作本合同。 */
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {launch,boot,clickWin,closeWin} from './harness.mjs';
const single=process.argv.includes('--single-file');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;console.log('PASS',label);};
async function scenario({policy='balanced',late=false}={}){
 const run=await launch(single?{url:pathToFileURL(path.join(root,'苔芽农场-单文件版.html')).href}:{}),p=run.page;
 try{
  await boot(p);await p.locator('#tutorialSkip').click();
  await p.evaluate(policy=>{const M=__MOSS__;M.state.totalDay=10;M.engFixtureAccepted(policy==='irrigation'?'conservative':'balanced');M.state.coins=100;M.state.energy=100;M.state.timeMinutes=480;M.state.inventory={};M.devSwitchScene('port_office',10,6);M.openProfessionSite('port');},policy);
  const button=t=>p.locator('.win button',{hasText:t}).count();
  const data=()=>p.evaluate(()=>JSON.parse(JSON.stringify(__MOSS__.state.professionalLife.port)));
  const q=await data();
  eq(q.riverContract.status,'none','新验收工程合同首次显示为未领取');
  await clickWin(p,'接受河湾闸件复检合同');
  let contract=(await data()).riverContract;
  eq([contract.status,contract.startedDay,contract.dueDay,contract.policy],['active',10,policy==='irrigation'?13:14,policy],'合同交期取实际验收方案');
  eq(await button('逾期处理：申请顺延两天'),0,'未逾期时没有顺延按钮');
  await clickWin(p,'核验封签与装卸簿');
  await clickWin(p,'备一套闸件复检包');
  eq(await p.evaluate(()=>[__MOSS__.state.coins,__MOSS__.state.inventory.sluice_kit]),[85,1],'备货真实扣款并产出一份闸件');
  await clickWin(p,'装运闸件复检包至水利站');
  eq(await p.evaluate(()=>{const s=__MOSS__.state;return [s.professionalLife.port.riverContract.status,s.professionalLife.port.shipment,s.professionalLife.port.settled,s.inventory.sluice_kit||0,s.inventory.cargo_manifest];}),['in_transit','river_contract',false,0,1],'使用共用货运账实际发运且消耗货物');
  if(late){
   const due=(await data()).riverContract.dueDay;
   await p.evaluate(day=>{__MOSS__.state.totalDay=day+1;__MOSS__.openProfessionSite('port');},due);
   eq(await button('逾期处理：申请顺延两天'),1,'逾期后出现一次顺延处理');
   await clickWin(p,'逾期处理：申请顺延两天');
   contract=(await data()).riverContract;
   eq([contract.dueDay,contract.delayUsed,contract.lateDays],[due+2,true,1],'顺延保留既往逾期天数并只使用一次');
   await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
   contract=(await data()).riverContract;
   eq([contract.status,contract.dueDay,contract.delayUsed,contract.lateDays],['in_transit',due+2,true,1],'读档保留运单与顺延历史');
  }
  const before=await p.evaluate(()=>__MOSS__.state.coins);
  await p.evaluate(()=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene('waterworks_control',8,6);__MOSS__.openProfessionSite('water');});
  const deliveryDay=await p.evaluate(()=>__MOSS__.state.totalDay);
  eq(await button('签收闸件复检包'),1,'只有携带在途核验运单时可在水利站签收');
  await clickWin(p,'签收闸件复检包');
  contract=(await data()).riverContract;
  eq([contract.status,contract.completedDay,contract.lateDays],['delivered',deliveryDay,late?1:0],late?'逾期合同完成并保留逾期天数':'按期合同按日签收');
  eq(await p.evaluate(before=>[__MOSS__.state.professionalLife.port.settled,__MOSS__.state.inventory.cargo_manifest||0,__MOSS__.state.coins-before],before),[true,0,late?20:35],'签收结清同一运单并按期／逾期结算一次');
  eq(await button('签收闸件复检包'),0,'重复打开不能重复签收或领款');
  await p.evaluate(()=>{const M=__MOSS__;M.closeWindow();M.devSwitchScene('port_office',10,6);M.state.inventory.grape_juice=2;M.openProfessionSite('port');});
  await clickWin(p,'装运葡萄汁至白鸢医舍');
  eq(await p.evaluate(()=>[__MOSS__.state.professionalLife.port.shipment,__MOSS__.state.professionalLife.port.riverContract.status]),['clinic','delivered'],'同一本运单承接新货后仍保留已完成合同记录');
  await p.evaluate(()=>__MOSS__.saveNow());
  const stable=await p.evaluate(()=>{const raw=JSON.parse(localStorage.getItem('moss-farm-v2'));const a=__MOSS__.normalizeSaveForTest(raw);const b=__MOSS__.normalizeSaveForTest(a);return {a:a.professionalLife.port.riverContract,b:b.professionalLife.port.riverContract,coins:[a.coins,b.coins]};});
  eq(stable.a,stable.b,'合同读档归一化幂等');eq(stable.coins[0],stable.coins[1],'重复归一化不重发合同酬金');
  eq(run.errors,[],'无页面错误');
 }finally{await run.browser.close();}
}
await scenario({policy:'navigation'});
await scenario({policy:'irrigation',late:true});
console.log(`R3-D 河港水利合同 ${checks} 项通过${single?'（单文件版）':''}`);
