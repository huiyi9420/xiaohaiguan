import { shq } from './工具.js';

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
    ctrl
  };
}

export const N6_COMMAND = 'echo =N6=$(ip -6 neigh show 2>/dev/null | grep lladdr | awk \'{printf "%s~%s ", $1, $5}\');';

export function hasUdpDownload(cs, mg) {
  return cs && cs.connections && cs.connections.some(c => c.metadata && c.metadata.network === 'udp' && (c.download || 0) > 0
    && (c.chains || []).some(x => x === mg));
}
