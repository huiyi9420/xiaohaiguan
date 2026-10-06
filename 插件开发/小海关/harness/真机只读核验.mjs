const fs = await import('node:fs/promises');
const path = await import('node:path');
const task = await taskSpace(5);
const page = task.page('p1');
const commands = [
  ['基础状态', `D=/data/plugins/customs; uname -m; "$D/mihomo" -v; df -k /data; for K in s1 s2 s2Keep bootMode coexistAuto cnBypass policySrc logEnabled logLevel mode; do printf '%s=' "$K"; jsonfilter -i "$D/config.json" -e "@.$K"; done; for F in fw.sh start.sh config.yaml; do printf '%s ' "$F"; grep -m1 '#gen:' "$D/$F"; done; wc -c "$D/customs.log" "$D/plugin.log" 2>/dev/null; for P in $(pidof mihomo); do printf 'PROCESS '; readlink "/proc/$P/exe"; grep -E 'VmRSS|Threads' "/proc/$P/status"; done`],
  ['接管与端口', `printf 'PREROUTING跳转\n'; for IPT in iptables ip6tables; do for T in nat mangle; do echo "$IPT $T"; $IPT -t $T -S PREROUTING 2>/dev/null | grep 'HS_' | sed -E 's/([[:xdigit:]]{2}:){5}[[:xdigit:]]{2}/<MAC>/g'; done; done; printf 'TP模式\n'; cat /data/plugins/customs/.tpmode 2>/dev/null; printf '策略路由\n'; ip rule show | grep -E 'fwmark|lookup 100'; ip -6 rule show | grep -E 'fwmark|lookup 100'; ip route show table 100; ip -6 route show table 100; printf '监听\n'; netstat -lnptu 2>/dev/null | grep mihomo | awk '{print $1,$4,$6}'; printf '资源\n'; grep -E 'MemAvailable|MemFree|MemTotal' /proc/meminfo; cat /proc/sys/net/netfilter/nf_conntrack_count /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null`],
  ['规则顺序与DNS配置', `for C in HS_LAN HS_DNS; do iptables -t nat -S "$C" 2>/dev/null; done; iptables -t mangle -S HS_UDP 2>/dev/null; for C in HS_V6_LAN HS_V6_DNS; do ip6tables -t nat -S "$C" 2>/dev/null; done; ip6tables -t mangle -S HS_V6_UDP 2>/dev/null; iptables -t nat -S HS_OUT 2>/dev/null; printf '配置关键字段\n'; grep -E '^(mode:|routing-mark:|profile:|store-selected:|store-fake-ip:|  ipv6:|  listen:|  enhanced-mode:|  auto-route:|  auto-redirect:|    default:|    default-selected:)' /data/plugins/customs/config.yaml; printf 'DNS上游\n'; awk '/^  nameserver:/{f=1;next}/^  proxy-server-nameserver:/{print "proxy-server-nameserver:";f=1;next}/^[^ ]|^  [a-z]/{f=0} f{print}' /data/plugins/customs/config.yaml`],
  ['控制接口无鉴权状态码', `P=$(jsonfilter -i /data/plugins/customs/config.json -e '@.ports.ctrl'); case "$P" in ''|*[!0-9]*) exit 1;; esac; curl -s -m 3 -o /dev/null -w 'HTTP=%{http_code}\n' "http://127.0.0.1:$P/version"; printf 'curl退出码=%s\n' "$?"`],
  ['控制接口脱敏统计', `D=/data/plugins/customs; P=$(jsonfilter -i "$D/config.json" -e '@.ports.ctrl'); S=$(jsonfilter -i "$D/config.json" -e '@.secret'); case "$P" in ''|*[!0-9]*) exit 1;; esac; curl -fsS -m 5 -H "Authorization: Bearer $S" "http://127.0.0.1:$P/version"; printf '\nUDP能力计数\n'; curl -fsS -m 8 -H "Authorization: Bearer $S" "http://127.0.0.1:$P/providers/proxies" | jsonfilter -e '@.providers.*.proxies[*].udp' | sort | uniq -c; printf '会话协议计数\n'; curl -fsS -m 8 -H "Authorization: Bearer $S" "http://127.0.0.1:$P/connections" | jsonfilter -e '@.connections[*].metadata.network' | sort | uniq -c; unset S`]
];
const evidence = [];
for (const [name, cmd] of commands) {
  const result = await page.evaluate(async ({ cmd }) => {
    const response = await fetch('/api/run_shell', {
      method: 'POST', headers: { ...common_headers, 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ cmd, timeout: 25000 })
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error('只读采集失败：HTTP ' + response.status + '，' + String(body.content || '').slice(0, 180));
    return body.content;
  }, { cmd });
  const redacted = result.replace(/(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+(?:\/\d+)?/gi, '<IPv6>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d+)?\b/g, '<IPv4>');
  console.log(name + '\n' + redacted);
  evidence.push({ name, content: redacted });
}
const dir = path.join('/Users/zhaolulu/Projects/U60Pro-zwrt', '插件开发/小海关/harness/artifacts');
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, '真机只读基线.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log({ spaceId: task.spaceId, evidence: 'harness/artifacts/真机只读基线.json' });
