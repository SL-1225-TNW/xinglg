// 第八版 R0：角色常驻入口、四页真实状态、今日安排与任务/地图说明。
// 这里全部走真实按键和真实点击，不注入等级、点数、位置或任务事实：
// R0 的验收问题是"陌生玩家找不找得到、看到的会不会是假话"，用夹具就验不出来。
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

const run = await launch();
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; console.log('PASS', label); };
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('PASS', label); };
const notOk = (v, label) => { assert.ok(!v, label); checks++; console.log('PASS', label); };

try {
  const p = run.page;
  await boot(p);
  await p.locator('#tutorialSkip').click();

  /* --- R0-A 入口：顶栏、键盘 P、暂停菜单、触屏 --- */
  const topBtn = p.locator('#btnCharacter');
  eq(await topBtn.innerText(), '角色', '顶栏角色按钮是可读文字，不是无名图标');
  eq(await topBtn.getAttribute('aria-label'), '角色 (P)', '顶栏按钮标注了快捷键');

  await topBtn.click();
  eq(await p.locator('.win-title').innerText(), '角色', '顶栏按钮打开角色窗口');
  const tabs = await p.locator('.char-tabs button').allTextContents();
  eq(tabs, ['属性', '天赋', '武器', '经历'], '四个页签都在且始终可查看');
  const body = () => p.locator('.win-body').innerText();

  /* --- R0-B 四页：真实数据 + 诚实状态，没有假按钮 --- */
  const attr = await body();
  ok(/角色等级与当前状态/.test(attr) && /体力/.test(attr), '属性页列出当前真实生效的数值');
  ok(/五项属性/.test(attr) && /智力/.test(attr) && /\+1 点/.test(attr), '属性页是可加点界面，不再是待实现占位');
  ok(/未分配 10/.test(attr), '新档给出未分配创建点 10');
  ok(/探索阶位/.test(attr) && !/角色等级\s*[:：]?\s*\d+\s*$/m.test(attr.split('\n')[0] || ''), '探索阶位没有冒充角色等级');

  await p.getByRole('button', { name: '天赋', exact: true }).click();
  const talent = await body();
  ok(/专注研读/.test(talent) && /好时相逢/.test(talent), '天赋页列出首批十个入门节点');
  ok(/后续内容/.test(talent), '后续十五节点标成后续内容');
  /* R2 起：十个已接入的入门节点可学，后续十五节点仍不出售。
     新档没有天赋点，所以「学习」按钮此刻应当是禁用状态。 */
  const learnBtns = p.locator('.win-body button', { hasText: '学习（1 点）' });
  const learnCount = await learnBtns.count();
  ok(learnCount === 10, '十个入门节点都已接入且提供学习入口');
  const disabled = await learnBtns.evaluateAll(bs => bs.every(b => b.disabled));
  ok(disabled, '新档没有天赋点，学习按钮为禁用而不是可点');
  const buyBtns = await p.locator('.win-body button').allTextContents();
  notOk(buyBtns.some(t => /购买|投入|加点/.test(t)), '没有绕过点数或阶段的购买入口');

  await p.getByRole('button', { name: '武器', exact: true }).click();
  const weapon = await body();
  ok(/现在真正在用的工具/.test(weapon), '武器页先展示真实工具');
  ok(/免费训练/.test(weapon) && /旧刀/.test(weapon), '个人刀剑写明免费训练与装备路径');
  ok(/不算个人刀剑|不是武器|不属于个人/.test(weapon), '军需装备没有被写成个人武器');

  await p.getByRole('button', { name: '经历', exact: true }).click();
  const history = await body();
  ok(/主线委托/.test(history) && /第一份收成/.test(history), '经历页读出真实主线委托');
  ok(/今日居民委托/.test(history), '经历页列出今天真实刷出的居民委托');
  ok(/职业资历与授权/.test(history) && /公共信任/.test(history), '经历页读出真实职业资历');
  ok(/军队记录/.test(history), '经历页区分机构授权与个人成长');
  notOk(/NaN|undefined|null|\[object Object\]/.test(history), '经历页没有坏值');

  await p.keyboard.press('Escape');
  eq(await p.locator('#windowLayer').isHidden(), true, 'Esc 关闭角色窗口');

  await p.keyboard.press('p');
  eq(await p.locator('.win-title').innerText(), '角色', '键盘 P 打开角色窗口');
  await p.keyboard.press('Escape');

  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: '角色（P）', exact: true }).first().click();
  eq(await p.locator('.win-title').innerText(), '角色', '暂停菜单里的角色入口可用');
  await p.keyboard.press('Escape');

  /* 触屏按钮在 pointer:coarse 才显示，桌面上下文里按不到；
     手机横屏那一段单独起一个真实触控上下文验（见文件末尾）。 */

  /* P 改绑后 Esc 仍然是暂停，不能被一起带走 */
  await p.keyboard.press('Escape');
  eq(await p.locator('.win-title').innerText(), '暂停', 'Esc 仍然是暂停菜单');

  /* --- R0-C 今日安排：一个追踪、一件可做、一个未开放预告 --- */
  await p.keyboard.press('Escape');
  const planItems = await p.locator('#todayPlan .today-item .txt').allTextContents();
  ok(planItems.length >= 2 && planItems.length <= 3, '今日安排最多三行，不摊成清单');
  const planText = planItems.join(' | ');
  ok(/第一份收成|追踪/.test(planText), '今日安排有一个当前追踪目标');
  notOk(/磨坊|牧场|湿地|军队|关口|边城/.test(planText), '新档不会同时催磨坊、牧场、湿地和军队');

  /* --- R0-D 任务下一步与地图说明 --- */
  await p.keyboard.press('j');
  const quest = await p.locator('.win-body').innerText();
  ok(/下一步：/.test(quest), '委托日志写明下一步');
  ok(/先凑齐材料/.test(quest), '新档主线第一件事是凑材料，不是"未知"');
  notOk(/下一步：下一步/.test(quest), '下一步不会重复前缀');
  ok((await p.locator('.win-body .today-plan .today-item').count()) >= 2, '委托日志内联今日安排，矮屏也有入口');
  await p.keyboard.press('Escape');

  await p.keyboard.press('m');
  await p.getByRole('button', { name: /^芽芽小镇/ }).first().click();
  const map = await p.locator('.atlas-detail').innerText();
  ok(/可去：/.test(map), '地图地点回答"这里能做什么"');
  ok(/回家耗时/.test(map), '地图地点回答"回家要多久"');
  await p.keyboard.press('Escape');

  /* --- 存读档往返：入口不依赖本次会话状态 --- */
  await p.evaluate(() => window.__MOSS__.saveNow());
  await p.reload();
  await p.locator('.boot-actions button').first().click();
  await p.locator('#btnCharacter').click();
  eq(await p.locator('.win-title').innerText(), '角色', '重载后角色入口仍然可用');
  await p.getByRole('button', { name: '经历', exact: true }).click();
  ok(/主线委托/.test(await p.locator('.win-body').innerText()), '重载后经历页照常读取真实记录');

  eq(run.errors, [], '浏览器无未捕获错误');
} finally {
  await run.browser.close();
}

/* --- 手机横屏：真实触控上下文 --- */
const mob = await launch({ viewport: { width: 844, height: 390 }, touch: true });
try {
  const p = mob.page;
  await boot(p);
  await p.locator('#tutorialSkip').click();
  await p.locator('#touchChar').tap();
  eq(await p.locator('.win-title').innerText(), '角色', '手机触屏角色按钮可用');
  await p.getByRole('button', { name: '天赋', exact: true }).click();
  ok(/专注研读/.test(await p.locator('.win-body').innerText()), '手机上四页同样可查看');
  await p.locator('.win-close').tap();
  eq(await p.locator('#windowLayer').isHidden(), true, '手机上可正常关闭角色窗口');
  await p.locator('#touchQuest').tap();
  ok((await p.locator('.win-body .today-plan .today-item').count()) >= 2, '矮屏手机仍能在委托里看到今日安排');
  eq(mob.errors, [], '手机上下文无未捕获错误');
} finally {
  await mob.browser.close();
}
console.log(`第八版 R0 入口与真实状态 ${checks} 项通过`);