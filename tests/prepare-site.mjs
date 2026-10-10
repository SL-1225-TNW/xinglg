/* 站点产物构建：验证工作流与部署工作流都调用这一个脚本，
   保证上线的是「同一提交、同一构建产物」，而不是两边各跑一次各生成一份。
   用法：node tests/prepare-site.mjs [输出目录] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, process.argv[2] || 'site');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });

// 单文件版先重建：它是玩家实际下载的那一份
execFileSync(process.execPath, [path.join(root, 'tests', 'build-single-file.mjs')], { stdio: 'inherit' });

const singles = fs.readdirSync(root).filter((f) => f.endsWith('-单文件版.html'));
if (singles.length !== 1) {
  console.error(`预期恰好一个单文件版，实际找到 ${singles.length} 个：${singles.join('、')}`);
  process.exit(1);
}

const copy = (from, to) => {
  const src = path.join(root, from);
  if (fs.existsSync(src)) { fs.copyFileSync(src, to); return true; }
  return false;
};

copy('index.html', path.join(outDir, 'index.html'));
copy('styles.css', path.join(outDir, 'styles.css'));
copy('game.js', path.join(outDir, 'game.js'));
copy(singles[0], path.join(outDir, singles[0]));

// 装饰素材：缺失不算失败，但不能静默丢
for (const f of fs.existsSync(path.join(root, 'assets')) ? fs.readdirSync(path.join(root, 'assets')) : []) {
  if (/\.(svg|png)$/i.test(f)) copy(path.join('assets', f), path.join(outDir, 'assets', f));
}

const required = ['index.html', 'styles.css', 'game.js', singles[0]];
const missing = required.filter((f) => !fs.existsSync(path.join(outDir, f)));
if (missing.length) {
  console.error(`站点产物缺少必需文件：${missing.join('、')}`);
  process.exit(1);
}

// 离线可用性：主页面不得引用任何外部资源
const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\//gi)].map((m) => m[0]);
if (ext.length) {
  console.error(`index.html 引用了外部资源，会导致离线打开失败：\n  ${ext.join('\n  ')}`);
  process.exit(1);
}

const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim().slice(0, 12);
fs.writeFileSync(path.join(outDir, 'BUILD-INFO.txt'),
  `commit ${rev}\nsingle-file ${singles[0]}\nbuilt-by tests/prepare-site.mjs\n`);
console.log(`站点产物就绪：${outDir}（commit ${rev}）`);
