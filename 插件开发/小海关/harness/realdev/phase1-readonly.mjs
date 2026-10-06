/* ============================================================================
 * phase1-readonly.mjs — 只读验证(部署后第一步,不改任何设备状态)
 * ----------------------------------------------------------------------------
 * 步骤(每步幂等,断线重跑从未完成步续跑):
 *   load     插件装载/卡片渲染/版本/无重复加载警告(页面 DOM,只读)
 *   cfg      读取 config.json(端口/secret/订阅/模式/启动态)——secret 只留内存
 *   engine   引擎进程(ownEnginePids 所有权核验)
 *   ready    引擎就绪(buildReadinessCommand + parseReadiness,鉴权 200+端口监听)
 *   n6       IPv6 邻居采集(ip -6 neigh)
 *   netstat  端口监听(netstat)
 *   macset   MAC 集合存在性(ipset list -n | grep hs_w)
 *   cfg_yaml config.yaml 含 listeners 段与 hsln_ 规则
 *   iptables iptables HS_ 链概览(仅 -S 列举)
 *   console  页面 console 错误捕获(DOM 错误态 + CDP 事件,不重载保持只读)
 * 产物: harness/artifacts/真机阶段1-<stamp>.json(pass/fail/flapped 计数)
 * 退出码: 0=全部通过 / 1=有失败(ego-browser 下退出码不可靠,以 JSON summary 为准)
 * ==========================================================================*/
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

const HERE = (() => {
  try { if (import.meta.url.startsWith('file://')) return path.dirname(fileURLToPath(import.meta.url)); }
  catch (e) { /* ignore */ }
  return '/Users/zhaolulu/Projects/U60Pro-zwrt/插件开发/小海关/harness/realdev';
})();

const R = await import(pathToFileURL(path.join(HERE, 'resilience.mjs')).href);

const PHASE = 'phase1';
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

async function readCfg(page) {
  const cmd = 'D=' + R.DIR + '\n'
    + 'echo CTRL=$(jsonfilter -i "$D/config.json" -e "@.ports.ctrl" 2>/dev/null)\n'
    + 'echo MIXED=$(jsonfilter -i "$D/config.json" -e "@.ports.mixed" 2>/dev/null)\n'
    + 'echo REDIR=$(jsonfilter -i "$D/config.json" -e "@.ports.redir" 2>/dev/null)\n'
    + 'echo TPROXY=$(jsonfilter -i "$D/config.json" -e "@.ports.tproxy" 2>/dev/null)\n'
    + 'echo DNS=$(jsonfilter -i "$D/config.json" -e "@.ports.dns" 2>/dev/null)\n'
    + 'echo SECRET=$(jsonfilter -i "$D/config.json" -e "@.secret" 2>/dev/null)\n'
    + 'echo ACTIVE=$(jsonfilter -i "$D/config.json" -e "@.activeSub" 2>/dev/null)\n'
    + 'echo MODE=$(jsonfilter -i "$D/config.json" -e "@.mode" 2>/dev/null)\n'
    + 'echo BOOT=$(jsonfilter -i "$D/config.json" -e "@.bootMode" 2>/dev/null)\n'
    + 'echo POLICY=$(jsonfilter -i "$D/config.json" -e "@.policySrc" 2>/dev/null)\n'
    + 'echo VER=$(jsonfilter -i "$D/config.json" -e "@.ver" 2>/dev/null)\n'
    + 'echo SUBS=$(grep -c \'"url"\' "$D/config.json" 2>/dev/null)\n'
    + 'echo LINES=$(grep -c \'"node"\' "$D/config.json" 2>/dev/null)\n'
    + 'echo DEVICES=$(grep -c \'"mac"\' "$D/config.json" 2>/dev/null)';
  const r = await R.shellViaPanel(page, cmd, 20000);
  const kv = parseKv(r.content);
  const ports = {
    ctrl: parseInt(kv.CTRL, 10), mixed: parseInt(kv.MIXED, 10), redir: parseInt(kv.REDIR, 10),
    tproxy: parseInt(kv.TPROXY, 10), dns: parseInt(kv.DNS, 10),
  };
  const secret = kv.SECRET || '';
  // secret 立即入脱敏名单,再落日志(命令与输出均被抹掉)
  if (secret) R.setSecrets([secret]);
  await R.logLine({ evt: 'cmd', label: 'cfg', ok: r.ok, flapped: r.flapped, cmd: cmd.slice(0, 300), content: r.content }, [secret]);
  return { ok: r.ok, flapped: r.flapped, ports, secret, kv, raw: r.content };
}

