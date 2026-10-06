import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import vm from 'node:vm';
import { parse } from 'acorn';

function findNodes(root, predicate) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(root);
  return found;
}

export async function runReadinessRegression(taskSpaceFactory, spaceId = 5) {
  const page = (await taskSpaceFactory(spaceId)).page('p1');
  async function shell(cmd) {
    return page.evaluate(async cmd => {
      const response = await fetch('/api/run_shell', {
        method: 'POST', headers: { ...common_headers, 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ cmd, timeout: 10000 })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error('只读就绪采集失败');
      return body.content || '';
    }, cmd);
  }
  const config = JSON.parse(Buffer.from(await shell('base64 < /data/plugins/customs/config.json'), 'base64').toString());
  const pid = (await shell('pidof mihomo')).trim();
  const state = await import('../src/状态采集.js');
  if (!state.buildReadinessCommand) {
    const source = await fs.readFile(new URL('../插件.js', import.meta.url), 'utf8');
    const tree = parse(source, { ecmaVersion: 2020, sourceType: 'module' });
    const probe = findNodes(tree, n => n.type === 'VariableDeclarator' && n.id.name === 'apiTest')[0];
    assert.ok(probe, '没有找到旧探活命令');
    const command = vm.runInNewContext(source.slice(probe.init.argument.arguments[0].start, probe.init.argument.arguments[0].end), { P: config.ports });
    const status = await shell('curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:' + config.ports.ctrl + '/version');
    assert.equal(status.trim(), '401', '无鉴权场景不满足复现条件');
    const oldReady = (await shell(command)).trim() === '1';
    assert.equal(oldReady, false, '真实401被旧命令判断为全部端口就绪');
    return;
  }
  const { buildReadinessCommand, parseReadiness } = state;
  const good = parseReadiness(await shell(buildReadinessCommand(config.ports, config.secret, pid)), config.ports);
  assert.ok(Object.values(good).every(Boolean), '已运行引擎的逐项监听检查未通过');
  const denied = parseReadiness(await shell(buildReadinessCommand(config.ports, '', pid)), config.ports);
  assert.ok(Object.values(denied).every(v => v === false), '401仍被认定为可用');
  const occupied = await shell('netstat -lntu');
  let freePort = 65534;
  while (new RegExp(':' + freePort + '\\s').test(occupied) && freePort > 64000) freePort--;
  assert.ok(freePort > 64000, '没有找到未监听端口');
  for (const key of ['mixed', 'redir', 'tproxy', 'dns']) {
    const ports = { ...config.ports, [key]: freePort };
    const result = parseReadiness(await shell(buildReadinessCommand(ports, config.secret, pid)), ports);
    assert.equal(result.ctrl, true, '测试要求控制接口仍正常');
    assert.equal(result[key], false, key + '未监听仍被判定就绪');
  }
  console.log('通过：真实401拒绝、鉴权200逐项监听、4类未监听端口反例；无配置或网络修改');
}

// 通过 ego-browser 导入并调用 runRegression(taskSpace)，不会加载插件或执行其副作用。
export async function runRegression(taskSpaceFactory, spaceId = 5, withTraffic = false) {
  const source = await fs.readFile(new URL('../src/状态采集.js', import.meta.url), 'utf8');
  const { buildPlugin } = await import('../构建.mjs');
  const bundle = await buildPlugin();
  const variants = [['模块源码', source, 'module'], ['合并脚本', bundle.code, 'script'], ['压缩脚本', bundle.minified, 'script']];
  const commands = [];
  const networks = [];
  for (const [label, code, sourceType] of variants) {
    const tree = parse(code, { ecmaVersion: 2020, sourceType });
    const literals = findNodes(tree, node => (node.type === 'Literal'
      && typeof node.value === 'string' && node.value.includes('echo =N6='))
      || (node.type === 'TemplateElement' && node.value.cooked.includes('echo =N6=')));
    assert.equal(literals.length, 1, label + '的 N6 命令提取不唯一');
    const value = literals[0].type === 'TemplateElement' ? literals[0].value.cooked : literals[0].value;
    const begin = value.indexOf('echo =N6=');
    const end = value.indexOf(');', begin);
    assert.ok(end > begin, label + '的 N6 命令边界无效');
    commands.push({ label, command: value.slice(begin, end + 2) });
    const expressions = findNodes(tree, node => node.type === 'MemberExpression'
      && node.property.name === 'network' && node.object.type === 'MemberExpression'
      && node.object.property.name === 'metadata' && node.object.object.type === 'Identifier');
    assert.ok(expressions.length > 0, label + '未找到连接协议字段');
    networks.push(...expressions.map(node => ({ label, expression: code.slice(node.start, node.end), binding: node.object.object.name })));
  }
  assert.ok(commands.every(item => item.command === commands[0].command), '构建改变了 N6 命令');
  const page = (await taskSpaceFactory(spaceId)).page('p1');
  async function shell(command) {
    return page.evaluate(async ({ command }) => {
      const response = await fetch('/api/run_shell', {
        method: 'POST',
        headers: { ...common_headers, 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ cmd: command, timeout: 10000 })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error('真机采集失败：HTTP ' + response.status);
      return body.content || '';
    }, { command });
  }
  const checks = [];
  try {
    const { generateStartScript } = await import('../src/启动脚本.js');
    const scripts = [];
    for (const s1 of ['off', 'white', 'all']) for (const s2 of [false, true]) {
      for (const logEnabled of [false, true]) for (const lowMem of [false, true]) {
        scripts.push(generateStartScript({ s1, s2, logEnabled, lowMem, ports: { ctrl: 9090 } },
          { V: '2.2.1', DIR: '/data/plugins/customs', LOGF: '/data/plugins/customs/customs.log', BOOT_SH: '/data/plugins/ufi_tools_boot.sh' }));
      }
    }
    const encoded = Buffer.from(scripts.join('\n')).toString('base64');
    const result = await shell(`printf '%s' '${encoded}' | base64 -d | sh -n; R=$?; printf 'SYNTAX=%s\\n' "$R"; busybox | head -n 1`);
    assert.ok(/^SYNTAX=0$/m.test(result), '真机BusyBox未通过生成脚本语法检查');
    checks.push({ check: '真机BusyBox脚本语法', pass: true, combinations: scripts.length,
      version: result.split('\n').find(line => line.startsWith('BusyBox ')) });
  } catch (error) {
    checks.push({ check: '真机BusyBox脚本语法', pass: false, reason: error.message });
  }
  try {
    const output = await shell('echo =EXPECTED=$(ip -6 neigh show | grep -c lladdr);'
      + commands[0].command + 'echo =AFTER=$(ip -6 neigh show | grep -c lladdr);');
    assert.ok(!/awk:/i.test(output), '源码生成的 N6 命令出现 awk 错误');
    const before = Number(output.match(/^=EXPECTED=(\d+)$/m)?.[1]);
    const after = Number(output.match(/^=AFTER=(\d+)$/m)?.[1]);
    assert.ok(before > 0, '真机缺少带 MAC 的 IPv6 邻居，不能验证成功路径');
    assert.equal(before, after, '邻居数量在采样中改变，本轮不能对账');
    const payload = output.match(/^=N6=(.*)$/m)?.[1]?.trim() || '';
    const entries = payload ? payload.split(/\s+/) : [];
    assert.equal(entries.length, before, 'N6 采集数量与真机邻居数量不一致');
    for (const entry of entries) {
      const [ip, mac] = entry.split('~');
      assert.ok(isIP(ip) === 6 && /^(?:[a-f\d]{2}:){5}[a-f\d]{2}$/i.test(mac), 'N6 地址或 MAC 格式错误');
    }
    checks.push({ check: 'IPv6邻居采集', pass: true, entries: entries.length });
  } catch (error) {
    checks.push({ check: 'IPv6邻居采集', pass: false, reason: error.message });
  }
  try {
    const traffic = withTraffic ? `M=$(jsonfilter -i "$D/config.json" -e '@.ports.mixed'); case "$M" in ''|*[!0-9]*) exit 1;; esac; curl -fsS -m 8 --limit-rate 2k -x "http://127.0.0.1:$M" 'https://speed.cloudflare.com/__down?bytes=8192' -o /dev/null 2>/dev/null & T=$!; trap 'kill "$T" 2>/dev/null || :' EXIT; sleep 1; ` : '';
    const output = await shell(`D=/data/plugins/customs; P=$(jsonfilter -i "$D/config.json" -e '@.ports.ctrl'); S=$(jsonfilter -i "$D/config.json" -e '@.secret'); case "$P" in ''|*[!0-9]*) exit 1;; esac; ${traffic}curl -fsS -m 5 -H "Authorization: Bearer $S" "http://127.0.0.1:$P/connections"${withTraffic ? '; wait "$T"; R=$?; trap - EXIT; [ "$R" = 0 ] || { echo "测试HTTPS请求未通过"; exit 1; }' : ''}`);
    const { connections } = JSON.parse(output);
    assert.ok(Array.isArray(connections) && connections.length > 0, '真机无活动连接，不能验证协议字段');
    let mismatches = 0;
    for (const c of connections) {
      assert.ok(['tcp', 'udp'].includes(c.metadata?.network), '真机连接协议字段不符合已核实格式');
      for (const { expression, binding } of networks) {
        const actual = vm.runInNewContext(expression, { [binding]: c }, { timeout: 1000 });
        if (actual !== c.metadata.network) mismatches++;
      }
    }
    assert.equal(mismatches, 0, '源码读取的协议与真实连接 metadata.network 不一致');
    checks.push({ check: '连接协议字段', pass: true, connections: connections.length,
      udpConnections: connections.filter(c => c.metadata.network === 'udp').length,
      coverage: '仅核验实际响应字段，不等于节点UDP转发验证' });
  } catch (error) {
    checks.push({ check: '连接协议字段', pass: false, reason: error.message });
  }
  console.log(JSON.stringify({ variants: variants.map(v => v[0]), checks }, null, 2));
  assert.ok(checks.every(check => check.pass), '运行状态采集回归未通过');
}
