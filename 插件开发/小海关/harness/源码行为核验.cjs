/* ============================================================================
 * 源码行为核验（T01 修复版）
 * ----------------------------------------------------------------------------
 * 修复内容（2026-10-03，T01 收尾；仅测试基建，不改生产代码）：
 *   1) 入口以 sourceType:'module' 解析（源码已是 ES 模块，旧脚本 script 模式
 *      遇 import/export 直接 SyntaxError——该错误属基础设施失败，不能当产品证据）；
 *   2) names/functions 提取集合修正：genSecret/yamlEsc 是入口 FunctionDeclaration，
 *      原被错放在变量集合导致提取不到（root 指出的符号缺失）；已迁至 src/ 的符号
 *      （工具.js、订阅解析.js 等）改为 ESM 动态 import 后注入 VM 上下文；
 *   3) 基础设施失败与产品断言失败严格分离：解析/提取/注入/必需符号缺失/
 *      docker 自身故障 → infra（退出码 2）；产品用例失败是预期产出（退出码 1）；
 *   4) 机器可读报告落 harness/artifacts/源码行为核验.json（infra/product 分计数）。
 * 用例 Y01-Y08/S01/S02/R01/I01-I04 断言语义保持不变（仅迁移到新执行管线）。
 * ==========================================================================*/
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const acorn = require('acorn');
const YAML = require('yaml');

const artifacts = path.join(__dirname, 'artifacts');
const infraFailures = [];
function infraFail(stage, message) {
  infraFailures.push({ stage, message: String(message).slice(0, 300) });
  throw new Error('INFRA:' + stage + ':' + String(message).slice(0, 200));
}
/* 基础设施步骤包装：解析/提取/注入/docker 故障一律 infra，不与产品红混淆 */
async function infraStep(stage, fn) {
  try { return await fn(); }
  catch (e) { if (String(e.message).startsWith('INFRA:')) throw e; infraFail(stage, e && e.stack || e); }
}

