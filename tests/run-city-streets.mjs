import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {launch,boot} from './harness.mjs';

// 使用真正的画图函数，记录屋面与烟囱像素，检查四种屋顶都有承托。
const source=fs.readFileSync('game.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');let i=source.indexOf('{',start),depth=1,j=i+1;for(;depth;j++){if(source[j]==='{')depth++;else if(source[j]==='}')depth--;}return source.slice(start,j);}
const context={TILE:16,CFG:{duskStart:1080},state:{timeMinutes:360},Math};vm.createContext(context);
vm.runInContext(['px','drawCityWindow','drawSteppedGable','drawCityBuilding'].map(fn).join('\n'),context);
for(const kind of ['home','shop','workshop','library'])for(let style=0;style<4;style++){
 const pixels=new Map();const g={fillStyle:'',fillRect(x,y,w,h){for(let yy=Math.floor(y);yy<y+h;yy++)for(let xx=Math.floor(x);xx<x+w;xx++)pixels.set(xx+','+yy,this.fillStyle);},fillText(){}};
 context.drawCityBuilding(g,0,0,{w:8,h:4,door:{x:4,y:4},visualHeight:kind==='library'?104:74,kind,facadeStyle:style,label:'测试'});
 const chimney=kind==='workshop'?'#5E6260':'#76584A';
 const body=[...pixels].filter(([,c])=>c===chimney);assert(body.length>0);
 const bottom=Math.max(...body.map(([k])=>+k.split(',')[1]));
 // 烟囱两侧或底部必须接触屋顶/墙体，不能只触到自己。
 const colors=['#765A51','#4E6472','#915D4F','#52657B','#D9CFB8','#C9CBB8','#D9C1A5','#D0D5D1'];
 assert(body.some(([k])=>{const [x,y]=k.split(',').map(Number);return y===bottom&&[[x-1,y],[x+1,y],[x,y+1]].some(([xx,yy])=>colors.includes(pixels.get(xx+','+yy)));}),kind+' roof '+style+' floating chimney');
}
console.log('PASS 16 种屋顶/建筑组合的烟囱连接到屋面');
const {browser,page,errors}=await launch();
try{
 await boot(page);await page.locator('#tutorialSkip').click();
 const audit=await page.evaluate(()=>{
  const m=__MOSS__,city=m.livingInfo().city,bs=city.allBuildings,W=city.w,H=city.h;
  const seen=new Uint8Array(W*H),queue=new Int32Array(W*H);let head=0,tail=1;queue[0]=470*W+320;seen[queue[0]]=1;
  while(head<tail){const p=queue[head++],x=p%W,y=Math.floor(p/W);for(const [nx,ny]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&ny>=0&&nx<W&&ny<H){const q=ny*W+nx;if(!seen[q]&&!m.isSolid('city',nx,ny)){seen[q]=1;queue[tail++]=q;}}}
  return {total:bs.length,disconnected:bs.filter(b=>!seen[(b.door.y+1)*W+b.door.x]).map(b=>b.id),districts:city.districts.map(d=>[d.id,bs.filter(b=>b.district===d.id).length])};
 });
 console.log(JSON.stringify(audit));assert(audit.total>400);assert.deepEqual(audit.disconnected,[]);assert(audit.districts.every(([,n])=>n>=10));
 console.log('PASS 全部街景与可进入建筑的门前都与城门连通，八区均有住宅');
 await page.evaluate(()=>{const m=__MOSS__,b=m.livingInfo().city.allBuildings.find(b=>b.noEnter),s=m.state;s.sceneId='city';s.player={x:b.x+3,y:b.y+2,face:'up'};s.exploration.city=true;m.startGame(s);});
 assert(await page.evaluate(()=>!__MOSS__.isSolid('city',__MOSS__.state.player.x,__MOSS__.state.player.y)));
 console.log('PASS 旧存档落入新建筑时移到可行走格');
 for(const [name,x,y]of [['terraces',125,82],['oldtown',150,216],['market',320,340],['inner-ring',328,200],['riverside',548,242]]){
  await page.evaluate(({x,y})=>{const m=__MOSS__,s=m.state;s.sceneId='city';s.player={x,y,face:'up'};s.exploration.city=true;m.startGame(s);},{x,y});await page.waitForTimeout(250);await page.screenshot({path:'output/playwright/city-'+name+'.png'});
 }
 const interval=await page.evaluate(()=>new Promise(resolve=>{let n=0,sum=0,last=performance.now();function f(t){sum+=t-last;last=t;if(++n<60)requestAnimationFrame(f);else resolve(sum/n);}requestAnimationFrame(f);}));
 assert(interval<60);console.log('密集河岸街区平均帧间隔',interval.toFixed(2),'ms（本机桌面 Chromium）');
 await page.keyboard.press('m');await page.screenshot({path:'output/playwright/city-new-plan.png'});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
