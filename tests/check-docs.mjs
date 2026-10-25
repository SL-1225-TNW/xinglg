#!/usr/bin/env node
/* 文档机检：把「文档不撒谎」变成可执行的检查。
 *
 *   node tests/check-docs.mjs           默认检查：错误 → 退出码 1；警告只提示
 *   node tests/check-docs.mjs --strict  警告也升级为错误
 *   node tests/check-docs.mjs --json    机器可读输出（stdout 只有 JSON）
 *   node tests/check-docs.mjs --regen   用生成器 --stdout 逐字节对比 docs/feature-status.md
 *                                      （会启动 Playwright/Chromium，必须由 Lead 串行跑）
 *
 * 规则：
 *   R1 套件/阶段数字：文档里的「N 个阶段 / N 条浏览器 / N 条单文件 / N 个快速步」
 *      必须与 tests/run-ci.mjs --dump-steps 的 totals 一致。历史轮次声明不静默放过，
 *      进 tests/check-docs-allowlist.json 并写清 reason。
 *   R2 通过声明：「退出码 0」「两层全部通过」附近必须能找到 output/*.log；日志尾部 5 行
 *      要有终止行（两层全部通过。/快速层全部通过。），且必须有 exit 证据
 *      （output/ci-exit.log 的 exit=0 且 tree/log 对应、同名 *-exit.log 含 CI_EXIT=0、
 *      或 output/ci-journal.json 的该 tree 全绿）。日志不存在只警告（output/*.log 被 gitignore）。
 *      中断/未确认/待收/判据说明等语境跳过。
 *   R3 生成区：docs/feature-status.md 首行与四个节标题齐全、各出现一次、顺序正确；
 *      生成器里的 TAIL_MARK 必须仍是人工节标题；--regen 时与生成器 stdout 逐字节比对。
 *   R4 提交哈希：文档里反引号包裹的 7—40 位小写十六进制必须是可解析的 commit。
 *   R5 日期：「更新：YYYY-MM-DD」不得晚于今天（Asia/Shanghai）；文档引用的提交日期
 *      不得晚于文档日期。
 *   R6 引用日志：文档里引用的 output/*.log 不存在只警告（本机可能没留证据）。
 *
 * 白名单（tests/check-docs-allowlist.json）：[{"file","contains","rule","reason","added"}]。
 * contains 是必须出现在该行的原文片段；条目匹配不到任何发现 → 打「白名单过期」警告。
 * 只允许豁免「有据可查的历史快照」，真问题必须留在报告里。
 *
 * 零依赖，只用 node: 内置模块；所有 spawn 用 process.execPath，cwd 固定仓库根。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const relPath = (abs) => path.relative(ROOT, abs).split(path.sep).join('/');

const ARGS = process.argv.slice(2);
const REGEN = ARGS.includes('--regen');
const JSON_OUT = ARGS.includes('--json');
const STRICT = ARGS.includes('--strict');

const ALLOWLIST_PATH = path.join(HERE, 'check-docs-allowlist.json');
const FEATURE_STATUS = 'docs/feature-status.md';
const GENERATOR = 'tests/build-status-runtime.mjs';
const JOURNAL = 'output/ci-journal.json';
const CI_EXIT = 'output/ci-exit.log';

/* 扫描范围（R1/R2/R4/R5/R6 共用）。顺序即报告顺序。 */
const BASE_DOCS = ['docs/现状与待办.md', 'README.md', 'AGENTS.md', 'docs/开发模式.md'];
function listSkillDocs() {
  const dir = path.join(ROOT, '.dsh', 'skills');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!/^xinglu-/.test(ent.name)) continue;
    if (ent.isFile() && ent.name.endsWith('.md')) out.push(relPath(path.join(dir, ent.name)));
    if (ent.isDirectory()) {
      const walk = (abs) => {
        for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
          if (e.isFile() && e.name.endsWith('.md')) out.push(relPath(path.join(abs, e.name)));
          else if (e.isDirectory()) walk(path.join(abs, e.name));
        }
      };
      walk(path.join(dir, ent.name));
    }
  }
  return out.sort();
}
const SCAN_DOCS = [...BASE_DOCS, ...listSkillDocs(), FEATURE_STATUS];

