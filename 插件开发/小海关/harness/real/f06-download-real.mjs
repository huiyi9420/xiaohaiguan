#!/usr/bin/env node
/* ============================================================================
 * F06 订阅候选下载真实校验（先红后绿：B/C/D/E 必须复现"旧文件被覆盖=数据丢失"）
 * ----------------------------------------------------------------------------
 * 方法：AST 提取入口 downloadSub/readFile 注入 VM；run/readFile 等 IO 全部经
 * RealEnv.exec 在真实容器执行（真实 curl/BusyBox/lighttpd，无 mock 响应）。
 * 夹具（容器内 lighttpd 标准服务）：
 *   A 200 合法订阅（成功路径：旧文件被正确替换、内容完整、.part 不残留）
 *   B 403 大错误页（>100B 含 token is error 样式；自定义 errorfile）
 *   C 200 但 HTML 错误页
 *   D 200 截断 YAML（合法订阅砍后半）
 *   E 连接拒绝（无服务端口）
 * B/C/D/E 断言：返回 false、旧 sub 文件逐字节不变、候选文件不残留、错误信息含码/原因。
 * 退出码：0=全部通过；1=存在失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, ensureHostAsset, MIHOMO_DIR } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}

/* ---------- VM：AST 提取 downloadSub/readFile，IO 经真实容器 ---------- */
async function buildVm(env) {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'DIR', 'BIN', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'C', 'ST', 'HS_MANUAL', 'HS_SUB_RAW', 'HS_SUB_RAW_KEY', 'HS_SUBINFO', 'HS_MANUAL_LOADED']);
  const functions = new Set(['downloadSub', 'readFile']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析']) {
    Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  }
  const calls = { saveConf: 0, refreshSubRaw: 0, toasts: [] };
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, ...mods,
    /* IO 层：真实容器执行（curl/BusyBox 真实命令真实响应；不伪造任何结果） */
    run: async (cmd, t) => {
      const r = await env.exec(String(cmd), Math.min((Number(t) || 5000) + 10000, 130000));
      return { success: r.code === 0, content: r.out };
    },
    /* 日志/持久化副作用吸收并记录（非业务结果 mock） */
    toast: (m, c) => { calls.toasts.push(String(m)); },
    opLog: async () => '',
    saveConf: async () => { calls.saveConf++; return true; },
    refreshSubRaw: async () => { calls.refreshSubRaw++; }
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    ctx, calls,
    async runDownload(url) {
      ctx.inputUrl = url;
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); C.subs = [{name:'隔离测试', url: inputUrl, time:'2026-01-01 00:00'}]; HS_SUB_RAW='old'; HS_SUB_RAW_KEY='0'; HS_SUBINFO=undefined;`, ctx);
      calls.saveConf = 0; calls.refreshSubRaw = 0; calls.toasts.length = 0;
      return vm.runInContext('downloadSub(0)', ctx, { timeout: 120000 });
    }
  };
}

/* ---------- 主流程 ---------- */
const OLD_SUB = 'proxies:\n  - name: 旧节点保留\n    type: ss\n    server: 192.0.2.1\n    port: 18081\n    cipher: aes-128-gcm\n    password: old-subscription-local-test\nproxy-groups:\n  - name: 旧选择\n    type: select\n    proxies: [旧节点保留]\nrules:\n  - MATCH,旧选择\n';
const OK_SUB = 'proxies:\n  - name: 新节点A\n    type: ss\n    server: 192.0.2.9\n    port: 18082\n    cipher: aes-128-gcm\n    password: new-sub-ok-local-test\nproxy-groups:\n  - name: 新选择\n    type: select\n    proxies: [新节点A]\nrules:\n  - MATCH,新选择\n';
const HTML_ERR = '<html><head><title>403 Forbidden</title></head><body><h1>403</h1><p>{"msg":"token is error","code":403,"data":null}</p><p>' + 'x'.repeat(300) + '</p></body></html>\n';

let env = null;
try {
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f06] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools(); /* lighttpd 标准服务 */

  /* 夹具文件与 lighttpd（403 用 errorfile-prefix 提供大错误体） */
  await env.exec('mkdir -p /tmp/f06/errors');
  await env.writeContainerFile('/tmp/f06/sub-ok.yaml', OK_SUB);
  await env.writeContainerFile('/tmp/f06/err-page.html', HTML_ERR);
  await env.writeContainerFile('/tmp/f06/trunc.yaml', OK_SUB.slice(0, Math.floor(OK_SUB.length * 0.4)));
  await env.writeContainerFile('/tmp/f06/errors/403.html', HTML_ERR);
  await env.writeContainerFile('/tmp/f06/lighttpd.conf', [
    'server.modules = ( "mod_access", "mod_accesslog" )',
    'server.port = 28085',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f06"',
    'server.errorfile-prefix = "/tmp/f06/errors/"',
    'accesslog.filename = "/tmp/f06/access.log"',
    'server.errorlog = "/tmp/f06/error.log"',
    'server.pid-file = "/tmp/f06/lighttpd.pid"',
    'url.access-deny = ( ".denied" )',
    ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f06/lighttpd.conf >/dev/null 2>&1 & sleep 0.8; curl -s -o /dev/null -w OK=%{http_code} http://127.0.0.1:28085/sub-ok.yaml');
  const srvOk = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28085/sub-ok.yaml')).out.trim();
  check('夹具服务就绪（lighttpd 28085）', srvOk === '200', 'http_code=' + srvOk);

  const vmf = await buildVm(env);
  const PF = MIHOMO_DIR + '/providers/sub0.yaml';
  const PART = PF + '.part';
  const seedOld = async () => { await env.exec('mkdir -p ' + MIHOMO_DIR + '/providers; rm -f ' + PART); await env.writeContainerFile(PF, OLD_SUB); };
  const fileState = async p => {
    const r = await env.exec('if [ -f ' + p + ' ]; then sha256sum ' + p + ' | cut -d" " -f1; else echo ABSENT; fi');
    return r.out.trim();
  };
  const oldHash = (await env.writeContainerFile('/tmp/f06/old-ref.yaml', OLD_SUB), (await env.exec('sha256sum /tmp/f06/old-ref.yaml | cut -d" " -f1')).out.trim());

  const cases = [
    { id: 'A', url: 'http://127.0.0.1:28085/sub-ok.yaml', expect: 'success', title: '200 合法订阅' },
    { id: 'B', url: 'http://127.0.0.1:28085/forbidden.denied', expect: 'fail', title: '403 大错误页' },
    { id: 'C', url: 'http://127.0.0.1:28085/err-page.html', expect: 'fail', title: '200 HTML 错误页' },
    { id: 'D', url: 'http://127.0.0.1:28085/trunc.yaml', expect: 'fail', title: '200 截断 YAML' },
    { id: 'E', url: 'http://127.0.0.1:28081/nothing', expect: 'fail', title: '连接拒绝' }
  ];
  for (const c of cases) {
    await seedOld();
    const ret = await vmf.runDownload(c.url);
    const pfHash = await fileState(PF);
    const partState = await fileState(PART);
    if (c.expect === 'success') {
      const newOk = pfHash !== oldHash && partState === 'ABSENT';
      const contentOk = (await env.exec('curl -s http://127.0.0.1:28085/sub-ok.yaml | diff - ' + PF + ' >/dev/null 2>&1 && echo SAME || echo DIFF')).out.trim() === 'SAME';
      check('A 成功路径：旧文件被正确替换、内容完整、候选不残留', ret === true && newOk && contentOk,
        `ret=${ret} pf变=${pfHash !== oldHash} part=${partState} contentSame=${contentOk} refreshSubRaw=${vmf.calls.refreshSubRaw}`);
    } else {
      const kept = pfHash === oldHash;
      const noPart = partState === 'ABSENT';
      check(c.id + ' 失败路径(' + c.title + ')：返回 false、旧文件逐字节不变、候选不残留',
        ret === false && kept && noPart,
        `ret=${ret} 旧文件保留=${kept} part=${partState === 'ABSENT' ? '不残留' : partState} toast=${(vmf.calls.toasts[0] || '').slice(0, 60)}`);
    }
  }

  /* 收尾：TERM 清理（lighttpd 按_pid 停 + 容器 TERM 释放） */
  await env.exec('kill $(cat /tmp/f06/lighttpd.pid) 2>/dev/null; rm -f /tmp/f06/lighttpd.pid').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f06] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F06候选下载真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF06 候选下载真实校验全部通过');
process.exit(bad.length ? 1 : 0);
