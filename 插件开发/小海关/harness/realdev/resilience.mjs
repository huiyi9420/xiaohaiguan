/* ============================================================================
 * resilience.mjs — 小海关真机测试套件抗断线基础座
 * ----------------------------------------------------------------------------
 * 运行环境: ego-browser nodejs(浏览器脚本运行时,提供 taskSpace/page 全局,页面内
 *   提供 common_headers 全局)。本文件只做纯函数 / 文件落盘 / 重试 / 状态机,
 *   不触碰任何设备状态。
 *
 * 能力:
 *   a) shellViaPanel(page, cmd, timeout)  —— 页面 fetch /api/run_shell
 *      (common_headers + same-origin,与 harness/真机只读核验.mjs 同形态),失败重试
 *      最多 5 次,指数退避 1s/2s/4s/8s/16s;每次失败标记 network-flap 并落日志。
 *   b) ensurePage(task, label) —— 页面失活时 goto 面板 URL 重连(有界重试)。
 *   c) 阶段状态机 —— state 文件 harness/artifacts/realdev-state.json,每步完成即写盘
 *      (phase/step/status/timestamp/lastError),断线重跑从未完成步续跑(幂等)。
 *   d) 命令输出追加落盘 harness/artifacts/realdev-log-<stamp>.ndjson(脱敏)。
 *
 * 凭据纪律: secret 只活在 phase 脚本内存,永不写 state/log/report;redact() 兜底抹掉
 *   Bearer 与长随机串、IPv4/IPv6。
 * ==========================================================================*/
const fs = await import('node:fs/promises');
const path = await import('node:path');
const { fileURLToPath, pathToFileURL } = await import('node:url');

/* 目录解析: 优先 import.meta.url(以文件方式运行时),退化到仓库绝对路径(heredoc 运行时) */
function resolveHere() {
  try {
    if (import.meta.url && import.meta.url.startsWith('file://')) return path.dirname(fileURLToPath(import.meta.url));
  } catch (e) { /* ignore */ }
  return '/Users/zhaolulu/Projects/U60Pro-zwrt/插件开发/小海关/harness/realdev';
}
const __dirname = resolveHere();
const HARNESS_DIR = path.resolve(__dirname, '..');                 // realdev/.. = harness
const ARTIFACTS = path.join(HARNESS_DIR, 'artifacts');
const STATE_FILE = path.join(ARTIFACTS, 'realdev-state.json');

/* 面板与插件数据目录(与 插件.js 常量一致) */
export const PANEL_URL = 'http://192.168.0.1:2333';
export const DIR = '/data/plugins/customs';
export const BIN = DIR + '/mihomo';
export const CFG = DIR + '/config.yaml';
export const CJ = DIR + '/config.json';
export const FW = DIR + '/fw.sh';

export const wait = ms => new Promise(r => setTimeout(r, ms));
export function stamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

/* ================= 工具: 脱敏 ================= */
const SECRET_RE = [
  [/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/-]{8,}/gi, '$1***'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}/gi, 'Bearer ***'],
  [/(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+(?:\/\d+)?/gi, '<IPv6>'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d+)?\b/g, '<IPv4>'],
];
export function redact(text, secrets = []) {
  let out = String(text == null ? '' : text);
  for (const s of (secrets || [])) { if (s && String(s).length >= 8) out = out.split(String(s)).join('***'); }
  for (const [re, rep] of SECRET_RE) out = out.replace(re, rep);
  return out;
}

/* ================= 阶段状态机 ================= */
let STATE = null;
let LOGFILE = null;
let SECRETS = [];

export async function initArtifacts(phase, opts = {}) {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  if (!STATE) {
    try { STATE = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); }
    catch (e) { STATE = {}; }
    if (typeof STATE !== 'object' || !STATE) STATE = {};
    if (!STATE.steps || typeof STATE.steps !== 'object') STATE.steps = {};
  }
  if (phase) STATE.phase = phase;
  if (!STATE.logFile) STATE.logFile = path.join(ARTIFACTS, 'realdev-log-' + stamp() + '.ndjson');
  LOGFILE = STATE.logFile;
  if (opts.secrets) SECRETS = Array.isArray(opts.secrets) ? opts.secrets : [opts.secrets];
  await saveState();
  return STATE;
}