/* ── 基础工具 ───────────────────────────────────────────── */

/* 本机日志有两种来源：node 直接写的 UTF-8，以及 PowerShell 重定向写的 UTF-16LE（带 BOM）。
   读错编码会把「两层全部通过。」读成空行，R2 会全部误报——所以统一按 BOM/零字节特征嗅探。 */
function decodeBuffer(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const sw = Buffer.from(buf.subarray(2));
    sw.swap16();
    return sw.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  if (sample.length > 4 && nul > sample.length / 4) return buf.subarray(buf.length % 2).toString('utf16le');
  return buf.toString('utf8');
}

function readAnyText(abs) {
  return decodeBuffer(fs.readFileSync(abs)).replace(/\r\n/g, '\n');
}

const textCache = new Map();
function readText(fileRel) {
  const abs = path.join(ROOT, fileRel);
  if (textCache.has(abs)) return textCache.get(abs);
  let txt = null;
  try {
    txt = readAnyText(abs);
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  } catch {
    txt = null;
  }
  textCache.set(abs, txt);
  return txt;
}

/* spawn 捕获输出的安全实现：本机沙箱禁止「管道捕获另一个进程的 stdio」（EPERM），
   所以把 stdout/stderr 分别重定向到普通临时文件再读；不依赖任何第三方包。 */
function runCapture(cmd, args, { timeout = 120000 } = {}) {
  const dirs = [os.tmpdir(), path.join(ROOT, 'output')];
  for (const dir of dirs) {
    const base = path.join(dir, `.check-docs-${process.pid}-${Math.random().toString(36).slice(2)}`);
    let outFd;
    let errFd;
    try {
      outFd = fs.openSync(`${base}.out`, 'w');
      errFd = fs.openSync(`${base}.err`, 'w');
    } catch {
      continue;
    }
    try {
      const r = spawnSync(cmd, args, { cwd: ROOT, stdio: ['ignore', outFd, errFd], timeout });
      return {
        status: r.status,
        error: r.error || null,
        out: readAnyText(`${base}.out`),
        err: readAnyText(`${base}.err`)
      };
    } finally {
      for (const fd of [outFd, errFd]) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
      for (const f of [`${base}.out`, `${base}.err`]) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
  }
  return { status: null, error: new Error('无法创建临时捕获文件'), out: '', err: '' };
}
const linesOf = (fileRel) => {
  const txt = readText(fileRel);
  return txt == null ? null : txt.split('\n');
};
const snippet = (s, n = 40) => {
  if (s == null) return '∅';
  const t = String(s).trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || '∅';
};
const tailLines = (txt, n = 5) =>
  txt
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n);

/* ── 发现收集 ───────────────────────────────────────────── */

const findings = []; // {file,line,rule,severity,message,order}
const internal = []; // 不挂 file:line 的提示（白名单问题等）
const add = (rule, file, line, severity, message) => {
  findings.push({ file, line: Math.max(1, line | 0), rule, severity, message, order: findings.length });
};
const note = (severity, message) => internal.push({ severity, message });

/* ── 白名单 ─────────────────────────────────────────────── */

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    note('warning', `白名单文件 ${relPath(ALLOWLIST_PATH)} 不存在，按 0 条处理`);
    return [];
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch (err) {
    note('warning', `白名单 JSON 解析失败：${err.message}，按 0 条处理`);
    return [];
  }
  if (!Array.isArray(data)) {
    note('warning', '白名单必须是数组，按 0 条处理');
    return [];
  }
  return data.map((raw, i) => ({ raw, index: i + 1, used: 0, valid: true }));
}

function validateAllowlist(entries) {
  for (const e of entries) {
    const r = e.raw || {};
    const problems = [];
    if (typeof r.file !== 'string' || !r.file.trim()) problems.push('缺少 file');
    if (typeof r.contains !== 'string' || !r.contains) problems.push('缺少 contains');
    if (typeof r.rule !== 'string' || !/^R[1-6]$/.test(r.rule)) problems.push('rule 必须是 R1—R6');
    if (typeof r.reason !== 'string' || r.reason.trim().length < 6) problems.push('缺少 reason（写清为什么这是合理历史声明）');
    if (typeof r.added !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.added)) problems.push('added 必须是 YYYY-MM-DD');
    if (problems.length) {
      e.valid = false;
      note('warning', `白名单第 ${e.index} 条无效（${problems.join('；')}），不予采用`);
    }
  }
}

