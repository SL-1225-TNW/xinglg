/* 统一测试入口：把构建冒烟与完整浏览器流程分层。
 *
 *   node tests/run-ci.mjs            跑两层（包含 CI 套件及历史回归）
 *   node tests/run-ci.mjs --quick    只跑快速层（语法 + 构建 + 浏览器冒烟）
 *   node tests/run-ci.mjs --only=E   只跑名字里含 E 的用例
 *
 * 快速层包含浏览器冒烟，需要安装 Chromium；完整流程放到提交前与 CI 跑。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const quickOnly = process.argv.includes('--quick');

/* 第一层：语法、构建与浏览器冒烟 */
const FAST = [
  { name: '语法：game.js', cmd: ['--check', path.join(here, '..', 'game.js')] },
  { name: '语法：测试脚本', each: fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).map((f) => path.join(here, f)) },
  { name: '构建：单文件版', cmd: ['build-single-file.mjs'] },
  { name: '构建：站点产物', cmd: ['prepare-site.mjs'] },
  { name: '冒烟：单文件可打开', cmd: ['run-single-file-smoke.mjs'] }
];

/* 第二层：真实浏览器流程 */
const BROWSER = [
  'run-r0-character-entry.mjs', 'run-r1-character-growth.mjs', 'run-r1-accounting.mjs', 'run-r1-rookie-routes.mjs', 'run-r1-mobile.mjs',
  'run-r2-personal.mjs', 'run-r2-talents.mjs', 'run-r2-mobile.mjs', 'run-r2-accounting.mjs',
  'run-phase-c-mill.mjs', 'run-phase-c-meadow.mjs', 'run-phase-cde.mjs',
  'run-phase-d-review.mjs', 'run-indoor-weather.mjs', 'run-indoor-doors.mjs',
  'run-v7-stageE-rules.mjs', 'run-v7-stageE-cloudpass.mjs', 'run-v7-stageE-extras.mjs',
  'run-v7-stageB.mjs', 'run-v7-stageB-soil.mjs', 'run-v7-audit-regressions.mjs',
  'run-v7-stageC.mjs', 'run-v7-stageC-heath.mjs', 'run-v7-stageC-interiors.mjs',
  'run-world-map.mjs', 'run-fast-travel.mjs', 'run-save-invariants.mjs', 'run-alt-routes.mjs',
  'run-engineering-career.mjs', 'run-engineering-ui.mjs', 'run-r3-project.mjs', 'run-r3-mobile.mjs', 'run-r3-safety.mjs', 'run-r3-duty.mjs', 'run-r3-duty-mobile.mjs', 'run-r3-legacy-duty.mjs', 'run-r3-water-contract.mjs', 'run-r3-wetland-recheck.mjs', 'run-r3-mill-duty.mjs',
  'run-r4-calendar.mjs',
  'run-r4-farm-care.mjs',
  'run-r4-farm-plan.mjs',
  'run-r4-outwork.mjs',
  'run-r4-season.mjs',
  'run-r4-settlement-aid.mjs',
  'run-r4-legacy-save.mjs',
  'run-r4-mobile.mjs',
  /* 白蔷薇宫城 P1：布局契约、楼层通行、存档迁移与手机端分层验收 */
  'run-palace-layout.mjs', 'run-palace-save.mjs', 'run-palace-floors.mjs', 'run-palace-mobile.mjs', 'run-palace-wayfinding.mjs', 'run-palace-east-wing.mjs', 'run-palace-service.mjs',
  'run-university.mjs',
  /* R5-0 经济止血：票据报价、兑付期限、典当与旧档兼容，源码与单文件版各一轮 */
  'run-r5-finance-safety.mjs',
  /* R5-A 岗位试任期：28 天任期、120 金预算、期末三去向与四处面板同源 */
  'run-r5-post-term.mjs',
  'run-south-gate.mjs',
  'run-industry.mjs',
  'run-clinic-construction.mjs',
  'run-construction-completion.mjs',
  'run-construction-saves.mjs',
  'run-v3.mjs', 'run-guide.mjs',
  'run-edge.mjs', 'run-main.mjs', 'run-responsive-layout.mjs'
].filter((f) => fs.existsSync(path.join(here, f)));

let failed = 0;
const run = (label, file, args = []) => {
  if (only && !label.includes(only) && !file.includes(only)) return;
  process.stdout.write(`\n── ${label}\n`);
  const r = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', cwd: here });
  if (r.status !== 0) { console.error(`✗ ${label} 失败`); failed++; }
  else console.log(`✓ ${label}`);
};

for (const step of FAST) {
  if (only && !step.name.includes(only)) continue;
  process.stdout.write(`\n── 快速层：${step.name}\n`);
  if (step.cmd) {
    const r = spawnSync(process.execPath, step.cmd, { stdio: 'inherit', cwd: here });
    if (r.status !== 0) { console.error(`✗ ${step.name} 失败`); failed++; } else console.log(`✓ ${step.name}`);
  } else if (step.each) {
    for (const f of step.each) {
      const r = spawnSync(process.execPath, ['--check', f], { stdio: 'inherit', cwd: here });
      if (r.status !== 0) { console.error(`✗ 语法失败：${path.basename(f)}`); failed++; }
    }
    if (failed === 0) console.log(`✓ ${step.name}`);
  }
}

if (quickOnly) {
  console.log(failed ? `\n快速层有 ${failed} 项失败。` : '\n快速层全部通过。');
  process.exit(failed ? 1 : 0);
}

for (const f of BROWSER) run(path.basename(f).replace(/\.mjs$/, ''), path.join(here, f));
run('run-r3-water-contract-single-file', path.join(here, 'run-r3-water-contract.mjs'), ['--single-file']);
run('run-r3-wetland-recheck-single-file', path.join(here, 'run-r3-wetland-recheck.mjs'), ['--single-file']);
run('run-r3-mill-duty-single-file', path.join(here, 'run-r3-mill-duty.mjs'), ['--single-file']);
run('run-r4-calendar-single-file', path.join(here, 'run-r4-calendar.mjs'), ['--single-file']);
run('run-r4-farm-care-single-file', path.join(here, 'run-r4-farm-care.mjs'), ['--single-file']);
run('run-r4-farm-plan-single-file', path.join(here, 'run-r4-farm-plan.mjs'), ['--single-file']);
run('run-r4-outwork-single-file', path.join(here, 'run-r4-outwork.mjs'), ['--single-file']);
run('run-r4-season-single-file', path.join(here, 'run-r4-season.mjs'), ['--single-file']);
run('run-r4-settlement-aid-single-file', path.join(here, 'run-r4-settlement-aid.mjs'), ['--single-file']);
run('run-r4-legacy-save-single-file', path.join(here, 'run-r4-legacy-save.mjs'), ['--single-file']);
run('run-r5-finance-safety-single-file', path.join(here, 'run-r5-finance-safety.mjs'), ['--single-file']);
run('run-r5-post-term-single-file', path.join(here, 'run-r5-post-term.mjs'), ['--single-file']);

console.log(failed ? `\n共 ${failed} 项失败。` : '\n两层全部通过。');
process.exit(failed ? 1 : 0);
