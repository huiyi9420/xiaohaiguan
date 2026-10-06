#!/usr/bin/env node
/* 方案A 补充核验（独立测试角色）：
 *   E1 空线路：无 listeners 段、无 IN-NAME、fw 无 hs_wl_/HS_LAN_<id>（主入口同构）
 *   E2 全接管(s1=all)+线路：all-mode 主链与线路链并存
 *   E3 s2 本机代理：HS_OUT 链仍在（s2 路径不回归）
 *   E4 fw_clean 对称：apply 后 clean → hs_wl_x ipset 销毁、HS_LAN_x/HS_UDP_x 链删除、PREROUTING 无 -j HS_ 残留
 *   E5 孤儿(改名/删线)：通用清扫摘跳转、但旧链/旧 ipset 是否残留（记录实际行为）
 * 退出码：0=全过；1=有失败。E5 为观察项不参与退出码判定。
 */
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
const SEC = 'f0203b-edge-secret';
const PORTS = { ctrl: 28001, mixed: 28002, redir: 28003, tproxy: 28004, dns: 28005 };
const MAC_A = 'aa:bb:cc:dd:ee:01';

class NetEnv {
  constructor(tag) {
    this.name = 'hs-f0203b-' + tag + '-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');
    this.id = null;
  }
  async start(caps) {
    const args = ['run', '-d', '--name', this.name, '--label', 'hs.f0203b=1'];
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

async function buildVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'genFwSh', 'lineSig', 'sanitizeConf', 'genSecret', 'yamlEsc']);
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
  const seed = (patch) => vm.runInContext(`C = JSON.parse(JSON.stringify(DEF));
    C.policySrc='self'; C.mode='auto'; C.secret=${JSON.stringify(SEC)}; C.s1='all'; C.s2=false;
    C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(PORTS)});
    C.devices=[{mac:'${MAC_A}', ip:'192.168.9.101', proxy:true, line:'ln1', name:'devA'}];
    C.lines=[{id:'ln1', name:'线路一', mode:'auto', nodes:[], pick:'auto'},
             {id:'ln2', name:'线路二', mode:'auto', nodes:[], pick:'auto'}];
    C.force=[]; C.exclude=[]; HS_MANUAL=['测试节点']; HS_SUB_RAW='';
    ST.neigh6={}; ET_CACHE=null; ${patch || ''}`, ctx);
  return {
    ctx,
    gen(patch) { seed(patch); return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 }); },
    fw(patch) { seed(patch); return vm.runInContext('genFwSh()', ctx, { timeout: 10000 }); },
  };
}

