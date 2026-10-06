#!/usr/bin/env node
/* ============================================================================
 * F01 真实隔离集成测试（用例 F01-R-001 ~ F01-R-008 + R-F01-07 混合入口转发）
 * ----------------------------------------------------------------------------
 * 运行：node real/f01-readiness.mjs   （或 npm run test:real --prefix harness）
 * 退出码：0=全部通过；1=存在 fail；2=无 fail 但存在 blocked（环境能力不足）。
 *
 * 事实源与断言均来自真实组件：
 *   - 真实 Mihomo v1.19.32（官方 arm64 资产，SHA-256 双侧核验）；
 *   - 生产固定路径 /data/plugins/customs/mihomo（仅容器内创建）；
 *   - 生产函数 src/状态采集.js 的 buildReadinessCommand/parseReadiness 原样驱动；
 *   - UI 用例经 run_shell 桥真实转发容器执行，桥不伪造任何业务成功。
 * ==========================================================================*/
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  RealEnv, ensureHostAsset, maskSecrets, deepRedact, buildRedactNeedles,
  MIHOMO_VERSION, MIHOMO_URL, MIHOMO_SHA256, MIHOMO_BIN, MIHOMO_DIR
} from './runner.mjs';

const execFileP = promisify(execFile);
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.resolve(HERE, '..', 'artifacts');

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const report = {
  stamp: new Date().toISOString(), suite: 'F01真实隔离集成',
  contract: '真实测试合同(纠正版) F01-R-001~008 + 原合同 R-F01-07 混合入口TCP转发',
  environment: {}, asset: {}, cases: [], cleanup: {}, findings: [], notes: []
};
const cases = report.cases;
function record(id, label, status, evidence) {
  cases.push({ id, label, status, evidence });
  const tag = { pass: '✅ PASS', fail: '❌ FAIL', blocked: '⛔ BLOCKED', info: '· INFO' }[status] || status;
  console.log(`${tag}  ${id} ${label}`);
}

/* ---------------- 主流程 ---------------- */
/* 必需用例清单：任何一条未执行都不能 pass（空套件/致命中断由 SUITE-COMPLETE 兕底判 fail）。
   摘要与退出码同一权威事实源 = cases；不存在并行计数。 */
