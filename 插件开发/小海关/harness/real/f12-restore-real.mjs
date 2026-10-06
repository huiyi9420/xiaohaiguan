#!/usr/bin/env node
/* ============================================================================
 * F12 升级/恢复链路真实校验（红灯 RD1/RD2 复现 + 现行 G1-G3 全绿）
 * ----------------------------------------------------------------------------
 * 缺陷A(R01)：rollbackUpgrade 恢复判定正则字面量内含 0x08 退格字节（模式实为
 *   \x08R=0\x08），cp 真实输出 'R=0' 恒不匹配 → 恢复成功被误判失败提前 return。
 * 缺陷B：doUpgradeRestart 失败自动回滚分支与 rollbackUpgrade 恢复旧三件套后调
 *   engineRestart()→engineStart()→writeConfigAndValidate() 重新生成并覆盖刚恢复
 *   的备份（恢复形同虚设）；且 cp 成功即 rm 备份（验证前清理）。
 * 修复：engineStart(restore) 恢复模式（跳过磁盘预检/数据补齐/writeConfigAndValidate/
 *   start.sh 重写/applyFw 重生成），直接以盘上三件套启动+探活+三烙印一致复核；
 *   engineRestart(restore) 透传；两回滚段改 engineRestart(true)+恢复验证成功
 *   （rbOk）后才清备份；退格正则整行重写清除。
 *
 * 同源保证：现行 engineStart/writeConfigAndValidate/collectStatus/writeFile/
 *   genConfigYaml 链经 AST 从 插件.js 原文提取，IO 全经 RealEnv.exec 真实容器
 *   （真 mihomo v1.19.32 生产路径启动+鉴权探活）；修复前旧形态从
 *   entry-baseline-snapshot.js 提取（含 0x08 原字节）作红灯对照。
 *
 * 夹具（真实容器）：备份三件套=旧烙印 #gen:v9.9.9+节点甲+端口A(27901-27905)；
 *   当前三件套=新烙印+节点乙+同端口（同 secret，升级场景 C 不变）；面板哨兵源
 *   lighttpd:2333 返回含 __customs_loaded 标记（面板在场的生产路径，防 START
 *   哨兵自删/24s 空等）。真引擎由恢复的 start.sh 实际拉起。
 *   RD1 红灯：修复前正则对真实 'R=0\n' 判 false（恢复成功被误判失败）
 *   RD2 红灯：修复前 engineStart 无 restore 分支（恢复必经重生成覆盖）+现行
 *             writeConfigAndValidate 在盘上为备份时必然覆盖的机制演示
 *   G1 现行正则对 'R=0\n' 判 true；G2 现行 engineStart 有 restore 分支
 *   G3 恢复模式行为：cp 备份→engineStart(true)→三件套逐字节不变、真引擎按备份
 *             启动并监听端口A、探活通过、三烙印一致复核 v9.9.9、未清备份
 *   G4 调用方形态：两回滚段 engineRestart(true)+rbOk 验证后清理；全文件无 0x08
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

const PLUG = path.resolve(HERE, '..', '..', '插件.js');
const V_PLUG = (fs.readFileSync(PLUG, 'utf8').match(/const V = '([\d.]+)'/) || [])[1] || '2.2.1'; /* 动态读当前版本号(发版后无需改夹具) */
const SNAP = path.resolve(HERE, '..', 'entry-baseline-snapshot.js');

