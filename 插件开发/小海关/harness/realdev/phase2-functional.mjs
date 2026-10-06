/* ============================================================================
 * phase2-functional.mjs — 功能抽测(有状态改变,默认 dry-run;--confirm 才执行)
 * ----------------------------------------------------------------------------
 * 步骤(幂等,断线重跑续跑):
 *   sub_read  订阅文件可读(providers/sub<activeSub>.yaml 存在/尺寸/节点数)
 *   sub_proxy mixed 口连通性抽测 3 次(curl -x mixed https://gstatic 204)
 *   devices   设备列表读取(config.json devices/lines)
 * 不重启引擎。--confirm 判定: process.argv 含 --confirm 或环境变量 HS_CONFIRM=1。
 * 产物: harness/artifacts/真机阶段2-<stamp>.json
 * ==========================================================================*/
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const HERE = (() => {
  try { if (import.meta.url.startsWith('file://')) return path.dirname(fileURLToPath(import.meta.url)); }
  catch (e) { /* ignore */ }
  return '/Users/zhaolulu/Projects/U60Pro-zwrt/插件开发/小海关/harness/realdev';
})();

const R = await import(pathToFileURL(path.join(HERE, 'resilience.mjs')).href);

const PHASE = 'phase2';
const results = [];
let totalFlapped = 0;

