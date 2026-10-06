export const wait = ms => new Promise(r => setTimeout(r, ms));
export const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const shq = t => "'" + String(t).replace(/'/g, "'\\''") + "'";
export const toB64 = t => { try { return btoa(unescape(encodeURIComponent(t))) } catch (e) { return '' } };
export const b64d = t => { try { return decodeURIComponent(escape(atob(t))) } catch (e) { return '' } };
export const p2 = n => String(n).padStart(2, '0');
export const ct = r => (r && r.content || '').trim();
export const pInt = r => parseInt(ct(r)) || 0;
export const latClr = d => d < 150 ? '#66bb6a' : d < 400 ? '#ffb74d' : '#e57373';
/* MAC/CIDR 白名单正则: 这两个值会拼进 root 执行的 fw.sh,导入配置或手改 config.json 可能带非法值,消费端一律先过滤(防 shell 注入) */
export const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
export const okMac = t => MAC_RE.test(String(t || '').trim());
/* 本地管理位 MAC(第一字节 bit1=1): iOS/Android/Windows 私有地址常见形态,会随网络轮换,白名单按 MAC 记忆时需显式提醒 */
export function isPrivacyMac(mac) {
  const m = /^([0-9a-f]{2}):/i.exec(String(mac || '').trim());
  return !!m && ((parseInt(m[1], 16) & 2) === 2);
}
/* v2.8.7 设备类型图标: 随身 WiFi 场景——接入终端就是手机/电脑/Pad 三类,按主机名关键词识别(零开销);未命中回退📱 */
export function devIconOf(name, host) {
  const s = (String(name || '') + ' ' + String(host || '')).toLowerCase();
  if (/(macbook|imac|mac mini|mac pro|macbook|mbp|desk|laptop|notebook|thinkpad|surface|windows|pc)/.test(s)) return '💻';
  if (/(ipad|pad|平板)/.test(s)) return '📱';
  return '📱';
}
/* I01: 形状之外还查数值——四段各 0-255、掩码 0-32(IPv4 CIDR 语义);
   这些值拼入 root 执行的 fw.sh 与面板命令,形状通过而数值越界即注入面(v2.0.8 纵深口径收严) */
export const okCidr = t => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(String(t || '').trim());
  if (!m) return false;
  if (Number(m[1]) > 255 || Number(m[2]) > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return false;
  return m[5] === undefined || Number(m[5]) <= 32;
};
/* I02: 严谨 IPv6 校验(自带实现,浏览器无 node:net)——hex 组≤8、每组≤4 位、
   :: 压缩至多一次且须真实省略、可选合法 IPv4 尾段(折算两组 hex 后统一校验);
   拒 ':::::'/'gg::'/超长组/组数超限 */
export const okV6 = t => {
  const s = String(t || '').trim().toLowerCase();
  if (!s.includes(':') || /[^0-9a-f:.]/.test(s)) return false;
  let body = s;
  const tailPart = s.slice(s.lastIndexOf(':') + 1);
  if (tailPart.includes('.')) { /* IPv4 映射尾: 数值合法且折算两组 hex 替换后统一走 hex 组校验 */
    const m4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(tailPart);
    if (!m4 || Number(m4[1]) > 255 || Number(m4[2]) > 255 || Number(m4[3]) > 255 || Number(m4[4]) > 255) return false;
    body = s.slice(0, s.length - tailPart.length)
      + (((Number(m4[1]) << 8) | Number(m4[2])).toString(16)) + ':' + (((Number(m4[3]) << 8) | Number(m4[4])).toString(16));
  }
  if (/:::/.test(body)) return false;
  const dc = (body.match(/::/g) || []).length;
  if (dc > 1) return false;
  if (dc === 1) {
    const [a, b] = body.split('::');
    const gs = (a ? a.split(':') : []).concat(b ? b.split(':') : []);
    return gs.length < 8 && gs.every(g => /^[0-9a-f]{1,4}$/.test(g));
  }
  const gs = body.split(':');
  return gs.length === 8 && gs.every(g => /^[0-9a-f]{1,4}$/.test(g));
};
/* 订阅信息节点过滤(机场在节点列表里塞的公告行,非真实节点): 关键词命中即滤——新增类型持续补充 */
export const HS_INFO_PAT = /剩余|到期|流量|重置|官网|套餐|过期|有效|距离|订阅|获取|时间|更新|expire|traffic|reset/i;
export const lineGName = n => '🛤️ ' + n;
export const linePoolName = nm => lineGName(nm) + '·池';
export const PS_TXT = { self: '自建', merge: '合并', direct: '直通' };
export function psTxt(v) { return PS_TXT[v] || '自建' }
/* 线路锁定模式的运行时默认出口(生成侧与保存后 PUT 组切换共用,须保持一致) */
export function lineDefOf(L) {
  if (!L || L.mode !== 'node') return '';
  const nodes = (Array.isArray(L.nodes) ? L.nodes : (L.node ? [L.node] : [])).filter(n => typeof n === 'string' && n && n.length <= 64);
  if (!nodes.length) return '';
  if (nodes.length === 1) return nodes[0];
  if (L.pick === 'manual') return (nodes.indexOf(L.node) >= 0 ? L.node : nodes[0]);
  return linePoolName(String(L.name));
}
export const nowStr = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) };
export const stampStr = () => nowStr().replace(/[-: ]/g, '');
