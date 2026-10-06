#!/usr/bin/env node
/* ============================================================================
 * 桥命令生存期与销毁次序专项机器探针（返修：root 复现 P1 + 异常清理保留轮）
 * ----------------------------------------------------------------------------
 * 覆盖矩阵（任一断言失败 → 本脚本 exit 1，禁止打印失败却 exit 0）：
 *   T1 HTTP 级精确反例：cmd='sleep 60; echo SHOULD_NOT_PRINT', timeout=1000
 *      → 必须 success:false、content 无延迟标记、尊重请求超时（宽限另计）。
 *   T2 前台超时（bridgeExec 级）：同命令 → timedOut 且进程组消亡。
 *   T3 后台后代：'sleep 45 & echo BG_DONE' → 请求正常结束后组内后代不存在。
 *   T4 快速成功：echo OK_123 → 成功且内容精确。
 *   T5 非零失败：exit 7 → 真实退出码 7、success:false。
 *   T6 桥主动关闭时有在途请求：stopBridge → 在途组 TERM+核实消亡，有搁浅证据。
 *   T7 适当并发独立请求：两组并发，各自独立完成、输出不串扰。
 *   T8 TERM 忽略组（自然上限 30s，禁止永久拒绝退出）：请求期限+宽限耗尽后
 *      cleanupFailed/blocked、pid/out/err/rc 证据不被删除、destroy 保留容器不
 *      PID1 TERM/rm、进程仍存活；自然结束后由本次所有者清理（无 SIGKILL）。
 *      并验证 stopBridge 关门先行（处理期间新请求被拒）。
 *   T9 真实查询失败/未知 PID 路径（无 mock）：真实缺失 pid 文件、真实缺失 cat
 *      工具（PATH 隔离）→ 必须 unknown 而非 gone（fail-closed）。
 * 探针只作用于本探针主动创建的容器；清理仅 TERM+有界等待，无法退出报 blocked 保留。
 * ==========================================================================*/
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const { RealEnv } = await import('./runner.mjs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
/* 容器内进程组消亡核验：kill -0 -PGID 失败即组不存在 */
async function groupGone(env, pgid) {
  if (!pgid) return false;
  const r = await env.exec(`kill -0 -${pgid} 2>/dev/null && echo ALIVE || echo GONE`);
  return r.out.trim() === 'GONE';
}
/* 现存四件套文件清点（glob+test 内建，无 ls 依赖） */
async function listBxFiles(env) {
  return (await env.exec('for f in /tmp/hs_bx_*.pid /tmp/hs_bx_*.out /tmp/hs_bx_*.err /tmp/hs_bx_*.rc; do [ -f "$f" ] && echo "$f"; done; true')).out.trim().split('\n').filter(Boolean);
}

let env = null;
try {
  env = new RealEnv();
  await env.start();

  /* ---------- T4/T5/T2/T3：bridgeExec 行为矩阵 ---------- */
  {
    const r = await env.bridgeExec('echo OK_123', 8000);
    const ok = r.code === 0 && r.out.includes('OK_123') && !r.timedOut;
    check('T4 快速成功：echo 输出精确回传', ok, `code=${r.code} out=[${(r.out || '').trim().slice(0, 40)}] timedOut=${r.timedOut}`);
  }
  {
    const r = await env.bridgeExec('exit 7', 8000);
    const ok = r.code === 7 && !r.timedOut;
    check('T5 非零失败：真实退出码 7', ok, `code=${r.code} timedOut=${r.timedOut}`);
  }
  {
    const t0 = Date.now();
    const r = await env.bridgeExec('sleep 60; echo SHOULD_NOT_PRINT', 1000);
    const ms = Date.now() - t0;
    const noMarker = !(r.out || '').includes('SHOULD_NOT_PRINT');
    const gone = await groupGone(env, r.trackedPid);
    const ok = r.timedOut === true && noMarker && gone && ms >= 1000 && ms <= 13000;
    check('T2 前台超时：请求超时生效、延迟标记未执行、进程组消亡（不销毁容器即证明）',
      ok, `timedOut=${r.timedOut} marker_absent=${noMarker} groupGone=${gone} elapsed=${ms}ms trackedPid=${r.trackedPid}`);
  }
  {
    const r = await env.bridgeExec('sleep 45 & echo BG_DONE', 8000);
    const done = r.code === 0 && (r.out || '').includes('BG_DONE');
    const gone = await groupGone(env, r.trackedPid);
    check('T3 后台后代：请求结束后组内后代不存在', done && gone, `code=${r.code} groupGone=${gone} trackedPid=${r.trackedPid}`);
  }

  /* ---------- T7 并发独立请求 ---------- */
  {
    const [a, b] = await Promise.all([
      env.bridgeExec('sleep 1; echo CON_A', 10000),
      env.bridgeExec('sleep 2; echo CON_B', 10000)
    ]);
    const ok = a.code === 0 && a.out.includes('CON_A') && !a.out.includes('CON_B')
      && b.code === 0 && b.out.includes('CON_B') && !b.out.includes('CON_A');
    check('T7 并发独立请求：输出不串扰', ok, `a=[${(a.out || '').trim()}] b=[${(b.out || '').trim()}]`);
  }

  /* ---------- T1 HTTP 级精确反例（root 复现路径） ---------- */
  const bridge = await env.startBridge({ fixtureHtml: '', pluginJs: '' });
  {
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${bridge.port}/api/run_shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-HS-Bridge': bridge.token },
      body: JSON.stringify({ cmd: 'sleep 60; echo SHOULD_NOT_PRINT', timeout: 1000 })
    });
    const body = await res.json();
    const ms = Date.now() - t0;
    const noMarker = !String(body.content || '').includes('SHOULD_NOT_PRINT');
    const ok = res.status === 200 && body.success === false && noMarker && ms >= 1000 && ms <= 13000;
    check('T1 HTTP 反例：timeout=1000 的 sleep 60 → success:false、无延迟标记、尊重请求超时',
      ok, `HTTP=${res.status} success=${body.success} marker_absent=${noMarker} elapsed=${ms}ms`);
  }

  /* ---------- T6 桥主动关闭时有在途请求 ---------- */
  {
    const inflight = env.bridgeExec('sleep 30', 25000).catch(e => ({ code: -1, out: '', err: String(e.message), timedOut: true }));
    let pidSeen = false;
    for (let i = 0; i < 40 && !pidSeen; i++) {
      await new Promise(r => setTimeout(r, 200));
      pidSeen = (await env.exec('cat /tmp/hs_bx_*.pid 2>/dev/null')).out.trim() !== '';
    }
    const ev = await env.stopBridge();
    await inflight;
    const remaining = (await listBxFiles(env)).length;
    const ok = pidSeen && (ev.strandedKilled || []).some(k => k.state === 'gone' || k.state === 'group-gone')
      && remaining === 0;
    check('T6 桥关闭时在途请求：组 TERM+核实消亡、pid/out 文件清理', ok,
      `pidSeen=${pidSeen} stranded=${JSON.stringify(ev.strandedKilled).slice(0, 160)} remaining=${remaining}`);
  }

  /* ---------- T9 真实查询失败/未知 PID 路径（无 mock，fail-closed 断言） ---------- */
  {
    /* a) pid 文件真实缺失：_termGroup 必须 unknown 而非 gone */
    const ra = await env._termGroup({ pidFile: '/tmp/hs_bx_nonexistent.pid', outFile: '/tmp/hs_bx_nonexistent.out', errFile: '/tmp/hs_bx_nonexistent.err', rcFile: '/tmp/hs_bx_nonexistent.rc', pid: null }, 1500);
    check('T9a pid 未确认（pid 文件真实缺失）→ unknown 而非 gone', ra.gone === false && ra.unknown === true, JSON.stringify(ra));
    /* b) 真实查询失败：把 pid 文件路径做成目录（cat 真实运行、真实报错，非 mock），
       同时存在一个真实存活进程证明 fail-closed 不误判消亡 */
    await env.exec('mkdir -p /tmp/hs_bx_902.pid; nohup sleep 25 >/dev/null 2>&1 & echo $! > /tmp/hs-real.pid');
    const realPid = Number((await env.exec('cat /tmp/hs-real.pid')).out.trim());
    const pidRead = await env._readPid({ pidFile: '/tmp/hs_bx_902.pid' });
    const rb = await env._termGroup({ pidFile: '/tmp/hs_bx_902.pid', outFile: '/tmp/hs_bx_902.out', errFile: '/tmp/hs_bx_902.err', rcFile: '/tmp/hs_bx_902.rc', pid: null }, 1500);
    const groupReally = (await env.exec(`kill -0 ${realPid} 2>/dev/null && echo ALIVE || echo GONE`)).out.trim();
    check('T9b 真实查询失败（cat 读目录报错）→ pid 读不到 → unknown 且真实存活进程不被误判消亡',
      pidRead === null && rb.gone === false && rb.unknown === true && groupReally === 'ALIVE',
      `readPid=${pidRead} term=${JSON.stringify(rb)} group=${groupReally}`);
    await env.exec(`kill ${realPid} 2>/dev/null; rm -rf /tmp/hs_bx_902.pid /tmp/hs-real.pid`);
  }

  /* ---------- T8 TERM 忽略组（自然上限 30s）：取证保留 + destroy 保留容器 ---------- */
  {
    const bridge2 = await env.startBridge({ fixtureHtml: '', pluginJs: '' });
    /* trap '' TERM 使子壳忽略 TERM；循环 30×1s 提供自然结束上限（禁止永久拒绝退出）。
       组 TERM 会杀掉当前 sleep，但子壳存活继续循环 → 组不消亡。 */
    const cmd = `trap '' TERM; I=0; while [ $I -lt 30 ]; do sleep 1; I=$((I+1)); done`;
    const reqP = env.bridgeExec(cmd, 1000, 3000);
    let pidSeen = false, tPid = null;
    for (let i = 0; i < 40 && !pidSeen; i++) {
      await new Promise(r => setTimeout(r, 200));
      const v = (await env.exec('cat /tmp/hs_bx_*.pid 2>/dev/null')).out.trim().split('\n')[0];
      if (/^\d+$/.test(v || '')) { pidSeen = true; tPid = Number(v); }
    }
    /* stopBridge 关门先行：处理在途期间新请求必须被拒（503 或连接关闭） */
    const sbP = env.stopBridge();
    await new Promise(r => setTimeout(r, 400));
    let gateOk = false, gateDetail = '';
    try {
      const res = await fetch(`http://127.0.0.1:${bridge2.port}/api/run_shell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-HS-Bridge': bridge2.token },
        body: JSON.stringify({ cmd: 'echo GATE_PROBE', timeout: 2000 })
      });
      const b = await res.json().catch(() => ({}));
      gateOk = res.status === 503 || b.success === false;
      gateDetail = `HTTP=${res.status} success=${b.success}`;
    } catch (e) { gateOk = true; gateDetail = '连接已拒绝'; }
    const sb = await sbP;
    const r8 = await reqP;
    const alive = async () => tPid ? ((await env.exec(`kill -0 -${tPid} 2>/dev/null && echo ALIVE || echo GONE`)).out.trim() === 'ALIVE') : false;
    const filesAfterStop = await listBxFiles(env);
    check('T8 超时+宽限耗尽：cleanupFailed、证据文件不被 stopBridge 删除、进程仍存活',
      r8.timedOut === true && r8.cleanupFailed === true && filesAfterStop.length >= 3 && (await alive()) && pidSeen,
      `timedOut=${r8.timedOut} cleanupFailed=${r8.cleanupFailed} files=${filesAfterStop.length} alive=${await alive()} pid=${tPid}`);
    check('T8 stopBridge 关门先行：处理期间新请求被拒绝', gateOk, gateDetail);
    const strandedBad = (sb.strandedKilled || []).some(k => k.state === 'term-ignored' || k.state === 'unknown');
    const retainedOk = ((sb.pidFilesRetained || []).length > 0) || ((sb.strandedKilled || []).some(k => k.state !== 'group-gone'));
    check('T8 stopBridge 证据保留：stranded 记录 term-ignored/unknown 且文件保留',
      strandedBad && retainedOk, `stranded=${JSON.stringify(sb.strandedKilled || []).slice(0, 140)} retained=${JSON.stringify(sb.pidFilesRetained || []).slice(0, 100)}`);
    const ev8 = await env.destroy();
    const st8 = await execFileP('docker', ['inspect', env.containerId, '--format', '{{.State.Status}}'], { timeout: 15000 }).then(r => r.stdout.trim(), () => 'absent');
    const filesAfterDestroy = await listBxFiles(env);
    check('T8 destroy 保留容器：不 PID1 TERM/rm、进程与证据文件仍在',
      ev8.container && ev8.container.kept === true && !ev8.container.removed && st8 === 'running' && (await alive()) && filesAfterDestroy.length >= 3,
      `kept=${ev8.container && ev8.container.kept} removed=${ev8.container && ev8.container.removed} state=${st8} alive=${await alive()} files=${filesAfterDestroy.length} blocked=${JSON.stringify(ev8.blockedReasons || []).slice(0, 120)}`);
    /* 等待自然结束（上限 ~45s），随后由本次所有者按 TERM 纪律清理（无 SIGKILL） */
    let naturallyEnded = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      await new Promise(r => setTimeout(r, 1000));
      if (!(await alive())) { naturallyEnded = true; break; }
    }
    check('T8 TERM 忽略组在自然上限内自行结束（全程无 SIGKILL）', naturallyEnded, `${Math.round((Date.now() - t0) / 1000)}s`);
    const ev8b = await env.destroy();
    check('T8 自然结束后所有者清理：removed 且无 blocked',
      ev8b.container && ev8b.container.removed === true && !(ev8b.blockedReasons || []).length,
      JSON.stringify(ev8b.container || {}).slice(0, 140) + ' blocked=' + JSON.stringify(ev8b.blockedReasons || []));
  }
} catch (e) {
  check('探针自身异常（计为失败）', false, String(e && e.message).slice(0, 200));
  if (env) { try { const evd = await env.destroy(); console.log('[probe] 异常路径 destroy:', JSON.stringify(evd.container || {}).slice(0, 120)); } catch (e2) { console.log('[probe] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
console.log(bad.length ? `\n${bad.length} 项未通过` : '\n桥命令生存期探针全部通过');
process.exit(bad.length ? 1 : 0);
