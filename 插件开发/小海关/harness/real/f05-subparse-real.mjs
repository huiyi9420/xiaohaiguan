#!/usr/bin/env node
/* ============================================================================
 * F05 订阅解析真实校验（夹具 × 三模式 → 隔离容器真实 mihomo v1.19.32 -t）
 * ----------------------------------------------------------------------------
 * 覆盖：无缩进序列/双引号组名/顶层锚点跨块引用/仅 proxy-providers/节点名特殊字符/
 *       恶意换行注入(必须被拒且旧配置保留)/逻辑规则(SUB-RULE+AND,合并模式保真)。
 * 方法：源码行为核验同款 AST 提取 genConfigYaml + ESM 导入 src 模块，VM 生成三模式
 *       config；RealEnv 隔离容器内以生产固定路径运行真实 mihomo -t -d 校验。
 * 退出码：0=全部通过；1=存在失败（探针断言失败必非零）。
 * ==========================================================================*/
import path from 'node:path';
import vm from 'node:vm';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const acorn = createRequire(import.meta.url)('acorn');
import { RealEnv, ensureHostAsset, MIHOMO_DIR, MIHOMO_BIN } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.resolve(HERE, '..', 'artifacts');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}

/* ---------- VM：AST 提取 genConfigYaml（源码行为核验同款） ---------- */
async function buildVm() {
  const source = fs.readFileSync(path.resolve(HERE, '..', '..', '插件.js'), 'utf8');
  const tree = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' });
  const body = tree.body.find(n => n.type === 'ExpressionStatement'
    && n.expression.callee.type === 'ArrowFunctionExpression').expression.callee.body.body;
  const names = new Set(['V', 'DIR', 'BIN', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY',
    'PORT_DEF', 'DEF', 'C', 'ST', 'ET_CACHE', 'HS_GAME_DOMAINS', 'HS_MANUAL', 'HS_SUB_RAW',
    'HS_SUB_RAW_KEY', 'HS_MANUAL_LOADED', 'b64u', 'toB64', 'b64d']);
  const functions = new Set(['genConfigYaml', 'genFwSh', 'genStartSh', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
  const decls = [];
  for (const n of body) {
    if (n.type === 'FunctionDeclaration' && functions.has(n.id.name)) decls.push(source.slice(n.start, n.end));
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (names.has(d.id.name)) decls.push(n.kind + ' ' + source.slice(d.start, d.end) + ';');
  }
  const mods = {};
  for (const name of ['工具', '订阅解析', '启动脚本']) {
    Object.assign(mods, await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', name + '.js')).href));
  }
  const ctx = vm.createContext({
    console, TextEncoder, URL, btoa, atob, ...mods,
    /* 失败路径日志函数 stub(生产存在;仅吸收日志副作用,不 mock 任何业务结果) */
    opLog: async () => '', toast: () => { }
  });
  vm.runInContext(decls.join('\n'), ctx, { timeout: 10000 });
  return {
    ctx,
    gen(mode, raw) {
      vm.runInContext(`C = JSON.parse(JSON.stringify(DEF)); ST = {chn:0,geoSiteT:0,geoIpT:0,neigh6:{}}; HS_MANUAL=[]; HS_SUB_RAW=''; ET_CACHE=null;`, ctx);
      if (mode !== 'self') {
        ctx.inputRaw = raw; ctx.inputMode = mode;
        vm.runInContext(`C.policySrc=inputMode; C.activeSub=0; C.subs=[{name:'隔离测试',url:'https://example.invalid/s'}]; HS_SUB_RAW=inputRaw;`, ctx);
      }
      return vm.runInContext('genConfigYaml()', ctx, { timeout: 10000 });
    }
  };
}

/* ---------- 夹具 ---------- */
const YAML = (await import('yaml')).default;
const baseNode = { name: '测试节点', type: 'ss', server: '127.0.0.1', port: 18081, cipher: 'aes-128-gcm', password: '隔离测试非生产凭据', udp: true };
const simple = { proxies: [baseNode], 'proxy-groups': [{ name: '订阅选择', type: 'select', proxies: ['测试节点'] }], rules: ['MATCH,订阅选择'] };
const fixtures = [
  { id: 'F1', title: '无缩进序列订阅', raw: YAML.stringify(simple, { indentSeq: false }) },
  { id: 'F2', title: '双引号策略组名', raw: 'proxies:\n  - {name: 测试节点, type: direct}\nproxy-groups:\n  - name: "订阅选择"\n    type: select\n    proxies: [测试节点]\nrules:\n  - MATCH,订阅选择\n' },
  { id: 'F3', title: '顶层锚点跨块引用', raw: 'base: &base\n  type: ss\n  server: 127.0.0.1\n  port: 18081\n  cipher: aes-128-gcm\n  password: local-test\nproxies:\n  - <<: *base\n    name: 测试节点\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [测试节点]\nrules:\n  - MATCH,订阅选择\n' },
  { id: 'F4', title: '外部 proxy-providers 订阅', raw: YAML.stringify(simple, { indentSeq: true }) + 'proxy-providers:\n  ext:\n    type: file\n    path: ./providers/ext.yaml\n' },
  { id: 'F5', title: '节点名含特殊字符', raw: 'proxies:\n  - name: "含,逗号 与\\"引号\\" 🚀"\n    type: direct\nproxy-groups:\n  - name: "🚀 特殊 名"\n    type: select\n    proxies: ["含,逗号 与\\"引号\\" 🚀"]\nrules:\n  - MATCH,🚀 特殊 名\n' },
  { id: 'F7', title: '逻辑规则(SUB-RULE+AND)', raw: 'proxies:\n  - {name: n1, type: direct}\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [n1]\nrules:\n  - AND,((DOMAIN-SUFFIX,example.com),(DST-PORT,443)),订阅选择\n  - SUB-RULE,(DOMAIN-SUFFIX,fn.com),rt-direct\n  - MATCH,订阅选择\nsub-rules:\n  rt-direct:\n    - DOMAIN-SUFFIX,cn,DIRECT\n    - MATCH,订阅选择\n' },
  { id: 'F6', title: '恶意换行注入(server 含裸换行)', raw: 'proxies:\n  - name: n\n    server: "1.2.3.4\n    udp: true"\n    type: direct\nproxy-groups:\n  - {name: g, type: select, proxies: [n]}\nrules:\n  - MATCH,g\n', expectReject: true }
];

/* ---------- 主流程 ---------- */
let env = null;
try {
  const vmg = await buildVm();
  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f05] ' + m));
  await env.prepareBinary(asset.path); /* 真实 mihomo v1.19.32 固定生产路径 */
  /* F4 的 file provider 与 F7 无外部依赖；预写 provider 文件使 -t 不因文件缺失误报 */
  await env.exec('mkdir -p ' + MIHOMO_DIR + '/providers && printf \'proxies:\\n  - {name: p1, type: direct}\\n\' > ' + MIHOMO_DIR + '/providers/ext.yaml');

  const mihomoTest = async (yamlText, tag) => {
    await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', yamlText);
    const r = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -3', 60000);
    const out = r.out || '';
    return { ok: /successful/i.test(out), tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 160), tag };
  };

  /* F6 恶意夹具：解析拒绝 + 旧配置保留协议 */
  {
    const f6 = fixtures.find(f => f.expectReject);
    const parsed = (await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', '订阅解析.js')).href)).extractSubBlocks(f6.raw);
    const rejected = parsed.ok === false && !!parsed.why;
    const oldCfg = 'proxies: []\nrules: []\n'; /* 旧配置占位(合法空骨架) */
    await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', oldCfg);
    const gen = vmg.gen('direct', f6.raw);
    const keptOld = gen === null; /* null=写盘点守卫跳过,旧配置不动 */
    const still = (await env.exec('cat ' + MIHOMO_DIR + '/config.yaml')).out;
    const oldPreserved = still === oldCfg;
    check('F6 恶意换行注入被拒且旧配置保留', rejected && keptOld && oldPreserved,
      `extractSubBlocks.ok=${parsed.ok} why=${(parsed.why || '').slice(0, 50)} genConfigYaml=${gen === null ? 'null(拒绝)' : '生成了配置!'} 容器旧配置未变=${oldPreserved}`);
  }

  /* F1-F5/F7 × 三模式：真实 mihomo -t。
     self 模式（不消费订阅）如实暴露自建分支既有缺陷：空节点时主组引用未生成的子组
     （♻️自动选优等）→ 真实 mihomo -t fatal——与 Y05 同根因，F05 范围外的产品缺陷，
     单列记录不计入 F05 判定（不做任何 mock/放宽）；merge/direct 为 F05 主体判定。 */
  const selfExisting = [];
  for (const f of fixtures.filter(x => !x.expectReject)) {
    for (const mode of ['self', 'merge', 'direct']) {
      const y = vmg.gen(mode, f.raw);
      if (y === null) { check(f.id + '/' + mode + ' ' + f.title, false, 'genConfigYaml 返回 null(意外拒绝)'); continue; }
      try { YAML.parse(y); } catch (e) { check(f.id + '/' + mode + ' ' + f.title, false, '宿主 YAML.parse 即失败: ' + e.message.split('\n')[0]); continue; }
      const t = await mihomoTest(y, f.id + '/' + mode);
      if (mode === 'self') {
        selfExisting.push({ id: f.id, pass: t.ok, tail: t.ok ? '' : t.tail });
      } else {
        check(f.id + '/' + mode + ' ' + f.title + ' 通过真实 mihomo -t', t.ok, t.ok ? '' : t.tail);
      }
    }
  }
  const selfAllFail = selfExisting.length > 0 && selfExisting.every(x => !x.pass)
    && selfExisting.every(x => /not found/.test(x.tail));
  /* Y05 修复后 self 模式转正：空节点时主组仅 DIRECT、不引用未生成子组，真实 mihomo -t 应通过。
     红灯（修复前）=全部 fatal not found；修复后=全部通过 */
  check('self 模式空节点悬空引用已修复(Y05)：全部通过真实 mihomo -t',
    selfExisting.length > 0 && selfExisting.every(x => x.pass),
    (selfExisting[0] ? (selfExisting[0].pass ? '已通过' : '仍报 ' + selfExisting[0].tail) : '无用例'));
  /* Y05 结构断言：空节点 self 产物引用完整性——主组仅 DIRECT 且不引用三子组(引用完整性而非组列表非空) */
  {
    const y = vmg.gen('self');
    let g = null;
    try { g = YAML.parse(y) } catch (e) { g = null }
    const main = g && (g['proxy-groups'] || []).find(x => x.name === '🚀 节点选择');
    const subNames = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移'];
    const noDangling = main && JSON.stringify(main.proxies) === JSON.stringify(['DIRECT'])
      && !(g['proxy-groups'] || []).some(x => subNames.includes(x.name))
      && (g.rules || []).every(r => !subNames.some(n => r.includes(n)));
    check('Y05 空节点 self 结构：主组仅 DIRECT、无子组悬空引用(规则亦不引用)', !!noDangling,
      `主组proxies=${main ? JSON.stringify(main.proxies) : '解析失败'}`);
  }

  /* F7 合并模式保真断言：AND/SUB-RULE 规则原文在产物中 */
  {
    const y = vmg.gen('merge', fixtures.find(x => x.id === 'F7').raw);
    const kept = y.includes('AND,((DOMAIN-SUFFIX,example.com),(DST-PORT,443)),订阅选择')
      && y.includes('SUB-RULE,(DOMAIN-SUFFIX,fn.com),rt-direct')
      && y.includes('rt-direct:');
    check('F7 合并模式逻辑规则保真透传(含 sub-rules 段)', kept);
  }

  /* 收尾：TERM 清理 */
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f05] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(ARTIFACTS, { recursive: true });
fs.writeFileSync(path.join(ARTIFACTS, 'F05订阅解析真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF05 订阅解析真实校验全部通过');
process.exit(bad.length ? 1 : 0);
