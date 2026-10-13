import {chromium} from '../../tests/node_modules/playwright/index.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const b=await chromium.launch({headless:true});
try{for(const name of ['palace-masterplan','palace-b1','palace-f1','palace-f2','palace-f3']){
 const p=await b.newPage();await p.setViewportSize({width:name==='palace-masterplan'?960:920,height:name==='palace-masterplan'?830:700});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(here,name+'.svg')).href);await p.evaluate(()=>document.fonts.ready);
 const outside=await p.locator('text').evaluateAll(ts=>{const svg=document.querySelector('svg'),w=svg.viewBox.baseVal.width,h=svg.viewBox.baseVal.height;return ts.filter(t=>{const b=t.getBBox();return b.x<0||b.y<0||b.x+b.width>w||b.y+b.height>h;}).map(t=>t.textContent);});if(outside.length)throw Error('Label outside '+name+': '+outside.join(','));
 await p.screenshot({path:path.join(here,name+'.png')});if(errors.length)throw Error(errors.join('\n'));await p.close();
}}finally{await b.close();}
console.log('Rendered 5 palace diagrams');
