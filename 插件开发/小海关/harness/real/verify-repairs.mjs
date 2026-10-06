#!/usr/bin/env node
/* ============================================================================
 * 返修项针对性验证（不跑完整套件）：
 *   1) 重名冲突：既有同名容器保留不动，RealEnv.start 拒绝且 destroy 不触碰；
 *   2) deepRedact：报告原文/base64/URI 编码形式的密钥全消除；
 *   3) 致命路径：HS_F01_FORCE_ASSET_FAIL=1 注入资产校验失败 →
 *      子进程 f01 必须有 SUITE-FATAL 机器记录且退出码非零。
 * 退出码：0=全部验证通过；1=存在未通过。
 * 本脚本只创建/清理自己命名的 decoy 容器（TERM → 有界等待 → rm），不触碰其他容器。
 * ==========================================================================*/
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { RealEnv, deepRedact, buildRedactNeedles, PLUGIN_ROOT, MIHOMO_ASSET } = await import('./runner.mjs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}

/* 1) 重名冲突（强化版）：decoy 为本脚本自建容器，内含：
   ① 一个 mihomo 命名的真实测试进程（busybox 副本，comm=mihomo 且监听 29090）；
   ② 桥 pidfile（/tmp/hs_bx_1.pid）指向真实存活的 sleep 进程。
   被拒绝的 RealEnv.destroy 之后：进程 PID/端口/pidfile 字节/容器 ID 全不变，再由 decoy 原所有者（本脚本）清理。 */
{
  const NAME = 'hs-f01-verify-conflict-' + crypto.randomBytes(3).toString('hex');
  const digest = (await execFileP('docker', ['image', 'inspect', 'alpine:latest', '--format', '{{index .RepoDigests 0}}'], { timeout: 20000 })).stdout.trim();
  const decoyId = (await execFileP('docker', ['run', '-d', '--init', '--name', NAME, digest, 'sleep', '300'], { timeout: 60000 })).stdout.trim();
  const dexec = (cmd) => execFileP('docker', ['exec', decoyId, 'sh', '-c', cmd], { timeout: 30000 }).then(r => r.stdout, e => 'ERR:' + (e.code || '') + ':' + String(e.message).slice(0, 80));
  try {
    /* decoy 内部署：真实 mihomo 二进制作 decoy 进程（comm=mihomo、真实监听端口；
       busybox 多调用副本按 argv[0] 派发 applet，改命名无法运行，故用真内核）+ 桥 pidfile 指向存活 sleep */
    await execFileP('docker', ['cp', path.join(PLUGIN_ROOT, '.build', 'real-cache', MIHOMO_ASSET), `${decoyId}:/tmp/in.gz`], { timeout: 60000 });
    await dexec('gunzip -c /tmp/in.gz > /tmp/mihomo && chmod 755 /tmp/mihomo && rm -f /tmp/in.gz');
    await dexec('nohup /tmp/mihomo >/dev/null 2>&1 & sleep 1.2; nohup sleep 555 >/dev/null 2>&1 & sleep 0.3; echo $! > /tmp/hs_bx_1.pid');
    const snap = async () => ({
      mihomoPid: (await dexec('pidof mihomo || true')).trim(),
      portLines: (await dexec("netstat -lntp 2>/dev/null | grep mihomo | wc -l")).trim(),
      pidfile: (await dexec('cat /tmp/hs_bx_1.pid')).trim(),
      sleepAlive: (await dexec('P=$(cat /tmp/hs_bx_1.pid); kill -0 $P 2>/dev/null && echo alive || echo gone')).trim()
    });
    const before = await snap();
    const env = new RealEnv({ name: NAME });
    let startThrew = false;
    try { await env.start(); } catch (e) { startThrew = true; }
    check('重名冲突：start() 拒绝且 created=false', startThrew && env.created === false);
    const ev = await env.destroy();
    const after = await snap();
    const state = (await execFileP('docker', ['inspect', decoyId, '--format', '{{.Id}}@@{{.State.Status}}'], { timeout: 15000 })).stdout.trim();
    const [idNow, st] = state.split('@@');
    const untouched = idNow === decoyId && st === 'running'
      && after.mihomoPid === before.mihomoPid && before.mihomoPid !== ''
      && after.portLines === before.portLines && Number(before.portLines) > 0
      && after.pidfile === before.pidfile && before.pidfile !== ''
      && after.sleepAlive === 'alive' && before.sleepAlive === 'alive';
    check('重名冲突：destroy 对 decoy 零副作用（进程/端口/pidfile/ID 全不变）', untouched,
      `mihomo=${before.mihomoPid}→${after.mihomoPid} 端口行=${before.portLines}→${after.portLines} pidfile=${before.pidfile}→${after.pidfile} sleep=${after.sleepAlive} state=${st} ev=${JSON.stringify(ev.container)}`);
  } finally {
    /* decoy 原所有者（本脚本）清理：TERM → 有界等待 → rm，与生产清理同款信号纪律 */
    await dexec('kill $(pidof mihomo) 2>/dev/null; kill $(cat /tmp/hs_bx_1.pid) 2>/dev/null; rm -f /tmp/hs_bx_1.pid /tmp/mihomo').catch(() => { });
    await new Promise(r => setTimeout(r, 800));
    await execFileP('docker', ['exec', decoyId, 'kill', '-TERM', '1'], { timeout: 10000 }).catch(() => { });
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const st = await execFileP('docker', ['inspect', decoyId, '--format', '{{.State.Status}}'], { timeout: 15000 }).then(r => r.stdout.trim(), () => 'gone');
      if (st === 'exited' || st === 'gone') break;
      await new Promise(r => setTimeout(r, 300));
    }
    await execFileP('docker', ['rm', decoyId], { timeout: 30000 }).catch(() => { });
  }
}