let env = null;
try {
  const vmg = await buildVm();

  /* ---- E1 空线路 ---- */
  {
    const y = vmg.gen("C.lines=[]; C.devices=[];");
    const fw = vmg.fw("C.lines=[]; C.devices=[];");
    /* 孤儿清理段含字面 hs_wl_(枚举用),空线路断言改为「无创建/挂载/添加命令」而非字符串缺席 */
    const noFwLine = !fw.includes('ipset create hs_wl_') && !fw.includes('-m set --match-set hs_wl_') && !fw.includes('ipset add hs_wl_') && !fw.includes('HS_LAN_ln');
    check('E1 空线路：无 listeners 段、无 IN-NAME、fw 无线路链/集合创建（主入口同构，孤儿清理枚举段除外）',
      !y.includes('listeners:') && !y.includes('IN-NAME') && noFwLine && fw.includes('HS_LAN') && y.includes('MATCH,'),
      `无listeners=${!y.includes('listeners:')} 无IN-NAME=${!y.includes('IN-NAME')} 无hs_wl=${!fw.includes('hs_wl_')} 主链在=${fw.includes('HS_LAN')} MATCH在=${y.includes('MATCH,')}`);
  }

  /* ---- E2 全接管 + 线路并存 ---- */
  {
    const y = vmg.gen("C.s1='all';");
    const fw = vmg.fw("C.s1='all';");
    check('E2 全接管+线路：listeners 在、all-mode 主链(-j HS_LAN)与线路链(hs_wl_ln1)并存',
      y.includes('listeners:') && y.includes('IN-NAME,hsln_ln1,') && fw.includes('-j HS_LAN') && fw.includes('hs_wl_ln1') && fw.includes('HS_LAN_ln1'),
      `listeners=${y.includes('listeners:')} IN-NAME=${y.includes('IN-NAME,hsln_ln1,')} all主链=${fw.includes('-j HS_LAN')} 线路链=${fw.includes('hs_wl_ln1')}`);
  }

  /* ---- E3 s2 本机代理 ---- */
  {
    const fw = vmg.fw("C.s2=true;");
    check('E3 s2 本机代理：HS_OUT 链仍在（OUTPUT 链路径不回归）',
      fw.includes('HS_OUT') && fw.includes('OUTPUT'),
      `HS_OUT=${fw.includes('HS_OUT')} OUTPUT=${fw.includes('OUTPUT')}`);
  }

  /* ---- E4/E5 容器 clean 对称 ---- */
  env = new NetEnv('clean');
  await env.start(['NET_ADMIN', 'SYS_ADMIN']);
  await env.exec('apk add -q iptables ipset iproute2 2>&1 | tail -1; mkdir -p /data/plugins/customs; echo TOOLS_OK', 180000);
  await env.exec('iptables -t nat -N HS_LAN 2>/dev/null; iptables -t mangle -N HS_UDP 2>/dev/null; echo 1 > /proc/sys/net/ipv4/ip_forward; true', 10000);

  const fwTwo = vmg.fw("C.s1='all';"); /* ln1 + ln2 */
  await env.putFile('/data/plugins/customs/fw.sh', fwTwo);
  await env.exec('chmod 755 /data/plugins/customs/fw.sh; sh /data/plugins/customs/fw.sh apply >/tmp/fw.log 2>&1; echo APPLIED', 60000);
  const afterApply = await env.exec('ipset list -n 2>/dev/null | grep hs_wl; echo ---; iptables -t nat -S | grep -c "HS_LAN_ln"; echo ---; iptables -t nat -S PREROUTING | grep -c "hs_wl_"', 15000);
  const appliedSets = (afterApply.out.split('---')[0] || '').trim().split('\n').filter(Boolean).length;
  if (appliedSets < 2) { const lg = await env.exec('tail -15 /tmp/fw.log', 10000); console.log('  [fw.log] ' + (lg.out || '').replace(/\n/g, '|').slice(0, 500)); }

  await env.exec('sh /data/plugins/customs/fw.sh clean >/tmp/clean.log 2>&1; echo CLEANED', 60000);
  const afterClean = await env.exec('echo SETS=$(ipset list -n 2>/dev/null | grep -c hs_wl); echo CHAINS_NAT=$(iptables -t nat -S | grep -c "HS_LAN_ln"); echo CHAINS_MANGLE=$(iptables -t mangle -S | grep -c "HS_UDP_ln"); echo JUMPRES=$(iptables -t nat -S PREROUTING | grep -c "HS_"); echo MANGLE_JUMP=$(iptables -t mangle -S PREROUTING | grep -c "HS_")', 15000);
  const m = (afterClean.out || '').match(/SETS=(\d+)\s+CHAINS_NAT=(\d+)\s+CHAINS_MANGLE=(\d+)\s+JUMPRES=(\d+)\s+MANGLE_JUMP=(\d+)/);
  const sets = m ? +m[1] : -1, cn = m ? +m[2] : -1, cm = m ? +m[3] : -1, jr = m ? +m[4] : -1, mj = m ? +m[5] : -1;
  check('E4 fw_clean 对称：apply(' + appliedSets + ' 组线路集合)后 clean → hs_wl_* 全部销毁、线路链删除、PREROUTING 无 -j HS_ 残留',
    appliedSets >= 2 && sets === 0 && cn === 0 && cm === 0 && jr === 0 && mj === 0,
    `apply集合=${appliedSets} clean后 SETS=${sets} NAT链=${cn} MANGLE链=${cm} NAT跳转残留=${jr} MANGLE跳转残留=${mj}`);

  /* E5 孤儿：删除 ln2 后直接重 apply（新 fw_clean 不含 ln2 专属清理，且中间不 clean） */
  const fwTwo2 = vmg.fw("C.s1='all';"); /* ln1 + ln2 */
  await env.putFile('/data/plugins/customs/fw.sh', fwTwo2);
  await env.exec('sh /data/plugins/customs/fw.sh apply >/tmp/fw3.log 2>&1; echo APPLIED3', 60000);
  const beforeDrop = await env.exec('ipset list -n 2>/dev/null | grep hs_wl | tr "\\n" ","', 15000);
  const fwOne = vmg.fw("C.s1='all'; C.lines=[{id:'ln1', name:'线路一', mode:'auto', nodes:[], pick:'auto'}];");
  await env.putFile('/data/plugins/customs/fw.sh', fwOne);
  await env.exec('sh /data/plugins/customs/fw.sh apply >/tmp/fw4.log 2>&1; echo APPLIED4', 60000);
  const afterReapply = await env.exec('echo SETS=$(ipset list -n 2>/dev/null | grep hs_wl | tr "\\n" ","); echo JUMPLN2=$(iptables -t nat -S PREROUTING 2>/dev/null | grep -c "hs_wl_ln2"); echo CHAINLN2=$(iptables -t nat -S 2>/dev/null | grep -c "HS_LAN_ln2")', 15000);
  console.log('  [观察] 删除 ln2 前集合=' + (beforeDrop.out || '').trim() + ' 重 apply 后：' + (afterReapply.out || '').trim());
  const orphanR = /SETS=([^\s]*ln2)/.test(afterReapply.out) || /CHAINLN2=[1-9]/.test(afterReapply.out);
  check('E7 删线收敛：重 apply 后旧 hs_wl_ln2 集合/HS_LAN_ln2 链/跳转全部销毁（孤儿清理生效）',
    !/ln2/.test((afterReapply.out.match(/SETS=([^E]*)/) || [])[1] || '') && /CHAINLN2=0/.test(afterReapply.out) && /JUMPLN2=0/.test(afterReapply.out),
    (afterReapply.out || '').replace(/\n/g, ' '));
  check('E5 观察项（不判成败）：删除线路后旧 ipset/链残留行为', true, orphanR ? '（修复后不应再出现）' : '旧线路集合已清除（无孤儿）');

  /* E6 新增线路：单线 fw → 双线 fw 重 apply 后 hs_wl_ln2 出现且挂载就位 */
  const fwTwo3 = vmg.fw("C.s1='all';");
  await env.putFile('/data/plugins/customs/fw.sh', fwTwo3);
  await env.exec('sh /data/plugins/customs/fw.sh apply >/tmp/fw5.log 2>&1; echo APPLIED5', 60000);
  const afterAdd = await env.exec('echo SETS=$(ipset list -n 2>/dev/null | grep hs_wl | tr "\\n" ","); echo JLN2=$(iptables -t nat -S PREROUTING 2>/dev/null | grep -c "hs_wl_ln2"); echo RLN2=$(iptables -t nat -S HS_LAN_ln2 2>/dev/null | grep -c "REDIRECT")', 15000);
  check('E6 新增线路：重 apply 后 hs_wl_ln2 出现、PREROUTING 挂载、线路链 REDIRECT 在位',
    /ln2/.test((afterAdd.out.match(/SETS=([^E]*)/) || [])[1] || '') && /JLN2=[1-9]/.test(afterAdd.out) && /RLN2=[1-9]/.test(afterAdd.out),
    (afterAdd.out || '').replace(/\n/g, ' '));

  /* E8 源码断言：两保存路径含 reapplyFw（文本形态，与模块构建回归同源双锁） */
  {
    const plugSrc = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
    const tree2 = acorn.parse(plugSrc, { ecmaVersion: 2020, sourceType: 'module' });
    let fnD = null, fnL = null;
    (function f(n) {
      if (!n || typeof n !== 'object') return;
      if (n.type === 'FunctionDeclaration' && n.id) { if (n.id.name === 'refreshDevPaneInner') fnD = n; if (n.id.name === 'openLineDlg') fnL = n; }
      for (const v of Object.values(n)) { if (Array.isArray(v)) v.forEach(f); else if (v && typeof v === 'object') f(v); }
    })(tree2);
    const dTxt = fnD ? plugSrc.slice(fnD.start, fnD.end) : '';
    const lTxt = fnL ? plugSrc.slice(fnL.start, fnL.end) : '';
    check('E8 保存路径热修：设备线路下拉与线路管理保存均含 reapplyFw（saveConfReload 成功后）',
      /await reapplyFw\(\);/.test(dTxt) && /await reapplyFw\(\);/.test(lTxt)
        && /saveConfReload/.test(dTxt) && /saveConfReload/.test(lTxt),
      `下拉含=${/reapplyFw/.test(dTxt)} 线路保存含=${/reapplyFw/.test(lTxt)}`);
  }

  await env.exec('sh /data/plugins/customs/fw.sh clean >/dev/null 2>&1; true', 20000);
  await env.stop();
  check('收尾：NET_ADMIN 容器经 TERM 释放并删除', true, 'removed');
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 240));
  if (env) { try { await env.stop(); } catch (e2) { console.log('[f0203b] stop失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok && !x.name.startsWith('E5'));
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F0203bMAC入口边界-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF0203b MAC 入口边界核验全部通过');
process.exit(bad.length ? 1 : 0);