function applyAllowlist(entries) {
  const kept = [];
  const suppressed = [];
  for (const f of findings) {
    const lineText = (linesOf(f.file) || [])[f.line - 1] || '';
    let hit = null;
    for (const e of entries) {
      if (!e.valid) continue;
      const r = e.raw;
      if (r.file !== f.file || r.rule !== f.rule) continue;
      if (!lineText.includes(r.contains)) continue;
      hit = e;
      break;
    }
    if (hit) {
      hit.used++;
      suppressed.push({ ...f, allowlistIndex: hit.index, allowlistReason: hit.raw.reason });
    } else {
      kept.push(f);
    }
  }
  for (const e of entries) {
    if (e.valid && e.used === 0) {
      note(
        'warning',
        `白名单过期：第 ${e.index} 条（${e.raw.file} · ${e.raw.rule} · contains「${snippet(e.raw.contains, 30)}」）没有匹配到任何发现，请删除或更新`
      );
    }
  }
  return { kept, suppressed };
}

/* ── R1：套件/阶段数字 ──────────────────────────────────── */

function loadDumpSteps() {
  const runCi = path.join(ROOT, 'tests', 'run-ci.mjs');
  if (!fs.existsSync(runCi)) return { ok: false, reason: 'tests/run-ci.mjs 不存在' };
  const src = readText('tests/run-ci.mjs') || '';
  /* 关键护栏：--dump-steps 未实现时绝不能 fallback 去跑整轮 CI（会起浏览器、约 45—60 分钟）。 */
  if (!/--dump-steps/.test(src)) {
    return { ok: false, reason: 'tests/run-ci.mjs 尚未支持 --dump-steps（Lead 的 run-ci 契约还未落地）' };
  }
  const r = runCapture(process.execPath, [runCi, '--dump-steps'], { timeout: 120000 });
  if (r.error) return { ok: false, reason: `调用失败：${r.error.message}` };
  if (r.status !== 0) return { ok: false, reason: `退出码 ${r.status}；stderr 末尾：${snippet(r.err || r.out)}` };
  const out = String(r.out || '');
  let data = null;
  try {
    data = JSON.parse(out.trim());
  } catch {
    const s = out.indexOf('{');
    const e = out.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try {
        data = JSON.parse(out.slice(s, e + 1));
      } catch {
        data = null;
      }
    }
  }
  if (!data || !Array.isArray(data.steps)) {
    return { ok: false, reason: '--dump-steps 输出不是契约 JSON（缺 steps 数组）' };
  }
  const steps = data.steps;
  const totals = { ...(data.totals || {}) };
  const count = (kind) => steps.filter((s) => s && s.kind === kind).length;
  if (!Number.isInteger(totals.all)) totals.all = steps.length;
  if (!Number.isInteger(totals.fast)) totals.fast = count('fast');
  if (!Number.isInteger(totals.browser)) totals.browser = count('browser');
  if (!Number.isInteger(totals.single)) totals.single = count('single');
  const ids = steps.filter((s) => s && typeof s.id === 'string').map((s) => s.id);
  return { ok: true, totals, ids };
}

let LAST_DUMP = null; // checkR1 成功时缓存，R2 的「台账全绿」用它判断是不是完整一轮

const KIND_INFO = {
  all: { label: '阶段总数' },
  fast: { label: '快速步数' },
  browser: { label: '浏览器条数' },
  single: { label: '单文件复跑条数' }
};