export function getState() { return STATE; }
export function setSecrets(s) { SECRETS = Array.isArray(s) ? s : [s]; }
export function getLogFile() { return LOGFILE; }

export async function saveState() {
  if (!STATE) return;
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const tmp = STATE_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(STATE, null, 2) + '\n');
  await fs.rename(tmp, STATE_FILE);
}

export function isDone(phase, step) {
  if (!STATE) return false;
  const r = STATE.steps[phase + '::' + step];
  return !!(r && r.status === 'done');
}

export async function markStep(phase, step, status, lastError = '') {
  if (!STATE) await initArtifacts(phase);
  STATE.phase = phase;
  STATE.steps[phase + '::' + step] = {
    phase, step, status,
    timestamp: new Date().toISOString(),
    lastError: redact(lastError, SECRETS),
  };
  await saveState();
}

/* ================= NDJSON 日志(命令输出追加落盘,脱敏) ================= */
let logChain = Promise.resolve();
export function logLine(entry, secrets = SECRETS) {
  logChain = logChain.then(async () => {
    try {
      if (!LOGFILE) await initArtifacts('');
      const line = redact(JSON.stringify({ ts: new Date().toISOString(), ...(entry || {}) }), secrets) + '\n';
      await fs.mkdir(ARTIFACTS, { recursive: true });
      await fs.appendFile(LOGFILE, line);
    } catch (e) { /* 日志失败不中断主流程 */ }
  });
  return logChain;
}

export async function appendNdjson(file, entry, secrets = SECRETS) {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const p = path.join(ARTIFACTS, file);
  await fs.appendFile(p, redact(JSON.stringify({ ts: new Date().toISOString(), ...(entry || {}) }), secrets) + '\n');
  return p;
}

/* ================= 抗断线 shell 通道 ================= */
/* 经页面 fetch /api/run_shell;失败重试最多 maxRetry(默认5)次,指数退避 1s/2s/4s/8s/16s;
   每次失败标记 network-flap。返回 {ok, content, flapped, attempts, recoveryMs, err}。 */
export async function shellViaPanel(page, cmd, timeout = 25000, opts = {}) {
  const t0 = Date.now();
  let flapped = 0, lastErr = '';
  const maxRetry = (opts.maxRetry && opts.maxRetry > 0) ? opts.maxRetry : 5;
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const res = await page.evaluate(async ({ cmd, timeout }) => {
        try {
          const headers = {};
          if (typeof common_headers !== 'undefined' && common_headers) Object.assign(headers, common_headers);
          headers['Content-Type'] = 'application/json';
          const response = await fetch('/api/run_shell', {
            method: 'POST', headers, credentials: 'same-origin',
            body: JSON.stringify({ cmd, timeout }),
          });
          let body = null;
          try { body = await response.json(); } catch (e) { body = null; }
          if (!response.ok || !(body && body.success)) {
            return { ok: false, err: 'HTTP ' + response.status + ' success=' + String(body && body.success) + ' ' + String((body && body.content) || '').slice(0, 200) };
          }
          return { ok: true, content: (body && body.content) || '' };
        } catch (e) {
          return { ok: false, err: 'fetch异常: ' + String((e && e.message) || e) };
        }
      }, { cmd, timeout });
      if (res && res.ok) {
        return { ok: true, content: res.content, flapped, attempts: attempt, recoveryMs: Date.now() - t0, err: '' };
      }
      lastErr = (res && res.err) || '空结果';
    } catch (e) {
      lastErr = 'page.evaluate异常: ' + String((e && e.message) || e);
    }
    flapped++;
    await logLine({ evt: 'network-flap', cmd: (cmd || '').slice(0, 120), attempt, backoff: 1000 * Math.pow(2, attempt - 1), err: lastErr });
    if (attempt < maxRetry) await wait(1000 * Math.pow(2, attempt - 1));
  }
  return { ok: false, content: '', flapped, attempts: maxRetry, recoveryMs: Date.now() - t0, err: lastErr };
}

