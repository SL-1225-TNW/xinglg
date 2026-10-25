/* 统一测试入口：快速层 + 浏览器层 + 单文件复跑，判据是「可续跑台账」。
 *
 *   node tests/run-ci.mjs                    跑完整两层（配合 --resume 只跑未绿阶段）
 *   node tests/run-ci.mjs --quick            只跑快速层（5 步，每次全跑）
 *   node tests/run-ci.mjs --status           看台账：同 treeHash 绿了多少、心跳、ETA、下一步
 *   node tests/run-ci.mjs --status --json    同上，结构化输出（供脚本/报告用）
 *   node tests/run-ci.mjs --dump-steps       只打印步骤清单与代码树哈希（JSON），给 env-check/文档机检用
 *   node tests/run-ci.mjs --resume           按台账续跑：同 treeHash 已绿的浏览器/单文件步骤跳过
 *   node tests/run-ci.mjs --from=<step-id>   从某一步开始跑（前面已绿的保留在台账里）
 *   node tests/run-ci.mjs --stop-after=N     只跑 N 步就停（验证续跑/分批；末行会写「被 --stop-after 截断」）
 *   node tests/run-ci.mjs --only=<片段>      只跑匹配步骤（过滤模式，永不构成收口判据）
 *   node tests/run-ci.mjs --journal=<路径>   台账路径（默认 output/ci-journal.json）
 *   node tests/run-ci.mjs --no-log           不写聚合日志（默认写 output/ci-run-<tree8>-<时间>.log）
 *   node tests/run-ci.mjs --force            忽略未过期的台账锁（确认没有别的 CI 在跑再用）
 *
 * 通过判据（唯一口径）：
 *   同一 treeHash 的全部阶段在台账里 exit=0（允许跨多次进程累积），末行打印「两层全部通过。」，
 *   进程退出码 0。中断 / 截断 / 过滤都不算通过：退出码 2（未收口），但台账里已完成的部分仍然有效，
 *   下一次 --resume 接着跑。只有台账里真的全绿才打印末行，避免「120/123 无末行」被当通过。
 *
 * 证据落盘：
 *   output/ci-journal.json   台账（按 treeHash 分组；每阶段 exit/items/fails/dur/log）
 *   output/ci-heartbeat.json 心跳（pid/state/当前步骤/updatedAt；进程死了心跳就不再更新）
 *   output/ci-exit.log       最近一次运行的退出记录（每行 key=value）
 *   output/ci-step-logs/     每阶段独立日志（被中断也能看出停在哪一步）
 *   output/ci-journal.lock   运行锁（同时只允许一个 CI，浏览器验收必须串行）
 *
 * 退出码：0=通过；1=有失败；2=未收口（中断/过滤/被截断/台账不完整）；130=被信号打断。
 * 代码树哈希覆盖：game.js、styles.css、index.html、全部 tests/*.mjs、tests/package*.json。
 * 快速层每次全跑（构建+冒烟便宜，且能防「拿旧产物骗过续跑」）；浏览器/单文件层才按台账跳过。
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const OUT_DIR = path.join(ROOT, 'output');

const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const argVal = (name) => {
  const i = argv.findIndex((a) => a === name || a.startsWith(name + '='));
  if (i < 0) return '';
  const a = argv[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
};

const quickOnly = has('--quick');
const resume = has('--resume');
const statusOnly = has('--status');
const jsonOut = has('--json');
const dumpSteps = has('--dump-steps');
const noLog = has('--no-log') || statusOnly || dumpSteps;
const noHeartbeat = has('--no-heartbeat') || statusOnly || dumpSteps;
const force = has('--force');
const fromArg = argVal('--from');
const only = argVal('--only');
const stopAfter = Number(argVal('--stop-after')) || 0;
const journalFile = path.resolve(ROOT, argVal('--journal') || 'output/ci-journal.json');
const heartbeatFile = path.join(OUT_DIR, 'ci-heartbeat.json');
const exitFile = path.join(OUT_DIR, 'ci-exit.log');
const lockFile = path.join(OUT_DIR, 'ci-journal.lock');
const stepLogDir = path.join(OUT_DIR, 'ci-step-logs');
const RUN_STARTED = new Date().toISOString();

/* ---------------- 步骤清单 ---------------- */
const FAST = [
  { id: 'fast/syntax-game', kind: 'fast', name: '语法：game.js', argv: ['--check', path.join(ROOT, 'game.js')] },
  { id: 'fast/syntax-tests', kind: 'fast', name: '语法：测试脚本', checkFiles: true },
  { id: 'fast/build-single-file', kind: 'fast', name: '构建：单文件版', argv: [path.join(here, 'build-single-file.mjs')] },
  { id: 'fast/build-site', kind: 'fast', name: '构建：站点产物', argv: [path.join(here, 'prepare-site.mjs')] },
  { id: 'fast/smoke-single-file', kind: 'fast', name: '冒烟：单文件可打开', argv: [path.join(here, 'run-single-file-smoke.mjs')] }
];

