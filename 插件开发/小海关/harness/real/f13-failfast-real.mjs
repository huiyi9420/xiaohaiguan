#!/usr/bin/env node
/* ============================================================================
 * F13 关键失败中止真实校验（红灯 RD1-RD3 复现 + 现行 G1-G4 全绿）
 * ----------------------------------------------------------------------------
 * 缺陷：a) applyFw 对 fw.sh apply 的命令执行错误(工具缺失/拒权/链操作失败)仅
 *   opLog 告警恒 return true——接管未生效被当成功；b) syncLineRules/switchMode
 *   writeFile(CFG,yaml) 返回值未查即 apiPut 热重载——写盘失败仍发起重载，
 *   apiPut 成功=引擎内存与盘上配置分叉；c) genFwSh 门控不可用"本次未挂接管"
 *   仅 WARN 级，applyFw 无法判级。
 * 修复：applyFw 致命分级(not found/Permission denied/No chain/Bad argument/
 *   iptables: error/ip6tables:/Operation not permitted/ERR:)→toast+opLog+return
 *   false；纯 WARN/INFO 保留不中止；engineStart 消费 fwOk(不中止启动,文案区分)；
 *   syncLineRules/switchMode 写盘失败不 apiPut(签名回滚/模式保留)；genFwSh 门控
 *   不可用升级 ERR 前缀。
 *
 * 同源保证：现行 applyFw/genFwSh/writeFile/readEtState/syncLineRules/lineSig/
 *   switchMode/genConfigYaml 链经 AST 从 插件.js 提取，run() 经 RealEnv.exec 真实
 *   容器执行；修复前旧体取自 entry-baseline-snapshot.js 作红灯对照。
 * 夹具：a) alpine 基础容器不装 iptables/ipset → fw.sh apply 输出 not found 类
 *   真实执行错误；b/c) CFG 指向不可写路径(/proc/f13-ro)使 writeFile 真实失败
 *   (writeFile 尾部 wc -c 复核),apiPut 为纯计数 stub(任务许可:被测的是"是否
 *   调用",非其结果)。
 *   RD1 红灯：修复前 applyFw 在致命输出下仍 return true
 *   RD2 红灯：修复前 syncLineRules 写盘失败仍发起 apiPut(计数>0)
 *   RD3 红灯：修复前 switchMode 写盘失败仍发起 apiPut(计数>0)
 *   G1 现行 applyFw 致命→return false+可读原因；G2 syncLineRules 零 apiPut+sig 回滚；
 *   G3 switchMode 零 apiPut+模式保留文案；G4 genFwSh 门控行 ERR 级+engineStart 消费
 * 退出码：0=全过；1=有失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, MIHOMO_DIR } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
const PLUG = path.resolve(HERE, '..', '..', '插件.js');
const SNAP = path.resolve(HERE, '..', 'entry-baseline-snapshot.js');
const plugSrcForCtx = fs.readFileSync(PLUG, 'utf8');

function findFn(tree, name) {
  let fn = null;
  (function f(n) {
    if (fn || !n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { fn = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  return fn;
}
/* 从指定源(现行/快照)提取函数集入 VM；inject 用于覆盖路径常量(CFG 指向不可写处) */
async function buildVm(env, source, funcs, opt = {}) {
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let body = null;
  if (!opt.topLevel) (function f(n) { /* 现行源在入口 IIFE 内;快照源传 topLevel: true 直接用顶层声明(防误配深处理闭包) */
    if (body || !n || typeof n !== 'object') return;
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'CallExpression'
      && n.expression.callee && n.expression.callee.type === 'ArrowFunctionExpression') { body = n.expression.callee.body.body; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  const FSET = new Set(funcs);
  const decls = [];
  for (const n of (body || tree.body)) { /* 现行源在 IIFE 内,快照源为顶层声明集 */
    if (n.type === 'FunctionDeclaration' && FSET.has(n.id.name)) decls.push(source.slice(n.start, n.end));
  }
  if (decls.length !== funcs.length && opt.fallback) { /* 快照缺的辅助函数(本轮未改)从现行源补提取 */
    const t2 = acorn.parse(opt.fallback, { ecmaVersion: 2020, sourceType: 'module' });
    for (const nm of funcs) {
      if (decls.some(d => d.includes('function ' + nm + '('))) continue;
      const fn2 = findFn(t2, nm);
      if (fn2) decls.push(opt.fallback.slice(fn2.start, fn2.end));
    }
  }
  if (decls.length !== funcs.length) throw new Error('提取不全(' + decls.length + '/' + funcs.length + '):' + funcs.filter(f => !decls.some(d => d.includes('function ' + f + '('))).join(','));
  { /* seedState 需要生产默认配置 DEF——同源提取(现行源入口 IIFE 内的顶层 const) */
    let t3 = acorn.parse(plugSrcForCtx, { ecmaVersion: 2020, sourceType: 'module' });
    let ibody = null;
    (function g(n) {
      if (ibody || !n || typeof n !== 'object') return;
      if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'CallExpression'
        && n.expression.callee && n.expression.callee.type === 'ArrowFunctionExpression') { ibody = n.expression.callee.body.body; return }
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(g); else if (v && typeof v === 'object') g(v) }
    })(t3);
    const seeds = {};
    for (const n of ibody) if (n.type === 'VariableDeclaration') {
      for (const d of n.declarations) if (d.id.name === 'DEF' || d.id.name === 'PORT_DEF') seeds[d.id.name] = n.kind + ' ' + plugSrcForCtx.slice(d.start, d.end) + ';';
    }
    if (seeds.DEF) decls.unshift(seeds.DEF);
    if (seeds.PORT_DEF) decls.unshift(seeds.PORT_DEF); /* 后 unshift 者在前:PORT_DEF 先于 DEF 求值 */
  }
  const mods = {};
  for (const name of ['工具', '订阅解析', '启动脚本', '状态采集']) {
    Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  }
  const calls = { toasts: [], logs: [], apiPuts: 0, saveConf: 0 };
  const RO_DIR = '/proc/f13-ro'; /* 内核拒绝写入,writeFile 必真实失败(mkdir/printf 全败,wc -c 复核不过) */
  const DIR = opt.writable ? MIHOMO_DIR : RO_DIR;
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, setTimeout, File, ...mods,
    DIR, CFG: DIR + '/config.yaml', FW: DIR + '/fw.sh', START: DIR + '/start.sh', BIN: DIR + '/mihomo',
    LOGF: DIR + '/customs.log', BOOT_SH: DIR + '/ufi_tools_boot.sh', HS_WFILE_MAX: 64 * 1024, V: '2.2.1',
    HS_GAME_DOMAINS: [], HS_MANUAL_LOADED: true,
    readEtState: async () => { }, /* 吸收:共存状态读取副作用,不进入被测判定路径(本轮未改它) */
    etSig: () => '', syncEtRules: async () => { }, /* v2.4.1 新增: applyFw 内 HS_ET_SIG=etSig() 调用,吸收副作用 */
    HS_ET_SIG: '', reapplyFw: async () => { },
    run: async (cmd, t) => { const r = await env.exec(String(cmd), Math.min((Number(t) || 5000) + 10000, 130000)); return { success: r.code === 0, content: r.out }; },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    toast: (m, c) => { calls.toasts.push(String(m)); },
    opLog: async m => { calls.logs.push(String(m)); return ''; },
    saveConf: async () => { calls.saveConf++; return true },
    apiPut: async (p, body2) => { calls.apiPuts++; return true }, /* 纯计数 stub:被测=是否调用 */
    hsUploadByApi: async () => null,
    ET_CACHE: null, ET_ERR: '',
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return { ctx, calls };
}
/* 运行态变量(C/ST/HS_LINE_*)注入 */
function seedState(ctx, extra = '') {
  vm.runInContext(`
    HS_LINE_SIG=''; HS_LINE_BUSY=false; HS_UPGRADING=false; HS_UPG_OK=false; HS_LAST_ERR='';
    C = JSON.parse(JSON.stringify(DEF));
    C.policySrc='direct'; C.activeSub=0; C.subs=[{name:'f13',url:'https://example.invalid/s'}];
    C.secret='f13'; C.s1='all'; C.s2=false; C.logEnabled=false;
    C.ports=Object.assign({}, DEF.ports, {ctrl:27914, mixed:27911, redir:27912, dns:27913});
    HS_SUB_RAW=${JSON.stringify(RAW)}; HS_SUB_RAW_KEY='0'; HS_SUBINFO=undefined; HS_MANUAL=[]; ET_CACHE=null;
    ST={bin:false,pid:'',boot:false,listen:{},tun:false,kb:0,rlog:0,olog:0,chn:0,chn6:0,arp4:{},neigh6:{},running:true};
    ${extra}`, ctx);
}
const RAW = 'proxies:\n  - {name: n1, type: ss, server: 192.0.2.1, port: 18081, cipher: aes-128-gcm, password: f13pass}\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [n1]\nrules:\n  - MATCH,订阅选择\n';