function checkR1() {
  const dump = loadDumpSteps();
  if (!dump.ok) {
    note('warning', `R1 跳过：无法读取 --dump-steps 的套件数字（${dump.reason}）`);
    return;
  }
  LAST_DUMP = dump;
  const { totals } = dump;
  const patterns = [
    { re: /(\d+)\s*个阶段/g, kind: 'all' },
    { re: /(\d+)\s*阶段/g, kind: 'all' },
    { re: /(\d+)\s*次脚本(?:运行|阶段)/g, kind: 'all' },
    { re: /(\d+)\s*个快速(?:步|阶段)?/g, kind: 'fast' },
    { re: /快速层\s*(\d+)\s*步/g, kind: 'fast' },
    { re: /(\d+)\s*快速步/g, kind: 'fast' },
    { re: /(\d+)\s*条浏览器(?:层)?/g, kind: 'browser' },
    { re: /浏览器层?\s*(\d+)\s*条/g, kind: 'browser' },
    { re: /(\d+)\s*条单文件(?:复跑)?/g, kind: 'single' },
    { re: /单文件(?:复跑|轮|层)?\s*(\d+)\s*条/g, kind: 'single' },
    {
      re: /(\d+)\s*个?快速(?:步|阶段)?\s*[＋+]\s*(\d+)\s*条?浏览器(?:层)?\s*[＋+]\s*(\d+)\s*条?单文件(?:复跑)?/g,
      multi: ['fast', 'browser', 'single']
    }
  ];
  for (const doc of SCAN_DOCS) {
    const lines = linesOf(doc);
    if (!lines) continue;
    lines.forEach((rawLine, idx) => {
      const lineNo = idx + 1;
      /* CLI 用法说明里的数字是参数（--stop-after=10 只跑 10 个阶段），不是套件声明。 */
      if (/--stop-after=|--from=|--only=|--journal=/.test(rawLine)) return;
      /* 去掉 Markdown 强调/代码标记再匹配，避免 `**88 条**` 这类写法漏检。 */
      const line = rawLine.replace(/[`*]/g, '');
      const seen = new Set();
      for (const pat of patterns) {
        pat.re.lastIndex = 0;
        let m;
        while ((m = pat.re.exec(line)) !== null) {
          const kinds = pat.multi || [pat.kind];
          kinds.forEach((kind, k) => {
            const v = Number(m[k + 1]);
            if (!Number.isFinite(v)) return;
            const actual = totals[kind];
            if (!Number.isInteger(actual)) return;
            const key = `${lineNo}:${kind}:${v}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (v !== actual) {
              add(
                'R1',
                doc,
                lineNo,
                'error',
                `${KIND_INFO[kind].label}声明 ${v}，tests/run-ci.mjs --dump-steps 实际 ${actual}；若这是历史快照，请写进 tests/check-docs-allowlist.json 并注明原因`
              );
            }
          });
          if (m.index === pat.re.lastIndex) pat.re.lastIndex++;
        }
      }
    });
  }
}

/* ── R2：退出码/通过声明 ────────────────────────────────── */

/* 规则说明、历史争议、明确未收口的行不算「宣称通过」。 */
const R2_SKIP =
  /中断|未确认|不算通过|才算通过|待收|待取得|待补|尚未|判据|只认|为准|口径|必须有|要有|不能写|写成|不许|不要写/;
const TERMINAL = /两层全部通过。|快速层全部通过。/;

function parseKeyValue(text) {
  const kv = {};
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return kv;
}

/* 日志 path 匹配：支持 output/x.log 与 output/ci-step-logs/....log */
const logRefPattern = /`?(output\/[A-Za-z0-9_.\-]+\.log)`?/g;
function logRefsIn(text) {
  const out = [];
  logRefPattern.lastIndex = 0;
  let m;
  while ((m = logRefPattern.exec(text)) !== null) out.push(m[1]);
  return [...new Set(out)];
}

