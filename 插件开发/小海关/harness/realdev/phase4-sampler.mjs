/* ============================================================================
 * phase4-sampler.mjs — 24 小时采样器
 * ----------------------------------------------------------------------------
 * 默认每 5 分钟(--interval 覆盖,支持 300s/5m)采一次,持续 24h(--duration 覆盖)。
 * 每样本: 引擎 RSS/线程数(/proc/PID/status,PID 用 F15 ownEnginePids 形态)、
 *   连接数(控制口 /connections 的 len)、磁盘(df -k /data)、规则计数
 *   (iptables -t nat -S | grep -c HS_)、uptime。
 * 追加 ndjson 落盘 harness/artifacts/realdev-samples-<stamp>.ndjson;
 * 网络失败标记 skip 并继续(绝不中断循环);Ctrl-C(SIGINT)写终态安全退出。
 * 结束时产出汇总(min/max/avg/trend)写 harness/artifacts/真机阶段4汇总-<stamp>.json。
 * ==========================================================================*/
const fs = await import('node:fs/promises');
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const HERE = (() => {
  try { if (import.meta.url.startsWith('file://')) return path.dirname(fileURLToPath(import.meta.url)); }
  catch (e) { /* ignore */ }
  return '/Users/zhaolulu/Projects/U60Pro-zwrt/插件开发/小海关/harness/realdev';
})();

const R = await import(pathToFileURL(path.join(HERE, 'resilience.mjs')).href);

const PHASE = 'phase4';
let stop = false;
let stopReason = 'duration';

process.on('SIGINT', () => {
  stop = true; stopReason = 'SIGINT';
  console.log('\n[SIGINT] 收到中断,当前样本完成后写终态并退出');
});
process.on('SIGTERM', () => {
  stop = true; stopReason = 'SIGTERM';
  console.log('\n[SIGTERM] 收到终止,当前样本完成后写终态并退出');
});

const args = R.parseArgs();
const samplesFile = 'realdev-samples-' + R.stamp() + '.ndjson';