/* shellViaPanel + 自动落日志(命令与输出均脱敏) */
export async function shellCmd(page, cmd, opts = {}) {
  const timeout = opts.timeout || 25000;
  const secrets = opts.secrets || SECRETS;
  const r = await shellViaPanel(page, cmd, timeout, opts);
  await logLine({ evt: 'cmd', label: opts.label || '', ok: r.ok, flapped: r.flapped, attempts: r.attempts, cmd: (cmd || '').slice(0, 300), content: r.content || '' }, secrets);
  return r;
}

/* ================= 页面失活重建 ================= */
export async function ensurePage(task, label = 'p1', opts = {}) {
  const page = task.page(label);
  const panel = opts.panel || PANEL_URL;
  let need = false;
  try {
    const url = (await page.url()) || '';
    if (!/^https?:\/\//.test(url)) need = true;
    else { try { await page.evaluate(() => document.readyState); } catch (e) { need = true; } }
  } catch (e) { need = true; }
  if (need) await reconnect(page, panel, opts);
  return page;
}

export async function reconnect(page, panel = PANEL_URL, opts = {}) {
  const maxTries = (opts.reconnectTries && opts.reconnectTries > 0) ? opts.reconnectTries : 5;
  let lastErr = '';
  for (let i = 1; i <= maxTries; i++) {
    try {
      await page.goto(panel, { waitUntil: 'load', timeout: 30000 });
      await wait(500);
      return page;
    } catch (e) {
      lastErr = String((e && e.message) || e);
      await logLine({ evt: 'reconnect-fail', attempt: i, err: lastErr });
      if (i < maxTries) await wait(2000 * i);
    }
  }
  throw new Error('面板重连失败(' + maxTries + '次): ' + lastErr);
}

/* 取 taskSpace(支持按名创建/按数字 id 续跑) */
export async function getTask(space) {
  const v = space || process.env.HS_SPACE || process.env.HS_SPACE_ID || '';
  const name = process.env.HS_SPACE_NAME || '小海关真机套件';
  if (v) return await taskSpace(/^\d+$/.test(v) ? Number(v) : v);
  return await taskSpace(name);
}

/* ================= 参数解析 ================= */
export function parseDur(v) {
  const s = String(v == null ? '' : v).trim();
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2] || 'ms';
  return Math.round(n * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[u]));
}

export function parseArgs(argv = process.argv) {
  const args = { confirm: false, interval: 300000, duration: 86400000, panel: PANEL_URL, space: '', label: 'p1' };
  // 全 argv 扫描(不假定 argv[0]/argv[1] 是 node/script——ego-browser 的 argv 布局未知,
  // 且 heredoc/-e 模式下参数只能靠环境变量)
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === '--confirm') args.confirm = true;
    else if (a === '--interval') { const d = parseDur(list[++i]); if (d != null) args.interval = d; }
    else if (a === '--duration') { const d = parseDur(list[++i]); if (d != null) args.duration = d; }
    else if (a === '--panel') { if (list[i + 1]) args.panel = list[++i]; }
    else if (a === '--space') { if (list[i + 1]) args.space = list[++i]; }
    else if (a === '--label') { if (list[i + 1]) args.label = list[++i]; }
  }
  if (process.env.HS_CONFIRM === '1') args.confirm = true;
  if (process.env.HS_INTERVAL) { const d = parseDur(process.env.HS_INTERVAL); if (d != null) args.interval = d; }
  if (process.env.HS_DURATION) { const d = parseDur(process.env.HS_DURATION); if (d != null) args.duration = d; }
  if (process.env.HS_PANEL) args.panel = process.env.HS_PANEL;
  if (process.env.HS_SPACE || process.env.HS_SPACE_ID) args.space = process.env.HS_SPACE || process.env.HS_SPACE_ID;
  if (process.env.HS_LABEL) args.label = process.env.HS_LABEL;
  return args;
}

