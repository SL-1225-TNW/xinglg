/* 打包单文件可玩版：把 styles.css 与 game.js 内联进一个 HTML，
   对方双击就能玩，不需要解压、不需要仓库、不需要联网。
   用法：node tests/build-single-file.mjs */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');
const css = read('styles.css');
const js = read('game.js');
const saves = read('save-repository.js');

/* 内联脚本里不能出现 </script>，否则浏览器会提前结束标签 */
if (/<\/script/i.test(js)) {
  console.error('game.js 里含 </script 字样，需要转义后再内联');
  process.exit(1);
}
if (/<\/style/i.test(css)) {
  console.error('styles.css 里含 </style 字样，需要转义后再内联');
  process.exit(1);
}

const before = html;
// The shareable offline edition deliberately carries no production cloud configuration.
html = html.replace('<script src="cloud-config.js"></script>', '<script>window.MOSS_CLOUD_CONFIG = {url:"",publishableKey:""};</script>');
for (const name of ['vendor/supabase.js', 'cloud-auth.js', 'account-ui.js', 'save-coordinator.js']) {
  const source = read(name).replace(/<\/script/gi, '<\\/script');
  html = html.replace('<script src="' + name + '"></script>', () => '<script>\n' + source + '\n</script>');
}
html = html.replace('<script src="save-repository.js"></script>', '<script>\n' + saves + '\n</script>');
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>');
html = html.replace('<script src="game.js"></script>', '<script>\n' + js + '\n</script>');
if (html === before) { console.error('没有匹配到要内联的标签，index.html 结构变了？'); process.exit(1); }
if (html.includes('styles.css') || html.includes('src="game.js"')) {
  console.error('仍有外部引用残留：' + (html.includes('styles.css') ? 'styles.css ' : '') + (html.includes('src="game.js"') ? 'game.js' : ''));
  process.exit(1);
}

const out = path.join(ROOT, '苔芽农场-单文件版.html');
fs.writeFileSync(out, html, 'utf8');
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`已生成 ${path.basename(out)}（${kb} KB）`);
console.log('外部依赖检查：' + (/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<!--[\s\S]*?-->/g, '')) ? '仍有 http(s) 外链' : '无 http(s) 外链'));
