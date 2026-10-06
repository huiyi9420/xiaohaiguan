#!/usr/bin/env node
/* ============================================================================
 * F10 onlineInstall 完成判定真实校验（红灯复现 R1/R2 + 夹具 A/B/C/D 全绿）
 * ----------------------------------------------------------------------------
 * 同源保证：下载启动命令与轮询判定循环经 AST 从 插件.js onlineInstall 原文提取
 * （语句级定位 + 文本段切分；节点 start/end 是全文级偏移，必须对完整 source 切片——
 *  2026-10-03 r1 中断遗留教训：对 fnSrc 切片会得到空串）。
 * IO 全部经 RealEnv.exec 在真实容器执行（真实 curl/BusyBox/lighttpd，无 mock 响应）。
 *
 * 红灯对照（R1/R2）：修复前判定段逐字嵌入（String.raw 保留 \' 转义），出处
 *   entry-baseline-snapshot.js 的 onlineInstall（F10 修复前脏基线函数体，与 git HEAD
 *   5154bf5 同款缺陷形态）：curl -sL 无 -f、exit==='0'&&lastSz>1024 才 ok、
 *   快速完成时 lastSz 仍 -1 → 既不 ok 也无失败文案 → 静默换源/耗尽全部源。
 *   同一夹具在旧段上必须复现误判（ok=false 而磁盘事实=exit 0+完整有效 gz>1024B），
 *   在现行段上判定 ok（A）——证明探针能区分新旧逻辑，非空洞绿灯。
 *
 * 夹具（双 lighttpd 实例，避免全局限速拖慢快速夹具）：
 *   主服务 28088（不限速）：fast.gz（~4KB 随机数据 gzip）/ 404 大错误页(errorfile) /
 *                          CGI 停滞源（应答头后 sleep 600，0 字节不退）
 *   慢速服务 28089（server.kbytes-per-second=2 限速，独立 docroot 仅 slow20k.gz）
 *   A 快速完成(<1.5s,>1024B gzip)——现行判定首轮 exit 0+finSz>1024 即 ok，不切源
 *   B 慢速持续(限速，轮询期间尺寸持续增长)——全程不切源（P07）
 *   C 停滞(CGI 挂起，尺寸 0 不变 10 轮)——停滞后才切源，备源成功
 *   D HTTP 404——curl -f exit 22 按码切源，错误文案含退出码
 * 断言到「下载判定」为止，不执行解压安装段（真内核安装不在本轮）。本夹具体为随机
 * 数据 gzip（显式非真内核），故不需要 mihomo 资产，容器仅需 curl+lighttpd。
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

/* ---------- AST 提取 onlineInstall 下载启动命令与轮询判定段（同源） ---------- */
/* 形态无关定位：递归找 FunctionDeclaration id.name==='onlineInstall'
   （插件.js 在入口 IIFE 闭包内，快照/其他形态在模块顶层，同一查找都适用） */
function extractSegmentsFrom(source, label) {
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let fn = null;
  (function find(n) {
    if (fn || !n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'onlineInstall') { fn = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(find); else if (v && typeof v === 'object') find(v) }
  })(tree);
  if (!fn) throw new Error(label + ': onlineInstall 未找到');
  const fnSrc = source.slice(fn.start, fn.end);
  /* 段1：下载启动命令（rm .dl.exit + nohup curl 行）——语句级 AST 定位（ForOf/正则对引号拼接脆弱） */
  let launch = '';
  (function visit(n) {
    if (!n || typeof n !== 'object' || launch) return;
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'AwaitExpression'
      && n.expression.argument && n.expression.argument.type === 'CallExpression'
      && n.expression.argument.callee && n.expression.argument.callee.type === 'Identifier' && n.expression.argument.callee.name === 'run') {
      const text = source.slice(n.start, n.end); /* 节点偏移是全文级，必须对完整 source 切片 */
      if (text.includes('nohup') && text.includes('.dl.exit')) launch = text;
      return;
    }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v) }
  })(fn);
  if (!launch) throw new Error(label + ': 下载启动命令提取失败');
  /* 段2：轮询判定循环（let lastSz ... 到 if (cancelled) break; 前） */
  const pollStart = fnSrc.indexOf('let lastSz = -1, stagnant = 0;');
  const pollEndMark = fnSrc.indexOf('if (cancelled) break;', pollStart);
  if (pollStart < 0 || pollEndMark < 0) throw new Error(label + ': 轮询判定段提取失败');
  return { launch, poll: fnSrc.slice(pollStart, pollEndMark) };
}

