import { launch, boot } from "./harness.mjs";
const { browser, page } = await launch();
await boot(page, { fresh: true });
await page.evaluate(()=>{const M=window.__MOSS__;const st=JSON.parse(JSON.stringify(M.state));st.sceneId="house";st.player={x:6,y:7,face:"up"};M.startGame(st);});
await page.waitForTimeout(900);
const art = await page.evaluate(()=>{
  const g=document.getElementById("world").getContext("2d");
  const c=window.__MOSS__.cam;
  const out=[];
  for (const [px,py] of [[348,155],[352,159],[344,151]]) {
    const d=g.getImageData(px,py,20,20).data;
    const cols={}; for(let i=0;i<d.length;i+=4){const k=d[i]+","+d[i+1]+","+d[i+2];cols[k]=(cols[k]||0)+1;}
    out.push({px,py,world:[px+c.x,py+c.y],cols:Object.entries(cols).sort((a,b)=>b[1]-a[1]).slice(0,3)});
  }
  return {cam:c, out, hover: M_hover(), sel: M_sel(), plots: Object.keys(window.__MOSS__.state.plots).length};
  function M_hover(){return JSON.stringify(window.__MOSS__.game.hoverTile);}
  function M_sel(){return JSON.stringify(window.__MOSS__.game.selectTile);}
});
console.log(JSON.stringify(art,null,1));
await browser.close();
