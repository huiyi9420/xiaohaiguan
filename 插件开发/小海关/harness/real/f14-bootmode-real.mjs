#!/usr/bin/env node
/* ============================================================================
 * F14 bootMode 启动语义与 start.sh 探活就绪判定（红灯先行→修复→全绿）
 * ----------------------------------------------------------------------------
 * 缺陷：a) src/启动脚本.js takeover 计算未消费 C.bootMode（keep/core 生成相同
 *   start.sh，"只起引擎"语义不成立——核验 S01 红灯）；b) 后台探活 curl 无鉴权头
 *   且不看 HTTP 状态码（401 也算就绪，F01 同型残留）。
 * 修复：takeover = (C.s1!=='off'||C.s2) && C.bootMode!=='core'；探活升级为
 *   -H 'Authorization: Bearer <secret>' + -w %{http_code} 仅 200 算就绪
 *   （secret 与端口同源自 C.secret 经 generateStartScript 注入）。
 *
 * 夹具（真实容器）：真 mihomo v1.19.32（生产固定路径）按手写最小合法 config.yaml
 *   （secret=f14sec, 端口 27921-27924, MATCH,DIRECT）启动；观察型 fw.sh（真实被
 *   start.sh 编排调用，每次调用落标记 $D/fw.calls）；面板哨兵 lighttpd:2333 返回
 *   含 __customs_loaded（面板在场生产路径）；generateStartScript 为 src 模块现行
 *   导入（红灯轮=修复前行为，绿灯轮=修复后）。
 *   R1/S01 红灯：keep 与 core 生成相同 start.sh（takeover 位相同）
 *   RD2 红灯：core 模式 start.sh 执行后 fw.sh apply 被调用（"只起引擎"仍挂载）
 *   RD3 红灯：错误 secret 下探活仍判就绪并挂载（401 算就绪）
 *   G1 core→引擎启动+fw.sh apply 零调用；G2 keep+正确 secret→探活 200 后挂载；
 *   G3 keep+错误 secret→有界等待后不挂载+customs.log 落"引擎未就绪,跳过规则挂载"
 * 退出码：0=全过；1=有失败。
 * ==========================================================================*/
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RealEnv, ensureHostAsset, MIHOMO_DIR, MIHOMO_BIN } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log((ok ? '✅ PASS' : '❌ FAIL') + '  ' + name + (detail ? '（' + detail + '）' : ''));
}
const SEC = 'f14sec';
const PORTS = { ctrl: 27921, mixed: 27922, redir: 27923, dns: 27924 };
const CFG_MIN = ['mode: rule', 'log-level: warning', 'ipv6: false',
  `mixed-port: ${PORTS.mixed}`, `redir-port: ${PORTS.redir}`,
  `external-controller: 127.0.0.1:${PORTS.ctrl}`, `secret: "${SEC}"`,
  'dns:', '  enable: true', `  listen: 127.0.0.1:${PORTS.dns}`,
  '  enhanced-mode: redir-host', '  nameserver:', '    - 223.5.5.5',
  'rules:', '  - MATCH,DIRECT'].join('\n') + '\n';