/* 2) deepRedact：三种编码形式全消除 */
{
  const secret = 'S3cr' + crypto.randomBytes(10).toString('hex');
  const needles = buildRedactNeedles([secret]);
  const poisoned = {
    a: 'x ' + secret + ' y',
    b: ['b64:' + Buffer.from(secret).toString('base64')],
    c: { d: 'uri:' + encodeURIComponent(secret) },
    e: new Error('boom ' + secret).message
  };
  const out = JSON.stringify(deepRedact(poisoned, needles));
  check('deepRedact：原文/base64/URI 全消除', !out.includes(secret)
    && !out.includes(Buffer.from(secret).toString('base64'))
    && !out.includes(encodeURIComponent(secret)));
}

/* 3) 致命路径：注入资产校验失败，子进程必须有机器记录与非零退出 */
{
  const r = await new Promise(resolve => {
    const c = spawn(process.execPath, [path.join(HERE, 'f01-readiness.mjs')], {
      env: { ...process.env, HS_F01_FORCE_ASSET_FAIL: '1' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { out += d; });
    c.on('error', () => resolve({ code: -1, out }));
    c.on('exit', code => resolve({ code, out }));
  });
  check('致命路径：非零退出 + SUITE-FATAL 机器记录', r.code !== 0 && r.out.includes('SUITE-FATAL'), `exit=${r.code}`);
}

/* 4) ID/label 所有权不匹配：篡改 containerId 后 destroy 必须拒绝且零副作用，恢复后正常清理 */
{
  const env = new RealEnv();
  await env.start();
  const realId = env.containerId;
  /* 哨兵：文件 + 存活进程（验证 destroy 未产生任何容器内副作用） */
  await env.exec('echo SENTINEL_V1 > /tmp/sentinel.txt; nohup sleep 400 >/dev/null 2>&1 & echo $! > /tmp/sentinel.pid');
  const sentBefore = (await env.exec('cat /tmp/sentinel.txt; P=$(cat /tmp/sentinel.pid); kill -0 $P 2>/dev/null && echo alive || echo gone')).out.trim();
  env.containerId = 'f'.repeat(64); /* 模拟所有权凭据与实际容器不符 */
  const ev = await env.destroy();
  const stillRunning = await execFileP('docker', ['inspect', realId, '--format', '{{.State.Status}}'], { timeout: 15000 }).then(r => r.stdout.trim(), () => 'absent');
  const sentAfter = (await execFileP('docker', ['exec', realId, 'sh', '-c', 'cat /tmp/sentinel.txt; P=$(cat /tmp/sentinel.pid); kill -0 $P 2>/dev/null && echo alive || echo gone'], { timeout: 20000 }).then(r => r.stdout.trim(), () => 'EXEC_FAIL'));
  const noSideEffect = ev.container && ev.container.touched === false
    && stillRunning === 'running' && sentAfter === sentBefore && sentAfter.includes('alive')
    && (ev.blockedReasons || []).some(x => x.includes('所有权'));
  check('所有权不匹配：destroy 拒绝清理且零副作用', noSideEffect,
    `state=${stillRunning} sentinel=${sentAfter.replace('\n', '/')} touched=${ev.container && ev.container.touched} reasons=${JSON.stringify(ev.blockedReasons)}`);
  /* 恢复真实 ID 后正常清理（TERM 全程） */
  env.containerId = realId;
  const ev2 = await env.destroy();
  check('所有权恢复后正常清理（removed 且无 blocked）', ev2.container && ev2.container.removed === true && !(ev2.blockedReasons || []).length,
    JSON.stringify(ev2.container || {}).slice(0, 120));
}

const bad = results.filter(x => !x.ok);
console.log(bad.length ? `\n${bad.length} 项验证未通过` : '\n返修验证全部通过');
process.exit(bad.length ? 1 : 0);
