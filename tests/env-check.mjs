#!/usr/bin/env node
/* tests/env-check.mjs —— 苔芽农场「开工 60 秒」环境预检
 *
 * 用法：
 *   node tests/env-check.mjs               完整自检（包含真实启动 Chromium）
 *   node tests/env-check.mjs --no-browser  跳过第 5 项（无浏览器/沙箱会话自测用）
 *   node tests/env-check.mjs --quick       跳过第 5 项，且不扫描最近日志（更快，供 CI 前置）
 *   node tests/env-check.mjs --json        输出结构化 JSON（stdout 纯 JSON，不再打印人话）
 *
 * 退出码：0 = 通过（允许警告），1 = 有错误。
 *
 * 检查项（固定顺序，共 10 项）：
 *   1. 仓库根：由脚本位置推根目录，.git / game.js / tests/run-ci.mjs 存在
 *   2. Node 版本 >= 18（< 20 警告）
 *   3. output/ 存在且可写（写→读→删临时文件）
 *   4. 磁盘余量（< 3GB 错误；拿不到只警告）
 *   5. Playwright 能真正启动 Chromium（25s 超时；EPERM/EACCES 解释为沙箱拒绝，不是回归）
 *   6. 是否已有别的浏览器验收在跑（Windows 枚举 node 进程；浏览器验收必须串行）
 *   7. 心跳与台账：另一个 CI 在跑？上次是否中断？当前 tree 的 x/123 绿
 *   8. 日志编码：PowerShell 5.1 / 非 utf-8 / 最近日志 GBK 乱码落盘
 *   9. git 工作区是否 dirty（dirty 会让 treeHash 变化，--resume 失效）
 *  10. 结论与下一步建议
 *
 * 契约说明：run-ci.mjs 的 --dump-steps / --status / 心跳 / 台账由统一入口实现。
 * 若 --dump-steps 尚未落地（或输出不合格），第 7 项只降级为警告，绝不擅自触发完整 CI。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const quick = argv.includes('--quick');
const noBrowser = argv.includes('--no-browser') || quick;

const TOTAL_CHECKS = 10;
const CONTRACT_TOTAL = 123;
const outDir = path.join(root, 'output');
const heartbeatPath = path.join(outDir, 'ci-heartbeat.json');
const journalPath = path.join(outDir, 'ci-journal.json');
const exitLogPath = path.join(outDir, 'ci-exit.log');
const runCiPath = path.join(here, 'run-ci.mjs');

const SYMBOL = { pass: '✓', warning: '!', error: '✗', skip: '·' };
const RANK = { skip: 0, pass: 0, warning: 1, error: 2 };

const checks = [];
let errors = 0;
let warnings = 0;

function worst(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

function emit(id, status, message, opts = {}) {
  const details = Array.isArray(opts.details) ? opts.details.filter(Boolean) : [];
  const suggestion = opts.suggestion || null;
  checks.push({ id, status, message, details, suggestion });
  if (status === 'error') errors += 1;
  else if (status === 'warning') warnings += 1;
  if (!asJson) {
    const idx = checks.length;
    console.log(`${SYMBOL[status] || '·'} ${idx}/${TOTAL_CHECKS} ${id}：${message}`);
    for (const line of details) console.log(`    ${line}`);
    if (suggestion) console.log(`    → 建议：${suggestion}`);
  }
}

function readJson(file) {
  try {
    let text = fs.readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    let text = fs.readFileSync(file, 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
  } catch {
    return null;
  }
}

function decodeText(buf) {
  if (!buf || buf.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return buf.toString('gbk');
    } catch {
      return buf.toString('utf8');
    }
  }
}

function firstLine(text) {
  if (!text) return '';
  const line = String(text).split(/\r?\n/).find((l) => l.trim());
  return line ? line.trim() : '';
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // 进程存在但没权限：仍算存活
  }
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return '未知';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '未知';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  return `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`;
}

function shortHash(hash) {
  return typeof hash === 'string' && hash ? hash.slice(0, 12) : '????????????';
}

/* Windows 沙箱禁止用管道捕获子进程（spawnSync ... EPERM），但允许子进程把 stdout/stderr
 * 直接写到文件句柄。所以统一用临时文件接输出再读回来，让预检在沙箱会话里也能工作。 */
