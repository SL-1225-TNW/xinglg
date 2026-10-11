/* 三条替代入口真的能替代公共工程主线（规划建议 1）
   原问题：新档要走到云峰关口，必须先完成 磨坊→湿地→采场／河港→水利
   这一整串公共工程；想做商人或巡林人的玩家被迫走同一条路。
   本测试锁死：三条路线各自都能独立拿到通行权，且三层授权不互相越权。 */
import assert from 'node:assert/strict';
import { launch, boot } from './harness.mjs';

let checks = 0;
/* 用严格比较而不是 assert.ok：0 和 '' 都是假值，assert.ok(0) 会误报失败 */
const ok = (name, actual, expected) => {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), name);
  checks++; console.log('PASS', name);
};

const run = await launch();
try {
  const p = run.page;
  await boot(p);
  const v = (fn, a) => p.evaluate(fn, a);
  const reset = () => v(() => __MOSS__.resetCareerForTest());

  // 1. 新档：三条路线都是 0，关口拿不到
  await reset();
  const snap = () => v(() => ({ info: __MOSS__.routeInfo(), gate: __MOSS__.gateAllowed('cloud_pass'), camp: __MOSS__.gateAllowed('border_camp') }));
  let st = await snap();
  ok('新档三条路线均未起步', st.info.r.engineering + st.info.r.trade + st.info.r.patrol, 0);
  ok('新档拿不到关口通行', st.gate, false);
  ok('新档拿不到边境营地通行', st.camp, false);

  // 2. 商旅路线：两次本地运输 → 能过关口、能进边城做生意，但还进不了军事营地
  await reset();
  await v(() => { __MOSS__.bumpRoute('trade'); __MOSS__.bumpRoute('trade'); });
  st = await snap();
  ok('商旅路线两次后可过关口', st.gate, true);
  ok('商旅路线两次后可进邻领边城', await v(() => __MOSS__.gateAllowed('neighbor')), true);
  ok('商旅路线两次后仍进不了军事营地（需接任务授权）', st.camp, false);
  ok('商旅路线给的是到访授权', st.info.passes.visit, true);
  ok('商旅路线顺带不给出指挥权', st.info.canCommand, false);

  // 3. 巡林路线：同样两次巡路也能替代
  await reset();
  await v(() => { __MOSS__.bumpRoute('patrol'); __MOSS__.bumpRoute('patrol'); });
  st = await snap();
  ok('巡林路线两次后可过关口', st.gate, true);
  ok('巡林路线两次后仍需接任务授权才进营地', st.camp, false);

  // 4. 工程路线：两步即得水利引荐，比走完整条公共工程链短得多
  await reset();
  await v(() => { __MOSS__.bumpRoute('engineering'); });
  st = await v(() => ({ water: __MOSS__.gateAllowed('waterworks'), gate: __MOSS__.gateAllowed('cloud_pass') }));
  ok('工程路线一次尚不足以取得水利引荐', st.water, false);
  await v(() => { __MOSS__.bumpRoute('engineering'); });
  ok('工程路线两步后可取得水利引荐', await v(() => __MOSS__.gateAllowed('waterworks')), true);
  ok('工程路线两步后可过关口', await v(() => __MOSS__.gateAllowed('cloud_pass')), true);

  // 5. 三层授权逐级解锁
  await reset();
  st = { info: await v(() => __MOSS__.routeInfo()), gate: false, camp: false };
  ok('起步时无任何授权', [st.info.passes.visit, st.info.passes.commission, st.info.canCommand], [false, false, false]);
  await v(() => { __MOSS__.bumpRoute('trade'); __MOSS__.bumpRoute('trade'); });
  st = { info: await v(() => __MOSS__.routeInfo()), gate: false, camp: false };
  ok('到访授权已开、接任务未开', [st.info.passes.visit, st.info.passes.commission], [true, false]);
  await v(() => { __MOSS__.bumpRoute('trade'); __MOSS__.bumpRoute('trade'); });
  st = { info: await v(() => __MOSS__.routeInfo()), gate: false, camp: false };
  ok('四次后接任务授权也开', st.info.passes.commission, true);
  ok('接任务授权已开，但指挥权仍不开（职业路线不产生军权）', st.info.canCommand, false);

  // 6. 指挥权只来自军事线：登记 + 可指挥军衔
  await reset();
  st = await v(() => {
    const m = __MOSS__.state.militaryLife;
    m.registered = true; m.rank = 'patrol'; m.commandLimit = 0;
    return __MOSS__.routeInfo().canCommand;
  });
  ok('普通巡防队员没有指挥权', st, false);
  st = await v(() => {
    const m = __MOSS__.state.militaryLife;
    m.rank = 'squad_leader'; m.commandLimit = 12;
    return __MOSS__.routeInfo().canCommand;
  });
  ok('小队长以上才有指挥权', st, true);
  st = await v(() => {
    const m = __MOSS__.state.militaryLife;
    m.registered = false; m.rank = 'squad_leader'; m.commandLimit = 12;
    return __MOSS__.routeInfo().canCommand;
  });
  ok('未登记即使军衔高也没有指挥权', st, false);

  // 7. 路线进度随存档保存
  await reset();
  await v(() => { __MOSS__.bumpRoute('patrol'); __MOSS__.bumpRoute('patrol'); __MOSS__.bumpRoute('patrol'); __MOSS__.saveNow(); });
  const after = await v(() => {
    const n = __MOSS__.normalizeSaveForTest(JSON.parse(localStorage.getItem('moss-farm-v2')));
    return n.professionalLife.routes.patrol;
  });
  ok('路线进度写入存档', after, 3);

  // 8. 路线面板在关口窗口可见且写明三层授权
  await p.evaluate(() => { __MOSS__.devSwitchScene('cloud_pass', 3, 18); });
  await p.evaluate(() => __MOSS__.openExtendedGate('cloud_pass'));
  await p.waitForSelector('.win-body');
  const txt = await p.locator('.win-body').innerText();
  ok('关口窗口列出三条进入路线', ['工程路线', '商旅路线', '巡林路线'].every(x => txt.includes(x)), true);
  ok('关口窗口写明授权分层', txt.includes('到访') && txt.includes('接任务') && txt.includes('指挥军队'), true);

  // Actual reload must preserve a scene entered through the alternate route.
  for (const [route, count, scene] of [['trade',2,'cloud_pass'],['trade',2,'neighbor_border'],['engineering',2,'waterworks_control'],['patrol',4,'border_camp'],['patrol',4,'old_road']]) {
    await reset();
    await v(a=>{const m=__MOSS__;m.closeWindow();m.bumpRoute(a.route,a.count);m.devSwitchScene(a.scene,3,6);m.saveNow();},{route,count,scene});
    await p.reload();await p.getByRole('button',{name:'继续游戏',exact:true}).click();
    ok(route+' 替代入口重载保留 '+scene,await v(()=>__MOSS__.state.sceneId),scene);
  }
  ok('无控制台错误', run.errors.length, 0);
} finally {
  await run.browser.close();
}
console.log(`\n替代入口与分层授权 ${checks} 项通过`);
