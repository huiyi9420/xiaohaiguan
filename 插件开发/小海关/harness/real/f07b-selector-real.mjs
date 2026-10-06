#!/usr/bin/env node
/* ============================================================================
 * F07/F08 真实容器语义校验（红灯先行→修复→全绿）
 * ----------------------------------------------------------------------------
 * F07：生成侧 select 组输出 default 字段，Mihomo v1.19.32 selector 实际消费
 *   default-selected（官方 selector.go）——default 被内核忽略，指定默认选择不生效。
 * F08：store-selected/store-fake-ip 写在顶层被忽略，应位于 profile: 块
 *   （Profile.StoreSelected 默认 true 此前救了选择持久化；StoreFakeIP 默认 false
 *   致 fake-ip 映射未持久化——迁入 profile 并显式 true 为行为增强）。
 *
 * 验证（真实 mihomo v1.19.32，生产固定路径）：
 *   A default-selected 生效：生成配置(HS_MANUAL+mode=balance) -t 通过 → 启动 →
 *     GET /proxies/🚀 节点选择 的 now === '⚖️ 负载均衡'（指定默认选中值）
 *   B profile 块：产物含 profile.store-selected/store-fake-ip 显式 true 且 -t 通过
 *   C 对比实验（旧字段忽略实证）：同配置把 default-selected 行改回 default →
 *     启动后 now === 首项 '♻️ 自动选优'（≠指定值——内核忽略旧字段的直接证据）
 * 红灯（修复前）：A 的 now≠⚖️（default 被忽略取首项）；B 无 profile 块。
 * 退出码：0=全过；1=有失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, ensureHostAsset, MIHOMO_DIR, MIHOMO_BIN } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
const PORTS = { ctrl: 27951, mixed: 27952, redir: 27953, dns: 27954 };
const SEC = 'f07b-selector-secret';
const GROUP = '🚀 节点选择';

/* f05 同款 VM：AST 提取 genConfigYaml 链 */
async function buildGenVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'DIR', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'C', 'ST', 'ET_CACHE', 'HS_GAME_DOMAINS', 'HS_MANUAL', 'HS_SUB_RAW',
    'HS_SUB_RAW_KEY', 'HS_MANUAL_LOADED', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const ctx = vm.createContext({ console, TextEncoder, URL, btoa, atob, ...mods, opLog: async () => '', toast: () => { } });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    gen() {
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); ST = {chn:0,geoSiteT:0,geoIpT:0,neigh6:{}};
        C.policySrc='self'; C.mode='balance'; C.secret=${JSON.stringify(SEC)};
        C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(PORTS)});
        HS_MANUAL=['测试节点']; HS_SUB_RAW=''; ET_CACHE=null;`, ctx);
      return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 });
    }
  };
}

/* 启动真引擎并取组 now 值 */
async function bootAndGetNow(env, yamlText) {
  await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', yamlText);
  await env.exec('for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe)" = ' + MIHOMO_BIN + ' ] && kill $P; done 2>/dev/null; sleep 0.8; true', 10000);
  const t = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -1', 60000);
  const tOk = /successful/i.test(t.out);
  await env.exec('nohup sh -c \'' + MIHOMO_BIN + ' -d ' + MIHOMO_DIR + ' >/dev/null 2>&1\' >/dev/null 2>&1 & sleep 0.5; I=0; while [ $I -lt 15 ]; do C=$(curl -s -m 2 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ' + SEC + '" http://127.0.0.1:' + PORTS.ctrl + '/version 2>/dev/null); [ "$C" = "200" ] && break; sleep 1; I=$((I+1)); done; echo READY=$C', 25000);
  await env.exec('curl -s -m 5 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/proxies/' + encodeURIComponent(GROUP) + '" > /tmp/f07b-prox.json 2>/dev/null', 10000);
  const q = await env.exec('head -c 2000 /tmp/f07b-prox.json', 10000);
  let now = '';
  const m = /"now":"([^"]*)"/.exec(q.out); if (m) now = m[1];
  await env.exec('for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe)" = ' + MIHOMO_BIN + ' ] && kill $P; done 2>/dev/null; sleep 0.8; true', 10000);
  return { tOk, tTail: t.out.trim().slice(-60), now, raw: q.out.slice(0, 90) };
}

let env = null;
try {
  const vmg = await buildGenVm();
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f07b] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();

  const yamlNew = vmg.gen();
  const yamlOld = yamlNew.replace(/default-selected:/g, 'default:'); /* 对比实验:唯一差异字段名 */
  check('夹具前提：新旧配置仅 default-selected/default 字段名不同', yamlNew !== yamlOld
    && yamlNew.includes('profile:') === yamlOld.includes('profile:'),
    `差异行数=${yamlNew.split('\n').filter((l, i) => l !== yamlOld.split('\n')[i]).length}`);

  /* A: default-selected 生效（now=指定默认选中值） */
  const a = await bootAndGetNow(env, yamlNew);
  check('A default-selected 生效：-t 通过且启动后组 now=指定默认值(⚖️ 负载均衡)',
    a.tOk && a.now === '⚖️ 负载均衡', `-t=${a.tOk} now=${a.now} raw=[${a.raw}]`);

  /* B: profile 块两键显式 true 且整份配置 -t 通过 */
  const b = yamlNew.includes('profile:\n  store-selected: true\n  store-fake-ip: true');
  check('B profile 块：store-selected/store-fake-ip 显式 true 且 -t 通过',
    b && a.tOk, `含profile块=${b} -t=${a.tOk}`);

  /* C: 对比实验——旧字段 default 被内核忽略（now=首项而非指定值） */
  const c = await bootAndGetNow(env, yamlOld);
  check('C 对比实证：旧字段 default 被内核忽略（now=首项 ♻️ 自动选优 ≠ 指定值）',
    c.tOk && c.now === '♻️ 自动选优' && c.now !== '⚖️ 负载均衡',
    `-t=${c.tOk} now=${c.now} raw=[${c.raw}]`);

  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f07b] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F07F08字段真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF07/F08 字段语义真实校验全部通过');
process.exit(bad.length ? 1 : 0);