function readFileText(file) {
  try {
    return decodeText(fs.readFileSync(file));
  } catch {
    return '';
  }
}

function runCapture(cmd, args, opts = {}) {
  const timeout = Number.isInteger(opts.timeout) ? opts.timeout : 30000;
  const cwd = opts.cwd || here;
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const base = path.join(outDir, `_env-check-child-${stamp}`);
  const outFile = `${base}.out`;
  const errFile = `${base}.err`;
  let outFd = null;
  let errFd = null;
  let result;
  try {
    try {
      outFd = fs.openSync(outFile, 'w');
      errFd = fs.openSync(errFile, 'w');
    } catch (e) {
      return { status: null, signal: null, error: e, stdout: '', stderr: '' };
    }
    result = spawnSync(cmd, args, {
      cwd,
      timeout,
      windowsHide: true,
      stdio: ['ignore', outFd, errFd],
    });
  } catch (e) {
    result = { status: null, signal: null, error: e };
  } finally {
    for (const fd of [outFd, errFd]) {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }
  }
  const stdout = readFileText(outFile);
  const stderr = readFileText(errFile);
  for (const file of [outFile, errFile]) {
    try {
      fs.unlinkSync(file);
    } catch {}
  }
  return { status: result.status, signal: result.signal, error: result.error, stdout, stderr };
}

function spawnErrorHint(error) {
  const code = error && error.code;
  if (code === 'ETIMEDOUT') return '超时';
  if (code === 'EPERM' || code === 'EACCES') {
    return `子进程被系统拒绝（${code}）：Windows 沙箱/权限限制，换 Full access 或非沙箱会话重跑；这不是仓库问题`;
  }
  return firstLine((error && error.message) || String(error));
}

/* ── 1. 仓库根 ───────────────────────────────────────────── */
function checkRoot() {
  const required = [
    ['.git', path.join(root, '.git')],
    ['game.js', path.join(root, 'game.js')],
    ['tests/run-ci.mjs', runCiPath],
  ];
  const missing = required.filter(([, p]) => !fs.existsSync(p)).map(([n]) => n);
  if (missing.length) {
    emit('仓库根', 'error', `从脚本位置推出的根目录是 ${root}，缺少：${missing.join('、')}`, {
      suggestion: '确认脚本位于仓库的 tests/ 目录；不要复制到别处运行。',
    });
  } else {
    emit('仓库根', 'pass', `根目录 ${root}，.git / game.js / tests/run-ci.mjs 都在`);
  }
}

/* ── 2. Node 版本 ─────────────────────────────────────────── */
function checkNode() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (!Number.isFinite(major) || major < 18) {
    emit('Node 版本', 'error', `Node ${process.versions.node} 太旧，需要 >= 18`, {
      suggestion: '升级 Node.js（本机建议 20 LTS 或 22 LTS）后重跑。',
    });
  } else if (major < 20) {
    emit('Node 版本', 'warning', `Node ${process.versions.node} 可用，但低于 20，部分新 API/行为可能不同`, {
      suggestion: '建议升级到 Node 20+；本机当前版本：' + process.versions.node,
    });
  } else {
    emit('Node 版本', 'pass', `Node ${process.versions.node}（>= 20）`);
  }
}

/* ── 3. output/ 可写 ─────────────────────────────────────── */
function checkOutputWritable() {
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
    emit('output 可写', 'error', 'output/ 不存在（CI 日志、心跳、台账、截图都写在这里）', {
      suggestion: 'New-Item -ItemType Directory -Force output',
    });
    return;
  }
  const probe = path.join(outDir, `_env-check-${process.pid}-${Date.now()}.tmp`);
  const payload = `env-check ${new Date().toISOString()}`;
  try {
    fs.writeFileSync(probe, payload, 'utf8');
    const back = fs.readFileSync(probe, 'utf8');
    fs.unlinkSync(probe);
    if (back !== payload) throw new Error('写入内容回读不一致');
    emit('output 可写', 'pass', `output/ 可写（写→读→删临时文件通过）`);
  } catch (e) {
    try {
      fs.unlinkSync(probe);
    } catch {}
    emit('output 可写', 'error', `output/ 存在但不可写：${firstLine(e.message)}`, {
      suggestion: '检查目录权限/杀软锁定；或换到有写权限的会话再跑。',
    });
  }
}

