import { launch, boot } from "./harness.mjs";
const OUT = "../output/playwright/";
const { browser, page, errors } = await launch();
await boot(page, { fresh: true });
await page.waitForTimeout(400);
async function toFarm(x,y,extra){
  await page.evaluate(([px,py,ex])=>{
    const M=window.__MOSS__;
    const st=JSON.parse(JSON.stringify(M.state));
    st.sceneId="farm"; st.player={x:px,y:py,face:"down"};
    if(ex) Object.assign(st,ex);
    M.startGame(st);
  },[x,y,extra||null]);
  await page.waitForTimeout(1000);
}
await toFarm(27,16,{timeMinutes:10*60, weather:{today:"sun",tomorrow:"sun"}});
const pb = await page.evaluate(()=>{const r=document.getElementById("world").getBoundingClientRect();const s=r.width/384;const c=window.__MOSS__.cam;
  return {x:r.left+(25*16-c.x)*s, y:r.top+(16*16-c.y)*s, width:(7*16)*s, height:(7*16)*s};});
console.log("cam", await page.evaluate(()=>JSON.stringify(window.__MOSS__.cam)), "clip", JSON.stringify(pb));
await page.screenshot({ path: OUT+"v3-evidence-12-pond-zoom.png", clip: pb });
await page.screenshot({ path: OUT+"v3-evidence-11-pond.png" });
await page.evaluate(()=>{ window.__MOSS__.state.timeMinutes=21*60+30; });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT+"v3-evidence-13-pond-night.png" });
await page.evaluate(()=>{ window.__MOSS__.state.timeMinutes=10*60; window.__MOSS__.state.weather={today:"rain",tomorrow:"sun"}; });
await page.waitForTimeout(700);
await page.screenshot({ path: OUT+"v3-evidence-14-pond-rain.png" });
// 顺手查一下室内右侧那个黑方块是什么
await toFarm(3,5);
await page.evaluate(()=>{const s=window.__MOSS__.state;s.sceneId="house";s.player={x:6,y:7,face:"up"};window.__MOSS__.startGame(JSON.parse(JSON.stringify(s)));});
await page.waitForTimeout(900);
const art = await page.evaluate(()=>{
  const g=document.getElementById("world").getContext("2d");
  const c=window.__MOSS__.cam, r=document.getElementById("world").getBoundingClientRect(), s=r.width/384;
  const x=(352)+c.x, y=(232)+c.y;   // 之前观察到的黑块位置（内部坐标约 352,232）
  const d=g.getImageData(340,220,24,24).data;
  const cols={}; for(let i=0;i<d.length;i+=4){const k=d[i]+","+d[i+1]+","+d[i+2];cols[k]=(cols[k]||0)+1;}
  return { cam:c, world:{x:352+c.x, y:232+c.y}, cols: Object.entries(cols).sort((a,b)=>b[1]-a[1]).slice(0,4) };
});
console.log("artifact probe:", JSON.stringify(art));
await page.screenshot({ path: OUT+"v3-evidence-15-artifact-probe.png" });
console.log("errors:", errors);
await browser.close();