async function readPid(page) {
  const r = await R.shellCmd(page, R.ownEnginePidsCmd(), { label: 'engine-pid', timeout: 12000 });
  const kv = parseKv(r.content);
  return { ok: r.ok, flapped: r.flapped, pids: (kv.PID || '').trim() };
}

async function runStep(step, name, fn) {
  if (R.isDone(PHASE, step)) {
    results.push({ step, name, status: 'skip', evidence: '已完成(断线重跑跳过)', flapped: 0 });
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

/* ================= 主流程 ================= */
let page = null;
try {
  await R.initArtifacts(PHASE);
  const args = R.parseArgs();
  const task = await R.getTask(args.space);
  page = await R.ensurePage(task, args.label, { panel: args.panel });
  console.log('面板: ' + args.panel + '  页面标签: ' + args.label);

  await runStep('load', '插件装载/卡片渲染/版本/无重复加载', async () => {
    const r = await page.evaluate(() => {
      const out = { loaded: !!window.__customs_loaded };
      const card = document.getElementById('hs_card');
      out.cardExists = !!card;
      out.cardText = card ? (card.innerText || card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
      out.doubleLoad = bodyText.includes('重复加载');
      out.initFail = bodyText.includes('初始化失败');
      out.portNotReady = bodyText.includes('端口未就绪');
      out.dupCard = document.querySelectorAll('#hs_card').length;
      const m = /v?(\d+\.\d+\.\d+)/.exec(out.cardText);
      out.version = m ? m[1] : '';
      return out;
    });
    const pass = r.loaded && r.cardExists && r.cardText.includes('小海关') && !r.doubleLoad && !r.initFail && /^\d+\.\d+\.\d+$/.test(r.version);
    return {
      pass, flapped: 0,
      evidence: JSON.stringify(r),
      err: pass ? '' : ('loaded=' + r.loaded + ' card=' + r.cardExists + ' 重复加载=' + r.doubleLoad + ' 初始化失败=' + r.initFail + ' version=' + r.version),
    };
  });

  await runStep('cfg', '读取 config.json(端口/订阅/模式)', async () => {
    const c = await readCfg(page);
    const portsOk = ['ctrl', 'mixed', 'redir', 'dns'].every(k => Number.isInteger(c.ports[k]) && c.ports[k] > 0);
    const pass = c.ok && portsOk && !!c.secret;
    return {
      pass, flapped: c.flapped,
      evidence: JSON.stringify({ ports: c.ports, activeSub: c.kv.ACTIVE, mode: c.kv.MODE, bootMode: c.kv.BOOT, policySrc: c.kv.POLICY, ver: c.kv.VER, subs: c.kv.SUBS, lines: c.kv.LINES, devices: c.kv.DEVICES, secretPresent: !!c.secret }),
      err: pass ? '' : '配置读取失败或端口/secret 缺失',
    };
  });

  await runStep('engine', '引擎进程(所有权核验)', async () => {
    const p = await readPid(page);
    const pass = p.ok && !!p.pids;
    return { pass, flapped: p.flapped, evidence: JSON.stringify({ pids: p.pids, running: !!p.pids }), err: pass ? '' : '引擎进程未运行或采集失败' };
  });

  await runStep('ready', '引擎就绪(buildReadinessCommand)', async () => {
    const c = await readCfg(page);
    if (!c.ok || !c.secret) return { pass: false, flapped: c.flapped, evidence: '配置/secret 不可用', err: 'secret 缺失' };
    const p = await readPid(page);
    if (!p.pids) return { pass: false, flapped: c.flapped + p.flapped, evidence: '引擎未运行,无法采集就绪', err: 'pid 为空' };
    const cmd = R.buildReadinessCommand(c.ports, c.secret, p.pids);
    const r = await R.shellCmd(page, cmd, { label: 'ready', timeout: 15000, secrets: [c.secret] });
    let parsed = null, parseErr = '';
    try { parsed = R.parseReadiness(r.content, c.ports); } catch (e) { parseErr = String(e.message); }
    const pass = r.ok && parsed && parsed.ctrl && parsed.mixed && parsed.redir && parsed.dns;
    return {
      pass, flapped: c.flapped + p.flapped + r.flapped,
      evidence: JSON.stringify({ listen: parsed, parseErr }),
      err: pass ? '' : '就绪未通过(ctrl/mixed/redir/dns 需全绿),见 listen',
    };
  });

  await runStep('n6', 'IPv6 邻居采集(ip -6 neigh)', async () => {
    const r = await R.shellCmd(page, R.N6_COMMAND, { label: 'n6', timeout: 12000 });
    const pass = r.ok && /^=N6=/.test((r.content || '').trim());
    return { pass, flapped: r.flapped, evidence: r.content.trim().slice(0, 500), err: pass ? '' : 'N6 采集失败' };
  });

  await runStep('netstat', '端口监听(netstat)', async () => {
    const cmd = 'netstat -lntup 2>/dev/null | grep mihomo | awk \'{print $1,$4,$6}\'';
    const r = await R.shellCmd(page, cmd, { label: 'netstat', timeout: 12000 });
    const pass = r.ok;
    return { pass, flapped: r.flapped, evidence: (r.content || '').trim().slice(0, 800), err: pass ? '' : 'netstat 采集失败' };
  });

  await runStep('macset', 'MAC 集合存在性(ipset hs_w)', async () => {
    const cmd = 'ipset list -n 2>/dev/null | grep hs_w; echo =CNT=$(ipset list -n 2>/dev/null | grep -c hs_w)';
    const r = await R.shellCmd(page, cmd, { label: 'macset', timeout: 12000 });
    const pass = r.ok;
    return { pass, flapped: r.flapped, evidence: (r.content || '').trim().slice(0, 500), err: pass ? '' : 'ipset 采集失败' };
  });

  await runStep('cfg_yaml', 'config.yaml listeners 段与 hsln_ 规则', async () => {
    const cmd = 'D=' + R.DIR + '\n'
      + 'echo HAS_LISTENERS=$(grep -c "^listeners:" "$D/config.yaml" 2>/dev/null)\n'
      + 'echo HAS_HSLN=$(grep -c "hsln_" "$D/config.yaml" 2>/dev/null)\n'
      + 'grep -E "^(mixed-port:|redir-port:|external-controller:)" "$D/config.yaml" 2>/dev/null\n'
      + 'grep -E "IN-NAME,hsln_|listeners:" "$D/config.yaml" 2>/dev/null | head -20';
    const r = await R.shellCmd(page, cmd, { label: 'cfg_yaml', timeout: 12000 });
    const pass = r.ok && /^HAS_LISTENERS=/.test(r.content || '');
    return { pass, flapped: r.flapped, evidence: (r.content || '').trim().slice(0, 800), err: pass ? '' : 'config.yaml 采集失败' };
  });

  await runStep('iptables', 'iptables HS_ 链概览(-S 列举)', async () => {
    const cmd = 'for T in nat mangle filter; do echo "== $T =="; iptables -t $T -S 2>/dev/null | grep HS_; done; '
      + 'echo "== v6-nat =="; ip6tables -t nat -S 2>/dev/null | grep HS_; '
      + 'echo "== v6-mangle =="; ip6tables -t mangle -S 2>/dev/null | grep HS_';
    const r = await R.shellCmd(page, cmd, { label: 'iptables', timeout: 15000 });
    const pass = r.ok;
    return { pass, flapped: r.flapped, evidence: (r.content || '').trim().slice(0, 1500), err: pass ? '' : 'iptables 采集失败' };
  });

  await runStep('console', '页面 console 错误捕获(不重载)', async () => {
    // 只读方案: 不重载页面(重载会触发 init 的 upgradeAudit/自愈写盘,破坏只读纪律)。
    // 仅做 DOM 错误态检测 + CDP Runtime/Log 事件(捕获本阶段执行期间的页面错误)。
    let cdpErrors = [];
    let cdpNote = '';
    try {
      await page.cdp('Runtime.enable', {});
      await page.cdp('Log.enable', {});
      await page.evaluate(() => document.readyState);
      const evts = await page.events();
      for (const e of (Array.isArray(evts) ? evts : [])) {
        const m = e && e.method ? e.method : (e && e.type ? e.type : '');
        const p = (e && e.params) || {};
        if (m === 'Runtime.exceptionThrown') cdpErrors.push('exception: ' + String((p.exceptionDetails && p.exceptionDetails.text) || JSON.stringify(p)).slice(0, 200));
        else if (m === 'Runtime.consoleAPICalled' && p.type === 'error') cdpErrors.push('console.error: ' + String((p.args || []).map(a => a.value || a.description || '').join(' ')).slice(0, 200));
        else if (m === 'Log.entryAdded' && p.entry && p.entry.level === 'error') cdpErrors.push('log.error: ' + String(p.entry.text || '').slice(0, 200));
      }
    } catch (e) { cdpNote = 'CDP 不可用/异常: ' + String(e.message).slice(0, 120); }
    const dom = await page.evaluate(() => {
      const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
      return {
        doubleLoad: bodyText.includes('重复加载'),
        initFail: bodyText.includes('初始化失败'),
        portNotReady: bodyText.includes('端口未就绪'),
        cardCount: document.querySelectorAll('#hs_card').length,
      };
    });
    // DOM 错误态是主判据(只读);CDP 捕获失败不判 fail,仅作 evidence 备注。
    const pass = !dom.doubleLoad && !dom.initFail && dom.cardCount === 1;
    return { pass, flapped: 0, evidence: JSON.stringify({ dom, cdpErrors, cdpNote }), err: pass ? '' : '存在页面错误态(重复加载/初始化失败/多卡片),见 evidence' };
  });

} catch (e) {
  console.log('❌ phase1 自身异常: ' + String((e && e.message) || e));
  results.push({ step: '__phase__', name: 'phase1 自身异常', status: 'fail', evidence: String((e && e.message) || e).slice(0, 300), flapped: 0 });
}

const summary = { pass: results.filter(x => x.status === 'pass').length, fail: results.filter(x => x.status === 'fail').length, skip: results.filter(x => x.status === 'skip').length, flapped: totalFlapped };
const reportFile = await R.writeReport('真机阶段1', {
  generatedAt: new Date().toISOString(), phase: PHASE,
  panel: R.PANEL_URL, logFile: R.getLogFile(), stateFile: path.join(path.resolve(HERE, '..'), 'artifacts', 'realdev-state.json'),
  summary, results,
});
console.log('\n========== 阶段1 汇总 ==========');
console.log(JSON.stringify(summary));
console.log('报告: ' + reportFile);
console.log('日志: ' + R.getLogFile());
if (process && typeof process.exitCode !== 'undefined') process.exitCode = summary.fail ? 1 : 0;
