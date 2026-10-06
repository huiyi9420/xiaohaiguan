#!/usr/bin/env node
/* ============================================================================
 * F11 下载取消/停滞清理归属真实校验（红灯 R1/R2 + 绿灯 G1-G3）
 * ----------------------------------------------------------------------------
 * 缺陷：四个下载任务(preflightDl/geoInstall/chnInstall/onlineInstall)的停滞切换
 * 与收尾清理用 `for P in $(pidof curl); do kill $P; done` 全局杀——会误杀设备上
 * 插件外的无关下载/控制请求。
 * 修复：下载启动命令记录自有 curl PID(`curl … & echo $! > .x.pid; wait $!; echo $?
 * > .x.exit`)；清理只按 pid 文件杀自有(TERM+kill -0 有界复查)；exit 已写=已自然
 * 结束→跳过 kill 只清 pid 文件(防 PID 复用误杀)；绝不遍历 pidof curl。
 *
 * 同源保证：现行判定段(launch/poll/final/killOwnDl)经 AST+文本从 插件.js onlineInstall
 * 原文提取；修复前段落(含 pidof curl 全局杀)逐字嵌入(String.raw 保留 \' 转义)，
 * 出处=F11 修复前脏基线(2026-10-03 改码前机械提取，F10 修复后形态)。
 *
 * 场景（真实容器，双 lighttpd）：
 *   主 28088(不限速)：fast.gz(快速完成) / cgi-bin/stall.sh(停滞源)
 *   慢 28089(server.kbytes-per-second=2)：slow60k.gz(≈30s 持续下载,第三方目标)
 *   第三方 curl = 与插件无关的独立下载(独立 pid/out 文件)，全程由测试直接管控
 *   R1 红灯·旧停滞清理误杀第三方：旧段停滞 10 轮触发 pidof 全杀 → 第三方死+文件冻结
 *   R2 红灯·旧收尾清理误杀第三方：旧段下载成功后收尾无条件 pidof 全杀 → 第三方死
 *   G1 绿灯·新停滞清理只杀自有：自有 curl 退出、pid 文件清理、第三方存活且持续增长
 *   G2 绿灯·新收尾已完结不杀：exit 已写跳过 kill(防 PID 复用)，第三方存活
 *   G3 绿灯·新取消进行中只杀自有：取消后收尾杀进行中的自有，第三方存活
 * 判活含 zombie 复查(/proc/PID/stat state=Z 视为死，防 kill -0 对僵尸误报 ALIVE)。
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

/* ---------- AST 提取（现行源码,同源） ---------- */
function extractSegments() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  let fn = null, killDecl = '';
  (function find(n) {
    if (fn || !n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'onlineInstall') { fn = n; return }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(find); else if (v && typeof v === 'object') find(v) }
  })(tree);
  if (!fn) throw new Error('onlineInstall 未找到');
  const fnSrc = source.slice(fn.start, fn.end);
  /* killOwnDl 声明(顶层 const,清理命令生成器)——递归找 IIFE 体内 VariableDeclaration */
  (function findKill(n) {
    if (killDecl || !n || typeof n !== 'object') return;
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
      if (d.id.name === 'killOwnDl') killDecl = source.slice(n.start, n.end) + ';';
    }
    if (killDecl) return;
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(findKill); else if (v && typeof v === 'object') findKill(v) }
  })(tree);
  if (!killDecl) throw new Error('killOwnDl 声明未找到(F11 修复未生效?)');
  let launch = '';
  (function visit(n) {
    if (!n || typeof n !== 'object' || launch) return;
    if (n.type === 'ExpressionStatement' && n.expression && n.expression.type === 'AwaitExpression'
      && n.expression.argument && n.expression.argument.type === 'CallExpression'
      && n.expression.argument.callee && n.expression.argument.callee.type === 'Identifier' && n.expression.argument.callee.name === 'run') {
      const text = source.slice(n.start, n.end); /* 节点偏移是全文级,必须对完整 source 切片 */
      if (text.includes('nohup') && text.includes('.dl.pid') && text.includes('.dl.exit')) launch = text;
      return;
    }
    for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') visit(v) }
  })(fn);
  if (!launch) throw new Error('下载启动命令提取失败(应含 .dl.pid 记录)');
  const pollStart = fnSrc.indexOf('let lastSz = -1, stagnant = 0;');
  const pollEndMark = fnSrc.indexOf('if (cancelled) break;', pollStart);
  if (pollStart < 0 || pollEndMark < 0) throw new Error('轮询判定段提取失败');
  const poll = fnSrc.slice(pollStart, pollEndMark);
  /* 收尾清理：poll 结束后第一处 killOwnDl 调用行(单行语句,取整行到换行) */
  const fi = fnSrc.indexOf('await run(killOwnDl(', pollEndMark);
  if (fi < 0) throw new Error('收尾 killOwnDl 清理语句未找到');
  const finalLine = fnSrc.slice(fi, fnSrc.indexOf('\n', fi));
  return { launch, poll, finalLine, killDecl };
}

