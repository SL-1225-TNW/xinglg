#!/usr/bin/env node
/* 自检工具 · Self-Check Linter
   ------------------------------------------------------------------
   为什么存在：多轮 coding 里反复栽在同一批坑上，每次都靠临场记忆兜住。
   这里把那批教训变成会自己跑的检查。零依赖，纯 node。

   规则：
     A 存在性探测  用 typeof M.x === 'function' 判断功能可用（最常见的假阴性）
     B 调用签名    按错误参数个数调用函数 → 返回默认值而不报错
     C 弱断言      try{调用}catch → ok:true，只证明没抛异常
     D 装饰态      「装饰/不写入存档」的东西被当库存入账
     E 状态直写    测试改写 state 不还原 → 污染后续断言
     F 语法        game.js node --check
     G 孤儿引用    调用了源码有定义、但没 export 到 __MOSS__ 的符号

   用法：node tests/lint-self.mjs [--verbose]
   退出码非 0 = 有 ERROR（可挂 pre-commit）。
*/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

const findings = [];
function add(level, rule, file, line, msg, fix) {
  findings.push({ level, rule, file: path.relative(ROOT, file), line, msg, fix });
}
const RULES = {
  A: '存在性探测', B: '调用签名', C: '弱断言', D: '装饰态',
  E: '状态直写', F: '语法', G: '孤儿引用'
};

/* ---------- 屏蔽注释与字符串 ----------
   关键：保留引号本身，只把内容换成 'x'。
   若连内容一起抹成空格，`f('a','b')` 会变成 `f(    )`，参数个数全部归零 → 满屏误报。
   保留引号后既不吃掉字符串里的逗号/括号，参数个数也能数对。 */
function maskLiterals(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') out[i++] = ' '; }
    else if (c === '/' && d === '*') {
      out[i] = out[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] !== '\n') out[i] = ' '; i++; }
      if (i < n) { out[i] = out[i + 1] = ' '; i += 2; }
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out[i] = 'x'; i++; }
        if (i < n) { if (src[i] !== '\n') out[i] = 'x'; i++; }
      }
      if (i < n) i++;   // 保留闭合引号
    } else i++;
  }
  return out.join('');
}

