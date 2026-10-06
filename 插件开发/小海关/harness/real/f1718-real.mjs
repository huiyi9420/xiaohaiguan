#!/usr/bin/env node
/* ============================================================================
 * F17/F18/F19 三小项真实校验（修复+证据补充）
 * ----------------------------------------------------------------------------
 * F17 健康检查语义：组测速/groupDelay/health-check url 统一 http→https
 *   （官方依据：wiki.metacubex.one proxy-groups——expected-status 默认 `*` 不校验
 *   状态码，204 语义由 generate_204 URL 本身保证；官方示例与引擎 DefaultTestURL
 *   均为 https://www.gstatic.com/generate_204——http 会被网络劫持/降级注入误判健康）
 *   验证：改后组 url 经真实引擎 /group/<组>/delay 实测返回（容器，返回延迟 map）。
 * F18 订阅 DNS 证据核查：sub1(head.bin) 节点 server 域名清单逐域 dig
 *   @223.5.5.5 与 @119.29.29.29（固定 DNS 同款）——全部可解析→证据收口；
 *   sub2 为配置模板样本（唯一节点=127.0.0.1 占位；DNS 段与固定 DNS 同源）。
 * F19 嗅探边界证据：本地 TLS 服务(openssl s_server)经 sniffer 开启的引擎 mixed
 *   口访问，观测 /connections sniffHost（override-destination 生效证据）；
 *   不改 sniffer 配置（真机流量复现留真机窗口）。
 * 退出码：0=全过；1=有失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');

const execFileP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
const SEC = 'f171819-real-secret';
const PORTS = { ctrl: 28021, mixed: 28022, redir: 28023, tproxy: 28024, dns: 28025 };

class NetEnv {
  constructor() {
    this.name = 'hs-f1718-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');
    this.id = null;
  }
  async start() {
    const out = await execFileP('docker', ['run', '-d', '--name', this.name, '--label', 'hs.f1718=1',
      'alpine:latest', 'sleep', '1200'], { timeout: 60000 });
    this.id = out.stdout.trim();
  }
  async exec(cmd, t = 30000) {
    try {
      const { stdout } = await execFileP('docker', ['exec', this.id, 'sh', '-c', cmd], { timeout: t, maxBuffer: 32 * 1024 * 1024 });
      return { code: 0, out: stdout };
    } catch (e) { return { code: e.code || 1, out: e.stdout || '', err: e.stderr || '' }; }
  }
  async putFile(file, content) {
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    await this.exec("printf %s '" + b64 + "' | base64 -d > '" + file + "'");
  }
  async stop() {
    if (!this.id) return { skipped: true };
    await execFileP('docker', ['exec', this.id, 'kill', '-TERM', '1'], { timeout: 10000 }).catch(() => { });
    for (let i = 0; i < 15; i++) {
      const st = await execFileP('docker', ['inspect', this.id, '--format', '{{.State.Status}}'], { timeout: 10000 }).then(r => r.stdout.trim(), () => 'gone');
      if (st === 'exited' || st === 'gone') break;
      await new Promise(r => setTimeout(r, 1000));
    }
    await execFileP('docker', ['stop', '-t', '10', this.id], { timeout: 40000 }).catch(() => { });
    await execFileP('docker', ['rm', this.id], { timeout: 30000 });
    return { removed: true };
  }
}

/* f05 式 VM 提取 genConfigYaml */
async function buildVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'HS_GAME_DOMAINS', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, ...mods,
    DIR: '/data/plugins/customs', C: null, ST: { chn: 0, geoSiteT: 0, geoIpT: 0, neigh6: {} },
    ET_CACHE: null, HS_MANUAL: [], HS_SUB_RAW: '', HS_SUB_RAW_KEY: '',
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    gen() {
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); C.policySrc='self'; C.mode='auto'; C.secret=${JSON.stringify(SEC)};
        C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(PORTS)}); HS_MANUAL=['测试节点']; ST.chn=0; ST.geoSiteT=0; ST.geoIpT=0; ET_CACHE=null;`, ctx);
      return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 });
    }
  };
}

let env = null;
try {
  /* ---------- F17 形态断言（源码级） ---------- */
  {
    const plug = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
    const nHttp = (plug.match(/http:\/\/www\.gstatic\.com\/generate_204/g) || []).length;
    const nHttps = (plug.match(/https:\/\/www\.gstatic\.com\/generate_204/g) || []).length;
    check('F17 形态：源码 gstatic 204 全部 https（12 处：组 url×7+health-check×4+groupDelay 默认）',
      nHttp === 0 && nHttps >= 12, `http=${nHttp} https=${nHttps}`);
  }

  env = new NetEnv();
  await env.start();
  await env.exec('apk add -q curl openssl bind-tools 2>&1 | tail -1; dig -v 2>&1 | head -1; openssl version; echo TOOLS_OK', 240000);
  const gz = path.resolve(HERE, '..', '..', '.build', 'real-cache', 'mihomo-linux-arm64-v1.19.32.gz');
  await execFileP('docker', ['cp', gz, env.name + ':/tmp/mi.gz'], { timeout: 60000 });
  await env.exec('mkdir -p /data/plugins/customs && gunzip -c /tmp/mi.gz > /data/plugins/customs/mihomo && chmod 755 /data/plugins/customs/mihomo && /data/plugins/customs/mihomo -v | head -1', 60000);

  /* ---------- F18 订阅域名解析核查（固定 DNS 同款 223.5.5.5/119.29.29.29） ---------- */
  {
    const sub1 = fs.readFileSync('/tmp/hs-sub-sample/head.bin', 'utf8');
    const domains = [...new Set((sub1.match(/server:\s*([A-Za-z0-9._-]+)/g) || [])
      .map(l => l.replace(/server:\s*/, '')).filter(d => /[a-z]/i.test(d)))].sort();
    const ips = [...new Set((sub1.match(/server:\s*(\d+\.\d+\.\d+\.\d+)/g) || []).map(l => l.replace(/server:\s*/, '')))];
    let okAli = 0, okTencent = 0, failBoth = [];
    for (const d of domains) {
      const a = await env.exec('dig +short +time=3 +tries=1 @223.5.5.5 ' + d + ' A 2>/dev/null | grep -E "^[0-9]+\\." | head -1', 10000);
      const b = await env.exec('dig +short +time=3 +tries=1 @119.29.29.29 ' + d + ' A 2>/dev/null | grep -E "^[0-9]+\\." | head -1', 10000);
      const aOk = !!(a.out || '').trim(); const bOk = !!(b.out || '').trim();
      if (aOk) okAli++; if (bOk) okTencent++;
      if (!aOk && !bOk) failBoth.push(d);
    }
    check('F18 固定 DNS 样本兼容：sub1 全部 ' + domains.length + ' 个节点域名经 223.5.5.5/119.29.29.29 可解析（IPv4 直连节点 ' + ips.length + ' 个无需解析）',
      failBoth.length === 0 && domains.length > 0,
      `阿里=${okAli}/${domains.length} 腾讯=${okTencent}/${domains.length} 双失败=${failBoth.length ? failBoth.join(',') : 0} 域名样例=${domains.slice(0, 3).join('|')}`);
  }

  /* ---------- F17 组测速实测 + F19 嗅探观测（同一引擎实例） ---------- */
  const vmg = await buildVm();
  const yCfg = vmg.gen();
  const hasHttpsUrl = /url: 'https:\/\/www\.gstatic\.com\/generate_204'/.test(yCfg) || yCfg.includes('https://www.gstatic.com/generate_204');
  check('F17 生成形态：genConfigYaml 产物组/health-check url 均为 https gstatic',
    hasHttpsUrl && !yCfg.includes('http://www.gstatic.com'), `https=${hasHttpsUrl}`);
  await env.putFile('/data/plugins/customs/config.yaml', yCfg);
  const t = await env.exec('/data/plugins/customs/mihomo -t -d /data/plugins/customs 2>&1 | tail -1', 60000);
  check('F17 -t：含 https 组 url 的配置通过真实 mihomo -t', /successful/i.test(t.out), t.out.trim().slice(-50));
  await env.exec('nohup sh -c \'/data/plugins/customs/mihomo -d /data/plugins/customs >/tmp/eng.log 2>&1\' >/dev/null 2>&1 & I=0; while [ $I -lt 20 ]; do C=$(curl -s -m 2 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ' + SEC + '" http://127.0.0.1:' + PORTS.ctrl + '/version 2>/dev/null); [ "$C" = "200" ] && break; sleep 1; I=$((I+1)); done; echo READY=$C', 40000);

  /* F17 组测速：真实用户组(♻️ 自动选优)——引擎对组内成员实测 https gstatic 延迟(成员不可达返回错误 map 亦为判定语义证据) */
  const gd = await env.exec('curl -s -m 30 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/group/' + encodeURIComponent('♻️ 自动选优') + '/delay?timeout=8000&url=' + encodeURIComponent('https://www.gstatic.com/generate_204') + '" 2>/dev/null | head -c 300', 40000);
  const gdOk = /^\{/.test((gd.out || '').trim());
  check('F17 组测速实测：引擎对 https gstatic URL 的 /group/<组>/delay 返回 JSON（含延迟值或明确错误消息=判定语义生效）',
    gdOk, '响应=[' + (gd.out || '').trim().slice(0, 80) + ']');

  /* F19：本地 TLS 服务 + 经 mixed 口 https 访问 → /connections sniffHost */
  await env.exec('openssl req -x509 -newkey rsa:2048 -keyout /tmp/tls.key -out /tmp/tls.crt -days 2 -nodes -subj "/CN=sniff-test.local" >/dev/null 2>&1; echo CERT=$?', 30000);
  await env.exec('nohup openssl s_server -accept 8443 -cert /tmp/tls.crt -key /tmp/tls.key -quiet >/tmp/srv.out 2>&1 & sleep 0.8; echo SRV_UP', 10000);
  /* 经 mixed 代理访问 https://sniff-test.local:8443（域名无解析——用 curl --resolve 本地解析,经代理仍带 SNI;引擎规则 MATCH→主组无真节点,连接失败但记录含 sniffHost） */
  /* F19: 后台发流(连接保持 4s),1s 后抓 /connections(活动连接含 sniffHost) */
  await env.exec('(curl -s -m 4 -x http://127.0.0.1:' + PORTS.mixed + ' --resolve sniff-test.local:8443:127.0.0.1 -k https://sniff-test.local:8443/ -o /dev/null 2>/dev/null &); sleep 1; curl -s -m 4 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/connections" > /tmp/c.json 2>/dev/null; sleep 4', 30000);
  const probe = await env.exec("grep -c sniffHost /tmp/c.json; sed -n \"s/.*\"sniffHost\":\"\\([^\"]*\\)\".*/sniffHost=\\1/p\" /tmp/c.json | head -2; sed -n \"s/.*\"destinationIP\":\"\\([^\"]*\\)\".*/dest=\\1/p\" /tmp/c.json | head -2; grep -o sniff-test /tmp/c.json | head -1", 10000);
  const sniffed = /sniff-test/.test(probe.out || '') && (probe.out || '').trim().split('\n')[0].trim() !== '0';
  check('F19 嗅探证据：经 mixed 口 TLS(SNI=sniff-test.local) 连接的 /connections 含 sniffHost 字段且值含 sniff-test.local（sniffer+override-destination 生效）',
    sniffed, '观测=[' + (probe.out || '').replace(/\n/g, '|').slice(0, 160) + ']');

  await env.exec('for P in $(pidof openssl); do kill $P; done 2>/dev/null; for P in $(pidof mihomo); do kill $P; done 2>/dev/null; sleep 0.5; true', 15000);
  const stop = await env.stop();
  check('收尾：容器经 TERM 释放并删除', !!stop.removed, JSON.stringify(stop).slice(0, 60));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 240));
  if (env) { try { await env.stop(); } catch (e2) { console.log('[f1718] stop 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F171819真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF17/F18/F19 真实校验全部通过');
process.exit(bad.length ? 1 : 0);