function journalAllGreen(logRel) {
  const journalAbs = path.join(ROOT, JOURNAL);
  if (!fs.existsSync(journalAbs)) return false;
  let data;
  try {
    data = JSON.parse(readAnyText(journalAbs));
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object') return false;
  const trees = data.trees && typeof data.trees === 'object' ? data.trees : {};
  const lastRun = data.lastRun && typeof data.lastRun === 'object' ? data.lastRun : null;
  const expectedIds = LAST_DUMP && Array.isArray(LAST_DUMP.ids) && LAST_DUMP.ids.length ? LAST_DUMP.ids : null;
  const stepPass = (s) => s && (s.status === 'pass' || s.exit === 0);
  /* 「该 tree 全绿」必须是完整一轮：知道 --dump-steps 的 id 清单时要求全部阶段都在且 pass，
     过滤模式/只跑几步的树不能给任何历史日志背书。 */
  const treeComplete = (tree) => {
    if (!tree || !tree.steps || typeof tree.steps !== 'object') return false;
    const ids = Object.keys(tree.steps);
    if (!ids.length) return false;
    if (expectedIds) return expectedIds.every((id) => stepPass(tree.steps[id]));
    return ids.every((id) => stepPass(tree.steps[id]));
  };
  if (!Object.values(trees).some(treeComplete)) return false;
  if (!lastRun) return true;
  if (lastRun.exit !== 0) return false;
  if (lastRun.treeHash && trees[lastRun.treeHash] && !treeComplete(trees[lastRun.treeHash])) return false;
  if (lastRun.log && logRel) {
    const want = path.basename(logRel);
    if (path.basename(String(lastRun.log)) !== want) return false;
  }
  return true;
}

function hasExitEvidence(logRel) {
  /* ① output/ci-exit.log：exit=0，且 log/tree 能对上这条日志 */
  const ciExitAbs = path.join(ROOT, CI_EXIT);
  if (fs.existsSync(ciExitAbs)) {
    const kv = parseKeyValue(readAnyText(ciExitAbs));
    if (kv.exit === '0') {
      const logged = kv.log ? String(kv.log) : '';
      if (!logged) return true;
      const samePath = path.resolve(ROOT, logged) === path.resolve(ROOT, logRel);
      const sameName = path.basename(logged) === path.basename(logRel);
      if (samePath || sameName) return true;
    }
  }
  /* ② 同名 *-exit.log 含 CI_EXIT=0（旧证据约定） */
  const legacyAbs = path.join(ROOT, logRel.replace(/\.log$/, '-exit.log'));
  if (fs.existsSync(legacyAbs)) {
    const txt = readAnyText(legacyAbs);
    if (/CI_EXIT\s*=\s*0\b/.test(txt)) return true;
  }
  /* ③ 台账：该 tree 全绿且 lastRun.exit=0 */
  if (journalAllGreen(logRel)) return true;
  return false;
}

function paragraphWindow(lines, idx, radius = 3) {
  let start = idx;
  let end = idx;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;
  return lines.slice(Math.max(start, idx - radius), Math.min(end, idx + radius) + 1);
}

function checkR2() {
  for (const doc of SCAN_DOCS) {
    const lines = linesOf(doc);
    if (!lines) continue;
    lines.forEach((line, idx) => {
      if (!/退出码\s*0|两层全部通过|快速层全部通过/.test(line)) return;
      if (R2_SKIP.test(line)) return;
      /* 未勾选的检查清单（- [ ] ...）是待办模板，不是通过声明。 */
      if (/^\s*[-*]\s*\[ \]/.test(line)) return;
      const lineNo = idx + 1;
      /* 优先只看本行引用的日志；本行没写路径时才回退到同段落前后 3 行，
         避免相邻条目的日志互相串证据。 */
      let refs = logRefsIn(line);
      if (!refs.length) refs = logRefsIn(paragraphWindow(lines, idx).join('\n'));
      if (!refs.length) {
        add(
          'R2',
          doc,
          lineNo,
          'warning',
          '声明了「退出码 0／两层全部通过」但同段落前后 3 行内没有 output/*.log 证据路径，无法核对；请补日志名或改写成指向交付记录'
        );
        return;
      }
      for (const logRel of refs) {
        const abs = path.join(ROOT, logRel);
        if (!fs.existsSync(abs)) {
          add('R2', doc, lineNo, 'warning', `本机无该证据日志 ${logRel}（output/*.log 被 gitignore，不算错误）`);
          continue;
        }
        const txt = readAnyText(abs);
        const tail = tailLines(txt, 5);
        if (!tail.some((l) => TERMINAL.test(l))) {
          add(
            'R2',
            doc,
            lineNo,
            'error',
            `日志 ${logRel} 尾部 5 行没有终止行（应为「两层全部通过。」或「快速层全部通过。」），最后一行：${snippet(tail[tail.length - 1] || '')}；中断/未收口的日志不算通过`
          );
          continue;
        }
        if (!hasExitEvidence(logRel)) {
          add(
            'R2',
            doc,
            lineNo,
            'error',
            `日志 ${logRel} 有终止行但缺少 exit 证据（需要 output/ci-exit.log 的 exit=0、同名 *-exit.log 的 CI_EXIT=0，或台账该 tree 全绿）`
          );
        }
      }
    });
  }
}

/* ── R3：生成区 ─────────────────────────────────────────── */

const FEATURE_HEADERS = ['## 最终地图标记', '## 已注册场景', '## 公共传送节点', '## 玩法验收边界（人工审阅）'];
const TAIL_MARK_EXPECT = '## 玩法验收边界（人工审阅）';

function checkR3() {
  const lines = linesOf(FEATURE_STATUS);
  if (!lines) {
    add('R3', FEATURE_STATUS, 1, 'error', '生成物 docs/feature-status.md 不存在');
    return;
  }
  if (lines[0] !== '# 功能状态表') {
    add('R3', FEATURE_STATUS, 1, 'error', `首行必须是「# 功能状态表」，实际是「${snippet(lines[0], 30)}」`);
  }
  const positions = [];
  for (const h of FEATURE_HEADERS) {
    const hits = [];
    lines.forEach((l, i) => {
      if (l.trim() === h) hits.push(i + 1);
    });
    if (hits.length === 0) add('R3', FEATURE_STATUS, 1, 'error', `缺少生成区小节「${h}」`);
    else if (hits.length > 1) add('R3', FEATURE_STATUS, hits[1], 'error', `小节「${h}」出现了 ${hits.length} 次（生成区只应有一次）`);
    else positions.push({ h, line: hits[0] });
  }
  if (positions.length === FEATURE_HEADERS.length) {
    for (let i = 1; i < positions.length; i++) {
      if (positions[i].line < positions[i - 1].line) {
        add(
          'R3',
          FEATURE_STATUS,
          positions[i].line,
          'error',
          `生成区顺序错误：「${positions[i].h}」应在「${positions[i - 1].h}」之后`
        );
      }
    }
  }
  /* 生成器的 TAIL_MARK 必须和人工节标题一致，否则重跑会把人工验收证据冲掉。 */
  const genSrc = readText(GENERATOR);
  if (genSrc == null) {
    add('R3', GENERATOR, 1, 'error', '生成器 tests/build-status-runtime.mjs 不存在，无法校验 TAIL_MARK');
  } else {
    const m = genSrc.match(/const\s+TAIL_MARK\s*=\s*'([^']*)'/);
    if (!m) {
      add('R3', GENERATOR, 1, 'error', '生成器里找不到 TAIL_MARK 字面量，无法确认它会保留人工节');
    } else if (m[1] !== TAIL_MARK_EXPECT) {
      add(
        'R3',
        GENERATOR,
        1,
        'error',
        `生成器 TAIL_MARK 是「${m[1]}」，必须是「${TAIL_MARK_EXPECT}」，否则重跑会覆盖人工验收节`
      );
    }
    if (!/--stdout/.test(genSrc)) {
      note('warning', '生成器 tests/build-status-runtime.mjs 尚未支持 --stdout，--regen 无法逐字节对比');
    }
  }
  if (REGEN) checkRegen(lines.join('\n'));
}

