import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {launch,boot,walkTo,closeWin,clickWin,winText} from './harness.mjs';
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href}:{}),p=r.page;
async function pose(id,x,y){await p.evaluate(([id,x,y])=>{__MOSS__.closeWindow();__MOSS__.devSwitchScene(id,x,y);},[id,x,y]);await p.waitForTimeout(200);}
async function door(id,to){const s=await p.evaluate(id=>__MOSS__.MAPS[__MOSS__.state.sceneId].doors.find(d=>d.id===id).stand[0],id);eq(await walkTo(p,...s),true,'步行到门 '+id);await p.keyboard.press('e');await p.waitForFunction(to=>__MOSS__.state.sceneId===to,to);await p.waitForTimeout(200);}
try{
 await boot(p);await p.locator('#tutorialSkip').click();await p.evaluate(()=>__MOSS__.professionalLifeState().routes.patrol=1);
 eq(await p.evaluate(()=>{const M=__MOSS__,bad=[];for(const id of ['clinic_ward','clinic_archive','clinic_patient','clinic_cloister']){const m=M.MAPS[id];for(const d of m.doors)for(const s of d.stand)if(!M.findPath(id,m.enter.x,m.enter.y,...s))bad.push(id+'/'+d.id);for(const it of M.INTERACTABLES[id])if(['clinicCare','clinicGuide'].includes(it.kind))for(const s of it.stand)if(!M.findPath(id,m.enter.x,m.enter.y,...s))bad.push(id+'/work');}return bad;}),[],'四处室内门与工作位可达');
 await pose('clinic',12,10);await p.keyboard.press('e');await p.waitForFunction(()=>__MOSS__.state.sceneId==='clinic_ward');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'clinic_ward','原地区医舍入口保留');
 await door('patient','clinic_patient');eq(await walkTo(p,10,14),true,'进病房可步行到床尾记录台');await p.keyboard.press('e');eq((await winText(p)).includes('等待诊疗室'),true,'无病历不能直接照护');await closeWin(p);
 await p.evaluate(()=>{const c=__MOSS__.professionalLifeState().clinic;c.diagnosed=true;c.sampleVerified=true;c.receivedJuice=true;c.medicine=2;__MOSS__.state.inventory={medicine:2};__MOSS__.state.timeMinutes=480;__MOSS__.state.energy=100;});
 await p.keyboard.press('e');await clickWin(p,'照护病人并记录复诊');eq(await p.evaluate(()=>__MOSS__.invCount('medicine')),1,'照护只消耗一个真实药包');
 const due=await p.evaluate(()=>__MOSS__.professionalLifeState().clinic.patientDay);eq(due,await p.evaluate(()=>__MOSS__.state.totalDay+1),'沿用原病历隔夜日期');await clickWin(p,'复诊并更新病历');eq(await p.evaluate(()=>__MOSS__.professionalLifeState().clinic.recovered),false,'当天不可提前复诊');await closeWin(p);
 await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();eq(await p.evaluate(()=>__MOSS__.state.sceneId),'clinic_patient','病房读档留在室内');eq(await p.evaluate(()=>__MOSS__.professionalLifeState().clinic.patientDay),due,'病历读档保留');
 await p.evaluate(()=>{__MOSS__.state.totalDay++;__MOSS__.state.timeMinutes=480;});await p.keyboard.press('e');const trust=await p.evaluate(()=>__MOSS__.professionalLifeState().trust);await clickWin(p,'复诊并更新病历');eq(await p.evaluate(()=>__MOSS__.professionalLifeState().clinic.recovered),true,'次日病房复诊写回原病历');eq(await p.evaluate(()=>__MOSS__.professionalLifeState().trust),trust+1,'原互信仅奖励一次');await closeWin(p);await p.keyboard.press('e');eq((await winText(p)).includes('病历已完成复诊'),true,'重复打开不会重复结算');await closeWin(p);
 await p.screenshot({path:'output/playwright/clinic-patient.png'});await door('main','clinic_ward');await door('main','clinic');await pose('clinic',29,10);await p.keyboard.press('e');await p.waitForFunction(()=>__MOSS__.state.sceneId==='clinic_archive');await door('cloister','clinic_cloister');eq(await walkTo(p,20,11),true,'回廊可达药草说明牌');await p.keyboard.press('e');eq((await winText(p)).includes('尚不产出可采材料'),true,'药草展示说明与实际一致');await closeWin(p);await p.screenshot({path:'output/playwright/clinic-cloister.png'});await door('main','clinic_archive');eq(r.errors,[],'新增房间无页面异常');
}finally{await r.browser.close();}
const m=await launch({viewport:{width:390,height:844},touch:true});try{const p=m.page;await boot(p);await p.locator('#tutorialSkip').tap();await p.evaluate(()=>__MOSS__.professionalLifeState().routes.patrol=1);await p.evaluate(()=>__MOSS__.devSwitchScene('clinic_ward',16,10));await p.waitForTimeout(200);await p.locator('#touchAct').tap();await p.waitForFunction(()=>__MOSS__.state.sceneId==='clinic_patient');eq(await p.evaluate(()=>__MOSS__.state.sceneId),'clinic_patient','手机可从诊疗室进病房');eq(m.errors,[],'手机无页面异常');}finally{await m.browser.close();}
console.log(`医舍建设 ${checks} 项通过${single?'（单文件）':''}`);
