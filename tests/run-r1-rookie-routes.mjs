// Fresh saves, real movement / interactions. No position, resources, certificates or task facts injected.
import assert from 'node:assert/strict';
import {launch,boot,walkTo,interactWith,closeWin,clickWin,snap} from './harness.mjs';
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;console.log('PASS',label);};
const positions={board:[14,9],workshop:[20,7],shop:[8,7],forest_gate:[14,1],market:[12,13]};
const jobs={
  engineering:[['board','报名公共水泵维修'],['workshop','检查手柄与固定栓'],['board','核对居民用水记录'],['workshop','借用扳手紧固并试水'],['board','提交维修记录并领取报酬']],
  trade:[['board','报名本地货单核验'],['shop','向芽芽核对包裹来源'],['workshop','向阿栎核对收件数量'],['shop','领取已核验的封包'],['workshop','交付封包并取得回执'],['board','提交回执并领取报酬']],
  patrol:[['board','报名林缘安全调查'],['forest_gate','观察林口泥地与车辙'],['market','核对集市居民的见闻'],['forest_gate','系好警示绳并标记安全侧'],['board','提交巡护记录并领取报酬']]
};
async function complete(p,key,reload){
  for(let i=0;i<jobs[key].length;i++){
    const [site,label]=jobs[key][i];
    await closeWin(p);
    ok(await interactWith(p,...positions[site]),key+' 实际到达 '+site);
    if(site==='board')await clickWin(p,'小镇入门');
    await clickWin(p,label);
    ok(await p.evaluate(([k,n])=>__MOSS__.rookieState()[k]===n,[key,i+1]),key+' 完成 '+label);
    if(reload&&i===2){
      await p.reload();await p.locator('.boot-actions button').first().click();
      ok(await p.evaluate(([k,n])=>__MOSS__.rookieState()[k]===n,[key,i+1]),key+' 中途真实读档保留进度');
    }
  }
}
for(const key of Object.keys(jobs)){
  const run=await launch();try{
    const p=run.page;await boot(p);await p.locator('#tutorialSkip').click();
    await p.keyboard.press('j');await clickWin(p,'小镇入门');
    ok(await p.getByRole('button',{name:jobs[key][0][1]+' · 5分钟 / 0体力',exact:true}).isDisabled(),'农场查看任务不能远程报名 '+key);
    await closeWin(p);ok(await walkTo(p,31,10),'从农场自然走向小镇 '+key);
    await p.waitForFunction(()=>__MOSS__.state.sceneId==='town');
    await complete(p,key,true);
    const data=await p.evaluate(()=>({r:__MOSS__.routeInfo(),s:__MOSS__.state.professionalLife,coins:__MOSS__.state.coins,bridge:__MOSS__.state.bridgeRepaired,forest:__MOSS__.state.exploration.forest,char:__MOSS__.charState()}));
    ok(data.r.r[key]===2&&Object.keys(jobs).filter(k=>k!==key).every(k=>data.r.r[k]===0),'独立路线取得到访凭证 '+key);
    ok(data.r.passes.visit&&!data.r.passes.commission&&!data.r.canCommand,'到访不越权到委任或指挥 '+key);
    ok(!data.bridge&&!data.forest&&!data.s.waterworks.certified,'没有借用修桥/森林/工程证书前置 '+key);
    ok(data.coins===75&&data.char.level===2,'实际收入 25 金与 60 经验 '+key);
    await p.screenshot({path:'output/playwright/r1-rookie-'+key+'.png'});
    await p.reload();await p.locator('.boot-actions button').first().click();
    const saved=await p.evaluate(k=>({phase:__MOSS__.rookieState()[k],coins:__MOSS__.state.coins,route:__MOSS__.routeInfo().r[k]}),key);
    ok(saved.phase===jobs[key].length&&saved.coins===75&&saved.route===2,'完成状态、报酬与权限重载不重复 '+key);
    if(key==='engineering'){
      await complete(p,'trade',false);await complete(p,'patrol',false);
      ok(await p.evaluate(()=>__MOSS__.charState().level===3),'正常完成工作自然到 3 级，未注入经验');
      await closeWin(p);await p.keyboard.press('p');
      const body=p.locator('.char-attr').filter({hasText:'健康'});
      for(let n=0;n<3;n++)await body.getByRole('button',{name:/\+1 点/}).click();
      await p.getByRole('button',{name:'天赋',exact:true}).click();
      await p.locator('.char-talent').filter({hasText:'节省力气'}).getByRole('button',{name:'学习（1 点）'}).click();
      ok(await p.evaluate(()=>__MOSS__.hasTalent('save_strength')),'自然升级后的天赋真实点击学习');
      await closeWin(p);ok(await walkTo(p,0,10),'自然返回农场');
      await p.waitForFunction(()=>__MOSS__.state.sceneId==='farm');
      // Choose an untouched, reachable soil tile using read-only world inspection.
      const tile=await p.evaluate(()=>{const m=__MOSS__,a=m.MAPS.farm.plantArea;for(let y=a.y0;y<=a.y1;y++)for(let x=a.x0;x<=a.x1;x++)if(!m.isSolid('farm',x,y)&&!m.state.plots[x+','+y])return[x,y];});
      const {walkAdjacent,clickTile}=await import('./harness.mjs');
      ok(!!await walkAdjacent(p,...tile),'走到真实空地');await p.keyboard.press('1');
      const before=(await snap(p)).energy;await clickTile(p,...tile);
      ok(before-(await snap(p)).energy===1,'自然学习后实际锄地从 2 体力减为 1');
    }
    ok(run.errors.length===0,'浏览器无错误 '+key);
  }finally{await run.browser.close();}
}
console.log('R1 三条自然新档与成长 '+checks+' 项通过');
