/* ============================================================================
 * 小海关 · 分流河流图模块（v2.10.0 泳道定稿，ZCode v02 原型 1:1 落地）
 * 形态：横版双泳道 SVG（viewBox 560 ≈ 580 容器一比一；绿=防火墙直接放行区/蓝=小海关引擎区+闸门）
 *      窄屏端点水轨 + 行内折叠（点哪行从哪行撑开，不再用底部 sheet）
 *      检索定位：实测活跃连接优先（/connections），静态判定链兜底（ET网段→强制→排除→游戏例外→ipset 国内→订阅规则）
 * 纪律：独立风格自包含（不依赖面板样式/CSS 变量）；用户数据一律 esc；依赖经 ctx 注入不反向触碰入口
 * ==========================================================================*/

const RV_CY = 84, RV_VB_W = 640, RV_VB_H = 156;

function rvRgba(hex, a) { const v = parseInt(hex.slice(1), 16); return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')' }

/* ================= 节点组装（真实数据；条件显隐；泳道归属） ================= */
function rvNodes(ctx) {
  const { C, ST, ET, EX, FC } = ctx;
  const N = [];
  if (C.cnBypass !== false && ST.chn >= 5000) N.push({ key: 'cn', icon: '🇨🇳', name: '国内直通', short: '国内', mid: '国内直通', color: '#66bb6a', flow: 'direct', ft: '直连', zone: 'g', laneTxt: '国内直连', /* v2.9.38: 中性——该节点承载防火墙IP放行+引擎geosite双通道(真机反馈括注矛盾) */
    sub: ST.chn.toLocaleString('en-US') + ' 条中国 IP 段', subS: ST.chn.toLocaleString('en-US') + ' 段',
    desc: '命中中国大陆 IP 段的流量在防火墙就被直接放行，根本不进小海关引擎，速度最快、延迟最低。',
    rows: [['处理位置', '防火墙 · 不进引擎'], ['覆盖规模', ST.chn + ' 个 IP 段'], ['域名库', 'geosite:cn（域名级直连）']],
    live: 'cn' }); /* v2.9.30: 卡内真实控件(入口 mountLive 挂载),弃锚点跳转 */
  if (C.coexistAuto) { /* v2.9.24: 回归 Pi 口径——开关开即显示节点;ET_CACHE 读取中会被置 null,不能作为显隐条件(真机实锢: 添加清单条目触发重渲撞上 readEtState 中途,节点消失) */
    const etOn = !!(ET && ET.active);
    const nc = etOn ? (ET.cidrs || []).length : 0, np = etOn ? (ET.p2p_ports || []).length : 0;
    N.push({ key: 'et', icon: '🛰️', name: 'ET组网兼容', short: 'ET组网', mid: 'ET组网', color: '#4dd0e1', flow: 'direct', ft: '直连', zone: 'g', laneTxt: '防火墙直接放行',
      sub: etOn ? (nc + ' 网段 · ' + np + ' 端口') : '状态读取中…', subS: etOn ? (nc + ' 段·' + np + ' 口') : '读取中',
      desc: 'ET组网的虚拟网段与打洞端口在防火墙放行，组网流量不被代理引擎干扰。',
      rows: [['处理位置', '防火墙 · 不进引擎'], ['虚拟网段', etOn ? (nc + ' 段') : '读取中'], ['打洞端口', etOn ? (np + ' 个') : '读取中']],
      live: 'et' });
  }
  if (EX.length) {
    const exD = EX.filter(x => x.m !== 'cidr').length, exC = EX.length - exD;
    N.push({ key: 'ex', icon: '📃', name: '强制直连', short: '排除', mid: '强制直连', color: '#9ccc65', flow: 'direct2', ft: '引擎直连', zone: 'b', laneTxt: '小海关引擎',
      sub: EX.length + ' 条自定义', subS: '域名' + exD + (exC ? '·网段' + exC : ''),
      desc: '进了引擎、但你要求「必须直连」：小海关直接放行，不发给代理节点。',
      rows: [] /* v2.9.34: 静态明细置空——清单唯一展示在下方活控件区(带删除/添加),双份冗余(真机截图实锢) */
        .concat(EX.length > 5 ? [['…', '共 ' + EX.length + ' 条']] : []),
      live: 'ex' });
  }
  if (FC.length) N.push({ key: 'fc', icon: '🚀', name: '强制代理', short: '强制', mid: '强制代理', color: '#ffb74d', flow: 'proxy', ft: '走代理', zone: 'b', laneTxt: '小海关引擎',
    sub: FC.length + ' 条自定义', subS: '域名' + FC.filter(x => x.m !== 'cidr').length + (FC.some(x => x.m === 'cidr') ? '·含网段' : ''),
    desc: '进了引擎、且你要求「必须走代理」：无论订阅规则怎么说，一律交给代理节点。',
    rows: [] /* v2.9.34: 同 ex——清单唯一展示在活控件区 */
      .concat(FC.length > 5 ? [['…', '共 ' + FC.length + ' 条']] : []),
    live: 'fc' });
  const exit = (ctx.exitLive && ctx.exitLive.chain) ? ctx.exitLive.chain : ((C.policySrc === 'self') ? '🚀 节点选择' : '订阅出口组(读取中)'); /* v2.9.43: 兜底全链实测(组→组→节点+延迟) */
  N.push({ key: 'rest', icon: '🌐', name: '其余流量', short: '其余', mid: '其余流量', color: '#7fc9f2', flow: 'rule', ft: '订阅规则', zone: 'b', laneTxt: '小海关引擎', exit: exit,
    sub: '订阅规则 · 兜底 ' + (ctx.exitLive ? ctx.exitLive.final : '…'), subS: exit, /* v2.9.43: 副标=当前节点 */
    desc: '进了引擎、且没被你自定义拦下的流量：交给订阅自带规则判断——规则可能让它直连(如国内域名)、也可能让它走代理；规则没提到的，才走兜底出口。' /* v2.9.28: 纠正「都走代理」误解(真机反馈) */,
    rows: [['处理位置', '引擎内 · 订阅规则逐条判定'], ['策略来源', ({ self: '自建调度', merge: '合并(订阅组接入)', direct: '订阅直通' })[C.policySrc] || '—'], ['规则判向', '直连或代理由规则逐条决定,非全部代理'], ['兜底出口', exit]],
    btns: [['切换出口(节点页)', 'pri', 'rv-node']] }); /* v2.9.30: 弃设置页跳转(真机反馈奇怪),去节点页才是出口选择语义 */
  N.forEach((n, i) => { n.no = i + 1 });
  return N;
}