async function main() {
  /* ---------- [infra] 读取 + 模块方式解析入口，提取 IIFE 体 ---------- */
  const { source, body } = await infraStep('parse-entry', () => {
    const sourcePath = path.resolve(__dirname, '../插件.js');
    const src = fs.readFileSync(sourcePath, 'utf8');
    const tree = acorn.parse(src, { ecmaVersion: 2020, locations: true, sourceType: 'module' });
    const call = tree.body.find(n => n.type === 'ExpressionStatement'
      && n.expression.type === 'CallExpression' && n.expression.callee.type === 'ArrowFunctionExpression');
    if (!call) infraFail('parse-entry', '入口的独立闭包不存在');
    return { source: src, body: call.expression.callee.body.body };
  });

  /* ---------- [infra] src 模块（已迁符号）经 ESM 真实 import 注入 ---------- */
  const moduleSymbols = await infraStep('import-src-modules', async () => {
    const mods = {};
    for (const name of ['工具', '订阅解析', '启动脚本']) {
      const mod = await import(pathToFileURL(path.resolve(__dirname, '../src/' + name + '.js')).href);
      Object.assign(mods, mod);
    }
    if (typeof mods.extractSubBlocks !== 'function' || typeof mods.firstSelectGroup !== 'function'
      || typeof mods.okCidr !== 'function' || typeof mods.lineGName !== 'function'
      || typeof mods.generateStartScript !== 'function') {
      infraFail('import-src-modules', 'src 模块导出符号异常');
    }
    return mods;
  });

  /* ---------- [infra] AST 提取入口闭包内声明 ---------- */
  const declarations = await infraStep('extract-entry-declarations', () => {
    const names = new Set(['V', 'DIR', 'BIN', 'CFG', 'CJ', 'START', 'FW', 'LOGF', 'OPLOG', 'BOOT_SH', 'BOOT_KEY', 'PORT_DEF', 'DEF', 'C', 'ST', 'ET_CACHE', 'HS_GAME_DOMAINS', 'HS_MANUAL', 'HS_SUB_RAW', 'HS_SUB_RAW_KEY', 'HS_MANUAL_LOADED', 'b64u', 'toB64', 'b64d']);
    /* genSecret/yamlEsc 为入口 FunctionDeclaration（旧脚本误置于变量集合，root 指出的缺失符号）；
       extractSubBlocks/firstSelectGroup 已迁 src/订阅解析.js，由上面 import 提供 */
    const functions = new Set(['genConfigYaml', 'genFwSh', 'genStartSh', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc']);
    const out = [];
    for (const node of body) {
      if (node.type === 'FunctionDeclaration' && functions.has(node.id.name)) out.push(source.slice(node.start, node.end));
      if (node.type === 'VariableDeclaration') {
        for (const d of node.declarations) {
          if (names.has(d.id.name)) out.push(node.kind + ' ' + source.slice(d.start, d.end) + ';');
        }
      }
    }
    return out;
  });

  /* ---------- [infra] VM 注入 + 必需符号 smoke（缺失即 infra，不冒充产品结果） ---------- */
  const context = await infraStep('vm-inject-smoke', () => {
    const ctx = vm.createContext({
      console, TextEncoder, URL, btoa, atob,
      ...moduleSymbols /* esc/shq/toB64/b64d/okCidr/okV6/lineGName/extractSubBlocks/firstSelectGroup 等真实模块实现 */
    });
    vm.runInContext(declarations.join('\n'), ctx, { timeout: 10000 });
    const required = ['genConfigYaml', 'genFwSh', 'genStartSh', 'sanitizeConf', 'parseNodeUri', 'nodeToYaml', 'genSecret', 'yamlEsc',
      'extractSubBlocks', 'firstSelectGroup', 'generateStartScript', 'okCidr', 'okV6', 'C', 'DEF', 'ST', 'HS_MANUAL', 'HS_SUB_RAW', 'PORT_DEF', 'V'];
    const missing = required.filter(name => {
      try { const t = vm.runInContext('typeof ' + name, ctx); return t === 'undefined'; } catch (e) { return true; }
    });
    if (missing.length) infraFail('vm-inject-smoke', 'VM 缺少必需符号: ' + missing.join(','));
    return ctx;
  });
  const run = code => vm.runInContext(code, context, { timeout: 10000 });
  const baseline = () => run(`C = JSON.parse(JSON.stringify(DEF)); ST = {chn:0,geoSiteT:0,geoIpT:0,neigh6:{}}; HS_MANUAL=[]; HS_SUB_RAW=''; ET_CACHE=null;`);

  /* ---------- [product] 用例（断言与语义保持原文不变） ---------- */
  const node = { name: '测试节点', type: 'ss', server: '127.0.0.1', port: 18081, cipher: 'aes-128-gcm', password: '隔离测试非生产凭据', udp: true };
  const simple = { proxies: [node], 'proxy-groups': [{ name: '订阅选择', type: 'select', proxies: [node.name] }], rules: ['MATCH,订阅选择'] };
  const findings = [];
  function check(id, title, test) {
    try {
      const result = test();
      findings.push({ id, title, passed: result === true });
    } catch (error) {
      findings.push({ id, title, passed: false, error: error.name, detail: String(error.message || '').slice(0, 140) });
    }
  }
  function withSubscription(raw, mode) {
    baseline();
    context.inputRaw = raw;
    context.inputMode = mode;
    run(`C.policySrc=inputMode; C.activeSub=0; C.subs=[{name:'隔离测试',url:'https://example.invalid/subscription'}]; HS_SUB_RAW=inputRaw;`);
  }
  const indented = YAML.stringify(simple, { indentSeq: true });
  const indentless = YAML.stringify(simple, { indentSeq: false });
  check('Y01', '合法无缩进列表订阅可提取', () => { withSubscription(indentless, 'merge'); return run('extractSubBlocks(HS_SUB_RAW).ok') === true; });
  check('Y02', '双引号策略组名称可识别', () => { withSubscription('proxies:\n  - {name: 测试节点, type: direct}\nproxy-groups:\n  - name: "订阅选择"\n    type: select\n    proxies: [测试节点]\nrules:\n  - MATCH,订阅选择\n', 'direct'); return run('firstSelectGroup(HS_SUB_RAW)') === '订阅选择'; });
  check('Y03', '顶层锚点在块提取后仍有效', () => {
    const raw = 'base: &base\n  type: ss\n  server: 127.0.0.1\n  port: 18081\n  cipher: aes-128-gcm\n  password: local-test\nproxies:\n  - <<: *base\n    name: 测试节点\nproxy-groups:\n  - name: 订阅选择\n    type: select\n    proxies: [测试节点]\nrules:\n  - MATCH,订阅选择\n';
    YAML.parse(raw); withSubscription(raw, 'direct'); const extracted = run('extractSubBlocks(HS_SUB_RAW)'); YAML.parse(extracted.yaml); return extracted.ok;
  });
  check('Y04', '合法外部proxy-providers不丢失', () => { withSubscription(indented + '\nproxy-providers:\n  ext:\n    type: file\n    path: ./providers/ext.yaml\n', 'direct'); return Boolean(YAML.parse(run('extractSubBlocks(HS_SUB_RAW).yaml'))['proxy-providers']); });
  check('Y05', '空节点源配置无悬空策略组引用', () => { baseline(); const obj = YAML.parse(run('genConfigYaml()')); const available = new Set(['DIRECT', ...(obj['proxy-groups'] || []).map(g => g.name)]); return obj['proxy-groups'].every(g => (g.proxies || []).every(p => available.has(p))); });
  check('Y06', '策略默认选择使用实际内核支持的字段', () => { baseline(); run(`HS_MANUAL=['测试节点']; C.mode='balance';`); const obj = YAML.parse(run('genConfigYaml()')); return obj['proxy-groups'][0]['default-selected'] === '⚖️ 负载均衡'; });
  check('Y07', '持久选择与fake-ip位于profile配置块', () => { baseline(); const obj = YAML.parse(run('genConfigYaml()')); return obj.profile?.['store-selected'] === true && obj.profile?.['store-fake-ip'] === true; });
  check('Y08', '线路候选过滤不匹配同名前缀其他节点', () => { baseline(); run(`HS_MANUAL=['香港1','香港10']; C.lines=[{id:'L1',name:'候选',mode:'node',nodes:['香港1'],pick:'manual'}];`); const obj = YAML.parse(run('genConfigYaml()')); const f = Object.values(obj['proxy-providers']).find(p => p.filter); return f && !new RegExp(f.filter).test('香港10'); });
  check('S01', '只起引擎与恢复上次生成不同启动行为', () => { baseline(); run(`C.s1='all'; C.bootMode='keep';`); const keep = run('genStartSh()'); run(`C.bootMode='core';`); return keep !== run('genStartSh()'); });
  check('I01', '拒绝不合法IPv4与掩码', () => !run(`okCidr('999.999.999.999/99')`));
  check('I02', '拒绝不合法IPv6', () => !run(`okV6(':::::')`));
  check('I03', '导入嵌套条目不造成生成器异常', () => { baseline(); run('C.lines=[null]; sanitizeConf(); genConfigYaml();'); return true; });
  check('I04', 'VMess服务器文本不会改变YAML结构', () => { baseline(); context.uri = 'vmess://' + Buffer.from(JSON.stringify({ add: '127.0.0.1\n    udp: false', port: 18081, id: '00000000-0000-0000-0000-000000000001', ps: '测试' })).toString('base64'); const n = run('parseNodeUri(uri)'); if (!n) return true; const obj = YAML.parse('proxies:\n' + run('nodeToYaml(parseNodeUri(uri))')); return obj.proxies[0].server.includes('\n') || obj.proxies[0].server !== '127.0.0.1'; });

  /* R01：恢复函数源码定位失败属 infra（结构变化），正则不匹配才是产品红 */
  const rollback = await infraStep('locate-rollback', () => {
    const fn = body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'rollbackUpgrade');
    if (!fn) infraFail('locate-rollback', '入口缺少 rollbackUpgrade 函数');
    return fn;
  });
  const regex = source.slice(rollback.start, rollback.end).match(/if \(!\/(.*?)\/.test\(cp.content/s);
  check('R01', '成功的R=0被手动恢复分支识别', () => regex && new RegExp(regex[1]).test('R=0\n'));

  /* ---------- [product] 产物生成段：生成器故障/YAML 非法记产品红，不再让脚本崩溃 ---------- */
  fs.mkdirSync(artifacts, { recursive: true });
  const genOutputs = {};
  check('G01', '三件套与三模式配置可生成且为合法YAML', () => {
    baseline();
    genOutputs['生成-fw.sh'] = run('genFwSh()');
    genOutputs['生成-start.sh'] = run('genStartSh()');
    genOutputs['空节点-config.yaml'] = run('genConfigYaml()');
    YAML.parse(genOutputs['空节点-config.yaml']);
    for (const mode of ['self', 'merge', 'direct']) {
      withSubscription(indented, mode);
      const y = run('genConfigYaml()');
      genOutputs[mode + '-config.yaml'] = y;
      YAML.parse(y);
    }
    return true;
  });
  for (const [file, content] of Object.entries(genOutputs)) fs.writeFileSync(path.join(artifacts, file), content);

  /* ---------- [product] S02：BusyBox 语法检查（docker 自身故障属 infra） ---------- */
  const shell = spawnSync('docker', ['run', '--network', 'none', '--read-only', '--mount',
    'type=bind,src=' + artifacts + ',dst=/audit,readonly', 'alpine:latest', 'sh', '-c',
    'sh -n /audit/生成-fw.sh && sh -n /audit/生成-start.sh'], { encoding: 'utf8', timeout: 30000 });
  if (shell.error || shell.status === null) infraFail('docker-syntax-check', (shell.error && shell.error.message) || 'docker 无退出码');
  findings.push({ id: 'S02', title: '实际生成shell通过BusyBox语法检查', passed: shell.status === 0, detail: (shell.stderr || '').trim().slice(0, 160) || undefined });

  /* ---------- 报告与退出码（infra/product 分计数；infra 优先非零） ---------- */
  const productPassed = findings.filter(f => f.passed).length;
  const productFailed = findings.filter(f => !f.passed).length;
  const report = {
    generatedAt: new Date().toISOString(),
    version: run('V'), sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    method: '执行AST提取的实际纯函数+ESM导入的src模块真实导出；不替换shell/API返回；边界配置为显式测试输入，非真实订阅与真机结果',
    infra: { failures: infraFailures, count: infraFailures.length },
    product: findings,
    summary: { infraFailures: infraFailures.length, productPassed, productFailed }
  };
  fs.writeFileSync(path.join(artifacts, '源码行为核验.json'), JSON.stringify(report, null, 2) + '\n');
  for (const f of findings) console.log(`${f.passed ? '通过' : '未通过'} ${f.id} ${f.title}${f.error ? ' (' + f.error + ')' : ''}`);
  console.log(`\n汇总：infra失败=${infraFailures.length} 产品通过=${productPassed} 产品失败=${productFailed}`);
  process.exitCode = infraFailures.length ? 2 : (productFailed ? 1 : 0);
}

main().catch(e => {
  /* 顶层 infra 兜底：任何未分类的基础设施异常 → 报告 + exit 2 */
  if (!infraFailures.length) infraFailures.push({ stage: 'top-level', message: String((e && e.message) || e).slice(0, 300) });
  try {
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, '源码行为核验.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      infra: { failures: infraFailures, count: infraFailures.length }, product: [], summary: { infraFailures: infraFailures.length, productPassed: 0, productFailed: 0 }
    }, null, 2) + '\n');
  } catch (e2) { console.error('infra 报告落盘失败:', e2.message); }
  for (const f of infraFailures) console.error(`[infra失败] ${f.stage}: ${f.message}`);
  console.error(`\n汇总：infra失败=${infraFailures.length} 产品用例未执行（基础设施失败优先）`);
  process.exitCode = 2;
});