const REQUIRED = ['F01-R-001', 'F01-R-002', 'F01-R-003', 'F01-R-004', 'F01-R-005', 'F01-R-006', 'R-F01-07', 'F01-R-007.A', 'F01-R-007.B', 'F01-R-008'];
let env = null;
let uiBrowser = null;        /* UI 资源提升到外层，异常路径 finally 也能等待 close */
let containersBefore = null; /* 清理前后对照基线（ID|名称|状态） */
try {
  /* 环境记录 */
  const gitHead = await execFileP('git', ['rev-parse', '--short', 'HEAD'], { cwd: path.resolve(HERE, '..', '..', '..') }).then(r => r.stdout.trim(), () => '?');
  const gitBranch = await execFileP('git', ['branch', '--show-current'], { cwd: path.resolve(HERE, '..', '..', '..') }).then(r => r.stdout.trim(), () => '?');
  const dockerVer = await execFileP('docker', ['version', '--format', 'client={{.Client.Version}} server={{.Server.Version}}']).then(r => r.stdout.trim(), () => '?');
  const containersBeforeList = (await execFileP('docker', ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.State}}'], { timeout: 20000 })).stdout.split('\n').filter(Boolean);
  containersBefore = containersBeforeList;
  report.environment = { node: process.version, docker: dockerVer, git: `${gitBranch}@${gitHead}`, os: `${process.platform}/${process.arch}` };
  console.log(`[f01] 环境：${report.environment.docker} · node ${process.version} · ${report.environment.git}`);

  /* 0. 资产 + 容器 */
  const asset = await ensureHostAsset(m => console.log('[f01] ' + m));
  report.asset = { url: MIHOMO_URL, version: MIHOMO_VERSION, expectedSha256: MIHOMO_SHA256, actualSha256: asset.sha256, bytes: asset.bytes, downloadedThisRun: asset.downloaded };

  env = new RealEnv({ stamp });
  await env.start();
  report.environment.container = { name: env.name, image: env.imageMeta.ref, security: env.containerMeta.security, busybox: env.busyboxLine, ports: env.ports };

  const { buildReadinessCommand, parseReadiness } = await import(new URL('../../src/状态采集.js', import.meta.url).href);
  const P = env.ports;
  const pidOf = async () => Number((await env.exec('pidof mihomo')).out.trim().split(/\s+/)[0] || 0);

  /* ---------- F01-R-001 真实组件前置 ---------- */
  let r001 = { status: 'pass' };
  try {
    const versionLine = await env.prepareBinary(asset.path);
    await env.installTools();
    report.environment.container.tools = { curl: env.curlLine, lighttpd: env.lighttpdLine };
    let phase = 'A(含 tproxy-port)';
    let run = await env.startMihomo({ withTproxy: true });
    let own = await env.ownershipOf(run.pid);
    let tproxyOk = own.tcp.includes(P.tproxy) && own.udp.includes(P.tproxy);
    let blockedTproxy = null;
    if (!tproxyOk) {
      const tail = await env.exec(`tail -n 8 ${MIHOMO_DIR}/mihomo.stderr 2>/dev/null`);
      blockedTproxy = `非特权容器内 tproxy TCP+UDP 监听未成立（阶段A实测）。stderr 尾部：${maskSecrets(tail.out, env.secrets).trim().slice(0, 300)}`;
      await env.stopMihomo();
      phase = 'B(去 tproxy-port 重启)';
      run = await env.startMihomo({ withTproxy: false });
      own = await env.ownershipOf(run.pid);
    }
    if (run.exe !== MIHOMO_BIN) throw new Error(`readlink 不等于生产路径：${run.exe}`);
    if (!versionLine.includes(MIHOMO_VERSION)) throw new Error('版本行不含 ' + MIHOMO_VERSION);
    const pid = await pidOf();
    if (pid !== run.pid) throw new Error(`pidof(${pid}) 与启动 pid(${run.pid}) 不一致`);
    env.mihomoPid = pid;
    env.tproxyBlocked = !!blockedTproxy;
    if (blockedTproxy) {
      report.findings.push({ kind: '环境限制', text: blockedTproxy });
      record('F01-R-001.tproxy', 'tproxy 监听能力实测（阶段A）', 'blocked', { detail: blockedTproxy });
    }
    record('F01-R-001', '真实 Mihomo 以生产固定路径运行且版本可证', 'pass', {
      versionLine, exe: run.exe, pid, phase,
      sha256InContainer: MIHOMO_SHA256, ownership: { tcp: own.tcp, udp: own.udp }
    });
  } catch (e) { r001 = { status: 'fail', error: e.message }; record('F01-R-001', '真实组件前置', 'fail', r001); throw e; }

  const pid = env.mihomoPid;

  /* ---------- F01-R-002 鉴权三分支 ---------- */
  try {
    const probe = async (hdr) => {
      const r = await env.exec(`curl -s -o /dev/null -w '%{http_code}' -m 3 ${hdr} http://127.0.0.1:${P.ctrl}/version; R=$?; printf ' RC=%s' "$R"`);
      return { raw: r.out.trim(), code: r.out.trim().split(' RC=')[0], rc: (r.out.match(/RC=(\d+)/) || [])[1] };
    };
    const noAuth = await probe('');
    const wrong = await probe(`-H 'Authorization: Bearer ${'X'.repeat(env.secret.length)}'`);
    const good = await probe(`-H 'Authorization: Bearer ${env.secret}'`);
    const ok = noAuth.code === '401' && wrong.code === '401' && good.code === '200' && good.rc === '0' && noAuth.rc === '0';
    record('F01-R-002', '控制接口鉴权：无凭据/错凭据 401，正确凭据 200', ok ? 'pass' : 'fail', {
      noAuth: { code: noAuth.code, curlRc: noAuth.rc }, wrongSecret: { code: wrong.code, curlRc: wrong.rc }, correct: { code: good.code, curlRc: good.rc }, pid
    });
  } catch (e) { record('F01-R-002', '鉴权三分支', 'fail', { error: e.message }); }

  /* ---------- F01-R-003 生产函数驱动的监听归属 ---------- */
  const readinessOf = async (portsOverride) => {
    const cmd = buildReadinessCommand(portsOverride, env.secret, pid);
    const r = await env.exec(cmd, 20000);
    return { code: r.code, out: r.out, parsed: (() => { try { return { ok: true, value: parseReadiness(r.out, portsOverride) } } catch (e) { return { ok: false, error: e.message } } })() };
  };
  try {
    const res = await readinessOf(P);
    const v = res.parsed.ok ? res.parsed.value : null;
    const own = await env.ownershipOf(pid);
    const expectAll = { ctrl: true, mixed: true, redir: true, dns: true, tproxy: env.tproxyBlocked ? null : true };
    const mismatch = [];
    for (const [k, want] of Object.entries(expectAll)) {
      if (want === null) continue;
      if (!v || v[k] !== want) mismatch.push(`${k}: 期望 ${want} 实得 ${v ? v[k] : '解析失败'}`);
    }
    const lines = own.snapshot.split('\n').filter(l => new RegExp(`:${P.ctrl} |:${P.mixed} |:${P.redir} |:${P.tproxy} |:${P.dns} `).test(l) && l.includes(`/${'mihomo'}`));
    record('F01-R-003', 'buildReadinessCommand/parseReadiness 真实监听归属判定', mismatch.length ? 'fail' : 'pass', {
      execCode: res.code, parsed: v || res.parsed.error, mismatch,
      netstatOwnerLines: lines, ownership: { tcp: own.tcp, udp: own.udp },
      tproxy: env.tproxyBlocked ? 'blocked(见 F01-R-001.tproxy)' : (v && v.tproxy)
    });
  } catch (e) { record('F01-R-003', '监听归属', 'fail', { error: e.message }); }

  /* ---------- F01-R-004 缺端口反例 ---------- */
  try {
    const free = { mixed: 39901, redir: 39902, tproxy: 39903, dns: 39904, ctrl: 39909 };
    await env.checkPortsFree(Object.values(free));
    const rows = [];
    let ok = true;
    for (const key of ['mixed', 'redir', 'dns'].concat(env.tproxyBlocked ? [] : ['tproxy'])) {
      const ports2 = { ...P, [key]: free[key] };
      const res = await readinessOf(ports2);
      const v = res.parsed.ok ? res.parsed.value : null;
      const pass = v && v.ctrl === true && v[key] === false;
      ok = ok && pass;
      rows.push({ key, port: free[key], ctrl: v && v.ctrl, [key]: v && v[key], pass });
    }
    const ctrlRes = await readinessOf({ ...P, ctrl: free.ctrl });
    const cv = ctrlRes.parsed.ok ? ctrlRes.parsed.value : null;
    const ctrlPass = cv && Object.values(cv).every(x => x === false);
    ok = ok && ctrlPass;
    record('F01-R-004', '缺端口反例：单项 false 且不连坐；ctrl 坏则全 false', ok ? 'pass' : 'fail', { rows, ctrlBroken: { port: free.ctrl, parsed: cv, pass: ctrlPass } });
  } catch (e) { record('F01-R-004', '缺端口反例', 'fail', { error: e.message }); }

  /* ---------- F01-R-005 错误进程占用 ---------- */
  try {
    const dt = await env.startDummy('tcp', P.dummyTcp);
    const du = await env.startDummy('udp', P.dummyUdp);
    const mihomoExe = (await env.exec(`readlink /proc/${pid}/exe`)).out.trim();
    const p1 = await readinessOf({ ...P, mixed: P.dummyTcp });
    const p2 = await readinessOf({ ...P, tproxy: P.dummyUdp });
    const v1 = p1.parsed.ok ? p1.parsed.value : null;
    const v2 = p2.parsed.ok ? p2.parsed.value : null;
    const ok = v1 && v1.mixed === false && v1.ctrl === true && v2 && v2.tproxy === false
      && dt.exe !== MIHOMO_BIN && du.exe !== MIHOMO_BIN;
    record('F01-R-005', '外来进程占用端口不计入就绪', ok ? 'pass' : 'fail', {
      dummyTcp: { pid: dt.pid, exe: dt.exe, port: P.dummyTcp, netstat: dt.netstatLine },
      dummyUdp: { pid: du.pid, exe: du.exe, port: P.dummyUdp, netstat: du.netstatLine },
      mihomo: { pid, exe: mihomoExe },
      mixedAsDummyTcp: v1, tproxyAsDummyUdp: v2
    });
    await env.stopDummy(dt.pid, 'dummyTcp');
    await env.stopDummy(du.pid, 'dummyUdp');
  } catch (e) { record('F01-R-005', '错误进程占用', 'fail', { error: e.message }); }

  /* ---------- F01-R-006 采集不完整 ---------- */
  try {
    await env.mustExec('mkdir -p /tmp/hsnoapp /tmp/hsnoapp2', 5000, '建故障注入目录');
    await env.mustExec(`for t in readlink awk curl; do ln -sf "$(command -v $t)" /tmp/hsnoapp/$t; done`, 5000, '链接6a工具');
    await env.mustExec(`for t in readlink awk netstat; do ln -sf "$(command -v $t)" /tmp/hsnoapp2/$t; done`, 5000, '链接6b工具');
    /* 6a: netstat 缺失（PATH 纯替换，不给回退路径）→ 采集命令本身失败（对应插件 run() 失败 → collectStatus 抛 “引擎监听状态采集失败”，插件.js:308） */
    const a = await env.exec('PATH=/tmp/hsnoapp; ' + buildReadinessCommand(P, env.secret, pid), 20000);
    /* 6b: curl 缺失 → 命令退出 0 但 HTTP/EXIT 不可用 → parseReadiness 抛 “监听状态采集不完整” */
    const b = await env.exec('PATH=/tmp/hsnoapp2; ' + buildReadinessCommand(P, env.secret, pid), 20000);
    let bThrow = null;
    try { parseReadiness(b.out, P); } catch (e) { bThrow = e.message; }
    const garbageThrow = (() => { try { parseReadiness('not-a-collection-output', P); return null } catch (e) { return e.message } })();
    const ok = a.code !== 0 && b.code === 0 && bThrow === '监听状态采集不完整' && garbageThrow === '监听状态采集不完整';
    record('F01-R-006', '采集不完整：netstat 缺失→命令失败；curl 缺失/垃圾输出→解析抛错', ok ? 'pass' : 'fail', {
      netstatMissing: { execCode: a.code, mapsTo: 'collectStatus 抛 “引擎监听状态采集失败”(run 层失败)' },
      curlMissing: { execCode: b.code, socketsEchoed: b.out.includes('=SOCKETS=1'), parseThrew: bThrow },
      garbageInput: { parseThrew: garbageThrow }
    });
  } catch (e) { env.bridgePathPrefix = ''; record('F01-R-006', '采集不完整', 'fail', { error: e.message }); }

  /* ---------- R-F01-07 混合入口 → 本地真实 HTTP 目标 TCP 转发 ---------- */
  try {
    const httpd = await env.startHttpTarget(P.httpd);
    const cmd = [
      'rm -f /tmp/hsprox.out /tmp/hsprox.code /tmp/hsprox.rc',
      /* 客户端A：全速成功取证（CODE/RC/精确字节与行数核对） */
      `(curl -s -m 15 -x http://127.0.0.1:${P.mixed} -o /tmp/hsprox.out -w '%{http_code}' http://127.0.0.1:${P.httpd}/ping.txt > /tmp/hsprox.code 2>/dev/null; echo $? > /tmp/hsprox.rc) & sleep 0.5`,
      /* 客户端B：CONNECT 型(-p)；~1.4MB 响应大于双级缓冲，消费者 sleep 4 → 客户端阻塞保连接供 /connections 采样 */
      `(curl -s -p -m 9 -x http://127.0.0.1:${P.mixed} http://127.0.0.1:${P.httpd}/ping.txt | { sleep 4; cat > /dev/null; }) & sleep 1.5`,
      `curl -s -m 3 -H 'Authorization: Bearer ${env.secret}' http://127.0.0.1:${P.ctrl}/connections > /tmp/hsconns.json`,
      'sleep 6',
      `echo "CODE=$(cat /tmp/hsprox.code)"; echo "RC=$(cat /tmp/hsprox.rc)"; echo "BYTES=$(wc -c < /tmp/hsprox.out)"; echo "MARKLINES=$(grep -c '${env.httpMarker}' /tmp/hsprox.out)"; echo "HITS=$(grep -c ' /ping.txt ' /tmp/hs-www/access.log)"`
    ].join('; ');
    const r = await env.exec(cmd, 45000);
    const connsRaw = (await env.exec('cat /tmp/hsconns.json')).out;
    const conns = JSON.parse(connsRaw || '{}');
    const entry = (conns.connections || []).find(c =>
      c.metadata && String(c.metadata.destinationPort) === String(P.httpd)
      && c.metadata.network === 'tcp' && (c.chains || []).includes('DIRECT'));
    const code = (r.out.match(/CODE=(\d+)/) || [])[1];
    const rc = (r.out.match(/RC=(\d+)/) || [])[1];
    const bytes = Number((r.out.match(/BYTES=(\d+)/) || [])[1]);
    const mark = Number((r.out.match(/MARKLINES=(\d+)/) || [])[1]);
    const hits = Number((r.out.match(/HITS=(\d+)/) || [])[1]);
    /* 精确核验：字节与标记行数必须与目标文件完全一致，不允许“差不多” */
    const bytesExact = bytes === httpd.bytes;
    const linesExact = mark === httpd.lines;
    const targetServed = hits >= 2; /* 自检 ≥1 次 + 经代理 ≥1 次（access.log 目标侧计数） */
    const ok = code === '200' && rc === '0' && bytesExact && linesExact && targetServed && !!entry;
    record('R-F01-07', 'mixed 混合入口经 DIRECT 规则转发本地真实 HTTP 目标（仅证明 mixed TCP）', ok ? 'pass' : 'fail', {
      rawOut: maskSecrets(r.out, env.secrets).slice(0, 400), execCode: r.code,
      curlThroughProxy: { httpCode: code, curlRc: rc, bytesReceived: bytes, bytesExpected: httpd.bytes, markerLines: mark, markerLinesExpected: httpd.lines },
      targetRequestCount: hits,
      target: { port: P.httpd, pid: httpd.pid, server: httpd.server, bytes: httpd.bytes, lines: httpd.lines, selfCheckRequestsLogged: httpd.selfCheckRequestsLogged },
      mihomoConnection: entry ? { network: entry.metadata.network, type: entry.metadata.type, destinationIP: entry.metadata.destinationIP, destinationPort: entry.metadata.destinationPort, chains: entry.chains, rule: entry.rule } : null,
      scope: '该结果只证明 mixed 端口 TCP 代理路径，不证明透明代理/tproxy/游戏 UDP'
    });
    report.findings.push({ kind: '内核行为观测(本环境，未定位机制)', text: '观测口径：本隔离环境中，经 mixed 端口的普通 HTTP(非CONNECT)代理流在活动传输期间未出现在 /connections 列表；CONNECT 型流可见（type:HTTPS, inboundName:DEFAULT-MIXED, chains:[DIRECT]）。未定位其机制原因，不据此断言核心必然不跟踪此类流；对本测试的影响是连接证据改用 CONNECT 客户端采样。对产品 hasUdpDownload() 等依赖 /connections 的判断，此差异是否构成问题需另行核实（UDP/tproxy/socks 流不在本观测范围）。' });
  } catch (e) { record('R-F01-07', '混合入口转发', 'fail', { error: e.message }); }

  /* ---------- F01-R-007 页面错误展示（真实桥，无业务罐头） ---------- */
  try {
    /* 刷新构建产物（--check 只写 .build，不触上架目录） */
    const build = await execFileP('sh', ['构建发行版.sh', '--check'], { cwd: path.resolve(HERE, '..', '..'), timeout: 300000 });
    const pluginJs = await fsp.readFile(path.resolve(HERE, '..', '..', '.build', '插件.js'), 'utf8');
    const fixtureHtml = await fsp.readFile(path.resolve(HERE, 'panel-fixture.html'), 'utf8');
    /* 插件读到的 config.json：secret 故意与引擎不一致 → readiness 全 false（真实 401） */
    await env.writePluginConfigJson({
      ver: MIHOMO_VERSION, secret: 'wrongsecret000000'.slice(0, env.secret.length), policySrc: 'self',
      ports: { mixed: P.mixed, redir: P.redir, tproxy: P.tproxy, dns: P.dns, ctrl: P.ctrl },
      cardMode: 'full', _cardOpen: true, s1: 'off', s2: false, logEnabled: false,
      subs: [], activeSub: -1, devices: [], lines: [], exclude: [], force: []
    });
    const bridge = await env.startBridge({ fixtureHtml, pluginJs });
    const { EXE } = require('../util.js');
    const { chromium } = await import('playwright-core');
    uiBrowser = await chromium.launch({ executablePath: EXE, headless: true });
    const browser = uiBrowser;
    const base = `http://127.0.0.1:${bridge.port}/?t=${encodeURIComponent(bridge.token)}`;
    const forbidden = ['端口就绪', '已挂载成功', '规则已挂载', '启动成功'];
    /* 合同硬断言口径：readiness 失败时页面必须显示可读错误（失败/异常/错误/未就绪类文案）；
       console.error 仅作观测记录，不作为门槛（避免阻碍正确的 UI 修复） */
    const visibleErrorOf = st => st.toasts.some(t => /失败|异常|错误|未就绪/.test(t)) || /失败|异常|错误|未就绪/.test(st.cardText);

    /* 场景A：引擎在跑但 401 → readiness 全 false（不得显示就绪/挂载成功） */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const cons = [];
      let gotInitErr = false;
      page.on('console', m => { if (m.text().includes('init 异常')) gotInitErr = true; cons.push({ type: m.type(), text: maskSecrets(m.text(), env.secrets) }); });
      page.on('pageerror', e => cons.push({ type: 'pageerror', text: maskSecrets(String(e), env.secrets) }));
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => {
        const c = document.getElementById('hs_card');
        return c && c.innerHTML.trim() !== '';
      }, { timeout: 25000 }).catch(() => { });
      const t0 = Date.now();
      while (Date.now() - t0 < 20000 && !gotInitErr) await page.waitForTimeout(400);
      await page.waitForTimeout(2500);
      const state = await page.evaluate(() => ({
        cardText: (document.getElementById('hs_card') || {}).innerText || '',
        cardHasContent: !!((document.getElementById('hs_card') || {}).innerHTML || '').trim(),
        toasts: (window.__hsToasts || []).slice(),
        bodyText: document.body.innerText.slice(0, 3000)
      }));
      const shotA = path.join(ARTIFACTS, `F01-R-007-A-${stamp}.png`);
      fs.mkdirSync(ARTIFACTS, { recursive: true });
      await page.screenshot({ path: shotA, fullPage: true }).catch(() => { });
      const readinessViaBridge = env.bridgeLog.some(l => l.cmd.includes('netstat -lntup') && l.cmd.includes('/version'));
      /* 只匹配真实防火墙执行/写入：执行 fw.sh、iptables 追加/插入；upgradeAudit 的只读 grep 不算 */
      const fwWritten = env.bridgeLog.filter(l => /sh\s+[^;]*fw\.sh|fw\.sh['\"]?\s+(apply|clean|status)\b|iptables\s[^;]*\s-[AI]\s/.test(l.cmd));
      const bad = forbidden.filter(f => (state.cardText + state.bodyText + state.toasts.join('|')).includes(f));
      const visibleError = visibleErrorOf(state);
      /* 合同硬断言：无假成功 + 卡片渲染 + 可读错误 + 命令来自真实桥 + 无防火墙写入 */
      const ok = state.cardHasContent && visibleError && bad.length === 0 && readinessViaBridge && fwWritten.length === 0;
      const failureKind = !readinessViaBridge ? '测试基础设施（未证实经真实桥执行）'
        : (!state.cardHasContent ? '产品缺陷（卡片未渲染）'
          : (!visibleError ? '产品缺陷（合同要求 readiness 失败显示可读错误；未改生产，待root授权修复）'
            : (fwWritten.length ? '产品缺陷（执行防火墙）' : '其他')));
      record('F01-R-007.A', '401 失败态：卡片渲染、可读错误、无假成功、无防火墙写入、命令来自真实桥', ok ? 'pass' : 'fail', {
        cardHasContent: state.cardHasContent, visibleErrorShown: visibleError, failureKind: ok ? null : failureKind,
        contractRequirement: '合同 R-F01-07：readiness 失败时页面显示可读错误，不得显示端口就绪/已挂载成功',
        statusLine: state.cardText.split('\n').slice(0, 3).join(' | '),
        forbiddenFound: bad, toasts: state.toasts.slice(0, 10),
        readinessRanThroughRealBridge: readinessViaBridge, fwWriteCommands: fwWritten.map(l => l.cmd.slice(0, 120)),
        screenshot: shotA, consoleErrors: cons.filter(c => c.type === 'error').slice(0, 5)
      });
      report.notes.push(`场景A实际卡片文本：「${state.cardText.split('\n').slice(0, 3).join(' | ')}」——引擎进程在跑但全部端口未就绪(真实401)。`);
      await ctx.close();
    }

    /* 场景B：netstat 真实不可用 → collectStatus 抛错 → init 仅 console.error */
    {
      env.bridgePathPrefix = '/tmp/hsbroken:';
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const cons = [];
      let gotInitErr = false;
      page.on('console', m => { if (m.text().includes('init 异常')) gotInitErr = true; cons.push({ type: m.type(), text: maskSecrets(m.text(), env.secrets) }); });
      page.on('pageerror', e => cons.push({ type: 'pageerror', text: maskSecrets(String(e), env.secrets) }));
      await page.goto(base, { waitUntil: 'load', timeout: 30000 });
      const t0 = Date.now();
      while (Date.now() - t0 < 25000 && !gotInitErr) await page.waitForTimeout(400);
      await page.waitForTimeout(1500);
      env.bridgePathPrefix = '';
      const state = await page.evaluate(() => ({
        cardText: (document.getElementById('hs_card') || {}).innerText || '',
        cardHasContent: !!((document.getElementById('hs_card') || {}).innerHTML || '').trim(),
        toasts: (window.__hsToasts || []).slice(), bodyText: document.body.innerText.slice(0, 2000)
      }));
      const shotB = path.join(ARTIFACTS, `F01-R-007-B-${stamp}.png`);
      await page.screenshot({ path: shotB, fullPage: true }).catch(() => { });
      const initErr = cons.find(c => c.text.includes('init 异常'));
      const visibleError = visibleErrorOf(state);
      const bad = forbidden.filter(f => (state.cardText + state.bodyText + state.toasts.join('|')).includes(f));
      /* 合同硬断言：采集失败时页面必须渲染卡片且显示可读错误、无假成功；
         console.error 仅观测（当前实现走该路径），不作为门槛 */
      const hardOk = state.cardHasContent && visibleError && bad.length === 0;
      const failureKind = hardOk ? null : '产品缺陷（合同要求“采集失败显示可读错误”未满足；当前 init catch 仅 console.error，插件.js:4754；未改生产，待root授权修复）';
      record('F01-R-007.B', '采集失败态：卡片渲染且显示可读错误、无假成功', hardOk ? 'pass' : 'fail', {
        forbiddenFound: bad, cardHasContent: state.cardHasContent, visibleErrorShown: visibleError, failureKind,
        contractRequirement: '合同 R-F01-06/07：采集失败 → parseReadiness 抛错/collectStatus 抛错，页面显示可读错误且不显示就绪',
        initConsoleError: initErr ? initErr.text.slice(0, 200) : null, /* 观测：当前实现的真实路径 */
        toasts: state.toasts.slice(0, 10), screenshot: shotB
      });
      await ctx.close();
    }
    await browser.close();
    await env.stopBridge();
  } catch (e) {
    record('F01-R-007', '页面错误展示', 'fail', { error: e.message, failureKind: '测试脚本/环境' });
    report.findings.push({ kind: '测试脚本/环境', text: 'F01-R-007 未完成：' + e.message });
  }

} catch (fatal) {
  /* 任何致命中断（下载/校验/Docker/浏览器等前置或运行期异常）都必须有机器记录且反映到退出码 */
  record('SUITE-FATAL', '致命中断（基础设施/前置，套件未完整执行）', 'fail', {
    error: maskSecrets(String((fatal && fatal.message) || fatal), env ? env.secrets : [])
  });
  console.error('[f01] 致命错误：', fatal && fatal.message);
} finally {
  /* UI 资源兕底：异常路径也等待 close（不遗漏 browser/context/页面进程） */
  try { await uiBrowser?.close(); } catch (e) { }

  /* ---------- F01-R-008 清理 ---------- */
  if (env) {
    const evidence = await env.destroy();
    let containersAfter = null, listQueryOk = true;
    try {
      containersAfter = (await execFileP('docker', ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.State}}'], { timeout: 20000 })).stdout.split('\n').filter(Boolean);
    } catch (e) { listQueryOk = false; }
    const ownGone = listQueryOk && !containersAfter.some(l => l.split('|')[1] === env.name);
    /* 外部容器对照：只记录差异事实，不宣称“无影响”证明；本测试仅按唯一名+容器ID+label 操作 */
    const namesBefore = new Map((containersBefore || []).map(l => [l.split('|')[1], l]));
    const foreignDiff = [];
    if (listQueryOk) {
      for (const [name, was] of namesBefore) {
        if (name === env.name) continue;
        const now = containersAfter.find(l => l.split('|')[1] === name);
        if (!now) foreignDiff.push({ name, change: '已不存在（外部并发变化或非本测试因素；本测试未按名/ID触碰）' });
        else if (now !== was) foreignDiff.push({ name, change: '状态变化（外部并发变化；本测试未按名/ID触碰）' });
      }
    }
    report.cleanup = {
      mihomo: evidence.mihomo, dummies: evidence.dummies, httpd: evidence.httpd, bridge: evidence.bridge,
      container: evidence.container, blockedReasons: evidence.blockedReasons, errors: evidence.errors,
      containersBefore, containersAfter, listQueryOk, ownContainerGone: ownGone, foreignDiff
    };
    const cleanupOk = listQueryOk && ownGone
      && (!evidence.mihomo || (!evidence.mihomo.stillRunning && (evidence.mihomo.portsStillListening || []).length === 0))
      && evidence.dummies.every(d => d.state === 'gone')
      && (!evidence.httpd || (evidence.httpd.portFreed && evidence.httpd.processGone))
      && (!evidence.container || evidence.container.removed)
      && !evidence.errors.length && !(evidence.blockedReasons || []).length;
    const status = cleanupOk ? 'pass' : ((evidence.blockedReasons || []).length ? 'blocked' : 'fail');
    record('F01-R-008', 'TERM 清理 + 端口释放复查 + 仅本测试资源（所有权核验）', status, {
      mihomo: evidence.mihomo, dummyStates: evidence.dummies.map(d => ({ kind: d.kind, state: d.state })),
      httpdTarget: evidence.httpd, bridgeStranded: evidence.bridge, container: evidence.container,
      blockedReasons: evidence.blockedReasons, errors: evidence.errors,
      listQueryOk, ownContainerGone: ownGone, foreignDiff,
      signalPolicy: '仅 SIGTERM + 有界等待；未如期退出报 blocked 保留证据；无 kill -9，不用 docker stop（避免超时隐式强杀）'
    });
  }

  /* 必需用例齐全性：空套件/遗漏/致命中断都不能 pass */
  const executed = new Set(cases.map(c => c.id));
  const missing = REQUIRED.filter(id => !executed.has(id));
  if (missing.length) record('SUITE-COMPLETE', '必需用例齐全性', 'fail', { missing, executed: [...executed] });

  /* 报告持久化前递归脱敏（原文/base64/URI 编码形式一并替换）；检测只记数量不记内容 */
  const needles = env ? buildRedactNeedles(env.secrets) : [];
  const rawJson = JSON.stringify(report);
  const leakedNeedles = needles.filter(nd => rawJson.includes(nd.raw) || (nd.b64 && rawJson.includes(nd.b64)) || (nd.uri && rawJson.includes(nd.uri)));
  if (leakedNeedles.length) record('REPORT-SECRET-SCAN', '报告脱敏（检测到原始密钥/编码形式，已递归替换）', 'fail', { leakedNeedleCount: leakedNeedles.length });
  else record('REPORT-SECRET-SCAN', '报告脱敏', 'pass', { needlesChecked: needles.length });

  /* 摘要与退出码同一权威事实源：cases（record 后重算） */
  const pass = cases.filter(c => c.status === 'pass').length;
  const fail = cases.filter(c => c.status === 'fail').length;
  const blocked = cases.filter(c => c.status === 'blocked').length;
  report.summary = { pass, fail, blocked, verdict: fail ? 'fail' : (blocked ? 'blocked' : 'pass') };
  report.conclusions = {
    infrastructureDefectsFixed: ['断言强度(007.A/B 可读错误为硬断言)', '致命中断/SUITE-COMPLETE 反映到退出码', '报告递归脱敏+写前防线', '容器所有权(随机名+ID+label)与重名不触碰', '仅 SIGTERM 清理(无 docker stop 隐式强杀)', '桥命令生存期跟踪', '外部容器对照事实化', 'lighttpd 标准目标+精确字节核验', 'apk/前置检查真实退出码+有界超时'],
    productFailRemaining: cases.filter(c => c.status === 'fail' && String(c.evidence && c.evidence.failureKind || '').startsWith('产品')).map(c => ({ id: c.id, kind: c.evidence.failureKind }))
  };
  const sanitized = deepRedact(report, needles);
  const finalJson = JSON.stringify(sanitized, null, 2);
  /* 写前防线：脱敏后产物不得再含任何密钥形式 */
  const stillLeaking = needles.filter(nd => finalJson.includes(nd.raw) || (nd.b64 && finalJson.includes(nd.b64)) || (nd.uri && finalJson.includes(nd.uri)));
  if (stillLeaking.length) {
    console.error(`[f01] 报告脱敏后仍检测到 ${stillLeaking.length} 个密钥形式，拒绝落盘（计数仅此一处，不打印内容）`);
    process.exitCode = 1;
  } else {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const outFile = path.join(ARTIFACTS, `F01真实集成报告-${stamp}.json`);
    await fsp.writeFile(outFile, finalJson, 'utf8');
    console.log('\n[f01] 汇总：pass=' + pass + ' fail=' + fail + ' blocked=' + blocked);
    if (fail) console.log('[f01] 失败用例：' + cases.filter(c => c.status === 'fail').map(c => c.id + (c.evidence && c.evidence.failureKind ? '(' + c.evidence.failureKind.split('（')[0] + ')' : '')).join(', '));
    console.log('[f01] 机器可读报告：' + outFile);
    process.exitCode = fail ? 1 : (blocked ? 2 : 0);
  }
}
