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
  'run-engineering-career.mjs', 'run-engineering-ui.mjs', 'run-r3-project.mjs', 'run-r3-mobile.mjs',
  /* 白蔷薇宫城 P1：布局契约、楼层通行、存档迁移与手机端分层验收 */
  'run-palace-layout.mjs', 'run-palace-save.mjs', 'run-palace-floors.mjs', 'run-palace-mobile.mjs',
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

console.log(failed ? `\n共 ${failed} 项失败。` : '\n两层全部通过。');
process.exit(failed ? 1 : 0);
