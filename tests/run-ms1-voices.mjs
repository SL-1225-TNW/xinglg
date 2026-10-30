/* 十一人对白回归：devSwitchScene 设置落点，天气、好感及剧情记录为夹具；
 * 交谈由实际 E 键驱动，不证明步行到达、实体迁居或人工体验。 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, faceTowards } from './harness.mjs';

const single = process.argv.includes('--single-file');
const {browser, page: p, errors} = await launch(single ? {url:new URL('../苔芽农场-单文件版.html',import.meta.url).href} : {});
let checks=0;
function ok(name, condition){assert.ok(condition,name);checks++;console.log('PASS '+name);}
const people=[
 ['ms1_lena','city_post','信'],['ms1_iven','ms1_echo_house','水痕'],
 ['ms1_hessa','ms1_pine_inn','炉火'],['ms1_nadine','ms1_tide_clinic','保暖'],
 ['ms1_vik','ms1_tide_docks','缆绳'],['ms1_ruen','ms1_echo_house','木料'],
 ['ms1_mira','ms1_echo_village','被褥'],['ms1_aurelle','ms1_capital_office','等候'],
 ['ms1_beran','ms1_capital_street','排水'],['ms1_colin','ms1_capital_street','棋桌'],
 ['ms1_eno','ms1_capital_archive','书页']
];
async function talk(id,scene){
 await closeWin(p);
 await p.evaluate(sc=>{__MOSS__.state.timeMinutes=480;__MOSS__.devSwitchScene(sc,2,2);},scene);
 await p.waitForTimeout(250);
 for(let attempt=0;attempt<3;attempt++){
  const pos=await p.evaluate(key=>{const n=__MOSS__.__npcRuntime[key];return {x:Math.round(n.x),y:Math.round(n.y)};},id);
  for(const [x,y] of [[pos.x,pos.y+1],[pos.x-1,pos.y],[pos.x+1,pos.y],[pos.x,pos.y-1]]){
   const free=await p.evaluate(([sc,x,y])=>!__MOSS__.isSolid(sc,x,y),[scene,x,y]);
   if(!free)continue;
   await p.evaluate(([sc,x,y])=>__MOSS__.devSwitchScene(sc,x,y),[scene,x,y]);
   const now=await p.evaluate(key=>{const n=__MOSS__.__npcRuntime[key];return {x:Math.round(n.x),y:Math.round(n.y)};},id);
   if(Math.abs(now.x-x)+Math.abs(now.y-y)!==1)break;
   await faceTowards(p,now.x,now.y);await p.keyboard.press('e');await p.waitForTimeout(150);
   if(await p.locator('.dlg-body').count())return await p.locator('.dlg-body').innerText();
   await closeWin(p);
  }
 }
 throw Error('无法与 '+id+' 搭话');
}
try{
 await boot(p);await p.locator('#tutorialSkip').click().catch(()=>{});
 for(const [id,scene,rain] of people){
  await p.evaluate(id=>{const s=__MOSS__.state;s.weather.today='sun';s.npcFriendship[id]=0;delete s.npcDailyInteractions[id];},id);
  let normal=await talk(id,scene);
  ok(id+' 晴天普通对白可见',normal.length>3);
  await p.evaluate(id=>{const s=__MOSS__.state;s.weather.today='rain';delete s.npcDailyInteractions[id];},id);
  let wet=await talk(id,scene);ok(id+' 雨天关注对应生活',wet.includes(rain));
  await p.evaluate(id=>{const s=__MOSS__.state;s.weather.today='sun';s.npcFriendship[id]=25;delete s.npcDailyInteractions[id];},id);
  let heart=await talk(id,scene);ok(id+' 好感对白不同于普通和雨天',heart!==normal&&heart!==wet);
 }
 const mira=['ms1_mira','ms1_echo_village'];
 await p.evaluate(()=>{const s=__MOSS__.state;s.weather.today='sun';s.npcFriendship.ms1_mira=0;delete s.npcDailyInteractions.ms1_mira;s.story.echoChapter.records={};s.story.finaleChapter.records={};});
 let early=await talk(...mira);ok('提前到访不宣告已经安置或替全谷决定',!early.includes('临时房间已经安排好')&&!early.includes('留下是我们自己的选择'));
 await p.evaluate(()=>{__MOSS__.state.story.echoChapter.records.confirm={choice:'listed'};});
 let confirm=await talk(...mira);ok('逐户确认后说明本人想带孩子离开',confirm.includes('我想带孩子走，住处还要落实'));
 await p.evaluate(()=>{__MOSS__.state.story.finaleChapter.records.settlement={choice:'A'};});
 let settled=await talk('ms1_mira','neighbor_border');ok('安置记录后不把就学申请当作入学完成',settled.includes('临时房间已经安排好')&&settled.includes('入学手续还要办'));
 await p.evaluate(()=>{__MOSS__.state.story.epilogueChapter.records.ending={choice:'letter'};});
 let after=await talk('ms1_mira','neighbor_border');ok('后日谈后仍依据安置记录',after.includes('临时房间已经安排好'));
 ok('无页面错误',errors.length===0);
 console.log('PASS 十一人人物对白'+(single?'（单文件版）':'')+' '+checks+' 项通过');
}finally{await browser.close();}