/* 第二层：真实浏览器流程（必须串行） */
const BROWSER_FILES = [
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
  /* R5 自然入口：从 M 地图/真实门口/按 E 走到银行柜台、水利控制室、营地登记点，不注入落点 */
  'run-r5-natural-entry.mjs',
  /* R5 触屏：390×844 竖屏 + 触摸输入走完同三条路径 */
  'run-r5-mobile-touch.mjs',
  /* 第九版第一部主线《长风有归处》· M0 切片：序章九任务、回忆可跳过可回看、未修桥的镇内替代演出 */
  'run-m0-story.mjs',
  /* 第九版主线 M0 第一幕：城市通行门槛、叠图对照、花园接待三段、公开/谨慎选择的后果 */
  'run-m0-story-city.mjs',
  /* 第九版第一部新地点：白松驿村、白松山径、潮汐港、王都、回声谷共 17 个场景 */
  'run-ms1-locations.mjs',
  'run-m1-segment-travel.mjs',
  /* 第九版 M1 前置 P0-2：合法跨封国，四条进入路线各有凭证与缺项清单 */
  'run-m1-cross-border.mjs',
  'run-m1-pine-work.mjs',
  'run-m1-pine-story.mjs',
  'run-m1-tide-story.mjs',
  'run-m1-civil-road.mjs',
  'run-m1-letter-care.mjs',
  'run-m1-natural-story.mjs',
  'run-m2-capital-story.mjs',
  /* 探索线：森林/矿山三道闸门、三层矿洞、采集再生、存档重载与钢制工具，脚本内部自带两轮 */
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

/* 末尾单文件复跑（--single-file） */
const SINGLE_FILES = [
  'run-r3-water-contract.mjs', 'run-r3-wetland-recheck.mjs', 'run-r3-mill-duty.mjs',
  'run-r4-calendar.mjs', 'run-r4-farm-care.mjs', 'run-r4-farm-plan.mjs', 'run-r4-outwork.mjs',
  'run-r4-season.mjs', 'run-r4-settlement-aid.mjs', 'run-r4-legacy-save.mjs',
  'run-r5-finance-safety.mjs', 'run-r5-post-term.mjs', 'run-r5-credit.mjs', 'run-r5-review.mjs',
  'run-r5-military.mjs', 'run-r5-natural-entry.mjs', 'run-r5-mobile-touch.mjs',
  'run-m0-story.mjs', 'run-m0-story-city.mjs', 'run-ms1-locations.mjs',
  'run-m1-segment-travel.mjs', 'run-m1-cross-border.mjs', 'run-m1-pine-work.mjs',
  'run-m1-pine-story.mjs', 'run-m1-tide-story.mjs', 'run-m1-civil-road.mjs',
  'run-m1-letter-care.mjs', 'run-m1-natural-story.mjs', 'run-m2-capital-story.mjs',
  'run-fixes.mjs'
];

const slug = (id) => id.replace(/[/\\]/g, '-').replace(/[^A-Za-z0-9_.-]/g, '_');
const BROWSER = BROWSER_FILES.map((f) => ({
  id: 'browser/' + path.basename(f, '.mjs'), kind: 'browser', name: path.basename(f, '.mjs'),
  argv: [path.join(here, f)]
}));
const SINGLE = SINGLE_FILES.map((f) => ({
  id: 'single/' + path.basename(f, '.mjs'), kind: 'single', name: path.basename(f, '.mjs') + '-single-file',
  argv: [path.join(here, f), '--single-file']
}));
const STEPS = [...FAST, ...BROWSER, ...SINGLE];
const KIND_LABEL = { fast: '快速层', browser: '浏览器层', single: '单文件复跑' };
const TOTALS = { all: STEPS.length, fast: FAST.length, browser: BROWSER.length, single: SINGLE.length };

/* ---------------- 小工具 ---------------- */
const nowIso = () => new Date().toISOString();
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const fmtDur = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒` : `${(ms / 1000).toFixed(1)} 秒`);
const fmtClock = (iso) => {
  if (!iso) return '?';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '?';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function writeJsonAtomic(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function writeTextAtomic(file, text) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}
function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
/* 取 git 信息的两种模式：受限沙箱禁命名管道（spawn + pipe 会 EPERM），所以默认走临时文件描述符。 */
function gitText(args) {
  ensureDir(OUT_DIR);
  const tmp = path.join(OUT_DIR, `.git-read-${process.pid}-${Math.random().toString(16).slice(2)}.txt`);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w');
    const r = spawnSync('git', args, { cwd: ROOT, stdio: ['ignore', fd, 'ignore'], windowsHide: true });
    fs.closeSync(fd);
    fd = null;
    if (r.status !== 0) return '';
    return fs.readFileSync(tmp, 'utf8').trim();
  } catch { return ''; }
  finally {
    if (fd != null) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tmp); } catch {}
  }
}

/* 当前进程能否给子进程接管道。沙箱下 spawn 会同步抛 EPERM，此时改用文件描述符直写（不经命名管道）。 */
function detectPipes() {
  try {
    const r = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return !r.error;
  } catch { return false; }
}

/* 代码树哈希：只覆盖会影响验收结果的输入（源码 + 全部测试脚本 + 测试依赖声明）。
 * 单文件产物由构建步骤从源码确定性生成，故不入哈希；快速层每次重跑构建，防旧产物骗过续跑。 */
function computeTree() {
  const rootFiles = ['game.js', 'styles.css', 'index.html'].map((f) => path.join(ROOT, f));
  const testFiles = fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).sort().map((f) => path.join(here, f));
  for (const extra of ['package.json', 'package-lock.json']) {
    const p = path.join(here, extra);
    if (fs.existsSync(p)) testFiles.push(p);
  }
  const all = [...rootFiles, ...testFiles].filter((p) => fs.existsSync(p));
  const hash = crypto.createHash('sha256');
  const files = [];
  for (const file of all) {
    const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const r = rel(file);
    files.push({ path: r, sha });
    hash.update(r + '\0' + sha + '\n');
  }
  const gitHead = gitText(['rev-parse', 'HEAD']);
  const dirtyTxt = gitText(['status', '--porcelain', '--', 'game.js', 'styles.css', 'index.html', '苔芽农场-单文件版.html', 'tests']);
  return { hash: hash.digest('hex'), gitHead, dirty: dirtyTxt.length > 0, files: files.length, list: files };
}

/* ---------------- 运行期状态 ---------------- */
let TREE = null;
let PIPE_OK = true;
let logFd = null;
let runLogRel = '';
let currentChild = null;
let interrupted = false;
const hbState = { state: 'running', step: null, done: 0, skipped: 0 };

function writeHeartbeat(state, extra = {}) {
  if (noHeartbeat || !TREE) return;
  hbState.state = state;
  writeJsonAtomic(heartbeatFile, {
    pid: process.pid,
    state,
    treeHash: TREE.hash,
    startedAt: RUN_STARTED,
    updatedAt: nowIso(),
    step: hbState.step,
    done: hbState.done,
    skipped: hbState.skipped,
    journal: rel(journalFile),
    log: runLogRel,
    ...extra
  });
}

/* ---------------- 台账 ---------------- */
function loadJournal() {
  const j = readJson(journalFile);
  if (j && j.version === 1 && j.trees && typeof j.trees === 'object') return j;
  return { version: 1, updatedAt: nowIso(), trees: {}, lastRun: null };
}

function saveJournal(j) {
  j.updatedAt = nowIso();
  const hashes = Object.keys(j.trees).sort((a, b) => String(j.trees[b].updatedAt || '').localeCompare(String(j.trees[a].updatedAt || '')));
  for (const h of hashes.slice(20)) delete j.trees[h];
  writeJsonAtomic(journalFile, j);
}

function treeEntry(j) {
  let t = j.trees[TREE.hash];
  if (!t) {
    t = { treeHash: TREE.hash, gitHead: TREE.gitHead, dirty: TREE.dirty, createdAt: nowIso(), updatedAt: nowIso(), steps: {} };
    j.trees[TREE.hash] = t;
  }
  t.gitHead = TREE.gitHead;
  t.dirty = TREE.dirty;
  return t;
}

function gateStatus(j, expected) {
  const steps = (j.trees[TREE.hash] && j.trees[TREE.hash].steps) || {};
  const green = [];
  const failed = [];
  const pending = [];
  for (const s of expected) {
    const e = steps[s.id];
    if (!e) pending.push(s);
    else if (e.exit === 0 && e.status === 'pass') green.push(s);
    else failed.push(s);
  }
  return { total: expected.length, green, failed, pending };
}

/* ---------------- 运行锁 ---------------- */
function acquireLock() {
  ensureDir(OUT_DIR);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: RUN_STARTED, treeHash: TREE ? TREE.hash : '' }));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const info = readJson(lockFile) || {};
      const alive = isAlive(info.pid);
      const age = info.startedAt ? Date.now() - Date.parse(info.startedAt) : Infinity;
      const stale = !alive || age > 6 * 3600 * 1000;
      if (force || stale) { try { fs.unlinkSync(lockFile); } catch {} continue; }
      return false;
    }
  }
  return false;
}

function releaseLock() {
  try {
    const info = readJson(lockFile);
    if (info && info.pid === process.pid) fs.unlinkSync(lockFile);
  } catch {}
}

function killTree(pid) {
  if (!pid) return;
  try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}

/* ---------------- 一步一步跑 ---------------- */
function runStep(step, displayIndex, displayTotal) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const t0 = Date.now();
    ensureDir(stepLogDir);
    const logPath = path.join(stepLogDir, `${String(displayIndex + 1).padStart(4, '0')}-${slug(step.id)}.log`);
    let stepFd = null;
    try { stepFd = fs.openSync(logPath, 'w'); } catch {}

    const decoder = new StringDecoder('utf8');
    let lineBuf = '';
    let items = null;
    let fails = null;
    let passLines = 0;

    const parseLine = (line) => {
      if (/^PASS /.test(line)) passLines++;
      const m1 = line.match(/通过\s*(\d+)\s*项[，,]\s*失败\s*(\d+)\s*项/);
      if (m1) { items = Number(m1[1]); fails = Number(m1[2]); }
      const m2 = line.match(/(\d+)\s*项通过/);
      if (m2) items = Number(m2[1]);
      const m3 = line.match(/失败\s*(\d+)\s*项/);
      if (m3 && !m1) fails = Math.max(fails ?? 0, Number(m3[1]));
      if (fails == null && /失败\s*0\s*项/.test(line)) fails = 0;
    };

    // 管道模式：父进程实时转发，同时写步骤日志与聚合日志
    const feed = (buf, isErr) => {
      if (stepFd != null) { try { fs.writeSync(stepFd, buf); } catch {} }
      if (isErr) { try { process.stderr.write(buf); } catch {} } else { try { process.stdout.write(buf); } catch {} }
      if (logFd != null) { try { fs.writeSync(logFd, buf); } catch {} }
      lineBuf += decoder.write(buf);
      let i;
      while ((i = lineBuf.indexOf('\n')) >= 0) { parseLine(lineBuf.slice(0, i)); lineBuf = lineBuf.slice(i + 1); }
    };

    let finished = false;
    let stepClosed = false;
    const closeStepLog = () => {
      if (stepClosed) return;
      stepClosed = true;
      if (stepFd != null) { try { fs.closeSync(stepFd); } catch {} }
    };
    const finish = (exit, signal) => {
      if (finished) return;
      finished = true;
      if (PIPE_OK) { lineBuf += decoder.end(); if (lineBuf) parseLine(lineBuf); }
      closeStepLog();
      const ok = exit === 0 && !signal;
      resolve({
        id: step.id, kind: step.kind, name: step.name,
        exit: exit == null ? 1 : exit,
        status: ok ? 'pass' : (signal && interrupted ? 'interrupted' : 'fail'),
        items: items ?? (passLines || null),
        fails: fails ?? (ok ? 0 : 1),
        durMs: Date.now() - t0, startedAt, finishedAt: nowIso(),
        log: rel(logPath), treeHash: TREE.hash,
        signal: signal || null
      });
    };

    // 文件描述符模式：子进程直接写步骤日志（不经命名管道）。跑完后读回解析、
    // 追加到聚合日志、回显尾部若干行——否则受限环境下长套件在会话里看不到任何输出。
    const harvest = (exit, signal) => {
      closeStepLog();
      let text = '';
      try { text = fs.readFileSync(logPath, 'utf8'); } catch {}
      if (text) {
        if (logFd != null) { try { fs.writeSync(logFd, text); } catch {} }
        for (const line of text.split(/\r?\n/)) parseLine(line);
        const tail = text.replace(/\s+$/, '').split(/\r?\n/).slice(-12);
        if (tail && tail[0] !== undefined) {
          try { process.stdout.write(tail.map((l) => '    ' + l).join('\n') + '\n'); } catch {}
        }
      }
      finish(exit, signal);
    };

    const runOne = (nodeArgs) => new Promise((res) => {
      let child = null;
      if (PIPE_OK) {
        try {
          child = spawn(process.execPath, nodeArgs, { cwd: here, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        } catch { child = null; }
        if (child) {
          currentChild = child;
          child.stdout.on('data', (b) => feed(b, false));
          child.stderr.on('data', (b) => feed(b, true));
          child.on('error', (e) => feed(Buffer.from(`! 启动失败 ${path.basename(nodeArgs[0])}：${e.message}\n`), true));
          child.on('close', (code, signal) => { currentChild = null; res({ code, signal }); });
          return;
        }
      }
      const out = stepFd != null ? stepFd : 'ignore';
      try {
        child = spawn(process.execPath, nodeArgs, { cwd: here, stdio: ['ignore', out, out], windowsHide: true });
      } catch {
        try { child = spawn(process.execPath, nodeArgs, { cwd: here, stdio: 'inherit', windowsHide: true }); }
        catch (e2) {
          try { fs.writeSync(stepFd, `! 无法启动 ${path.basename(nodeArgs[0])}：${e2.message}\n`); } catch {}
          res({ code: 1, signal: null });
          return;
        }
      }
      currentChild = child;
      child.on('error', (e) => { try { fs.writeSync(stepFd, `! 启动失败 ${path.basename(nodeArgs[0])}：${e.message}\n`); } catch {} });
      child.on('close', (code, signal) => { currentChild = null; res({ code, signal }); });
    });

    if (step.checkFiles) {
      const files = fs.readdirSync(here).filter((f) => f.endsWith('.mjs')).sort().map((f) => path.join(here, f));
      let failedFiles = 0;
      (async () => {
        for (const f of files) {
          const r = await runOne(['--check', f]);
          if (r.code !== 0) {
            failedFiles++;
            try { fs.writeSync(stepFd, `✗ 语法失败：${path.basename(f)}\n`); } catch {}
          }
        }
        items = files.length;
        fails = failedFiles;
        if (PIPE_OK) finish(failedFiles === 0 ? 0 : 1, null);
        else harvest(failedFiles === 0 ? 0 : 1, null);
      })();
      return;
    }

    runOne(step.argv).then(({ code, signal }) => {
      if (PIPE_OK) finish(code, signal);
      else harvest(code, signal);
    });
  });
}

function isGreen(j, step) {
  const t = j.trees[TREE.hash];
  const e = t && t.steps && t.steps[step.id];
  return !!(e && e.exit === 0 && e.status === 'pass');
}

/* ---------------- --status ---------------- */
function statusReport() {
  const tree = computeTree();
  const j = loadJournal();
  const t = j.trees[tree.hash];
  const steps = (t && t.steps) || {};
  const gate = {
    total: STEPS.length,
    green: STEPS.filter((s) => steps[s.id] && steps[s.id].exit === 0).length,
    failed: STEPS.filter((s) => steps[s.id] && steps[s.id].exit !== 0).map((s) => s.id),
    pending: STEPS.filter((s) => !steps[s.id]).map((s) => s.id)
  };
  const quickGreen = FAST.filter((s) => steps[s.id] && steps[s.id].exit === 0).length;

  const hb = readJson(heartbeatFile);
  let heartbeat = { present: false, file: rel(heartbeatFile) };
  if (hb) {
    const alive = isAlive(hb.pid);
    const ageSec = Math.max(0, Math.round((Date.now() - Date.parse(hb.updatedAt || 0)) / 1000));
    const fresh = ageSec <= 180;
    heartbeat = {
      present: true, file: rel(heartbeatFile), pid: hb.pid, state: hb.state, alive, ageSec, fresh,
      step: hb.step || null, done: hb.done, treeHash: hb.treeHash, log: hb.log,
      verdict: alive && fresh ? 'running'
        : (!alive && hb.state === 'running') ? 'interrupted-process-dead'
        : (alive && !fresh) ? 'suspicious-heartbeat-stale-process-alive'
        : 'finished'
    };
  }
  const lastExit = (() => {
    try {
      const o = {};
      for (const line of fs.readFileSync(exitFile, 'utf8').split('\n')) { const i = line.indexOf('='); if (i > 0) o[line.slice(0, i)] = line.slice(i + 1); }
      return o;
    } catch { return null; }
  })();
  let etaSec = null;
  if (t) {
    /* ETA 分三步：已知同名步骤的真实耗时为王；已知超长套件用经验值兜底；其余按层给经验值。
       不能只拿「已完成阶段的平均耗时」，否则先跑的几条 2 秒套件会把 ETA 算成 4 分钟。 */
    const HEAVY = { 'browser/run-m1-natural-story': 1600, 'single/run-m1-natural-story': 1600 };
    const KIND_DEFAULT_SEC = { fast: 8, browser: 14, single: 14 };
    const known = new Map();
    for (const tree of Object.values(j.trees || {})) {
      for (const [id, rec] of Object.entries((tree && tree.steps) || {})) {
        if (rec && rec.durMs > 0) known.set(id, rec.durMs / 1000);
      }
    }
    let sec = 0;
    for (const id of gate.pending) {
      const step = STEPS.find((x) => x.id === id);
      if (HEAVY[id]) { sec += HEAVY[id]; continue; }
      const k = known.get(id);
      if (k && k > 0) { sec += Math.min(k, 300); continue; }
      sec += KIND_DEFAULT_SEC[step ? step.kind : 'browser'] || 14;
    }
    etaSec = Math.round(sec);
  }
  return {
    journal: rel(journalFile), journalExists: fs.existsSync(journalFile), journalUpdatedAt: j.updatedAt,
    tree: { hash: tree.hash, short: tree.hash.slice(0, 12), gitHead: tree.gitHead, dirty: tree.dirty, files: tree.files },
    gate, quick: { total: FAST.length, green: quickGreen },
    heartbeat, lastExit, etaSec, next: gate.pending[0] || null
  };
}

function printStatus(report) {
  if (jsonOut) { console.log(JSON.stringify(report, null, 2)); return; }
  const L = [];
  const g = report.gate;
  const h = report.heartbeat;
  L.push('=== CI 台账状态 ===');
  L.push(report.journalExists
    ? `台账：${report.journal}（更新 ${fmtClock(report.journalUpdatedAt)}）`
    : `台账：${report.journal} 不存在（还没跑过，或换了 --journal 路径）`);
  L.push(`当前代码树：${report.tree.short}（HEAD ${report.tree.gitHead || '?'}，未提交改动：${report.tree.dirty ? '有' : '无'}，参与哈希文件 ${report.tree.files}）`);
  L.push(`同树进度：${g.green}/${g.total} 绿 · ${g.failed.length} 失败 · ${g.pending.length} 未跑｜快速层 ${report.quick.green}/${report.quick.total}`);
  if (!h.present) L.push('心跳：无（还没跑过，或 output/ci-heartbeat.json 被删）');
  else {
    const st = h.step ? `${h.step.id}（${h.step.index}/${h.step.total}）` : '无当前步骤';
    const age = h.ageSec >= 60 ? `${Math.round(h.ageSec / 60)} 分钟前` : `${h.ageSec} 秒前`;
    if (h.verdict === 'running') L.push(`心跳：${age}，pid ${h.pid} 存活 · 正在跑 ${st} · 本进程已完成 ${h.done} 步`);
    else if (h.verdict === 'interrupted-process-dead') L.push(`心跳：${age}，pid ${h.pid} 已不在 —— ⚠ 上次运行被中断在 ${st}；台账里已完成的阶段仍有效，用 --resume 续跑`);
    else if (h.verdict === 'suspicious-heartbeat-stale-process-alive') L.push(`心跳：${age}，pid ${h.pid} 仍存活但心跳停更 —— ⚠ 可能卡死，先看日志 ${h.log || ''}`);
    else L.push(`心跳：${age}，state=${h.state}，pid ${h.pid} ${h.alive ? '存活' : '已退出'}`);
  }
  if (report.lastExit) L.push(`最近退出：exit=${report.lastExit.exit}，complete=${report.lastExit.complete}，mode=${report.lastExit.mode || '?'}，日志 ${report.lastExit.log || '?'}`);
  if (report.etaSec != null && g.pending.length) L.push(`ETA（粗估，随已完成阶段更新）：约 ${Math.ceil(report.etaSec / 60)} 分钟`);
  if (report.next) L.push(`下一步：${report.next}`);
  if (g.failed.length) L.push(`失败：${g.failed.slice(0, 8).join('、')}${g.failed.length > 8 ? ' 等' : ''}`);
  if (g.pending.length) L.push(`未跑前 5：${g.pending.slice(0, 5).join('、')}`);
  L.push('');
  L.push(g.green === g.total ? '结论：同 treeHash 台账全绿；仍需末行「两层全部通过。」与退出码 0 才算已验收。'
    : g.failed.length ? '结论：有失败，先修产品或断言；重跑不会把失败的阶段变成通过。'
    : '结论：未收口。用 --resume 续跑（可跨多次进程），不要从头重跑。');
  console.log(L.join('\n'));
}

/* ---------------- 主流程 ---------------- */
async function main() {
  ensureDir(OUT_DIR);

  if (statusOnly) { printStatus(statusReport()); return 0; }

  TREE = computeTree();

  if (dumpSteps) {
    console.log(JSON.stringify({
      steps: STEPS.map((s) => ({ id: s.id, kind: s.kind, name: s.name, argv: (s.argv || []).map(rel), checkFiles: !!s.checkFiles })),
      totals: TOTALS,
      tree: { hash: TREE.hash, gitHead: TREE.gitHead, dirty: TREE.dirty, files: TREE.files },
      journal: rel(journalFile), heartbeat: rel(heartbeatFile)
    }, null, 2));
    return 0;
  }

  PIPE_OK = detectPipes();

  if (!acquireLock()) {
    const info = readJson(lockFile) || {};
    console.error(`✗ 另一个 CI 正在跑（pid ${info.pid}，开始于 ${info.startedAt}）。浏览器验收必须串行。`);
    console.error('  只观察：node tests/run-ci.mjs --status');
    console.error('  确认它已经死了再重跑：node tests/run-ci.mjs --force --resume');
    return 2;
  }

  const journal = loadJournal();
  const t = treeEntry(journal);

  // 选择本次要跑的步骤
  let planned = quickOnly ? FAST : STEPS;
  if (only) planned = planned.filter((s) => s.id.includes(only) || s.name.includes(only) || (s.file || '').includes(only));
  if (fromArg) {
    const idx = planned.findIndex((s) => s.id === fromArg || s.id.includes(fromArg) || s.name.includes(fromArg));
    if (idx >= 0) planned = planned.slice(idx);
    else { console.error(`! --from=${fromArg} 没有匹配步骤，按原计划运行`); }
  }
  if (!planned.length) {
    console.error('✗ 过滤条件没有匹配任何步骤（检查 --only / --from 拼写）');
    releaseLock();
    return 2;
  }

  const expected = only ? null : (quickOnly ? FAST : STEPS);
  const plannedTotal = planned.length;
  let executed = 0;
  let skipped = 0;
  let failures = 0;
  let stoppedByLimit = false;
  const skippedIds = [];

  if (!noLog) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const runLogPath = path.join(OUT_DIR, `ci-run-${TREE.hash.slice(0, 8)}-${stamp}.log`);
    try { logFd = fs.openSync(runLogPath, 'w'); } catch {}
    runLogRel = rel(runLogPath);
  }

  const say = (line) => {
    const buf = Buffer.from(line + '\n');
    try { process.stdout.write(buf); } catch {}
    if (logFd != null) { try { fs.writeSync(logFd, buf); } catch {} }
  };

  say('=== 苔芽农场 CI 台账 ===');
  say(`台账：${rel(journalFile)}`);
  say(`代码树：${TREE.hash.slice(0, 12)}（HEAD ${TREE.gitHead || '?'}，未提交改动：${TREE.dirty ? '有' : '无'}，参与哈希文件 ${TREE.files}）`);
  say(`计划：${TOTALS.all} 步（快速 ${TOTALS.fast} · 浏览器 ${TOTALS.browser} · 单文件 ${TOTALS.single}）｜本次运行 ${plannedTotal} 步${resume ? '（--resume：同树已绿的浏览器/单文件步骤跳过；快速层仍全跑）' : ''}`);
  if (runLogRel) say(`聚合日志：${runLogRel}`);
  say(`输出模式：${PIPE_OK ? '管道（子进程输出实时回显并落盘）' : '文件描述符（受限沙箱禁命名管道；每步完成后回显尾部，完整输出在步骤日志）'}`);
  say('');

  writeHeartbeat('running');
  const hbTimer = setInterval(() => { if (hbState.state === 'running') writeHeartbeat('running'); }, 15000);
  if (hbTimer.unref) hbTimer.unref();
  const onSignal = () => { interrupted = true; if (currentChild) killTree(currentChild.pid); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('SIGBREAK', onSignal);

  for (let i = 0; i < planned.length; i++) {
    const step = planned[i];
    if (interrupted) break;
    if (stopAfter && executed >= stopAfter) { stoppedByLimit = true; break; }

    if (resume && step.kind !== 'fast' && isGreen(journal, step)) {
      skipped++;
      skippedIds.push(step.id);
      say(`↷ 跳过（台账已绿）：${step.id}`);
      hbState.skipped = skipped;
      writeHeartbeat('running');
      continue;
    }

    say(`── [${executed + 1}/${plannedTotal}] ${KIND_LABEL[step.kind]}：${step.name}`);
    hbState.step = { id: step.id, kind: step.kind, index: executed + 1, total: plannedTotal, startedAt: nowIso() };
    hbState.done = executed;
    writeHeartbeat('running');

    const rec = await runStep(step, executed, plannedTotal);
    executed++;
    hbState.done = executed;
    hbState.step = null;
    t.steps[rec.id] = rec;
    t.updatedAt = nowIso();
    saveJournal(journal);

    if (rec.status === 'pass') say(`✓ ${step.name}（${fmtDur(rec.durMs)}${rec.items != null ? `，${rec.items} 项` : ''}）`);
    else if (rec.status === 'interrupted') say(`⚠ 中断在 ${step.name}（${fmtDur(rec.durMs)}；该阶段记为 interrupted，--resume 会重跑它）`);
    else { failures++; say(`✗ ${step.name} 失败（exit=${rec.exit}${rec.signal ? `，signal=${rec.signal}` : ''}，${fmtDur(rec.durMs)}；日志 ${rec.log}）`); }
    if (interrupted) break;
  }

  clearInterval(hbTimer);
  process.off('SIGINT', onSignal);
  process.off('SIGTERM', onSignal);
  process.off('SIGBREAK', onSignal);

  const gate = expected ? gateStatus(journal, expected) : null;
  let code;
  let lastLine;
  let complete = false;

  if (interrupted) {
    code = 130;
    lastLine = `已中断：台账 ${gate.green.length}/${gate.total} 绿、${gate.pending.length} 未跑（已完成阶段已落台账，--resume 可续跑）`;
    writeHeartbeat('interrupted');
  } else if (!expected) {
    code = failures > 0 ? 1 : 0;
    lastLine = failures > 0
      ? `过滤模式：已跑 ${executed} 步、${failures} 项失败（--only 结果不构成收口判据）`
      : `已跑 ${executed} 步全部通过（过滤模式，不构成收口判据）`;
    writeHeartbeat('incomplete');
  } else if (failures > 0) {
    code = 1;
    lastLine = `未收口：台账 ${gate.green.length}/${gate.total} 绿、${gate.pending.length} 未跑、${gate.failed.length} 失败（--resume 可续跑；修完再跑，不要改断言变绿）`;
    writeHeartbeat('incomplete');
  } else if (gate.failed.length === 0 && gate.pending.length === 0) {
    complete = true;
    code = 0;
    lastLine = quickOnly ? '快速层全部通过。' : '两层全部通过。';
    writeHeartbeat('finished');
  } else if (quickOnly) {
    code = 2;
    lastLine = `快速层未收口：${gate.green.length}/${gate.total} 绿、${gate.pending.length} 未跑${stoppedByLimit ? '（被 --stop-after 截断）' : ''}`;
    writeHeartbeat('incomplete');
  } else {
    code = 2;
    lastLine = `未收口：台账 ${gate.green.length}/${gate.total} 绿、${gate.pending.length} 未跑${stoppedByLimit ? `（被 --stop-after 截断，已跑 ${executed} 步）` : ''}（--resume 可续跑）`;
    writeHeartbeat('incomplete');
  }

  journal.lastRun = {
    startedAt: RUN_STARTED, finishedAt: nowIso(), exit: code, line: lastLine,
    mode: quickOnly ? 'quick' : (only ? 'filtered' : 'full'),
    argv, treeHash: TREE.hash, log: runLogRel, executed, skipped, skippedIds,
    gate: gate ? { total: gate.total, green: gate.green.length, failed: gate.failed.map((s) => s.id), pending: gate.pending.length, complete } : null
  };
  saveJournal(journal);
  writeTextAtomic(exitFile, [
    `tree=${TREE.hash}`,
    `exit=${code}`,
    `complete=${complete}`,
    `mode=${journal.lastRun.mode}`,
    `executed=${executed}`,
    `skipped=${skipped}`,
    `line=${lastLine}`,
    `log=${runLogRel || ''}`
  ].join('\n') + '\n');

  say('');
  if (skipped) say(`（本次跳过 ${skipped} 步已绿阶段，已记入台账）`);
  say(lastLine);
  if (gate && !complete && gate.pending.length && code !== 130) {
    say(`剩余未跑：${gate.pending.slice(0, 5).map((s) => s.id).join('、')}${gate.pending.length > 5 ? ` 等 ${gate.pending.length} 步` : ''}`);
  }
  if (runLogRel) say(`聚合日志：${runLogRel}`);
  say(`台账：${rel(journalFile)}`);

  releaseLock();
  if (logFd != null) { try { fs.closeSync(logFd); } catch {} }
  return code;
}

process.exitCode = await main();