function extractSegments() {
  /* F11 后现行轮询段含 killOwnDl 调用,一并提取其顶层声明注入探针(同源) */
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const seg = extractSegmentsFrom(source, '现行源码');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let killDecl = '';
  (function findKill(n) {
    if (killDecl || !n || typeof n !== 'object') return;
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
      if (d.id.name === 'killOwnDl') killDecl = source.slice(n.start, n.end) + ';';
    }
    if (killDecl) return;
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(findKill); else if (v && typeof v === 'object') findKill(v) }
  })(tree);
  if (!killDecl) throw new Error('killOwnDl 声明未找到(F11 修复未生效?)');
  return { ...seg, killDecl };
}

/* ---------- 红灯对照段：F10 修复前判定段逐字嵌入 ----------
 * 出处：harness/entry-baseline-snapshot.js 的 onlineInstall（模块构建回归.mjs 的
 * 变更缝归一化基准，内容=修复前脏基线函数体）。缺陷形态与 git HEAD 5154bf5 相同：
 * curl -sL 无 -f；exit==='0'&&lastSz>1024 才 ok；快速完成（首轮 1.5s 内 exit 0 但
 * lastSz 仍 -1）→ 不 ok、无失败文案、静默 break 换源 → 全部源耗尽后误报
 * 「所有在线源下载失败」。String.raw 逐字保留 \' 转义。 */
const OLD_LAUNCH = String.raw`      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.dl.exit') + '; nohup sh -c \'curl -sL --connect-timeout 8 ' + (t.px ? '-x ' + shq(t.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(t.url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.dl.exit') + '\' >/dev/null 2>&1 &', 5000);`;
const OLD_POLL = String.raw`      let lastSz = -1, stagnant = 0;
      for (let pi = 0; pi < 120 && !cancelled; pi++) { /* pi=轮询序号; 勿命名 t——会遮蔽外层源对象 t,致进度文案 [undefined](2026-09-02 实测) */
        await wait(1500);
        const ex = await run('cat ' + shq(DIR + '/.dl.exit') + ' 2>/dev/null', 3000);
        const exitCode = (ex.content || '').trim();
      if (exitCode !== '') {
          console.log('[小海关] 源', t.name, 'exit:', exitCode, 'size:', lastSz, 'ok:', exitCode === '0');
          if (exitCode === '0' && lastSz > 1024) { ok = true }
          else if (exitCode !== '0') { setTxt(esc(t.name) + ' 失败(exit ' + exitCode + '),换下一个源…') }
          break;
        }
        const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
        const sz = pInt(szR);
        if (sz === lastSz) { stagnant++; if (stagnant >= 10) { await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000); setTxt('下载停滞,切换下一个源…'); break } }
        else { stagnant = 0; lastSz = sz }
        if (totalSz > 0) {
          const pct = Math.round(sz / totalSz * 100);
          setFill(pct);
          setTxt('[' + esc(t.name) + '] ' + (sz / 1048576).toFixed(1) + '/' + (totalSz / 1048576).toFixed(1) + 'MB ' + pct + '%');
        } else {
          setFill(Math.min(90, sz / 300000)); /* 无总大小时按~3MB估算 */
          setTxt('下载中 ' + (sz / 1048576).toFixed(1) + ' MB…');
        }
      }
`;

/* ---------- 探针 VM：包装提取段，IO 经真实容器 ---------- */
async function buildProbeVm(env, launch, poll, killDecl) {
  const mods = {};
  for (const name of ['工具']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const killSrc = killDecl || ''; /* F11: 现行 poll 段的停滞清理依赖 killOwnDl(旧段自带 pidof 不需要) */
  const wrapSrc = `
    return async function onlineDlProbe(srcSeq, tmpF) {
      const logs = { texts: [], tried: 0, ok: false };
      const setTxt = (t) => { logs.texts.push(String(t)); };
      const setFill = () => { };
      const setStep = () => { };
      const cancelled = false;
      const totalSz = 15 * 1048576;
      const DIR = __DIR; /* 提取段引用 DIR(生产插件目录常量),探针注入同值 */
      const esc = (t) => String(t);
      const shq = (t) => "'" + String(t).replace(/'/g, "'\\\\''") + "'";
      const pInt = (r) => parseInt((r && r.content || '').trim()) || 0;
      const wait = (ms) => new Promise(rs => setTimeout(rs, ms));
      const run = async (cmd, t) => { const r = await __exec(String(cmd), Math.min((Number(t) || 5000) + 8000, 130000)); return { success: r.code === 0, content: r.out }; };
      ${killSrc}
      let ok = false;
      for (let mo = 0; mo < srcSeq.length && !ok && !cancelled; mo++) {
        const t = srcSeq[mo];
        logs.tried = mo + 1;
        ${launch}
        ${poll}
      }
      logs.ok = ok;
      return logs;
    };`;
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, setTimeout, ...mods,
    __exec: (cmd, t) => env.exec(cmd, t),
    __DIR: MIHOMO_DIR
  });
  const factory = vm.runInContext('(function(__exec){ ' + wrapSrc + ' })', ctx, { timeout: 10000 });
  return factory((cmd, t) => env.exec(cmd, t));
}

