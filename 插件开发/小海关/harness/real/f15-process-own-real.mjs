#!/usr/bin/env node
/* ============================================================================
 * F15 引擎进程所有权真实校验（红灯先行→修复→全绿）
 * ----------------------------------------------------------------------------
 * 缺陷：JS 侧（engineStop 两轮全杀/启动失败急救）与 start.sh（单实例守卫/哨兵
 * 自删清理）均用 `pidof mihomo` 裸枚举——设备上同名他装 mihomo（异路径 exe）会被
 * 误杀/误判 already-running；collectStatus 的 =PID= 采集同样不核验，同名进程会
 * 造成"引擎在跑"误判。
 * 修复：所有权判定 = readlink /proc/<PID>/exe 等于本插件二进制路径
 * （/data/plugins/customs/mihomo，F01 buildReadinessCommand 已建同款判定，推广）。
 *   JS: ownEnginePids()/killOwnEngines(sig) 命令生成器；collectStatus 采集行内联
 *       核验；急救与 engineStop 经核验过滤，engineStop 补返回前有界复查退出。
 *   start.sh: 单实例守卫与哨兵清理段同款 readlink 核验。
 *
 * 夹具（真实容器）：真 mihomo v1.19.32 于生产固定路径 + 同名诱饵（busybox 复制为
 *   /tmp/mihomo 执行 sleep——comm=mihomo 使 pidof 命中，exe=/tmp/mihomo 异路径）；
 *   面板哨兵 lighttpd:2333 可切换返回带/不带 __customs_loaded（触发哨兵自删分支）。
 *   R1 红灯：engineStop 全杀→诱饵死亡
 *   R2 红灯：engineStart 启动失败急救命令→诱饵死亡
 *   R3 红灯：start.sh 哨兵自删段→诱饵死亡
 *   R4 红灯：诱饵在跑、本插件引擎不在→collectStatus 仍判"引擎在跑"
 *   R5 红灯：诱饵在跑→start.sh 守卫误判 already-running，本插件引擎未启动
 *   绿灯同用例断言诱饵存活/本插件实例退出或正常启动。
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
const SEC = 'f15-process-secret';
const PORTS = { ctrl: 27931, mixed: 27932, redir: 27933, dns: 27934 };
const CFG_MIN = ['mode: rule', 'log-level: warning', 'ipv6: false',
  `mixed-port: ${PORTS.mixed}`, `redir-port: ${PORTS.redir}`,
  `external-controller: 127.0.0.1:${PORTS.ctrl}`, `secret: "${SEC}"`,
  'dns:', '  enable: true', `  listen: 127.0.0.1:${PORTS.dns}`,
  '  enhanced-mode: redir-host', '  nameserver:', '    - 223.5.5.5',
  'rules:', '  - MATCH,DIRECT'].join('\n') + '\n';

function findFn(tree, name) {
  let fn = null;
  (function f(n) {
    if (fn || !n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { fn = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  return fn;
}
/* 从现行源提取函数集入 VM（engineStop 依赖 collectStatus 链，注入集参照 f12） */
async function buildVm(env, funcs) {
  funcs = funcs.concat(['syncLineRules', 'lineSig', 'etSig', 'syncEtRules', 'probeNodeUdp', 'probeNodeUdpInner']); /* collectStatus 尾部无条件调 syncLineRules/syncEtRules/probeNodeUdp(v2.4.1 新增链路,VM 同源提取) */
  const source = fs.readFileSync(PLUG, 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let body = null;
  (function f(n) {
    if (body || !n || typeof n !== 'object') return;
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'CallExpression'
      && n.expression.callee && n.expression.callee.type === 'ArrowFunctionExpression') { body = n.expression.callee.body.body; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v) }
  })(tree);
  const FSET = new Set(funcs);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && FSET.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
      if (['DEF', 'PORT_DEF', 'V', 'DIR', 'BIN', 'CFG', 'CJ', 'OPLOG', 'START', 'FW', 'LOGF', 'BOOT_SH', 'BOOT_KEY', 'C', 'ST', 'ET_CACHE', 'HS_SUB_RAW', 'HS_SUB_RAW_KEY', 'HS_SUBINFO', 'HS_MANUAL', 'HS_MANUAL_LOADED', 'HS_WFILE_MAX', 'HS_LINE_SIG', 'HS_LINE_BUSY', 'HS_UPGRADING', 'HS_UPG_OK', 'HS_LAST_ERR', 'HS_LAST_RF', 'ownEnginePids', 'killOwnEngines', 'HS_COLLECT_BUSY', 'HS_ET_SIG', 'HS_UDP_PREV', 'hsConfirmTimer', 'HS_UDP_OK', 'HS_UDP_T', 'HS_UDP_BUSY', 'HS_UDP_PREV'].includes(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
    }
  }
  /* 端口覆盖:提取的 DEF 内 ports 来自 PORT_DEF,再整体覆写 */
  decls.push('DEF.ports = Object.assign({}, DEF.ports, ' + JSON.stringify(PORTS) + ');');
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
    probeNodeUdp: async () => { }, readEtState: async () => { },
    hsUploadByApi: async () => null,
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return { ctx, calls, source };
}