let env = null;
let mvm14dbg = "";
try {
  const { generateStartScript } = await import(pathToFileURL(path.resolve(HERE, '..', '..', 'src', '启动脚本.js')).href);
  const mkStart = (bootMode, secret) => generateStartScript(
    { s1: 'all', s2: false, logEnabled: false, lowMem: false, bootMode, ports: PORTS },
    { V: '9.9.9', DIR: MIHOMO_DIR, LOGF: MIHOMO_DIR + '/customs.log', BOOT_SH: MIHOMO_DIR + '/ufi_tools_boot.sh', secret });

  /* ---------- R1/S01：keep 与 core 产物必须不同 ---------- */
  const keepSh = mkStart('keep', SEC), coreSh = mkStart('core', SEC);
  const tk = (t) => ((t.match(/HS_TAKEOVER=(\d)/) || [])[1] || '?');
  check('R1/S01 keep 与 core 生成不同 start.sh（takeover 位不同：keep=1/core=0）',
    keepSh !== coreSh && tk(keepSh) === '1' && tk(coreSh) === '0',
    `产物相同=${keepSh === coreSh} takeover(keep/core)=${tk(keepSh)}/${tk(coreSh)}`);

  env = new RealEnv();
  await env.start();
  const asset = await ensureHostAsset(m => console.log('[f14] ' + m));
  await env.prepareBinary(asset.path);
  await env.installTools();

  /* 面板哨兵源（start.sh 头部 curl 面板 2333，返回带 __customs_loaded 防自删/24s 空等） */
  await env.exec('mkdir -p /tmp/f14/panel/api');
  await env.exec('printf "__customs_loaded f14-panel-present" > /tmp/f14/panel/api/get_custom_head');
  await env.writeContainerFile('/tmp/f14/panel.conf', [
    'server.modules = ( "mod_accesslog" )', 'server.port = 2333', 'server.bind = "127.0.0.1"',
    'server.document-root = "/tmp/f14/panel"', 'accesslog.filename = "/tmp/f14/pa.log"',
    'server.errorlog = "/tmp/f14/pe.log"', 'server.pid-file = "/tmp/f14/panel.pid"', ''
  ].join('\n'));
  await env.exec('nohup lighttpd -D -f /tmp/f14/panel.conf >/dev/null 2>&1 & sleep 0.6; curl -s http://127.0.0.1:2333/api/get_custom_head');

  /* 引擎配置(真 secret) + 观察型 fw.sh(被 start.sh 真实编排,每次调用落标记) */
  await env.writeContainerFile(MIHOMO_DIR + '/config.yaml', CFG_MIN);
  const tOk = await env.exec(MIHOMO_BIN + ' -t -d ' + MIHOMO_DIR + ' 2>&1 | tail -1');
  check('夹具就绪：最小 config.yaml 通过真实 mihomo -t', /successful/i.test(tOk.out), tOk.out.trim().slice(0, 50));
  await env.writeContainerFile(MIHOMO_DIR + '/fw.sh', '#!/bin/sh\necho "$1 $(date +%s)" >> ' + MIHOMO_DIR + '/fw.calls\nexit 0\n'); /* 宿主写入零转义:printf 内嵌 $1 会被外层 shell 展开为空,标记丢失 */
  await env.exec('chmod 755 ' + MIHOMO_DIR + '/fw.sh; sh ' + MIHOMO_DIR + '/fw.sh probe; cat ' + MIHOMO_DIR + '/fw.calls; rm -f ' + MIHOMO_DIR + '/fw.calls');

  const fwApplied = async () => (await env.exec('grep -c apply ' + MIHOMO_DIR + '/fw.calls 2>/dev/null')).out.trim();
  const notReady = async () => (await env.exec('grep -c "引擎未就绪" ' + MIHOMO_DIR + '/customs.log 2>/dev/null')).out.trim();
  /* 执行一轮 start.sh 并等探活窗口(最长~26s)收敛 */
  const runBoot = async (bootMode, secret) => {
    await env.exec('for P in $(pidof mihomo); do kill $P; done 2>/dev/null; I=0; while [ $I -lt 12 ] && pidof mihomo >/dev/null; do sleep 0.5; I=$((I+1)); done; pidof mihomo && { for P in $(pidof mihomo); do kill -9 $P; done; sleep 0.5; }; rm -f ' + MIHOMO_DIR + '/fw.calls ' + MIHOMO_DIR + '/customs.log; echo KILLED', 15000); /* 死透确认:start.sh 有 already-running 短路,残留旧引擎会令整轮用例串假 */
    await env.writeContainerFile(MIHOMO_DIR + '/start.sh', mkStart(bootMode, secret));
    /* 探活子堂存活依赖会话首(exec sh)在场:真机 run_shell 常驻;docker exec 退出时会话首亡→
       子堂收 SIGHUP(setsid 反使 start.sh 成会话首,其退出同样 HUP 子堂)。故不用 setsid,
       让 exec 会话挂满探活窗口(~26s),与 debug 容器手动验证一致 */
    const bootR = await env.exec('chmod 755 ' + MIHOMO_DIR + '/start.sh; sh ' + MIHOMO_DIR + '/start.sh >/tmp/f14/boot.out 2>&1 </dev/null & sleep 26; echo BOOTDONE', 38000);
    mvm14dbg = (bootR.out || '').trim();
    const t0 = Date.now();
    while (Date.now() - t0 < 32000) {
      await new Promise(r => setTimeout(r, 1500));
      const pid = (await env.exec('pidof mihomo')).out.trim();
      const applied = await fwApplied(), nr = await notReady();
      if (pid && (Number(applied) > 0 || Number(nr) > 0 || Date.now() - t0 > 26000)) break;
    }
    return {
      pid: (await env.exec('pidof mihomo')).out.trim(),
      applied: Number(await fwApplied()) || 0,
      notReady: Number(await notReady()) || 0,
      dbg: (await env.exec('tail -3 /tmp/f14/boot.out 2>/dev/null; cat ' + MIHOMO_DIR + '/fw.calls 2>/dev/null')).out.trim().slice(0, 120)
    };
  };

  /* ---------- RD3/G3：错误 secret 的探活判定（红灯=401 算就绪仍挂载） ---------- */
  {
    const r = await runBoot('keep', 'WRONG-secret-f14');
    check('G3 keep+错误 secret → 探活不判就绪：不挂载 + customs.log 落"引擎未就绪,跳过规则挂载"',
      !!r.pid && r.applied === 0 && r.notReady > 0,
      `引擎pid=${r.pid ? "有" : "无"} apply=${r.applied} 未就绪=${r.notReady} 诊断=${r.dbg}`);
  }
  /* ---------- RD2/G1：core 模式"只起引擎"不挂载 ---------- */
  {
    const r = await runBoot('core', SEC);
    check('G1 core → 引擎启动但 fw.sh apply 零调用（只起引擎不接管）',
      !!r.pid && r.applied === 0,
      `引擎pid=${r.pid ? "有" : "无"} apply=${r.applied} 诊断=${r.dbg}`);
  }
  /* ---------- G2：keep+正确 secret → 探活 200 后挂载 ---------- */
  {
    const r = await runBoot('keep', SEC);
    check('G2 keep+正确 secret → 探活 200 后挂载（fw.sh apply 被调用）',
      !!r.pid && r.applied > 0,
      `引擎pid=${r.pid ? "有" : "无"} apply=${r.applied} 诊断=${r.dbg}`);
  }

  await env.exec('for P in $(pidof mihomo); do kill $P; done 2>/dev/null; kill $(cat /tmp/f14/panel.pid) 2>/dev/null; true').catch(() => { });
  const evd = await env.destroy();
  check('收尾：容器仅经 TERM 释放、无 blocked', !!(evd.container && evd.container.removed && !(evd.blockedReasons || []).length),
    JSON.stringify(evd.container || {}).slice(0, 120));
} catch (e) {
  check('探针自身异常（计为失败）', false, String((e && e.message) || e).slice(0, 200));
  if (env) { try { await env.destroy(); } catch (e2) { console.log('[f14] 异常路径 destroy 失败:', e2.message); } }
}

const bad = results.filter(x => !x.ok);
fs.mkdirSync(path.join(HERE, '..', 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(HERE, '..', 'artifacts', 'F14bootmode真实校验-' + new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14) + '.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results, summary: { pass: results.length - bad.length, fail: bad.length } }, null, 2) + '\n');
console.log(bad.length ? `\n${bad.length} 项未通过` : '\nF14 bootmode 真实校验全部通过');
process.exit(bad.length ? 1 : 0);