let env = null;
try {
  const plugSrc = fs.readFileSync(PLUG, 'utf8');
  const snapSrc = fs.readFileSync(SNAP, 'utf8');

  env = new RealEnv();
  await env.start();
  await env.installTools(); /* curl+lighttpd;iptables/ipset 故意不装——致命错误真实源 */
  const noIpt = (await env.exec('command -v iptables ipset 2>/dev/null | wc -l')).out.trim();
  check('夹具前置：容器无 iptables/ipset（fw.sh apply 必产生真实执行错误）', noIpt === '0', '命中命令数=' + noIpt);
  await env.exec('mkdir -p ' + MIHOMO_DIR);

  /* ---------- RD1/G1: applyFw 在致命输出下的返回值（旧体 vs 现行） ---------- */
  const runApplyFw = async (src, label) => {
    const v = await buildVm(env, src, ['applyFw', 'genFwSh', 'writeFile'], { writable: true, topLevel: src === snapSrc, fallback: plugSrc });
    seedState(v.ctx);
    const ret = await vm.runInContext('(async () => applyFw())()', v.ctx, { timeout: 60000 });
    const fwOut = (await env.exec('sh ' + MIHOMO_DIR + '/fw.sh apply 2>&1 | grep -ci "not found"')).out.trim(); /* 全文 not found 行计数(首行可能是 cleaned) */
    return { ret, fwOut, calls: v.calls };
  };
  {
    const probe = (await env.exec('sh -c \'command -v iptables || echo iptables: not found\' 2>&1')).out.trim();    const old = await runApplyFw(snapSrc, '旧');
    check('RD1 红灯复现：修复前 applyFw 遇真实执行错误(not found×N)仍 return true（接管未生效被当成功）',
      old.ret === true && Number(old.fwOut) > 0,
      `旧ret=${old.ret} not found行数=${old.fwOut}`);
    const cur = await runApplyFw(plugSrc, '现行');
    check('G1 现行 applyFw 致命输出 → return false + 可读原因（toast/opLog）',
      cur.ret === false && cur.calls.toasts.some(t => t.includes('规则挂载失败')) && cur.calls.logs.some(l => l.includes('致命失败')),
      `ret=${cur.ret} toast=${(cur.calls.toasts[0] || '').slice(0, 60)} log=${(cur.calls.logs[0] || '').slice(0, 60)}`);
  }

  /* ---------- RD2/G2: syncLineRules 写盘失败是否仍 apiPut ---------- */
  const runSync = async (src) => {
    const v = await buildVm(env, src, ['syncLineRules', 'lineSig', 'genConfigYaml', 'writeFile', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc'], { writable: false, topLevel: src === snapSrc, fallback: plugSrc });
    seedState(v.ctx, "C.lines=[{id:'ln1'}]; C.devices=[{line:'ln1', mac:'AA:BB:CC:DD:EE:01', ip:'192.0.2.50', name:'d1'}];");
    const sigBefore = vm.runInContext('lineSig()', v.ctx);
    const ret = await vm.runInContext('(async () => syncLineRules())()', v.ctx, { timeout: 60000 });
    const sigAfter = vm.runInContext('HS_LINE_SIG', v.ctx);
    return { apiPuts: v.calls.apiPuts, logs: v.calls.logs, sigBefore, sigAfter, cfgWritten: await vm.runInContext('0', v.ctx) };
  };
  {
    const old = await runSync(snapSrc);
    check('RD2 红灯复现：修复前 syncLineRules 写盘失败(不可写路径)仍发起 apiPut 热重载',
      old.apiPuts > 0 && old.sigBefore !== '',
      `apiPut调用=${old.apiPuts} 签名非空=${old.sigBefore !== ''}(${old.sigBefore.slice(0, 30)})`);
    const cur = await runSync(plugSrc);
    check('G2 现行 syncLineRules 写盘失败 → apiPut 零调用 + 签名回滚 + 可读日志',
      cur.apiPuts === 0 && cur.sigAfter === '' && cur.logs.some(l => l.includes('写盘失败')),
      `apiPut=${cur.apiPuts} sig回滚=${cur.sigAfter === ''} log=${(cur.logs[0] || '').slice(0, 50)}`);
  }

  /* ---------- RD3/G3: switchMode 写盘失败是否仍 apiPut ---------- */
  const runSwitch = async (src) => {
    const v = await buildVm(env, src, ['switchMode', 'genConfigYaml', 'writeFile', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc'], { writable: false, topLevel: src === snapSrc, fallback: plugSrc });
    seedState(v.ctx);
    await vm.runInContext('(async () => switchMode("manual"))()', v.ctx, { timeout: 60000 });
    return { apiPuts: v.calls.apiPuts, toasts: v.calls.toasts, logs: v.calls.logs, mode: await vm.runInContext('C.mode', v.ctx) };
  };
  {
    const old = await runSwitch(snapSrc);
    check('RD3 红灯复现：修复前 switchMode 写盘失败仍发起 apiPut 热重载',
      old.apiPuts > 0,
      `apiPut调用=${old.apiPuts}`);
    const cur = await runSwitch(plugSrc);
    check('G3 现行 switchMode 写盘失败 → apiPut 零调用 + 模式保留 + 可读提示',
      cur.apiPuts === 0 && cur.mode === 'manual' && cur.toasts.some(t => t.includes('写盘失败')) && cur.logs.some(l => l.includes('写盘失败')),
      `apiPut=${cur.apiPuts} 模式已保存=${cur.mode} toast=${(cur.toasts[0] || '').slice(0, 50)}`);
  }

  /* ---------- G4: genFwSh 门控 ERR 级 + engineStart 消费 fwOk ---------- */
  {
    const tree = acorn.parse(plugSrc, { ecmaVersion: 2020, sourceType: 'module' });
    const gf = findFn(tree, 'genFwSh'), es = findFn(tree, 'engineStart'), af = findFn(tree, 'applyFw');
    const t = plugSrc.slice(gf.start, gf.end), e = plugSrc.slice(es.start, es.end), a = plugSrc.slice(af.start, af.end);
    check('G4 genFwSh 门控不可用升级 ERR 级 + applyFw 致命分级 + engineStart 消费 fwOk',
      t.includes('"ERR: 白名单门控不可用') && !t.includes('"WARN: 白名单门控不可用')
      && a.includes('return false') && a.includes('not found') && a.includes('ERR:')
      && e.includes('const fwOk = await applyFw()') && e.includes('规则挂载失败——流量未接管'),
      `ERR行=${t.includes('"ERR: 白名单门控不可用')} 致命分级=${a.includes('not found') && a.includes('ERR:')} engineStart消费=${e.includes('const fwOk = await applyFw()')}`);
  }

  await env.exec('for P in $(pidof mihomo); do kill $P 2>/dev/null; done; true').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f13] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F13失败中止真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF13 失败中止真实校验全部通过');
process.exit(bad.length ? 1 : 0);