let env = null;
try {
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f15] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();

  /* 引擎配置 + 二进制备份(哨兵自删用例会 rm -rf $D,需恢复) */
  await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', CFG_MIN);
  const tOk = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -1');
  check('夹具就绪：config.yaml 通过真实 mihomo -t', /successful/i.test(tOk.out), tOk.out.trim().slice(0, 50));
  await env.exec('cp ' + MIHOMO_BIN + ' /tmp/f15-mihomo.bak; printf "#!/bin/sh\\ngunzip -c /tmp/mi.gz > /dev/null\\n" >/dev/null; echo BAK_OK');

  /* 面板哨兵源(静态文件,内容可切换带/不带标记——f12 同款;CGI 按 .sh 后缀匹配,生产 URL 无后缀不适用) */
  await env.exec('mkdir -p /tmp/f15/panel/api');
  await env.writeContainerFile('/tmp/f15/panel.conf', [
    'server.modules = ( "mod_accesslog" )', 'server.port = 2333', 'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f15/panel"', 'accesslog.filename = "/tmp/f15/pa.log"',
    'server.errorlog = "/tmp/f15/pe.log"', 'server.pid-file = "/tmp/f15/panel.pid"', ''
  ].join('\n'));
  const setHeadMarker = async (withMark) => {
    await env.exec('printf ' + (withMark ? '"__customs_loaded f15"' : '"no-marker-here"') + ' > /tmp/f15/panel/api/get_custom_head');
  };
  await setHeadMarker(true);
  const panelProbe = (await env.exec('nohup lighttpd -D -f /tmp/f15/panel.conf >/dev/null 2>&1 & sleep 0.6; echo PANEL=$(curl -s http://127.0.0.1:2333/api/get_custom_head | head -c 20)', 8000)).out.trim();
  check('面板哨兵源就绪（200 且返回带标记内容）', panelProbe.includes('__customs_loaded'), panelProbe.slice(0, 40));

  /* 诱饵管理:busybox 复制为 /tmp/mihomo(comm=mihomo 使 pidof 命中,exe 异路径) */
  const decoy = {
    start: async () => {
      /* 真二进制异路径运行(busybox 按 argv[0] 找 applet 会立即退出,不可用):
         cp 生产 mihomo → /tmp/mihomo,以独立配置目录运行——comm=mihomo/exe=/tmp/mihomo 真实进程 */
      const dcfg = ['mode: rule', 'log-level: warning', 'ipv6: false', 'mixed-port: 27942',
        'external-controller: 127.0.0.1:27941', `secret: "${SEC}-decoy"`, 'rules:', '  - MATCH,DIRECT'].join('\n') + '\n';
      await env.exec('cp ' + MIHOMO_BIN + ' /tmp/mihomo; mkdir -p /tmp/f15-decoy', 10000);
      await env.writeContainerFile('/tmp/f15-decoy/config.yaml', dcfg);
      await env.exec('nohup /tmp/mihomo -d /tmp/f15-decoy >/tmp/f15-decoy/out.log 2>&1 & echo $! > /tmp/decoy.pid; sleep 1.2; cat /tmp/decoy.pid', 8000);
    },
    state: async () => {
      const r = await env.exec('P=$(cat /tmp/decoy.pid 2>/dev/null || echo 0); S=$(cut -d" " -f3 /proc/$P/stat 2>/dev/null); if [ "$P" -gt 1 ] 2>/dev/null && [ -n "$S" ] && [ "$S" != Z ]; then echo ALIVE; else echo DEAD; tail -3 /tmp/f15-decoy/out.log 2>/dev/null; fi', 5000);
      return r.out.trim().split('\n')[0];
    },
    exe: async () => (await env.exec('readlink /proc/$(cat /tmp/decoy.pid)/exe 2>/dev/null')).out.trim(),
    kill: async () => { await env.exec('P=$(cat /tmp/decoy.pid 2>/dev/null); [ -n "$P" ] && kill $P 2>/dev/null; true', 5000); }
  };
  const ownState = async () => {
    const r = await env.exec('P=$(pidof ' + MIHOMO_BIN + ' 2>/dev/null); [ -z "$P" ] && P=$(for Q in $(pidof mihomo); do [ "$(readlink /proc/$Q/exe)" = ' + MIHOMO_BIN + ' ] && echo $Q; done); S=$(cut -d" " -f3 /proc/$P/stat 2>/dev/null); if [ -n "$P" ] && [ "$S" != Z ]; then echo ALIVE; else echo DEAD; fi', 5000);
    return r.out.trim();
  };
  const decoyRestart = async () => { await decoy.kill(); await decoy.start(); }; /* 每用例独立:上游误杀不污染下游 */
  const clearOwn = async () => {
    await env.exec('for P in $(pidof ' + MIHOMO_BIN + '); do kill $P; done 2>/dev/null; I=0; while [ $I -lt 12 ] && pidof ' + MIHOMO_BIN + ' >/dev/null; do sleep 0.5; I=$((I+1)); done; true', 12000);
  };
  const startOwn = async () => { /* 起本插件真引擎(生产路径+生产配置) */
    await env.exec('nohup sh -c \'' + MIHOMO_BIN + ' -d ' + MIHOMO_DIR + ' >/dev/null 2>&1\' >/dev/null 2>&1 & sleep 1.5; pidof mihomo', 8000);
  };

  await decoy.start();
  check('诱饵就绪：comm=mihomo 且 exe 异路径（pidof 命中/所有权判定可辨）',
    (await decoy.state()) === 'ALIVE' && (await decoy.exe()) === '/tmp/mihomo',
    `诱饵=${await decoy.state()} exe=${await decoy.exe()}`);

  /* ---------- R4/G4: collectStatus 同名误判（诱饵在跑,本插件引擎不在） ---------- */
  {
    const v = await buildVm(env, ['collectStatus']);
    vm.runInContext('C = JSON.parse(JSON.stringify(DEF)); C.secret=' + JSON.stringify(SEC) + '; C.tunName="hs0"; ST={bin:false,pid:"",boot:false,listen:{},tun:false,kb:0,rlog:0,olog:0,chn:0,chn6:0,arp4:{},neigh6:{}};', v.ctx);
    await vm.runInContext('(async () => await collectStatus())()', v.ctx, { timeout: 30000 });
    const running = await vm.runInContext('ST.running', v.ctx);
    const pid = await vm.runInContext('ST.pid', v.ctx);
    check('G4 采集所有权：诱饵在跑而本插件引擎不在 → ST.running=false（不误判在跑）',
      running === false && (pid || '') === '' && (await decoy.state()) === 'ALIVE',
      `running=${running} 采集pid=${JSON.stringify(pid)} 诱饵=${await decoy.state()}`);
  }

  /* ---------- R1/G1: engineStop 只停本插件实例 ---------- */
  {
    await decoyRestart();
    await startOwn();
    const ownBefore = await ownState();
    const v = await buildVm(env, ['engineStop', 'collectStatus', 'fwClean', 'checkResidue']);
    vm.runInContext('C = JSON.parse(JSON.stringify(DEF)); C.secret=' + JSON.stringify(SEC) + '; C.tunName="hs0"; C.ports=Object.assign({}, DEF.ports); ST={bin:false,pid:"",boot:false,listen:{},tun:false,kb:0,rlog:0,olog:0,chn:0,chn6:0,arp4:{},neigh6:{}};', v.ctx);
    const ret = await vm.runInContext('(async () => engineStop())()', v.ctx, { timeout: 90000 });
    check('G1 engineStop：本插件实例退出(返回前复查)、诱饵存活、返回 ok',
      ret === true && (await ownState()) === 'DEAD' && (await decoy.state()) === 'ALIVE',
      `ret=${ret} 本插件实例=${await ownState()} 诱饵=${await decoy.state()} 前置(本插件=${ownBefore}/诱饵=${await decoy.state()}) toast=${(v.calls.toasts[0] || '').slice(0, 30)}`);
  }

  /* ---------- R2/G2: 启动失败急救命令只杀本插件实例 ---------- */
  {
    await decoyRestart();
    const v = await buildVm(env, []); /* 仅取源码定位急救命令行 */
    const tree = acorn.parse(v.source, { ecmaVersion: 2020, sourceType: 'module' });
    const es = findFn(tree, 'engineStart');
    let rescue = '';
    (function f(n) {
      if (rescue || !n || typeof n !== 'object') return;
      if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'AwaitExpression'
        && n.expression.argument && n.expression.argument.type === 'CallExpression') {
        const cal = n.expression.argument.callee;
        const isRun = cal && ((cal.type === 'Identifier' && cal.name === 'run')
          || (cal.type === 'MemberExpression' && cal.object && cal.object.callee && cal.object.callee.name === 'run'));
        const text = v.source.slice(n.start, n.end);
        if (isRun && (text.includes('pidof mihomo') || text.includes('killOwnEngines')) && text.includes('clean')) rescue = text;
        return;
      }
      for (const x of Object.values(n)) { if (Array.isArray(x)) x.forEach(f); else if (x && typeof x === 'object') f(x) }
    })(es);
    if (!rescue) throw new Error('急救命令行未找到');
    const v2 = await buildVm(env, []);
    const runIt = vm.runInContext('(async (FW, run, shq) => (async () => { ' + rescue + ' })())', v2.ctx);
    await runIt(MIHOMO_DIR + '/fw.sh',
      async (cmd, t) => { const r = await env.exec(String(cmd), Math.min((Number(t) || 5000) + 10000, 130000)); return { success: r.code === 0, content: r.out }; },
      (await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', '工具.js')).href)).shq);
    check('G2 急救命令：诱饵存活（只清本插件实例与规则）',
      (await decoy.state()) === 'ALIVE',
      `诱饵=${await decoy.state()}`);
  }

  /* ---------- R5/G5: start.sh 守卫不因诱饵误判 already-running ---------- */
  {
    const { generateStartScript } = await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', '启动脚本.js')).href);
    await decoyRestart();
    await clearOwn();
    const sh = generateStartScript({ s1: 'off', s2: false, logEnabled: false, lowMem: false, bootMode: 'keep', ports: PORTS },
      { V: '9.9.9', DIR: MIHOMO_DIR, LOGF: MIHOMO_DIR + '/customs.log', BOOT_SH: MIHOMO_DIR + '/ufi_tools_boot.sh', secret: SEC });
    await env.writeContainerFile(MIHOMO_DIR + '/start.sh', sh);
    await env.exec('chmod 700 ' + MIHOMO_DIR + '/start.sh; sh ' + MIHOMO_DIR + '/start.sh >/tmp/f15/g5.out 2>&1 </dev/null & sleep 12; echo G5DONE; head -c 200 /tmp/f15/g5.out', 20000);
    const own = await ownState();
    const g5out = (await env.exec('head -c 150 /tmp/f15/g5.out 2>/dev/null')).out.trim();
    check('G5 start.sh 守卫：诱饵在跑不误判 already-running，本插件引擎正常启动且诱饵存活',
      own === 'ALIVE' && (await decoy.state()) === 'ALIVE',
      `本插件引擎=${own} 诱饵=${await decoy.state()} start.sh输出=[${g5out}]`);
    await clearOwn();
  }

  /* ---------- R3/G3: start.sh 哨兵自删段（守卫修复后可达）不误杀诱饵 ---------- */
  {
    /* 场景=商店直删后的开机自启:本插件引擎不在+诱饵在+面板 200 无标记 → 守卫(修复后)放行 → 哨兵自删。
       断言:自删完成($D 被删=二进制消失)且诱饵存活;现行红灯=守卫因诱饵短路,自删被遮蔽($D 仍在) */
    await decoyRestart();
    await clearOwn();
    await setHeadMarker(false);
    await env.exec('sh ' + MIHOMO_DIR + '/start.sh >/tmp/f15/g3.out 2>&1; echo R3DONE; head -c 200 /tmp/f15/g3.out', 30000);
    const binGone = (await env.exec('test -f ' + MIHOMO_BIN + ' && echo YES || echo NO')).out.trim() === 'NO';
    const g3out = (await env.exec('head -c 150 /tmp/f15/g3.out 2>/dev/null')).out.trim();
    check('G3 start.sh 哨兵自删：自删完成(二进制移除)且诱饵存活',
      binGone && (await decoy.state()) === 'ALIVE',
      `自删完成=${binGone} 诱饵=${await decoy.state()} start.sh输出=[${g3out}]`);
    /* 恢复:自删已 rm -rf $D,还原引擎供收尾 */
    await env.exec('cp /tmp/f15-mihomo.bak ' + MIHOMO_BIN + '; chmod 755 ' + MIHOMO_BIN + '; echo RESTORED');
    await setHeadMarker(true);
  }

  await decoy.kill();
  await env.exec('kill $(cat /tmp/f15/panel.pid) 2>/dev/null; for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe)" = ' + MIHOMO_BIN + ' ] && kill $P; done 2>/dev/null; true').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f15] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F15进程所有权真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF15 进程所有权真实校验全部通过');
process.exit(bad.length ? 1 : 0);