function checkRegen(actualText) {
  const genAbs = path.join(ROOT, GENERATOR);
  if (!fs.existsSync(genAbs)) return;
  const genSrc = readText(GENERATOR) || '';
  if (!/--stdout/.test(genSrc)) {
    add('R3', GENERATOR, 1, 'error', '--regen 失败：生成器还没有 --stdout 分支，无法比较生成内容');
    return;
  }
  const r = runCapture(process.execPath, [genAbs, '--stdout'], { timeout: 20 * 60 * 1000 });
  if (r.error) {
    add('R3', GENERATOR, 1, 'error', `--regen 失败：生成器调用出错（${r.error.message}）`);
    return;
  }
  if (r.status !== 0) {
    add(
      'R3',
      GENERATOR,
      1,
      'error',
      `--regen 失败：生成器 --stdout 退出码 ${r.status}；stderr 末尾：${snippet(r.err || r.out)}`
    );
    return;
  }
  let expected = String(r.out || '').replace(/\r\n/g, '\n');
  /* 防御：万一浏览器库在生成内容前往 stdout 打了个横幅，从首行标题处截取。 */
  const headIdx = expected.indexOf('# 功能状态表');
  if (headIdx > 0) expected = expected.slice(headIdx);
  if (!expected) {
    add('R3', GENERATOR, 1, 'error', '--regen 失败：生成器 --stdout 没有输出内容');
    return;
  }
  const actual = actualText.replace(/\r\n/g, '\n');
  if (expected === actual) return;
  const el = expected.split('\n');
  const al = actual.split('\n');
  let i = 0;
  while (i < el.length && i < al.length && el[i] === al[i]) i++;
  const lineNo = Math.min(i + 1, Math.max(1, al.length));
  add(
    'R3',
    FEATURE_STATUS,
    lineNo,
    'error',
    `--regen 生成内容与文件不一致（首个差异在第 ${i + 1} 行；生成器：${snippet(el[i])}；文件：${snippet(al[i])}）。生成区只能由生成器写，人工内容必须留在「${TAIL_MARK_EXPECT}」之后`
  );
}