/* ---------- 主流程 ---------- */
let env = null;
try {
  const { launch, poll, killDecl } = extractSegments();
  const probeNew = () => buildProbeVm(env, launch, poll, killDecl);   /* 现行判定段（每用例重建，隔离 logs） */
  const probeOld = () => buildProbeVm(env, OLD_LAUNCH, OLD_POLL); /* 修复前判定段（红灯对照，自带 pidof 不需 killOwnDl） */

  env = new RealEnv();
  await env.start();
  await env.installTools(); /* curl + lighttpd，本夹具不需要 mihomo 资产（判定到 ok 为止，不装内核） */

  /* 夹具资产：主服务(不限速) fast.gz/404错误页/CGI停滞；慢速服务(限速2KiB/s) slow20k.gz */
  await env.exec('mkdir -p ' + MIHOMO_DIR + ' /tmp/f10/errors /tmp/f10/cgi-bin /tmp/f10/slow'); /* MIHOMO_DIR: 探针下载落盘与 .dl.exit 事实源目录(r2 版由 prepareBinary 顺带建,本夹具不用内核资产须自建) */
  const fastGen = await env.exec('head -c 4096 /dev/urandom | gzip > /tmp/f10/fast.gz; gzip -t /tmp/f10/fast.gz && echo GZ_OK; wc -c < /tmp/f10/fast.gz');
  const fastSz = Number((fastGen.out.trim().match(/(\d+)\s*$/) || [])[1] || 0);
  check('夹具A资产：fast.gz 为有效 gzip 且 >1024B', fastGen.out.includes('GZ_OK') && fastSz > 1024 && fastSz <= 8192, 'bytes=' + fastSz);
  const slowGen = await env.exec('head -c 20480 /dev/urandom | gzip > /tmp/f10/slow/slow20k.gz; gzip -t /tmp/f10/slow/slow20k.gz && echo GZ_OK; wc -c < /tmp/f10/slow/slow20k.gz');
  const slowSz = Number((slowGen.out.trim().match(/(\d+)\s*$/) || [])[1] || 0);
  check('夹具B资产：slow20k.gz 为有效 gzip（15-26KB）', slowGen.out.includes('GZ_OK') && slowSz >= 15000 && slowSz <= 26000, 'bytes=' + slowSz);
  await env.exec('printf "<html>404 not found padding ' + 'x'.repeat(1600) + '</html>" > /tmp/f10/errors/404.html');
  await env.writeContainerFile('/tmp/f10/cgi-bin/stall.sh', '#!/bin/sh\necho "Content-Type: application/octet-stream"\necho ""\nsleep 600\n');
  await env.exec('chmod 755 /tmp/f10/cgi-bin/stall.sh');
  await env.writeContainerFile('/tmp/f10/lighttpd.conf', [
    'server.modules = ( "mod_accesslog", "mod_cgi" )',
    'server.port = 28088',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f10"',
    'server.errorfile-prefix = "/tmp/f10/errors/"',
    'accesslog.filename = "/tmp/f10/access.log"',
    'server.errorlog = "/tmp/f10/error.log"',
    'server.pid-file = "/tmp/f10/lighttpd.pid"',
    'cgi.assign = ( ".sh" => "/bin/sh" )',
    ''
  ].join('\n'));
  await env.writeContainerFile('/tmp/f10/lighttpd-slow.conf', [
    'server.modules = ( "mod_accesslog" )',
    'server.port = 28089',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f10/slow"',
    'server.kbytes-per-second = 2',
    'accesslog.filename = "/tmp/f10/access-slow.log"',
    'server.errorlog = "/tmp/f10/error-slow.log"',
    'server.pid-file = "/tmp/f10/lighttpd-slow.pid"',
    ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f10/lighttpd.conf >/dev/null 2>&1 & nohup lighttpd -D -f /tmp/f10/lighttpd-slow.conf >/dev/null 2>&1 & sleep 0.8; echo STARTED');
  const srv = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28088/fast.gz')).out.trim();
  const nf = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28088/nope.gz')).out.trim();
  const slowSrv = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28089/slow20k.gz')).out.trim();
  check('夹具服务就绪（主 28088：fast=200/nope=404；慢速 28089=200）', srv === '200' && nf === '404' && slowSrv === '200',
    'fast=' + srv + ' 404=' + nf + ' slow=' + slowSrv);

  /* curl -w 输出无尾换行,后继 echo 会直接拼接(实测 "4119GZ_OK")→ 一律用显式标记符分段解析 */
  const fastT = await env.exec("curl -s -o /tmp/f10/t-fast.out -w '|%{time_total}|%{size_download}' http://127.0.0.1:28088/fast.gz; echo '|END'; gzip -t /tmp/f10/t-fast.out && echo GZ_OK || echo GZ_BAD");
  const fp = fastT.out.split('|');
  const fastTime = Number(fp[1]), fastGot = Number(fp[2]);
  check('夹具A前置：fast 全量下载 <1.0s（首轮 1.5s 等待内必完成，与限速无关）',
    fastTime > 0 && fastTime < 1.0 && fastGot === fastSz && fastT.out.includes('GZ_OK'), 'time=' + fastTime + 's bytes=' + fastGot + '/' + fastSz + ' ' + (fastT.out.includes('GZ_OK') ? 'gz有效' : 'gz无效'));
  /* 限速语义自检：两次独立连接均超时未完(rc=28)且只得部分字节——证明 2KiB/s 限速生效(不限速时 20KB 瞬间取完);
     首连接有初始预算突发,两次字节数不保证单调,故不断言递增(轮询期增长由 B 用例本体验证) */
  const s1 = await env.exec('curl -s --max-time 1.1 -o /tmp/f10/t-slow1.out http://127.0.0.1:28089/slow20k.gz; echo "|rc=$?|sz=$(wc -c < /tmp/f10/t-slow1.out 2>/dev/null || echo NOFILE)|"');
  const s2 = await env.exec('curl -s --max-time 2.2 -o /tmp/f10/t-slow2.out http://127.0.0.1:28089/slow20k.gz; echo "|rc=$?|sz=$(wc -c < /tmp/f10/t-slow2.out 2>/dev/null || echo NOFILE)|"');
  const pr1 = /\|rc=(\d+)\|sz=(\d+|NOFILE)\|/.exec(s1.out) || [];
  const pr2 = /\|rc=(\d+)\|sz=(\d+|NOFILE)\|/.exec(s2.out) || [];
  const sz1 = Number(pr1[2]), sz2 = Number(pr2[2]);
  check('夹具B前置：28089 限速生效（两次探测均超时且仅部分字节，远小于全量）',
    pr1[1] === '28' && pr2[1] === '28' && sz1 > 0 && sz2 > 0 && sz1 < slowSz && sz2 < slowSz,
    'rc=' + pr1[1] + '/' + pr2[1] + ' sz=' + sz1 + ',' + sz2 + ' 全量=' + slowSz);
  /* 停滞语义自检：应答头后无首字节 → curl 超时且不创建输出文件(探针内 tmpF 同样不建,wc 失败→sz=0→停滞路径) */
  const st = await env.exec('curl -s --max-time 2.2 -o /tmp/f10/t-stall.out http://127.0.0.1:28088/cgi-bin/stall.sh; echo "|rc=$?|sz=$(wc -c < /tmp/f10/t-stall.out 2>/dev/null || echo NOFILE)|"');
  const pst = /\|rc=(\d+)\|sz=(\d+|NOFILE)\|/.exec(st.out) || [];
  check('夹具C前置：CGI 停滞源超时 rc=28 且零字节（不建输出文件）',
    pst[1] === '28' && (pst[2] === 'NOFILE' || Number(pst[2]) === 0), 'rc=' + pst[1] + ' sz=' + pst[2]);

  const tmpF = MIHOMO_DIR + '/mihomo.dl.gz';
  const S = (name, url) => ({ name, url, px: '' });
  const FAST = S('快速源', 'http://127.0.0.1:28088/fast.gz');

  /* R1 红灯复现·单源快速完成：修复前判定段必须误判（ok=false 且无失败文案），
     而磁盘事实=exit 0+完整有效 gz>1024B——下载真实成功却被判失败 */
  {
    const r = await (await probeOld())([FAST], tmpF);
    const truth = await env.exec("cat " + MIHOMO_DIR + "/.dl.exit 2>/dev/null || echo NOEXIT; echo '|'; wc -c < '" + tmpF + "' 2>/dev/null || echo NOFILE; echo '|'; gzip -t '" + tmpF + "' 2>/dev/null && echo GZ_OK || echo GZ_BAD");
    const tp = truth.out.split('|');
    const tExit = (tp[0] || '').trim();
    const tSz = Number((tp[1] || '').trim());
    check('R1 红灯复现：修复前段对快速完成的成功下载误判失败（ok=false/静默），磁盘事实=exit 0+有效gz>1024B',
      r.ok === false && r.tried === 1 && r.texts.length === 0 && tExit === '0' && tSz === fastSz && (tp[2] || '').includes('GZ_OK'),
      `ok=${r.ok} tried=${r.tried} 文案数=${r.texts.length} 磁盘: exit=${tExit} bytes=${tSz}/${fastSz} gz有效=${(tp[2] || '').includes('GZ_OK')}`);
  }
  /* R2 红灯复现·双源全快速完成：修复前段两个源都被静默误判 → ok=false 且 tried=2
     ——即生产「所有在线源下载失败」误报的判定输入形态（r2 红灯 artifact 20261003075029 同形态） */
  {
    const r = await (await probeOld())([FAST, S('备源', 'http://127.0.0.1:28088/nope.gz')], tmpF);
    check('R2 红灯复现：修复前段双源全部误判（ok=false, tried=2, 无失败文案）——「所有在线源下载失败」误报形态',
      r.ok === false && r.tried === 2 && r.texts.length === 0,
      `ok=${r.ok} tried=${r.tried}(应2) 文案数=${r.texts.length}(应0)`);
  }

  /* A：快速完成——现行判定 exit 0+最终尺寸复测即 ok，不切源（修复 F10 主缺陷） */
  {
    const r = await (await probeNew())([FAST, S('备源', 'http://127.0.0.1:28088/nope.gz')], tmpF);
    check('A 快速完成：判定 ok 且不切源', r.ok === true && r.tried === 1,
      `ok=${r.ok} tried=${r.tried}(应1) 尾文案=${(r.texts[r.texts.length - 1] || '').slice(0, 50)}`);
  }
  /* B：慢速持续（限速 2KiB/s，轮询期间尺寸每轮增长）——不停滞不切源，最终完成 */
  {
    const r = await (await probeNew())([S('慢速源', 'http://127.0.0.1:28089/slow20k.gz'), FAST], tmpF);
    const stalled = r.texts.some(t => t.includes('停滞'));
    check('B 慢速持续：不切源完成（P07）', r.ok === true && r.tried === 1 && !stalled,
      `ok=${r.ok} tried=${r.tried}(应1) 误判停滞=${stalled}`);
  }
  /* C：停滞（CGI 挂起，0 字节不变 10 轮）→ 停滞文案后切源 → 备源成功 */
  {
    const r = await (await probeNew())([S('停滞源', 'http://127.0.0.1:28088/cgi-bin/stall.sh'), FAST], tmpF);
    const stalledTxt = r.texts.some(t => t.includes('停滞'));
    check('C 停滞：10 轮不变才切源（有停滞文案），备源成功', r.ok === true && r.tried === 2 && stalledTxt,
      `ok=${r.ok} tried=${r.tried}(应2) 停滞文案=${stalledTxt}`);
  }
  /* D：HTTP 404 → curl -f exit 22 按码切源（非误 ok），错误文案含退出码 */
  {
    const r = await (await probeNew())([S('错误源', 'http://127.0.0.1:28088/nope.gz'), FAST], tmpF);
    const errMentioned = r.texts.some(t => /exit\s*22/.test(t));
    check('D HTTP错误页：判失败切源（非误 ok），错误信息含退出码', r.ok === true && r.tried === 2 && errMentioned,
      `ok=${r.ok} tried=${r.tried} 文案含exit22=${errMentioned} 文案=${(r.texts[0] || '').slice(0, 40)}`);
  }

  /* 收尾：TERM 清理两个 lighttpd 与遗留 curl，容器经 destroy 释放 */
  await env.exec('kill $(cat /tmp/f10/lighttpd.pid) $(cat /tmp/f10/lighttpd-slow.pid) 2>/dev/null; for P in $(pidof curl); do kill $P 2>/dev/null; done; rm -f /tmp/f10/lighttpd.pid /tmp/f10/lighttpd-slow.pid').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f10] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F10完成判定真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF10 完成判定真实校验全部通过');
process.exit(bad.length ? 1 : 0);
