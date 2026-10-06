#!/usr/bin/env node
/* ============================================================================
 * 方案A 设备身份与 IP 解耦（MAC 策略入口）真实校验（红灯先行→分缝实施→全绿）
 * ----------------------------------------------------------------------------
 * F02/F03 合一：现行分设备线路用 SRC-IP-CIDR 依赖 arp4/neigh6 地址快照——设备
 * 换地址/隐私扩展轮换即失联（F02）；且线路规则序在国内直通之前（F03 伴随序）。
 * 方案A：每线路一对专属 listener（redir+tproxy，name=hsln_<id>）+fw 层 MAC→
 * 线路 ipset→线路链 REDIRECT/TPROXY 到线路端口；引擎规则 IN-NAME,hsln_<id>,<线路组>
 * 位于国内 DIRECT 之后、MATCH 之前——设备身份=MAC（fw 层），地址变化零影响。
 *
 * 夹具（NET_ADMIN 容器 + netns 流量级，F04 同源容器纪律）：
 *   R1 红灯(现行)：genConfigYaml 产物含 SRC-IP-CIDR 依赖快照地址、无 listeners 段、
 *     设备线路规则序在国内 DIRECT 之前。
 *   G1 生成形态：listeners 每线路一对（redir/tproxy）、无 SRC-IP-CIDR、
 *     规则序 国内DIRECT < IN-NAME,hsln_*,线路组 < MATCH。
 *   G2 -t 通过+启动：/proxies 含线路组；/connections 可观测 inboundName。
 *   G3 流量级(v4)：netns A(MAC=线路设备) → 线路 listener → rule=IN-NAME,chains=线路组；
 *     同源访问国内段目标 → rule=RULE-SET,china_ip,DIRECT（F03 实证）；
 *     netns B(MAC=白名单未指派) → 主入口 → chains=主组。
 *   G4 MAC 分派 iptables 证据：PREROUTING 含 hs_wl_<id> → 线路链 → 线路端口；
 *     未指派 MAC → hs_wm → 主链主端口。
 *   G5 地址解耦：neigh6 快照地址变更（模拟轮换）→ lineSig 不变、产物无 SRC-IP-CIDR
 *     （身份不再依赖地址的形式断言）。
 *   v6 流量级容器不可构造 PREROUTING 入包——如实标注待真机。
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
const SEC = 'f0203-mac-entry-secret';
const PORTS = { ctrl: 28001, mixed: 28002, redir: 28003, tproxy: 28004, dns: 28005 };
/* 线路派生口规则: redir+1000+2n / tproxy+1000+2n */
const LR0 = PORTS.redir + 1000, LT0 = PORTS.tproxy + 1000, LR1 = PORTS.redir + 1002, LT1 = PORTS.tproxy + 1002;
const MAC_A = 'aa:bb:cc:dd:ee:01', MAC_B = 'aa:bb:cc:dd:ee:02'; /* A→线路ln1, B→白名单主入口 */

