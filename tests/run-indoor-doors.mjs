import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, boot } from './harness.mjs';

const bundled = process.argv.includes('--single-file');
const run = await launch(bundled ? { url: pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href } : {});
let checks = 0;
function ok(name, value) { assert.ok(value, name); checks++; console.log('PASS', name); }
try {
  const p = run.page;
  await boot(p);
  await p.locator('#tutorialSkip').click();
  const audit = await p.evaluate(() => {
    const M = __MOSS__, failures = [], rooms = Object.keys(M.MAPS).filter(id => M.MAPS[id].indoor);
    for (const id of rooms) {
      const map = M.MAPS[id], exits = new Set(map.exits.map(e => `${e.x},${e.y}`));
      if (!map.doors?.length) failures.push(id + ': missing doors');
      for (const d of map.doors || []) {
        if (M.isSolid(id, d.enter.x, d.enter.y) || exits.has(`${d.enter.x},${d.enter.y}`)) failures.push(id + ': unsafe entry');
        if (M.isSolid(d.to, d.tx, d.ty)) failures.push(id + ': blocked return');
        for (const [x, y] of M.doorTiles(d)) {
          if (!exits.has(`${x},${y}`) || M.isSolid(id, x, y) || !M.findPath(id, map.enter.x, map.enter.y, x, y)) failures.push(id + ': blocked door');
        }
        if (M.INTERACTABLES[id].filter(it => it.kind === 'indoorExit' && it.doorId === d.id).length !== 1) failures.push(id + ': duplicate/missing prompt');
      }
      for (let x = 0; x < map.w; x++) for (let y = 0; y < map.h; y++) {
        if ((x === 0 || x === map.w - 1 || y === 0 || y === map.h - 1) && !exits.has(`${x},${y}`) && !M.isSolid(id, x, y)) failures.push(id + ': wall hole');
      }
    }
    return { count: rooms.length, failures };
  });
  assert.deepEqual(audit.failures, []);
  ok(`全部 ${audit.count} 间室内的门洞、墙、落点和连通性`, audit.count > 0);

  const pose = async (scene, x, y) => {
    await p.evaluate(({scene,x,y}) => { __MOSS__.closeWindow(); __MOSS__.devSwitchScene(scene,x,y); }, {scene,x,y});
    await p.waitForTimeout(80);
  };
  const settled = async scene => {
    await p.waitForFunction(scene => __MOSS__.state.sceneId === scene, scene);
    await p.waitForTimeout(320);
  };
  const location = () => p.evaluate(() => [__MOSS__.state.sceneId, __MOSS__.state.player.x, __MOSS__.state.player.y]);
  const pressOut = async (key, scene) => {
    await p.keyboard.down(key);
    try { await p.waitForFunction(scene => __MOSS__.state.sceneId === scene, scene); }
    finally { await p.keyboard.up(key); }
    await p.waitForTimeout(320);
  };
  // 从室外真实按 E 进入偏置门，再从第二格宽门走出去。
  await pose('mill_village',10,18);
  await p.keyboard.press('e'); await settled('mill_bakery');
  assert.deepEqual(await location(), ['mill_bakery',7,10]);
  ok('偏置门进入对应内侧落点', true);
  await pose('mill_bakery',8,10);
  await pressOut('ArrowDown','mill_village');
  assert.deepEqual(await location(), ['mill_village',10,18]);
  ok('宽门第二格可步行出门', true);

  await pose('mill_village',24,14);
  await p.keyboard.press('e'); await settled('mill_workshop');
  assert.deepEqual(await location(), ['mill_workshop',1,7]);
  ok('磨坊侧门进入西墙内侧', true);
  assert.deepEqual(await p.evaluate(() => __MOSS__.questExitTile()), [0,7]);
  ok('室内引导选择真实可达侧门', true);
  await pressOut('ArrowLeft','mill_village');
  assert.deepEqual(await location(), ['mill_village',25,14]);
  ok('侧门返回对应室外侧巷', true);
  await p.waitForTimeout(400);
  assert.equal((await location())[0], 'mill_village');
  ok('门外停留不会自动往返切换', true);

  await pose('mill_village',29,17);
  await p.keyboard.press('e'); await settled('mill_workshop');
  assert.deepEqual(await location(), ['mill_workshop',10,12]);
  await p.keyboard.press('e'); await settled('mill_village');
  assert.deepEqual(await location(), ['mill_village',29,17]);
  ok('同一房间主门与侧门的进出落点独立', true);

  // 临时空房间用于四墙通行与配置拒绝测试，不进入正式游戏内容或存档。
  await p.evaluate(() => {
    const M = __MOSS__, source = M.MAPS.house, floor = source.t[3][3], wall = source.t[0][0];
    M.MAPS.door_test = { w:10,h:8,indoor:true,name:'门验收室',exits:[],buildings:[],decor:[],
      t:Array.from({length:10},(_,x)=>Array.from({length:8},(_,y)=>x===0||x===9||y===0||y===7?wall:floor)),
      solid:Array.from({length:10},(_,x)=>Array.from({length:8},(_,y)=>x===0||x===9||y===0||y===7?1:0)) };
    M.INTERACTABLES.door_test=[];
    M.installIndoorDoors('door_test',[
      {id:'main',side:'north',x:4,y:0,width:2,to:'farm',tx:3,ty:5},
      {id:'east',side:'east',x:9,y:3,to:'farm',tx:3,ty:5},
      {id:'south',side:'south',x:6,y:7,to:'farm',tx:3,ty:5},
      {id:'west',side:'west',x:0,y:4,to:'farm',tx:3,ty:5}
    ]);
  });
  for (const [name,x,y,key] of [['north',4,1,'ArrowUp'],['north-wide',5,1,'ArrowUp'],['east',8,3,'ArrowRight'],['south',6,6,'ArrowDown'],['west',1,4,'ArrowLeft']]) {
    await pose('door_test',x,y);
    await pressOut(key,'farm');
    assert.deepEqual(await location(), ['farm',3,5]);
    ok(name + ' 门真实键盘通行', true);
  }
  const rejected = await p.evaluate(() => {
    const M = __MOSS__, map = M.MAPS.door_test, original = JSON.stringify(map);
    const invalid = [
      [{id:'main',side:'north',x:0,y:0,to:'farm',tx:3,ty:5}],
      [{id:'main',side:'east',x:9,y:3,width:0,to:'farm',tx:3,ty:5}],
      [{id:'main',side:'north',x:4,y:0,to:'house',tx:1,ty:1}],
      [{id:'main',side:'west',x:0,y:4,to:'farm',tx:3,ty:5,enter:{x:5,y:5}}]
    ];
    return invalid.every(defs => { try { M.installIndoorDoors('door_test',defs); return false; } catch { return JSON.stringify(map)===original; } });
  });
  ok('无效门、角落和阻塞落点拒绝且不改动房间', rejected);
  const furniture = await p.evaluate(() => {
    const M = __MOSS__, map = M.MAPS.house, before = JSON.stringify(map);
    try { M.installIndoorDoors('house',[{id:'main',side:'north',x:1,y:0,to:'farm',tx:3,ty:5}]); return false; }
    catch { return JSON.stringify(map)===before && M.isSolid('house',1,1); }
  });
  ok('门与床冲突拒绝，家具碰撞保留', furniture);

  await pose('mill_workshop',2,7);
  fs.mkdirSync('output/playwright',{recursive:true});
  await p.locator('canvas').first().screenshot({path:'output/playwright/indoor-doors-workshop.png'});
  const cityDoor = await p.evaluate(() => __MOSS__.MAPS.city_bakery.enter);
  await pose('city_bakery',cityDoor.x,cityDoor.y-1);
  await p.locator('canvas').first().screenshot({path:'output/playwright/indoor-doors-city.png'});
  const cache = await p.evaluate(() => {
    const M=__MOSS__,map=M.MAPS.city_bakery,old=map._roomCanvas;
    M.installIndoorDoors('city_bakery',map.doors.map(d=>({...d})));
    return !!old && !map._roomCanvas;
  });
  ok('门配置更新使城市绘制缓存失效', cache);
  await pose('farm',3,5);
  await p.evaluate(() => { delete __MOSS__.MAPS.door_test; delete __MOSS__.INTERACTABLES.door_test; });
  assert.deepEqual(run.errors,[]);
  console.log(`室内门 ${checks}/${checks} PASS${bundled?'（单文件）':''}`);
} finally { await run.browser.close(); }

