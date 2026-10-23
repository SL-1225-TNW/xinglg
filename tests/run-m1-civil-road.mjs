/* 民用古道局部门禁回归：到访授权与核验函为已验收前章夹具；真实 E 过门、正式读档。
 * 不证明自然取得前置；自然路线由 run-m1-natural-story 单独覆盖。
 */
import assert from 'node:assert/strict';
import {launch,boot,closeWin} from './harness.mjs';
const single=process.argv.includes('--single-file');
const r=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{}),p=r.page;
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;console.log('PASS',n);};
try{
 await boot(p);await p.locator('#tutorialSkip').click();
 const no=()=>p.evaluate(()=>__MOSS__.extendedGateAllowed('old_road'));
 eq(await no(),false,'无任何前置时古道关闭');
 await p.evaluate(()=>{__MOSS__.storyState().evidence.civil_check={id:'civil_check',title:'核验函',source:'M0 夹具',day:1};});
 eq(await no(),false,'只有核验函仍缺到访资格');
 await p.evaluate(()=>{delete __MOSS__.state.story.evidence.civil_check;});
 await p.evaluate(()=>{__MOSS__.professionalLifeState().passes.visit=true;});
 eq(await no(),false,'只有到访授权仍缺核验函');
 await p.evaluate(()=>{__MOSS__.storyState().evidence.civil_check={id:'civil_check',title:'核验函',source:'M0 已验收夹具',day:1};});
 eq(await no(),true,'到访授权与民用核验函准入古道通行段');
 eq(await p.evaluate(()=>__MOSS__.professionalLifeState().passes.commission),false,'民用通行不颁发接任务授权');
 eq(await p.evaluate(()=>__MOSS__.extendedGateAllowed('border_camp')),false,'民用通行不开放军事营地');
 await p.evaluate(()=>__MOSS__.devSwitchScene('cloud_pass',34,15));
 await p.keyboard.press('ArrowRight');await p.keyboard.press('e');
 await p.getByRole('button',{name:/^前往 /}).click();await p.waitForTimeout(950);
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),'old_road','真实 E 进入民用古道');
 await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq(await p.evaluate(()=>__MOSS__.state.sceneId),'old_road','正式读档不把合法民用来客送回农场');
 eq(await p.evaluate(()=>__MOSS__.professionalLifeState().passes.commission),false,'读档不提升接任务权限');
 eq(r.errors,[],'民用古道无浏览器错误');
 console.log('PASS 民用古道：'+checks+' 项（'+(single?'单文件版':'源码')+'）');
}finally{await r.browser.close();}
