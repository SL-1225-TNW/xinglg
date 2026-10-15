/* 建设规划收尾回归分组；每个子套件单独留日志，便于定位而非重复跑全仓库。 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const group=(process.argv.find(a=>a.startsWith('--group='))||'--group=public').slice(8);
const groups={
 palace:['run-palace-layout.mjs','run-palace-save.mjs','run-palace-floors.mjs','run-palace-mobile.mjs','run-palace-wayfinding.mjs','run-palace-east-wing.mjs','run-palace-service.mjs'],
 public:['run-university.mjs','run-south-gate.mjs','run-industry.mjs','run-clinic-construction.mjs','run-city-services.mjs','run-phase-d-review.mjs'],
 system:['run-indoor-doors.mjs','run-save-invariants.mjs','run-world-map.mjs','run-fast-travel.mjs','run-responsive-layout.mjs','run-r2-personal.mjs','run-r2-mobile.mjs','run-single-file-smoke.mjs']
};
if(!groups[group])throw Error('Unknown group '+group);
fs.mkdirSync('output/construction-review',{recursive:true});const results=[];
for(const file of groups[group]){
 const start=Date.now(),run=spawnSync(process.execPath,[path.join('tests',file)],{encoding:'utf8',maxBuffer:8*1024*1024});
 fs.writeFileSync(path.join('output/construction-review',file+'.log'),(run.stdout||'')+(run.stderr||''));
 const result={file,exit:run.status,seconds:Math.round((Date.now()-start)/1000)};results.push(result);
 console.log(run.status===0?'PASS':'FAIL',file,result.seconds+'s');
 fs.writeFileSync(path.join('output/construction-review',group+'.json'),JSON.stringify(results,null,2));
}
process.exitCode=results.some(r=>r.exit!==0)?1:0;