function parseKv(content) {
  const out = {};
  for (const line of String(content || '').split('\n')) {
    const m = /^([A-Z][A-Z0-9]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function readBasic(page) {
  const cmd = 'D=' + R.DIR + '\n'
    + 'echo MIXED=$(jsonfilter -i "$D/config.json" -e "@.ports.mixed" 2>/dev/null)\n'
    + 'echo ACTIVE=$(jsonfilter -i "$D/config.json" -e "@.activeSub" 2>/dev/null)\n'
    + 'echo POLICY=$(jsonfilter -i "$D/config.json" -e "@.policySrc" 2>/dev/null)';
  const r = await R.shellViaPanel(page, cmd, 15000);
  const kv = parseKv(r.content);
  await R.logLine({ evt: 'cmd', label: 'phase2-cfg', ok: r.ok, cmd: cmd.slice(0, 200), content: r.content });
  return { ok: r.ok, flapped: r.flapped, mixed: parseInt(kv.MIXED, 10), activeSub: kv.ACTIVE, policy: kv.POLICY };
}

async function runStep(step, name, fn) {
  if (R.isDone(PHASE, step)) {
    results.push({ step, name, status: 'skip', evidence: '已完成(续跑跳过)', flapped: 0 });
    console.log('⏭  SKIP  ' + step + '  ' + name);
    return;
  }
  try {
    const r = await fn();
    totalFlapped += (r.flapped || 0);
    const ok = !!r.pass;
    results.push({ step, name, status: ok ? 'pass' : 'fail', evidence: R.redact(r.evidence || ''), flapped: r.flapped || 0 });
    await R.markStep(PHASE, step, ok ? 'done' : 'failed', r.err || '');
    console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + step + '  ' + name);
  } catch (e) {
    results.push({ step, name, status: 'fail', evidence: '异常: ' + String((e && e.message) || e).slice(0, 200), flapped: 0 });
    await R.markStep(PHASE, step, 'failed', String((e && e.message) || e));
    console.log('❌ FAIL(异常)  ' + step + '  ' + name + '  ' + String((e && e.message) || e).slice(0, 120));
  }
}

/* 计划(dry-run 展示用) */
function plan() {
  return [
    { step: 'sub_read', name: '订阅文件可读', what: 'ls -la + wc -c + 节点数统计 providers/sub<activeSub>.yaml' },
    { step: 'sub_proxy', name: 'mixed 口连通性抽测×3', what: 'curl -s -m 8 -x http://127.0.0.1:<mixed> -o /dev/null -w "%{http_code} %{time_total}" https://www.gstatic.com/generate_204 (重复3次)' },
    { step: 'devices', name: '设备列表读取', what: 'jsonfilter config.json @.devices / @.lines(脱敏 MAC/IP)' },
  ];
}

const args = R.parseArgs();
console.log('phase2 参数: confirm=' + args.confirm + ' panel=' + args.panel);

if (!args.confirm) {
  console.log('\n========== DRY-RUN(未带 --confirm,不执行任何有状态操作) ==========');
  for (const p of plan()) console.log('  [' + p.step + '] ' + p.name + '  →  ' + p.what);
  console.log('\n提示: 确认执行请加 --confirm(或 HS_CONFIRM=1)。');
  const reportFile = await R.writeReport('真机阶段2', {
    generatedAt: new Date().toISOString(), phase: PHASE, mode: 'dry-run', panel: args.panel, plan: plan(), summary: { pass: 0, fail: 0, skip: 0, flapped: 0 }, results: [],
  });
  console.log('计划报告: ' + reportFile);
  if (process && typeof process.exitCode !== 'undefined') process.exitCode = 0;
} else {
  let page = null;
  try {
    await R.initArtifacts(PHASE);
    const task = await R.getTask(args.space);
    page = await R.ensurePage(task, args.label, { panel: args.panel });

    await runStep('sub_read', '订阅文件可读', async () => {
      const b = await readBasic(page);
      if (!b.ok || !b.activeSub || b.activeSub === '-1' || b.activeSub === '') {
        return { pass: false, flapped: b.flapped, evidence: '无活动订阅(activeSub=' + b.activeSub + ')', err: '无活动订阅' };
      }
      const cmd = 'D=' + R.DIR + '; F="$D/providers/sub' + b.activeSub + '.yaml"; '
        + 'echo EXISTS=$([ -f "$F" ] && echo 1); echo SIZE=$(wc -c < "$F" 2>/dev/null || echo 0); '
        + 'echo NODES=$(grep -c "^  - " "$F" 2>/dev/null || echo 0); echo HEAD=$(head -c 200 "$F" 2>/dev/null)';
      const r = await R.shellCmd(page, cmd, { label: 'sub_read', timeout: 15000 });
      const kv = parseKv(r.content);
      const pass = r.ok && kv.EXISTS === '1' && parseInt(kv.SIZE, 10) > 0;
      return { pass, flapped: b.flapped + r.flapped, evidence: JSON.stringify({ exists: kv.EXISTS, size: kv.SIZE, nodes: kv.NODES, head: (kv.HEAD || '').slice(0, 160) }), err: pass ? '' : '订阅文件不可读' };
    });

    await runStep('sub_proxy', 'mixed 口连通性抽测×3', async () => {
      const b = await readBasic(page);
      if (!b.ok || !Number.isInteger(b.mixed) || b.mixed < 1) {
        return { pass: false, flapped: b.flapped, evidence: 'mixed 端口不可用', err: 'mixed 端口缺失' };
      }
      const attempts = [];
      let flapped = b.flapped;
      for (let i = 1; i <= 3; i++) {
        const cmd = 'curl -s -m 8 -x http://127.0.0.1:' + b.mixed + ' -o /dev/null -w "%{http_code} %{time_total}" https://www.gstatic.com/generate_204 2>/dev/null; RC=$?; echo; echo RC=$RC';
        const r = await R.shellCmd(page, cmd, { label: 'sub_proxy#' + i, timeout: 15000 });
        flapped += r.flapped;
        const m = /(\d{3})\s+([0-9.]+)/.exec(r.content || '');
        const rcM = /RC=(\d+)/.exec(r.content || '');
        attempts.push({ n: i, http: m ? m[1] : '?', sec: m ? m[2] : '?', rc: rcM ? rcM[1] : '?', flapped: r.flapped });
      }
      const ok204 = attempts.filter(a => a.http === '204').length;
      const pass = ok204 >= 1; // 至少 1 次 204 = mixed 口可用(机场偶发超时属正常)
      return { pass, flapped, evidence: JSON.stringify({ attempts, ok204 }), err: pass ? '' : '3 次抽测均非 204' };
    });

    await runStep('devices', '设备列表读取', async () => {
      const cmd = 'D=' + R.DIR + '\n'
        + 'echo DEVICES=$(jsonfilter -i "$D/config.json" -e "@.devices" 2>/dev/null)\n'
        + 'echo LINES=$(jsonfilter -i "$D/config.json" -e "@.lines" 2>/dev/null)';
      const r = await R.shellCmd(page, cmd, { label: 'devices', timeout: 15000 });
      const pass = r.ok;
      return { pass, flapped: r.flapped, evidence: (r.content || '').trim().slice(0, 1500), err: pass ? '' : '设备列表读取失败' };
    });

  } catch (e) {
    console.log('❌ phase2 自身异常: ' + String((e && e.message) || e));
    results.push({ step: '__phase__', name: 'phase2 自身异常', status: 'fail', evidence: String((e && e.message) || e).slice(0, 300), flapped: 0 });
  }

  const summary = { pass: results.filter(x => x.status === 'pass').length, fail: results.filter(x => x.status === 'fail').length, skip: results.filter(x => x.status === 'skip').length, flapped: totalFlapped };
  const reportFile = await R.writeReport('真机阶段2', {
    generatedAt: new Date().toISOString(), phase: PHASE, mode: 'confirmed', panel: args.panel, logFile: R.getLogFile(), summary, results,
  });
  console.log('\n========== 阶段2 汇总 ==========');
  console.log(JSON.stringify(summary));
  console.log('报告: ' + reportFile);
  if (process && typeof process.exitCode !== 'undefined') process.exitCode = summary.fail ? 1 : 0;
}
