/* ============================================================================
 * F01 真实隔离集成测试基础座（runner）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 宿主侧下载官方 Mihomo v1.19.32 linux/arm64 并核验 SHA-256（.build/real-cache 缓存）；
 *   2. 以非特权、默认桥接网络、无宿主 socket 挂载的 alpine 容器作为隔离环境；
 *   3. 容器内以生产固定路径 /data/plugins/customs/mihomo 落位并启动真实引擎；
 *   4. 提供 exec()（docker exec sh -c，命令不经宿主 shell 解释）与
 *      run_shell HTTP 桥（仅回环 + 令牌 + 限时限量，命令真实交容器执行）；
 *   5. TERM 优雅清理并复查端口释放（禁止 kill -9）。
 *
 * 边界（来自真实测试合同，违反即合同失效）：
 *   - 不伪造任何业务成功：组件缺失/校验失败/权限不足一律抛错或返回 blocked；
 *   - 宿主不写 /data；secret 与桥令牌只存在于内存，报告输出前一律脱敏；
 *   - 只创建/清理本测试唯一命名（hs-f01-real-<stamp>）的容器与容器内资源。
 * ==========================================================================*/
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
export const HARNESS_REAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HARNESS_REAL_DIR, '..', '..'); // 插件开发/小海关

/* 官方固定资产（2026-10-03 经 GitHub expanded_assets 页面交叉核实，与合同摘要一致） */
export const MIHOMO_VERSION = 'v1.19.32';
export const MIHOMO_ASSET = `mihomo-linux-arm64-${MIHOMO_VERSION}.gz`;
export const MIHOMO_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/${MIHOMO_ASSET}`;
export const MIHOMO_SHA256 = '9dd862e28b46ff7d775f169cceebc28deccaa0a9e804237d421cd2571e0caba0';

export const MIHOMO_DIR = '/data/plugins/customs';          // 生产固定数据目录（仅容器内）
export const MIHOMO_BIN = MIHOMO_DIR + '/mihomo';           // 生产 readiness 校验的精确可执行路径

export function maskSecrets(text, secrets) {
  let s = String(text);
  for (const sec of secrets) if (sec) s = s.split(sec).join('***');
  return s.replace(/(Bearer\s+)[A-Za-z0-9_-]{8,64}/g, '$1***');
}

export function genSecret() {
  /* 生产 buildReadinessCommand 约束 [A-Za-z0-9_-]{8,64} */
  return crypto.randomBytes(18).toString('base64url');
}

/* 报告持久化前递归脱敏：原文/base64/URI 编码形式一并替换为 ***；检测只记数量不记内容 */
export function buildRedactNeedles(secrets) {
  const list = [];
  for (const s of secrets || []) {
    if (!s) continue;
    const b64 = Buffer.from(s, 'utf8').toString('base64');
    const uri = encodeURIComponent(s);
    list.push({ raw: s, b64: b64.length >= 8 ? b64 : null, uri: uri.length >= 8 ? uri : null });
  }
  return list;
}
export function deepRedact(value, needles) {
  if (typeof value === 'string') {
    let s = value;
    for (const nd of needles) {
      if (nd.raw) s = s.split(nd.raw).join('***');
      if (nd.b64) s = s.split(nd.b64).join('***');
      if (nd.uri) s = s.split(nd.uri).join('***');
    }
    return s;
  }
  if (Array.isArray(value)) return value.map(v => deepRedact(v, needles));
  if (value && typeof value === 'object') {
    const o = {};
    for (const k of Object.keys(value)) o[k] = deepRedact(value[k], needles);
    return o;
  }
  return value;
}

/* shell 单引号安全包裹（与 src/工具.js shq 同语义，本文件自持避免依赖生产源码） */
const sq = s => "'" + String(s).replace(/'/g, "'\\''") + "'";

async function dockerInfo() {
  let stdout;
  try {
    ({ stdout } = await execFileP('docker', ['info', '--format', '{{.ServerVersion}}|{{.OperatingSystem}}|{{.Architecture}}'], { timeout: 20000 }));
  } catch (e) {
    throw new Error(`Docker 不可用（有界超时 20s，不降级不重试）：${e.killed ? '超时' : String(e.message).slice(0, 160)}`);
  }
  const [server, os, arch] = stdout.trim().split('|');
  if (!server) throw new Error('Docker info 返回异常，环境前置失败');
  return { server, os, arch };
}

/* ---------------- 宿主侧资产：下载 + SHA-256 ---------------- */
export async function ensureHostAsset(log = () => { }) {
  /* 故障注入钩子（只收紧不放宽：令资产校验直接失败），用于验证致命路径的机器记录与非零退出 */
  if (process.env.HS_F01_FORCE_ASSET_FAIL === '1') throw new Error('资产校验失败（HS_F01_FORCE_ASSET_FAIL 测试钩子注入，非真实校验结果）');
  const cacheDir = path.join(PLUGIN_ROOT, '.build', 'real-cache');
  await fsp.mkdir(cacheDir, { recursive: true });
  const gz = path.join(cacheDir, MIHOMO_ASSET);
  const sha = async file => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');
  try {
    if (await sha(gz) === MIHOMO_SHA256) {
      const st = await fsp.stat(gz);
      log(`资产命中缓存 ${MIHOMO_ASSET}（${st.size} 字节，SHA-256 复核一致）`);
      return { path: gz, bytes: st.size, sha256: MIHOMO_SHA256, downloaded: false };
    }
  } catch (e) { /* 无缓存，走下载 */ }
  log(`开始下载官方 ${MIHOMO_URL}`);
  const res = await fetch(MIHOMO_URL, { signal: AbortSignal.timeout(300000), redirect: 'follow' });
  if (!res.ok) throw new Error(`官方资产下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== MIHOMO_SHA256) throw new Error(`宿主侧 SHA-256 不符：期望 ${MIHOMO_SHA256} 实得 ${got}`);
  await fsp.writeFile(gz + '.part', buf);
  await fsp.rename(gz + '.part', gz);
  log(`下载完成 ${buf.length} 字节，SHA-256 核验通过`);
  return { path: gz, bytes: buf.length, sha256: got, downloaded: true };
}