/* ---------- 修复前段落逐字嵌入（F11 修复前脏基线,改码前机械提取） ---------- */
const OLD_LAUNCH = String.raw`      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.dl.exit') + '; nohup sh -c \'curl -sLf --connect-timeout 8 ' + (t.px ? '-x ' + shq(t.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(t.url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.dl.exit') + '\' >/dev/null 2>&1 &', 5000); /* F10: 加 -f——HTTP 4xx/5xx 时 curl exit 22(非0)且不落盘错误页,按 exit 切源;否则 404 大页会 exit 0 被当成功 */`;
const OLD_POLL = String.raw`      let lastSz = -1, stagnant = 0;
      for (let pi = 0; pi < 120 && !cancelled; pi++) { /* pi=轮询序号; 勿命名 t——会遮蔽外层源对象 t,致进度文案 [undefined](2026-09-02 实测) */
        await wait(1500);
        const ex = await run('cat ' + shq(DIR + '/.dl.exit') + ' 2>/dev/null', 3000);
        const exitCode = (ex.content || '').trim();
      if (exitCode !== '') {
          /* F10: 完成判定=退出码 + 最终尺寸复测(同 preflightDl 先例)——不再依赖轮询期 lastSz 快照,
             修复快速完成(首轮 1.5s 内 exit 0 但 lastSz 仍 -1)被误判失败并耗尽全部源的缺陷 */
          const finR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
          const finSz = pInt(finR);
          console.log('[小海关] 源', t.name, 'exit:', exitCode, 'finSz:', finSz, 'ok:', exitCode === '0' && finSz > 1024);
          if (exitCode === '0' && finSz > 1024) { ok = true; if (totalSz > 0) setFill(100) }
          else if (exitCode !== '0') { setTxt(esc(t.name) + ' 失败(exit ' + exitCode + '),换下一个源…') }
          else { setTxt(esc(t.name) + ' 下载不完整(' + finSz + 'B),换下一个源…') }
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
const OLD_FINAL = String.raw`await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000);`;

/* ---------- 探针 VM：包装提取段，IO 经真实容器 ---------- */
async function buildProbeVm(env, seg, opt = {}) {
  const needKill = !!opt.needKill; /* 现行段依赖 killOwnDl,旧段自带 pidof 不需要 */
  const mods = {};
  for (const name of ['工具']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const wrapSrc = `
    return async function onlineDlProbe(srcSeq, tmpF, opt2) {
      const logs = { texts: [], tried: 0, ok: false, cancelled: false };
      const setTxt = (t) => { logs.texts.push(String(t)); };
      const setFill = () => { };
      const setStep = () => { };
      let cancelled = false;
      if (opt2 && opt2.cancelAfterMs) setTimeout(() => { cancelled = true }, opt2.cancelAfterMs);
      const totalSz = 15 * 1048576;
      const DIR = __DIR;
      const esc = (t) => String(t);
      const shq = (t) => "'" + String(t).replace(/'/g, "'\\\\''") + "'";
      const pInt = (r) => parseInt((r && r.content || '').trim()) || 0;
      const wait = (ms) => new Promise(rs => setTimeout(rs, ms));
      const run = async (cmd, t) => { const r = await __exec(String(cmd), Math.min((Number(t) || 5000) + 8000, 130000)); return { success: r.code === 0, content: r.out }; };
      ${needKill ? '__KILLDECL__' : ''}
      let ok = false;
      for (let mo = 0; mo < srcSeq.length && !ok && !cancelled; mo++) {
        const t = srcSeq[mo];
        logs.tried = mo + 1;
        ${seg.launch}
        ${seg.poll}
      }
      ${seg.finalLine}
      logs.ok = ok; logs.cancelled = cancelled;
      return logs;
    };`;
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, setTimeout, ...mods,
    __exec: (cmd, t) => env.exec(cmd, t),
    __DIR: MIHOMO_DIR
  });
  let src = '(function(__exec){ ' + wrapSrc + ' })';
  if (needKill) src = src.replace('__KILLDECL__', seg.killDecl);
  const factory = vm.runInContext(src, ctx, { timeout: 10000 });
  return factory((cmd, t) => env.exec(cmd, t));
}

/* ---------- 主流程 ---------- */
let env = null;
try {
  env = new RealEnv();
  await env.start();
  await env.installTools();
  await env.exec('mkdir -p ' + MIHOMO_DIR + ' /tmp/f11/errors /tmp/f11/cgi-bin /tmp/f11/slow');

  const fastGen = await env.exec('head -c 4096 /dev/urandom | gzip > /tmp/f11/fast.gz; gzip -t /tmp/f11/fast.gz && echo GZ_OK; wc -c < /tmp/f11/fast.gz');
  const fastSz = Number((fastGen.out.trim().match(/(\d+)\s*$/) || [])[1] || 0);
  check('夹具A资产：fast.gz 有效 gzip 且 >1024B', fastGen.out.includes('GZ_OK') && fastSz > 1024 && fastSz <= 8192, 'bytes=' + fastSz);
  const slowGen = await env.exec('head -c 61440 /dev/urandom | gzip > /tmp/f11/slow/slow60k.gz; gzip -t /tmp/f11/slow/slow60k.gz && echo GZ_OK; printf CANARY > /tmp/f11/slow/ok.txt; wc -c < /tmp/f11/slow/slow60k.gz');
  const slowSz = Number((slowGen.out.trim().match(/(\d+)\s*$/) || [])[1] || 0);
  check('夹具B资产：slow60k.gz 有效 gzip（45-75KB）', slowGen.out.includes('GZ_OK') && slowSz >= 45000 && slowSz <= 75000, 'bytes=' + slowSz);
  await env.writeContainerFile('/tmp/f11/cgi-bin/stall.sh', '#!/bin/sh\necho "Content-Type: application/octet-stream"\necho ""\nsleep 600\n');
  await env.exec('chmod 755 /tmp/f11/cgi-bin/stall.sh');
  await env.writeContainerFile('/tmp/f11/lighttpd.conf', [
    'server.modules = ( "mod_accesslog", "mod_cgi" )',
    'server.port = 28088',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f11"',
    'accesslog.filename = "/tmp/f11/access.log"',
    'server.errorlog = "/tmp/f11/error.log"',
    'server.pid-file = "/tmp/f11/lighttpd.pid"',
    'cgi.assign = ( ".sh" => "/bin/sh" )',
    ''
  ].join('\n'));
  await env.writeContainerFile('/tmp/f11/lighttpd-slow.conf', [
    'server.modules = ( "mod_accesslog" )',
    'server.port = 28089',
    'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f11/slow"',
    'server.kbytes-per-second = 2',
    'accesslog.filename = "/tmp/f11/access-slow.log"',
    'server.errorlog = "/tmp/f11/error-slow.log"',
    'server.pid-file = "/tmp/f11/lighttpd-slow.pid"',
    ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f11/lighttpd.conf >/dev/null 2>&1 & nohup lighttpd -D -f /tmp/f11/lighttpd-slow.conf >/dev/null 2>&1 & sleep 0.8; echo STARTED');
  const srv = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28088/fast.gz')).out.trim();
  /* 慢速服务 200 探测用小 canary(限速下全量大文件探测会吃光带宽窗口且撑爆 exec 超时) */
  const slowSrv = (await env.exec('curl -s -o /dev/null -w %{http_code} http://127.0.0.1:28089/ok.txt')).out.trim();
  const st = await env.exec('curl -s --max-time 2.2 -o /tmp/f11/t-stall.out http://127.0.0.1:28088/cgi-bin/stall.sh; echo "|rc=$?|sz=$(wc -c < /tmp/f11/t-stall.out 2>/dev/null || echo NOFILE)|"');
  const pst = /\|rc=(\d+)\|sz=(\d+|NOFILE)\|/.exec(st.out) || [];
  const sp = await env.exec('curl -s --max-time 4 -o /tmp/f11/t-slow.out http://127.0.0.1:28089/slow60k.gz; echo "|rc=$?|sz=$(wc -c < /tmp/f11/t-slow.out 2>/dev/null || echo NOFILE)|"', 12000);
  const psp = /\|rc=(\d+)\|sz=(\d+|NOFILE)\|/.exec(sp.out) || [];
  check('夹具服务就绪（fast=200/slow=200/停滞 rc28 零字节/限速部分字节）',
    srv === '200' && slowSrv === '200' && pst[1] === '28' && (pst[2] === 'NOFILE' || Number(pst[2]) === 0)
      && psp[1] === '28' && Number(psp[2]) > 0 && Number(psp[2]) < slowSz,
    `fast=${srv} slow=${slowSrv} stall rc=${pst[1]} sz=${pst[2]} slow rc=${psp[1]} sz=${psp[2]}/${slowSz}`);

  /* ---------- 第三方 curl 管控（与插件无关的独立下载） ---------- */
  const third = {
    start: async n => {
      await env.exec('rm -f /tmp/f11/third-' + n + '.out /tmp/f11/third-' + n + '.pid; nohup curl -sL -o /tmp/f11/third-' + n + '.out http://127.0.0.1:28089/slow60k.gz >/dev/null 2>&1 & echo $! > /tmp/f11/third-' + n + '.pid', 8000);
      /* 限速服务首字节可能有秒级延迟(带宽窗口被近期连接占用),有界等到首字节再交由增长断言 */
      const t0 = Date.now();
      while (Date.now() - t0 < 12000 && !(await third.size(n))) await new Promise(r => setTimeout(r, 500));
    },
    state: async n => {
      const r = await env.exec('P=$(cat /tmp/f11/third-' + n + '.pid 2>/dev/null || echo 0); S=$(cut -d" " -f3 /proc/$P/stat 2>/dev/null); if [ "$P" -gt 1 ] 2>/dev/null && [ -n "$S" ] && [ "$S" != "Z" ]; then echo ALIVE; else echo DEAD; fi', 5000);
      return r.out.trim();
    },
    size: async n => Number(((await env.exec('wc -c < /tmp/f11/third-' + n + '.out 2>/dev/null || echo 0', 5000)).out.trim())) || 0,
    grew: async (n, ms = 3000, min = 200) => {
      const a = await third.size(n);
      await new Promise(r => setTimeout(r, ms));
      const b = await third.size(n);
      return { grew: b > a + min, a, b };
    },
    stop: async n => { await env.exec('P=$(cat /tmp/f11/third-' + n + '.pid 2>/dev/null); [ -n "$P" ] && kill $P 2>/dev/null; true', 5000); }
  };
  const ownPid = async () => Number(((await env.exec('cat ' + MIHOMO_DIR + '/.dl.pid 2>/dev/null', 3000)).out.trim())) || 0;
  const alivePid = async P => {
    if (!P || P <= 1) return 'DEAD';
    const r = await env.exec('S=$(cut -d" " -f3 /proc/' + P + '/stat 2>/dev/null); if [ -n "$S" ] && [ "$S" != "Z" ]; then echo ALIVE; else echo DEAD; fi', 5000);
    return r.out.trim();
  };

  const tmpF = MIHOMO_DIR + '/mihomo.dl.gz';
  const S = (name, url) => ({ name, url, px: '' });
  const FAST = S('快速源', 'http://127.0.0.1:28088/fast.gz');
  const STALL = S('停滞源', 'http://127.0.0.1:28088/cgi-bin/stall.sh');
  const SLOWDL = S('慢速源', 'http://127.0.0.1:28089/slow60k.gz');
  const OLD_SEG = { launch: OLD_LAUNCH, poll: OLD_POLL, finalLine: OLD_FINAL };
  const oldProbe = () => buildProbeVm(env, OLD_SEG, { needKill: false });

  /* ---------- R1 红灯：旧停滞清理(pidof 全杀)误杀第三方 ---------- */
  {
    await third.start(1);
    const pre = await third.grew(1, 2000, 100);
    const r = await (await oldProbe())([STALL], tmpF);
    const st1 = await third.state(1);
    const post = await third.grew(1, 2500, 100);
    const stalled = r.texts.some(t => t.includes('停滞'));
    check('R1 红灯复现：修复前停滞清理(pidof curl 全杀)误杀无关第三方下载',
      pre.grew && stalled && st1 === 'DEAD' && !post.grew,
      `第三方前期增长=${pre.grew}(${pre.a}→${pre.b}B) 停滞触发=${stalled} 清理后第三方=${st1} 冻结=${!post.grew}(${post.a}→${post.b}B) ok=${r.ok}`);
    await third.stop(1);
  }
  /* ---------- R2 红灯：旧收尾清理(下载已成功仍无条件 pidof 全杀)误杀第三方 ---------- */
  {
    await third.start(2);
    const r = await (await oldProbe())([FAST], tmpF);
    const st2 = await third.state(2);
    check('R2 红灯复现：修复前收尾清理在下载成功后仍误杀无关第三方',
      r.ok === true && r.tried === 1 && st2 === 'DEAD',
      `自有下载 ok=${r.ok} tried=${r.tried}(第三方全程无关) 收尾pidof后第三方=${st2}`);
    await third.stop(2);
  }

  /* ---------- 现行段提取（修复未生效则此处抛错→探针异常,红灯） ---------- */
  let probeNew;
  try {
    const seg = extractSegments();
    probeNew = () => buildProbeVm(env, seg, { needKill: true });
  } catch (e) {
    check('现行段提取(.dl.pid+killOwnDl 新形态)', false, '提取失败: ' + String(e.message).slice(0, 120));
    probeNew = null;
  }

  /* ---------- G1 绿灯：新停滞清理只杀自有 ---------- */
  if (probeNew) {
    await third.start(3);
    const pre = await third.grew(3, 2000, 100);
    const p = (await probeNew())([STALL], tmpF);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000 && !(await ownPid())) await new Promise(r => setTimeout(r, 500)); /* 采自有 pid */
    const op = await ownPid();
    const r = await p;
    const ownEnd = await alivePid(op);
    const pidFileGone = (await env.exec('test -f ' + MIHOMO_DIR + '/.dl.pid && echo YES || echo NO', 3000)).out.trim() === 'NO';
    const st3 = await third.state(3);
    const post = await third.grew(3, 3000, 200);
    const stalled = r.texts.some(t => t.includes('停滞'));
    check('G1 停滞清理只杀自有：自有 curl 退出+pid 文件清理，第三方存活且持续增长',
      pre.grew && stalled && ownEnd === 'DEAD' && pidFileGone && st3 === 'ALIVE' && post.grew,
      `第三方前期增长=${pre.grew} 停滞触发=${stalled} 自有pid=${op}→${ownEnd} pid文件已清=${pidFileGone} 第三方=${st3} 清理后增长=${post.grew}(${post.a}→${post.b}B)`);
    await third.stop(3);
  }
  /* ---------- G2 绿灯：新收尾清理已完结不杀(exit 已写跳过,防 PID 复用) ---------- */
  if (probeNew) {
    await third.start(4);
    const r = await (await probeNew())([FAST], tmpF);
    const st4 = await third.state(4);
    const post = await third.grew(4, 3000, 200);
    const pidFileGone = (await env.exec('test -f ' + MIHOMO_DIR + '/.dl.pid && echo YES || echo NO', 3000)).out.trim() === 'NO';
    check('G2 收尾清理已完结不杀：下载成功后不误杀第三方(防 PID 复用)，pid 文件清理',
      r.ok === true && r.tried === 1 && st4 === 'ALIVE' && post.grew && pidFileGone,
      `ok=${r.ok} tried=${r.tried} 第三方=${st4} 清理后增长=${post.grew}(${post.a}→${post.b}B) pid文件已清=${pidFileGone}`);
    await third.stop(4);
  }
  /* ---------- G3 绿灯：取消进行中只杀自有(用户取消语义) ---------- */
  if (probeNew) {
    await third.start(5);
    const p = (await probeNew())([SLOWDL], tmpF, { cancelAfterMs: 4000 });
    const t0 = Date.now();
    while (Date.now() - t0 < 3500 && !(await ownPid())) await new Promise(r => setTimeout(r, 400));
    const op = await ownPid();
    const r = await p;
    const ownEnd = await alivePid(op);
    const st5 = await third.state(5);
    const post = await third.grew(5, 3000, 200);
    check('G3 取消进行中只杀自有：取消后收尾杀自有下载，第三方不受影响',
      r.cancelled === true && op > 1 && ownEnd === 'DEAD' && st5 === 'ALIVE' && post.grew,
      `cancelled=${r.cancelled} 自有pid=${op}→${ownEnd} 第三方=${st5} 清理后增长=${post.grew}(${post.a}→${post.b}B)`);
    await third.stop(5);
  }

  /* 收尾：停两个 lighttpd、清残留 curl 与第三方，容器经 destroy 释放 */
  await env.exec('kill $(cat /tmp/f11/lighttpd.pid) $(cat /tmp/f11/lighttpd-slow.pid) 2>/dev/null; for P in $(pidof curl); do kill $P 2>/dev/null; done; rm -f /tmp/f11/lighttpd.pid /tmp/f11/lighttpd-slow.pid').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f11] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F11下载归属真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF11 下载归属真实校验全部通过');
process.exit(bad.length ? 1 : 0);