/* ---------- AST 提取（同源） ---------- */
function findFn(tree, name) {
  let fn = null;
  (function f(n) {
    if (fn || !n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { fn = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  return fn;
}
function fnTextFrom(source, name) {
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const fn = findFn(tree, name);
  if (!fn) throw new Error(name + ' 未找到');
  return source.slice(fn.start, fn.end);
}
/* rollbackUpgrade 恢复判定正则字面量源文本（可能含 0x08 原字节） */
function restoreRegexSrc(source) {
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const fn = findFn(tree, 'rollbackUpgrade');
  let lit = null;
  (function f(n) {
    if (lit || !n || typeof n !== 'object') return;
    if (n.type === 'Literal' && n.regex) { lit = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(fn);
  if (!lit) throw new Error('rollbackUpgrade 内正则字面量未找到');
  return source.slice(lit.start, lit.end);
}

const NAMES = new Set(['V', 'DIR', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
  'PORT_DEF', 'DEF', 'C', 'ST', 'ET_CACHE', 'HS_GAME_DOMAINS', 'HS_MANUAL', 'HS_SUB_RAW',
  'HS_SUB_RAW_KEY', 'HS_SUBINFO', 'HS_MANUAL_LOADED', 'b64u', 'toB64', 'b64d',
  'HS_WFILE_MAX', 'HS_UPG_OK', 'HS_LAST_ERR', 'HS_LAST_RF', 'HS_UPGRADING', 'UBAK', 'HS_LINE_SIG', 'HS_LINE_BUSY',
  'HS_COLLECT_BUSY', 'HS_ET_SIG', 'HS_UDP_PREV', 'hsConfirmTimer']); /* v2.4.1 新增全局(v2.4.1 后 collectStatus 引用) */
const FUNCS = new Set(['engineStart', 'engineRestart', 'writeConfigAndValidate', 'collectStatus', 'writeFile',
  'syncLineRules', 'lineSig', 'etSig', 'syncEtRules', 'probeNodeUdp', 'probeNodeUdpInner',
  'genConfigYaml', 'genFwSh', 'genStartSh', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);

async function buildMainVm(env) {
  const source = fs.readFileSync(PLUG, 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let body = null;
  (function f(n) {
    if (body || !n || typeof n !== 'object') return;
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'CallExpression'
      && n.expression.callee && n.expression.callee.type === 'ArrowFunctionExpression') { body = n.expression.callee.body.body; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && FUNCS.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (NAMES.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析', '启动脚本', '状态采集']) {
    Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  }
  const calls = { toasts: [], logs: [] };
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, setTimeout, File, ...mods,
    run: async (cmd, t) => { const r = await env.exec(String(cmd), Math.min((Number(t) || 5000) + 10000, 130000)); return { success: r.code === 0, content: r.out }; },
    wait: ms => new Promise(r => setTimeout(r, ms)),
    toast: (m, c) => { calls.toasts.push(String(m)); },
    opLog: async m => { calls.logs.push(String(m)); return ''; },
    saveConf: async () => true,
    renderCard: () => { }, renderPane: () => { }, renderMgrFoot: () => { },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    upgCardClosed: () => true, rmUpgMask: () => { }, mHide: () => { },
    probeNodeUdp: async () => { },
    hsUploadByApi: async () => null,
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return { ctx, calls };
}

/* ---------- 主流程 ---------- */
const PORT_A = { mixed: 27901, redir: 27902, tproxy: 27903, dns: 27904, ctrl: 27905 };
const RAW_A = 'proxies:\n  - {name: 甲节点, type: ss, server: 192.0.2.1, port: 18081, cipher: aes-128-gcm, password: node-a-f12}\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [甲节点]\nrules:\n  - MATCH,订阅选择\n';
const RAW_B = 'proxies:\n  - {name: 乙节点, type: ss, server: 192.0.2.2, port: 18082, cipher: aes-128-gcm, password: node-b-f12}\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [乙节点]\nrules:\n  - MATCH,订阅选择\n';
const OLD_STAMP = '9.9.9';
const rebrand = (txt, stamp) => txt.replace(/#gen:v[\d.]+/g, '#gen:v' + stamp);

let env = null;
try {
  const plugSrc = fs.readFileSync(PLUG, 'utf8');
  const snapSrc = fs.readFileSync(SNAP, 'utf8');

  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f12] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();
  const UBAK = MIHOMO_DIR + '/upgrade_backup';
  const FW = MIHOMO_DIR + '/fw.sh', START = MIHOMO_DIR + '/start.sh', CFG = MIHOMO_DIR + '/config.yaml';

  /* 面板哨兵源: lighttpd:2333 /api/get_custom_head 返回含 __customs_loaded 标记
     (面板在场的生产路径——START 哨兵 200 且带标记→不自删不空等,直落引擎启动行) */
  await env.exec('mkdir -p /tmp/f12/panel/api /tmp/f12/slow');
  await env.exec('printf "__customs_loaded f12-panel-present" > /tmp/f12/panel/api/get_custom_head');
  await env.writeContainerFile('/tmp/f12/panel-lighttpd.conf', [
    'server.modules = ( "mod_accesslog" )',
    'server.port = 2333',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f12/panel"',
    'accesslog.filename = "/tmp/f12/panel-access.log"',
    'server.errorlog = "/tmp/f12/panel-error.log"',
    'server.pid-file = "/tmp/f12/panel.pid"',
    ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f12/panel-lighttpd.conf >/dev/null 2>&1 & sleep 0.6; curl -s http://127.0.0.1:2333/api/get_custom_head');

  /* 生成三件套（同源 genConfigYaml/genStartSh/genFwSh） */
  const mvm = await buildMainVm(env);
  const setCfg = (raw, ports) => vm.runInContext(
    `C = JSON.parse(JSON.stringify(DEF)); C.policySrc='direct'; C.activeSub=0; C.subs=[{name:'f12',url:'https://example.invalid/s'}];
     C.secret='f12restore'; C.s1='off'; C.s2=false; C.logEnabled=false; C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(ports)});
     ST = {bin:false,pid:'',boot:false,listen:{},tun:false,kb:0,rlog:0,olog:0,chn:0,chn6:0,arp4:{},neigh6:{}};
     HS_MANUAL=[]; HS_SUB_RAW=${JSON.stringify(raw)}; HS_SUB_RAW_KEY='0'; HS_SUBINFO=undefined; ET_CACHE=null;`, mvm.ctx);
  const genTrio = async (raw, ports) => {
    setCfg(raw, ports);
    const y = await vm.runInContext('genConfigYaml()', mvm.ctx, { timeout: 10000 });
    const s = await vm.runInContext('genStartSh()', mvm.ctx, { timeout: 10000 });
    const f = await vm.runInContext('genFwSh()', mvm.ctx, { timeout: 10000 });
    if (!y || !s || !f) throw new Error('三件套生成失败(genConfigYaml=' + !!y + ')');
    return { y, s, f };
  };
  const oldTrio = await genTrio(RAW_A, PORT_A);           /* 备份=节点甲+端口A(烙印改旧版) */
  const newTrio = await genTrio(RAW_B, PORT_A);           /* 当前=节点乙+同端口(生产语义:升级不改 C) */
  const bak = { y: rebrand(oldTrio.y, OLD_STAMP), s: rebrand(oldTrio.s, OLD_STAMP), f: rebrand(oldTrio.f, OLD_STAMP) };
  check('夹具资产：备份三件套(旧烙印v' + OLD_STAMP + '+甲节点)与当前三件套逐字节不同且烙印可辨',
    bak.y !== newTrio.y && bak.s !== newTrio.s && bak.f !== newTrio.f
      && bak.y.includes('#gen:v' + OLD_STAMP) && newTrio.y.includes('#gen:v' + V_PLUG),
    `cfg差=${bak.y !== newTrio.y} start差=${bak.s !== newTrio.s} fw差=${bak.f !== newTrio.f}`);

  /* 落盘：DIR=当前三件套，UBAK=备份三件套 */
  await env.exec('mkdir -p ' + UBAK);
  await env.writeContainerFile(FW, newTrio.f);
  await env.writeContainerFile(START, newTrio.s);
  await env.writeContainerFile(CFG, newTrio.y);
  await env.writeContainerFile(UBAK + '/fw.sh', bak.f);
  await env.writeContainerFile(UBAK + '/start.sh', bak.s);
  await env.writeContainerFile(UBAK + '/config.yaml', bak.y);
  await env.exec('chmod 755 ' + FW + ' ' + START);
  const tOk = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' -f ' + UBAK + '/config.yaml 2>&1 | tail -1');
  check('夹具就绪：备份 config.yaml 通过真实 mihomo -t', /successful/i.test(tOk.out), tOk.out.trim().slice(0, 60));

  const fileBytes = async p => (await env.exec('cat ' + p + ' 2>/dev/null | sha256sum | cut -d" " -f1', 5000)).out.trim();
  const bakHash = { y: await fileBytes(UBAK + '/config.yaml'), s: await fileBytes(UBAK + '/start.sh'), f: await fileBytes(UBAK + '/fw.sh') };

  /* ---------- RD1 红灯：修复前正则(含 0x08)对真实 'R=0\n' 误判失败 ---------- */
  {
    const oldRe = restoreRegexSrc(snapSrc);
    const rctx = vm.createContext({});
    const judged = vm.runInContext('(' + oldRe + ').test("R=0\\n")', rctx);
    const hasBs = oldRe.includes('\x08');
    check('RD1 红灯复现：修复前正则含 0x08(' + (hasBs ? '是' : '否') + ')对真实 R=0 输出判 ' + judged + '（恢复成功被误判失败）',
      hasBs === true && judged === false,
      '正则源=' + JSON.stringify(oldRe) + '(\\u0008 已转义显示) 判定=' + judged);
  }
  /* ---------- RD2 红灯：修复前 engineStart 无 restore 分支 + 覆盖机制演示 ---------- */
  {
    const oldStart = fnTextFrom(snapSrc, 'engineStart');
    const noRestore = !oldStart.includes('restore');
    /* 机制演示(新旧共用的 writeConfigAndValidate,现行提取)：盘上=备份时执行必覆盖 CFG */
    await env.exec('cp ' + UBAK + '/config.yaml ' + CFG);
    await vm.runInContext('ST.bin = true', mvm.ctx);
    setCfg(RAW_B, PORT_A);
    const wOk = await vm.runInContext('(async () => writeConfigAndValidate())()', mvm.ctx, { timeout: 60000 });
    const after = await fileBytes(CFG);
    const covered = wOk === true && after !== bakHash.y;
    check('RD2 红灯复现：修复前 engineStart 无 restore 分支(恢复必经重生成)，且 writeConfigAndValidate 在盘上为备份时必然覆盖 CFG',
      noRestore && covered,
      `旧engineStart含restore=${!noRestore} 覆盖演示: 验证通过=${wOk} CFG已变为新产物=${after !== bakHash.y}`);
  }

  /* ---------- G1 现行正则判定 ---------- */
  {
    const curRe = restoreRegexSrc(plugSrc);
    const rctx = vm.createContext({});
    const judged = vm.runInContext('(' + curRe + ').test("R=0\\n")', rctx);
    check('G1 现行恢复判定正则对真实 R=0 输出判 true（R01 转绿）', judged === true && !curRe.includes('\x08'),
      '正则源=' + JSON.stringify(curRe) + ' 判定=' + judged);
  }
  /* ---------- G2 现行形态：engineStart 恢复模式 ---------- */
  {
    const s = fnTextFrom(plugSrc, 'engineStart');
    check('G2 现行 engineStart 有 restore 分支（跳过重生成/独立恢复复核）',
      s.includes('restore') && s.includes('恢复复核') && s.includes('if (!restore)'),
      '含restore=' + s.includes('restore') + ' 含恢复复核=' + s.includes('恢复复核') + ' 含if(!restore)=' + s.includes('if (!restore)'));
  }
  /* ---------- G3 行为：恢复模式不重生成 + 真引擎按备份启动 ---------- */
  {
    await env.exec('for P in $(pidof mihomo); do kill $P; done 2>/dev/null; sleep 0.5; cp ' + UBAK + '/fw.sh ' + FW + ' && cp ' + UBAK + '/start.sh ' + START + ' && cp ' + UBAK + '/config.yaml ' + CFG + '; chmod 755 ' + FW + ' ' + START + '; echo R=$?');
    const preHash = { y: await fileBytes(CFG), s: await fileBytes(START), f: await fileBytes(FW) };
    setCfg(RAW_B, PORT_A); /* 当前配置=节点乙(C 不得参与恢复生成) */
    await vm.runInContext('ST = {bin:false,pid:"",boot:false,listen:{},tun:false,kb:0,rlog:0,olog:0,chn:0,chn6:0,arp4:{},neigh6:{}}; HS_UPG_OK=false; HS_LAST_ERR=""; HS_LINE_SIG=""; HS_LINE_BUSY=false;', mvm.ctx);
    await vm.runInContext('(async () => await collectStatus())()', mvm.ctx, { timeout: 30000 }); /* ST.bin 真实化(BIN=-x 检查) */
    const binOk = await vm.runInContext('ST.bin', mvm.ctx);
    /* 闸门验证:生产恢复段(rollbackUpgrade)现设 HS_UPGRADING=true,syncLineRules(探活必经)应直接 return 不写 CFG */
    await vm.runInContext('HS_UPGRADING = true; HS_LINE_SIG = ""; ST.running = true;', mvm.ctx);
    const cfgBeforeGate = await fileBytes(CFG);
    await vm.runInContext('(async () => await syncLineRules())()', mvm.ctx, { timeout: 30000 });
    const gateHeld = (await fileBytes(CFG)) === cfgBeforeGate;
    mvm.calls.logs.length = 0;
    const ret = await vm.runInContext('(async () => engineStart(true))()', mvm.ctx, { timeout: 120000 });
    const postHash = { y: await fileBytes(CFG), s: await fileBytes(START), f: await fileBytes(FW) };
    const trioKept = preHash.y === postHash.y && preHash.s === postHash.s && preHash.f === postHash.f
      && postHash.y === bakHash.y && postHash.s === bakHash.s && postHash.f === bakHash.f;
    const pid = (await env.exec('pidof mihomo')).out.trim();
    const listen = (await env.exec('netstat -lntp 2>/dev/null | grep -c ":27901 \\|:27905 "')).out.trim();
    const listenOk = await vm.runInContext('ST.listen.mixed && ST.listen.redir && ST.listen.dns', mvm.ctx);
    const cfgHasA = (await env.exec('grep -c "192.0.2.1" ' + CFG + ' 2>/dev/null')).out.trim();
    const logOk = mvm.calls.logs.some(l => l.includes('恢复成功') && l.includes(OLD_STAMP));
    const bakKept = (await env.exec('test -d ' + UBAK + ' && echo YES || echo NO')).out.trim() === 'YES';
    check('G3 恢复模式行为：三件套逐字节=备份未被重生成(含探活经 syncLineRules 闸门)、真引擎按备份启动探活通过、三烙印复核 v' + OLD_STAMP + '、备份未清',
      ret === true && trioKept && gateHeld && !!pid && Number(listen) >= 2 && !!listenOk && cfgHasA === '1' && logOk && bakKept,
      `ret=${ret} 三件不变=${trioKept} 闸门不写CFG=${gateHeld} pid=${pid || '无'} 监听A组=${listen} 探活=${!!listenOk} CFG含甲节点server=${cfgHasA === '1'} 复核日志=${logOk} 备份在=${bakKept} 尾日志=${(mvm.calls.logs[mvm.calls.logs.length - 1] || '').slice(0, 40)}`);
    await env.exec('for P in $(pidof mihomo); do kill $P; done 2>/dev/null; sleep 0.8; pidof mihomo || echo GONE');
  }
  /* ---------- G4 调用方形态：两回滚段新形态 + 全文件无 0x08 ---------- */
  {
    const d = fnTextFrom(plugSrc, 'doUpgradeRestart');
    const r = fnTextFrom(plugSrc, 'rollbackUpgrade');
    const noBs = !plugSrc.includes('\x08');
    check('G4 调用方形态：两回滚段 engineRestart(true)+rbOk 验证后清理；全文件无 0x08 退格字节',
      d.includes('engineRestart(true)') && d.includes('if (rbOk) await run(\'rm -rf \' + shq(UBAK)') 
      && r.includes('engineRestart(true)') && r.includes('if (rbOk) await run(\'rm -rf \' + shq(UBAK)') && noBs,
      `doUpgradeRestart含true=${d.includes('engineRestart(true)')} rbOk清理=${d.includes('if (rbOk)')} rollback同=${r.includes('engineRestart(true)')}/${r.includes('if (rbOk)')} 无退格=${noBs}`);
  }

  /* 收尾 */
  await env.exec('kill $(cat /tmp/f12/panel.pid) 2>/dev/null; rm -f /tmp/f12/panel.pid').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f12] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F12恢复正确性真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF12 恢复正确性真实校验全部通过');
process.exit(bad.length ? 1 : 0);