/* ---------------- 隔离环境（单容器） ---------------- */
export class RealEnv {
  constructor(opts = {}) {
    this.stamp = opts.stamp || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    /* 资源所有权三要素：随机唯一名 + 本轮创建标记 + 实际容器 ID；重名时立即失败并保留，绝不触碰 */
    this.runTag = `${this.stamp}-${crypto.randomBytes(4).toString('hex')}`;
    this.name = opts.name || `hs-f01-real-${this.runTag}`;
    this.created = false;
    this.containerId = null;
    this.ports = Object.assign({
      ctrl: 29090, mixed: 27890, redir: 27892, tproxy: 27893, dns: 21053,
      httpd: 28080, dummyTcp: 28181, dummyUdp: 28182
    }, opts.ports || {});
    this.secret = opts.secret || genSecret();
    this.secrets = [this.secret];
    this.children = [];        // 容器内本测试启动的进程登记 [{kind,pid,port}]
    this.imageRef = null;      // 实际使用的镜像引用（digest 优先）
    this.imageMeta = {};
    this.containerMeta = {};
    this.bridgePathPrefix = '';// UI 故障注入：容器内 PATH 前缀（如 /tmp/hsbroken:）
    this.bridgeLog = [];       // run_shell 桥命令日志（脱敏后）
    this._bridgeServer = null;
    this._bridgeToken = opts.bridgeToken || crypto.randomBytes(24).toString('base64url');
    this._bridgeSeq = 0;
    this._bridgeActive = new Set(); /* 桥命令生存期跟踪：命令跟踪对象集合（含 pid/out/err/rc 四件套路径与组状态） */
    this._bridgeClosed = false;    /* 关门标记：stopBridge 先拒绝新请求再处理在途 */
  }

  log(msg) { console.log('[real-runner] ' + msg); }