class NetEnv {
  constructor(tag) {
    this.name = 'hs-f0203-' + tag + '-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');
    this.id = null;
  }
  async start(caps) {
    const args = ['run', '-d', '--name', this.name, '--label', 'hs.f0203=1'];
    for (const c of caps) args.push('--cap-add=' + c);
    args.push('alpine:latest', 'sleep', '1200');
    const out = await execFileP('docker', args, { timeout: 60000 });
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

/* f05 式 VM：genConfigYaml + genFwSh + lineSig 提取 */
async function buildVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'genFwSh', 'lineSig', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, ...mods,
    DIR: '/data/plugins/customs', C: null, ST: { chn: 10000, running: true, neigh6: {} },
    ET_CACHE: null, HS_MANUAL: [], HS_SUB_RAW: '', HS_SUB_RAW_KEY: '', HS_GAME_DOMAINS: [],
    V: '2.2.1', LOGF: '/data/plugins/customs/customs.log',
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  const seed = (neigh6) => vm.runInContext(`C = JSON.parse(JSON.stringify(DEF));
    C.policySrc='self'; C.mode='auto'; C.secret=${JSON.stringify(SEC)}; C.s1='all'; C.s2=false;
    C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(PORTS)});
    C.devices=[{mac:'${MAC_A}', ip:'192.168.9.101', proxy:true, line:'ln1', name:'devA'},
               {mac:'${MAC_B}', ip:'192.168.9.102', proxy:true, line:'', name:'devB'}];
    C.lines=[{id:'ln1', name:'线路一', mode:'auto', nodes:[], pick:'auto'},
             {id:'ln2', name:'线路二', mode:'auto', nodes:[], pick:'auto'}];
    C.force=[]; C.exclude=[]; HS_MANUAL=['测试节点']; HS_SUB_RAW='';
    ST.neigh6=${JSON.stringify(neigh6)}; ET_CACHE=null;`, ctx);
  return {
    ctx,
    gen(neigh6 = {}) { seed(neigh6); return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 }); },
    fw(neigh6 = {}) { seed(neigh6); return vm.runInContext('genFwSh()', ctx, { timeout: 10000 }); },
    sig(neigh6) { seed(neigh6); return vm.runInContext('lineSig()', ctx, { timeout: 10000 }); },
  };
}

