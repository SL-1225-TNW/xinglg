// Run against an actual migrated Supabase project with two freshly verified access tokens.
// Uses an isolated test slot; it never edits the game's primary slot. Prints no tokens.
import assert from 'node:assert/strict';
const {MOSS_SUPABASE_URL:url,MOSS_SUPABASE_PUBLISHABLE_KEY:key,MOSS_TEST_TOKEN_A:a,MOSS_TEST_TOKEN_B:b}=process.env;
if(!url||!key||!a||!b)throw Error('Set URL, public key and two real login access tokens; see docs/cloud-saves.md');
const slot=crypto.randomUUID(),device=crypto.randomUUID();
async function request(token,path,method='GET',body){
 const response=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json().catch(()=>null)};
}
const anon=await fetch(url+'/rest/v1/game_saves?select=*',{headers:{apikey:key}});
assert.ok([401,403].includes(anon.status),'anonymous read must be denied');
const claims=t=>JSON.parse(Buffer.from(t.split('.')[1],'base64url')).sub;
assert.notEqual(claims(a),claims(b),'two distinct real accounts required');
const make=(rev,coins)=>({p_slot_id:slot,p_expected_revision:rev,p_schema_version:2,p_payload:{version:2,totalDay:1,coins},p_device_id:device,p_mutation_id:crypto.randomUUID()});
let first=make(0,100), r=await request(a,'rpc/commit_game_save','POST',first);
assert.equal(r.status,200);assert.equal(r.data.status,'ok');assert.equal(r.data.save.user_id,claims(a));
assert.equal((await request(a,'rpc/commit_game_save','POST',first)).data.save.revision,1);
const cross=await request(b,'game_saves?user_id=eq.'+claims(a)+'&slot_id=eq.'+slot+'&select=*');
assert.deepEqual(cross.data,[],'B cannot read A');
const patch=await request(b,'game_saves?user_id=eq.'+claims(a),'PATCH',{payload:{version:2,coins:999}});
assert.ok([401,403].includes(patch.status),'B cannot write directly');
const race=await Promise.all([request(a,'rpc/commit_game_save','POST',make(1,110)),request(a,'rpc/commit_game_save','POST',make(1,120))]);
assert.deepEqual(race.map(x=>x.data.status).sort(),['conflict','ok']);
const old=await request(a,'save_backups?slot_id=eq.'+slot+'&select=*');assert.equal(old.data.length,1);
assert.deepEqual((await request(b,'save_backups?user_id=eq.'+claims(a)+'&slot_id=eq.'+slot+'&select=*')).data,[]);
console.log('PASS: real Auth JWT/RLS, A/B isolation, anonymous denial, denied direct writes, parallel CAS, idempotency and backups.');
console.log('Isolated acceptance slot (remove through SQL Editor after testing): '+slot);