/* ================= 横版 SVG（双泳道；节点数动态布局） ================= */
function rvBuildSvg(N, svgEl) {
  const CY = RV_CY, L = N.length;
  const gCount = N.filter(n => n.zone === 'g').length;

  /* 横坐标对齐原型定稿 JX：g区 gCount=2→[102,206]、1→[150]；b区均布 [GATE+48,500](末端500=⑤,闸门后留白到540出口箭头) */
  /* v2.9.40: 全量均布自适应——节点少时(清单空/开关关)不再左侧固定+右侧稀疏,全体在 [70,571] 均分,闸门取绿蓝分界中点 */
  const spread = (cnt, a, b) => { const r = []; if (cnt <= 0) return r; if (cnt === 1) r.push(Math.round((a + b) / 2)); else for (let i = 0; i < cnt; i++) r.push(Math.round(a + (b - a) * i / (cnt - 1))); return r };
  const xs = spread(L, 70, 571);
  const GATE = gCount ? Math.round((xs[gCount - 1] + xs[gCount]) / 2) : 0; /* v2.9.40: 闸门=绿蓝分界中点,随节点数自适应 */
  let s = '<defs><marker id="hsRvArw" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L7,4 L0,7 Z" fill="rgba(127,201,242,.7)"/></marker></defs>';
  /* 泳道底与标题（绿区窄时用短标题） */
  if (gCount) {
    const laneA = GATE - 34;
    const labA = laneA >= 200 ? '🛡️ 防火墙直接放行 · 不进小海关' : '🛡️ 防火墙直接放行';
    const wA = Math.round(labA.length * 9.5) + 16;
    const cxA = Math.round(Math.max(34 + wA / 2 + 2, Math.min(GATE - wA / 2 - 2, 34 + laneA / 2)));
    s += '<rect x="34" y="24" width="' + laneA + '" height="130" rx="10" fill="rgba(102,187,106,.045)" stroke="rgba(102,187,106,.16)" stroke-dasharray="3 4"/>'
      + '<rect x="' + (cxA - wA / 2) + '" y="3" width="' + wA + '" height="17" rx="8.5" fill="rgba(102,187,106,.12)" stroke="rgba(102,187,106,.4)"/>'
      + '<text x="' + cxA + '" y="15" font-size="9" fill="#8fd693" text-anchor="middle">' + labA + '</text>';
  }
  s += '<rect x="' + (GATE || 34) + '" y="24" width="' + (626 - (GATE || 34)) + '" height="130" rx="10" fill="rgba(127,201,242,.05)" stroke="rgba(127,201,242,.16)" stroke-dasharray="3 4"/>';
  const bx = GATE ? Math.round((GATE + 626) / 2) : 330;
  s += '<rect x="' + (bx - 80) + '" y="3" width="160" height="17" rx="8.5" fill="rgba(127,201,242,.12)" stroke="rgba(127,201,242,.4)"/>'
    + '<text x="' + bx + '" y="15" font-size="9" fill="#7fc9f2" text-anchor="middle">🧠 小海关引擎 · mihomo</text>';
  /* 入口竖排 / 主流分色 / 闸门 */
  s += '<rect x="5" y="56" width="22" height="56" rx="11" fill="rgba(255,255,255,.05)" stroke="rgba(127,201,242,.3)"/>'
    + '<text x="16" y="67" font-size="9.5" fill="#e8eaf0" text-anchor="middle">全<tspan x="16" dy="11">部</tspan><tspan x="16" dy="11">流</tspan><tspan x="16" dy="11">量</tspan></text>';
  /* v2.9.36: 主流蜿蜒化(真机反馈: 河流哪有笔直的)——每段一条 S 形贝塞尔,波幅±8,起止/闸门处回中线 */
  const wave = (x1, x2) => { const sp = x2 - x1, a = Math.min(8, Math.max(4, sp * 0.045)); return 'M ' + x1 + ' ' + CY + ' C ' + Math.round(x1 + sp * 0.3) + ' ' + (CY - a) + ', ' + Math.round(x1 + sp * 0.7) + ' ' + (CY + a) + ', ' + x2 + ' ' + CY };
  const dA = wave(34, GATE || 34), dB = wave(GATE || 34, 617);
  /* v2.9.36: 水流粗细层次——宽辉光底层(6px 低透明)+主虚线(2.2px)+光珠,不再死板一线 */
  if (gCount) s += '<path d="' + dA + '" fill="none" stroke="rgba(102,187,106,.16)" stroke-width="6" stroke-linecap="round"/>';
  s += '<path d="' + dB + '" fill="none" stroke="rgba(127,201,242,.16)" stroke-width="6" stroke-linecap="round"/>';
  if (gCount) s += '<path class="mainflow" d="' + dA + '" fill="none" stroke="rgba(102,187,106,.55)" stroke-width="2.2"/>';
  s += '<path class="mainflow" d="' + dB + '" fill="none" stroke="rgba(127,201,242,.55)" stroke-width="2.2" marker-end="url(#hsRvArw)"/>'
    + '<path id="hsRvUp" d="' + (gCount ? (dA + ' ' + dB.replace(/^M[^C]*/, '') /* v2.9.46: slice(1) 残留起点坐标致解析截断(totalLen 只剩 dA)——剥到 C 为止路径才连续 */) : dB) + '" fill="none" stroke="none" stroke-width="3" stroke-linecap="round"/>';
  if (gCount) s += '<circle r="3.4" fill="#66bb6a" opacity=".95"><animateMotion dur="2.2s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0.62;1" keyTimes="0;0.45;1" path="' + dA + '"/></circle>';
  s += '<circle r="3.6" fill="#7fc9f2" opacity=".95"><animateMotion dur="2.9s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0.6;1" keyTimes="0;0.42;1" path="' + dB + '"/></circle>';
    + '<circle r="2.2" fill="rgba(127,201,242,.6)"><animateMotion dur="2.9s" begin="1.45s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0.6;1" keyTimes="0;0.42;1" path="' + dB + '"/></circle>';
  if (GATE) s += '<rect x="' + (GATE - 6) + '" y="' + (CY - 7) + '" width="2.6" height="14" rx="1.3" fill="rgba(127,201,242,.8)"/>'
    + '<rect x="' + (GATE + 0.5) + '" y="' + (CY - 7) + '" width="2.6" height="14" rx="1.3" fill="rgba(127,201,242,.8)"/>'
    + '<text x="' + GATE + '" y="106" font-size="8" fill="rgba(127,201,242,.75)" text-anchor="middle">进引擎</text>';
  /* 节点（末位=兜底层：标签并入出口胶囊，单行收尾） */
  const branchDs = [];
  N.forEach((n, i) => {
    const x = xs[i], last = i === L - 1;
    const tag = last ? ('兜底 ' + n.exit) : n.ft;
    const ct = last ? n.subS : n.subS;
    const tw = Math.round(tag.length * 9.8) + 16;
    branchDs[i] = last
      ? 'M ' + x + ' ' + (CY + 14) + ' C ' + (x + 3) + ' ' + (CY + 26) + ', ' + (x - 5) + ' ' + (CY + 33) + ', ' + (x - 6) + ' ' + (CY + 42)
      : 'M ' + x + ' ' + (CY + 14) + ' C ' + (x + 2) + ' ' + (CY + 26) + ', ' + (x - 2) + ' ' + (CY + 33) + ', ' + x + ' ' + (CY + 42);
    let px = last ? x - 6 : x;
    px = Math.round(Math.max(38 + tw / 2, Math.min(622 - tw / 2, px)));
    s += '<g class="jn" data-rvi="' + i + '">'
      + '<rect class="hit" x="' + (x - 58) + '" y="20" width="116" height="134"/>'
      + '<text x="' + x + '" y="36" font-size="11.5" font-weight="600" fill="#e8eaf0" text-anchor="middle">' + n.icon + ' ' + n.mid + '</text>' /* v2.9.25: 真机反馈两字短名信息损失,恢复四字中名 */
      + '<text x="' + x + '" y="52" font-size="9.5" fill="#8ba0bd" text-anchor="middle">' + ct + '</text>'
      + '<line x1="' + x + '" y1="57" x2="' + x + '" y2="' + (CY - 14) + '" stroke="rgba(255,255,255,.14)" stroke-width="1"/>'
      + '<circle class="nd" cx="' + x + '" cy="' + CY + '" r="12" fill="#1a2130" stroke="' + n.color + '" stroke-width="2"/>'
      + '<text x="' + x + '" y="' + (CY + 4) + '" font-size="11" font-weight="700" fill="' + n.color + '" text-anchor="middle">' + n.no + '</text>'
      + '<path d="' + branchDs[i] + '" fill="none" stroke="' + n.color + '" stroke-opacity=".14" stroke-width="4.5" stroke-linecap="round"/>' /* 支管辉光底层 */
    + '<path class="branch" d="' + branchDs[i] + '" fill="none" stroke="' + n.color + '" stroke-width="1.8"/>'
      + '<rect class="tagp" x="' + (px - tw / 2) + '" y="' + (CY + 46) + '" width="' + tw + '" height="18" rx="9" fill="' + rvRgba(n.color, .12) + '" stroke="' + rvRgba(n.color, .5) + '"/>'
      + '<text x="' + px + '" y="' + (CY + 58.5) + '" font-size="' + (last ? 9 : 9.5) + '" font-weight="' + (last ? 600 : 400) + '" fill="' + n.color + '" text-anchor="middle">' + tag + '</text>'
      + '</g>';
  });
  s += '<g><circle id="hsRvHalo" r="6.5" opacity="0"><animateMotion id="hsRvAM2" begin="indefinite" repeatCount="indefinite" dur="1.05s" path="M 0 0 L 0 1"/></circle><circle id="hsRvTrv" r="3.2" opacity="0"><animateMotion id="hsRvAM" begin="indefinite" repeatCount="indefinite" dur="1.05s" path="M 0 0 L 0 1"/></circle></g>';
  svgEl.innerHTML = s;
  return { xs: xs, branchDs: branchDs, GATE: GATE, gCount: gCount };
}

