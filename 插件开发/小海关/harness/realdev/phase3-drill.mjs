/* ============================================================================
 * phase3-drill.mjs — 接管演练(需 --confirm;预期闪断)
 * ----------------------------------------------------------------------------
 * 步骤(幂等,断线重跑续跑;全程 state 机 + 断线自动重连):
 *   pre   基线: 规则在 + 面板可达(只读)
 *   clean 摘除规则(sh fw.sh clean) → 等 3s → 验证规则清零 + 面板仍可达
 *   apply 重挂(sh fw.sh apply) → 等就绪 → 验证规则在 + 页面正常
 * 报告含断线次数(flapped)与恢复时间(recoveryMs,取各次 shell 调用的最大值)。
 * 产物: harness/artifacts/真机阶段3-<stamp>.json
 * ⚠ 预期闪断: clean/apply 会改动设备防火墙,面板连接可能短暂中断,由基础座自动重连。
 * ==========================================================================*/
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const HERE = (() => {
  try { if (import.meta.url.startsWith('file://')) return path.dirname(fileURLToPath(import.meta.url)); }
  catch (e) { /* ignore */ }
  return '/Users/zhaolulu/Projects/U60Pro-zwrt/插件开发/小海关/harness/realdev';
})();

const R = await import(pathToFileURL(path.join(HERE, 'resilience.mjs')).href);

const PHASE = 'phase3';
const results = [];
let totalFlapped = 0;
let maxRecoveryMs = 0;

function ruleCountCmd() {
  return 'echo V4=$(iptables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N"); '
    + 'echo V4M=$(iptables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N"); '
    + 'echo V6=$(ip6tables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N"); '
    + 'echo V6M=$(ip6tables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N")';
}

function parseCounts(content) {
  const out = {};
  for (const line of String(content || '').split('\n')) {
    const m = /^(V4|V4M|V6|V6M)=(\d+)$/.exec(line.trim());
    if (m) out[m[1]] = parseInt(m[2], 10) || 0;
  }
  return out;
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
    if (r.recoveryMs) maxRecoveryMs = Math.max(maxRecoveryMs, r.recoveryMs);
    const ok = !!r.pass;
    results.push({ step, name, status: ok ? 'pass' : 'fail', evidence: R.redact(r.evidence || ''), flapped: r.flapped || 0, recoveryMs: r.recoveryMs || 0 });
    await R.markStep(PHASE, step, ok ? 'done' : 'failed', r.err || '');
    console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + step + '  ' + name + (r.recoveryMs ? '  (恢复 ' + r.recoveryMs + 'ms)' : ''));
  } catch (e) {
    results.push({ step, name, status: 'fail', evidence: '异常: ' + String((e && e.message) || e).slice(0, 200), flapped: 0 });
    await R.markStep(PHASE, step, 'failed', String((e && e.message) || e));
    console.log('❌ FAIL(异常)  ' + step + '  ' + name + '  ' + String((e && e.message) || e).slice(0, 120));
  }
}

const args = R.parseArgs();
console.log('phase3 参数: confirm=' + args.confirm + ' panel=' + args.panel);