/* ── 4. 磁盘余量 ─────────────────────────────────────────── */
function checkDisk() {
  let free = null;
  try {
    const st = fs.statfsSync(root);
    free = Number(st.bavail) * Number(st.bsize);
  } catch (e) {
    emit('磁盘余量', 'warning', `拿不到磁盘余量（${firstLine(e.message)}），跳过阈值检查`, {
      suggestion: '用 Get-PSDrive C 或 wmic logicaldisk 手动看一眼，留足 3GB 以上。',
    });
    return;
  }
  if (!Number.isFinite(free) || free <= 0) {
    emit('磁盘余量', 'warning', '磁盘余量读数不可信（0 或 NaN），跳过阈值检查');
    return;
  }
  if (free < 3 * 1024 ** 3) {
    emit('磁盘余量', 'error', `剩余 ${fmtBytes(free)}，低于 3GB 阈值（Playwright 截图/日志会写满盘）`, {
      suggestion: '清理 output/、%LOCALAPPDATA%\\ms-playwright 的旧版本，或挪到空间更大的盘再跑。',
    });
  } else {
    emit('磁盘余量', 'pass', `剩余 ${fmtBytes(free)}（>= 3GB）`);
  }
}

/* ── 5. Playwright 真正启动 Chromium ─────────────────────── */
function classifyBrowserError(e) {
  const raw = [e && e.code, e && e.message, e && e.stack].filter(Boolean).join(' | ');
  if (e && e.__envCheckTimeout) {
    return {
      message: 'Chromium 在 25 秒内没有完成启动/关闭（疑似挂起）',
      suggestion: '先 taskkill /IM chrome.exe /F 清残留，再用 Full access 或非沙箱会话重试；或加 --no-browser 只做其它检查。',
    };
  }
  if (/ERR_MODULE_NOT_FOUND|Cannot find (package|module) ['"]?playwright/i.test(raw)) {
    return {
      message: '未安装 playwright（应在 tests/ 下 npm install）',
      suggestion: 'cd tests; npm install',
    };
  }
  if (/EPERM|EACCES|operation not permitted/i.test(raw)) {
    return {
      message: 'Playwright 启动被系统拒绝（EPERM/EACCES）：Windows 沙箱拒绝命名管道/句柄，用 Full access 或非沙箱会话；这不是回归',
      suggestion: '换 Full access（非沙箱）会话重跑；或先 --no-browser 做其它检查。',
    };
  }
  if (/Executable doesn't exist|playwright install|browserType\.launch|is not found at|Failed to launch/i.test(raw)) {
    return {
      message: `Chromium 没装或装坏：${firstLine(e && e.message) || '浏览器缺失'}`,
      suggestion: 'npx playwright install chromium',
    };
  }
  return {
    message: `Chromium 启动失败：${firstLine(e && e.message) || '未知错误'}`,
    suggestion: '先单独跑 node -e "import(\'playwright\').then(async ({chromium})=>{const b=await chromium.launch();await b.close();console.log(\'ok\')})" 定位；或 --no-browser 跳过。',
  };
}

async function checkBrowser() {
  if (noBrowser) {
    emit('Playwright/Chromium', 'skip', '按 --no-browser/--quick 跳过真实启动（集成阶段由 Lead 在非沙箱会话验证）');
    return;
  }
  const startedAt = Date.now();
  let browser = null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('Chromium launch timeout');
      err.__envCheckTimeout = true;
      reject(err);
    }, 25000);
  });
  try {
    let chromium = null;
    try {
      ({ chromium } = await Promise.race([import('playwright'), timeout]));
    } catch (e) {
      const c = classifyBrowserError(e);
      emit('Playwright/Chromium', 'error', c.message, { suggestion: c.suggestion });
      return;
    }
    try {
      browser = await Promise.race([chromium.launch({ headless: true }), timeout]);
      const version = typeof browser.version === 'function' ? browser.version() : '?';
      const page = await Promise.race([browser.newPage(), timeout]);
      await Promise.race([page.goto('about:blank'), timeout]);
      await page.close();
      emit('Playwright/Chromium', 'pass', `Chromium ${version} 可真实启动（${fmtDuration(Date.now() - startedAt)}）`);
    } catch (e) {
      const c = classifyBrowserError(e);
      emit('Playwright/Chromium', 'error', c.message, { suggestion: c.suggestion });
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

/* ── 6. 并发浏览器作业（必须串行） ───────────────────────── */
/* 从 "node.exe <arg0> <arg1>" 里取第一个脚本参数；Windows 命令行带空格时通常带引号。 */
function firstScriptArg(cmdline) {
  const s = String(cmdline || '').trim();
  if (!s) return '';
  let rest;
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    rest = end >= 0 ? s.slice(end + 1) : '';
  } else {
    const m = s.match(/\.exe\b/i);
    rest = m ? s.slice(m.index + m[0].length) : '';
  }
  rest = rest.trim();
  if (!rest) return '';
  if (rest.startsWith('"')) {
    const end = rest.indexOf('"', 1);
    return end > 0 ? rest.slice(1, end) : rest.slice(1);
  }
  return rest.split(/\s+/)[0] || '';
}

function checkConcurrentRuns() {
  if (process.platform !== 'win32') {
    emit('并发浏览器作业', 'warning', '非 Windows 平台，跳过 node 进程枚举（浏览器验收仍必须串行）', {
      suggestion: '用 pgrep -af "run-.*\\.mjs|run-ci\\.mjs" 手动确认没有别的浏览器作业。',
    });
    return;
  }
  const command =
    "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
    'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress';
  const r = runCapture('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 25000 });
  if (r.error) {
    emit('并发浏览器作业', 'warning', `枚举 node 进程失败：${spawnErrorHint(r.error)}`, {
      suggestion: '换 Full access/非沙箱会话重跑；或手动跑 Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Select ProcessId,CommandLine 确认。',
    });
    return;
  }
  if (r.status !== 0) {
    const errText = firstLine(r.stderr) || `退出码 ${r.status}`;
    const denied = /拒绝访问|Access denied|权限|privilege/i.test(errText);
    const fallback = runCapture(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process node -ErrorAction SilentlyContinue | Select-Object Id | ConvertTo-Json -Compress",
      ],
      { timeout: 15000 }
    );
    let otherCount = null;
    if (!fallback.error && fallback.status === 0) {
      try {
        const raw = String(fallback.stdout || '').trim();
        const parsed = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? parsed : [parsed];
        otherCount = list.filter((p) => p && p.Id && p.Id !== process.pid).length;
      } catch {}
    }
    const extra = otherCount === null ? '' : `；Get-Process 只能看到另外 ${otherCount} 个 node 进程（含 harness 自身，读不到命令行）`;
    const hint = denied ? '（多半是沙箱/WMI 拒绝，换 Full access 或非沙箱会话才能自动核对）' : '';
    emit('并发浏览器作业', 'warning', `读不到 node 命令行：${errText}${hint}${extra}`, {
      suggestion: '浏览器验收必须串行：开跑前手动确认没有别的 run-*.mjs / run-ci.mjs；或换 Full access 会话重跑预检。',
    });
    return;
  }
  const text = String(r.stdout || '').trim();
  if (!text) {
    emit('并发浏览器作业', 'pass', '没有发现其它 node 进程（浏览器验收可串行开始）');
    return;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    emit('并发浏览器作业', 'warning', `进程列表不是合法 JSON：${firstLine(text)}`, {
      suggestion: '手动枚举 node 进程确认；Windows 沙箱下 ConvertTo-Json 输出可能被截断。',
    });
    return;
  }
  const list = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  const byPid = new Map(list.map((p) => [Number(p.ProcessId), p]));

  /* 只看「node <tests 下的验收脚本>」形式，并且排除自己和祖先进程（父 shell 的命令行里可能
     出现 "node tests/run-ci.mjs" 字样，按子串匹配会误报——真实踩过：env-check 把自己父进程
     当成两个并发的浏览器作业）。 */
  const ancestors = new Set();
  let cur = process.pid;
  for (let i = 0; i < 32 && cur; i++) {
    ancestors.add(cur);
    const rec = byPid.get(cur);
    cur = rec ? Number(rec.ParentProcessId) : 0;
  }
  const acceptanceOf = (cmdline) => {
    const script = firstScriptArg(cmdline);
    if (!script) return null;
    const base = path.basename(script).toLowerCase();
    const inTests = /[\\/]tests[\\/]/i.test(script) || path.dirname(script) === here;
    if (!inTests) return null;
    if (base === 'run-ci.mjs') {
      if (/--(dump-steps|status)\b/.test(cmdline)) return null; // 看一眼台账，不是验收
      return 'run-ci';
    }
    if (/^run-[\w.-]+\.mjs$/.test(base)) return 'suite';
    if (base === 'build-status-runtime.mjs' || base === 'build-status-doc.mjs') return 'status-generator';
    return null;
  };
  const others = list.filter((p) => {
    const pid = Number(p.ProcessId);
    if (!pid || ancestors.has(pid)) return false;
    return !!acceptanceOf(String(p.CommandLine || ''));
  });
  if (others.length === 0) {
    emit('并发浏览器作业', 'pass', `没有别的 CI/浏览器作业在跑（共枚举 ${list.length} 个 node 进程；自己与父进程已排除）`);
    return;
  }
  const details = others
    .slice(0, 8)
    .map((p) => `pid ${p.ProcessId}：${String(p.CommandLine || '').replace(/\s+/g, ' ').slice(0, 180)}`);
  emit('并发浏览器作业', 'error', `已有 ${others.length} 个浏览器验收作业在跑：浏览器验收必须串行`, {
    details: [...details, others.length > 8 ? `… 另有 ${others.length - 8} 个` : ''],
    suggestion: '等它结束（或确认是残留进程后结束它）；不要再用 gate -Action start，避免 Page crashed 假回归。',
  });
}

/* ── 7. 心跳与台账 ───────────────────────────────────────── */
function runDumpSteps() {
  if (!fs.existsSync(runCiPath)) {
    return { ok: false, error: 'tests/run-ci.mjs 不存在' };
  }
  const src = readText(runCiPath) || '';
  if (!src.includes('--dump-steps')) {
    return { ok: false, unsupported: true, error: 'run-ci.mjs 尚未实现 --dump-steps（契约未落地）' };
  }
  const r = runCapture(process.execPath, [runCiPath, '--dump-steps'], { cwd: here, timeout: 60000 });
  if (r.error) {
    return { ok: false, error: `--dump-steps 跑不起来：${spawnErrorHint(r.error)}` };
  }
  const out = String(r.stdout || '').trim();
  if (r.status !== 0) {
    return { ok: false, error: `--dump-steps 退出码 ${r.status}${out ? '：' + firstLine(out) : ''}` };
  }
  let data = null;
  try {
    data = JSON.parse(out);
  } catch {
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        data = JSON.parse(out.slice(start, end + 1));
      } catch {}
    }
  }
  if (!data || !data.tree || !Array.isArray(data.steps)) {
    return { ok: false, error: '--dump-steps 输出不是契约 JSON（缺 tree/steps）' };
  }
  return { ok: true, data };
}