function matchBracket(masked, openIdx) {
  const open = masked[openIdx];
  const close = open === '(' ? ')' : open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function countTopLevelArgs(masked, openIdx, closeIdx) {
  const body = masked.slice(openIdx + 1, closeIdx).trim();
  if (!body) return 0;
  let depth = 0, count = 1;
  for (const ch of body) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

function parseParams(params) {
  const ps = params.split(',').map(s => s.trim()).filter(Boolean);
  return {
    arity: ps.length,
    rest: ps.some(p => p.startsWith('...')),
    optional: ps.some(p => p.includes('='))
  };
}

/* 运行期可选参数：形参表里看不出可选（`function f(a, opts)`），要看函数体。
   典型惯用法：
     opts = opts || {};      if (!x) x = 0;      x === undefined      typeof x
   这类参数少传不报错，是「按错参数个数调用」最容易漏网的一类。 */
function bodyDefaults(params, mask, bStart, bEnd) {
  if (bEnd < 0 || bEnd <= bStart) return { optional: false };
  const body = mask.slice(bStart, bEnd);
  const names = params.split(',').map(s => s.trim()).filter(Boolean);
  const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escaped.length) return { optional: false };
  const anyAlt = new RegExp(
    escaped.map(n =>
      `\\b${n}\\s*=\\s*${n}\\b|` +      // x = x
      `if\\s*\\(\\s*!\\s*${n}\\s*\\)|` +  // if (!x)
      `\\b${n}\\s*===\\s*undefined|` +  // x === undefined
      `typeof\\s+${n}\\b`               // typeof x
    ).join('|')
  );
  return { optional: anyAlt.test(body) };
}

/* ---------- 读被检查文件 ---------- */
const gamePath = path.join(ROOT, 'game.js');
const gameRaw = fs.readFileSync(gamePath, 'utf8');
const gameLines = gameRaw.split('\n');
const gameSrc = maskLiterals(gameRaw);
const gameLine = idx => gameSrc.slice(0, idx).split('\n').length;

function blockAt(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  if (open < 0) return null;
  const close = matchBracket(src, open);
  if (close < 0) return null;
  return { open, close, mask: src.slice(open, close) };
}

/* ---------- 全局定义表：裸名 → 签名 ---------- */
const globals = new Map();       // name -> {arity, line, ambiguous}
function addGlobal(name, params, line, mask, bStart, bEnd) {
  const p = parseParams(params);
  const withBody = (bStart != null) ? { ...p, ...bodyDefaults(params, mask, bStart, bEnd) } : p;
  const prev = globals.get(name);
  if (!prev) { globals.set(name, { ...withBody, line }); return; }
  if (prev.arity !== p.arity || prev.line !== line) prev.ambiguous = true;
}
let m;
const reFnDecl = /^[\t ]*function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
while ((m = reFnDecl.exec(gameSrc))) {
  const bStart = gameSrc.indexOf('{', m.index + m[0].length - 1);
  addGlobal(m[1], m[2], gameLine(m.index), gameSrc, bStart, matchBracket(gameSrc, bStart));
}
const reFnExpr = /^[\t ]*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)\s*\{/gm;
while ((m = reFnExpr.exec(gameSrc))) {
  const bStart = gameSrc.indexOf('{', m.index + m[0].length - 1);
  addGlobal(m[1], m[2], gameLine(m.index), gameSrc, bStart, matchBracket(gameSrc, bStart));
}
const reVarDecl = /^[\t ]*(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm;
while ((m = reVarDecl.exec(gameSrc))) if (!globals.has(m[1])) globals.set(m[1], { arity: -1, line: gameLine(m.index) });

/* ---------- 导出面：按命名空间分别记录签名 ----------
   关键：devCompost.recipe 与 devLivestock.recipe 同名但参数不同。
   裸名表会把两者撞在一起并误报，所以这里必须保留完整路径。 */
const exportBlock = blockAt(gameSrc, 'window.__MOSS__ = {');
if (!exportBlock) add('ERROR', 'F', gamePath, 1, '找不到 window.__MOSS__ 导出块', '游戏入口可能被重命名');

const nsMembers = new Map();   // "devCompost.recipe" -> {arity, line, rest, optional}
const exported = new Set();    // 顶层导出名

if (exportBlock) {
  (function walk(mask, prefix, baseLine) {
    const re = /(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g;
    let mm;
    while ((mm = re.exec(mask))) {
      const name = mm[1];
      const full = prefix ? prefix + '.' + name : name;
      const rest = mask.slice(mm.index + mm[0].length);
      const off = rest.search(/\S/);
      if (off < 0) continue;
      const at = mm.index + mm[0].length + off;
      const line = gameLine(exportBlock.open + at);
      if (!prefix) exported.add(name);
      if (mask[at] === '{') {
        const nestedEnd = matchBracket(mask, at);
        walk(mask.slice(at + 1, nestedEnd), full, baseLine);
        // 关键：跳过整个嵌套块，否则外层正则会继续扫进去，
        // 把 devFert.plotFertility 的签名误记成顶层 plotFertility。
        re.lastIndex = at + 1 + (nestedEnd - at);
        continue;
      }
      // key: function ( ... )  → 直接就是签名
      const fn = /^function\s*\(([^)]*)\)/.exec(mask.slice(at));
      if (fn) {
        const bStart = at + fn[0].length;
        const bEnd = matchBracket(mask, bStart);
        nsMembers.set(full, { ...parseParams(fn[1]), ...bodyDefaults(fn[1], mask, bStart, bEnd), line });
        continue;
      }
      // key: 其他标识符（如 invCount: invCount）→ 签名查全局表
      const alias = /^([A-Za-z_$][\w$]*)\s*[,}\n]/.exec(mask.slice(at));
      if (alias && globals.has(alias[1])) nsMembers.set(full, { ...globals.get(alias[1]), line });
    }
  })(exportBlock.mask, '', 0);
}
// get state() { ... } / get npcRuntime()
if (exportBlock) {
  const reGet = /get\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = reGet.exec(exportBlock.mask))) exported.add(m[1]);
}