/* ── R4：提交哈希 ───────────────────────────────────────── */

function gitAvailable() {
  const r = spawnSync('git', ['--version'], { cwd: ROOT, stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function isCommit(hash) {
  const r = spawnSync('git', ['cat-file', '-e', `${hash}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function commitDate(hash) {
  const r = runCapture('git', ['log', '-1', '--format=%cs', hash], { timeout: 30000 });
  if (r.error || r.status !== 0) return null;
  const s = String(r.out || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const hashPattern = /`([0-9a-f]{7,40})`/g;
function hashesIn(text) {
  const out = new Map(); // hash -> [line...]
  text.split('\n').forEach((line, i) => {
    hashPattern.lastIndex = 0;
    let m;
    while ((m = hashPattern.exec(line)) !== null) {
      const h = m[1];
      if (!out.has(h)) out.set(h, []);
      out.get(h).push(i + 1);
    }
  });
  return out;
}

function checkR4() {
  const git = gitAvailable();
  if (!git) {
    note('warning', 'R4 跳过：本机 git 不可用，无法校验提交哈希');
    return;
  }
  for (const doc of SCAN_DOCS) {
    const text = readText(doc);
    if (text == null) continue;
    for (const [h, lines] of hashesIn(text)) {
      /* 64 位是 SHA256（产物哈希），不在 R4 范围；7—40 位才是 commit 候选。 */
      if (h.length > 40) continue;
      if (isCommit(h)) continue;
      add('R4', doc, lines[0], 'error', `反引号里的提交哈希 ${h} 在 git 里解析不到（git cat-file -e ${h}^{commit} 失败）`);
    }
  }
}

/* ── R5：日期 ───────────────────────────────────────────── */

function todayShanghai() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
}

function checkR5() {
  const today = todayShanghai();
  for (const doc of SCAN_DOCS) {
    const text = readText(doc);
    if (text == null) continue;
    const lines = text.split('\n');
    const hashes = hashesIn(text);
    lines.forEach((line, i) => {
      const m = line.match(/更新[:：]\s*(\d{4}-\d{2}-\d{2})/);
      if (!m) return;
      const docDate = m[1];
      const lineNo = i + 1;
      if (docDate > today) {
        add('R5', doc, lineNo, 'error', `「更新：${docDate}」晚于今天（Asia/Shanghai ${today}），文档日期不能写未来`);
      }
      for (const [h, hLines] of hashes) {
        const cDate = commitDate(h);
        if (!cDate) continue; // R4 会报解析不到
        if (cDate > docDate) {
          add(
            'R5',
            doc,
            Math.min(hLines[0], lineNo),
            'error',
            `文档日期 ${docDate} 早于它引用的提交 ${h}（${cDate}），「更新」日期必须不早于所引提交`
          );
        }
      }
    });
  }
}

/* ── R6：引用日志存在性 ─────────────────────────────────── */

function checkR6() {
  for (const doc of SCAN_DOCS) {
    const text = readText(doc);
    if (text == null) continue;
    const seen = new Set();
    text.split('\n').forEach((line, i) => {
      logRefPattern.lastIndex = 0;
      let m;
      while ((m = logRefPattern.exec(line)) !== null) {
        const ref = m[1];
        if (seen.has(ref)) continue;
        seen.add(ref);
        if (fs.existsSync(path.join(ROOT, ref))) continue;
        add('R6', doc, i + 1, 'warning', `引用的日志 ${ref} 本机不存在（output/*.log 被 gitignore，不算错误，但无法据此核对证据）`);
      }
    });
  }
}

/* ── 主流程 ─────────────────────────────────────────────── */

checkR1();
checkR2();
checkR3();
checkR4();
checkR5();
checkR6();

const entries = loadAllowlist();
validateAllowlist(entries);
const { kept, suppressed } = applyAllowlist(entries);

const errors = kept.filter((f) => f.severity === 'error');
const warnings = kept.filter((f) => f.severity === 'warning');
const internalWarnings = internal.filter((n) => n.severity === 'warning');
const strictFailed = STRICT && (warnings.length > 0 || internalWarnings.length > 0);
const ok = errors.length === 0 && !strictFailed;

/* 排序：扫描顺序 → 行号 → 规则 */
const docOrder = new Map(SCAN_DOCS.map((d, i) => [d, i]));
const sortFindings = (a, b) =>
  (docOrder.get(a.file) ?? 99) - (docOrder.get(b.file) ?? 99) ||
  a.file.localeCompare(b.file) ||
  a.line - b.line ||
  a.rule.localeCompare(b.rule) ||
  a.order - b.order;
const sortedErrors = [...errors].sort(sortFindings);
const sortedWarnings = [...warnings].sort(sortFindings);
const expired = internal.filter((n) => n.message.startsWith('白名单过期'));

const formatFinding = (f) => `${f.file}:${f.line} [${f.rule}] ${f.message}`;

if (JSON_OUT) {
  const payload = {
    ok,
    strict: STRICT,
    regen: REGEN,
    scanned: SCAN_DOCS,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      exemptions: suppressed.length,
      allowlistEntries: entries.length,
      allowlistExpired: expired.length,
      internalWarnings: internalWarnings.length
    },
    findings: kept.map((f) => ({ file: f.file, line: f.line, rule: f.rule, severity: f.severity, message: f.message })),
    suppressed: suppressed.map((f) => ({
      file: f.file,
      line: f.line,
      rule: f.rule,
      severity: f.severity,
      message: f.message,
      allowlistIndex: f.allowlistIndex
    })),
    notes: internal
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  process.stdout.write(`文档机检：扫描 ${SCAN_DOCS.length} 个文件，6 条规则（R1—R6）\n`);
  if (REGEN) process.stdout.write('--regen：已用生成器 --stdout 逐字节对比 docs/feature-status.md\n');
  if (sortedErrors.length) {
    process.stdout.write(`\n── 错误（${sortedErrors.length}）\n`);
    for (const f of sortedErrors) process.stdout.write(`${formatFinding(f)}\n`);
  }
  if (sortedWarnings.length) {
    process.stdout.write(`\n── 警告（${sortedWarnings.length}）\n`);
    for (const f of sortedWarnings) process.stdout.write(`${formatFinding(f)}\n`);
  }
  if (internal.length) {
    process.stdout.write(`\n── 白名单与提示（${internal.length}）\n`);
    for (const n of internal) process.stdout.write(`[${n.severity === 'warning' ? '警告' : '提示'}] ${n.message}\n`);
  }
  process.stdout.write(
    `\n合计：错误 ${errors.length}，警告 ${warnings.length}；白名单豁免 ${suppressed.length} 项（条目 ${entries.length} 条）；白名单过期 ${expired.length} 条。\n`
  );
  if (ok) {
    process.stdout.write(errors.length === 0 ? '文档机检通过（无错误）。\n' : '文档机检通过。\n');
  } else {
    process.stdout.write(
      strictFailed && errors.length === 0 ? '--strict 下警告也算错误，文档机检失败。\n' : '文档机检失败。\n'
    );
  }
}

process.exit(ok ? 0 : 1);