function checkHeartbeatJournal() {
  let status = 'pass';
  let suggestion = null;
  const parts = [];
  const details = [];

  const hb = fs.existsSync(heartbeatPath) ? readJson(heartbeatPath) : null;
  if (!hb) {
    parts.push('还没有心跳 output/ci-heartbeat.json（尚未按新契约跑过 CI）');
  } else {
    const pid = hb.pid;
    const alive = pidAlive(pid);
    const updatedAt = Date.parse(hb.updatedAt || '');
    const ageSec = Number.isFinite(updatedAt) ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
    const step = hb.step && typeof hb.step === 'object' ? hb.step : null;
    const stepText = step
      ? `${step.id || '?'}（${Number.isInteger(step.index) ? step.index : '?'}/${Number.isInteger(step.total) ? step.total : '?'}）`
      : '无';
    const ageText = ageSec == null ? '未知' : fmtDuration(ageSec * 1000);
    if (hb.state === 'running') {
      if (alive && ageSec != null && ageSec <= 180) {
        status = 'error';
        const startedAt = Date.parse(hb.startedAt || '');
        const elapsed = Number.isFinite(startedAt) ? fmtDuration(Date.now() - startedAt) : '未知';
        parts.push(`另一个 CI 正在跑：pid ${pid}，当前 step ${stepText}，已跑 ${elapsed}，心跳 ${ageText} 前更新`);
        suggestion = '只用 node tests/run-ci.mjs --status 观察；浏览器验收必须串行，不要再启动';
      } else {
        status = 'warning';
        parts.push(
          `心跳写着 running，但 pid ${pid} ${alive ? `存活且心跳已 ${ageText} 未更新` : '已不存在'} → 上次运行中断`
        );
        suggestion = 'node tests/run-ci.mjs --resume（或 powershell -NoProfile -ExecutionPolicy Bypass -File tests\\gate-detached.ps1 -Action start）';
      }
    } else if (hb.state === 'finished') {
      parts.push(`上次运行已结束（state=finished，心跳 ${ageText} 前更新，完成 ${Number.isInteger(hb.done) ? hb.done : '?'} 步）`);
    } else {
      status = worst(status, 'warning');
      const doneText = Number.isInteger(hb.done) ? hb.done : '?';
      if (step) parts.push(`上次运行未收口：state=${hb.state}，停在 ${stepText}，完成 ${doneText} 步`);
      else parts.push(`上次运行未收口：state=${hb.state}（心跳已收口，没记当前步骤），完成 ${doneText} 步`);
      suggestion = 'node tests/run-ci.mjs --resume 续跑（不能用 --quick 代替全量）';
    }
  }

  const journal = fs.existsSync(journalPath) ? readJson(journalPath) : null;
  const dump = runDumpSteps();
  if (!dump.ok) {
    status = worst(status, 'warning');
    parts.push(`取不到步骤契约：${dump.error}`);
    suggestion =
      suggestion ||
      (dump.unsupported
        ? '先用 node tests/run-ci.mjs --quick；等 run-ci 实现 --dump-steps 后再用 --status 看进度'
        : '重试 node tests/run-ci.mjs --dump-steps 确认契约输出');
  } else {
    const treeHash = dump.data.tree.hash || '';
    const total = Number.isInteger(dump.data.totals && dump.data.totals.all) ? dump.data.totals.all : CONTRACT_TOTAL;
    if (!journal) {
      status = worst(status, 'warning');
      parts.push(`契约可用（${dump.data.steps.length} 步，tree ${shortHash(treeHash)}），但还没有台账 output/ci-journal.json`);
      suggestion = suggestion || 'node tests/run-ci.mjs --quick 先跑快速层，或 gate -Action start 跑全量';
    } else if (!journal.trees || !journal.trees[treeHash]) {
      const treeCount = journal.trees ? Object.keys(journal.trees).length : 0;
      parts.push(`台账里还没有当前 tree ${shortHash(treeHash)} 的记录（台账已有 ${treeCount} 个 tree）`);
      details.push(`台账：tree ${shortHash(treeHash)} 0/${total} 绿`);
    } else {
      const tree = journal.trees[treeHash];
      const stepsObj = tree.steps && typeof tree.steps === 'object' ? tree.steps : {};
      const entries = Object.values(stepsObj).filter((s) => s && typeof s === 'object');
      const pass = entries.filter((s) => s.status === 'pass');
      const fail = entries.filter((s) => s.status === 'fail');
      const unrun = Math.max(0, total - pass.length - fail.length);
      parts.push(`台账：tree ${shortHash(treeHash)} ${pass.length}/${total} 绿`);
      if (fail.length) {
        details.push(
          `失败 ${fail.length}：${fail
            .slice(0, 5)
            .map((s) => s.id || s.name || '?')
            .join('、')}${fail.length > 5 ? '…' : ''}`
        );
        suggestion = suggestion || `node tests/run-ci.mjs --from=${fail[0].id || fail[0].name || '<step-id>'}`;
      }
      if (unrun > 0) details.push(`未跑 ${unrun} 步${fail.length ? '' : '（可 --resume 续跑）'}`);
      if (fail.length === 0 && unrun === 0) details.push('当前 tree 已全绿');
    }
    if (hb && hb.treeHash && treeHash && hb.treeHash !== treeHash) {
      details.push(`注意：心跳 tree ${shortHash(hb.treeHash)} 与当前 tree ${shortHash(treeHash)} 不同（跑的过程中改过文件？）`);
    }
  }

  emit('心跳与台账', status, parts.join('；'), { details, suggestion });
}

