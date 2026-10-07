// Auth/REST contract fixture: real browser and vendored SDK, mocked Supabase transport.
// These tests do not claim production SMTP/network verification.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(new URL('../',import.meta.url).pathname);
const server=http.createServer(async(req,res)=>{try{
 const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 const body=await fs.readFile(file.endsWith('/')?file+'index.html':file);
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const saves=new Map(),backups=new Map();let offline=false;
function token(id){return ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');}
function session(email){let id=email.startsWith('a')?a:b;return {access_token:token(id),refresh_token:'refresh-'+id,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id,email,role:'authenticated',aud:'authenticated'}};}
const browser=await chromium.launch({headless:true,...(process.env.MOSS_CHROMIUM?{executablePath:process.env.MOSS_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}: {})});
const errors=[];
async function page(viewport={width:1280,height:860}){
 const context=await browser.newContext({viewport}); const p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/cloud-config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.MOSS_CLOUD_CONFIG={url:'https://mock.supabase.co',publishableKey:'sb_publishable_test'}"}));
 await p.route('https://mock.supabase.co/**',async route=>{
  const request=route.request(),u=new URL(request.url());
  const body=request.postDataJSON();let result={};
  if(offline&&u.pathname.startsWith('/rest'))return route.abort('internetdisconnected');
  if(u.pathname.endsWith('/otp'))result={};
  else if(u.pathname.endsWith('/verify'))result=session(body.email);
  else if(u.pathname.endsWith('/logout'))result={};
  else if(u.pathname.endsWith('/token'))result=session(body.refresh_token.includes(a)?'a@test.com':'b@test.com');
  else if(u.pathname.startsWith('/rest')){
   const jwt=request.headers().authorization?.split(' ')[1];const id=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).sub;
   if(u.pathname.endsWith('/game_saves'))result=saves.has(id)?[saves.get(id)]:[];
   else if(u.pathname.endsWith('/save_backups'))result=backups.get(id)||[];
   else if(u.pathname.endsWith('/commit_game_save')){
    const prior=saves.get(id);
    if(prior?.last_mutation_id===body.p_mutation_id)result={status:'ok',save:prior};
    else if((prior?.revision||0)!==body.p_expected_revision)result={status:'conflict',save:prior||null};
    else {if(prior)backups.set(id,[prior,...(backups.get(id)||[])].slice(0,10));
     const save={user_id:id,slot_id:body.p_slot_id,schema_version:body.p_schema_version,revision:(prior?.revision||0)+1,payload:body.p_payload,updated_at:new Date().toISOString(),last_device_id:body.p_device_id,last_mutation_id:body.p_mutation_id};
     saves.set(id,save);result={status:'ok',save};}
   }
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await p.goto(url);await p.waitForFunction(()=>window.__MOSS__&&!document.querySelector('#bootAccount').disabled);
 return p;
}
async function login(p,email){await p.locator('#bootAccount').click();await p.locator('#accountEmail').fill(email);await p.getByRole('button',{name:'发送验证码',exact:true}).click();await p.getByText('验证码已发送',{exact:false}).waitFor();await p.locator('#accountCode').fill('123456');await p.getByRole('button',{name:'验证并登录',exact:true}).click();await p.waitForFunction(()=>document.querySelector('#accountLabel').textContent.includes('@'));await p.waitForFunction(()=>!document.querySelector('dialog[aria-label="账号与云存档"]').open);}
async function start(p){await p.getByRole('button',{name:'继续游戏',exact:true}).click();await p.waitForFunction(()=>__MOSS__.state&&document.querySelector('#boot').hidden);}
async function logout(p){await p.locator('#btnAccount').click();await p.getByRole('button',{name:'退出登录 / 切换账号',exact:true}).click();await p.waitForFunction(()=>__MOSS__.saves.userId===null&&!__MOSS__.state);}
try{
 const p=await page();await p.getByRole('button',{name:'开始新的游戏',exact:true}).click();
 await p.evaluate(()=>{__MOSS__.state.coins=123;__MOSS__.state.totalDay=3;__MOSS__.saveNow();});
 await p.locator('#btnAccount').click();await p.getByRole('button',{name:'返回游戏',exact:true}).click();
 // Account control is also available during play. Use its stable boot button after explicit switch to boot.
 await p.evaluate(()=>__MOSS__.switchSaveIdentity(null));
 await login(p,'a@test.com');await p.waitForFunction(()=>__MOSS__.saves.read()?.revision>=1);
 assert.equal(saves.get(a).payload.coins,123);assert.equal(await p.evaluate(()=>__MOSS__.state),null);
 await start(p);await logout(p);assert.equal(await p.evaluate(()=>__MOSS__.saves.read().payload.coins),123);
 await login(p,'b@test.com');await p.waitForFunction(()=>__MOSS__.saves.read()?.revision>=1);
 await start(p);await p.evaluate(()=>{__MOSS__.state.coins=222;__MOSS__.saveNow();});await p.evaluate(()=>__MOSS__.coordinator().sync());
 assert.equal(saves.get(b).payload.coins,222);assert.equal(saves.get(a).payload.coins,123);
 await logout(p);await login(p,'a@test.com');await p.locator('#saveConflict').waitFor({state:'visible'});
 await p.getByRole('button',{name:'继续云端存档',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#saveConflict').open);
 await p.reload();await p.waitForFunction(()=>!document.querySelector('#bootAccount').disabled);
 assert.equal(await p.locator('#saveConflict').count(),0,'restored session does not bind guest again');
 await start(p);
 const q=await page({width:390,height:844});await login(q,'a@test.com');await start(q);
 await p.evaluate(()=>{__MOSS__.state.coins=130;__MOSS__.saveNow();});await p.evaluate(()=>__MOSS__.coordinator().sync());
 await q.evaluate(()=>{__MOSS__.state.coins=140;__MOSS__.saveNow();});await q.evaluate(()=>__MOSS__.coordinator().sync());
 await q.locator('#saveConflict').waitFor({state:'visible'});assert.equal(saves.get(a).payload.coins,130);
 assert.equal(await q.evaluate(()=>__MOSS__.saves.read().payload.coins),140);
 await q.getByRole('button',{name:'继续账号本机存档',exact:true}).click();await q.waitForFunction(()=>!document.querySelector('#saveConflict').open);
 assert.equal(saves.get(a).payload.coins,140);
 offline=true;await q.evaluate(()=>{__MOSS__.state.coins=150;__MOSS__.saveNow();});await q.evaluate(()=>__MOSS__.coordinator().sync());
 assert.equal(await q.evaluate(()=>__MOSS__.saves.read().pending),true);
 offline=false;await q.evaluate(()=>__MOSS__.coordinator().sync());assert.equal(saves.get(a).payload.coins,150);
 await q.reload();await q.waitForFunction(()=>!document.querySelector('#bootAccount').disabled);await start(q);assert.equal(await q.evaluate(()=>__MOSS__.state.coins),150);
 await q.screenshot({path:'/tmp/moss-account-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: real SDK email OTP contract, guest binding, A/B switch, restore, mobile, two devices, conflicts, offline recovery, refresh');
}finally{await browser.close();server.close();}