  async exec(cmd, timeoutMs = 20000) {
    /* 命令一律经 argv 传给 docker（不经宿主 shell），在容器内 sh -c 执行。
       引用实际容器 ID（非名字）消除同名替换竞态；未创建/未启动一律拒绝 */
    if (!this.containerId) return { code: -1, out: '', err: '容器非本轮创建/未启动，拒绝执行 shell' };
    const args = ['exec', this.containerId, 'sh', '-c', this.bridgePathPrefix ? `PATH=${this.bridgePathPrefix}$PATH; ${cmd}` : cmd];
    try {
      const { stdout, stderr } = await execFileP('docker', args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
      return { code: 0, out: stdout, err: stderr };
    } catch (e) {
      return { code: typeof e.code === 'number' ? e.code : 1, out: e.stdout || '', err: (e.stderr || '') + (e.killed ? '\n[超时被终止]' : '') };
    }
  }

  async mustExec(cmd, timeoutMs = 20000, what = '') {
    const r = await this.exec(cmd, timeoutMs);
    if (r.code !== 0) throw new Error(`${what || '容器命令'}失败(code=${r.code})：${maskSecrets(r.err || r.out, this.secrets).slice(0, 400)}`);
    return r.out;
  }

  async writeContainerFile(file, content) {
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    await this.mustExec(`printf %s '${b64}' | base64 -d > '${file}'`, 15000, '写容器文件 ' + file);
    const back = await this.exec(`wc -c < '${file}'`);
    if (parseInt(back.out) !== Buffer.byteLength(content, 'utf8')) throw new Error('容器文件落盘字节数不符: ' + file);
  }

  /* --- 阶段 0：前置检查 + 容器创建 --- */
  async start() {
    this.docker = await dockerInfo();
    this.log(`Docker 就绪 server=${this.docker.server} os=${this.docker.os} arch=${this.docker.arch}`);

    let ins;
    try {
      ins = await execFileP('docker', ['image', 'inspect', 'alpine:latest', '--format',
        '{{index .RepoDigests 0}}|{{.Id}}|{{.Architecture}}'], { timeout: 20000 });
    } catch (e) {
      throw new Error(`alpine:latest 镜像检查失败（不拉取、不降级）：${e.killed ? '超时' : String(e.message).slice(0, 140)}`);
    }
    const [digest, id, arch] = ins.stdout.trim().split('|');
    if (arch !== 'arm64') throw new Error(`alpine 镜像架构异常: ${arch}（需 arm64）`);
    this.imageRef = digest || `alpine@${id}`;
    this.imageMeta = { ref: this.imageRef, id };
    this.log(`镜像固定为 ${this.imageRef}`);

    /* 重名即失败并保留：created=false → destroy() 绝不按名字 stop/rm 既有容器 */
    const exist = await execFileP('docker', ['inspect', this.name], { timeout: 15000 }).then(() => true, () => false);
    if (exist) throw new Error(`容器名冲突（非本运行创建，保留不动）：${this.name}`);

    /* 隔离约束：默认桥接网络、非特权、无任何挂载/socket、默认 capability 集；--init 使 PID1 正确转发/回收信号 */
    const runOut = await execFileP('docker', ['run', '-d', '--init', '--name', this.name,
      '--network', 'bridge', '--label', `hs.f01.run=${this.runTag}`,
      this.imageRef, 'sleep', '100000'], { timeout: 60000 });
    this.containerId = runOut.stdout.trim(); /* 实际容器 ID：后续清理的唯一所有权凭据 */
    this.created = true;
    const meta = await execFileP('docker', ['inspect', this.name,
      '--format', '{{.Id}}@@{{index .Config.Labels "hs.f01.run"}}@@{{json .HostConfig.Privileged}}@@{{json .HostConfig.NetworkMode}}@@{{json .HostConfig.Binds}}@@{{json .HostConfig.CapAdd}}@@{{json .HostConfig.Devices}}'], { timeout: 20000 });
    /* 注：不查 .HostConfig.Mounts——本创建参数下该键可能缺失导致模板报错；Binds/Devices 空已足以证明无挂载 */
    const parts = meta.stdout.trim().split('@@');
    if (parts[0] !== this.containerId || parts[1] !== this.runTag) {
      throw new Error(`容器所有权核验失败：期望 id=${this.containerId.slice(0, 12)}/label=${this.runTag}，实得 id=${String(parts[0]).slice(0, 12)}/label=${parts[1]}`);
    }
    this.containerMeta = { id: this.containerId, label: this.runTag, security: parts.slice(2).join('|'), startedAt: new Date().toISOString() };
    this.log(`容器 ${this.name}(${this.containerId.slice(0, 12)}) 已启动（bridge / 非特权 / 无挂载 / label=${this.runTag}）`);

    const bb = await this.exec('busybox | head -n 1; netstat --version 2>&1 | head -n 1 || true; id -u');
    this.busyboxLine = bb.out.split('\n')[0];
    this.log(`容器工具：${this.busyboxLine}；uid=${bb.out.trim().split('\n').pop()}`);
    await this.checkPortsFree(Object.values(this.ports));
    return this;
  }

  async checkPortsFree(ports) {
    const r = await this.exec(`netstat -lntup 2>/dev/null | awk '{p=$4; sub(/^.*:/,"",p); if (p ~ /^[0-9]+$/) print p}' | sort -un`);
    const used = new Set(r.out.split('\n').map(x => x.trim()).filter(Boolean));
    const clash = ports.filter(p => used.has(String(p)));
    if (clash.length) throw new Error('容器内测试端口被占用: ' + clash.join(','));
  }

  async listeningSnapshot() {
    const r = await this.exec('netstat -lntup 2>/dev/null');
    return r.out;
  }

  /* --- 阶段 1：二进制落位（生产固定路径）+ 校验 --- */
  async prepareBinary(hostGz) {
    await this.mustExec(`mkdir -p ${MIHOMO_DIR} /tmp/hs-www /tmp/hsbroken`, 10000, '建目录');
    await execFileP('docker', ['cp', hostGz, `${this.name}:/tmp/hs-in.gz`]);
    const sum = (await this.mustExec('sha256sum /tmp/hs-in.gz', 30000, '容器内 SHA-256')).trim().split(/\s+/)[0];
    if (sum !== MIHOMO_SHA256) throw new Error(`容器内 SHA-256 不符：${sum}`);
    await this.mustExec(`gunzip -c /tmp/hs-in.gz > ${MIHOMO_BIN} && chmod 755 ${MIHOMO_BIN} && rm -f /tmp/hs-in.gz`, 60000, '解压落位');
    const ver = await this.mustExec(`${MIHOMO_BIN} -v 2>&1`, 30000, 'mihomo -v');
    if (!ver.includes(MIHOMO_VERSION)) throw new Error(`版本不符：${ver.trim().split('\n')[0]}`);
    this.mihomoVersionLine = ver.trim().split('\n')[0];
    this.log(`二进制就位 ${MIHOMO_BIN} → ${this.mihomoVersionLine}`);
    /* 故障注入件：可执行但必然失败的 netstat 影子（不可执行文件会被 shell 跳过继续搜 PATH；
       本件制造真实命令失败，不伪造任何成功，仅用于 F01-R-006/页面采集失败场景） */
    await this.mustExec(`printf '#!/bin/sh\nexit 127\n' > /tmp/hsbroken/netstat && chmod 755 /tmp/hsbroken/netstat`, 5000, '准备故障注入件');
    return this.mihomoVersionLine;
  }

  /* 容器工具：curl（生产采集命令依赖）+ lighttpd（标准 HTTP 目标服务）；检查真实退出码，不做管道尾截断掩盖 */
  async installTools() {
    const need = [];
    if ((await this.exec('command -v curl')).code !== 0) need.push('curl');
    if ((await this.exec('command -v lighttpd')).code !== 0) need.push('lighttpd');
    if (need.length) {
      const r = await this.exec(`apk add --no-cache ${need.join(' ')}`, 240000);
      if (r.code !== 0) throw new Error(`apk 安装 ${need.join(',')} 失败(code=${r.code})：${(r.out + r.err).slice(0, 300)}`);
      this.log(`apk 已安装: ${need.join(', ')}`);
    }
    this.curlLine = (await this.exec('curl --version | head -n 1')).out.trim();
    this.lighttpdLine = (await this.exec('lighttpd -v 2>&1 | head -n 1')).out.trim();
    if (!this.curlLine.startsWith('curl')) throw new Error('容器 curl 版本探测失败');
    if (!this.lighttpdLine.includes('lighttpd')) throw new Error('容器 lighttpd 版本探测失败');
    this.log(`容器工具就绪: ${this.curlLine.split(' (')[0]} / ${this.lighttpdLine.trim()}`);
  }

  /* --- 阶段 2：真实引擎启动 --- */
  buildConfig(withTproxy) {
    const p = this.ports, lines = [
      'mode: rule', 'log-level: warning', 'ipv6: false',
      `mixed-port: ${p.mixed}`, `redir-port: ${p.redir}`,
      `external-controller: 127.0.0.1:${p.ctrl}`,
      `secret: "${this.secret}"`,
      'dns:', '  enable: true', `  listen: 127.0.0.1:${p.dns}`,
      '  enhanced-mode: redir-host', '  nameserver:', '    - 223.5.5.5',
      'rules:', '  - MATCH,DIRECT'
    ];
    if (withTproxy) lines.splice(5, 0, `tproxy-port: ${p.tproxy}`);
    return lines.join('\n') + '\n';
  }

  async writePluginConfigJson(configJson) {
    await this.writeContainerFile(`${MIHOMO_DIR}/config.json`, JSON.stringify(configJson, null, 2));
  }

  async startMihomo({ withTproxy }) {
    const cfg = this.buildConfig(withTproxy);
    await this.writeContainerFile(`${MIHOMO_DIR}/config.yaml`, cfg);
    const t = await this.exec(`${MIHOMO_BIN} -t -d ${MIHOMO_DIR} -f ${MIHOMO_DIR}/config.yaml 2>&1`);
    if (t.code !== 0) throw new Error(`mihomo -t 配置校验失败：${t.out.trim().slice(0, 400)}`);
    await this.mustExec(`cd ${MIHOMO_DIR} && nohup ${MIHOMO_BIN} -d ${MIHOMO_DIR} -f config.yaml >mihomo.stdout 2>mihomo.stderr & echo $!`, 10000, '启动 mihomo');
    const deadline = Date.now() + 20000;
    let pid = '', ok = false;
    while (Date.now() < deadline && !ok) {
      await new Promise(r => setTimeout(r, 250));
      pid = (await this.exec('pidof mihomo')).out.trim();
      if (!pid) continue;
      const ctrl = await this.exec(`netstat -lntp 2>/dev/null | grep -c ':${this.ports.ctrl} '`);
      ok = ctrl.out.trim() === '1';
    }
    if (!ok) {
      const tail = await this.exec(`tail -n 12 ${MIHOMO_DIR}/mihomo.stderr 2>/dev/null; tail -n 6 ${MIHOMO_DIR}/mihomo.stdout 2>/dev/null`);
      throw new Error('mihomo 未在 20s 内就绪（ctrl 端口未监听）。stderr/stdout 尾部：\n' + maskSecrets(tail.out, this.secrets));
    }
    this.children.push({ kind: 'mihomo', pid });
    const exe = (await this.mustExec(`readlink /proc/${pid}/exe`)).trim();
    this.log(`mihomo 运行 pid=${pid} exe=${exe}`);
    return { pid: Number(pid), exe };
  }

  /* 统计某端口被指定 pid 拥有的 TCP/UDP 监听（事实源：netstat -lntup） */
  async ownershipOf(pid) {
    const snap = await this.listeningSnapshot();
    const tcp = new Set(), udp = new Set();
    for (const line of snap.split('\n')) {
      const m = /^\s*(tcp6?|udp6?)\s+\S+\s+\S+\s+(\S+)\s+\S+/i.exec(line);
      if (!m) continue;
      const owner = line.trim().split(/\s+/).pop() || '';
      if (owner.split('/')[0] !== String(pid)) continue;
      const port = Number(m[2].replace(/^.*:/, ''));
      if (/^tcp/i.test(m[1])) tcp.add(port); else udp.add(port);
    }
    return { tcp: [...tcp], udp: [...udp], snapshot: snap };
  }

  async stopMihomo() {
    const pid = (await this.exec('pidof mihomo')).out.trim();
    if (!pid) return { alreadyStopped: true };
    await this.exec(`kill ${pid}`, 10000); /* TERM，不使用 -9 */
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 300));
      if (!(await this.exec('pidof mihomo')).out.trim()) break;
    }
    const still = (await this.exec('pidof mihomo')).out.trim();
    const left = (await this.exec(`netstat -lntup 2>/dev/null | awk '{p=$4; sub(/^.*:/,"",p); if (p ~ /^[0-9]+$/) print p}' | grep -x -e ${this.ports.ctrl} -e ${this.ports.mixed} -e ${this.ports.redir} -e ${this.ports.tproxy} -e ${this.ports.dns} || true`)).out.trim();
    return { pid, stillRunning: !!still, portsStillListening: left.split('\n').filter(Boolean) };
  }

  async startDummy(kind, port) {
    const flag = kind === 'udp' ? '-u -l' : '-l';
    await this.mustExec(`nohup nc ${flag} -p ${port} >/dev/null 2>&1 & echo $!`, 8000, `启动 dummy ${kind}`);
    await new Promise(r => setTimeout(r, 400));
    const snap = await this.exec(`netstat -lntup 2>/dev/null | grep ':${port} ' | head -n 2`);
    const pid = (snap.out.trim().split(/\s+/).pop() || '').split('/')[0];
    if (!/^\d+$/.test(pid)) throw new Error(`dummy ${kind}:${port} 未监听`);
    const exe = (await this.exec(`readlink /proc/${pid}/exe`)).out.trim();
    this.children.push({ kind: `dummy-${kind}`, pid, port });
    return { pid: Number(pid), exe, netstatLine: snap.out.trim() };
  }

  async stopDummy(pid, what) {
    await this.exec(`kill ${pid}`, 8000);
    await new Promise(r => setTimeout(r, 400));
    const alive = await this.exec(`kill -0 ${pid} 2>/dev/null && echo alive || echo gone`);
    return { pid, state: alive.out.trim() };
  }

  /* 本地真实 HTTP 目标：lighttpd 标准服务（不手拼 HTTP 协议应答）；
     access.log 为目标侧真实请求计数，自检做精确字节/行数核对 */
  async startHttpTarget(port) {
    this.httpMarker = 'HS-TARGET-OK-' + this.stamp;
    const LINES = 50000;
    await this.mustExec(`rm -f /tmp/hs-www/ping.txt; I=0; while [ $I -lt ${LINES} ]; do echo '${this.httpMarker}' >> /tmp/hs-www/ping.txt; I=$((I+1)); done`, 30000, '生成目标标记文件');
    const sz = Number((await this.exec('wc -c < /tmp/hs-www/ping.txt')).out.trim());
    const lines = Number((await this.exec('wc -l < /tmp/hs-www/ping.txt')).out.trim());
    if (!(sz > 0) || lines !== LINES) throw new Error(`目标文件生成异常: bytes=${sz} lines=${lines}`);
    const conf = [
      'server.modules = ( "mod_accesslog" )',
      `server.port = ${port}`,
      'server.bind = "127.0.0.1"',
      'server.document-root = "/tmp/hs-www"',
      'accesslog.filename = "/tmp/hs-www/access.log"',
      'server.errorlog = "/tmp/hs-www/error.log"',
      'server.pid-file = "/tmp/hs-www/lighttpd.pid"',
      ''
    ].join('\n');
    await this.writeContainerFile('/tmp/hs-www/lighttpd.conf', conf);
    await this.mustExec(`rm -f /tmp/hs-www/access.log /tmp/hs-www/lighttpd.pid; cd /tmp/hs-www && nohup lighttpd -D -f lighttpd.conf >lt.stdout 2>lt.stderr & echo $!`, 10000, '启动 lighttpd');
    await new Promise(r => setTimeout(r, 700));
    const pid = (await this.exec('cat /tmp/hs-www/lighttpd.pid 2>/dev/null')).out.trim();
    if (!/^\d+$/.test(pid)) {
      const err = (await this.exec('cat /tmp/hs-www/lt.stderr 2>/dev/null')).out;
      throw new Error('lighttpd pid 未就绪: ' + err.slice(0, 160));
    }
    /* 自检：全量取回并精确核对字节数与标记行数（不允许“差不多”） */
    const self = await this.exec(`curl -s -m 8 http://127.0.0.1:${port}/ping.txt > /tmp/hs-self.out; wc -c < /tmp/hs-self.out; grep -c '${this.httpMarker}' /tmp/hs-self.out`);
    const selfParts = self.out.trim().split('\n');
    const selfBytes = Number(selfParts[0]);
    const selfLines = Number((selfParts[1] || '').trim());
    if (selfBytes !== sz || selfLines !== LINES) throw new Error(`目标服务自检不符: bytes ${selfBytes}/${sz} lines ${selfLines}/${LINES}`);
    const hits0 = Number(((await this.exec(`grep -c ' /ping.txt ' /tmp/hs-www/access.log 2>/dev/null`)).out.trim()) || '0');
    if (hits0 < 1) throw new Error('目标服务 access.log 未记录自检请求');
    this.children.push({ kind: 'httpd', pid, port });
    return { pid: Number(pid), bytes: sz, lines: LINES, marker: this.httpMarker, selfCheckRequestsLogged: hits0, server: this.lighttpdLine };
  }

  async stopHttpTarget(port) {
    const pid = (await this.exec('cat /tmp/hs-www/lighttpd.pid 2>/dev/null')).out.trim();
    if (/^\d+$/.test(pid)) await this.exec(`kill ${pid}`, 8000); /* TERM */
    const deadline = Date.now() + 10000;
    let freed = false, gone = !/^\d+$/.test(pid);
    while (Date.now() < deadline) {
      await new Promise(rs => setTimeout(rs, 400));
      const left = await this.exec(`netstat -lntup 2>/dev/null | awk '{p=$4; sub(/^.*:/,"",p); if (p=="${port}") print p}'`);
      if (!left.out.trim()) freed = true;
      if (/^\d+$/.test(pid) && ((await this.exec(`kill -0 ${pid} 2>/dev/null && echo alive || echo gone`)).out.trim() === 'gone')) gone = true;
      if (freed && gone) break;
    }
    const hits = ((await this.exec(`grep -c ' /ping.txt ' /tmp/hs-www/access.log 2>/dev/null`)).out.trim()) || '0';
    return { pid: Number(pid) || null, portFreed: freed, processGone: gone, accessLogRequests: hits };
  }

  /* --- run_shell 桥：仅回环 + 令牌 + 限时限量，命令真实交容器 --- */
  /* 桥命令执行：命令经 -e 环境变量传入（不经宿主 shell）；setsid 进独立会话/进程组，
     pid 即 pgid 且整组（含后代）归本请求生存期；rc 文件为退出码唯一事实源，
     docker 客户端退出码不作数（实测被 SIGTERM 后会以 code 0 退出）；超时事实源为 Node 独立计时器，
     到期对进程组发 TERM（宽限另计）；无法清理 → cleanupFailed 并保留 pid/out/err/rc 证据 */
  async bridgeExec(cmd, timeoutMs = 30000, graceMs = 8000) {
    const n = ++this._bridgeSeq;
    const t = {
      n, pidFile: `/tmp/hs_bx_${n}.pid`, outFile: `/tmp/hs_bx_${n}.out`,
      errFile: `/tmp/hs_bx_${n}.err`, rcFile: `/tmp/hs_bx_${n}.rc`, pid: null, state: 'running'
    };
    this._bridgeActive.add(t);
    try {
      if (!this.containerId) throw new Error('容器非本轮创建/未启动，拒绝执行桥命令');
      const pre = this.bridgePathPrefix ? `PATH=${this.bridgePathPrefix}$PATH; ` : '';
      /* 内层：setsid 独立会话/进程组（pid 即 pgid，整组含后代归本请求）；rc 文件 = 退出码唯一事实源 */
      const inner = `echo $$ > ${t.pidFile}; (eval "$HS_CMD"); echo $? > ${t.rcFile}`;
      const args = ['exec', '-e', `HS_CMD=${cmd}`, this.containerId, 'sh', '-c',
        `${pre}setsid sh -c ${sq(inner)} >${t.outFile} 2>${t.errFile} </dev/null & wait $!`];
      const deadline = Date.now() + Math.max(200, timeoutMs);
      /* docker 客户端仅作等待器，退出码不作事实源（实测：被 SIGTERM 后会以 code 0 退出） */
      const clientP = execFileP('docker', args, { timeout: timeoutMs + graceMs + 120000, maxBuffer: 32 * 1024 * 1024 }).then(() => 0, () => 1);
      const waitP = new Promise(resolve => {
        const iv = setInterval(() => { if (Date.now() >= deadline) { clearInterval(iv); resolve(); } }, 100);
        clientP.then(() => { clearInterval(iv); resolve(); });
      });
      /* 尽早取 pid（有界 ~2s）：命令运行期间 stopBridge/destroy 能看到跟踪对象的真实组，
         避免把在途命令误判为 pid-unconfirmed；deadline 已定，不挤占命令期限 */
      for (let i = 0; i < 20 && !t.pid; i++) {
        const r = await this.exec(`cat ${t.pidFile} 2>/dev/null`, 3000);
        const v = r.out.trim();
        if (/^\d+$/.test(v)) { t.pid = Number(v); break; }
        await new Promise(rs => setTimeout(rs, 100));
      }
      await waitP;
      let rc = await this._readRc(t);
      if (rc === null) {
        await new Promise(r => setTimeout(r, 250)); /* 完成与写 rc 的微小竞态兑底 */
        rc = await this._readRc(t);
      }
      let timedOut = false;
      if (rc === null) {
        /* 主命令未在窗口内结束（客户端退出码无论何值都不算成功）→ 对整组 TERM，宽限另计 */
        timedOut = true;
        t.state = 'term-sent';
        const sweep = await this._termGroup(t, graceMs);
        rc = await this._readRc(t);
        if (!sweep.gone) t.state = sweep.unknown ? 'cleanup-unknown' : 'cleanup-failed';
      }
      /* 请求生存期拥有整组：正常完成后组内可能仍有后台后代（如 'sleep 45 &'）→ 清扫残留；
         查询未知（unknown）一律 fail-closed，不得当消亡 */
      const stMid = t.pid ? await this._groupState(t.pid) : 'unknown';
      if (stMid === 'alive' || stMid === 'unknown') {
        if (t.state === 'running') t.state = stMid === 'unknown' ? 'cleanup-unknown' : 'sweep-descendants';
        if (stMid === 'alive') {
          const sweep = await this._termGroup(t, Math.min(graceMs, 5000));
          if (!sweep.gone) t.state = sweep.unknown ? 'cleanup-unknown' : 'cleanup-failed';
        }
      }
      const out = (await this.exec(`cat ${t.outFile} 2>/dev/null`)).out;
      const err = (await this.exec(`cat ${t.errFile} 2>/dev/null`)).out;
      /* 组消亡唯一确认方式 = _groupState 返回 gone；未知/存活均保留文件与追踪 */
      const stEnd = t.pid ? await this._groupState(t.pid) : 'unknown';
      if (stEnd === 'gone') {
        await this.exec(`rm -f ${t.pidFile} ${t.outFile} ${t.errFile} ${t.rcFile}`, 5000);
        this._bridgeActive.delete(t);
      } else {
        if (stEnd === 'unknown' && t.state !== 'cleanup-failed') t.state = 'cleanup-unknown';
        t.keepFiles = true; /* 未确认消亡：保留四件套作证据，不删除不取消追踪 */
      }
      const cleanupFailed = t.state === 'cleanup-failed' || t.state === 'cleanup-unknown';
      return { code: rc, out, err, timedOut, cleanupFailed, unknown: t.state === 'cleanup-unknown', trackedPid: t.pid, state: t.state };
    } catch (e) {
      t.state = 'error'; t.error = String(e.message).slice(0, 160);
      return { code: null, out: '', err: t.error, timedOut: false, cleanupFailed: true, trackedPid: t.pid, state: t.state };
    }
  }

  async _readPid(t) {
    const v = (await this.exec(`cat ${t.pidFile} 2>/dev/null`)).out.trim();
    return /^\d+$/.test(v) ? Number(v) : null;
  }
  async _readRc(t) {
    const v = (await this.exec(`cat ${t.rcFile} 2>/dev/null`)).out.trim();
    return /^\d+$/.test(v) ? Number(v) : null;
  }
  /* 进程组三态查询：alive/gone/unknown。
     fail-closed 铁律：查询命令失败/空输出/PID 无效 → unknown（不得当 gone，也不得当 alive） */
  async _groupState(pid) {
    if (!pid || !/^\d+$/.test(String(pid))) return 'unknown';
    const r = await this.exec(`kill -0 -${pid} 2>/dev/null && echo ALIVE || echo GONE`);
    const v = r.out.trim();
    if (v === 'ALIVE') return 'alive';
    if (v === 'GONE') return 'gone';
    return 'unknown';
  }
  /* 对命令进程组发 TERM 并有界等待消亡；不使用 SIGKILL。
     PID 未确认或状态未知 → {gone:false, unknown:true}（fail-closed，不得当成功） */
  async _termGroup(t, graceMs) {
    const pid = t.pid || await this._readPid(t);
    if (!pid) return { gone: false, unknown: true, reason: 'pid-unconfirmed' };
    await this.exec(`kill -TERM -${pid} 2>/dev/null`, 5000);
    const deadline = Date.now() + Math.max(500, graceMs);
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 250));
      const st = await this._groupState(pid);
      if (st === 'gone') return { gone: true, pid };
      if (st === 'unknown') return { gone: false, unknown: true, pid, reason: 'state-unknown' };
    }
    const st = await this._groupState(pid);
    if (st === 'gone') return { gone: true, pid };
    if (st === 'alive') return { gone: false, unknown: false, pid, reason: 'term-ignored' };
    return { gone: false, unknown: true, pid, reason: 'state-unknown' };
  }

  async startBridge({ fixtureHtml, pluginJs, deadlineMs = 180000, maxCommands = 400 }) {
    this._bridgeClosed = false; /* 重新开桥时复位关门标记 */
    const token = this._bridgeToken;
    this.secrets.push(token);
    const deadline = Date.now() + deadlineMs;
    let count = 0;
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const host = req.headers.host || '';
      if (!/^127\.0\.0\.1:\d+$/.test(host)) { res.writeHead(403).end('forbidden host'); return; }
      if (u.pathname === '/' && req.method === 'GET') {
        if (u.searchParams.get('t') !== token) { res.writeHead(401).end('unauthorized'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(fixtureHtml.replaceAll('__BRIDGE_TOKEN__', token).replaceAll('__PLUGIN_SRC__', `/plugin.js?t=${encodeURIComponent(token)}`));
        return;
      }
      if (u.pathname === '/plugin.js' && req.method === 'GET') {
        if (u.searchParams.get('t') !== token) { res.writeHead(401).end('unauthorized'); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(pluginJs);
        return;
      }
      if (u.pathname === '/api/run_shell' && req.method === 'POST') {
        if (req.headers['x-hs-bridge'] !== token) { res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false, content: 'HTTP 401' })); return; }
        if (this._bridgeClosed) { res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false, content: 'bridge closing' })); return; }
        if (Date.now() > deadline) { res.writeHead(503).end(JSON.stringify({ success: false, content: 'bridge deadline exceeded' })); return; }
        let body = '';
        req.on('data', c => { body += c; if (body.length > 262144) req.destroy(); });
        req.on('end', async () => {
          if (++count > maxCommands) { res.writeHead(503).end(JSON.stringify({ success: false, content: 'bridge command limit' })); return; }
          let cmd = '', timeout = 30000;
          try { const j = JSON.parse(body); cmd = String(j.cmd || ''); timeout = Math.min(Math.max(Number(j.timeout) || 30000, 1000), 120000); } catch (e) { res.writeHead(400).end('{}'); return; }
          /* 精确尊重请求 timeout（清理宽限另计内部处理）；成功判定以 rc 文件事实源为准 */
          const r = await this.bridgeExec(cmd, timeout);
          this.bridgeLog.push({ n: count, code: r.code, timedOut: !!r.timedOut, cleanupFailed: !!r.cleanupFailed, cmd: maskSecrets(cmd, this.secrets).slice(0, 600) });
          res.writeHead(200, { 'Content-Type': 'application/json' })
            .end(JSON.stringify({ success: r.code === 0 && !r.timedOut && !r.cleanupFailed, content: r.out }));
        });
        return;
      }
      res.writeHead(404).end('not found');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    this._bridgeServer = server;
    const addr = server.address();
    this.log(`run_shell 桥已启动 http://127.0.0.1:${addr.port}/（仅回环+令牌+限时${Math.round(deadlineMs / 1000)}s+限${maxCommands}条）`);
    return { port: addr.port, token };
  }

  /* 所有权核验（按实际容器 ID 查，不给同名替换留任何窗口）：
     本轮已创建 + ID 一致 + label 一致 + 名字一致 才允许任何容器内副作用 */
  async verifyOwnership() {
    if (!this.created || !this.containerId) return { ok: false, reason: 'not-created' };
    const r = await execFileP('docker', ['inspect', this.containerId,
      '--format', '{{.Id}}@@{{index .Config.Labels "hs.f01.run"}}@@{{.State.Status}}@@{{.Name}}'], { timeout: 15000 })
      .then(x => x.stdout.trim(), () => null);
    if (!r) return { ok: false, reason: 'inspect-failed-or-absent' };
    const [id, label, status, name] = r.split('@@');
    if (id !== this.containerId || label !== this.runTag || name !== '/' + this.name) {
      return { ok: false, reason: 'ownership-mismatch', actual: { id, label, name } };
    }
    return { ok: true, status };
  }

  async stopBridge() {
    const evidence = { strandedKilled: [], pidFilesRetained: [], pidFilesRemaining: [], unknownCount: 0 };
    /* 1) 先拒绝新请求（关门先行），再处理在途 */
    this._bridgeClosed = true;
    /* 2) 容器侧搁浅处理需所有权核验通过；未通过只关 host 侧服务器，对容器零操作 */
    const own = await this.verifyOwnership();
    if (own.ok) {
      for (const t of [...this._bridgeActive]) {
        const st = t.pid ? await this._groupState(t.pid) : 'unknown';
        if (st === 'gone') {
          await this.exec(`rm -f ${t.pidFile} ${t.outFile} ${t.errFile} ${t.rcFile}`, 5000);
          this._bridgeActive.delete(t);
          evidence.strandedKilled.push({ pidFile: t.pidFile, pid: t.pid, state: 'group-gone' });
          continue;
        }
        if (st === 'alive') {
          const s = await this._termGroup(t, 8000);
          if (s.gone) {
            await this.exec(`rm -f ${t.pidFile} ${t.outFile} ${t.errFile} ${t.rcFile}`, 5000);
            this._bridgeActive.delete(t);
            evidence.strandedKilled.push({ pidFile: t.pidFile, pid: t.pid, state: 'group-gone' });
          } else if (s.unknown) {
            t.state = 'cleanup-unknown'; t.keepFiles = true;
            evidence.strandedKilled.push({ pidFile: t.pidFile, pid: t.pid, state: 'unknown', reason: s.reason });
            evidence.unknownCount++;
          } else {
            t.state = 'cleanup-failed'; t.keepFiles = true;
            evidence.strandedKilled.push({ pidFile: t.pidFile, pid: t.pid, state: 'term-ignored' });
          }
        } else {
          t.state = 'cleanup-unknown'; t.keepFiles = true;
          evidence.strandedKilled.push({ pidFile: t.pidFile, pid: t.pid, state: 'unknown', reason: 'pid-unconfirmed-or-query-failed' });
          evidence.unknownCount++;
        }
      }
      /* 3) 现存四件套：仅删除组已确认消亡者的文件；其余一律保留并记录（fail-closed，禁止无条件 rm） */
      const listFiles = async () => (await this.exec('for f in /tmp/hs_bx_*.pid /tmp/hs_bx_*.out /tmp/hs_bx_*.err /tmp/hs_bx_*.rc; do [ -f "$f" ] && echo "$f"; done; true')).out.trim().split('\n').filter(Boolean);
      const files = await listFiles();
      const retainedBases = new Set(evidence.strandedKilled.filter(k => k.state !== 'group-gone').map(k => k.pidFile.replace(/\.pid$/, '')));
      for (const f of files) {
        if (retainedBases.has(f.replace(/\.(pid|out|err|rc)$/, ''))) continue; /* 保留对象的四件套不动 */
        if (f.endsWith('.pid')) {
          const pid = Number((await this.exec(`cat ${f} 2>/dev/null`)).out.trim());
          const st = /^\d+$/.test(String(pid)) ? await this._groupState(pid) : 'unknown';
          if (st === 'gone') {
            await this.exec(`rm -f ${f.replace(/\.pid$/, '.pid')} ${f.replace(/\.pid$/, '.out')} ${f.replace(/\.pid$/, '.err')} ${f.replace(/\.pid$/, '.rc')}`, 3000);
          } else {
            evidence.pidFilesRetained.push({ file: f, reason: st === 'alive' ? 'group-alive' : 'state-unknown' });
            if (st === 'unknown') evidence.unknownCount++;
          }
        } else {
          const basePid = f.replace(/\.(out|err|rc)$/, '.pid');
          if (!files.includes(basePid)) {
            evidence.pidFilesRetained.push({ file: f, reason: 'orphan-no-pidfile' }); /* 组不可确认 → 保留 */
          }
        }
      }
      evidence.pidFilesRemaining = await listFiles();
      evidence.blocked = evidence.unknownCount > 0 || evidence.strandedKilled.some(k => k.state !== 'group-gone');
    } else {
      evidence.ownershipSkipped = own.reason;
    }
    /* 4) host 侧服务器关闭：await close + 有界等待（超时兑底断连，仅影响本回环测试桥） */
    if (this._bridgeServer) {
      const srv = this._bridgeServer;
      await new Promise(resolve => {
        const to = setTimeout(resolve, 5000);
        srv.close(() => { clearTimeout(to); resolve(); });
      });
      if (typeof srv.closeAllConnections === 'function') srv.closeAllConnections();
      this._bridgeServer = null;
      this.log('run_shell 桥已关闭');
    }
    return evidence;
  }

  /* --- 总清理：仅 SIGTERM + 有界等待；未如期退出的资源报 blocked 保留证据，绝不强杀。
     返修铁律：任何容器内副作用（停引擎/dummy/目标/桥搁浅清扫）都必须先通过
     所有权核验（本轮创建 + 实际 ID + label + 名字）；重名拒绝或核验不匹配 → 对容器零操作 --- */
  async destroy() {
    const evidence = { mihomo: null, dummies: [], httpd: null, bridge: null, container: null, blockedReasons: [], errors: [] };
    const own = await this.verifyOwnership();
    if (!own.ok) {
      /* 只关 host 侧桥服务器（不动容器）；重名拒绝场景 created=false 也不会走到任何 exec */
      if (this._bridgeServer) { this._bridgeServer.close(); this._bridgeServer = null; this.log('run_shell 桥已关闭（仅 host 侧）'); }
      evidence.container = { touched: false, reason: `所有权核验未通过（${own.reason}），容器零操作` };
      if (this.created) evidence.blockedReasons.push('容器所有权核验未通过，未清理（保留取证）');
      return evidence;
    }
    try {
      evidence.mihomo = await this.stopMihomo();
      if (evidence.mihomo.stillRunning || (evidence.mihomo.portsStillListening || []).length) evidence.blockedReasons.push('mihomo 未在 TERM 后退出或端口未释放');
    } catch (e) { evidence.errors.push('mihomo: ' + e.message); }
    for (const c of this.children.filter(c => c.kind.startsWith('dummy'))) {
      try {
        const r = await this.stopDummy(c.pid, c.kind);
        evidence.dummies.push({ ...c, ...r });
        if (r.state !== 'gone') evidence.blockedReasons.push(`dummy ${c.kind} pid=${c.pid} 未退出`);
      } catch (e) { evidence.errors.push(c.kind + ': ' + e.message); }
    }
    const httpd = this.children.find(c => c.kind === 'httpd');
    if (httpd) {
      try {
        evidence.httpd = { ...httpd, ...(await this.stopHttpTarget(httpd.port)) };
        if (!evidence.httpd.portFreed || !evidence.httpd.processGone) evidence.blockedReasons.push('目标 HTTP 服务未退出或端口未释放');
      } catch (e) { evidence.errors.push('httpd: ' + e.message); }
    }
    try {
      evidence.bridge = await this.stopBridge();
    } catch (e) {
      evidence.errors.push('bridge: ' + e.message);
      evidence.blockedReasons.push('桥清扫异常（未知状态），保留容器取证');
    }
    /* 任何未退出/未知/未清理的桥命令组 → blocked：禁止 PID1 TERM 或 rm
       （容器退出不能证明残留进程被显式清理，反而会抹掉取证） */
    const bridgeUnclean = evidence.bridge && (evidence.bridge.blocked || (evidence.bridge.pidFilesRetained || []).length > 0);
    if (bridgeUnclean) evidence.blockedReasons.push('桥存在未确认消亡/未清理的命令组，保留容器与四件套取证');
    if ((evidence.blockedReasons || []).length) {
      evidence.container = {
        touched: true, name: this.name, id: this.containerId, kept: true,
        reason: '存在未退出/未知/未清理资源（见 blockedReasons），保留容器取证，不执行 PID1 TERM/rm'
      };
      return evidence;
    }

    try {
      if (own.status === 'running') {
        /* 真实信号：对 PID1(docker-init) 发 TERM（--init 下转发给 sleep 优雅退出）；不用 docker stop（超时后隐式 SIGKILL）；按实际 ID 寻址 */
        await execFileP('docker', ['exec', this.containerId, 'kill', '-TERM', '1'], { timeout: 10000 });
        const deadline = Date.now() + 20000;
        let exited = false;
        while (Date.now() < deadline && !exited) {
          await new Promise(r => setTimeout(r, 400));
          const st = await execFileP('docker', ['inspect', this.containerId, '--format', '{{.State.Status}}'], { timeout: 15000 }).then(r => r.stdout.trim(), () => 'unknown');
          if (st === 'exited') exited = true;
        }
        if (!exited) {
          evidence.container = { touched: true, name: this.name, id: this.containerId, kept: true, exitVia: 'PID1 SIGTERM 后 20s 未退出 → 报 blocked 保留容器取证，不强杀不删除' };
          evidence.blockedReasons.push('容器在 PID1 SIGTERM 后未退出，保留不动');
          return evidence;
        }
      }
      await execFileP('docker', ['rm', this.containerId], { timeout: 30000 });
      evidence.container = { touched: true, name: this.name, id: this.containerId, removed: true, exitVia: '容器内各进程逐一 TERM+核实 → 桥搁浅清扫 → PID1 SIGTERM（docker-init 转发）→ 有界等待 → rm；全程无 SIGKILL' };
      this.log('容器已按 SIGTERM 退出并删除');
    } catch (e) { evidence.errors.push('container: ' + e.message); evidence.blockedReasons.push('容器清理异常'); }
    return evidence;
  }
}