/* ── 8. 日志编码 ─────────────────────────────────────────── */
function checkLogEncoding() {
  let status = 'pass';
  const details = [];
  let suggestion = null;
  const reasons = [];

  const probe = runCapture(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$e=[Console]::OutputEncoding.WebName; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $PSVersionTable.PSVersion.ToString() + '|' + $e",
    ],
    { timeout: 15000 }
  );
  let psVersion = null;
  let outputEncoding = null;
  if (probe.error || probe.status !== 0) {
    status = worst(status, 'warning');
    reasons.push(
      `探测 PowerShell 版本/编码失败：${probe.error ? spawnErrorHint(probe.error) : '退出码 ' + probe.status + (firstLine(probe.stderr) ? '：' + firstLine(probe.stderr) : '')}`
    );
    suggestion = '读 output/*.log 一律用 read 工具或 node 读；PowerShell 5.1 默认编码会把 UTF-8 读成乱码。';
  } else {
    const text = String(probe.stdout || '').trim();
    const [ver, enc] = text.split('|');
    psVersion = (ver || '').trim();
    outputEncoding = (enc || '').trim();
    if (!psVersion) {
      status = worst(status, 'warning');
      reasons.push('探测不到 PowerShell 版本');
      suggestion = '读 output/*.log 一律用 read 工具或 node 读。';
    } else {
      const isPs51 = /^5\.1\b/.test(psVersion);
      const isUtf8 = /^utf-?8$/i.test(outputEncoding || '');
      if (isPs51) {
        status = worst(status, 'warning');
        reasons.push(`Windows PowerShell ${psVersion}：读 output/*.log 必须 -Encoding utf8（曾把 96 项读成 36 项）`);
        suggestion = '读日志用 Get-Content -Encoding utf8，或直接用 read 工具/node 读（本文件不用 Get-Content）。';
      }
      if (!isUtf8) {
        status = worst(status, 'warning');
        reasons.push(`控制台输出编码 ${outputEncoding || '未知'} 不是 utf-8，中文日志显示可能乱码`);
        suggestion = suggestion || '读日志时显式 -Encoding utf8；写日志时用 UTF-8。';
      }
      details.push(`PowerShell ${psVersion}，[Console]::OutputEncoding=${outputEncoding || '未知'}`);
    }
  }

  if (!quick) {
    const logs = [];
    try {
      for (const name of fs.readdirSync(outDir)) {
        if (!/\.log$/i.test(name)) continue;
        const file = path.join(outDir, name);
        try {
          const st = fs.statSync(file);
          if (st.isFile()) logs.push({ name, file, mtime: st.mtimeMs });
        } catch {}
      }
    } catch {}
    logs.sort((a, b) => b.mtime - a.mtime);
    const recent = logs.slice(0, 5);
    const mojibake = [];
    const invalidUtf8 = [];
    const pattern = /鈹€|鉁|閫氳|銆|鈩|锛|鍦|鏃|鐨|涓|浜|缁|鏄|浠|寮|鏂|寤|鍚|纭|棰|鐢|鑰|銆|锛/;
    for (const log of recent) {
      let buf = null;
      try {
        buf = fs.readFileSync(log.file);
      } catch {
        continue;
      }
      let text = null;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        invalidUtf8.push(log.name);
        continue;
      }
      if (pattern.test(text)) mojibake.push(log.name);
    }
    if (mojibake.length) {
      status = worst(status, 'warning');
      reasons.push(`最近 ${recent.length} 个日志中 ${mojibake.length} 个可按 UTF-8 解码但内容是典型 GBK 乱码：${mojibake.join('、')}`);
      suggestion =
        suggestion || '这些日志是 GBK 乱码落盘，按原文不可作证据；重新落盘（UTF-8）或只看 output/ci-exit.log 与退出码。';
    } else if (recent.length === 0) {
      details.push('output/ 下暂无 *.log，跳过乱码扫描');
    } else if (invalidUtf8.length) {
      details.push(`最近 ${recent.length} 个日志中 ${invalidUtf8.length} 个不是 UTF-8（可能是别的编码，未计入乱码判断）：${invalidUtf8.slice(0, 3).join('、')}`);
    } else {
      details.push(`最近 ${recent.length} 个日志未见 GBK 乱码落盘`);
    }
    if (recent.length) details.push(`扫描：${recent.map((l) => l.name).join('、')}`);
  } else {
    details.push('--quick：跳过最近日志乱码扫描');
  }

  const message = reasons.length ? reasons.join('；') : `PowerShell ${psVersion || '?'}，输出编码 ${outputEncoding || '?'}，日志编码可读`;
  emit('日志编码', status, message, { details, suggestion });
}