const mobile = await launch({ viewport:{width:844,height:390}, touch:true,
  ...(bundled ? {url:pathToFileURL(path.resolve('苔芽农场-单文件版.html')).href} : {}) });
try {
  const p = mobile.page;
  await boot(p); await p.locator('#tutorialSkip').click();
  await p.evaluate(() => __MOSS__.devSwitchScene('mill_village',24,14));
  await p.locator('#touchAct').tap();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_workshop');
  await p.waitForTimeout(320);
  assert.deepEqual(await p.evaluate(() => [__MOSS__.state.player.x,__MOSS__.state.player.y]),[1,7]);
  ok('手机交互按钮进入对应侧门',true);
  // 真实按住移动控件，走到西墙门槛后立即松开，防止换场景后继续移动。
  const box = await p.locator('[data-dir="-1,0"]').boundingBox();
  await p.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await p.mouse.down();
  try { await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_village'); }
  finally { await p.mouse.up(); }
  await p.waitForTimeout(320);
  assert.deepEqual(await p.evaluate(() => [__MOSS__.state.player.x,__MOSS__.state.player.y]),[25,14]);
  ok('手机移动控件通过侧门返回侧巷',true);
  await p.locator('#touchAct').tap();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_workshop');
  await p.waitForTimeout(320);
  await p.locator('#touchAct').tap();
  await p.waitForFunction(() => __MOSS__.state.sceneId === 'mill_village');
  await p.waitForTimeout(320);
  assert.deepEqual(await p.evaluate(() => [__MOSS__.state.player.x,__MOSS__.state.player.y]),[25,14]);
  ok('手机交互按钮也可直接出门',true);
  assert.deepEqual(mobile.errors,[]);
  console.log(`室内门含手机 ${checks}/${checks} PASS${bundled?'（单文件）':''}`);
} finally { await mobile.browser.close(); }
