#!/usr/bin/env node
/* ============================================================================
 * F04 防火墙国内直通序真实校验（红灯先行→修复→全绿）
 * ----------------------------------------------------------------------------
 * 缺陷：fw 层 HS_LAN/HS_UDP 的 hs_cn dst RETURN 提前放行国内段目标——用户强制
 *   清单中 CIDR 形态目标若属国内段，流量从不进引擎，引擎内 IP-CIDR 强制规则
 *   永不命中（强制失效）。域名形态强制经 fake-IP 不受影响（目标 198.18/15 不在
 *   hs_cn，天然落 REDIRECT 进引擎）。
 * 修复：FCIDRS（C.force cidr 形态，与 EXCIDRS 同校验）前置——
 *   TCP: -I HS_LAN 1 -d $NET -p tcp -j REDIRECT --to-ports $REDIR（序压 hs_cn 之上）
 *   UDP: TPROXY_MODE 判定后 -d $NET -p udp 直送（TPROXY/降级 MARK 同链尾形态），
 *        随后重排 198.18.0.0/15 源 RETURN 到顶（防引擎 fake-IP 源回流被 FC 抓回）。
 *
 * 夹具（真实 iptables）：自起 --cap-add=NET_ADMIN alpine 容器（RealEnv 非特权无
 *   NET_ADMIN，不可执行 iptables；本夹具不依赖 RealEnv），apk add iptables ipset；
 *   预置 chnroute.txt 含国内段 123.123.0.0/16，C.force=[{m:'cidr',v:'123.123.123.0/24'}]，
 *   VM(f05 式)提取 genFwSh 生成 fw.sh → 真实 apply → iptables -S 全文取证。
 *   R1 红灯：现行 HS_LAN 无强制 CIDR 直送规则（hs_cn RETURN 之上无 FC 条目）
 *   G1 绿灯：FC REDIRECT 存在、序先于 hs_cn RETURN、端口=接管端口
 *   G2 HS_UDP：FC 直送存在且 198.18 源 RETURN 序更先（回流保护在前）
 *   G3 无 CIDR 强制：HS_LAN/HS_UDP 均无 FC 条目（零变化）
 *   G4 ipset/规则序全存证（-S 全文含 hs_cn RETURN 在私网 RETURN 之前等既有不变量）
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
const REDIR = 27972, TPROXY_P = 27973, DNSP = 27974, CTRLP = 27971;

/* 自管容器（需 NET_ADMIN 才能 iptables；沿用资源所有权纪律：唯一名+label+TERM 清理） */
class NetEnv {
  constructor() {
    this.stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    this.name = 'hs-f04-net-' + this.stamp + '-' + crypto.randomBytes(4).toString('hex');
    this.id = null;
  }
  async start() {
    const exist = await execFileP('docker', ['inspect', this.name]).then(() => true, () => false);
    if (exist) throw new Error('容器名冲突: ' + this.name);
    const out = await execFileP('docker', ['run', '-d', '--cap-add=NET_ADMIN', '--name', this.name,
      '--label', 'hs.f04.net=1', 'alpine:latest', 'sleep', '900'], { timeout: 60000 });
    this.id = out.stdout.trim();
    await this.exec('apk add -q iptables ipset 2>&1 | tail -1; iptables --version; ipset --version | head -1', 180000);
  }
  async exec(cmd, t = 30000) {
    try {
      const { stdout } = await execFileP('docker', ['exec', this.id, 'sh', '-c', cmd], { timeout: t, maxBuffer: 16 * 1024 * 1024 });
      return { code: 0, out: stdout };
    } catch (e) { return { code: e.code || 1, out: e.stdout || '', err: e.stderr || '' }; }
  }
  async stop() {
    if (!this.id) return { skipped: true };
    await execFileP('docker', ['exec', this.id, 'kill', '-TERM', '1'], { timeout: 10000 }).catch(() => { });
    for (let i = 0; i < 15; i++) {
      const st = await execFileP('docker', ['inspect', this.id, '--format', '{{.State.Status}}'], { timeout: 10000 }).then(r => r.stdout.trim(), () => 'gone');
      if (st === 'exited' || st === 'gone') break;
      await new Promise(r => setTimeout(r, 1000));
    }
    /* 兑底: TERM 后 15s 未退则 docker stop(=TERM+宽限,容器仅剩 sleep 无取证进程) */
    await execFileP('docker', ['stop', '-t', '10', this.id], { timeout: 40000 }).catch(() => { });
    await execFileP('docker', ['rm', this.id], { timeout: 30000 });
    return { removed: true };
  }
}