/* ── 9. git 工作区 ───────────────────────────────────────── */
function checkGit() {
  const r = runCapture('git', ['-c', 'core.quotepath=false', 'status', '--porcelain'], { cwd: root, timeout: 30000 });
  if (r.error) {
    emit('git 状态', 'warning', `git status 跑不起来：${spawnErrorHint(r.error)}`, {
      suggestion: '换 Full access/非沙箱会话重跑；或手动 git status --short 看一眼。',
    });
    return;
  }
  if (r.status !== 0) {
    emit('git 状态', 'warning', `git status 退出码 ${r.status}：${firstLine(r.stderr) || '无 stderr'}`, {
      suggestion: '手动 git status --short 看一眼。',
    });
    return;
  }
  const lines = String(r.stdout || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) {
    emit('git 状态', 'pass', '工作区干净（treeHash 稳定，台账 --resume 可靠）');
    return;
  }
  const details = lines.slice(0, 8).map((l) => l.replace(/\s+/g, ' ').slice(0, 140));
  if (lines.length > 8) details.push(`… 另有 ${lines.length - 8} 处`);
  emit('git 状态', 'warning', `工作区有 ${lines.length} 处未提交改动（treeHash 会随内容变，之前台账的 --resume 会对不上）`, {
    details,
    suggestion: '先 git status --short 看范围；冻结产物后再跑完整 CI，跑完再改文件。',
  });
}