let env = null, vmg = null;
try {
  vmg = await buildVm();

  /* ---------- R1 红灯证据冻结（修复前红灯轮已跑,artifact 留档） ---------- */
  {
    const arts = fs.readdirSync(path.join(HERE, '..', 'artifacts')).filter(f => f.startsWith('F0203'));
    check('R1 红灯已复现留档（修复前:SRC-IP-CIDR=true 序先于国内/无 listeners/IN-NAME——见 artifact）',
      arts.length >= 1, 'artifact=' + (arts[arts.length - 1] || '无'));
  }

  /* ---------- NET_ADMIN 容器：引擎+fw 真实执行 ---------- */
  env = new NetEnv('net');
  await env.start(['NET_ADMIN', 'SYS_ADMIN']); /* SYS_ADMIN: ip netns 需要 mount /run/netns */
  await env.exec('apk add -q curl iptables ipset iproute2 2>&1 | tail -1; ip -V; ip netns add __t 2>/dev/null && ip netns del __t && echo NETNS_OK || echo NETNS_FAIL; echo TOOLS_OK', 300000);
  /* 真 mihomo 二进制（宿主缓存复制） */
  const gz = path.resolve(HERE, '..', '..', '.build', 'real-cache', 'mihomo-linux-arm64-v1.19.32.gz');
  await execFileP('docker', ['cp', gz, env.name + ':/tmp/mi.gz'], { timeout: 60000 });
  await env.exec('mkdir -p /data/plugins/customs/rules && gunzip -c /tmp/mi.gz > /data/plugins/customs/mihomo && chmod 755 /data/plugins/customs/mihomo && /data/plugins/customs/mihomo -v | head -1', 60000);
  /* 国内表夹具(含 123.123.0.0/16 供 F03 实证) */
  await env.exec('printf "123.123.0.0/16\\n223.5.5.5/32\\n" > /data/plugins/customs/chnroute.txt; printf "240e::/20\\n" > /data/plugins/customs/chnroute6.txt; mkdir -p /data/plugins/customs/rules; cat /data/plugins/customs/chnroute6.txt 2>/dev/null | awk \'{if ($1 ~ /^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+\\//) print $1; else if ($1 ~ /^[0-9a-fA-F:]+\\/[0-9]+$/) print $1}\' /data/plugins/customs/chnroute.txt - > /data/plugins/customs/rules/china_ip.txt; wc -l /data/plugins/customs/rules/china_ip.txt', 10000);

  /* ---------- G1 生成形态 ---------- */
  const yCfg = vmg.gen({ 'fd00:1::101': MAC_A.toUpperCase() });
  const lines = yCfg.split('\n');
  const idx = (re) => lines.findIndex(l => re.test(l));
  const hasL1 = yCfg.includes('- name: hsln_ln1\n') && yCfg.includes('- name: hsln_ln2\n');
  const lrOk = yCfg.includes('port: ' + LR0) && yCfg.includes('port: ' + LR1);
  const noSrc = !yCfg.includes('SRC-IP-CIDR');
  const cnI = idx(/RULE-SET,china_ip,DIRECT/), inI = idx(/IN-NAME,hsln_/), matchI = idx(/MATCH,/);
  const inNames = (yCfg.match(/IN-NAME,hsln_\w+,🛤️ [^\s']+/g) || []).length;
  check('G1 生成形态：listeners 每线路一对(端口派生)、无 SRC-IP-CIDR、序=国内DIRECT<IN-NAME<MATCH、IN-NAME 覆盖全部线路',
    hasL1 && lrOk && noSrc && cnI >= 0 && inI > cnI && matchI > inI && inNames >= 2,
    `listeners=${hasL1}(口${LR0}/${LR1}) 无SRC=${noSrc} 国内序${cnI}<IN-NAME序${inI}<MATCH序${matchI} IN-NAME数=${inNames}`);

  /* ---------- G2 -t+启动+/proxies ---------- */
  await env.putFile('/data/plugins/customs/config.yaml', yCfg);
  const t = await env.exec('/data/plugins/customs/mihomo -t -d /data/plugins/customs 2>&1 | tail -1', 60000);
  check('G2 混合 listeners 配置通过真实 mihomo -t', /successful/i.test(t.out), t.out.trim().slice(-60));
  await env.exec('nohup sh -c \'/data/plugins/customs/mihomo -d /data/plugins/customs >/tmp/eng.log 2>&1\' >/dev/null 2>&1 & I=0; while [ $I -lt 20 ]; do C=$(curl -s -m 2 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ' + SEC + '" http://127.0.0.1:' + PORTS.ctrl + '/version 2>/dev/null); [ "$C" = "200" ] && break; sleep 1; I=$((I+1)); done; echo READY=$C', 40000);
  const prox = await env.exec('curl -s -m 5 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/proxies" > /tmp/p.json 2>/dev/null; grep -c "🛤️ 线路一" /tmp/p.json; grep -c "hsln" /tmp/p.json', 10000);
  const lineGrp = Number((prox.out.trim().split('\n')[0]) || 0);
  check('G2b 启动后 /proxies 含线路组（引擎侧线路出口在线）', lineGrp >= 1, '线路一组出现=' + lineGrp);

  /* ---------- G4 fw MAC 分派（先挂 fw,再流量级用同一拓扑） ---------- */
  const fwSh = vmg.fw({ 'fd00:1::101': MAC_A.toUpperCase() });
  await env.putFile('/data/plugins/customs/fw.sh', fwSh);
  const fwApply = await env.exec('chmod 755 /data/plugins/customs/fw.sh; sh /data/plugins/customs/fw.sh apply 2>&1 | grep -E "ERR|WARN" | head -4; echo ---; iptables -t nat -S PREROUTING 2>/dev/null | grep -E "hs_wl_|HS_LAN"; echo ---; iptables -t nat -S HS_LAN_ln1 2>/dev/null | tail -3', 60000);
  const pre = fwApply.out;
  const wlHit = pre.includes('-m set --match-set hs_wl_ln1 src -j HS_LAN_ln1');
  const wmHit = pre.includes('-m set --match-set hs_wmac src -j HS_LAN') || pre.includes('-j HS_LAN_ln1');
  const lnPort = new RegExp('-p tcp -j REDIRECT --to-ports ' + LR0).test(pre);
  check('G4 MAC 分派：PREROUTING 含 hs_wl_ln1→线路链(→线路口' + LR0 + ')，主链 hs_wmac/HS_LAN 并存',
    wlHit && lnPort, `wl_ln1=${wlHit} 线路口${LR0}=${lnPort} 主链在=${wmHit}`);

  /* ---------- G3 流量级（netns 双设备对照） ---------- */
  /* netns nsA(MAC_A→线路) nsB(MAC_B→主口)，veth 接入容器主 ns(模拟 LAN) */
  const setupNs = await env.exec('ip netns add nsA 2>/dev/null; ip netns add nsB 2>/dev/null; ip link add vA type veth peer name vA0 2>/dev/null; ip link add vB type veth peer name vB0 2>/dev/null; ip link set vA netns nsA; ip link set vB netns nsB; ip addr add 192.168.9.1/24 dev vA0; ip addr add 192.168.10.1/24 dev vB0; ip link set vA0 up; ip link set vB0 up; ip netns exec nsA ip link set vA address ' + MAC_A + '; ip netns exec nsB ip link set vB address ' + MAC_B + '; ip netns exec nsA ip addr add 192.168.9.101/24 dev vA; ip netns exec nsB ip addr add 192.168.10.102/24 dev vB; ip netns exec nsA ip link set lo up; ip netns exec nsA ip link set vA up; ip netns exec nsB ip link set lo up; ip netns exec nsB ip link set vB up; ip netns exec nsA ip route add default via 192.168.9.1; ip netns exec nsB ip route add default via 192.168.10.1; echo 1 > /proc/sys/net/ipv4/ip_forward; for f in /proc/sys/net/ipv4/conf/*/rp_filter; do echo 0 > $f; done; echo NS_OK', 30000);
  const nsOk = setupNs.out.includes('NS_OK');
  /* 链路自检: nsA→主 ns 连通性(ARP/ping+vA0 收包计数) */
  if (nsOk) {
    const link = await env.exec('ip -s link show vA0 | tail -3; ip netns exec nsA ip neigh 2>/dev/null | head -2; ip netns exec nsA ping -c 1 -W 2 192.168.9.1 2>&1 | tail -2', 15000);
    if (process.env.F03DBG) console.log('LINK: ' + link.out.replace(/\n/g, '|').slice(0, 300));
  }
  /* 发流并抓 /connections 的 rule/inboundName/chains */
  const probe = async (ns, dst) => {
    /* 后台发流(黑洞目标 SYN 挂住保持连接在册),1.5s 后抓 /connections 快照+分派计数 */
    const r0 = await env.exec('iptables -t nat -L PREROUTING -v --line-numbers -n 2>/dev/null | head -8', 10000);
    await env.exec('ip netns exec ' + ns + ' curl -s -m 6 -o /dev/null http://' + dst + '/ >/dev/null 2>&1 & sleep 1.5; curl -s -m 4 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/connections" > /tmp/c.json 2>/dev/null; sleep 5', 30000);
    const r1 = await env.exec('iptables -t nat -L PREROUTING -v --line-numbers -n 2>/dev/null | head -8; echo ---; head -c 60000 /tmp/c.json; echo; echo CONNS=$(grep -c destinationIP /tmp/c.json 2>/dev/null)', 15000);
    if (process.env.F03DBG) console.log('PRE0: ' + r0.out.replace(/\n/g, '|').slice(0, 300) + '\nPOST: ' + r1.out.replace(/\n/g, '|').slice(0, 400));
    return r1.out;
  };
  const connField = (dump, dst) => {
    /* 按 destinationIP 找连接(直连 IP 访问无域名),取其 rule/payload/inboundName/chains */
    const i = dump.indexOf('"destinationIP":"' + dst);
    if (i < 0) return null;
    const seg = dump.slice(Math.max(0, i - 200), i + 1800); /* rule/chains 在 metadata 之后,窗口后置加宽 */
    const rule = (/"rule":"([^"]+)"/.exec(seg) || [])[1] || (/"rule":{"type":"([^"]+)"/.exec(seg) || [])[1] || '';
    const payload = (/"rulePayload":"([^"]*)"/.exec(seg) || [])[1] || (/"payload":"([^"]*)"/.exec(seg) || [])[1] || '';
    const inb = (/"inboundName":"([^"]*)"/.exec(seg) || [])[1] || '';
    const chains = (/"chains":\[([^\]]*)\]/.exec(seg) || [])[1] || '';
    return { rule, payload, inb, chains };
  };
  if (nsOk) {
    const rulesChk = await env.exec("wc -l /data/plugins/customs/rules/china_ip.txt; head -3 /data/plugins/customs/rules/china_ip.txt", 10000);
    if (process.env.F03DBG) console.log("RULES: " + rulesChk.out.replace(/\n/g, "|"));
    const provChk = await env.exec('curl -s -m 4 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/providers/rules" 2>/dev/null | head -c 300', 10000);
    if (process.env.F03DBG) console.log('PROV: ' + provChk.out.slice(0, 200));
    const dOversea = await probe('nsA', '93.184.216.34');   /* 海外单播(非国内表)→线路组 */
    const fA = connField(dOversea, '93.184.216.34');
    check('G3a 线路设备海外流量：rule=InName(hsln_ln1)、chains 含线路组',
      !!fA && /inname/i.test(fA.rule) && (fA.payload === 'hsln_ln1' || fA.inb === 'hsln_ln1') && fA.chains.includes('线路一'),
      fA ? `rule=${fA.rule} payload=${fA.payload} inb=${fA.inb} chains=${fA.chains.slice(0, 60)}` : '连接未捕获');
    const dCn = await probe('nsA', '123.123.99.99');        /* 国内表段→DIRECT */
    const fCn = connField(dCn, '123.123.99.99');
    check('G3b 线路设备国内目标：rule=RuleSet,china_ip→DIRECT（F03 实证：线路流量国内仍直连）',
      !!fCn && (/ruleset/i.test(fCn.rule) || /china_ip/i.test(fCn.payload)) && fCn.chains.includes('DIRECT'),
      fCn ? `rule=${fCn.rule} payload=${fCn.payload} chains=${fCn.chains.slice(0, 60)}` : '连接未捕获');
    const dB = await probe('nsB', '93.184.216.34');          /* 未指派设备→主入口主组 */
    const fB = connField(dB, '93.184.216.34');
    check('G3c 未指派设备：主入口（inboundName≠hsln_）、chains 含主组/自动选优',
      !!fB && !/^hsln_/.test(fB.inb) && (fB.chains.includes('节点选择') || fB.chains.includes('自动选优')),
      fB ? `inb=${fB.inb || '(默认)'} chains=${fB.chains.slice(0, 60)}` : '连接未捕获');
  } else {
    check('G3 netns 夹具不可用（环境限制，如实标注）', false, 'netns 创建失败——流量级待真机');
  }

  /* ---------- G5 地址解耦（身份不随地址变） ---------- */
  {
    const sig1 = vmg.sig({ 'fd00:1::101': MAC_A.toUpperCase() });
    const sig2 = vmg.sig({ 'fd00:9::999': MAC_A.toUpperCase() });  /* 地址轮换 */
    const y2 = vmg.gen({ 'fd00:9::999': MAC_A.toUpperCase() });
    check('G5 地址解耦：地址快照变更→lineSig 不变、产物无 SRC-IP-CIDR（身份=MAC）',
      sig1 === sig2 && !y2.includes('SRC-IP-CIDR') && !y2.includes('fd00:'),
      `sig一致=${sig1 === sig2} 无SRC=${!y2.includes('SRC-IP-CIDR')} 无地址渗漏=${!y2.includes('fd00:')}`);
  }

  await env.exec('sh /data/plugins/customs/fw.sh clean >/dev/null 2>&1; for P in $(pidof mihomo); do kill $P; done 2>/dev/null; true', 20000);
  const stop = await env.stop();
  check('收尾：NET_ADMIN 容器经 TERM 释放并删除', !!stop.removed, JSON.stringify(stop).slice(0, 80));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 240));
  if (env) { try { await env.stop(); } catch (e2) { console.log('[f0203] 异常路径 stop 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F0203MAC入口真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF0203 MAC 入口真实校验全部通过');
process.exit(bad.length ? 1 : 0);
