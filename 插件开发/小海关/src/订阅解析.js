/* 订阅解析(F05 重写): 行级正则 → 真实 YAML 解析。
 * 事实源: yaml@2.9.1 parseDocument——无缩进序列/单双引号组名/顶层锚点与跨块别名/
 * proxy-providers 透传/节点名特殊字符均由解析器保证;解析失败明确报错(ok:false+why),不静默。
 * 输出契约(消费方: 插件.js 直通/合并分支、诊断防御取块、hsMainGroup):
 *   ok/why        成败与原因(失败时无其余键)
 *   yaml          保留五块+锚点定义键后的文档重序列化(直通模式直接消费,锚点/别名保真)
 *   data          五块解析值(plain 对象,merge 键已展开;合并模式结构化消费)
 *   blocks        块名→规范缩进行数组(兼容既有行级消费方: 诊断 rule-providers 探测)
 *   anchors       锚点定义键的序列化文本行(合并模式头部拼装,保持 &anchor 供别名引用) */
import YAML from 'yaml';

const WANT = ['proxies', 'proxy-groups', 'rules', 'rule-providers', 'proxy-providers', 'sub-rules'];
/* sub-rules 透传理由: mihomo 的 SUB-RULE 规则必须配套顶层 sub-rules 定义段,不透传则订阅逻辑规则必坏 */

function anchorKeyNodes(doc) {
  /* 顶层键集合(键名字符串→value 节点),供过滤与锚点定位 */
  const map = new Map();
  const items = doc.contents && Array.isArray(doc.contents.items) ? doc.contents.items : [];
  for (const it of items) {
    if (!it || !it.key) continue;
    map.set(String(it.key.value != null ? it.key.value : it.key), it.value);
  }
  return map;
}

/* YAML merge 键语义展开: yaml@2.9 toJS/parse 不自动展开 '<<'(实测保留为字面键),
 * 按 YAML 1.1/1.2 merge 语义补齐——base 先铺底,自身显式键覆盖;递归处理嵌套 */
function expandMerge(v) {
  if (Array.isArray(v)) return v.map(expandMerge);
  if (v && typeof v === 'object') {
    const out = {};
    const m = v['<<'];
    if (m !== undefined) {
      const bases = Array.isArray(m) ? m : [m];
      for (const b of bases) if (b && typeof b === 'object') Object.assign(out, expandMerge(b));
    }
    for (const k of Object.keys(v)) if (k !== '<<') out[k] = expandMerge(v[k]);
    return out;
  }
  return v;
}

export function extractSubBlocks(txt) {
  let doc;
  try { doc = YAML.parseDocument(String(txt == null ? '' : txt)) }
  catch (e) { return { ok: false, why: '订阅 YAML 解析异常: ' + String((e && e.message) || e).slice(0, 140) } }
  if (doc.errors && doc.errors.length) {
    const e0 = doc.errors[0];
    const lp = e0.linePos && e0.linePos[0];
    const pos = (lp && lp.line) ? '(' + lp.line + ':' + lp.col + ') ' : '';
    return { ok: false, why: '订阅 YAML 解析失败' + pos + String(e0.message || '').slice(0, 140) };
  }
  const data = {};
  const js = doc.toJS();
  for (const k of WANT) {
    if (js && js[k] !== undefined && js[k] !== null) data[k] = expandMerge(js[k]);
  }
  const nodeOf = new Map();
  const items = doc.contents && Array.isArray(doc.contents.items) ? doc.contents.items : [];
  for (const k of WANT) {
    for (const it of items) {
      if (it && it.key && String(it.key.value != null ? it.key.value : it.key) === k) nodeOf.set(k, it.value);
    }
  }
  if (!Array.isArray(data.proxies) || !data.proxies.length) return { ok: false, why: '订阅缺少节点段(proxies)' };
  if (!Array.isArray(data.rules) || !data.rules.length) return { ok: false, why: '订阅缺少规则段(rules)' };
  /* 锚点保真: 收集五块内引用的别名(*name),保留定义这些锚点(&name)的顶层键 */
  const aliasNames = new Set();
  for (const k of WANT) {
    const node = nodeOf.get(k);
    if (!node) continue;
    try {
      YAML.visit(node, {
        Alias(_key, n) { if (n && n.source) aliasNames.add(n.source); return undefined; }
      });
    } catch (e) { /* 遍历异常按无别名处理,序列化阶段仍会暴露问题 */ }
  }
  const anchorDefs = [];
  const topNodes = anchorKeyNodes(doc);
  for (const [keyName, valueNode] of topNodes) {
    if (WANT.includes(keyName)) continue;
    const anc = valueNode && valueNode.anchor;
    if (anc && aliasNames.has(anc)) anchorDefs.push([keyName, valueNode]);
  }
  /* 删减顶层键: 只留五块 + 被引用的锚点定义键 */
  if (doc.contents && Array.isArray(doc.contents.items)) {
    const keepKey = new Set(WANT);
    for (const [keyName] of anchorDefs) keepKey.add(keyName);
    doc.contents.items = doc.contents.items.filter(it => {
      if (!it || !it.key) return false;
      const name = String(it.key.value != null ? it.key.value : it.key);
      return keepKey.has(name);
    });
  }
  /* anchors: 锚点定义键单独序列化(带 &anchor,供合并模式头部拼装) */
  const anchors = [];
  for (const [keyName, valueNode] of anchorDefs) {
    const ad = new YAML.Document();
    ad.set(keyName, valueNode);
    anchors.push(String(ad).replace(/\n+$/, ''));
  }
  /* blocks: 规范缩进(2 空格)行数组,兼容行级消费方 */
  const blocks = {};
  for (const k of WANT) {
    if (!(k in data)) continue;
    const text = String(YAML.stringify(data[k])).replace(/\n+$/, '');
    blocks[k] = text.split('\n').map(l => (l === '' ? '' : '  ' + l));
  }
  return { ok: true, yaml: String(doc).replace(/\n+$/, '') + '\n', blocks, anchors, data };
}

