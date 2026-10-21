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
  /* R5-C 有限信用合同：放款不计收入、罚息、违约扣押、一次协商与资金守恒 */
  'run-r5-credit.mjs',
  /* R5-B 有限复核：只接违约扣押争议，证据、时限、一次复核与有限结果 */
  'run-r5-review.mjs',
  /* R5-D 军事权限整理：授权链唯一事实、越权可读拒绝、点名与风险预览、旧档不提权不降权 */
  'run-r5-military.mjs',
  /* R5 自然入口：从 M 地图/真实门口/按 E 走到银行柜台、水利控制室、营地登记点，
     不调用 devOpenService / devSwitchScene / devOpenBorder（审查报告第五节第 3 条） */
  'run-r5-natural-entry.mjs',
  /* R5 触屏：390×844 竖屏 + 触摸输入走完同三条路径（审查报告第五节第 4 条） */
  'run-r5-mobile-touch.mjs',
  /* 第九版第一部主线《长风有归处》· M0 切片：序章九任务、回忆可跳过可回看、
     未修桥的镇内替代演出、证据与选择入库、老档补送信 */
  'run-m0-story.mjs',
  /* 第九版主线 M0 第一幕：城市通行这道门槛、叠图对照、花园接待三段、
     公开/谨慎选择的后果、宫城与旅馆的出发准备 */
  'run-m0-story-city.mjs',
  /* 第九版第一部新地点：白松驿村、白松山径、潮汐港、王都、回声谷共 17 个场景；
     自然入口、门洞进出、十名新增人物、公共传送节点与全境地图标记 */
  'run-ms1-locations.mjs',
  /* 探索线：森林/矿山三道闸门、三层矿洞、采集再生、存档重载与钢制工具，
     脚本内部自带 index.html + 单文件版两轮 */
  'run-exploration.mjs',
  /* 探索线手机端：390×844 竖屏 + 触摸闸门与矿洞渲染 */
  'run-exploration-mobile.mjs',
  'run-south-gate.mjs',
  'run-industry.mjs',
  'run-clinic-construction.mjs',
  'run-construction-completion.mjs',
  'run-construction-saves.mjs',
  'run-v3.mjs', 'run-guide.mjs',
  'run-edge.mjs', 'run-main.mjs', 'run-responsive-layout.mjs',
  /* 界面与手感：快捷栏、窗口、触屏布局与字号 */
  'run-ui.mjs',
  /* 农场手感的修复回归：铲除改种、委托方向指示、分页结算与收成记录 */
  'run-fixes.mjs'
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
run('run-r5-credit-single-file', path.join(here, 'run-r5-credit.mjs'), ['--single-file']);
run('run-r5-review-single-file', path.join(here, 'run-r5-review.mjs'), ['--single-file']);
run('run-r5-military-single-file', path.join(here, 'run-r5-military.mjs'), ['--single-file']);
run('run-r5-natural-entry-single-file', path.join(here, 'run-r5-natural-entry.mjs'), ['--single-file']);
run('run-r5-mobile-touch-single-file', path.join(here, 'run-r5-mobile-touch.mjs'), ['--single-file']);
run('run-m0-story-single-file', path.join(here, 'run-m0-story.mjs'), ['--single-file']);
run('run-m0-story-city-single-file', path.join(here, 'run-m0-story-city.mjs'), ['--single-file']);
run('run-ms1-locations-single-file', path.join(here, 'run-ms1-locations.mjs'), ['--single-file']);
run('run-fixes-single-file', path.join(here, 'run-fixes.mjs'), ['--single-file']);

console.log(failed ? `\n共 ${failed} 项失败。` : '\n两层全部通过。');
process.exit(failed ? 1 : 0);
