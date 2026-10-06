#!/usr/bin/env node
/* ============================================================================
 * F09 线路候选池精确边界真实校验（先红后绿）
 * ----------------------------------------------------------------------------
 * 夹具：订阅节点 ['香港1','香港10','美国1']（lighttpd 真实 http provider 拉取）
 *       手选节点 ['香港1','手动节点A']；线路 nodes=['香港1']（点名精确集合）
 * 红灯（现行代码）：self 池含香港10（filter 子串污染）；merge 池含手动节点A（use=manual 全量污染）
 * 绿灯（修复后）：self/merge 线路池节点成员精确=['香港1']；香港10/美国1/手动节点A 均不在；
 *                空线路不生成池组；真实 mihomo 启动经 /proxies API 断言实际成员。
 * 说明：产物 tun.enable 由探针置 false——容器非特权无法建 TUN 设备（环境适配，不影响池成员语义）。
 * 退出码：0=全部通过；1=存在失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, ensureHostAsset, MIHOMO_DIR, MIHOMO_BIN } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const YAML = (await import('yaml')).default;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}

const SUB_NODES = ['香港1', '香港10', '美国1'];
const MANUAL_NODES = ['香港1', '手动节点A'];
const subProviderYaml = 'proxies:\n' + SUB_NODES.map(n => `  - {name: ${JSON.stringify(n)}, type: ss, server: 192.0.2.${10 + SUB_NODES.indexOf(n)}, port: 18081, cipher: aes-128-gcm, password: f09-local-test}`).join('\n') + '\n';
const manualProviderYaml = 'proxies:\n' + MANUAL_NODES.map(n => `  - {name: ${JSON.stringify(n)}, type: ss, server: 192.0.2.5${MANUAL_NODES.indexOf(n)}, port: 18082, cipher: aes-128-gcm, password: f09-local-test}`).join('\n') + '\n';

async function buildVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'DIR', 'BIN', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'C', 'ST', 'ET_CACHE', 'HS_GAME_DOMAINS', 'HS_MANUAL', 'HS_SUB_RAW', 'HS_SUB_RAW_KEY', 'HS_MANUAL_LOADED', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'genFwSh', 'genStartSh', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析', '启动脚本']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const ctx = vm.createContext({ console, TextEncoder, URL, btoa, atob, ...mods });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    gen(mode, subRaw, lines) {
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); ST = {chn:0,geoSiteT:0,geoIpT:0,neigh6:{}}; ET_CACHE=null;`, ctx);
      ctx.input = { subRaw, lines };
      vm.runInContext(`HS_MANUAL = ['香港1','手动节点A']; HS_SUB_RAW = input.subRaw; HS_SUB_RAW_KEY='';
        C.policySrc = '${mode}'; C.activeSub = 0; C.mode='manual';
        C.subs = [{name:'隔离测试', url:'http://127.0.0.1:28086/sub0.yaml', time:'2026-01-01 00:00'}];
        C.lines = input.lines;`, ctx);
      return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 });
    }
  };
}

const groupYaml = (n, mode) => `proxies:\n  - {name: ${JSON.stringify(n)}, type: ss, server: 192.0.2.1, port: 18081, cipher: aes-128-gcm, password: f09}\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [${JSON.stringify(n)}]\nrules:\n  - MATCH,订阅选择\n`;
const simpleSub = SUB_NODES.map(n => groupYaml(n).split('proxies:\n')[1].split('proxy-groups')[0]).join('');

let env = null;
try {
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f09] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();

  /* 夹具：http provider 源 + 本地 provider 文件 */
  await env.exec('mkdir -p /tmp/f09 ' + MIHOMO_DIR + '/providers');
  await env.writeContainerFile('/tmp/f09/sub0.yaml', subProviderYaml);
  await env.writeContainerFile(MIHOMO_DIR + '/providers/manual.yaml', manualProviderYaml);
  await env.writeContainerFile('/tmp/f09/lighttpd.conf', [
    'server.modules = ( "mod_accesslog" )', 'server.port = 28086', 'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f09"', 'accesslog.filename = "/tmp/f09/access.log"',
    'server.errorlog = "/tmp/f09/error.log"', 'server.pid-file = "/tmp/f09/lighttpd.pid"', ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f09/lighttpd.conf >/dev/null 2>&1 & sleep 0.8; curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28086/sub0.yaml');
  const srv = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28086/sub0.yaml')).out.trim();
  check('夹具服务就绪（lighttpd 28086 http provider 源）', srv === '200', 'http_code=' + srv);

  const vmg = await buildVm();
  const subRaw = 'proxies:\n' + SUB_NODES.map(n => `  - {name: ${JSON.stringify(n)}, type: ss, server: 192.0.2.3, port: 18081, cipher: aes-128-gcm, password: f09-merge}`).join('\n')
    + '\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [' + SUB_NODES.map(n => JSON.stringify(n)).join(', ') + ']\nrules:\n  - MATCH,订阅选择\n';
  const LINE = { id: 'L1', name: '游戏', mode: 'node', nodes: ['香港1'], pick: 'manual' };

  /* 真实 mihomo 启动 + /proxies 成员读取（单次 exec 内启动→provider 就绪等待→抓取→清理）
     F09-r2: 就绪信号=/providers/proxies 中全部期望 provider 出现且连续两次采样节点数稳定(有界 25 次)——
     不靠运气采样(此前未稳定态采样导致 self 双成员 flake) */
  async function bootAndProxies(yamlText, expectProviders) {
    const doc = YAML.parseDocument(yamlText);
    doc.setIn(['tun', 'enable'], false); /* 环境适配：非特权容器无法建 TUN 设备(池成员语义不受影响) */
    const secret = String(doc.getIn(['secret']) || '');
    const ctrl = String(doc.getIn(['external-controller']) || '').split(':').pop() || '9090';
    await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', String(doc));
    const script = [
      'cd ' + MIHOMO_DIR + ' && rm -f m.out m.err',
      'setsid sh -c ' + JSON.stringify(MIHOMO_BIN + ' -d ' + MIHOMO_DIR + ' >m.out 2>m.err') + ' &',
      'R=""; PREV=-1; STABLE=0; READY=0',
      'for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do sleep 1',
      'P=$(curl -s -m 5 -H ' + JSON.stringify('Authorization: Bearer ' + secret) + ' http://127.0.0.1:' + ctrl + '/providers/proxies 2>/dev/null)',
      'N=$(echo "$P" | grep -o \'"name\":\' | wc -l)',
      'R=$(curl -s -m 5 -H ' + JSON.stringify('Authorization: Bearer ' + secret) + ' http://127.0.0.1:' + ctrl + '/proxies 2>/dev/null)',
      'M=$(echo "$R" | grep -o \xe9\xa6\x99\xe6\xb8\xaf1 | wc -l)',
      'if [ "$N" = "$PREV" ] && [ "$N" -gt 0 ] && echo "$R" | grep -q proxies; then STABLE=$((STABLE+1)); else STABLE=0; fi',
      'PREV=$N',
      'if [ "$STABLE" -ge 3 ]; then READY=1; break; fi',
      'done',
      'P2=$(pidof mihomo); for X in $P2; do kill $X 2>/dev/null; done; sleep 0.5',
      'echo PID:$P2 READY:$READY; echo ===PROXIES===; echo "$R"; echo ===PROV===; curl -s -m 5 -H ' + JSON.stringify('Authorization: Bearer ' + secret) + ' http://127.0.0.1:' + ctrl + '/providers/proxies 2>/dev/null | head -c 2000; echo ===OUT===; head -c 300 m.out 2>/dev/null; echo ===ERR===; head -c 300 m.err 2>/dev/null'
    ].join('\n'); /* & 后不可接 ;，换行分隔(BusyBox sh) */
    const r = await env.exec(script, 120000);
    const out = r.out || '';
    const pidPart = ((out.match(/PID:(.*) READY:(\d)/) || [])[1] || '').trim();
    const ready = (out.match(/READY:(\d)/) || [])[1] === '1';
    const jsonPart = (out.split('===PROXIES===')[1] || '').split('===PROV===')[0].trim();
    let proxies = null;
    try { proxies = JSON.parse(jsonPart).proxies || null; } catch (e) { }
    if (!proxies || !ready) {
      return { ok: false, tail: ('pid=[' + pidPart + '] ready=' + ready + ' json头部:' + jsonPart.slice(0, 80) + ' err:' + (out.split('===ERR===')[1] || '').slice(0, 100)).slice(0, 300) };
    }
    return { ok: true, proxies };
  }
  /* 节点类成员 = 组 all − 静态子组名/内置策略/其他组名 */
  function nodeMembersOf(proxies, groupName, allGroupNames) {
    const g = proxies[groupName];
    if (!g || !Array.isArray(g.all)) return null;
    const meta = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL']);
    return g.all.filter(m => !meta.has(m) && !allGroupNames.has(m));
  }

  const EXPECT = ['香港1'];
  const POLLUTERS = ['香港10', '美国1', '手动节点A'];
  const allNamesOf = proxies => new Set(Object.keys(proxies).filter(k => proxies[k] && Array.isArray(proxies[k].all))); /* 有 all 字段者=组 */

  for (const mode of ['self', 'merge']) {
    const y = vmg.gen(mode, mode === 'self' ? '' : subRaw, [LINE]);
    if (y === null) { check(mode + ' 生成', false, 'genConfigYaml 返回 null'); continue; }
    const boot = await bootAndProxies(y);
    if (!boot.ok) { check(mode + ' 真实 mihomo 启动', false, boot.tail); continue; }
    const gnames = allNamesOf(boot.proxies);
    const pool = '🛤️ 游戏';
    const members = nodeMembersOf(boot.proxies, pool, gnames);
    if (members === null) { check(mode + ' 线路池成员读取(' + pool + ')', false, '组不存在或无 all'); continue; }
    const sorted = [...members].sort();
    const sortedExpect = [...EXPECT].sort();
    const exact = JSON.stringify(sorted) === JSON.stringify(sortedExpect) && new Set(members).size === members.length;
    check(mode + ' 线路池成员精确=点名集合[' + EXPECT.join(',') + ']（污染节点不在）', exact,
      '实际=' + JSON.stringify(members));
  }

  /* merge 孤儿 provider 清理断言：静态化后未被 use 的 ln_* 不出现在产物 */
  {
    const y = vmg.gen('merge', subRaw, [LINE]);
    const doc = YAML.parseDocument(y);
    const js = doc.toJS();
    const ppKeys = Object.keys((js['proxy-providers'] || {}));
    const usedLn = new Set();
    (js['proxy-groups'] || []).forEach(g => (g.use || []).forEach(u => { if (/^ln_/.test(u)) usedLn.add(u); }));
    const orphans = ppKeys.filter(k => /^ln_/.test(k) && !usedLn.has(k));
    check('merge 无孤儿 ln_* provider（仅输出仍被 use 引用者）', orphans.length === 0 && [...usedLn].every(u => ppKeys.includes(u)),
      'providers=' + JSON.stringify(ppKeys) + ' usedLn=' + JSON.stringify([...usedLn]));
  }

  /* 空线路：nodes=[] → 不生成池组且引用安全（启动成功=无悬空） */
  {
    const y = vmg.gen('self', '', [{ id: 'L2', name: '空线', mode: 'node', nodes: [], pick: 'manual' }]);
    const doc = YAML.parseDocument(y);
    const gnames = (doc.toJS()['proxy-groups'] || []).map(g => g && g.name).filter(Boolean);
    const noPool = !gnames.includes('🛤️ 空线');
    const boot = await bootAndProxies(y);
    check('空线路：池组不生成或引用安全（启动无悬空）', noPool || boot.ok, '池组缺席=' + noPool + ' 启动=' + boot.ok + (boot.ok ? '' : ' ' + boot.tail));
  }

  await env.exec('kill $(cat /tmp/f09/lighttpd.pid) 2>/dev/null; rm -f /tmp/f09/lighttpd.pid').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f09] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F09线路池真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF09 线路池真实校验全部通过');
process.exit(bad.length ? 1 : 0);