/* ---------- 扫描 __MOSS__.x.y(...) 调用点 ---------- */
const reMCall = /(?:__MOSS__|\bM)\.((?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)\s*\(/g;

const testDir = path.join(ROOT, 'tests');
const testFiles = fs.readdirSync(testDir)
  .filter(f => /\.(mjs|js|cjs)$/.test(f))
  .filter(f => !['lint-self.mjs', 'lint-self-selftest.mjs', 'build-single-file.mjs'].includes(f))
  .map(f => path.join(testDir, f));

const CORE = new Set(['window', 'document', 'localStorage', 'console', 'JSON', 'Math', 'Object', 'Array',
  'String', 'Number', 'Date', 'Promise', 'Set', 'Map', 'globalThis', 'undefined', 'null', 'true', 'false',
  'parseInt', 'parseFloat', 'setTimeout', 'clearTimeout', 'setInterval', 'isNaN', 'Boolean', 'RegExp', 'Error']);

for (const file of testFiles) {
  const raw = fs.readFileSync(file, 'utf8');
  const mask = maskLiterals(raw);
  const lines = raw.split('\n');
  const lineOf = idx => mask.slice(0, idx).split('\n').length;
/* ===== A 存在性探测：typeof M.x === 'function' 判功能可用 =====
     必须要求显式 typeof 比较。早先用 `\s*(?==)` 结果把 `M.state.coins = x` 这类
     正常赋值也算成探测 —— 260 条误报。教训：规则要匹配「意图」，不是「长得像」。 */
  const reProbe = /(?:__MOSS__|\bM)\.((?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)\s*\)?\s*(?:===|!==|==|!=)\s*(?:'|")?function/g;
  const reProbe2 = /typeof\s+(?:__MOSS__|\bM)\.((?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)/g;
  const probes = [];
  while ((m = reProbe.exec(mask))) probes.push({ m, prefix: m[1], name: m[2] });
  while ((m = reProbe2.exec(mask))) probes.push({ m, prefix: m[1], name: m[2] });
  const seenProbe = new Set();
  for (const { m: pm, prefix, name } of probes) {
    const full = (prefix.replace(/\.$/, '') ? prefix.replace(/\.$/, '') + '.' : '') + name;
    if (CORE.has(name) || /^state\./.test(full)) continue;   // state.coins 是读值不是探测
    if (seenProbe.has(full + lineOf(pm.index))) continue;
    seenProbe.add(full + lineOf(pm.index));
    // 往后看 3 行：是否把这个布尔值直接当断言依据
    const tail = mask.slice(pm.index, pm.index + 260);
    const usedAsResult = /\.\s*(ok|has|every|some|filter|length|!==|===)/.test(tail);
    if (!usedAsResult) continue;
    const isExposed = nsMembers.has(full) || exported.has(name);
    add('WARN', 'A', file, lineOf(pm.index),
      `用「${full} 存不存在」当结论（${isExposed ? '已导出' : '源码可能有定义但未导出'}）`,
      '符号存在性 ≠ 功能可用（这条我栽过 4 次）。没导出只说明探针没暴露，' +
      '不代表功能没实现 → 改用真实 UI 操作或公开入口驱动，验证返回值/副作用。');
  }

  /* ===== B 调用签名 + G 孤儿引用 ===== */
  const seenCall = new Set();
  reMCall.lastIndex = 0;
  while ((m = reMCall.exec(mask))) {
    const prefix = m[1].replace(/\.$/, '');
    const name = m[2];
    const full = prefix ? prefix + '.' + name : name;
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = matchBracket(mask, openIdx);
    if (closeIdx < 0) continue;
    const args = countTopLevelArgs(mask, openIdx, closeIdx);
    const line = lineOf(m.index);
    const key = line + ':' + full;
    if (seenCall.has(key)) continue;
    seenCall.add(key);

    // 查签名：优先命名空间，其次全局裸名
    const sig = nsMembers.get(full) || globals.get(name);
    const exportedHere = nsMembers.has(full) || exported.has(name);

    if (!exportedHere) {
      if (sig && sig.arity >= 0 && !CORE.has(name)) {
        add('WARN', 'G', file, line,
          `调用 ${full}()，但它不在 __MOSS__ 的导出面上` +
          (sig.line ? `（源码定义在 game.js:${sig.line}）` : ''),
          '别把这个「没导出」当成「未实现」去改游戏代码。先确认功能是否已可用，' +
          '必要时往 __MOSS__ 补一行 export 让测试能驱动它。');
      }
      continue;
    }
    if (!sig || sig.arity <= 0 || sig.rest || sig.optional || sig.ambiguous) continue;
    if (args === sig.arity) continue;
    add('ERROR', 'B', file, line,
      `按 ${args} 个参数调用 ${full}()，真实签名是 ${sig.arity} 个` +
      (sig.line ? `（game.js:${sig.line}）` : ''),
      '先读函数签名再写调用。多传参数不报错、返回默认值 → 假阴性。' +
      '确认调用方式与实现一致，别改游戏代码来迁就测试。');
  }

  /* ===== E 状态直写不还原 ===== */
  const reWrite = /(?:__MOSS__|\bM)\.state\.([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  while ((m = reWrite.exec(mask))) {
    const field = m[1], line = lineOf(m.index);
    if (/\+\+|--/.test(m[2])) continue;                       // 能量增减是玩法本身
    if (field === 'player') continue;
    const around = mask.slice(Math.max(0, m.index - 500), m.index + 1000);
    const reassigned = new RegExp(`state\\.${field}\\s*=\\s*[^=;\\n]`).test(around.slice(500));
    const annotated = /还原|restore|fixture|独立用例|preset|teardown/i.test(
      lines.slice(Math.max(0, line - 3), line + 3).join(' '));
    if (reassigned || annotated) continue;
    add('WARN', 'E', file, line,
      `写 state.${field} = ${m[2].trim().slice(0, 36)}，附近没看到还原`,
      '同一 page 后续断言会被污染（totalDay / coins 尤其致命）。写完还原，' +
      '或用独立 fixture 函数隔离。');
  }

  /* ===== C 弱断言：try{调用} 就判成功 ===== */
  const reTry = /\btry\s*\{/g;
  while ((m = reTry.exec(mask))) {
    const open = mask.indexOf('{', m.index);
    const close = matchBracket(mask, open);
    if (close < 0) continue;
    const body = mask.slice(open + 1, close);
    const line = lineOf(m.index);
    if (!/(?:ok|success|done|passed|works|usable)\s*[:=]\s*true/.test(body)) continue;
    // 同段落读了业务字段 → 不算弱
    if (/===\s*(?:true|false|undefined|null|\d+)|!==|\.(?:reason|qty|coins|inv|ready|result|error)\b/.test(body)) continue;
    add('WARN', 'C', file, line,
      '断言形如 try{ 调用() }catch → ok=true，只能证明「没抛异常」',
      '写断言前先回答「正确行为是什么」，而不是「我想要什么结果」。' +
      '正确拒绝（业务上该失败的情况）也会「没抛异常」而被误判成功。改读业务返回值。');
  }
}

/* ===== D 装饰态被当库存 =====
   装饰说明通常写在函数上一行的注释里，若只扫「本行匹配」，注释行本身
   会被 `/^\s*(\*|\/\/|\/\*)/` 过滤掉，规则永远不会触发。
   正确做法：注释行作为线索，报告它下面第一条真正的代码行。 */
for (let i = 0; i < gameLines.length; i++) {
  const l = gameLines[i];
  if (!/(装饰|不写入存档|纯视觉|按需创建)/.test(l)) continue;

  // 从注释行往下找第一个非注释、非空行作为归属代码
  let codeLine = -1;
  for (let j = i; j < Math.min(gameLines.length, i + 4); j++) {
    const t = gameLines[j].trim();
    if (!t || /^(?:\*|\/\/|\/\*)/.test(t)) continue;
    codeLine = j; break;
  }
  const anchor = codeLine >= 0 ? codeLine : i;
  if (codeLine < 0) continue;

  const ctx = gameLines.slice(Math.max(0, anchor - 2), anchor + 8).join('\n');
  if (!/inventory\[|invAdd|invRemove|addItem|\.sell\b/.test(ctx)) continue;
  add('WARN', 'D', gamePath, anchor + 1,
    `装饰态说明「${l.trim().replace(/^\/\*+\s*/, '').slice(0, 40)}」下方出现库存写入`,
    '看见东西 ≠ 拥有资产。若规格要求账本，必须新建独立数据，' +
    '禁止把装饰状态隐式转成可出售库存。');
}

/* ===== F 语法 ===== */
try {
  execFileSync(process.execPath, ['--check', gamePath], { stdio: 'pipe' });
} catch (e) {
  add('ERROR', 'F', gamePath, 0,
    `语法错误：${String(e.stderr || e.message).split('\n').slice(0, 2).join(' ')}`, 'node --check 失败');
}

/* ===== 输出 ===== */
const rank = { ERROR: 0, WARN: 1 };
findings.sort((a, b) => rank[a.level] - rank[b.level]
  || a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.line - b.line);

if (VERBOSE) {
  const key = ['travelTo', 'travelPreview', 'travelLandingWalkable', 'plotFertility', 'bagAccepts'];
  console.log('[规则A 覆盖检查] 有源码定义但未导出：',
    key.filter(k => globals.has(k) && !exported.has(k)).join(', ') || '(无)');
  console.log(`[统计] 全局定义 ${globals.size} · 导出顶层 ${exported.size} · 命名空间成员 ${nsMembers.size}`);
}

const errors = findings.filter(f => f.level === 'ERROR');
const warns = findings.filter(f => f.level === 'WARN');
console.log('\n════════ 自检报告 ════════');
console.log(`ERROR ${errors.length} · WARN ${warns.length} · 扫描 ${testFiles.length} 个测试文件 + game.js`);

for (const f of findings) {
  console.log(`\n${f.level === 'ERROR' ? '✗' : '!'} [${f.rule} ${RULES[f.rule]}] ${f.file}:${f.line}`);
  console.log(`    ${f.msg}`);
  if (f.fix) console.log(`    → ${f.fix}`);
}
if (!findings.length) console.log('\n全部通过。');
console.log('════════════════════════════\n');

process.exit(errors.length ? 1 : 0);