/* f05 式 VM：提取 genFwSh */
async function buildGenVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genFwSh']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const ctx = vm.createContext({ console, TextEncoder, URL, btoa, atob, ...mods,
    C: null, ST: { chn: 10000 }, ET_CACHE: null, DIR: '/data/plugins/customs' });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    gen(force) {
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF));
        C.s1='all'; C.s2=false; C.cnBypass=true; C.logEnabled=false;
        C.ports=Object.assign({}, DEF.ports, {ctrl:${CTRLP}, mixed:27975, redir:${REDIR}, tproxy:${TPROXY_P}, dns:${DNSP}});
        C.force=${JSON.stringify(force)}; C.exclude=[]; C.devices=[]; C.lines=[]; ET_CACHE=null;`, ctx);
      return vm.runInContext('genFwSh()', ctx, { timeout: 10000 });
    }
  };
}

let env = null;
try {
  env = new NetEnv();
  await env.start();
  const vmg = await buildGenVm();
  const FC = '123.123.123.0/24', FC_NET6_ANCHOR = '123.123.0.0/16';
  await env.exec('mkdir -p /data/plugins/customs; printf "' + FC_NET6_ANCHOR + '\\n223.5.5.5/32\\n" > /data/plugins/customs/chnroute.txt; printf "240e::/20\\n" > /data/plugins/customs/chnroute6.txt; wc -l /data/plugins/customs/chnroute.txt');

  const applyAndDump = async (force) => {
    const sh = vmg.gen(force);
    const b64 = Buffer.from(sh, 'utf8').toString('base64');
    await env.exec("printf %s '" + b64 + "' | base64 -d > /data/plugins/customs/fw.sh; chmod 755 /data/plugins/customs/fw.sh; sh /data/plugins/customs/fw.sh apply 2>&1 | tail -3; echo '---LAN---'; iptables -t nat -S HS_LAN 2>/dev/null; echo '---UDP---'; iptables -t mangle -S HS_UDP 2>/dev/null", 60000);
    const lan = (await env.exec('iptables -t nat -S HS_LAN 2>/dev/null')).out;
    if (process.env.F04DBG) console.log('LAN_DUMP:\n' + lan.split('\n').slice(0, 14).join('\n'));
    const udp = (await env.exec('iptables -t mangle -S HS_UDP 2>/dev/null')).out;
    return { lan, udp };
  };
  const idxOf = (dump, re) => dump.split('\n').findIndex(l => re.test(l)); /* 首行 -S 链声明占 -1 基准，序号即行号 */

  /* R1/G1+G2: 有 CIDR 强制 */
  const d1 = await applyAndDump([{ m: 'cidr', v: FC }]);
  const lanFc = idxOf(d1.lan, new RegExp('-d ' + FC.replace(/\./g, '\\.') + ' '));
  const lanCn = idxOf(d1.lan, /-m set --match-set hs_cn dst -j RETURN/);
  const lanRedir = idxOf(d1.lan, new RegExp('^-A HS_LAN -p tcp -j REDIRECT --to-ports ' + REDIR + '$')); /* 链尾 catch-all(无 -d 前缀) */
  const udpFc = idxOf(d1.udp, new RegExp('-d ' + FC.replace(/\./g, '\\.') + ' '));
  const udp1818 = idxOf(d1.udp, /-s 198\.18\.0\.0\/15 -j RETURN/);
  const udpCn = idxOf(d1.udp, /-m set --match-set hs_cn dst -j RETURN/);
  check('G1 强制 CIDR 前置：HS_LAN 含 FC 直送(REDIRECT→接管端口 ' + REDIR + ')且序先于 hs_cn RETURN',
    lanFc > 0 && lanFc < lanCn && new RegExp('-d 123\\.123\\.123\\.0/24 -p tcp -j REDIRECT --to-ports ' + REDIR + '$').test(d1.lan.split('\n')[lanFc] || ''),
    `FC行序=${lanFc} hs_cn行序=${lanCn} 行内容=[${(d1.lan.split('\n')[lanFc] || '').trim().slice(0, 90)}]`);
  check('G2 HS_UDP：FC 直送存在、198.18 源 RETURN 序更先(回流保护)、hs_cn 在 FC 之后',
    udpFc > 0 && udp1818 > 0 && udp1818 < udpFc && udpFc < udpCn,
    `FC序=${udpFc} 198.18源序=${udp1818} hs_cn序=${udpCn} FC行=[${(d1.udp.split('\n')[udpFc] || '').trim().slice(0, 90)}]`);
  check('G4 既有不变量保持：hs_cn RETURN 序先于私网/EXCIDRS RETURN 与链尾 REDIRECT',
    lanCn > 0 && lanRedir > lanCn && idxOf(d1.lan, /-d 192\.168\.0\.0\/16 -j RETURN/) > lanCn,
    `hs_cn=${lanCn} 私网=${idxOf(d1.lan, /-d 192\.168\.0\.0\/16 -j RETURN/)} 链尾REDIRECT=${lanRedir}`);

  /* G3: 无 CIDR 强制零变化 */
  const d2 = await applyAndDump([]);
  const noFc = !d2.lan.includes(FC) && !d2.udp.includes(FC);
  const cnKept = /-m set --match-set hs_cn dst -j RETURN/.test(d2.lan) && idxOf(d2.lan, /-m set --match-set hs_cn dst -j RETURN/) > 0;
  check('G3 无 CIDR 强制：HS_LAN/HS_UDP 无 FC 条目（零变化），hs_cn 仍在',
    noFc && cnKept, `无FC=${noFc} hs_cn在=${cnKept}`);

  await env.exec('sh /data/plugins/customs/fw.sh clean >/dev/null 2>&1; true');
  const stop = await env.stop();
  check('收尾：NET_ADMIN 容器经 TERM 释放并删除', !!stop.removed, JSON.stringify(stop).slice(0, 80));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 240));
  if (env) { try { await env.stop(); } catch (e2) { console.log('[f04] 异常路径 stop 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F04直通序真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF04 防火墙直通序真实校验全部通过');
process.exit(bad.length ? 1 : 0);
