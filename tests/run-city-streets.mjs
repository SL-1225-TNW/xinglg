import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {launch,boot} from './harness.mjs';

// 使用真正的画图函数，记录屋面与烟囱像素，检查每个建筑家族的烟囱都落在屋面上。
const source=fs.readFileSync('game.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');let i=source.indexOf('{',start),depth=1,j=i+1;for(;depth;j++){if(source[j]==='{')depth++;else if(source[j]==='}')depth--;}return source.slice(start,j);}
function block(decl){const start=source.indexOf(decl);let i=source.indexOf('{',start),depth=1,j=i+1;for(;depth;j++){if(source[j]==='{')depth++;else if(source[j]==='}')depth--;}return source.slice(start,j);}
const context={TILE:16,CFG:{duskStart:1080},state:{timeMinutes:360},Math};vm.createContext(context);
vm.runInContext(block('var CITY_ARCHETYPES ='),context);
vm.runInContext(['px','drawCityWindow','drawSteppedGable','drawCityBuilding'].map(fn).join('\n'),context);

let drawn=0;
for(const family of Object.keys(context.CITY_ARCHETYPES))for(const arch of context.CITY_ARCHETYPES[family]){
 const pixels=new Map();const g={fillStyle:'',fillRect(x,y,w,h){for(let yy=Math.floor(y);yy<y+h;yy++)for(let xx=Math.floor(x);xx<x+w;xx++)pixels.set(xx+','+yy,this.fillStyle);},fillText(){}};
 context.drawCityBuilding(g,0,0,{w:8,h:4,door:{x:4,y:4},visualHeight:72,kind:'home',archetype:arch,archetypeId:arch.id,label:'测试'});
 drawn++;
 if(!arch.chimney)continue;
 const body=[...pixels].filter(([,c])=>c===arch.edge);assert(body.length>0,family+'/'+arch.id+' 没有画烟囱');
 const bottom=Math.max(...body.map(([k])=>+k.split(',')[1]));
 // 烟囱底部或两侧必须压在同一栋房子的墙体、屋面或女儿墙上，不能悬空。
 assert(body.some(([k])=>{const [x,y]=k.split(',').map(Number);
  return y===bottom&&[[x-1,y],[x+1,y],[x,y+1]].some(([xx,yy])=>{const c=pixels.get(xx+','+yy);return c&&c!==arch.edge;});}),family+'/'+arch.id+' 烟囱悬空');
}
console.log('PASS '+drawn+' 个建筑家族变体：烟囱都落在屋面或墙体上');

// 每个片区只能用自己家族的变体，外观不跨区借用。
for(const family of Object.keys(context.CITY_ARCHETYPES))assert(context.CITY_ARCHETYPES[family].length>=3,family+' 变体不足三种');
console.log('PASS 每个片区家族至少三套结构变体');

const {browser,page,errors}=await launch();
try{
 await boot(page);await page.locator('#tutorialSkip').click();
 const audit=await page.evaluate(()=>{
  const m=__MOSS__,city=m.livingInfo().city,bs=city.allBuildings,W=city.w,H=city.h;
  const seen=new Uint8Array(W*H),queue=new Int32Array(W*H);let head=0,tail=1;queue[0]=470*W+320;seen[queue[0]]=1;
  while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);for(const [nx,ny]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&ny>=0&&nx<W&&ny<H){const q=ny*W+nx;if(!seen[q]&&!m.isSolid('city',nx,ny)){seen[q]=1;queue[tail++]=q;}}}
  const foreign=city.districts.flatMap(d=>{const ids=(city.archetypes[d.family]||[]).map(a=>a.id);return bs.filter(b=>b.districtId===d.id&&ids.indexOf(b.archetypeId)<0).map(b=>d.id+':'+b.id);});
  return {total:bs.length,disconnected:bs.filter(b=>!seen[(b.door.y+1)*W+b.door.x]).map(b=>b.id),foreign,
   districts:city.districts.map(d=>[d.id,bs.filter(b=>b.districtId===d.id).length])};
 });
 console.log(JSON.stringify(audit));assert(audit.total>400);assert.deepEqual(audit.disconnected,[]);assert.deepEqual(audit.foreign,[]);
 // 建成住宅与产业片区要有街道密度；门区是带院场的窄条，公园只有亭子。
 const need={park:1,station:6};
 assert(audit.districts.every(([id,n])=>n>=(need[id]||10)),JSON.stringify(audit.districts));
 console.log('PASS 全部街景与可进入建筑的门前都与城门连通，片区外观不跨区借用，各片区密度达标');
 await page.evaluate(()=>{const m=__MOSS__,b=m.livingInfo().city.allBuildings.find(b=>b.noEnter),s=m.state;s.sceneId='city';s.player={x:b.x+3,y:b.y+2,face:'up'};s.exploration.city=true;m.startGame(s);});
 assert(await page.evaluate(()=>!__MOSS__.isSolid('city',__MOSS__.state.player.x,__MOSS__.state.player.y)));
 console.log('PASS 旧存档落入新建筑时移到可行走格');
 for(const [name,x,y]of [['garden',150,90],['oldtown',150,216],['commerce',330,300],['castle',330,200],['industry',520,390]]){
  await page.evaluate(({x,y})=>{const m=__MOSS__,s=m.state;s.sceneId='city';s.player={x,y,face:'up'};s.exploration.city=true;m.startGame(s);},{x,y});await page.waitForTimeout(250);await page.screenshot({path:'output/playwright/city-'+name+'.png'});
 }
 const interval=await page.evaluate(()=>new Promise(resolve=>{let n=0,sum=0,last=performance.now();function f(t){sum+=t-last;last=t;if(++n<60)requestAnimationFrame(f);else resolve(sum/n);}requestAnimationFrame(f);}));
 assert(interval<60);console.log('密集工业街区平均帧间隔',interval.toFixed(2),'ms（本机桌面 Chromium）');
 await page.keyboard.press('m');await page.screenshot({path:'output/playwright/city-new-plan.png'});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}