/* ================= 报告落盘 ================= */
export async function writeReport(basename, payload) {
  await fs.mkdir(ARTIFACTS, { recursive: true });
  const file = path.join(ARTIFACTS, basename + '-' + stamp() + '.json');
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

/* ================= 引擎进程所有权(F15 同源形态,内联) ================= */
export const ownEnginePidsCmd = () =>
  'PIDS=""; for P in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$P/exe 2>/dev/null)" = ' + BIN + ' ] && PIDS="$PIDS $P"; done; echo =PID=$PIDS';

/* ============================================================================
 * 与 src/状态采集.js 同源内联(为避免 ego-browser 对本地相对 import 的解析不确定而
 * 内联;改动 src/状态采集.js 时须同步此处)。shq 亦同源自 src/工具.js。
 * ==========================================================================*/
export const shq = t => "'" + String(t).replace(/'/g, "'\\''") + "'";

export function buildReadinessCommand(ports, secret, pid) {
  for (const key of ['mixed', 'redir', 'tproxy', 'dns', 'ctrl']) {
    if (!Number.isInteger(ports[key]) || ports[key] < 1 || ports[key] > 65535) throw new TypeError('监听端口无效：' + key);
  }
  if (typeof secret !== 'string' || (secret && !/^[A-Za-z0-9_-]{8,64}$/.test(secret))) throw new TypeError('控制接口密钥格式无效');
  if (!/^\d+(?:\s+\d+)*$/.test(String(pid).trim())) throw new TypeError('引擎进程编号无效');
  return 'HS_PIDS=""; for HS_P in ' + String(pid).trim() + '; do '
    + '[ "$(readlink /proc/$HS_P/exe)" = /data/plugins/customs/mihomo ] && HS_PIDS="$HS_PIDS $HS_P"; done; '
    + 'HS_NS=$(netstat -lntup 2>/dev/null) || exit 1; '
    + 'printf "%s\\n" "$HS_NS" | awk -v pids="$HS_PIDS" '
    + shq('($1=="tcp" || $1=="tcp6" || $1=="udp" || $1=="udp6") {split($NF,owner,"/"); if(index(" " pids " "," " owner[1] " ")==0 || owner[1]=="") next; port=$4; sub(/^.*:/,"",port); printf "=%s=%s\\n", substr($1,1,3),port}')
    + '; echo =SOCKETS=1; HS_HTTP=$(curl -s -m 3 -o /dev/null -w "%{http_code}" -H '
    + shq('Authorization: Bearer ' + secret) + ' http://127.0.0.1:' + ports.ctrl
    + '/version 2>/dev/null); HS_RC=$?; printf "=HTTP=%s\\n=EXIT=%s\\n" "$HS_HTTP" "$HS_RC"';
}

export function parseReadiness(output, ports) {
  const tcp = new Set(), udp = new Set();
  let sockets = false, http = '', exit = '';
  for (const line of String(output).split('\n')) {
    const match = /^=(tcp|udp|SOCKETS|HTTP|EXIT)=(\d+)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'tcp') tcp.add(Number(value));
    else if (key === 'udp') udp.add(Number(value));
    else if (key === 'SOCKETS') sockets = value === '1';
    else if (key === 'HTTP') http = value;
    else exit = value;
  }
  if (!sockets || !http || !exit) throw new Error('监听状态采集不完整');
  const ctrl = http === '200' && exit === '0' && tcp.has(ports.ctrl);
  return {
    mixed: ctrl && tcp.has(ports.mixed),
    redir: ctrl && tcp.has(ports.redir),
    tproxy: ctrl && tcp.has(ports.tproxy) && udp.has(ports.tproxy),
    dns: ctrl && tcp.has(ports.dns) && udp.has(ports.dns),
    ctrl,
  };
}

export const N6_COMMAND = 'echo =N6=$(ip -6 neigh show 2>/dev/null | grep lladdr | awk \'{printf "%s~%s ", $1, $5}\');';