/* ── 主流程 ──────────────────────────────────────────────── */
async function main() {
  if (!asJson) {
    console.log('苔芽农场 · 环境预检');
    console.log(`仓库根：${root}`);
    console.log(
      `模式：${asJson ? '--json' : '人话输出'}${noBrowser ? '，跳过 Chromium 启动' : '，含真实 Chromium 启动'}${quick ? '，--quick（不扫最近日志）' : ''}`
    );
    console.log('');
  }

  checkRoot();
  checkNode();
  checkOutputWritable();
  checkDisk();
  await checkBrowser();
  checkConcurrentRuns();
  checkHeartbeatJournal();
  checkLogEncoding();
  checkGit();

  const next = [
    'node tests/run-ci.mjs --quick',
    'powershell -NoProfile -ExecutionPolicy Bypass -File tests\\gate-detached.ps1 -Action start',
  ];
  for (const c of checks) {
    if (c.status === 'error' && c.suggestion && !next.includes(c.suggestion)) next.push(c.suggestion);
  }

  /* 第 10 项是结论，作为一条独立检查收进结果，保证 checks 数与「10 项」一致。 */
  const conclusionText =
    errors > 0 ? `环境自检失败（${errors} 错误 / ${warnings} 警告）` : `环境自检通过（${TOTAL_CHECKS} 项检查，${warnings} 警告）`;
  checks.push({
    id: '结论',
    status: errors > 0 ? 'error' : 'pass',
    message: conclusionText,
    details: [],
    suggestion: null,
  });

  const result = {
    ok: errors === 0,
    generatedAt: new Date().toISOString(),
    root,
    node: process.version,
    platform: process.platform,
    mode: { json: asJson, noBrowser, quick },
    totals: {
      checks: checks.length,
      pass: checks.filter((c) => c.status === 'pass').length,
      warnings,
      errors,
      skipped: checks.filter((c) => c.status === 'skip').length,
    },
    checks,
    next,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('');
    console.log(`${SYMBOL[errors > 0 ? 'error' : 'pass']} ${TOTAL_CHECKS}/${TOTAL_CHECKS} 结论：${conclusionText}`);
    console.log('下一步：');
    for (const cmd of next) console.log(`  ${cmd}`);
    if (errors === 0) console.log('（上面有 ! 警告的项先看一眼；警告不阻塞，但可能是上次假绿的来源）');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((e) => {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, fatal: String((e && e.stack) || e) }, null, 2));
  } else {
    console.error(`环境自检本身崩溃：${(e && e.stack) || e}`);
  }
  process.exit(1);
});