/* ================= 详情构建（横卡全量 / 竖版折叠精简——不重复行头） ================= */
function rvDetailFull(ctx, n) {
  const esc = ctx.esc;
  return '<div class="d-head"><span class="d-ico" style="border-color:' + rvRgba(n.color, .5) + ';background:' + rvRgba(n.color, .12) + '">' + n.icon + '</span>'
    + '<div class="d-t"><em>第 ' + n.no + ' 优先层 · ' + esc(n.laneTxt) + '</em><h3>' + esc(n.name) + '</h3></div>'
    + '<span class="fchip ' + n.flow + '">' + n.ft + '</span></div>'
    + '<p class="d-desc">' + n.desc + '</p>'
    + (n.rows && n.rows.length ? (n.rows && n.rows.length ? '<div class="d-rows">' + n.rows.map(r => '<div class="d-row"><span title="' + esc(r[0]) + '">' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' : '') : '')
    + '<div class="d-acts">' + (n.btns || []).map(b => '<button class="btn hs-sm ' + (b[1] === 'pri' ? 'hs-pri' : '') + '" data-rvact="' + b[2] + '">' + b[0] + '</button>').join('') + '</div>'
  + (n.key === 'rest' ? '<div id="hs_rv_rstats" style="margin-top:10px"></div>' : '')
  + (n.live && ctx.mountLive ? '<div class="hs-rv-live" data-live="' + n.live + '" style="margin-top:10px"></div>' : ''); /* v2.9.30: 卡内活控件容器 */
}
function rvDetailLite(ctx, n) {
  const esc = ctx.esc;
  return '<p class="d-desc">' + n.desc + '</p>'
    + (n.rows && n.rows.length ? (n.rows && n.rows.length ? '<div class="d-rows">' + n.rows.map(r => '<div class="d-row"><span title="' + esc(r[0]) + '">' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('') + '</div>' : '') : '')
    + '<div class="d-acts">' + (n.btns || []).map(b => '<button class="btn hs-sm ' + (b[1] === 'pri' ? 'hs-pri' : '') + '" data-rvact="' + b[2] + '">' + b[0] + '</button>').join('') + '</div>'
  + (n.key === 'rest' ? '<div id="hs_rv_rstats" style="margin-top:10px"></div>' : '')
  + (n.live && ctx.mountLive ? '<div class="hs-rv-live" data-live="' + n.live + '" style="margin-top:10px"></div>' : ''); /* v2.9.30: 卡内活控件容器 */
}

/* ================= 检索：IP/CIDR 工具 + 静态判定链 + 实测优先 ================= */
function ipToBig(s) {
  s = String(s || '').trim().toLowerCase();
  if (s.indexOf(':') >= 0) {
    const parts = s.split('::');
    if (parts.length > 2) return null;
    const h = parts[0] ? parts[0].split(':') : [], t = parts[1] !== undefined && parts[1] !== '' ? parts[1].split(':') : (parts.length === 2 ? [] : null);
    if (t === null) return null;
    const groups = h.concat(Array(Math.max(8 - h.length - t.length, 0)).fill('0')).concat(t);
    if (groups.length !== 8) return null;
    let v = 0n;
    for (const g of groups) { if (!/^[0-9a-f]{1,4}$/.test(g)) return null; v = (v << 16n) + BigInt(parseInt(g, 16)) }
    return v;
  }
  const o = s.split('.');
  if (o.length !== 4 || o.some(x => !/^\d+$/.test(x) || +x > 255)) return null;
  return o.reduce((a, x) => (a << 8n) + BigInt(+x), 0n);
}
function cidrHas(ip, cidr) {
  cidr = String(cidr || '').trim();
  if (!cidr) return false;
  if (cidr.indexOf('/') < 0) return ip === cidr.toLowerCase();
  const seg = cidr.split('/'), net = seg[0], p = +seg[1];
  const pip = ipToBig(ip), pnet = ipToBig(net);
  if (pip === null || pnet === null) return false;
  const bits = net.indexOf(':') >= 0 ? 128 : 32;
  if (!(p >= 0 && p <= bits)) return false;
  if (p === 0) return true;
  return (pip >> BigInt(bits - p)) === (pnet >> BigInt(bits - p));
}
function listMatch(q, item, isIp) {
  const v = String(item.v || '').toLowerCase();
  if (!v) return false;
  if (item.m === 'suffix') return q === v || q.endsWith('.' + v);
  if (item.m === 'exact') return q === v;
  if (item.m === 'cidr') return isIp && cidrHas(q, v);
  return q.indexOf(v) >= 0; /* prefix 前缀匹配 → mihomo DOMAIN-KEYWORD(包含)同源语义 */
}
function nodeIdx(N, key) { const i = N.findIndex(n => n.key === key); return i }
/* 静态判定链（与真实流量路径同序：防火墙 ET/国内IP → 引擎 强制→排除→游戏→订阅兜底） */
async function rvLookupStatic(ctx, N, q) {
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(q) || q.indexOf(':') >= 0;
  const restI = nodeIdx(N, 'rest');
  if (isIp && ctx.ET && ctx.ET.active) {
    const cs = (ctx.ET.cidrs || []).concat(ctx.ET.cidrs6 || []);
    for (const c of cs) if (cidrHas(q, c)) { const i = nodeIdx(N, 'et'); return { i: i >= 0 ? i : restI, why: '命中 ET 组网直连网段', verdict: 'direct' } }
  }
  for (const x of (ctx.FC || [])) if (listMatch(q, x, isIp)) { const i = nodeIdx(N, 'fc'); if (i >= 0) return { i: i, why: '在你的「强制代理」清单里', verdict: 'proxy' } }
  for (const x of (ctx.EX || [])) if (listMatch(q, x, isIp)) { const i = nodeIdx(N, 'ex'); if (i >= 0) return { i: i, why: '在你的「强制直连」清单里', verdict: 'direct' } }
  if (!isIp && ctx.game) for (const d of ctx.game) if (q === d || q.endsWith('.' + d)) { const i = nodeIdx(N, 'fc'); return { i: i >= 0 ? i : restI, why: '游戏出海例外（强制走代理）', verdict: 'proxy' } }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q) && ctx.run) {
    try {
      const r = await ctx.run('ipset test hs_cn ' + q + ' 2>/dev/null', 4000);
      if (r && (r.content || '').indexOf(' is in set') >= 0) {
        const i = nodeIdx(N, 'cn');
        return i >= 0 ? { i: i, why: '中国大陆 IP（ipset 内核态命中）', verdict: 'direct' } : { i: restI, why: '国内 IP（直通未启用，引擎内判定）', verdict: 'direct' };
      }
    } catch (e) { }
  }
  return { i: restI, why: isIp ? '未命中任何直连规则，交给订阅规则' : '未命中自定义清单，引擎按 geosite:cn / 订阅规则判定' };
}
/* 实测优先：活跃连接里找到该域名/IP → 直接给真实命中规则与出口链 */
async function rvLookupLive(ctx, N, q) {
  if (!ctx.apiGet) return null;
  let d = null;
  try { d = await ctx.apiGet('/connections') } catch (e) { d = null }
  const cs = (d && d.connections) || [];
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(q) || q.indexOf(':') >= 0;
  const hit = cs.find(c => {
    const m = c.metadata || {}, h = String(m.host || m.sniffHost || '').toLowerCase();
    return h === q || h.endsWith('.' + q) || m.destinationIP === q;
  });
  if (!hit) return null;
  const m = hit.metadata || {}, host = String(m.host || m.sniffHost || q).toLowerCase();
  const pl = String(hit.rulePayload || '').toLowerCase();
  const chain = (hit.chains && hit.chains[0]) || '?';
  let i = nodeIdx(N, 'rest'), why = '实测命中 ' + (hit.rule || '规则') + (pl ? ',' + pl : '') + ' → ' + chain;
  for (const x of (ctx.FC || [])) if (listMatch(host, x, false) || (isIp && listMatch(q, x, true))) { const j = nodeIdx(N, 'fc'); if (j >= 0) { i = j; break } }
  if (i === nodeIdx(N, 'rest')) for (const x of (ctx.EX || [])) if (listMatch(host, x, false) || (isIp && listMatch(q, x, true))) { const j = nodeIdx(N, 'ex'); if (j >= 0) { i = j; break } }
  if (i === nodeIdx(N, 'rest') && /geosite|geosite,cn|geoip|ruleset/i.test(String(hit.rule || '') + ',' + pl) && /cn|china/i.test(pl + String(hit.rule || ''))) { const j = nodeIdx(N, 'cn'); if (j >= 0) i = j }
  return { i: i, why: why, live: true, verdict: chain.indexOf('DIRECT') >= 0 ? 'direct' : (chain.indexOf('REJECT') >= 0 ? 'reject' : 'proxy') }; /* v2.9.36: verdict 透传供判向着色 */
}

/* ================= 渲染状态机（横/竖两态、选中联动、检索绑定） ================= */
let RV = null; /* 单实例状态（分流页同屏只有一个河流组件） */
const rvEl = id => document.getElementById(id);

export function riverMarkup() {
  return '<div class="hs-rv" id="hs_rv" data-mode="h">'
    + '<div class="hs-rvs"><input id="hs_rv_q" type="text" placeholder="查一查：openai.com 或 1.2.3.4 走哪条道？" enterkeyhint="search"><button class="hs-rvgo" id="hs_rv_go" type="button">🔍 查</button></div>'
    + '<div class="hs-rvnote" id="hs_rv_note">输入域名或 IP，帮你点亮它会被哪层规则接走</div>'
    + '<div class="hs-rvh"><svg id="hs_rv_svg" viewBox="0 0 ' + RV_VB_W + ' ' + RV_VB_H + '" preserveAspectRatio="xMidYMid meet"></svg></div>'
    + '<div class="hs-rvv"><div class="railwrap"><i class="railfill" id="hs_rv_rfill"></i><div class="rail"></div><i class="raildot"></i><i class="raildot r2"></i>'
    + '<div class="vcap"><span class="vdot src"></span><span class="vlab"><b>全部流量</b> 从这进来</span></div>'
    + '<div id="hs_rv_rows"></div>'
    + '<div class="vcap"><span class="vdot end"></span><span class="vlab">兜底出口 <b id="hs_rv_exit">🚀 节点选择</b></span></div>'
    + '</div></div>'
    + '<div class="hs-rvlk" id="hs_rv_lk"><i class="lkline" id="hs_rv_lkline"></i><i class="lkdot" id="hs_rv_lkdot"></i></div>'
    + '<div class="hs-rvdt" id="hs_rv_dt"><span class="hs-rvnotch" id="hs_rv_notch"></span><div id="hs_rv_dbody"></div><button class="hs-rvx" id="hs_rv_x" type="button">✕</button></div>'
    + '</div>';
}

function rvApplySvgState() {
  const st = RV; if (!st || st.sel === null || st.mode === 'v') return;
  const i = st.sel, n = st.N[i];
  st.jns.forEach((g, k) => { g.classList.toggle('on', k === i); g.classList.toggle('dim', k !== i) });
  st.branches.forEach((p, k) => p.classList.toggle('hot', k === i));
  const up = rvEl('hsRvUp');
  if (up) {
    const g = n.zone === 'g';
    /* v2.9.45: 比例近似仍偏差(贝塞尔前段爬坡弧密)——改 getPointAtLength 二分,精确求到达节点 x 的弧长 */
    let segLen = (st.geo.xs[i] - 34) + 10;
    try {
      const total = up.getTotalLength();
      if (total > 0) {
        let lo = 0, hi = total;
        for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; (up.getPointAtLength(mid).x < st.geo.xs[i] + 6) ? (lo = mid) : (hi = mid) }
        segLen = Math.round(lo) + 4;
      }
    } catch (e) { }
    up.setAttribute('stroke', g ? 'rgba(102,187,106,.9)' : 'rgba(127,201,242,.9)');
    up.setAttribute('stroke-dasharray', segLen + ' 3000');
  }
  const trv = rvEl('hsRvTrv'), halo = rvEl('hsRvHalo');
  if (trv) {
    trv.setAttribute('fill', n.color); trv.setAttribute('opacity', '.95');
    halo.setAttribute('fill', n.color); halo.setAttribute('opacity', '.25');
    const am = rvEl('hsRvAM'), am2 = rvEl('hsRvAM2');
    am.setAttribute('path', st.geo.branchDs[i]); am2.setAttribute('path', st.geo.branchDs[i]);
    try { am.beginElement(); am2.beginElement() } catch (e) { }
  }
}
function rvPositionLink(i) {
  const st = RV, wrap = st.wrap;
  const svg = rvEl('hs_rv_svg');
  const sr = svg.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const px = sr.left - wr.left + (st.geo.xs[i] / RV_VB_W) * sr.width;
  const n = st.N[i];
  const line = rvEl('hs_rv_lkline'), dot = rvEl('hs_rv_lkdot'), nz = rvEl('hs_rv_notch');
  line.style.left = px + 'px'; dot.style.left = px + 'px';
  line.style.color = n.color; dot.style.color = n.color;
  rvEl('hs_rv_lk').classList.add('on');
  nz.style.left = (px - 9) + 'px'; nz.style.background = n.color;
  nz.style.boxShadow = '0 0 10px ' + rvRgba(n.color, .8); nz.classList.add('on');
  st.dt.style.setProperty('--ox', px + 'px');
}
function rvToggleV(i, force) {
  const st = RV, it = st.vitems[i], pn = it.querySelector('.vpanel');
  if (st.openV === i && !force) { it.classList.remove('open'); pn.style.maxHeight = '0px'; st.openV = null; rvFillRail(null); return }
  if (st.openV !== null) { const p = st.vitems[st.openV]; p.classList.remove('open'); p.querySelector('.vpanel').style.maxHeight = '0px' }
  st.openV = i; it.classList.add('open');
  rvFillRail(it);
  const grow = () => { pn.style.maxHeight = pn.scrollHeight + 'px' };
  grow(); requestAnimationFrame(grow); setTimeout(grow, 90); /* 同步先行,异步刷新兜底(后台标签 rAF/timeout 冻结时也能撑开) */
}
function rvFillRestStats() { /* v2.9.28: 订阅规则判向统计(引擎 /rules+/proxies 实测,事件驱动非轮询) */
  const box = document.getElementById('hs_rv_rstats');
  if (!box || !RV || !RV.ctx.restStats) return;
  box.innerHTML = '<div class="d-row"><span style="color:#8ba0bd">订阅规则判向</span><b>读取中…</b></div>';
  RV.ctx.restStats().then(st => {
    const b2 = document.getElementById('hs_rv_rstats'); if (!b2) return;
    if (!st) { b2.innerHTML = '<div class="d-row"><span style="color:#8ba0bd">订阅规则判向</span><b style="color:#8ba0bd">引擎未运行,无法统计</b></div>'; return }
    b2.innerHTML = '<div class="d-row"><span>规则总数</span><b>' + st.total + ' 条</b></div>'
      + '<div class="d-row"><span>判直连</span><b style="color:#8fe39a">' + st.direct + ' 条</b></div>'
      + '<div class="d-row"><span>判代理</span><b style="color:#ffcc80">' + st.proxy + ' 条</b></div>'
      + (st.reject ? '<div class="d-row"><span>判拦截</span><b>' + st.reject + ' 条</b></div>' : '')
      + '<div class="d-row"><span>兜底出口实测</span><b>' + (st.matchChain || '—') + '</b></div>';
  }).catch(() => { });
}
function rvFillRail(item) { /* v2.9.36: 竖版水流填充——选中行时从源头珠填充到该行圆点(对齐 PC 上游点亮) */
  const f = document.getElementById('hs_rv_rfill'); if (!f) return;
  if (!item) { f.style.height = '0px'; return }
  const wrap = f.parentElement; const dot = item.querySelector('.dot');
  if (!dot) { f.style.height = '0px'; return }
  const wr = wrap.getBoundingClientRect(), dr = dot.getBoundingClientRect();
  const h = Math.max(0, dr.top + dr.height / 2 - wr.top - 17 + 3);
  f.style.height = h.toFixed(0) + 'px';
}
function rvMountLive(ctx, root) { /* v2.9.30: 挂载卡内活控件(入口 mountLive 回调) */
  if (!ctx.mountLive || !root) return;
  root.querySelectorAll('[data-live]').forEach(el => { try { ctx.mountLive(el.dataset.live, el) } catch (e) { } });
}
function rvSelect(i, force) {
  const st = RV;
  if (st.mode === 'v') { rvToggleV(i, force); return }
  if (!force && st.sel === i && st.dt.classList.contains('show')) { riverClose(); return }
  st.sel = i;
  rvApplySvgState();
  rvEl('hs_rv_dbody').innerHTML = rvDetailFull(st.ctx, st.N[i]);
  rvMountLive(st.ctx, st.dt);
  if (st.N[i].key === 'rest') rvFillRestStats();
  st.dt.classList.add('show');
  st.dt.querySelectorAll('[data-rvact]').forEach(b => { b.onclick = () => st.ctx.act(b.dataset.rvact) });
  rvPositionLink(i);
  st.dt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
export function riverClose() {
  const st = RV; if (!st) return;
  st.sel = null;
  st.jns.forEach(g => g.classList.remove('found', 'on', 'dim'));
  st.branches.forEach(p => p.classList.remove('hot'));
  const up = rvEl('hsRvUp'); if (up) up.setAttribute('stroke', 'none');
  const trv = rvEl('hsRvTrv'), halo = rvEl('hsRvHalo');
  if (trv) { trv.setAttribute('opacity', '0'); halo.setAttribute('opacity', '0') }
  if (st.dt) st.dt.classList.remove('show');
  const lk = rvEl('hs_rv_lk'); if (lk) lk.classList.remove('on');
  const nz = rvEl('hs_rv_notch'); if (nz) nz.classList.remove('on');
  if (st.openV !== null) { const p = st.vitems[st.openV]; p.classList.remove('open'); const pn = p.querySelector('.vpanel'); if (pn) pn.style.maxHeight = '0px'; st.openV = null }
  const note = rvEl('hs_rv_note');
  if (note) { note.classList.remove('ok'); note.textContent = '输入域名或 IP，帮你点亮它会被哪层规则接走' }
}
function rvSetMode() {
  const st = RV; if (!st || !st.wrap) return;
  const w = st.wrap.clientWidth;
  const m = (w >= 430) ? 'h' : 'v';
  if (m === st.mode) return;
  st.mode = m; st.wrap.dataset.mode = m;
  if (m === 'v') riverClose();
  else if (st.sel !== null && st.dt.classList.contains('show')) { rvApplySvgState(); rvPositionLink(st.sel) }
}
async function rvDoSearch() {
  const st = RV;
  const inp = rvEl('hs_rv_q'), note = rvEl('hs_rv_note');
  const q = (inp.value || '').trim().toLowerCase();
  if (!q) { st.ctx.toast('请输入域名或 IP 再查'); return }
  note.classList.remove('ok'); note.textContent = '查询中…';
  let r = null;
  try { r = await rvLookupLive(st.ctx, st.N, q) } catch (e) { r = null }
  if (!r) { try { r = await rvLookupStatic(st.ctx, st.N, q) } catch (e) { r = { i: st.N.length - 1, why: '查询异常，按兜底处理' } } }
  /* v2.9.29: 落到第⑤层时深判——IP查china_ip精确判直连/域名演算规则+兜底链给出最终判向 */
  if (r.i === st.N.length - 1 && st.ctx.deepRest) {
    try { const deep = await st.ctx.deepRest(q, /^(\d{1,3}\.){3}\d{1,3}$/.test(q) || q.indexOf(':') >= 0); if (deep && deep.why) { r.why = deep.why; r.verdict = deep.verdict; if (deep.node) { const ni = st.N.findIndex(x => x.key === deep.node); if (ni >= 0) r.i = ni } } /* v2.9.36: oracle 判直连且指明节点(如 geosite/china 命中)→点亮①国内直通,不再误挂第5层 */ } catch (e) { }
  }
  const n = st.N[r.i], esc = st.ctx.esc;
  /* v2.9.36: 结论判向着色——→ 直连(绿)/走代理(橙)/拦截(红) 彩色胶囊,用户一眼抓重点 */
  if (r.verdict === 'direct' && !/→\s*(直连|走代理|拦截)/.test(r.why)) r.why += ' → 直连';
  if (r.verdict === 'proxy' && !/→\s*(直连|走代理|拦截)/.test(r.why)) r.why += ' → 走代理';
  if (r.verdict === 'reject' && !/→\s*(直连|走代理|拦截)/.test(r.why)) r.why += ' → 拦截';
  const colorWhy = (t) => String(t).replace(/→\s*(直连|走代理|拦截)/g, (s0, w) => '→ ' + (w === '直连' ? '<b class="hs-rv-vd vd-d">直连</b>' : (w === '走代理' ? '<b class="hs-rv-vd vd-p">走代理</b>' : '<b class="hs-rv-vd vd-r">拦截</b>')));
  st.jns.forEach(g => g.classList.remove('found'));
  rvSelect(r.i, true);
  if (st.mode === 'h') st.jns[r.i].classList.add('found');
  note.innerHTML = '「<b>' + esc(q) + '</b>」会走：<b style="color:' + n.color + '">第' + n.no + '层 ' + esc(n.name) + '</b> · ' + colorWhy(r.why); /* v2.9.38: 去泳道括注——泳道与判定通道可能不同(如①层域名走引擎侧),拼同框自相矛盾 */
  note.classList.add('ok');
  const banner = '<div class="hitbanner" style="color:' + n.color + ';border-color:' + rvRgba(n.color, .5) + ';background:' + rvRgba(n.color, .1) + '">🔍 ' + (r.live ? '<b>实测</b>·' : '') + '你查的「' + esc(q) + '」从这里走 · ' + colorWhy(r.why) + '</div>';
  if (st.mode === 'v') {
    const pin = st.vitems[r.i].querySelector('.vpanel-in');
    const old = pin.querySelector('.hitbanner'); if (old) old.remove();
    pin.insertAdjacentHTML('afterbegin', banner);
  } else {
    rvEl('hs_rv_dbody').insertAdjacentHTML('afterbegin', banner);
  }
}

/* ================= 主渲染（paneSplit 每次渲染后调用，幂等） ================= */
export function riverRender(ctx) {
  const wrap = rvEl('hs_rv'); if (!wrap) return;
  const N = rvNodes(ctx);
  const svg = rvEl('hs_rv_svg');
  const geo = rvBuildSvg(N, svg);
  const jns = [...svg.querySelectorAll('.jn')];
  const branches = [...svg.querySelectorAll('.branch')];
  jns.forEach(g => { g.onclick = () => rvSelect(+g.dataset.rvi) });
  /* 竖版：泳道分隔标题 + 行内折叠 */
  const rowsBox = rvEl('hs_rv_rows');
  const gCount = geo.gCount;
  let vh = '';
  if (gCount) vh += '<div class="vlaneh g">🛡️ 防火墙直接放行 · 不进小海关</div>';
  else vh += '<div class="vlaneh b">🧠 全部进入小海关引擎</div>';
  const vitems = [];
  N.forEach((n, i) => {
    if (gCount && n.zone === 'b' && (i === 0 || N[i - 1].zone === 'g')) vh += '<div class="vlaneh b">🧠 以下进入小海关引擎</div>';
    const itemId = 'hs_rv_vi_' + i;
    vh += '<div class="vitem" id="' + itemId + '"><button class="vrow" style="--c:' + n.color + '">'
      + '<span class="dot">' + n.no + '</span>'
      + '<span class="vmain"><span class="nm">' + n.icon + ' ' + ctx.esc(n.name) + '</span><span class="ct">' + ctx.esc(n.sub) + '</span></span>'
      + '<span class="fchip ' + n.flow + '">' + n.ft + '</span>'
      + '<span class="chev">›</span></button>'
      + '<div class="vpanel"><div class="vpanel-in">' + rvDetailLite(ctx, n) + '</div></div></div>';
  });
  rowsBox.innerHTML = vh;
  rvFillRail(null);
  rvMountLive(ctx, rowsBox); /* v2.9.30: 竖版折叠面板内活控件随渲染挂载 */
  N.forEach((n, i) => {
    const it = rvEl('hs_rv_vi_' + i);
    it.querySelector('.vrow').onclick = () => rvSelect(i);
    it.querySelectorAll('[data-rvact]').forEach(b => { b.onclick = () => ctx.act(b.dataset.rvact) });
    vitems.push(it);
  });
  const exitEl = rvEl('hs_rv_exit');
  if (exitEl) exitEl.textContent = N[N.length - 1].exit;
  rvFillRestStats(); /* 竖版折叠面板内置容器,随渲染填充 */
  /* 状态与绑定 */
  RV = { ctx: ctx, N: N, geo: geo, jns: jns, branches: branches, vitems: vitems, wrap: wrap, dt: rvEl('hs_rv_dt'), mode: '', sel: null, openV: null };
  const x = rvEl('hs_rv_x'); if (x) x.onclick = () => riverClose();
  const go = rvEl('hs_rv_go'), q = rvEl('hs_rv_q');
  if (go) go.onclick = () => rvDoSearch();
  if (q) q.onkeydown = e => { if (e.key === 'Enter') rvDoSearch() };
  if (!wrap.dataset.rvObs) {
    wrap.dataset.rvObs = '1';
    addEventListener('resize', () => rvSetMode()); /* 双保险:面板容器宽随窗口变的场景 */
    try { new ResizeObserver(() => rvSetMode()).observe(wrap) } catch (e) { }
  }
  rvSetMode();
  setTimeout(rvSetMode, 60);
  return { etActive: !!(ctx.ET && ctx.ET.active && ctx.C.coexistAuto) }; /* v2.9.24: 供入口在 ET 缓存就绪后补刷 */
}
