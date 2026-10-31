/* 人物生活专项：场景落点、背包、好感和世界日为夹具；交谈、赠礼及事件选择由真实 E/按钮完成。
 * 旧档使用隔离浏览器上下文正式读档；不证明自然入口或实体手机手感。 */
import assert from 'node:assert/strict';
import { launch, boot, closeWin, faceTowards } from './harness.mjs';
const single=process.argv.includes('--single-file');
const {browser,page:p,errors}=await launch(single?{url:new URL('../苔芽农场-单文件版.html',import.meta.url).href}:{});
let checks=0;
function ok(name,cond){assert.ok(cond,name);checks++;console.log('PASS '+name);}
function eq(name,actual,expected){assert.deepEqual(actual,expected,name);checks++;console.log('PASS '+name);}
const people=[
 ['ms1_lena','city_post','strawberry','草莓'],['ms1_iven','ms1_echo_house','field_note','考察笔记'],
 ['ms1_hessa','ms1_pine_inn','epilogue_soup','赫莎的家常热汤'],['ms1_nadine','ms1_tide_clinic','wool','羊毛'],
 ['ms1_vik','ms1_tide_docks','salt_fish','盐渍鲱鱼'],['ms1_ruen','ms1_echo_house','plank','板材'],
 ['ms1_mira','ms1_echo_village','wool','羊毛'],['ms1_aurelle','ms1_capital_office','manuscript','手抄本'],
 ['ms1_beran','ms1_capital_street','field_note','考察笔记'],['ms1_colin','ms1_capital_street','jam','莓果酱'],
 ['ms1_eno','ms1_capital_archive','translation','译稿']
];
async function talk(id,scene){
 await closeWin(p);
 await p.evaluate(sc=>{__MOSS__.state.timeMinutes=480;__MOSS__.devSwitchScene(sc,2,2);},scene);
 await p.waitForTimeout(250);
 for(let attempt=0;attempt<3;attempt++){
  const pos=await p.evaluate(key=>{const n=__MOSS__.npcRuntime[key];return {x:Math.round(n.x),y:Math.round(n.y)};},id);
  for(const [x,y] of [[pos.x,pos.y+1],[pos.x-1,pos.y],[pos.x+1,pos.y],[pos.x,pos.y-1]]){
   if(!await p.evaluate(([sc,x,y])=>!__MOSS__.isSolid(sc,x,y),[scene,x,y]))continue;
   await p.evaluate(([sc,x,y])=>__MOSS__.devSwitchScene(sc,x,y),[scene,x,y]);
   const now=await p.evaluate(key=>{const n=__MOSS__.npcRuntime[key];return {x:Math.round(n.x),y:Math.round(n.y)};},id);
   if(Math.abs(now.x-x)+Math.abs(now.y-y)!==1)break;
   await faceTowards(p,now.x,now.y);await p.keyboard.press('e');await p.waitForTimeout(150);
   if(await p.locator('.dlg-body').count())return;
   await closeWin(p);
  }
 }
 throw Error('无法与 '+id+' 搭话');
}
async function click(name){await p.getByRole('button',{name,exact:true}).click();await p.waitForTimeout(100);}
async function sendGift(name){
 await click('赠送礼物');
 const tile=p.locator('.item').filter({hasText:name}).first();
 await tile.getByRole('button',{name:'赠送 1 个',exact:true}).click();await p.waitForTimeout(120);
}
async function facts(id){return await p.evaluate(id=>{const s=__MOSS__.state;return {friend:s.npcFriendship[id],inventory:structuredClone(s.inventory),exp:s.char.exp,grants:structuredClone(s.char.expGrants||{}),tasks:structuredClone(s.story.tasks),scenes:structuredClone(s.story.scenes)};},id);}
try{
 await boot(p);await p.locator('#tutorialSkip').click().catch(()=>{});
 for(const [id,scene,item,name] of people){
  const exists=await p.evaluate(([id,item])=>({gift:__MOSS__.__isGiftable(item),like:__MOSS__.NPCS[id].like.includes(item),old:__MOSS__.NPCS[id].like.includes('bread')}),[id,item]);
  ok(id+' 偏好物品存在且可赠送',exists.gift&&exists.like);ok(id+' 原有面包偏好保留',exists.old);
  await p.evaluate(([id,item])=>{const s=__MOSS__.state;s.inventory={[item]:2,fish_crucian:2};s.npcFriendship[id]=0;delete s.npcDailyInteractions[id];},[id,item]);
  await talk(id,scene);const before=await facts(id);await sendGift(name);const after=await facts(id);
  eq(id+' 喜欢的礼物扣一件',after.inventory[item],1);eq(id+' 喜欢的礼物好感 +8',after.friend-before.friend,8);
  eq(id+' 赠礼不发经验',after.exp,before.exp);eq(id+' 赠礼不改剧情任务',after.tasks,before.tasks);
  if(id==='ms1_lena'){
   await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
   await talk(id,scene);ok('读档后当日赠礼次数仍受限',await p.getByRole('button',{name:'赠送礼物',exact:true}).count()===0);
  }
  await closeWin(p);await talk(id,scene);ok(id+' 当日不能再次赠礼',await p.getByRole('button',{name:'赠送礼物',exact:true}).count()===0);
  await p.evaluate(()=>{__MOSS__.state.totalDay+=1;});await talk(id,scene);const next=await facts(id);await sendGift('小鲫鱼');const ordinary=await facts(id);
  eq(id+' 普通礼物扣一件',ordinary.inventory.fish_crucian,1);eq(id+' 普通礼物好感 +3',ordinary.friend-next.friend,3);
  if(id==='ms1_lena'){
   await p.evaluate(()=>{__MOSS__.state.totalDay+=1;__MOSS__.state.inventory.stone=2;});await talk(id,scene);
   const dislikeBefore=await facts(id);await sendGift('石头');const dislikeAfter=await facts(id);
   eq('不喜欢的礼物好感 -2',dislikeAfter.friend-dislikeBefore.friend,-2);eq('不喜欢的礼物扣一件',dislikeAfter.inventory.stone,1);
  }
 }
 for(const [id,scene,title,choiceA,choiceB,key] of [
  ['ms1_lena','city_post','挑纸与留白','纹理浅的纸','边角带纹的纸','ms1_rel_lena'],
  ['ms1_iven','ms1_echo_house','两种画法','先画院墙','先画树影','ms1_rel_iven']
 ]){
  await p.evaluate(([id,key])=>{const s=__MOSS__.state;s.npcFriendship[id]=0;delete s.npcDailyInteractions[id];delete s.story.flags[key];delete s.story.choices[key];},[id,key]);
  await talk(id,scene);ok(id+' 低好感显示门槛', (await p.locator('.win-body').innerText()).includes('好感达到 25'));
  ok(id+' 低好感不能进入事件',await p.getByRole('button',{name:'一起 · '+title,exact:true}).count()===0);
  await p.evaluate(id=>{const s=__MOSS__.state;s.npcFriendship[id]=25;delete s.npcDailyInteractions[id];},id);
  await talk(id,scene);await click('一起 · '+title);
  if(id==='ms1_iven')ok('伊文提前到访的事件不披露私人旧事',!(await p.locator('.win-body').innerText()).includes('鲁恩'));
  await click('暂时不参加');
  eq(id+' 稍后不登记完成',await p.evaluate(k=>__MOSS__.state.story.flags[k]||false,key),false);
  await talk(id,scene);await click('一起 · '+title);await click('愿意，看看吧');await closeWin(p);
  eq(id+' 中途关闭不登记完成',await p.evaluate(k=>__MOSS__.state.story.flags[k]||false,key),false);
  for(const [option,value] of [[choiceA,'A'],[choiceB,'B']]){
   await p.evaluate(k=>{delete __MOSS__.state.story.flags[k];delete __MOSS__.state.story.choices[k];},key);
   await talk(id,scene);const before=await facts(id);await click('一起 · '+title);await click('愿意，看看吧');await click(option);
   eq(id+' 选择 '+value+' 完成',await p.evaluate(k=>[__MOSS__.state.story.flags[k],__MOSS__.state.story.choices[k]],key),[true,value]);
   const after=await facts(id);eq(id+' 事件不发经验 '+value,after.exp,before.exp);eq(id+' 事件不发物品 '+value,after.inventory,before.inventory);eq(id+' 事件不改主线 '+value,after.tasks,before.tasks);
   await closeWin(p);await talk(id,scene);await click('回看 · '+title);ok(id+' 回看保留选择 '+value,(await p.locator('.win-body').innerText()).includes(option));
  }
  await closeWin(p);await p.evaluate(()=>__MOSS__.saveNow());await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
  eq(id+' 正式读档保留完成与选择',await p.evaluate(k=>[__MOSS__.state.story.flags[k],__MOSS__.state.story.choices[k]],key),[true,'B']);
 }
 await p.evaluate(()=>{const s=__MOSS__.state;s.story.choices.g02_lena='together';s.story.scenes.S072={seen:true,day:s.totalDay,idx:1};s.npcFriendship.ms1_lena=50;});
 await talk('ms1_lena','house');ok('莱娜会合当天农舍不开放邮局事件',await p.getByRole('button',{name:/挑纸与留白/}).count()===0);
 const old=await p.evaluate(()=>{const v=structuredClone(__MOSS__.serialize());delete v.story.flags.ms1_rel_lena;delete v.story.flags.ms1_rel_iven;delete v.story.choices.ms1_rel_lena;delete v.story.choices.ms1_rel_iven;return v;});
 const ctx=await browser.newContext();const oldPage=await ctx.newPage();oldPage.on('pageerror',e=>errors.push(e.message));
 await oldPage.addInitScript(seed=>{localStorage.setItem('moss-farm-v2',JSON.stringify(seed));},old);await oldPage.goto(p.url());await oldPage.getByRole('button',{name:'继续游戏',exact:true}).click();
 eq('旧档缺事件字段不补造完成',await oldPage.evaluate(()=>[__MOSS__.state.story.flags.ms1_rel_lena||false,__MOSS__.state.story.flags.ms1_rel_iven||false]),[false,false]);await ctx.close();
 ok('无页面错误',errors.length===0);
 console.log('PASS 十一人偏好与两段关系事件'+(single?'（单文件版）':'')+' '+checks+' 项通过');
}finally{await browser.close();}