function parseKv(content) {
  const out = {};
  for (const line of String(content || '').split('\n')) {
    const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

/* 读 ctrl 端口与 secret(仅内存,不落盘);secret 入脱敏名单 */
let CTRL = null;
let SECRET = '';
async function readCfg(page) {
  const cmd = 'D=' + R.DIR + '; echo CTRL=$(jsonfilter -i "$D/config.json" -e "@.ports.ctrl" 2>/dev/null); echo SECRET=$(jsonfilter -i "$D/config.json" -e "@.secret" 2>/dev/null)';
  const r = await R.shellViaPanel(page, cmd, 15000);
  const kv = parseKv(r.content);
  CTRL = parseInt(kv.CTRL, 10) || null;
  SECRET = kv.SECRET || '';
  if (SECRET) R.setSecrets([SECRET]);
  await R.logLine({ evt: 'cmd', label: 'phase4-cfg', ok: r.ok, cmd: cmd.slice(0, 120), content: r.content }, [SECRET]);
  return { ok: r.ok, flapped: r.flapped };
}

async function takeSample(page, n) {
  const cmd = 'D=' + R.DIR + '\n'
    + 'PIDS=""; for Q in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$Q/exe 2>/dev/null)" = "$D/mihomo" ] && PIDS="$PIDS $Q"; done\n'
    + 'PID=$(echo $PIDS | awk \'{print $1}\')\n'
    + 'echo RSS=$(grep VmRSS /proc/$PID/status 2>/dev/null | awk \'{print $2}\')\n'
    + 'echo THREADS=$(grep Threads /proc/$PID/status 2>/dev/null | awk \'{print $2}\')\n'
    + 'echo CONNS=$(curl -fsS -m 5 -H "Authorization: Bearer ' + SECRET + '" "http://127.0.0.1:' + (CTRL || 0) + '/connections" 2>/dev/null | grep -o \'"id"\' | wc -l)\n'
    + 'echo DF_USED=$(df -k /data 2>/dev/null | tail -1 | awk \'{print $3}\')\n'
    + 'echo DF_AVAIL=$(df -k /data 2>/dev/null | tail -1 | awk \'{print $4}\')\n'
    + 'echo RULES=$(iptables -t nat -S 2>/dev/null | grep -c HS_)\n'
    + 'echo UPTIME=$(cut -d" " -f1 /proc/uptime 2>/dev/null)';
  const r = await R.shellViaPanel(page, cmd, 15000, { secrets: [SECRET] });
  await R.logLine({ evt: 'cmd', label: 'sample#' + n, ok: r.ok, flapped: r.flapped, cmd: cmd.slice(0, 200), content: r.content }, [SECRET]);
  return { r, kv: parseKv(r.content) };
}

function toNum(v) { const n = parseInt(v, 10); return isNaN(n) ? null : n; }
function toFloat(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

async function main() {
  await R.initArtifacts(PHASE);
  const task = await R.getTask(args.space);
  const page = await R.ensurePage(task, args.label, { panel: args.panel });
  console.log('phase4 采样: interval=' + args.interval + 'ms duration=' + args.duration + 'ms panel=' + args.panel);

  await readCfg(page); // 尽力取一次 ctrl/secret;失败不阻塞(conns 记 skip)

  const metrics = ['rss', 'threads', 'conns', 'dfUsed', 'dfAvail', 'rules', 'uptime'];
  const series = { rss: [], threads: [], conns: [], dfUsed: [], dfAvail: [], rules: [], uptime: [] };
  const deadline = Date.now() + args.duration;
  let n = 0, skips = 0, flaps = 0;

  async function sleepUntil(ms) {
    const end = Date.now() + ms;
    while (!stop && Date.now() < end) await R.wait(500);
  }

  while (!stop && Date.now() < deadline) {
    n++;
    const entry = { evt: 'sample', n, ok: true, skip: [], flapped: 0, rss: null, threads: null, conns: null, dfUsed: null, dfAvail: null, rules: null, uptime: null };
    try {
      const { r, kv } = await takeSample(page, n);
      entry.flapped = r.flapped; flaps += r.flapped;
      if (!r.ok) { entry.ok = false; entry.skip.push('shell失败:' + (r.err || '').slice(0, 80)); }
      const v = { rss: toNum(kv.RSS), threads: toNum(kv.THREADS), conns: toNum(kv.CONNS), dfUsed: toNum(kv.DF_USED), dfAvail: toNum(kv.DF_AVAIL), rules: toNum(kv.RULES), uptime: toFloat(kv.UPTIME) };
      for (const k of metrics) {
        entry[k] = v[k];
        if (v[k] == null) entry.skip.push(k);
        else series[k].push(v[k]);
      }
      if (entry.skip.length) skips++;
    } catch (e) {
      entry.ok = false; entry.skip.push('样本异常:' + String(e.message).slice(0, 120));
      skips++;
    }
    await R.appendNdjson(samplesFile, entry, [SECRET]);
    console.log('sample#' + n + ' ok=' + entry.ok + ' rss=' + entry.rss + ' threads=' + entry.threads + ' conns=' + entry.conns + ' rules=' + entry.rules + ' skip=' + (entry.skip.join(',') || '-'));
    await sleepUntil(args.interval);
  }

  // 汇总
  const agg = {};
  for (const k of metrics) {
    const s = series[k];
    if (!s.length) { agg[k] = { count: 0, min: null, max: null, avg: null, trend: null }; continue; }
    const min = Math.min(...s), max = Math.max(...s), avg = s.reduce((a, b) => a + b, 0) / s.length;
    agg[k] = { count: s.length, min, max, avg: Math.round(avg * 100) / 100, trend: Math.round((s[s.length - 1] - s[0]) * 100) / 100 };
  }
  const summaryPayload = {
    generatedAt: new Date().toISOString(), phase: PHASE,
    stopReason, samples: n, skips, flaps,
    interval: args.interval, duration: args.duration, panel: args.panel,
    agg,
  };
  const HARNESS = path.resolve(HERE, '..');
  summaryPayload.samplesFile = path.join(HARNESS, 'artifacts', samplesFile);
  await R.markStep(PHASE, 'done', 'done', stopReason + ' samples=' + n + ' skips=' + skips + ' flaps=' + flaps);
  const reportFile = await R.writeReport('真机阶段4汇总', summaryPayload);
  console.log('\n========== 阶段4 采样汇总 ==========');
  console.log(JSON.stringify(agg, null, 2));
  console.log('samples=' + n + ' skips=' + skips + ' flaps=' + flaps + ' stopReason=' + stopReason);
  console.log('样本文件: ' + summaryPayload.samplesFile);
  console.log('汇总报告: ' + reportFile);
}

main().catch(e => {
  console.log('❌ phase4 自身异常: ' + String((e && e.message) || e));
  if (process && typeof process.exitCode !== 'undefined') process.exitCode = 1;
});