/* 供消费方序列化结构化结果(esbuild 将 yaml 打包进产物,不新增运行时依赖) */
export function subYaml(value) { return YAML.stringify(value) }

export function firstSelectGroup(txt) {
  try {
    const doc = YAML.parseDocument(String(txt == null ? '' : txt));
    if (doc.errors && doc.errors.length) return '';
    const gs = doc.toJS()['proxy-groups'];
    if (!Array.isArray(gs)) return '';
    for (const g of gs) {
      if (g && typeof g === 'object' && !Array.isArray(g) && String(g.type || '') === 'select') {
        const n = g.name;
        return (typeof n === 'string' || typeof n === 'number') ? String(n) : '';
      }
    }
    return '';
  } catch (e) { return '' }
}

/* 预览数据源: 订阅 yaml 文本→节点名数组(只解析 proxies 段;订阅缓存可能缺 rules,
 * 不走 extractSubBlocks 的全块契约);失败返回空数组,预览 UI 显示解析失败提示 */
export function extractNodeNames(txt) {
  try {
    const doc = YAML.parseDocument(String(txt == null ? '' : txt));
    if (doc.errors && doc.errors.length) return [];
    const px = doc.toJS().proxies;
    if (!Array.isArray(px)) return [];
    return px.map(p => (p && typeof p === 'object' && p.name != null) ? String(p.name) : '').filter(Boolean);
  } catch (e) { return [] }
}

/* v2.7.0 订阅节点过滤 */
/* 设计事实源: 引擎 proxy-provider 原生 exclude-filter(Go RE2)——过滤在引擎侧生效,
 * 规则改动仅需热重载;JS 侧同源正则供弹窗实时预览(生成与分类判定共用同一段 pattern,
 * JS RegExp 与 RE2 在本模块用到的语法子集(| 与转义字面量)完全一致,无兼容缺口)。
 * 地区过滤语义: regions 是勾选保留集,勾掉(false)的地区进 exclude;名字无地区标识的
 * 节点不命中任何地区词→不被排除→保留(防误杀自定义命名),与原型「其他」分类不同,
 * 真机版无「其他」桶,不识别即不动 */

/* 地区识别表: 中文名匹配(国旗 emoji 不进正则,中文词覆盖主流机场命名;英文缩写
 * 误伤率高不收——如 HK 会撞 HKG 机场代码) */
export const SUB_REGIONS = ['香港', '台湾', '日本', '韩国', '新加坡', '美国', '英国', '德国', '法国', '加拿大', '澳大利亚', '印度', '泰国', '越南', '马来西亚', '菲律宾', '巴西', '荷兰', '土耳其', '阿根廷', '俄罗斯'];

export function subRegionOf(name) {
  const s = String(name || '');
  for (const r of SUB_REGIONS) if (s.indexOf(r) >= 0) return r;
  return '';
}

