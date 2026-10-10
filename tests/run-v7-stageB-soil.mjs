/* Plot fertility is authoritative; zone cards aggregate actual farm data. */
import assert from 'node:assert/strict';import {launch,boot} from './harness.mjs';
let passed=0;const eq=(n,a,b)=>{assert.deepEqual(a,b,n);passed++;console.log('PASS',n);};const run=await launch();
try {
 const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
 eq('新档四区适宜',await p.evaluate(()=>__MOSS__.soilInfo().bands),{z1:'适宜',z2:'适宜',z3:'适宜',z4:'适宜'});
 await p.evaluate(()=>{__MOSS__.state.plots={'7,5':{tilled:true,crop:'potato',age:0,water:true,mature:false,fertility:60,prevGroup:'root'},'8,5':{tilled:true,crop:null,water:false,fertility:20},'15,5':{tilled:true,crop:'radish',age:0,water:true,mature:false,fertility:60,prevGroup:'root'}};});
 eq('同组缓慢下降',await p.evaluate(()=>__MOSS__.devFert.deltaToday(7,5)),-2);eq('轮作回补',await p.evaluate(()=>__MOSS__.devFert.deltaToday(15,5)),1);eq('休耕恢复',await p.evaluate(()=>__MOSS__.devFert.deltaToday(8,5)),3);
 await p.evaluate(()=>{__MOSS__.performSettlement(false);__MOSS__.closeWindow();});
 eq('正常睡眠只结算一次肥力',await p.evaluate(()=>[__MOSS__.state.plots['7,5'].fertility,__MOSS__.state.plots['8,5'].fertility,__MOSS__.state.plots['15,5'].fertility]),[58,23,61]);
 eq('田区汇总真实均值',await p.evaluate(()=>__MOSS__.soilValue('z1')),41);
 await p.evaluate(()=>{__MOSS__.state.plots['7,5'].fertility=5;__MOSS__.state.plots['8,5'].fertility=15;});eq('低肥力显示',await p.evaluate(()=>__MOSS__.soilBand('z1')),'低');
 eq('低肥力保留至少半数产量',await p.evaluate(()=>__MOSS__.devFert.yieldFactor(5)),0.5);
 await p.evaluate(()=>{__MOSS__.state.plots['7,5'].fertility=0;__MOSS__.devFert.applyDaily(7,5);});eq('不会跌破零',await p.evaluate(()=>__MOSS__.state.plots['7,5'].fertility),0);
 await p.keyboard.press('n');eq('田区UI有四行',await p.locator('.soil-row').count(),4);eq('田区UI没有失效文案',(await p.locator('.soil-panel').textContent()).includes('undefined'),false);await p.keyboard.press('Escape');
 await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();eq('读档保留地块肥力',await p.evaluate(()=>[__MOSS__.state.plots['7,5'].fertility,__MOSS__.state.plots['8,5'].fertility]),[0,15]);
 eq('浏览器无错误',run.errors,[]);console.log(`B 地块肥力与汇总 ${passed}/${passed} PASS`);
}finally{await run.browser.close();}