if (!args.confirm) {
  console.log('\n========== DRY-RUN(未带 --confirm,不执行接管演练) ==========');
  console.log('  1) pre   : 记录基线规则计数 + 面板可达(只读)');
  console.log('  2) clean : sh /data/plugins/customs/fw.sh clean → sleep 3 → 验证规则清零 + 面板仍可达');
  console.log('  3) apply : sh /data/plugins/customs/fw.sh apply → 等就绪 → 验证规则在 + 页面正常');
  console.log('\n⚠ 预期闪断: clean/apply 改动防火墙,面板连接可能短暂中断,由基础座自动重连。');
  console.log('提示: 确认执行请加 --confirm(或 HS_CONFIRM=1)。');
  const reportFile = await R.writeReport('真机阶段3', {
    generatedAt: new Date().toISOString(), phase: PHASE, mode: 'dry-run', panel: args.panel, summary: { pass: 0, fail: 0, skip: 0, flapped: 0, maxRecoveryMs: 0 }, results: [],
  });
  console.log('计划报告: ' + reportFile);
  if (process && typeof process.exitCode !== 'undefined') process.exitCode = 0;
} else {
  let page = null;
  try {
    await R.initArtifacts(PHASE);
    const task = await R.getTask(args.space);
    page = await R.ensurePage(task, args.label, { panel: args.panel });

    await runStep('pre', '基线(规则在+面板可达)', async () => {
      const r = await R.shellCmd(page, ruleCountCmd(), { label: 'pre-rulecount', timeout: 12000 });
      const c = parseCounts(r.content);
      const reach = await R.shellCmd(page, 'echo OK', { label: 'pre-reach', timeout: 12000 });
      const hasRules = (c.V4 + c.V4M + c.V6 + c.V6M) > 0;
      const pass = r.ok && reach.ok && hasRules;
      return { pass, flapped: r.flapped + reach.flapped, recoveryMs: Math.max(r.recoveryMs || 0, reach.recoveryMs || 0), evidence: JSON.stringify({ counts: c, reachable: reach.ok }), err: pass ? '' : '基线无规则或面板不可达' };
    });

    await runStep('clean', '摘除规则(fw.sh clean)+面板仍可达', async () => {
      const cl = await R.shellCmd(page, 'sh ' + R.FW + ' clean 2>&1; echo RC=$?', { label: 'fw-clean', timeout: 30000 });
      await R.wait(3000);
      const cnt = await R.shellCmd(page, ruleCountCmd(), { label: 'post-clean-count', timeout: 12000 });
      const c = parseCounts(cnt.content);
      const reach = await R.shellCmd(page, 'echo OK', { label: 'post-clean-reach', timeout: 15000 });
      const zeroed = (c.V4 + c.V4M + c.V6 + c.V6M) === 0;
      const pass = cl.ok && zeroed && reach.ok;
      return { pass, flapped: cl.flapped + cnt.flapped + reach.flapped, recoveryMs: Math.max(cl.recoveryMs || 0, cnt.recoveryMs || 0, reach.recoveryMs || 0), evidence: JSON.stringify({ cleanOutput: (cl.content || '').trim().slice(0, 200), counts: c, reachable: reach.ok }), err: pass ? '' : '摘除后规则未清零或面板不可达' };
    });

    await runStep('apply', '重挂(fw.sh apply)+规则在+页面正常', async () => {
      const ap = await R.shellCmd(page, 'sh ' + R.FW + ' apply 2>&1; echo RC=$?', { label: 'fw-apply', timeout: 60000 });
      await R.wait(3000);
      const cnt = await R.shellCmd(page, ruleCountCmd(), { label: 'post-apply-count', timeout: 12000 });
      const c = parseCounts(cnt.content);
      let domOk = false, domInfo = '';
      try {
        const dom = await page.evaluate(() => {
          const card = document.getElementById('hs_card');
          const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
          return { cardExists: !!card, initFail: bodyText.includes('初始化失败') };
        });
        domOk = dom.cardExists && !dom.initFail;
        domInfo = JSON.stringify(dom);
      } catch (e) { domInfo = '页面评估异常: ' + String(e.message).slice(0, 120); }
      const hasRules = (c.V4 + c.V4M + c.V6 + c.V6M) > 0;
      const pass = ap.ok && hasRules && domOk;
      return { pass, flapped: ap.flapped + cnt.flapped, recoveryMs: Math.max(ap.recoveryMs || 0, cnt.recoveryMs || 0), evidence: JSON.stringify({ applyOutput: (ap.content || '').trim().slice(0, 200), counts: c, dom: domInfo }), err: pass ? '' : '重挂后规则未恢复或页面异常' };
    });

  } catch (e) {
    console.log('❌ phase3 自身异常: ' + String((e && e.message) || e));
    results.push({ step: '__phase__', name: 'phase3 自身异常', status: 'fail', evidence: String((e && e.message) || e).slice(0, 300), flapped: 0 });
  }

  const summary = { pass: results.filter(x => x.status === 'pass').length, fail: results.filter(x => x.status === 'fail').length, skip: results.filter(x => x.status === 'skip').length, flapped: totalFlapped, maxRecoveryMs };
  const reportFile = await R.writeReport('真机阶段3', {
    generatedAt: new Date().toISOString(), phase: PHASE, mode: 'confirmed', panel: args.panel, logFile: R.getLogFile(), summary, results,
  });
  console.log('\n========== 阶段3 汇总 ==========');
  console.log(JSON.stringify(summary));
  console.log('报告: ' + reportFile);
  if (process && typeof process.exitCode !== 'undefined') process.exitCode = summary.fail ? 1 : 0;
}