/* 信息节点/分隔符识别(v2.2.1 信息节点经验收编;行正则与面板展示同步维护) */
export const SUB_INFO_RE = /剩余流量|到期|官网|套餐|重置|流量[:：]|^---$|^【.+】$/;
const SUB_TRANSIT_RE = /中转|国内/;
const escRe = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 过滤结构归一(loadConf 旧配置无 filter 字段时补全默认) */
export function normSubFilter(f) {
  const o = (f && typeof f === 'object') ? f : {};
  const arr = k => Array.isArray(o[k]) ? o[k].filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 50) : [];
  return {
    autoInfo: o.autoInfo !== false,
    autoTransit: o.autoTransit !== false,
    kws: arr('kws'),
    keep: arr('keep'), /* v2.7.7 手动保留覆盖:规则判排除但用户点保留的节点 */
    drop: arr('drop'),  /* v2.7.7 手动排除覆盖:规则判保留但用户点排除的节点 */
    regions: (o.regions && typeof o.regions === 'object') ? o.regions : {}
  };
}

/* 各排除段 pattern(预览分类与总正则同源):
 * 返回数组 [[类别, pattern], ...],仅含启用且有内容的段 */
function excludeParts(flt) {
  const parts = [];
  if (flt.autoInfo) parts.push(['info', '剩余流量|到期|官网|套餐|重置|流量[:：]']);
  if (flt.autoInfo) parts.push(['sep', '^---$|^【.+】$']); /* 分隔符/地区标题行单列(v2.7.2 对齐原型分类展示) */
  if (flt.autoTransit) parts.push(['transit', '中转|国内']);
  if (flt.kws.length) parts.push(['kw', flt.kws.map(escRe).join('|')]);
  const off = Object.keys(flt.regions).filter(k => flt.regions[k] === false && k !== '其他');
  if (off.length) parts.push(['region', off.map(escRe).join('|')]);
  if (flt.drop.length) parts.push(['drop', flt.drop.map(escRe).join('|')]); /* 手动排除进引擎正则(合并模式 JS 层亦生效;手动保留仅 JS 层,RE2 无例外语法) */
  return parts;
}

/* 引擎 exclude-filter 总正则;无任何排除段返回 ''(调用方不写字段) */
export function buildSubExclude(flt) {
  const parts = excludeParts(normSubFilter(flt));
  return parts.length ? parts.map(p => '(?:' + p[1] + ')').join('|') : '';
}

/* v2.7.0 地区「其他」排除(用户产品决策: 广州等未识别节点归其他,勾掉即排除):
 * 「其他」被取消勾选时启用 include 白名单=勾选中的已知地区词——名字不含任何勾选地区
 * 即被排除(未识别节点/被取消勾选地区都不匹配);RE2 兼容(纯 alternation,无 lookahead)。
 * 保留总式: !exclude.test(n) && (!include || include.test(n)) */
export function buildSubInclude(flt) {
  const f = normSubFilter(flt);
  if (f.regions['其他'] !== false) return '';
  const on = Object.keys(f.regions).filter(k => f.regions[k] === true && k !== '其他');
  if (!on.length) return '^$'; /* 已知地区全取消+其他也取消=全滤(保存守卫会拦) */
  return '^(?:.*(?:' + on.map(escRe).join('|') + ').*)$';
}

/* 预览: names(节点名数组)×filter → 逐类计数+保留列表;
 * 判定顺序=引擎语义的类别分解: 先 exclude 段(info→transit→kw→region,先命中先归因),
 * 再 include(未命中 include 归 region——“其他”排除) */
/* 预览/判定: 规则层(exclude/include)之上叠加手动覆盖——drop 优先于 keep(同在两表时从严);
 * over[n]: '+'=手动保留(规则本排除) '-'=手动排除(规则本保留) 无键=纯规则结果 */
export function previewSubFilter(names, flt) {
  const f = normSubFilter(flt);
  const parts = excludeParts(f).filter(p => p[0] !== 'drop').map(p => [p[0], new RegExp(p[1])]); /* drop 不走规则段(手动层统一判) */
  const inc = buildSubInclude(f);
  const incRe = inc ? new RegExp(inc) : null;
  const keepSet = new Set(f.keep); const dropSet = new Set(f.drop);
  const res = { kept: [], info: 0, sep: 0, transit: 0, kw: 0, region: 0, drop: 0, over: {} };
  for (const nm of (Array.isArray(names) ? names : [])) {
    const n = String(nm || '');
    let ruleHit = '';
    for (const [cls, re] of parts) { if (re.test(n)) { ruleHit = cls; break } }
    if (!ruleHit && incRe && !incRe.test(n)) ruleHit = 'region';
    if (dropSet.has(n)) { res.drop++; res.over[n] = '-' } /* 手动排除: 覆盖一切(含规则保留/keep) */
    else if (ruleHit && keepSet.has(n)) { res.kept.push(n); res.over[n] = '+' } /* 手动保留: 覆盖规则排除 */
    else if (ruleHit) res[ruleHit]++;
    else res.kept.push(n);
  }
  res.total = res.kept.length + res.info + res.sep + res.transit + res.kw + res.region + res.drop;
  return res;
}
