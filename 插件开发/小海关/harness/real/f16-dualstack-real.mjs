#!/usr/bin/env node
/* ============================================================================
 * F16 国内 IP 表双栈真实校验（红灯先行→修复→全绿）
 * ----------------------------------------------------------------------------
 * 缺陷：ensureChinaIpRules 的 awk 仅匹配 IPv4 CIDR 生成 rules/china_ip.txt，
 *   国内 IPv6 目标进引擎后无国内表可命中（落入代理兜底）；v6 判定只靠防火墙
 *   hs_cn6 提前 RETURN（计划 §2.4 真机事实：china_ip.txt 6206 行 v6 条目 0）。
 * 修复：单文件合并 v4+v6（behavior:ipcidr 官方支持混合——wiki.metacubex.one
 *   rule-providers ipcidr 载荷每行一个 CIDR，内核 IpCidrTrie/AddIpCidrForString
 *   v4/v6 通吃，IP-CIDR6 仅 IP-CIDR 别名同效果）；v6 文件缺失时 0 条 v6=v4-only
 *   现状不劣化。
 *
 * 夹具（真实容器，真 mihomo v1.19.32 生产固定路径）：
 *   chnroute.txt = v4 夹具 5002 条(过阈值)+干扰行；chnroute6.txt = v6 3 条；
 *   VM 提取 ensureChinaIpRules(真实容器执行 awk)+genConfigYaml 链。
 *   R1 红灯：现行 rules/china_ip.txt 0 条 v6
 *   G1 修复后：规则文件 v4+v6 条目数精确；G2 -t 通过；G3 启动后
 *     /providers/rules/china_ip ruleCount = v4+v6 精确；G4 RULE-SET,china_ip,DIRECT
 *     位于 MATCH 前(配置断言,API 无法直接验证单条命中——覆盖深度标注)；
 *   G5 缺失兼容：删 chnroute6.txt 重生成 → 0 条 v6、v4 正常、-t 通过(不劣于现状)
 * 退出码：0=全过；1=有失败。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, ensureHostAsset, MIHOMO_DIR, MIHOMO_BIN } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
const V4_N = 5002, V6_N = 3;
const PORTS = { ctrl: 27961, mixed: 27962, redir: 27963, dns: 27964 };
const SEC = 'f16-dualstack-secret';

async function buildVm(env) {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['ensureChinaIpRules', 'genConfigYaml', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析']) Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  const calls = { logs: [] };
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, ...mods, DIR: MIHOMO_DIR, ST: { chn: 0 },
    C: null, ET_CACHE: null, HS_GAME_DOMAINS: [], HS_MANUAL: [], HS_SUB_RAW: '', HS_SUB_RAW_KEY: '',
    HS_SUBINFO: undefined, HS_MANUAL_LOADED: true,
    run: async (cmd, t) => { const r = await env.exec(String(cmd), Math.min((Number(t) || 5000) + 10000, 130000)); return { success: r.code === 0, content: r.out }; },
    opLog: async m => { calls.logs.push(String(m)); return ''; }, toast: () => { },
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return { ctx, calls };
}

let env = null;
try {
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f16] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();

  /* 夹具：v4 5002 条(过 5000 阈值)+干扰行；v6 3 条(含真实国内段形态) */
  let v4 = '';
  for (let i = 0; i < V4_N; i++) v4 += '10.' + (i % 250) + '.' + ((i / 250 | 0) % 250) + '.' + (i % 254) + '/24\n';
  v4 += '# comment line\nnot-a-cidr\n';
  await env.writeContainerFile(MIHOMO_DIR + '/chnroute.txt', v4);
  await env.writeContainerFile(MIHOMO_DIR + '/chnroute6.txt', '240e:95c:0:100::/40\n2408:8000:0:60::/44\nfe80::/10\n');

  const vmm = await buildVm(env);
  const runEnsure = async () => {
    vm.runInContext('ST.chn = 10000;', vmm.ctx);
    return vm.runInContext('(async () => ensureChinaIpRules())()', vmm.ctx, { timeout: 60000 });
  };
  const counts = async () => {
    const r = await env.exec('F4=$(grep -cE \'^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/\' ' + MIHOMO_DIR + '/rules/china_ip.txt 2>/dev/null); F6=$(grep -cE \'^[0-9a-fA-F:]+/[0-9]+$\' ' + MIHOMO_DIR + '/rules/china_ip.txt 2>/dev/null); echo "$F4 $F6"');
    const [a, b] = r.out.trim().split(/\s+/).map(Number);
    return { v4: a || 0, v6: b || 0 };
  };

  const ok1 = await runEnsure();
  const c1 = await counts();
  check('G1 双栈生成：规则文件 v4=' + V4_N + ' 且 v6=' + V6_N + ' 条目精确（干扰行剔除）',
    ok1 === true && c1.v4 === V4_N && c1.v6 === V6_N, `ensure=${ok1} 实得 v4=${c1.v4} v6=${c1.v6}`);

  /* genConfigYaml(self+HS_MANUAL+ST.chn) → 完整 config（含 provider 引用）→ -t → 启动 → ruleCount */
  vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); C.policySrc='self'; C.mode='auto'; C.secret=${JSON.stringify(SEC)};
    C.ports=Object.assign({}, DEF.ports, ${JSON.stringify(PORTS)}); HS_MANUAL=['测试节点']; HS_SUB_RAW=''; ET_CACHE=null; ST.chn = 10000;`, vmm.ctx);
  const yaml = vm.runInContext('genConfigYaml()', vmm.ctx, { timeout: 10000 });
  const hasSet = yaml.includes('RULE-SET,china_ip,DIRECT') && yaml.includes('behavior: ipcidr') && yaml.includes('./rules/china_ip.txt');
  check('G4 配置断言：RULE-SET,china_ip,DIRECT 挂载且位于 MATCH 兜底之前（provider 引用同文件）',
    hasSet && yaml.indexOf('RULE-SET,china_ip,DIRECT') < yaml.indexOf('MATCH,🚀 节点选择'),
    `挂载=${hasSet} 序=${yaml.indexOf('RULE-SET,china_ip,DIRECT')}<${yaml.indexOf('MATCH,🚀 节点选择')}`);

  await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', yaml);
  const t = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -1', 60000);
  check('G2 混合 v4+v6 规则文件通过真实 mihomo -t（behavior:ipcidr 接受 v6 条目实证）',
    /successful/i.test(t.out), t.out.trim().slice(-50));

  const bootR = await env.exec('nohup sh -c \'' + MIHOMO_BIN + ' -d ' + MIHOMO_DIR + ' >/tmp/f16-eng.log 2>&1\' >/dev/null 2>&1 & I=0; while [ $I -lt 15 ]; do C=$(curl -s -m 2 -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ' + SEC + '" http://127.0.0.1:' + PORTS.ctrl + '/version 2>/dev/null); [ "$C" = "200" ] && break; sleep 1; I=$((I+1)); done; echo READY=$C; pidof mihomo || echo NOPID; tail -2 /tmp/f16-eng.log 2>/dev/null', 30000);
  const rc = await env.exec('curl -s -m 5 -H "Authorization: Bearer ' + SEC + '" "http://127.0.0.1:' + PORTS.ctrl + '/providers/rules" > /tmp/f16-prov.json 2>/dev/null; head -c 400 /tmp/f16-prov.json', 10000);
  const ruleCount = Number((/"china_ip":\{[^}]*?"ruleCount":(\d+)/.exec(rc.out) || (/"ruleCount":(\d+)/.exec(rc.out) || []))[1] || 0);
  check('G3 启动后 provider ruleCount = v4+v6 精确（' + (V4_N + V6_N) + '）',
    ruleCount === V4_N + V6_N, `ruleCount=${ruleCount} boot=[${(bootR.out || '').trim().slice(0, 80)}] 响应=[${rc.out.slice(0, 120)}]`);

  await env.exec('for P in $(pidof mihomo); do [ "$(readlink /proc/$P/exe)" = ' + MIHOMO_BIN + ' ] && kill $P; done 2>/dev/null; sleep 0.8; true', 10000);

  /* G5 缺失兼容：删 v6 文件重生成 → 0 条 v6、v4 正常（不劣于现状） */
  await env.exec('rm -f ' + MIHOMO_DIR + '/chnroute6.txt ' + MIHOMO_DIR + '/rules/china_ip.txt');
  const ok5 = await runEnsure();
  const c5 = await counts();
  const t5 = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -1', 60000);
  check('G5 缺失兼容：chnroute6.txt 缺失 → 0 条 v6、v4=' + V4_N + ' 正常、-t 通过（不劣于现状）',
    ok5 === true && c5.v6 === 0 && c5.v4 === V4_N && /successful/i.test(t5.out),
    `ensure=${ok5} v4=${c5.v4} v6=${c5.v6} -t=${/successful/i.test(t5.out)}`);

  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f16] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F16双栈真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF16 国内 IP 表双栈真实校验全部通过');
process.exit(bad.length ? 1 : 0);
