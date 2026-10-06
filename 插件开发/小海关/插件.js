import { wait, esc, shq, toB64, b64d, p2, ct, pInt, latClr, okMac, isPrivacyMac, devIconOf, okCidr, okV6, HS_INFO_PAT, lineGName, linePoolName, PS_TXT, psTxt, lineDefOf, nowStr, stampStr } from './src/工具.js';
import { hsUploadByApi, run } from './src/面板接口.js';
import { extractSubBlocks, firstSelectGroup, subYaml, subRegionOf, buildSubExclude, buildSubInclude, previewSubFilter, normSubFilter, extractNodeNames } from './src/订阅解析.js';
import { N6_COMMAND, hasUdpDownload, buildReadinessCommand, parseReadiness } from './src/状态采集.js';
import { generateStartScript } from './src/启动脚本.js';
import { riverMarkup, riverRender, riverClose } from './src/分流河流.js';
/* ============================================================================
 * 小海关 · 可控 Clash(Mihomo 内核) 插件 for UFI-TOOLS-ZWRT 面板
 * 平台: UFI-TOOLS-ZWRT(1.0.0) · 依据《(1.0.0)插件开发文档》(docs/(1.0.0)插件开发文档.md)适配
 *   本文件为模块入口,通过构建脚本合并依赖并生成带 <script> 包裹的单文件发行版;
 *   源码与构建产物均不得携带旧包裹标记与旧平台私有字符串(商店 hard-rule 拒审)
 * ----------------------------------------------------------------------------
 * 数据目录: /data/plugins/customs/(版本常量见 const V;界面卡片/弹窗标题均显示)
 *
 * 【静默纪律(硬性)】页面数据只在页面动作时采集;无后台轮询/watchdog/crontab/
 *   loop.sh;唯一 setInterval=日志页签激活期 1.5s 前台刷新,离开即停;设备侧常驻仅 mihomo。
 * 【共存兼容】流量链 RFC1918 私网排除 + 消费 ET state.json 排除网段/打洞端口;
 *   DNS 链不豁免私网(防网关 DNS 绕过泄露,v1.1.0);类名全 hs- 前缀;自启行独立 KEY。
 * 【双实例防护】window.__customs_loaded 守卫,重复加载大声警告不静默(v1.1.2 事故)。
 *
 * 功能模块(全部已实现):
 *   内核安装: 多源下载+进度条+引导页+上传兜底+启动自检自动补 GeoIP/GeoSite/chnroute
 *   配置生成: config.yaml(端口/DNS fakeip+DoH/tproxy-port/proxy-providers/四模式组链
 *             /分设备线路组+节点池(provider filter)/GEO 规则按文件存在条件化)
 *   订阅管理: 添加/切换/下载缓存+mihomo -t 校验+信息徽章+手动节点(ss/vmess/trojan)
 *   透明接管: fw.sh v3(v4 TCP REDIRECT + v4/v6 UDP TPROXY 主路径+TUN 降级/DNS 全量劫持
 *             + v6 对称 TCP 接管);白名单 hash:mac ipset(MAC 门控);无感启停;
 *             start.sh 自带接管挂载兜底(开机自启场景 JS 不在场,探活后自动 fw.sh apply)
 *   升级对账: 三件套烙 #gen:版本号,init 语义化比对→待升级状态常驻(卡片徽标/总览条/
 *             底栏按钮)+配置页自动弹更新内容卡(CHANGELOG 区间展示)一键升级+完成后烙印复核
 *   配置事务: last_good 快照→应用→健康验证→失败自动回退;节点 UDP 能力自适应检测
 *   节点管理: 9090 恒开;组/节点/延迟/TCP+UDP 测速/四模式热切换
 *   诊断修复: 双态全项检查(进程/线路/订阅/DNS/日志/MAC健康/资源)+一键修复
 *             (自动/确认/参数/手动四档)+参数编辑页;商店直删 start.sh 自愈哨兵
 *   基础设施: 配置导出导入/卸载零残留/自启(keep|safe)/日志(开关+级别+256KB 上限)/自愈
 * ==========================================================================*/
(() => {
if (window.__customs_loaded) {
  /* 双实例警告: 同时装了 txt 发行版+js 源码版(或重复粘贴)时,后加载的会被本守卫静默跳过——
     表现为"粘贴了新版但行为是旧版",2026-09-02 排查数小时的真因。大声提示而非静默 return */
  const m = '⚠️ 检测到小海关重复加载,本次已跳过——面板里可能同时安装了两份(txt 发行版+js 源码版),请只保留一份';
  console.warn('[小海关]', m);
  /* v1.8.5: 按文档签名 createFixedToast(id, html, color) 调用——此前参数错位(id=整条消息、html='red'),
     这条"重复加载"警告是用户唯一的线索,却渲染成内容为 red 的气泡(2026-09-13 审查 P2) */
  try { if (typeof createFixedToast === 'function') { const t = createFixedToast('hs_dup_warn', '<div style="pointer-events:all;padding:8px;max-width:320px">' + m + '</div>', 'red'); if (t && t.close) setTimeout(() => t.close(), 6000) } } catch (e) { }
  return;
}
window.__customs_loaded = true;

/* ================= 常量 ================= */
const V = '2.9.58'; /* v2.9.58: ET 共存 state.json 降级抽取补全——对端文件持续非法 JSON(实锢:ET 插件 infra_endpoints joiner 少引号,≥2 端点即恒非法)时降级对象缺 updated/tun/config_server,致「更新于 ?」恒显+TUN 行消失+防火墙 ETTUN/ETCS 兜底恒空;现降级也抽齐三字段,降级后净读重试一次救瞬态半文件,warn 会话降噪;携 v2.9.57(订阅有效期方案B+卡片去图标)一并转正,用户真机验收通过 */ /* v2.9.57(beta): 订阅有效期方案B+订阅卡片去图标——①响应头有流量数据却无 expire→自动判长期有效(中国国际机场实证) ②卡片图标全撤(徽章/流量行/meta/按钮/编辑卡共17处,用户反馈移动端按钮放不下),页头「＋添加订阅」保留 */
/* 在线使用说明(新用户入门引导页,2026-10-02 上线) */
const GUIDE_URL = 'https://artificial-lavender-zhzg63cn.edgeone.dev/';
/* 版本变更摘要(升级弹卡展示用,新版本在此顶部加一行;只记用户可感知的要点,不追全量) */
/* 版本变更摘要(升级弹卡展示用,新版本在此顶部加一行;仅保留最近5个版本,更早的进仓库CHANGELOG.md) */
const CHANGELOG = {
  '2.9.58': 'ET 共存 state.json 降级抽取补全:对端文件持续非法 JSON 时(实锇:ET 插件 infra_endpoints joiner 少引号,≥2 外联端点起文件恒非法→小海关每次解析必炸恒走降级,而降级对象缺 updated/tun)「更新于 ?」恒显+TUN 网卡行消失;现降级对象补抽 tun/config_server/updated(防火墙 ETTUN/ETCS 兜底同步复活),降级后 350ms 净读重试一次救瞬态半文件,console.warn 会话只提示一次不再刷屏;ET 侧一字符根修另报',
  '2.9.57': '①订阅有效期方案B:服务端发了流量数据却未给 expire→自动判「长期有效」(此前此类订阅正文又无"长期/永久"字样则什么都不显示;实证:中国国际机场 expire=空+正文零线索,良心云靠正文信息节点"套餐到期：长期有效"字样兜底);正文若补抓到具体到期日期仍会覆盖为日期,自动判定可被纠正 ②订阅卡片图标全撤(徽章/流量行/meta/按钮/编辑卡 17 处):表情图标挤占按钮空间,移动端放不下(用户反馈),页头添加按钮保留',
  '2.9.56': '修复 v6 开关自诞生失效(pr 未声明+未 await)+新手引导✕复活+卸载取消语义+UDP实测异常防护',
  '2.9.55': '分流图兜底胶囊限宽(PC 真机反馈宽达 ~210px):第⑤层胶囊文本=「兜底 +出口文本」,v2.9.53 起出口含节点名+延迟(断链时甚至是全链)且宽度公式全长×9.8 无上限,长节点名直接撑爆;现按「名 · Nms[ ·未测活]」拆分,名超预算截…(延迟/存活后缀保留),总宽 13 单位封顶;宽度公式改按字符类别估宽(全宽1/ASCII .56×fs×1.1 余量,替代全长×9.8);胶囊加 title 悬停显全文,全链仍在详情卡「兜底出口」行;副标(节点名行)同步限宽;补 v2.9.53 欠的出口文本 esc(模块纪律:用户数据一律 esc)',
  '2.9.54': '移动端弹窗控件叠压根修(用户反馈+本人手机复现:节点过滤弹窗关键词输入框/地区保留/实时预览挤到一块):根因=弹窗体 .hs-mb 是被 86dvh 卡死的 flex 列且 overflow:hidden,内容超高时收缩压力全压在带 min-height:42px 的 .hs-row 上(显式 min-height 顶掉 auto 内容下限,实测行 clientH 91 vs scrollH 97),行内容溢出行盒、输入框与地区胶囊压进邻行;修复=①.hs-row 加 flex 永不压缩(全部弹窗受益) ②.hs-mb 改纵向可滚(溢出走滚动不再裁死) ③救活 v2.9.6 移动端左右边距 16→0 决策(被同优先级后定义覆盖失效,规则移回基定义之后) ④实时预览两列 ≤480px 纵排(窄屏两列胶囊省略号过重)',
}; /* 超5版删最底(2.8.10) */
/* 语义化版本比较: a<b 负 / 相等 0 / a>b 正 */
function verCmp(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d }
  return 0;
}
const DIR   = '/data/plugins/customs';
const BIN   = DIR + '/mihomo';
const CFG   = DIR + '/config.yaml';
const CJ    = DIR + '/config.json';
const LOGF  = DIR + '/customs.log';      // 运行日志(开关控制,/dev/null 或此文件)
const OPLOG = DIR + '/plugin.log';       // 操作日志(append-only,256KB 轮转)
const START = DIR + '/start.sh';
const FW    = DIR + '/fw.sh';
const BOOT_SH  = '/data/plugins/ufi_tools_boot.sh'; /* ZWRT(文档 §6.2): 多插件共享自启文件,只追加/按 KEY 定向删自身行 */
const BOOT_KEY = 'plugins/customs';
/* v1.8.5: 移除 `sleep 2 && fw.sh apply` 盲挂——2 秒时面板/引擎未必就绪(start.sh 哨兵段最坏先等 16-24s),
   规则先挂=全终端 TCP 断到引擎起来;接管统一交给 start.sh 的"就绪后挂载"分支(自带 flock)(2026-09-13 审查 P1) */
const bootLine = () => '[ -f ' + START + ' ] && sh ' + START + ' # plugins/customs';
let HS_MANUAL = []; let HS_MANUAL_LOADED = false; let HS_SUBINFO_ALL = undefined; let HS_LAST_RF = ''; /* SUBINFO_ALL={i:{left,expire}} 全订阅流量/到期(订阅卡徽章,v2.7.0: 每订阅独立,不再只激活) */
let HS_DEBUG_TIMER = null;
let HS_SUB_RAW = ''; /* 活动订阅原文缓存(genConfigYaml 同步函数读不了文件;loadConf/downloadSub/切订阅三处刷新) */
let HS_SUB_RAW_KEY = ''; /* 缓存对应的订阅下标,防串 */
let HS_SUB_RAW_ALL = null; /* v2.7.0 融合: 全部订阅原文缓存 {下标:txt};融合开关/订阅增删/更新时失效重建 */
let HS_SUB_EDIT = -1; /* 订阅表单编辑态:-1=添加模式,>=0=正在编辑 C.subs[i](改名/换链接);删除订阅时须同步修正此下标 */
let HS_SUB_NEW = false; /* v2.7.8 新建卡片态: 点「＋添加订阅」在列表顶部插入编辑卡(替代底部常驻表单) */
const PORT_DEF = { mixed: 7890, redir: 7892, tproxy: 7893, dns: 1053, ctrl: 9090 };

/* ================= 工具 ================= */
const $  = s => document.querySelector(s);
/* 面板接口 XHR 通道: 免疫浏览器/面板对 fetch 的封装掐断(长操作曾报 AbortError: signal is aborted without reason——
   首装场景启动链路被拖长时 fetch 封装超时中止,XHR 不受影响) */
/* v2.0.1: hsXhr 已随 XHR 兜底通道移除而删除(死代码清理,唯一调用方 hsRunShell 已改 fetch) */
const $$ = s => Array.from(document.querySelectorAll(s));
/* ZWRT 就绪等待(文档 §2 模板 waitFor): 有界轮询 DOM 锚点,超时返回 null 由调用侧自行兜底 */
const waitFor = async (selector, timeout = 10000) => {
  const until = Date.now() + timeout;
  let node = document.querySelector(selector);
  while (!node && Date.now() < until) { await wait(100); node = document.querySelector(selector); }
  return node;
};
let HS_LAST_ERR = ''; /* 最近一次启动/校验失败原因(升级失败窗展示) */
let HS_UPGRADING = false; /* 升级进行中:三形态入口冻结,防并发操作 */
let HS_UPG_OK = false; /* 升级成败判定:engineStart 复核通过才置真(engineRestart 返回值会被 stop 的边缘失败污染) */


function toast(msg, color) {
  if (typeof createToast === 'function') { createToast(msg, color || 'green', 2600); return }
  console.log('[小海关]', msg);
}

/* 文件读写(小配置,base64 往返;.bak 备份) */
async function readFile(p) {
  const r = await run('base64 < ' + shq(p) + ' 2>/dev/null', 8000);
  if (!r.success || !r.content.trim()) return '';
  return b64d(r.content.replace(/\s+/g, ''));
}
/* base64 小文本豁免闸门(文档 §5.3: 仅插件目录内固定路径的小文本可 Base64 绕转义,
   大文件必须走 §5.2 上传接口):合并/直通模式下 config.yaml 内嵌整段订阅可达数百 KB
   (订阅 provider 本体即数百 KB,审计 v2.0.6),base64 拼接 shell 会撞命令长度上限——
   >64KB 改 upload_file 直传临时文件到插件目录,再 mv 原子归位(同目录,快照/校验同款) */
const HS_WFILE_MAX = 64 * 1024;
async function writeFile(p, content) {
  const size = new TextEncoder().encode(content).length;
  if (size <= HS_WFILE_MAX) {
    await run('mkdir -p ' + shq(DIR) + ' 2>/dev/null; [ -f ' + shq(p) + ' ] && cp ' + shq(p) + ' ' + shq(p) + '.bak 2>/dev/null; printf %s ' + shq(toB64(content)) + ' | base64 -d > ' + shq(p), 10000);
  } else {
    let up = null;
    try { up = await hsUploadByApi(new File([content], '.hs_wtmp', { type: 'text/plain' }), DIR) }
    catch (e) { console.error('[小海关] 大文本直传失败:', e); return false }
    if (!up || !up.path) { console.error('[小海关] 直传响应缺落盘路径'); return false }
    const mv = await run('mkdir -p ' + shq(DIR) + ' 2>/dev/null; [ -f ' + shq(p) + ' ] && cp ' + shq(p) + ' ' + shq(p) + '.bak 2>/dev/null; mv -f ' + shq(up.path) + ' ' + shq(p), 10000);
    if (!mv.success) { await run('rm -f ' + shq(up.path) + ' 2>/dev/null', 5000); console.error('[小海关] 直传归位失败:', (mv.content || '').slice(0, 60)); return false }
  }
  const chk = await run('wc -c < ' + shq(p) + ' 2>/dev/null', 5000);
  return (chk.content || '').trim() === String(size);
}
function copyTo(t) {
  const done = () => toast('已复制: ' + t, 'green');
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done() } catch (e) { toast('复制失败,请长按手动复制', 'red') }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(fb);
  else fb();
}
function dl(name, txt) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000);
  toast('已导出: ' + name, 'green');
}

/* 操作日志(默认关时不记录;>256KB 轮转 .old 留一代) */
async function opLog(msg) {
  /* v2.0.3: 操作日志改为默认常开(审计语义)——安装内核/订阅变更/规则增删等动作应始终在案,
     与 logEnabled(仅控制引擎运行日志 stdout 落盘)解耦;用户反馈:装插件后没开日志开关,安装内核全程无记录(2026-10-01)。
     体量: append-only + 256KB 轮转(>256KB 转 .old),每次一条,弱 CPU 无感 */
  await run('SZ=$(wc -c < ' + shq(OPLOG) + ' 2>/dev/null || echo 0); [ "$SZ" -gt 262144 ] 2>/dev/null && mv ' + shq(OPLOG) + ' ' + shq(OPLOG) + '.old 2>/dev/null; echo ' + shq('[' + nowStr() + '] ' + msg) + ' >> ' + shq(OPLOG), 5000);
}

/* ================= 配置(持久化 config.json) ================= */
const DEF = {
  s1: 'off', s2: false, s2Keep: 5, mode: 'auto', pausedAuto: false, manualNode: '',
  logEnabled: false, logLevel: 'info',
  ports: Object.assign({}, PORT_DEF), tunName: 'hs0',
  iv: 300, lowMem: false, autostart: false, bootMode: 'keep',
  coexistAuto: false, exclude: [], force: [], cnBypass: true, cardMode: 'full', upgBackup: null, ctrlLan: false, policySrc: 'self', v6Dns: false, diagIgnore: [], /* v2.2.2: 诊断忽略清单(键=fix.id 或 分组|条目名;忽略项不计警示不打扰,报告里可随时取消)  v2.8.0-beta: IPv6 直连实验(恢复 AAAA),默认关 */
  devices: [],            // {ip,mac,name,proxy,line}  line=线路id,空=跟随全局
  lines: [],              // {id,name,mode:auto|balance|fallback|node,node} 分设备线路
  subs: [],               // {name,url,time,filter}  filter=节点过滤规则(v2.7.0,见 normSubFilter)
  activeSub: -1,
  subFusion: false,       // 多订阅节点融合(仅合并模式;开启后全部订阅节点合并进池,引擎 override 前缀防撞名)
  removedMacs: [],        // 已忽略设备 [{mac,name,time}](v2.7.0 黑名单防 ARP/DHCP 残留复活;v2.7.9 存名字可辨认;上限 50)
  ver: '', secret: '', kernelMirror: '' /* 自定义内核直连源(完整 .gz URL,用户自有国内主机/OSS;空=不用) */
};
let C = Object.assign({}, DEF);
C.ports = Object.assign({}, DEF.ports);
/* 订阅原文缓存刷新(genConfigYaml 同步,读文件必须在异步侧完成): useSubConf 开启/订阅更新/切换订阅三时机调用 */
async function refreshSubRaw() {
  const key = String(C.activeSub);
  if (key !== HS_SUB_RAW_KEY || !HS_SUB_RAW) {
    HS_SUB_RAW = ''; HS_SUB_RAW_KEY = key;
    if (C.activeSub >= 0 && C.subs[C.activeSub]) HS_SUB_RAW = await readFile(DIR + '/providers/sub' + C.activeSub + '.yaml');
  }
  /* v2.7.0 融合: 开启且合并模式时预载全部订阅原文(只读一次缓存于内存,genConfigYaml 同步消费);
     签名含每订阅 url+更新时间+过滤规则——任一变化(更新/过滤保存/换链接)即重建,防 stale
     (审查问题3: 旧签名只看存在性,非激活订阅更新后融合池仍用旧内容) */
  if (C.subFusion && C.policySrc === 'merge') {
    const sig = C.subs.map(s => s ? [s.url, s.time || '', JSON.stringify(s.filter || null)].join('|') : '').join(';');
    if (HS_SUB_RAW_ALL && HS_SUB_RAW_ALL._sig === sig) return;
    const all = { _sig: sig };
    for (let j = 0; j < C.subs.length; j++) {
      if (!C.subs[j] || !C.subs[j].url || j === C.activeSub) continue;
      all[j] = await readFile(DIR + '/providers/sub' + j + '.yaml');
    }
    HS_SUB_RAW_ALL = all;
  } else HS_SUB_RAW_ALL = null;
}
/* v2.7.0 融合生效判定: 该订阅是否参与当前运行配置(激活 或 融合开启的合并模式全部订阅)——
   更新/过滤保存后的热重载决策用(审查问题3: 融合下非激活订阅也是生效节点池,不能当"未生效"跳过) */
function subEffective(i) {
  return i === C.activeSub || (C.subFusion && C.policySrc === 'merge' && i >= 0 && !!C.subs[i]);
}
/* 当前实际主组名: 自建=🚀 节点选择;直通=订阅首个 select 组(取不到回退 GLOBAL 内置组)。
   UDP 探测/线路节点池等处曾写死自建组名,直通模式下组不存在→404/空列表(2026-09-12 用户实锤:UDP 测全失败+线路选不了节点) */
function hsMainGroup() {
  if (C.policySrc !== 'direct') return '🚀 节点选择'; /* 合并模式下主组=本地组链 */
  return firstSelectGroup(HS_SUB_RAW) || 'GLOBAL';
}
async function loadConf() {
  let txt = await readFile(CJ);
  let j = null;
  if (txt) { try { j = JSON.parse(txt) } catch (e) { j = null } }
  /* 主配置损坏 → 自动回退 writeFile 落盘的 .bak(写前快照),.bak 也坏才用默认;
     曾是纯手动救命文件,现在拥有自动消费路径 */
  if (!j) {
    const bk = await readFile(CJ + '.bak');
    if (bk) { try { j = JSON.parse(bk); opLog('配置损坏,已自动回退 .bak 备份') } catch (e) { } }
  }
  if (j) { delete j.apiEnabled; C = Object.assign({}, DEF, j); C.ports = Object.assign({}, PORT_DEF, j.ports || {}) }
  /* v1.8.2: useSubConf(布尔) → policySrc(三态 self/merge/direct) 一次性迁移 */
  if (C.useSubConf !== undefined) { if (!j.policySrc) C.policySrc = C.useSubConf ? 'direct' : 'self'; delete C.useSubConf }
  sanitizeConf(); /* v1.8.5: 手改/损坏的 config.json 同口径过滤 */
  if (C.policySrc !== 'self') await refreshSubRaw(); /* 订阅直通/合并模式的配置合成依赖订阅原文 */
}
async function saveConf() {
  /* v2.9.24: 清单规模变动强制留痕——强/排除清单条数变化写操作日志(真机实锢: 升级后 force 清单丢失且无迹可查,.bak 回退只防 JSON 损坏防不了"合法但被清空"的写入) */
  try {
    const prev = await readFile(CJ);
    if (prev) {
      const pj = JSON.parse(prev);
      const pf = (pj.force || []).length, pe = (pj.exclude || []).length;
      const cf = (C.force || []).length, ce = (C.exclude || []).length;
      if (pf !== cf || pe !== ce) opLog('清单变动留痕: 强制 ' + pf + '→' + cf + ' 条, 排除 ' + pe + '→' + ce + ' 条');
    }
  } catch (e) { }
  const ok = await writeFile(CJ, JSON.stringify(C, null, 2)); if (!ok) toast('配置保存失败(磁盘?)', 'red'); return ok;
}

/* ================= 运行态缓存(仅事件触发时刷新) ================= */
let ST = { bin: false, pid: '', boot: false, listen: {}, tun: false, kb: 0, rlog: 0, olog: 0, chn: 0, chn6: 0, arp4: {}, neigh6: {}, rss: 0, conn: 0 };
let HS_COLLECT_BUSY = false; /* 审查P2-6: 并发守卫——外部连点刷新与探活循环并发时防 ST 乱序覆盖 */
async function collectStatus() {
  if (HS_COLLECT_BUSY) return ST; /* 在途采集进行中: 直接回当前状态(旧值自洽,下次动作再刷新) */
  HS_COLLECT_BUSY = true;
  try {
  const P = C.ports;
  const cmd = 'D=' + shq(DIR) + ';'
    + 'echo =BIN=$([ -x $D/mihomo ] && echo 1);'
    + 'PIDS=""; for Q in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$Q/exe 2>/dev/null)" = ' + shq(BIN) + ' ] && PIDS="$PIDS $Q"; done; echo =PID=$PIDS;' /* F15: 所有权核验,同名他装不计入 */
    + 'echo =BOOT=$(grep -cF ' + shq(BOOT_KEY) + ' ' + shq(BOOT_SH) + ' 2>/dev/null);'
    + 'echo =LM=1;'
    + 'echo =LR=1;'
    + 'echo =LD=1;'
    + 'echo =LC=1;'
    + 'echo =TUN=$(ip link show ' + shq(C.tunName) + ' 2>/dev/null | wc -l);'
    + 'echo =KB=$(du -sk $D 2>/dev/null | awk \'{print $1}\');'
    + 'echo =RSS=$(R=$(echo $PIDS | awk \'{print $1}\'); [ -n "$R" ] && grep VmRSS /proc/$R/status 2>/dev/null | awk \'{print $2}\' || echo 0);' /* v2.5.0: 引擎内存 kB——用已核验 PIDS,不裸 pidof */
    + 'echo =CONN=$(netstat -tn 2>/dev/null | grep -c ESTABLISHED);' /* v2.5.0: 连接数近似(netstat ESTABLISHED 总行数,最简无开销) */
    + 'echo =RL=$(wc -c < $D/customs.log 2>/dev/null || echo 0);'
    + 'echo =GI=$([ -f $D/geoip.metadb ] && stat -c%Y $D/geoip.metadb 2>/dev/null || echo 0);'
    + 'echo =GS=$([ -f $D/geosite.dat ] && stat -c%Y $D/geosite.dat 2>/dev/null || echo 0);'
    + 'echo =CHN=$(wc -l < $D/chnroute.txt 2>/dev/null || echo 0);'
    + 'echo =CHN6=$(wc -l < $D/chnroute6.txt 2>/dev/null || echo 0);'
    + 'echo =N4=$(cat /proc/net/arp 2>/dev/null | tail -n +2 | awk \'$4!="00:00:00:00:00:00"{printf "%s~%s ", $1, $4}\');'
    + N6_COMMAND
    + 'echo =OL=$(wc -c < $D/plugin.log 2>/dev/null || echo 0);'
    + 'echo =S2X=$([ -f $D/.s2expired ] && echo 1);'
  const r = await run(cmd, 12000);
  const o = { bin: false, pid: '', boot: false, listen: {}, tun: false, kb: 0, rlog: 0, olog: 0, chn: 0, arp4: {}, neigh6: {}, rss: 0, conn: 0 };
  (r.content || '').split('\n').forEach(l => {
    /* v1.9.1 修: [A-Z]+ 不含数字——=CHN6=/(N4/N6 等带数字字段名)的行永远匹配不上被静默跳过,
       ST.chn6 恒 0(体检误报"完整表未装"+每次启动重复下载)+ST.neigh6 恒空(分设备线路 v6 自动跟随失效) (2026-10-01 设备 A/B/C 实测定位) */
    const m = l.match(/^=([A-Z0-9]+)=(.*)$/); if (!m) return;
    const v = (m[2] || '').trim();
    if (m[1] === 'BIN') o.bin = v === '1';
    else if (m[1] === 'PID') o.pid = v;
    else if (m[1] === 'BOOT') o.boot = v !== '0' && v !== '';
    else if (m[1] === 'TUN') o.tun = v !== '0';
    else if (m[1] === 'KB') o.kb = parseInt(v) || 0;
    else if (m[1] === 'RL') o.rlog = parseInt(v) || 0;
    else if (m[1] === 'OL') o.olog = parseInt(v) || 0;
    else if (m[1] === 'GI') o.geoIpT = parseInt(v) || 0;
    else if (m[1] === 'GS') o.geoSiteT = parseInt(v) || 0;
    else if (m[1] === 'CHN') o.chn = parseInt(v) || 0;
    else if (m[1] === 'RSS') o.rss = parseInt(v) || 0; /* v2.5.0: 引擎内存 kB */
    else if (m[1] === 'CONN') o.conn = parseInt(v) || 0; /* v2.5.0: 连接数近似 */
    else if (m[1] === 'CHN6') o.chn6 = parseInt(v) || 0;
    else if (m[1] === 'N4' || m[1] === 'N6') {
      const nm = m[1] === 'N4' ? (o.arp4 = {}) : (o.neigh6 = {});
      v.split(/\s+/).forEach(x => { const i = x.indexOf('~'); if (i > 0) nm[x.slice(0, i)] = x.slice(i + 1) });
    }
    else if (m[1] === 'S2X') o.s2x = v === '1';
    else o.listen[m[1]] = v !== '0' && v !== '';
  });
  o.running = !!o.pid;
  if (!o.running) { o.listen = {} } /* 进程没跑,端口全 false */
  else {
    ST.listen = {};
    const readiness = await run(buildReadinessCommand(P, C.secret, o.pid), 5000);
    if (!readiness.success) throw new Error('引擎监听状态采集失败');
    o.listen = parseReadiness(readiness.content, P);
  }
  /* 升级对账状态跨刷新保留: ST 是整体替换,不带上会让 upgradePending/upgradeFrom 在每次 collectStatus 后丢失 */
  o.upgradePending = ST.upgradePending;
  o.upgradeFrom = ST.upgradeFrom;
  o.downgraded = ST.downgraded;
  /* 孤儿蒙层自愈: 蒙层在但 simple 弹窗已隐藏/不存在(任何未预期路径)→清,防全页锁死 */
  if (document.getElementById('hs_upg_mask') && upgCardClosed()) rmUpgMask();
  ST = o; HS_LAST_RF = new Date().toTimeString().slice(0, 8);
  /* 节点 UDP 能力事件探测: 仅探测+留痕, 不再自动降级——
     曾按"探测失败放行 UDP443/8443 直连"设计,实测误伤: 封 UDP:53 的机场(常见)必被判失败,
     而大量游戏网关恰用 UDP443(QUIC),被放直连=外服必死;浏览器 QUIC 黑洞会自行回退 TCP 无需人工放行(2026-09-02 游戏实测复盘) */
  probeNodeUdp().catch(() => { });
  /* 本机代理限时到账对账: 设备侧已摘 OUTPUT 接管,此处归位配置并重烙 fw.sh(事件驱动) */
  if (C.s2 && o.s2x) {
    C.s2 = false;
    run('rm -f ' + DIR + '/.s2timer.pid ' + DIR + '/.s2expired', 5000).catch(() => { });
    saveConf().then(() => reapplyFw()).catch(() => { });
    opLog('本机代理限时到期,已自动关闭(OUTPUT 接管已摘,面板直连恢复)');
    renderCard();
  }
  /* 运行日志 256KB 硬上限(仅排查用,256KB 足够记录完整复现过程;debug 级增长极快也拦住)。
     截断不换文件,引擎 fd 继续追加;事件驱动(每次状态采集顺带检查),符合无轮询纪律 */
  if (o.rlog > 262144) {
    run(': > ' + shq(LOGF) + ' 2>/dev/null', 5000).then(r => {
      if (r.success) { ST.rlog = 0; opLog('运行日志超256KB已自动清理(' + Math.round(o.rlog / 1024) + 'KB→0,如需完整日志请在复现后尽快导出)') }
    }).catch(() => { });
  }
  /* 分设备线路地址自动跟随: 地址集变化→静默热重载(签名防抖;失败下次刷新重试) */
  syncLineRules().catch(() => { });
  /* 审查 P1-1: ET 组网变化跟随(fw 排除面同步;仅 coexistAuto+接管中) */
  syncEtRules().catch(() => { });
  /* 审查P2-9: start.sh 探活失败标记——引擎启动慢首次未挂规则,提示用户手动重应用 */
  run('[ -f ' + DIR + '/.bootmiss ] && rm -f ' + DIR + '/.bootmiss && echo 1', 3000).then(r => { if ((r.content || '').trim() === '1') { toast('引擎启动较慢,首次接管未挂载——已跳过防黑洞,请手动点「重启引擎」或「重新应用规则」', 'orange', 6000); opLog('启动慢提示: 首次接管未挂载(.bootmiss)——用户需手动重应用'); } }).catch(() => { });
  return o;
  } finally { HS_COLLECT_BUSY = false }
}
/* 节点 UDP 能力探测: 对主组发 udp DNS 延迟测试,失败=节点不支持 UDP 转发
   (游戏/QUIC 流量送进去就是黑洞)。结果缓存 10 分钟,事件驱动调用。 */
let HS_UDP_OK = null; let HS_UDP_T = 0;
let HS_UDP_PREV = null; /* 审查P2: UDP 探测日志去重——状态变化才记(首次/由通转断),持续失败不重复 */
let HS_UDP_BUSY = false; /* v1.8.5: in-flight 守卫——启动探活 8 次 collectStatus 期间会并发多次探测(审查 P2) */
async function probeNodeUdp() {
  if (!ST.running) { HS_UDP_OK = null; return HS_UDP_OK }
  if (HS_UDP_OK !== null && Date.now() - HS_UDP_T < 600000) return HS_UDP_OK;
  if (HS_UDP_BUSY) return HS_UDP_OK;
  HS_UDP_BUSY = true;
  try { return await probeNodeUdpInner() } finally { HS_UDP_BUSY = false }
}
async function probeNodeUdpInner() {
  if (!ST.running) { HS_UDP_OK = null; return HS_UDP_OK }
  HS_UDP_T = Date.now();
  /* 唯一证据=真实流量: 经节点出链且下行>0 的 UDP 连接(QUIC 等)——节点封 UDP:53 是机场惯例,
     用 DNS 探测会把"封53但UDP可用"误判成无 UDP(真机教训)。
     v2.7.0: 删除 udp://8.8.8.8:53 假探测兑底——引擎 delay 接口仅认 http/https(Meta adapter.go
     urlToMetadata 源码实证),udp:// 从未生效恒报失败,产生误导日志;无流量证据时=未知(null),
     节点级真实实测改走 tunnels 隧道方案(节点页 🛰️ 测UDP 按钮调 probeUdpViaTunnel) */
  try {
    const cs = await apiGet('/connections');
    const mg = hsMainGroup();
    const ev = hasUdpDownload(cs, mg);
    if (ev) {
      HS_UDP_OK = true;
      run('iptables -t mangle -C HS_UDP -p udp -m multiport --dports 443,8443 -j RETURN 2>/dev/null && iptables -t mangle -D HS_UDP -p udp -m multiport --dports 443,8443 -j RETURN; echo ok', 5000).catch(() => { });
      return HS_UDP_OK
    }
  } catch (e) { }
  HS_UDP_OK = null; /* 未知:无流量证据,不判定不降级——节点页 🛰️ 可单节点实测 */
  if (HS_UDP_PREV === true) await opLog('节点 UDP 流量证据消失(QUIC/游戏近期无 UDP 回流);已回未知态,QUIC 保持走引擎');
  HS_UDP_PREV = HS_UDP_OK;
  return HS_UDP_OK;
}
/* v2.7.0 单节点 UDP 真实实测(tunnels 隧道): 当前配置内存追加临时 udp tunnel(绑指定节点→
   8.8.8.8:53)热重载→设备 shell 用 nslookup 经隧道发真实 DNS 查询→解析成功=该节点真实
   转发了 UDP 往返;finally 恢复原配置。两次内存热重载(PUT /configs 不落盘)。
   真机实证(2026-10-04): ①busybox 无 nc applet,UDP 探测只能 nslookup(仅标准 53 口)
   ②tunnel 必须绑 WAN 口 IP:53(dnsmasq 占 LAN/回环 53,WAN 侧空闲;PUT=204+解析成功+
   BACK=204 全链验证) ③WAN 口蜂窝 NAT 后外网不可达且目标固定 8.8.8.8:53,几秒探测窗口无风险 */
let HS_UDP_PROBE_BUSY = false;
/* v2.8.9: PUT /configs 是全量重载(重解析+重连 provider),真机耗时可达 4s+——apiPut 的
   curl -m 4 会切断拿不到状态码误报失败(用户实锤)。专用长超时版(15s) */
async function apiPutSlow(path, body) {
  /* v2.9.56b: 15s→30s(真机全量重载跑流量时远超空载手测的 8s;用户实锢注入仍偶发超时);
     失败带回详情(非 204 时的 http_code+响应体前 120 字)供 why 展示——不再是黑盒 */
  const r = await run('curl -s -m 30 -X PUT -H "Authorization: Bearer ' + C.secret + '" -H "Content-Type: application/json" -w "\\n%{http_code}" -d ' + shq(JSON.stringify(body)) + ' ' + shq('http://127.0.0.1:' + C.ports.ctrl + path), 34000);
  if (!r.success) return { ok: false, why: '面板通道超时(34s)' };
  const m = (r.content || '').match(/(\d{3})\s*$/);
  const code = m ? m[1] : '000';
  if (code === '200' || code === '204') return { ok: true };
  return { ok: false, why: 'HTTP ' + code + ': ' + String(r.content || '').replace(/\s+\d{3}\s*$/, '').slice(0, 120) };
}
async function probeUdpViaTunnel(nodeName) {
  if (!ST.running) return { ok: false, why: '引擎未运行' };
  if (HS_UDP_PROBE_BUSY) return { ok: false, why: '已有实测进行中,请稍候' };
  HS_UDP_PROBE_BUSY = true;
  let HS_UDP_INJECTED = false; /* v2.9.56: 仅注入成功才恢复(auditor: 早退无谓全量重载断流) */
  try {
    /* WAN 口 IP=默认路由源 IP(dnsmasq 未监听此地址的 53,tunnel 专属) */
    const w = await run("ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++)if($i==\"src\"){print $(i+1);exit}}'", 6000);
    const WIP = (w.content || '').trim().split(/\s+/)[0] || '';
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(WIP)) return { ok: false, why: '未能获取 WAN 口 IP(无默认路由?)' };
    await refreshSubRaw();
    const baseYaml = genConfigYaml();
    if (baseYaml === null) return { ok: false, why: '配置生成失败(订阅解析异常)' };
    if (baseYaml.indexOf('\ntunnels:') >= 0) return { ok: false, why: '配置已含 tunnels,跳过(防叠加)' };
    /* v2.9.56c 根修(HAR 实锢): tunnels.proxy 只认静态 proxies/组名,不解析 provider 内节点名
       (400 'tunnel proxy 台湾 01 not found')——改指向主策略组,流量经组到当前选中节点,语义不变 */
    const tunYaml = baseYaml + '\ntunnels:\n  - network: [udp]\n    address: ' + WIP + ':53\n    target: 8.8.8.8:53\n    proxy: ' + yamlEsc(hsMainGroup()) + '\n';
    /* v2.8.1: payload 模式(大 JSON body)真机失败(用户实锢)——改 path 模式(写临时文件+PUT path,
       真机端到端验证过的通道);base/恢复各一份临时文件,不依赖盘上 config.yaml 状态 */
    const tunF = DIR + '/.udptun.yaml', baseF = DIR + '/.udpbase.yaml';
    const w1 = await writeFile(baseF, baseYaml), w2 = await writeFile(tunF, tunYaml);
    if (!w1 || !w2) { await run('rm -f ' + shq(tunF) + ' ' + shq(baseF), 4000); return { ok: false, why: '临时配置写入失败(磁盘?)' } }
    const put1 = await apiPutSlow('/configs?force=true', { path: tunF });
    if (put1.ok) HS_UDP_INJECTED = true;
    else { await apiPutSlow('/configs?force=true', { path: baseF }).catch(() => { }); await run('rm -f ' + shq(tunF) + ' ' + shq(baseF), 4000); return { ok: false, why: '隧道注入失败(' + put1.why + ')' } }
    await wait(900); /* 引擎加载 tunnel 监听 */
    /* nslookup 经 WAN:53 隧道口发真实 DNS 查询(仅标准 53 口,真机实证唯一可行探测):
       RC=0 且输出含 Address=解析成功,即节点真实转发了 UDP 往返 */
    const probe = await run('nslookup example.com ' + WIP + ' >/tmp/.hsns 2>&1; RC=$?; rm -f /tmp/.hsns; echo RC=$RC', 12000);
    const mRc = /RC=(\d+)/.exec(probe.content || '');
    const rc = mRc ? parseInt(mRc[1], 10) : 1;
    return { ok: rc === 0 };
  } catch (e) {
    /* v2.9.56: genConfigYaml 可抛(循环锚点等)——裸调卡死 busy 永不复位(auditor) */
    return { ok: false, why: '实测异常:' + String((e && e.message) || e).slice(0, 50) };
  } finally {
    if (HS_UDP_INJECTED) { /* 仅注入成功才恢复(auditor: 早退路径无谓重载断流) */
      try {
        await refreshSubRaw();
        const back = genConfigYaml();
        if (back !== null) {
          const bF = DIR + '/.udpbase.yaml';
          await writeFile(bF, back);
          const put2 = await apiPutSlow('/configs?force=true', { path: bF });
          if (!put2.ok) { await wait(1200); const put3 = await apiPutSlow('/configs?force=true', { path: bF }).catch(() => ({ ok: false }));
            if (!put3.ok) { toast('⚠️ UDP 实测后恢复失败(' + (put2.why || '?') + ')——引擎仍载临时隧道,建议重启引擎', 'red', 6000); await opLog('UDP实测恢复失败(' + (put2.why || '?') + '),引擎滞留隧道配置') } }
        }
      } catch (e) { toast('⚠️ UDP 实测恢复异常:' + String((e && e.message) || e).slice(0, 40), 'red', 6000) }
    }
    await run('rm -f ' + shq(DIR + '/.udptun.yaml') + ' ' + shq(DIR + '/.udpbase.yaml'), 4000);
    HS_UDP_PROBE_BUSY = false;
  }
}
/* 本机代理限时(面板优先): 设备侧 shell 睡眠到点摘 OUTPUT 接管(页面关闭也生效),写 .s2expired 标记;
   JS 侧在 collectStatus 事件驱动对账(关 C.s2+重烙 fw.sh),两层解耦 */
async function armS2Timer() {
  const mins = +C.s2Keep || 0;
  if (!C.s2 || mins <= 0) return;
  await run('P=$(cat ' + DIR + '/.s2timer.pid 2>/dev/null); [ -n "$P" ] && kill $P 2>/dev/null; rm -f ' + DIR + '/.s2expired; '
    + 'nohup sh -c \'sleep ' + (mins * 60) + '; while iptables -t nat -D OUTPUT -j HS_OUT 2>/dev/null; do :; done; date +%s > ' + DIR + '/.s2expired\' >/dev/null 2>&1 & echo $! > ' + DIR + '/.s2timer.pid', 5000);
}
async function killS2Timer() {
  await run('P=$(cat ' + DIR + '/.s2timer.pid 2>/dev/null); [ -n "$P" ] && kill $P 2>/dev/null; rm -f ' + DIR + '/.s2timer.pid ' + DIR + '/.s2expired', 5000);
}
/* 限时策略选择弹窗(总览页徽标入口) */
function openS2KeepDlg() {
  const opts = [[5, '5 分钟'], [15, '15 分钟'], [60, '60 分钟'], [0, '一直开启 ⚠']];
  hsOpenSimple('⏱ 本机代理限时',
    '<div class="hs-hint" style="margin-bottom:8px">开启本机代理后,到时自动关闭(设备侧计时,关页面也生效)。<br>⚠ 一直开启 = 面板自身出站耦合进引擎,引擎异常会波及面板,不建议。</div>'
    + '<div class="hs-seg" id="hs_s2k_seg" style="margin:6px 0">' + opts.map(o => '<button data-v="' + o[0] + '" class="' + ((+C.s2Keep || 0) === o[0] ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>'
    + '<div class="hs-hint" id="hs_s2k_warn" style="min-height:18px"></div>'
    + '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn hs-pri" id="hs_s2k_save">保存</button></div>');
  const seg = $('#hs_s2k_seg'); let sel = +C.s2Keep || 0;
  const warn = $('#hs_s2k_warn');
  const showW = v => { warn.textContent = v === 0 ? '⚠ 一直开启:面板出站将耦合进引擎,引擎异常会波及面板访问外网' : '到时自动摘除 OUTPUT 接管并恢复面板直连出站'; warn.style.color = v === 0 ? '#ffb74d' : '' };
  showW(sel);
  seg.querySelectorAll('button').forEach(b => b.onclick = () => { sel = +b.dataset.v; seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); showW(sel) });
  $('#hs_s2k_save').onclick = async () => {
    const prev = +C.s2Keep || 0;
    C.s2Keep = sel; await saveConf();
    if (C.s2 && sel > 0) { await armS2Timer(); toast('✅ 限时 ' + sel + ' 分钟,已重新计时', 'green') }
    else if (C.s2 && sel === 0) { await killS2Timer(); toast('已改为一直开启(⚠ 面板耦合,建议限时)', 'pink') }
    else toast('✅ 已保存,下次开启生效', 'green');
    if (prev !== sel) await opLog('本机代理限时策略→' + (sel > 0 ? sel + ' 分钟' : '一直开启(⚠)'));
    mHide('hs_modal_simple'); renderPane();
  };
}
/* 线路地址集签名: 有线路指派的设备 → mac+全部已知地址(v4当前IP+邻居表v6) */
function lineSig() {
  /* 方案A/F02: 签名只含线路|MAC——设备地址(arp4/neigh6 快照)不再参与,地址轮换/变更零触发;
     neigh6 采集保留仅用于显示 */
  const lm = {}; (C.lines || []).forEach(L => { if (L && L.id) lm[L.id] = 1 });
  const parts = [];
  C.devices.forEach(d => {
    if (!d.line || !lm[d.line]) return;
    parts.push(d.line + '|' + String(d.mac || '').toUpperCase());
  });
  return parts.sort().join(';');
}
let HS_LINE_SIG = '';
let HS_LINE_BUSY = false; /* in-flight 防护: collectStatus 可能并发触发,签名读侧防抖挡不住同时起跑的两个 */
async function syncLineRules() {
  if (HS_UPGRADING) return; /* 升级中引擎在编排内重启,线路热重载会让 CFG 并发写 */
  if (!ST.running) { HS_LINE_SIG = ''; return }
  if (HS_LINE_BUSY) return;
  const sig = lineSig();
  if (sig === HS_LINE_SIG) return;
  HS_LINE_BUSY = true;
  try {
    const prev = HS_LINE_SIG; HS_LINE_SIG = sig;
    if (!sig) return; /* 已无线路指派,config 下次常规重写时自然去掉 */
    const yaml = genConfigYaml();
    if (yaml === null) { HS_LINE_SIG = prev; await opLog('线路地址跟随:订阅解析失败,跳过重写(旧配置保留)'); return }
    /* F13: 写盘失败不发起热重载——apiPut 成功会令引擎内存与盘上配置分叉;回滚签名让下次采集重试(与 apiPut 失败分支同语义) */
    if (!(await writeFile(CFG, yaml))) { HS_LINE_SIG = prev; await opLog('线路地址跟随:配置写盘失败,跳过热重载(当前配置保留,下次刷新重试)'); return }
    const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
    if (!ok) { HS_LINE_SIG = prev; await opLog('线路地址跟随:热重载失败,下次刷新重试'); return }
    /* 方案A: 线路成员(MAC)变化时 fw 层 MAC 集合与链路同步更新(签名防抖下低频,
       正常改动经设备下拉/线路管理保存链已无条件 reapplyFw(见 refreshDevPaneInner/openLineDlg),此处为运行中其他来源变化(如并发改配置)的兜底) */
    await reapplyFw();
    await opLog('设备线路成员变化,已自动跟随(热重载+规则重应用)');
  } finally { HS_LINE_BUSY = false }
}
/* 设备采集(ip neigh+DHCP 合并,仅在设备弹窗打开/手动刷新时调用) */
async function collectDevices() {
  const r = await run(
    'for ip in $(ip neigh show 2>/dev/null | awk \'$1 !~ /:/ && $4=="lladdr" && $6=="STALE" {print $1}\'); do ping -c 1 -W 1 "$ip" >/dev/null 2>&1; done;'
    + 'ip neigh show 2>/dev/null | awk \'$1 !~ /:/ && $4=="lladdr" && $5!="00:00:00:00:00:00" {print "N "$1" "$5" "$6}\';'
    + 'cat /tmp/dhcp.leases 2>/dev/null | awk \'{print "L "$3" "$2" "$4}\'', 15000);
  const map = {};
  (r.content || '').split('\n').forEach(l => {
    const a = l.trim().split(/\s+/); if (a.length < 3) return;
    const typ = a[0], ip = a[1], mac = a[2];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) return;
    if (!map[ip]) map[ip] = { ip: ip, mac: mac, host: '', online: false, neigh: false };
    if (typ === 'N') {
      const st = String(a[3] || '').toUpperCase();
      map[ip].mac = mac; map[ip].neigh = true;
      map[ip].online = /^(REACHABLE|DELAY|PROBE|PERMANENT)$/.test(st);
    } else if (typ === 'L') {
      if (!map[ip].neigh) map[ip].mac = mac;
      if (a[3] && a[3] !== '*' && !map[ip].host) map[ip].host = a[3];
    }
  });
  /* 按 MAC 关联(设备身份稳定),IP 变了名字和白名单跟着设备走;
     v2.7.0 忽略黑名单: 移除的设备 MAC 不再自动重新入库(ARP 残留/DHCP 租约会把它扫回来——
     真机实测移除后刷新即复活;扫描与合并保留两段都跳过,恢复入口在设备页底部「已忽略」) */
  const rmSet = {};
  (Array.isArray(C.removedMacs) ? C.removedMacs : []).forEach(m => { const mac = typeof m === 'string' ? m : (m && m.mac); if (mac) rmSet[String(mac).toUpperCase()] = 1 });
  const known = {}; C.devices.forEach(d => { if (d.mac) known[d.mac.toUpperCase()] = d });
  const list = Object.keys(map).sort().map(ip => {
    const mac = map[ip].mac.toUpperCase();
    if (rmSet[mac]) return null; /* 黑名单设备不入库(扫描段) */
    const k = known[mac] || null;
    return { ip: ip, mac: mac, host: map[ip].host, name: k ? k.name : (map[ip].host || ('设备_' + ip.split('.').pop())), proxy: k ? k.proxy : false, line: k ? (k.line || '') : '', online: !!map[ip].online };
  }).filter(Boolean);
  /* v1.8.5 修: 此前整体替换 C.devices——离线设备(手机休眠/离网)被剔除,之后任一次保存即永久丢失
     其白名单/昵称/线路;改为合并:扫描到的更新为在线,未扫描到的保留并标 online:false(2026-09-13 审查 P1) */
  const seen = {}; list.forEach(d => { seen[d.mac.toUpperCase()] = 1 });
  C.devices.filter(d => d && d.mac && !rmSet[String(d.mac).toUpperCase()]).forEach(d => {
    if (!seen[d.mac.toUpperCase()]) list.push({ ip: d.ip, mac: d.mac, host: d.host || '', name: d.name, proxy: d.proxy, line: d.line || '', online: false });
  });
  C.devices = list;
  return list;
}

/* ================= 互斥锁 ================= */
let opBusy = false;
async function op(btn, apply, okMsg, loadingText) {
  if (opBusy) { toast('操作进行中,请稍候', 'pink'); return false }
  if (HS_UPGRADING) { toast('⬆️ 升级进行中,请等待完成后再操作', 'pink'); return false } /* 升级编排自带时序,并发启停/卸载会中断它 */
  opBusy = true;
  const old = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = loadingText || '生效中…' }
  await wait(700);
  let done = true;
  try { await apply() } catch (e) { done = false; toast('操作失败:' + e, 'red') }
  if (done && okMsg) toast(okMsg, 'green');
  if (btn) { btn.disabled = false; if (old != null) btn.textContent = old }
  opBusy = false;
  await renderAll();
  return done;
}

/* ================= config.yaml 生成与订阅 ================= */
/* 配置白名单收口(v1.8.5): ports/tunName/secret/devices.ip 会被拼进 root 执行的 fw.sh 与面板命令,
   loadConf 与导入两条入口此前只滤 MAC/CIDR——这几项是命令注入面(2026-09-13 审查 P0),统一过白名单 */
function sanitizeConf() {
  const P = Object.assign({}, PORT_DEF, (C.ports && typeof C.ports === 'object') ? C.ports : {});
  Object.keys(PORT_DEF).forEach(k => { const n = parseInt(P[k], 10); P[k] = (n >= 1 && n <= 65535) ? n : PORT_DEF[k] });
  C.ports = P;
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/.test(String(C.tunName || '')))
    C.tunName = /^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/.test(String(C.tun || '')) ? C.tun : DEF.tunName;
  delete C.tun; /* v1.8.5: 兼容旧死字段(设置页曾误写入 C.tun)并统一到 tunName */
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(C.secret || ''))) C.secret = '';
  C.devices = (Array.isArray(C.devices) ? C.devices : []).filter(d => d && typeof d === 'object' && okMac(d.mac))
    .map(d => { if (d.ip && !okCidr(d.ip) && !okV6(d.ip)) d.ip = ''; return d });
  /* v1.8.5: 浅拷贝断开与 DEF 模板的共享引用(j 缺该键时 C.x === DEF.x,后续 push 会污染模块级模板)(审查 P3) */
  C.lines = Array.isArray(C.lines) ? C.lines.slice(0, 8) : []; /* 方案A: 线路上限 8——listener 端口派生(主口+1000+2n)防漂移冲突 */
  C.subs = Array.isArray(C.subs) ? C.subs.slice() : [];
  C.subs.forEach(s => { if (s && typeof s === 'object') { s.filter = normSubFilter(s.filter); if (s.ui && (typeof s.ui.total !== 'number' || s.ui.total < 0 || s.ui.total > 1e16)) s.ui = null } }); /* v2.7.4: ui=subscription-userinfo 快照(字节/时间戳),并常态防异常值 */
  C.subFusion = !!C.subFusion;
  C.v6Dns = !!C.v6Dns; /* v2.8.0-beta */
  /* v2.7.9: 对象化 {mac,name,time};旧格式(纯 MAC 字符串)自动迁移 */
  C.removedMacs = (Array.isArray(C.removedMacs) ? C.removedMacs : []).map(m => typeof m === 'string' ? { mac: m, name: '', time: '' } : m)
    .filter(m => m && typeof m === 'object' && /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(String(m.mac || '')))
    .map(m => ({ mac: String(m.mac).toUpperCase(), name: String(m.name || '').slice(0, 24), time: String(m.time || '').slice(0, 16) })).slice(0, 50);
  C.exclude = Array.isArray(C.exclude) ? C.exclude.slice() : [];
  C.force = Array.isArray(C.force) ? C.force.slice() : [];
  if (['self', 'merge', 'direct'].indexOf(C.policySrc) < 0) C.policySrc = 'self';
}
function genSecret() {
  if (C.secret) return C.secret;
  C.secret = 'hs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return C.secret;
}
/* 国际版游戏出海域名(两模式共用,必须排在 GEOSITE,CN 之前防误直连) */
const HS_GAME_DOMAINS = ['igamecj.com', 'proximabeta.com', 'pubghelper.com', 'pubgtool.com', 'gcloudcs.com',
  'gcloudsdk.com', 'gcloudsvcs.com', 'tencent-gcloud.com', 'midasbuy.com',
  'anticheatexpert.com', 'hoyoverse.com'];
/* YAML 双引号串转义: 必须同时转义反斜杠与引号——只转引号时,值内任何 \x (如候选池 filter 的正则转义 \.)都是 YAML 非法转义,mihomo 解析 fatal(真机事故 2026-09-02);
   I04: 另须转义控制字符换行/回车/制表——VMess server 等字段含裸 \n 会破坏 YAML 结构(\n 在双引号风格中必须写 \n 转义形态) */
function yamlEsc(t) { return '"' + String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"' }
function genConfigYaml() {
  const P = C.ports, sec = genSecret();
  const groups = [];
  const proxies_main = [];
  /* 策略层 target: 自建=🚀 节点选择;订阅直通=订阅首个 select 组(取不到则跳过强制/例外注入并留痕) */
  let subMode = C.policySrc === 'direct'; let mergeMode = C.policySrc === 'merge'; let subTarget = '🚀 节点选择'; let subBlocks = null;
  const providers = {};
  /* 手动节点 provider(type:file,与订阅共存于同一组链) */
  if (HS_MANUAL.length) {
    providers.manual = {
      type: 'file', path: './providers/manual.yaml',
      'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true }
    };
  }
  /* 订阅 providers(v2.7.0: 融合开启且合并模式时接入全部订阅,单订阅仅激活项;
     每订阅挂 exclude-filter(有规则时,引擎侧原生过滤,规则改动热重载即生效)+
     override.additional-prefix(融合时加[订阅名]前缀防撞名,v1.19.32 真机 -t 实证支持) */
  const fusionOn = C.subFusion && mergeMode;
  const subIdx = fusionOn ? C.subs.map((s, i) => (s && s.url) ? i : -1).filter(i => i >= 0)
    : (C.activeSub >= 0 && C.subs[C.activeSub]) ? [C.activeSub] : [];
  subIdx.forEach(i => {
    const sub = C.subs[i];
    const pv = {
      type: 'http', url: sub.url, path: './providers/sub' + i + '.yaml',
      interval: 0,
      'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true }
    };
    const ex = buildSubExclude(sub.filter);
    if (ex) pv['exclude-filter'] = ex;
    const inc = buildSubInclude(sub.filter);
    if (inc) pv.filter = inc; /* v2.7.0 地区「其他」排除: include 白名单(引擎 provider 原生 filter) */
    if (fusionOn && subIdx.length > 1) pv.override = { 'additional-prefix': '[' + String(sub.name || ('订阅' + (i + 1))).slice(0, 12) + '] ' };
    providers['sub' + i] = pv;
  });
  /* 组链(四模式并存, 🚀默认指向当前模式) */
  const useList = Object.keys(providers).length ? Object.keys(providers) : [];
  /* Y05: 主组引用与子组生成联动——空 useList(无手动节点无订阅)时三子组不生成,主组若仍引用即悬空
     (mihomo -t fatal 'not found');空时主组仅 DIRECT,有节点路径零变化 */
  groups.push({ name: '🚀 节点选择', type: 'select', proxies: useList.length ? ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移', 'DIRECT'] : ['DIRECT'], use: useList.length ? useList : undefined });
  const defaultIdx = { auto: 0, balance: 1, fallback: 2, manual: 0 }[C.mode] || 0;
  if (useList.length) {
    groups[0].proxies = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移', 'DIRECT'];
    
    /* select 默认选中 */
    const defaultName = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移'][defaultIdx];
    groups[0].default = defaultName;
  }
  /* LINE_OK=本次实际生成的线路组名集合: SRC 规则只引用已生成的组——防无节点时组未生成而规则悬空,mihomo 启动 fatal */
  const LINE_OK = {};
  const LN_IDS = []; const LN_NAMES = {}; /* 方案A: 线路→listener/IN-NAME/fw 同源消费(声明前置防 TDZ:线路组块先于此处填入) */
  if (useList.length) {
    groups.push({ name: '♻️ 自动选优', type: 'url-test', url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, tolerance: 50, use: useList });
    groups.push({ name: '⚖️ 负载均衡', type: 'load-balance', strategy: 'consistent-hashing', url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, use: useList });
    groups.push({ name: '🪜 故障转移', type: 'fallback', url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, use: useList });
    /* 分设备线路组(每条线路一个独立 select;重名跳过防 YAML 组名冲突;
       锁定模式支持多选节点: 1个=default锁定该节点, 多个=生成"·优选"url-test子组在候选池里自动挑最快;
       候选池用 provider filter 实现(file 型复用同一订阅文件,零重复下载), provider id 过白名单防 YAML key 注入) */
    const seenLn = {};
    const escRe = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    (C.lines || []).forEach(L => {
      if (!L || !L.id || !L.name || !/^[A-Za-z0-9_-]{1,16}$/.test(L.id)) return;
      const nm = String(L.name);
      if (seenLn[nm]) return; seenLn[nm] = 1;
      /* 旧字段兼容: node 单值并入 nodes;节点名长度上限防滥用 */
      if (!Array.isArray(L.nodes)) L.nodes = (typeof L.node === 'string' && L.node) ? [L.node] : [];
      const nodes = L.nodes.filter(n => typeof n === 'string' && n && n.length <= 64).slice(0, 30);
      let def, proxies = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移', 'DIRECT'], use = useList;
      if (L.mode === 'node' && nodes.length) {
        const pid = 'ln_' + L.id;
        /* F09: filter 完整锚定 ^(?:...)$ ——行正则层与真实内核行为对齐;
           F09-r2 同名跨源去重(互斥拆分): 点名∩HS_MANUAL 只进 ln_*_manual(HS_MANUAL 名必有 manual 源),
           其余点名只进订阅源 provider——每个名字至多被一个池 provider 命中,池 all 无重复(集合语义) */
        const manualSet = new Set(HS_MANUAL);
        const subPicked = nodes.filter(n => !manualSet.has(n));
        const manualPicked = nodes.filter(n => manualSet.has(n));
        const flt = '^(?:' + subPicked.map(escRe).join('|') + ')$';
        const manualFlt = '^(?:' + manualPicked.map(escRe).join('|') + ')$';
        use = useList.filter(src => (src === 'manual' ? manualPicked.length : subPicked.length)).map(src => {
          const key = pid + '_' + src;
          providers[key] = { type: 'file', path: providers[src].path, filter: (src === 'manual' ? manualFlt : flt), 'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true } };
          return key;
        });
        if (nodes.length === 1 || L.pick === 'manual') { def = lineDefOf(L) }
        else {
          /* 池内策略子组: 优选=url-test / 均衡=load-balance / 转移=fallback */
          def = linePoolName(nm); proxies = proxies.concat([def]);
          const st = ({ auto: 'url-test', balance: 'load-balance', fallback: 'fallback' })[L.pick] || 'url-test';
          const sub = { name: def, type: st, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, tolerance: 50, lazy: true, use: use };
          if (st === 'load-balance') sub.strategy = 'consistent-hashing';
          sub._pool = nodes; sub._lineId = L.id; /* merge 模式静态化候选(自建序列化只输出已知字段,此标记无害) */
          groups.push(sub);
        }
      } else {
        def = ({ auto: '♻️ 自动选优', balance: '⚖️ 负载均衡', fallback: '🪜 故障转移' }[L.mode] || '♻️ 自动选优');
      }
      LINE_OK[nm] = 1;
      LN_IDS.push(L.id); LN_NAMES[L.id] = nm; /* 方案A: 与 fw 同源同序(id+name 校验一致),供 listeners 段与 IN-NAME 规则消费 */
      const lg = { name: lineGName(nm), type: 'select', proxies: proxies, use: use, default: def };
      if (L.mode === 'node' && nodes.length) { lg._cand = nodes; lg._lineId = L.id; } /* merge 模式: 指定节点线路的静态候选 */
      groups.push(lg);
    });
  }
  /* 规则: 强制→排除→ GEO→兜底 */
  const rules = [];
  /* IP-CIDR 掩码规整: mihomo 要求 CIDR 格式,裸地址(如 172.18.32.188)是非法 CIDR,-t 直接 fatal;直通/自建两分支共用 */
  const cidrNorm = v => { v = String(v || '').trim(); if (!v) return ''; return v.indexOf('/') >= 0 ? v : v + (v.indexOf(':') >= 0 ? '/128' : '/32') };
  (C.force || []).forEach(x => {
    if (x.m === 'suffix') rules.push('DOMAIN-SUFFIX,' + x.v + ',🚀 节点选择');
    else if (x.m === 'prefix') rules.push('DOMAIN-KEYWORD,' + x.v + ',🚀 节点选择');
    else if (x.m === 'exact') rules.push('DOMAIN,' + x.v + ',🚀 节点选择');
    else if (x.m === 'cidr' && cidrNorm(x.v)) rules.push('IP-CIDR,' + cidrNorm(x.v) + ',🚀 节点选择,no-resolve');
  });
  (C.exclude || []).forEach(x => {
    if (x.m === 'suffix') rules.push('DOMAIN-SUFFIX,' + x.v + ',DIRECT');
    else if (x.m === 'prefix') rules.push('DOMAIN-KEYWORD,' + x.v + ',DIRECT');
    else if (x.m === 'exact') rules.push('DOMAIN,' + x.v + ',DIRECT');
    /* cidr 在防火墙层排除,不走 mihomo */
  });
  /* 分设备线路(方案A): 设备身份=MAC——引擎侧不再生成 SRC-IP-CIDR 地址快照规则(F02: 地址轮换/变更不再失联);
     线路出口经专属 listener(hsln_<id>)+IN-NAME 规则路由,设备→线路的分派在 fw 层 MAC ipset(见 genFwSh);
     线路组生成块内记 LN_IDS(与 fw 同源同序),此处只消费 */
  /* 分设备线路(方案A): 设备身份=MAC——引擎侧不再生成 SRC-IP-CIDR 地址快照规则(F02: 地址轮换/变更不再失联);
     线路出口经专属 listener(hsln_<id>)+IN-NAME 规则路由,设备→线路的分派在 fw 层 MAC ipset(见 genFwSh);
     LN_IDS/LN_NAMES 由线路组生成块填入(见上),此处无需地址枚举 */
  /* 地理数据缺失(卸载重装未装)时跳过 GEO 规则: mihomo 缺文件会自行去 GitHub 下载(设备必空挂)=首启卡死根因;
     跳过后国内直通由防火墙 chnroute 兜底(ipset 内核态,不依赖 GEO),装好地理数据后规则自动恢复 */
  /* 国际版游戏出海域名例外(2026-09-06 真机实锤: geosite:cn 收录腾讯系出海域名,PUBG 全系被误判直连):
     域名级前置强制走节点,排在 GEOSITE,CN 之前;新游戏出海域名随版本补充(反馈渠道:用户报告) */
  HS_GAME_DOMAINS.forEach(d => rules.push('DOMAIN-SUFFIX,' + d + ',' + subTarget));
  if (ST.geoSiteT > 0) rules.push('GEOSITE,CN,DIRECT');
  /* P0-7②: GEOIP 库换 chnroute 同源规则集(GeoLite2 按 ASN 注册国误判腾讯云海外段为 CN,PUBG UDP 根因);
     去 no-resolve——域名连接解析真实 IP 后参与国内判定(治企业内网域名类盲区),最坏=多一次解析后继续兜底 */
  if (ST.chn > 0) rules.push('RULE-SET,china_ip,DIRECT');
  else if (ST.geoIpT > 0) rules.push('GEOIP,CN,DIRECT,no-resolve');
  /* 方案A/F03: 线路出口路由位于国内 DIRECT 之后——进线路 listener 的国内流量仍 DIRECT(不被线路出口劫走),
     海外走线路组;设备→线路分派在 fw 层 MAC 集合,引擎侧身份=listener 名(与设备地址解耦) */
  LN_IDS.forEach(id => {
    rules.push('IN-NAME,hsln_' + id + ',' + lineGName(LN_NAMES[id] || id));
    rules.push('IN-NAME,hsln_' + id + 't,' + lineGName(LN_NAMES[id] || id));
  });
  rules.push('MATCH,🚀 节点选择');
  /* YAML 序列化 */
  let y = '# 小海关生成 · ' + nowStr() + '\n#gen:v' + V + '\n';
  y += 'mixed-port: ' + P.mixed + '\n';
  y += 'redir-port: ' + P.redir + '\n';
  y += 'tproxy-port: ' + P.tproxy + '\n';
  /* 方案A: 每线路一对专属 listener(redir 仅 TCP+ tproxy 带 udp),name=hsln_<id>(tproxy 加 t 后缀);
     端口派生=主口+1000+2n(n=线路同源序,sanitizeConf 限线路≤8 防漂移);无线路时不输出本段(与旧形态同构) */
  if (LN_IDS.length) {
    y += 'listeners:\n';
    LN_IDS.forEach((id, i) => {
      y += '  - name: hsln_' + id + '\n    type: redir\n    listen: 0.0.0.0\n    port: ' + (P.redir + 1000 + 2 * i) + '\n';
      y += '  - name: hsln_' + id + 't\n    type: tproxy\n    listen: 0.0.0.0\n    port: ' + (P.tproxy + 1000 + 2 * i) + '\n    udp: true\n';
    });
  }
  y += 'allow-lan: true\n';
  y += 'bind-address: "*"\n';
  y += 'mode: rule\n';
  y += 'log-level: ' + (C.logEnabled ? (C.logLevel || 'info') : 'silent') + '\n';
  y += 'external-controller: ' + (C.ctrlLan ? '0.0.0.0' : '127.0.0.1') + ':' + P.ctrl + '\n';
  y += 'secret: ' + yamlEsc(sec) + '\n';
  y += 'routing-mark: 6666\n';
  y += 'geodata-loader: memconservative\n';
  y += 'tcp-concurrent: true\n'; /* v2.5.0: TCP 并发握手取最快(wiki.metacubex.one config/general) */
  /* v2.6.0: 删 global-client-fingerprint——Mihomo v1.19.32 已废弃此字段(真机运行日志 error 实证)，指纹伪装需逐节点设 client-fingerprint，暂不实现 */
  y += 'geo-auto-update: false\n';
  y += 'profile:\n'; /* F08: 持久化键迁入 profile 块——顶层错误字段被 v1.19.32 忽略
     (StoreSelected 默认 true 此前救了选择持久化;StoreFakeIP 默认 false 致 fake-ip 映射未持久化);
     显式 true 保留:fake-ip 持久化开启属行为增强 */
  y += '  store-selected: true\n';
  y += '  store-fake-ip: true\n';
  y += '\n# DNS\n';
  y += 'dns:\n';
  y += '  enable: true\n';
  y += '  listen: 0.0.0.0:' + P.dns + '\n';
  y += '  enhanced-mode: fake-ip\n';
  /* DNS AAAA 策略(v2.8.0-beta 实验开关): 默认不回 AAAA——弱 CPU 终端全 v4+内核态直通最稳;
     开启恢复 AAAA——v6 直通链(三网前缀 RETURN)已在,国内 v6 内核态放行,境外 v6 走接管链 */
  y += '  ipv6: ' + (C.v6Dns ? 'true' : 'false') + '\n';
  y += '  fake-ip-range: 198.18.0.1/16\n';
  /* 国内直通配合: geosite:cn 域名返回真实 IP → 防火墙 chnroute 命中 → 内核态直连不进 mihomo;
     stun/NTP 类本就需真实 IP */
  y += '  fake-ip-filter:\n';
  if (ST.geoSiteT > 0) y += "    - 'geosite:cn'\n";
  y += "    - '*.lan'\n";
  y += "    - '*.local'\n";
  y += "    - '+.stun.*.*'\n";
  y += "    - '+.stun.*.*.*'\n";
  y += "    - 'time.*.com'\n";
  y += "    - 'time.*.apple.com'\n";
  /* 排除清单域名同步入 fake-ip-filter(与 geosite:cn 同一通道): 排除=不走代理,DNS 就该回真实 IP,
     流量在防火墙层直连(私网段 RETURN/chnroute ipset),根本不进 mihomo;
     此前只注入 DIRECT 规则——域名仍拿 fake-ip 必进 mihomo,DIRECT 出站又不走 EasyTier 隧道路由,
     企业内网域名(内网解析)加入排除清单后仍打不开(2026-09-12 用户实锤);
     prefix(keyword) 类 filter 不支持,仍靠规则注入兜底 */
  (C.exclude || []).forEach(x => {
    if (x.m === 'suffix' && /^[A-Za-z0-9.-]+$/.test(x.v)) y += "    - '+." + x.v + "'\n";
    else if (x.m === 'exact' && /^[A-Za-z0-9.-]+$/.test(x.v)) y += "    - '" + x.v + "'\n";
  });
  y += '  nameserver:\n';
  y += '    - 223.5.5.5\n';
  y += '    - 119.29.29.29\n';
  /* 节点域名解析专用上游(DoH 加密): 明文 UDP 会向运营商暴露"正在解析机场节点域名"的线索 */
  y += '  proxy-server-nameserver:\n';
  y += '    - https://223.5.5.5/dns-query\n';
  y += '\n# 域名嗅探: 从 TLS/QUIC/HTTP 揥手还原域名(终端拿真实IP直连时,规则才能按域名命中;也是 QUIC 间歇卡死的根治)\n';
  y += 'sniffer:\n';
  y += '  enable: true\n';
  y += '  override-destination: true\n';
  y += '  sniff:\n';
  y += '    TLS:\n';
  y += '      ports: [443, 8443]\n';
  y += '    HTTP:\n';
  y += '      ports: [80, 8080-8880]\n';
  y += '    QUIC:\n';
  y += '      ports: [443, 8443]\n';
  y += '\n# TUN\n';
  y += 'tun:\n';
  y += '  enable: true\n';
  y += '  stack: system\n';
  y += '  device: ' + C.tunName + '\n';
  y += '  auto-route: false\n';
  y += '  auto-redirect: false\n';
  if (subMode) {
    /* ===== 订阅策略直通模式(v1.7.0): 订阅的 proxies/groups/rules/providers 原样生效 =====
       本函数此前自建的 groups/proxies_main/rule-providers 订阅段全部弃用;
       头段基础设施(端口/DNS/tun/sniffer/secret/routing-mark)保留——接管链依赖它们;
       强制/排除/出海例外注入订阅 rules 最前(排除→DIRECT 保留,强制/例外 target=订阅首个 select 组) */
    subBlocks = extractSubBlocks(HS_SUB_RAW);
    if (!subBlocks.ok) {
      /* F05: 解析失败不再静默回退自建调度——中止本次应用,旧配置不动(各写盘点 null 守卫) */
      opLog('订阅策略直通失败(' + subBlocks.why + '),本次不应用,保留原配置');
      toast('⚠️ 订阅解析失败,本次不应用(已保留原配置)', 'red');
      return null;
    }
    {
      const tgt = firstSelectGroup(HS_SUB_RAW);
      /* IP 类条目翻译规则(掩码规整用外层 cidrNorm): 排除类 cidr 不进 mihomo——防火墙层 EXCIDRS 已排除(与自建模式同语义);
         直通模式曾把裸 IP 排除项(172.18.32.188)译成 IP-CIDR 致非法 CIDR fatal(2026-09-12 升级失败实锤) */
      const LR = (x, to) => x.m === 'suffix' ? 'DOMAIN-SUFFIX,' + x.v + ',' + to
        : x.m === 'prefix' ? 'DOMAIN-KEYWORD,' + x.v + ',' + to
        : x.m === 'exact' ? 'DOMAIN,' + x.v + ',' + to : null;
      const inject = [];
      (C.exclude || []).forEach(x => { const r = LR(x, 'DIRECT'); if (r) inject.push(r) });
      if (tgt) {
        subTarget = tgt;
        (C.force || []).forEach(x => { const r = x.m === 'cidr' ? (cidrNorm(x.v) ? 'IP-CIDR,' + cidrNorm(x.v) + ',' + tgt + ',no-resolve' : null) : LR(x, tgt); if (r) inject.push(r) });
        /* 出海例外(必须先于 GEOSITE,CN——geosite:cn 收录腾讯系出海域域,PUBG 误直连教训同自建) */
        HS_GAME_DOMAINS.forEach(d => inject.push('DOMAIN-SUFFIX,' + d + ',' + tgt));
        /* v1.8.2 国内直通兜底(用户真机实锤:订阅直通下微信收发慢——机场规则对国内流量兜底不全,
           微信长连接/图片 CDN 落 MATCH 走了境外节点): 与自建同源的直连规则垫在订阅规则之前,
           国内域名/IP 进 mihomo 也不再依赖订阅规则质量;用户强制/排除在前仍最高优先 */
        if (ST.geoSiteT > 0) inject.push('GEOSITE,CN,DIRECT');
        if (ST.chn > 0) inject.push('RULE-SET,china_ip,DIRECT');
        else if (ST.geoIpT > 0) inject.push('GEOIP,CN,DIRECT,no-resolve');
      }
      else { console.log('[小海关] 订阅无 select 组,强制清单/出海例外/国内兜底未注入(订阅规则自管)'); } /* genConfigYaml 是同步函数,留痕走 console */
      /* F05 结构化合成: 订阅解析结果(锚点/别名已保真或展开)+本方注入,由 YAML.stringify 序列化
         (缩进/引号/特殊字符转义交给解析库,不再手拼文本/正则注入) */
      const D = subBlocks.data;
      if (tgt && ST.chn > 0 && !(D['rule-providers'] && D['rule-providers'].china_ip)) {
        (D['rule-providers'] = D['rule-providers'] || {})['china_ip'] = { type: 'file', behavior: 'ipcidr', format: 'text', path: './rules/china_ip.txt', interval: 0 };
      }
      if (inject.length && Array.isArray(D.rules)) D.rules = inject.concat(D.rules);
      /* v2.7.26 直通悬空清理(用户实锄: 直通+更新订阅报「proxy group: '最新官网: inou...' not found」——
         订阅生成器自身带死引用,Clash 系客户端容错跳过而 mihomo -t 严格 fatal,更新即应用失败):
         组成员仅允许 已存在节点/其他组/内置目标;规则 target 同校验;清理计数留痕 */
      if (Array.isArray(D.proxies)) {
        const nodeName = new Set(D.proxies.map(p => p && typeof p === 'object' && !Array.isArray(p) ? String(p.name != null ? p.name : '') : '').filter(Boolean));
        const grpName = new Set((Array.isArray(D['proxy-groups']) ? D['proxy-groups'] : []).map(g => g && typeof g === 'object' ? String(g.name != null ? g.name : '').trim() : '').filter(Boolean));
        const BUILTIN = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', 'REJECT-DROP']);
        let dropM = 0, dropG = 0, dropR = 0;
        const keepGrp = [];
        (Array.isArray(D['proxy-groups']) ? D['proxy-groups'] : []).forEach(g => {
          if (!g || typeof g !== 'object' || Array.isArray(g)) return;
          if (Array.isArray(g.proxies)) {
            const before = g.proxies.length;
            g.proxies = g.proxies.filter(n => typeof n !== 'string' ? true : (nodeName.has(n) || grpName.has(n) || BUILTIN.has(n) || n === 'no-resolve'));
            dropM += before - g.proxies.length;
          }
          if ((!Array.isArray(g.proxies) || !g.proxies.length) && !g.use) { dropG++; return }
          keepGrp.push(g);
        });
        if (dropG || (Array.isArray(D['proxy-groups']) && keepGrp.length !== D['proxy-groups'].length)) D['proxy-groups'] = keepGrp;
        const okT = new Set([...nodeName, ...grpName, ...BUILTIN]);
        if (Array.isArray(D.rules)) {
          D.rules = D.rules.filter(r => {
            if (typeof r !== 'string') return true;
            const parts = r.split(',');
            const T = ['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX', 'GEOSITE', 'IP-CIDR', 'IP-CIDR6', 'GEOIP', 'SRC-IP-CIDR', 'DST-PORT', 'SRC-PORT'].includes(parts[0])
              ? parts[parts.length - 1].replace(/,no-resolve$/, '').trim() : null;
            if (T && !okT.has(T)) { dropR++; return false }
            return true;
          });
        }
        if (dropM || dropG || dropR) console.log('[小海关] 直通悬空清理: 组成员-' + dropM + ' 空组-' + dropG + ' 规则-' + dropR);
      }
      y += '\n# ===== 订阅策略直通(v' + V + '): 订阅策略经真实 YAML 解析后生效 =====\n';
      y += subYaml(D) + '\n';
      return y;
    }
  } else if (mergeMode) {
    /* ===== 合并模式(v1.8.2): 小海关调度/基础设施为骨架 + 订阅节点与分类组接入;
       规则本地优先——强制/排除/分设备线路/出海例外/国内直通在前,订阅分类规则去重追加,MATCH 指本地主组。
       节点来源: 订阅 proxies 段原样顶层化(订阅组原样保留其引用);组链 use 由 provider 改静态节点名(manual 保留 provider);
       组名冲突(订阅组与本地组重名)丢弃订阅组=本地为准;china_ip 数据集冲突时保留本地 chnroute 同源版 ===== */
    subBlocks = extractSubBlocks(HS_SUB_RAW);
    if (!subBlocks.ok) {
      /* F05: 解析失败不再静默回退自建调度——中止本次应用,旧配置不动(各写盘点 null 守卫) */
      opLog('合并模式合成失败(' + subBlocks.why + '),本次不应用,保留原配置');
      toast('⚠️ 订阅解析失败,本次不应用(已保留原配置)', 'red');
      return null;
    }
    {
      const D = subBlocks.data;
      /* v2.7.0 过滤+融合(静态节点层): 过滤对激活订阅 proxies 直接生效(merge 模式节点
         全静态化,provider 层 exclude-filter 对此无效,必须在顶层化前删);
         融合=其他订阅原文(异步侧 refreshSubRaw 预载 HS_SUB_RAW_ALL)解析+各自过滤+
         全部改名加[订阅名]前缀后并入——组静态化/线路点名/订阅组引用均从下方 subNodeNames
         派生,自动包含融合节点;订阅组与规则仍仅取激活订阅(融合的是节点池,不合并策略) */
      const actFilter = C.subs[C.activeSub] ? normSubFilter(C.subs[C.activeSub].filter) : null;
      if (actFilter) {
        const exRe = buildSubExclude(actFilter); const re = exRe ? new RegExp(exRe) : null;
        const inReS = buildSubInclude(actFilter); const inRe = inReS ? new RegExp(inReS) : null; /* v2.7.0:「其他」排除 include */
        if (re || inRe) D.proxies = (Array.isArray(D.proxies) ? D.proxies : []).filter(p => !(p && typeof p === 'object' && ((re && re.test(String(p.name || ''))) || (inRe && !inRe.test(String(p.name || ''))))));
      }
      let actMapRef = null; /* 融合时全订阅 裸名→前缀名映射(供订阅组成员/线路点名/规则target改名;审查问题1+2: 线路与规则也可能存裸名) */
      if (fusionOn && HS_SUB_RAW_ALL) {
        const prefixOf = nm => '[' + String(nm || '').slice(0, 12) + '] ';
        const seenNames = new Set();
        const mergedPx = [];
        const actPre = prefixOf(C.subs[C.activeSub].name);
        const actMap = new Map(); /* 全订阅 裸名→前缀名(激活订阅先填,其他订阅各自填;同名裸名先到先得——通常命名风格不同无碰撞) */
        (Array.isArray(D.proxies) ? D.proxies : []).forEach(p => {
          if (p && typeof p === 'object' && !Array.isArray(p)) {
            const cp = Object.assign({}, p); const orig = String(cp.name || '');
            cp.name = actPre + orig;
            if (!actMap.has(orig)) actMap.set(orig, cp.name);
            actMapRef = actMap;
            if (!seenNames.has(cp.name)) { seenNames.add(cp.name); mergedPx.push(cp) }
          }
        });
        C.subs.forEach((sb, j) => {
          if (!sb || !sb.url || j === C.activeSub) return;
          const raw = HS_SUB_RAW_ALL[j];
          if (!raw) return;
          const blk = extractSubBlocks(raw);
          if (!blk.ok) { opLog('融合:订阅「' + sb.name + '」解析失败跳过(' + blk.why + ')'); return }
          const fx = normSubFilter(sb.filter);
          const ex2 = buildSubExclude(fx); const re2 = ex2 ? new RegExp(ex2) : null;
          const in2s = buildSubInclude(fx); const re2i = in2s ? new RegExp(in2s) : null;
          (Array.isArray(blk.data.proxies) ? blk.data.proxies : []).forEach(p => {
            if (!p || typeof p !== 'object' || Array.isArray(p)) return;
            const nm = String(p.name || '');
            if (re2 && re2.test(nm)) return;
            if (re2i && !re2i.test(nm)) return;
            const cp = Object.assign({}, p); cp.name = prefixOf(sb.name) + nm;
            if (!actMap.has(nm)) actMap.set(nm, cp.name); /* 其他订阅裸名也进映射(线路点名可能引用) */
            if (!seenNames.has(cp.name)) { seenNames.add(cp.name); mergedPx.push(cp) }
          });
        });
        if (mergedPx.length) D.proxies = mergedPx;
        console.log('[小海关] 融合已开启: 节点池 ' + D.proxies.length + '(含全部订阅,前缀标记)');
      }
      /* 订阅节点名(结构化提取;名称含逗号/引号/特殊字符均由解析器保证正确) */
      const subNodeNames = (Array.isArray(D.proxies) ? D.proxies : [])
        .map(p => (p && typeof p === 'object' && !Array.isArray(p) && typeof p.name === 'string') ? p.name : null)
        .filter(n => n);
      const nodeSet = new Set(subNodeNames);
      const hasManual = HS_MANUAL.length > 0;
      const manOK = n => hasManual && HS_MANUAL.indexOf(n) >= 0;
      /* 组链静态化: use provider → 订阅节点静态成员(池组/指定线路只收各自候选) */
      groups.forEach(g => {
        /* F09: 手选池不再 use 整个 manual provider(全量污染)——订阅节点静态化(已顶层化),
           手选节点若被本线路点名则建线路专属 manual provider(filter 锚定显式名单);
           v2.7.0 融合审查问题1: 线路保存的裸节点名在此统一映射为前缀名(融合前存的老配置兼容) */
        const mapN = n => (actMapRef && typeof n === 'string' && actMapRef.has(n)) ? actMapRef.get(n) : n;
        if (g.default && actMapRef && actMapRef.has(g.default)) g.default = actMapRef.get(g.default);
        if (g._pool) {
          g._pool = g._pool.map(mapN);
          g.proxies = (g._pool || []).filter(n => nodeSet.has(n));
          const manualPicked = (g._pool || []).filter(n => manOK(n) && !nodeSet.has(n)); /* 同名已在订阅静态化,不重复建源 */
          if (hasManual && manualPicked.length && g._lineId) {
            const key = 'ln_' + g._lineId + '_manual';
            const escRe2 = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            providers[key] = { type: 'file', path: './providers/manual.yaml', filter: '^(?:' + manualPicked.map(escRe2).join('|') + ')$', 'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true } };
            g.use = [key];
          } else g.use = undefined; /* 线路点名场景: 点名已全部静态化/建专属源,不再挂全量 manual(防污染) */
        }
        else if (g._cand) {
          g._cand = g._cand.map(mapN);
          /* F09: 指定线路主组同款精确边界——订阅点名静态化,手选点名经线路专属 manual provider(锚定 filter) */
          g.proxies = (g.proxies || []).concat((g._cand || []).filter(n => nodeSet.has(n)));
          const manualPicked = (g._cand || []).filter(n => manOK(n) && !nodeSet.has(n)); /* 同名已在订阅静态化,不重复建源 */
          if (hasManual && manualPicked.length && g._lineId) {
            const key = 'ln_' + g._lineId + '_manual';
            const escRe2 = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            providers[key] = { type: 'file', path: './providers/manual.yaml', filter: '^(?:' + manualPicked.map(escRe2).join('|') + ')$', 'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true } };
            g.use = [key];
          } else g.use = undefined; /* 线路点名场景: 点名已全部静态化/建专属源,不再挂全量 manual(防污染) */
        }
        else if (g.use) { g.proxies = (g.proxies || []).concat(subNodeNames); g.use = hasManual ? ['manual'] : undefined }
      });
      /* 订阅组: 结构化过滤(重名丢弃=本地为准),序列化交给 subYaml(缩进/转义由库处理);
         融合时组成员引用同步加前缀(成员是本订阅节点→映射到前缀名;是组名/未知项不动) */
      const selfGroupNames = new Set(groups.map(g => g.name));
      const keptGrp = [];
      /* v2.7.0 修复(真机实证): 过滤删节点后订阅组成员可能悬空(如组员引用被滤掉的信息节点
         「最新官网:xxx」→ mihomo 校验 fatal「proxy group: 'xxx' not found」→ 配置应用失败)。
         收集全部订阅组名,组成员只允许:节点名(必须已被过滤后仍存在) / 其他组名 / 内置目标 */
      const subGrpNames = new Set();
      (Array.isArray(D['proxy-groups']) ? D['proxy-groups'] : []).forEach(g => {
        if (g && typeof g === 'object' && !Array.isArray(g)) { const n = String(g.name != null ? g.name : '').trim(); if (n) subGrpNames.add(n) }
      });
      const BUILTIN_TGT = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', 'no-resolve', 'dns']);
      const dropGrpMemberN = { n: 0 };
      (Array.isArray(D['proxy-groups']) ? D['proxy-groups'] : []).forEach(g => {
        if (!g || typeof g !== 'object' || Array.isArray(g)) return;
        const name = String(g.name != null ? g.name : '').trim();
        if (!name || selfGroupNames.has(name)) return;
        selfGroupNames.add(name);
        if (fusionOn && Array.isArray(g.proxies)) {
          g.proxies = g.proxies.map(n => (typeof n === 'string' && actMapRef && actMapRef.has(n)) ? actMapRef.get(n) : n);
        }
        /* 成员悬空清理: 节点必须仍在(过滤后 nodeSet 未建——此处先收后清,见下方统一清理) */
        if (Array.isArray(g.proxies)) {
          const before = g.proxies.length;
          g.proxies = g.proxies.filter(n => typeof n !== 'string' ? true : (subGrpNames.has(n) || BUILTIN_TGT.has(n) || subNodeNames.indexOf(n) >= 0));
          dropGrpMemberN.n += before - g.proxies.length;
        }
        if (Array.isArray(g.proxies) && !g.proxies.length && !g.use) return; /* 清后空组且无 use → 整组丢弃 */
        keptGrp.push(g);
      });
      if (dropGrpMemberN.n) console.log('[小海关] 合并模式: 订阅组悬空成员清理 ' + dropGrpMemberN.n + ' 个(被过滤节点/失效引用)');
      /* 订阅规则: 基于解析后的规则字符串。保守结构化拆分(已知简单类型),复杂逻辑规则
         (SUB-RULE/逻辑规则/含额外参数)保持原文透传并计数——不再按逗号盲拆(F05) */
      const localRules = rules.slice(0, -1); /* 去掉自建 MATCH */
      const SIMPLE_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX', 'GEOSITE', 'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'SRC-IP-CIDR', 'SRC-PORT', 'DST-PORT', 'GEOIP', 'SRC-GEOIP', 'PROCESS-NAME', 'PROCESS-PATH', 'PROCESS-PATH-REGEX', 'NETWORK', 'UID', 'IN-TYPE', 'IN-USER', 'IN-NAME']);
      const parseRule = t => {
        const c = t.indexOf(',');
        if (c < 0) return null;
        const type = t.slice(0, c);
        if (!SIMPLE_TYPES.has(type)) return null;
        const pp = [type].concat(t.slice(c + 1).split(','));
        return pp.length >= 3 ? pp : null;
      };
      const keyOf = r => { const pp = r.split(','); return pp[0] + ',' + (pp[1] || '') };
      const seen = new Set(localRules.map(keyOf));
      const okT = new Set(selfGroupNames);
      subNodeNames.forEach(n => okT.add(n)); HS_MANUAL.forEach(n => okT.add(n));
      ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL'].forEach(t => okT.add(t));
      const subRules = []; let dupN = 0, dropN = 0, rwN = 0, keptComplex = 0, rwFusN = 0; /* rwFusN=融合裸名target改写计数(v2.7.0) */
      (Array.isArray(D.rules) ? D.rules : []).forEach(raw => {
        let t = String(raw == null ? '' : raw).trim();
        if (!t || t.charAt(0) === '#') return;
        if (t.split(',')[0] === 'MATCH') return; /* 本地 MATCH 兜底替代(指 🚀 节点选择,调度权在本地) */
        const pp = parseRule(t);
        if (!pp) {
          /* 复杂逻辑规则: 无法安全结构化拆分 → 原文保真透传(去重按整串),不改写不丢弃 */
          if (seen.has(t)) { dupN++; return }
          seen.add(t);
          keptComplex++;
          subRules.push(t);
          return;
        }
        const key = keyOf(t);
        if (seen.has(key)) { dupN++; return }
        let seg = pp.slice(2);
        if (seg.length && /^no-resolve$/i.test(String(seg[seg.length - 1] || '').trim())) seg = seg.slice(0, -1);
        let target = String((seg[seg.length - 1] || '')).trim();
        /* v2.7.0 融合审查问题2: 订阅规则 target 直接指向裸节点名时映射为前缀名(与订阅组成员同款处理,
           否则融合后裸名不在 okT 被静默丢弃);改写后重组 t 供后续 push */
        if (actMapRef && actMapRef.has(target)) {
          seg[seg.length - 1] = actMapRef.get(target);
          target = String(seg[seg.length - 1]).trim();
          t = pp.slice(0, 2).concat(seg).join(',');
          rwFusN++;
        }
        if (!target || !okT.has(target)) { dropN++; return }
        /* 私网/免流段 DIRECT→REJECT 快速失败(2026-09-13 真机: TikTok API 解析出运营商免流 10.105.x.x,
           订阅 IP-CIDR,10/8,DIRECT 在引擎内拨号必超时拖 30s;内核层私网早已 RETURN,这类 DIRECT 只会超时) */
        if (target === 'DIRECT' && (pp[0] === 'IP-CIDR' || pp[0] === 'IP-CIDR6')
          && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|f[cd]|fe[89ab])/.test(pp[1] || '')) {
          const noRes = /^no-resolve$/i.test(String(pp[pp.length - 1] || '').trim());
          const base = noRes ? pp.slice(0, -1) : pp.slice();
          base[base.length - 1] = 'REJECT';
          rwN++;
          seen.add(key);
          subRules.push(base.join(','));
          return;
        }
        seen.add(key);
        subRules.push(t);
      });
      console.log('[小海关] 合并模式: 本地规则 ' + localRules.length + ' + 订阅 ' + subRules.length + '(重复略 ' + dupN + ',目标失效略 ' + dropN + ',私网改REJECT ' + rwN + ',复杂规则保真 ' + keptComplex + (rwFusN ? ',融合裸名改写 ' + rwFusN : '') + ';订阅组保留 ' + keptGrp.length + ')');
      /* ===== 序列化 ===== */
      y += '\n# ===== 合并模式(v' + V + '): 本地骨架+订阅策略,规则本地优先 =====\n';
      /* F05: data 经 merge 展开,序列化后无别名引用——不再拼装锚点定义键(多余顶层键会污染 mihomo 配置) */
      y += subYaml({ proxies: D.proxies }).replace(/\n+$/, '') + '\n';
      /* F09-r2: proxy-providers 对象化输出(含线路专属 ln_*_manual 锚定 filter 项);
         仅输出仍被组 use 引用的 ln_*——静态化后不再 use 的孤儿项不输出(未使用配置不残留) */
      const usedLn = new Set();
      groups.forEach(g => { (g.use || []).forEach(u => { if (/^ln_/.test(u)) usedLn.add(u); }); });
      const ppOut = {};
      if (hasManual) {
        ppOut.manual = { type: 'file', path: './providers/manual.yaml', 'health-check': { enable: true, url: 'https://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true } };
      }
      Object.keys(providers).forEach(k => { if (/^ln_/.test(k) && usedLn.has(k)) ppOut[k] = providers[k]; });
      if (Object.keys(ppOut).length) {
        y += '\n# 手动节点与线路手选池(provider)\n' + subYaml({ 'proxy-providers': ppOut }).replace(/\n+$/, '') + '\n';
      }
      /* rule-providers: 本地 china_ip(chnroute 同源) + 订阅自带条目(china_ip 重名剔除=本地为准);对象化合并后由库序列化 */
      const wantChn = ST.chn > 0;
      const subRpSrc = (D['rule-providers'] && typeof D['rule-providers'] === 'object' && !Array.isArray(D['rule-providers'])) ? D['rule-providers'] : {};
      const subRpObj = {};
      Object.keys(subRpSrc).forEach(k => { if (!(wantChn && k === 'china_ip')) subRpObj[k] = subRpSrc[k] });
      if (wantChn || Object.keys(subRpObj).length) {
        const rpOut = {};
        if (wantChn) rpOut.china_ip = { type: 'file', behavior: 'ipcidr', format: 'text', path: './rules/china_ip.txt', interval: 0 };
        Object.assign(rpOut, subRpObj);
        y += '\n' + subYaml({ 'rule-providers': rpOut }).replace(/\n+$/, '') + '\n';
      }
      /* 组: 本地组链(静态化后) + 订阅组原文 */
      y += '\nproxy-groups:\n';
      groups.forEach(g => {
        y += '  - name: ' + yamlEsc(g.name) + '\n';
        y += '    type: ' + g.type + '\n';
        if (g.proxies) { y += '    proxies: [' + g.proxies.map(yamlEsc).join(', ') + ']\n' }
        if (g.use) { y += '    use: [' + g.use.join(', ') + ']\n' }
        if (g.url) { y += '    url: ' + yamlEsc(g.url) + '\n' }
        if (g.interval) { y += '    interval: ' + g.interval + '\n' }
        if (g.tolerance) { y += '    tolerance: ' + g.tolerance + '\n' }
        if (g.lazy !== undefined) { y += '    lazy: ' + g.lazy + '\n' }
        if (g.strategy) { y += '    strategy: ' + g.strategy + '\n' }
        if (g.default) { y += '    default-selected: ' + yamlEsc(g.default) + '\n' } /* F07: selector 实际消费 default-selected(default 被内核忽略) */
      });
      keptGrp.forEach(g => { y += '\n' + subYaml([g]).replace(/\n+$/, '').split('\n').map(l => '  ' + l).join('\n') + '\n' });
      /* sub-rules 透传: 订阅 SUB-RULE 逻辑规则的配套定义段(直通经 yaml 字段整体保真;合并在此透传) */
      if (D['sub-rules'] && typeof D['sub-rules'] === 'object') {
        y += '\n' + subYaml({ 'sub-rules': D['sub-rules'] }).replace(/\n+$/, '') + '\n';
      }
      /* 规则: 本地(含线路 SRC) → 订阅分类(去重) → MATCH 本地主组 */
      y += '\nrules:\n';
      localRules.concat(subRules).concat(['MATCH,🚀 节点选择']).forEach(r => { y += '  - ' + yamlEsc(r) + '\n' });
      return y;
    }
  }

  /* P0-7②: chnroute 同源 CIDR 规则集(存在才引用,与 GEOIP 兜底互斥) */
  if (ST.chn > 0) {
    y += '\n# 规则集\n';
    y += 'rule-providers:\n';
    y += '  china_ip:\n';
    y += '    type: file\n';
    y += '    behavior: ipcidr\n';
    y += '    format: text\n';
    y += '    path: ./rules/china_ip.txt\n';
    y += '    interval: 0\n';
  }
  if (Object.keys(providers).length) {
    y += '\n# 订阅\nproxy-providers:\n';
    Object.keys(providers).forEach(k => {
      const pv = providers[k];
      y += '  ' + k + ':\n';
      y += '    type: ' + pv.type + '\n';
      if (pv.url) y += '    url: ' + yamlEsc(pv.url) + '\n';
      y += '    path: ' + yamlEsc(pv.path) + '\n';
      if (pv.filter) y += '    filter: ' + yamlEsc(pv.filter) + '\n';
      if (pv.interval !== undefined) y += '    interval: ' + pv.interval + '\n';
      y += '    health-check:\n';
      y += '      enable: ' + pv['health-check'].enable + '\n';
      y += '      url: ' + yamlEsc(pv['health-check'].url) + '\n';
      y += '      interval: ' + pv['health-check'].interval + '\n';
      y += '      lazy: ' + pv['health-check'].lazy + '\n';
    });
  }

  if (groups.length) {
    y += '\n# 策略组\nproxy-groups:\n';
    groups.forEach(g => {
      y += '  - name: ' + yamlEsc(g.name) + '\n';
      y += '    type: ' + g.type + '\n';
      if (g.proxies) { y += '    proxies: [' + g.proxies.map(yamlEsc).join(', ') + ']\n' }
      if (g.use) { y += '    use: [' + g.use.join(', ') + ']\n' }
      if (g.url) { y += '    url: ' + yamlEsc(g.url) + '\n' }
      if (g.interval) { y += '    interval: ' + g.interval + '\n' }
      if (g.tolerance) { y += '    tolerance: ' + g.tolerance + '\n' }
      if (g.lazy !== undefined) { y += '    lazy: ' + g.lazy + '\n' }
      if (g.strategy) { y += '    strategy: ' + g.strategy + '\n' }
      if (g.default) { y += '    default-selected: ' + yamlEsc(g.default) + '\n' } /* F07: selector 消费字段 */
    });
  }

  y += '\n# 规则\nrules:\n';
  rules.forEach(r => { y += '  - ' + yamlEsc(r) + '\n' });
  return y;
}
async function downloadSub(i) {
  const sub = C.subs[i]; if (!sub) return false;
  const pf = DIR + '/providers/sub' + i + '.yaml';
  const cand = pf + '.part'; /* F06: 独立候选文件——任何失败不触碰现用文件(防错误页/截断覆盖旧订阅) */
  await run('mkdir -p ' + shq(DIR + '/providers') + '; rm -f ' + shq(cand), 5000);
  /* UA 必须报 clash 身份: 机场按 UA 分发格式,裸 curl 拿到的是 base64 分享链接(无 proxy-groups/rules,直通判定必回退);自建调度走 mihomo 内核自拉 provider(自带 UA)不受影响。
     成功四重门: exit 0 + HTTP 2xx + 尺寸下限 + 真实解析通过(extractSubBlocks);全部通过才 mv 原子替换 */
  /* v2.7.4 订阅元信息主数据源=HTTP 响应头 subscription-userinfo(Clash Verge 同源方案,
     用户实证: Verge 能显示而解析订阅文本不可靠): upload/download/total=字节 expire=Unix秒;
     -D dump 头到临时文件,下载成功后解析存 sub.ui 持久化(不依赖订阅内容形态) */
  const hdrF = cand + '.hdr';
  const r = await run('curl -sL -A clash.meta/v1.19.4 --connect-timeout 10 -m 30 -D ' + shq(hdrF) + ' -o ' + shq(cand) + ' -w \'%{http_code}\' ' + shq(sub.url) + '; echo " RC=$?"; wc -c < ' + shq(cand) + ' 2>/dev/null || echo 0', 40000);
  const m = String(r.content || '').match(/(\d{3})\s+RC=(\d+)\s+(\d+)/);
  const http = m ? m[1] : '?'; const rc = m ? m[2] : '?';
  const sz = m ? parseInt(m[3], 10) || 0 : 0;
  const fail = async why => {
    await run('rm -f ' + shq(cand), 5000);
    toast('❌ 订阅下载失败(' + why + ')', 'red');
    await opLog('订阅下载失败(' + why + '),已保留旧订阅');
    return false;
  };
  if (rc !== '0') return fail('curl退出' + rc + ',HTTP ' + http);
  if (!/^2/.test(http)) return fail('HTTP ' + http);
  if (sz < 100) return fail('仅 ' + sz + 'B');
  const raw = await readFile(cand);
  const parsed = raw ? extractSubBlocks(raw) : null;
  if (!parsed || !parsed.ok) return fail('内容无效:' + (parsed && parsed.why ? parsed.why.slice(0, 60) : '读取失败'));
  /* v2.7.15 节点数精确计数(过滤前): 解析已在手,零开销;替代 shell grep 计数(BusyBox 正则兼容性不稳) */
  sub.nodes = Array.isArray(parsed.data.proxies) ? parsed.data.proxies.length : 0;
  await run('mv -f ' + shq(cand) + ' ' + shq(pf), 5000); /* 同目录 mv 原子替换 */
  /* subscription-userinfo 头解析: upload=0; download=...; total=...; expire=Unix秒 */
  try {
    const hdrTxt = await readFile(hdrF);
    const mu = /subscription-userinfo\s*:\s*([^\r\n]+)/i.exec(String(hdrTxt || ''));
    if (mu) {
      const kv = {};
      mu[1].trim().split(';').forEach(p => { const eq = p.indexOf('='); if (eq > 0) { const k = p.slice(0, eq).trim(); const v = parseInt(p.slice(eq + 1).trim(), 10); if (k && !isNaN(v)) kv[k] = v } });
      /* v2.9.57 方案B(用户定): 服务端主动发了流量数据却未给 expire → 自动判长期有效
         (实证: 中国国际机场 expire=空且正文零线索恒空显;良心云靠正文"长期"字样命中兜底才显示)。
         若正文补抓到具体到期日期,下方分支仍覆盖为日期+forever:false,自动判定可被纠正 */
      sub.ui = { up: kv.upload || 0, dl: kv.download || 0, total: kv.total || 0, expire: kv.expire || 0, forever: !kv.expire && (kv.total > 0 || kv.upload > 0 || kv.download > 0) };
    } else sub.ui = null; /* 本次无头→清旧值(机场可能停发) */
  } catch (e) { /* 头解析失败不影响下载结果 */ }
  /* v2.7.15 到期文本补抓(头无 expire 时): 全文已在手,JS 正则抓「套餐到期/到期时间/长期/永久」
     (shell grep 在 BusyBox 上不稳——节点计数同因失败,改为解析后统一 JS 处理) */
  if (!sub.ui || !sub.ui.expire) {
    let rawTxt = String(raw || '');
    try { const dec = decodeURIComponent(rawTxt); if (dec !== rawTxt) rawTxt += '\n' + dec } catch (e) { }
    const mExp = /(?:套餐到期|到期时间|expire)[：:]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i.exec(rawTxt);
    if (/长期|永久/.test(rawTxt)) {
      sub.ui = Object.assign({ up: 0, dl: 0, total: 0, expire: 0 }, sub.ui || {}, { forever: true });
    } else if (mExp) {
      const ts = new Date(mExp[1] + 'T23:59:59');
      if (!isNaN(ts)) sub.ui = Object.assign({ up: 0, dl: 0, total: 0 }, sub.ui || {}, { expire: Math.floor(ts.getTime() / 1000), forever: false });
    }
  }
  if (sub.ui) console.log('[小海关] 订阅「' + sub.name + '」: ' + (sub.ui.total ? '已用 ' + humanGB((sub.ui.up + sub.ui.dl) / 1073741824) + ' / ' + humanGB(sub.ui.total / 1073741824) : '无流量信息') + (sub.ui.forever ? ', 长期有效' : sub.ui.expire ? ', 到期 ' + new Date(sub.ui.expire * 1000).toISOString().slice(0, 10) : ''));
  await run('rm -f ' + shq(hdrF), 5000);
  sub.time = nowStr().slice(0, 16);
  HS_SUBINFO_ALL = undefined; HS_SUB_RAW = ''; HS_SUB_RAW_KEY = ''; HS_SUB_RAW_ALL = null; /* 失效缓存强制重读(含融合全订阅缓存+订阅信息,审查问题3) */
  await saveConf();
  if (C.policySrc !== 'self') await refreshSubRaw(); /* 仅替换成功后才刷新缓存 */
  return true;
}
async function writeConfigAndValidate() {
  /* v2.7.25 修复: 融合节点丢失根因——启动链(applyWithTxn/bootPreflight)直达此处时
     HS_SUB_RAW_ALL 可能仍为 null(只有 saveConfReload 会预载),融合段静默跳过→
     配置只剩基准订阅节点(用户实锢: 节点列表只见基准)。幂等预热,缓存命中零开销 */
  await refreshSubRaw();
  /* F05: 订阅解析失败时 genConfigYaml 返回 null——中止应用,旧 config.yaml 不动(废除静默回退自建) */
  let yaml;
  try { yaml = genConfigYaml() } catch (e) {
    HS_LAST_ERR = '配置生成失败:' + String((e && e.message) || e).slice(0, 120);
    toast('❌ ' + HS_LAST_ERR, 'red');
    await opLog(HS_LAST_ERR + '(旧配置保留)');
    return false;
  }
  if (yaml === null) {
    HS_LAST_ERR = '订阅解析失败,本次不应用(旧配置保留)';
    toast('❌ ' + HS_LAST_ERR, 'red');
    await opLog(HS_LAST_ERR);
    return false;
  }
  const w = await writeFile(CFG, yaml);
  if (!w) { HS_LAST_ERR = '配置文件写入失败(磁盘空间/权限?)'; toast('配置文件写入失败', 'red'); return false }
  if (!ST.bin) return true; /* 内核未装时跳过验证 */
  const t = await run(shq(BIN) + ' -t -d ' + shq(DIR) + ' 2>&1 | tail -3', 15000);
  const out = (t.content || '');
  /* 判读必须以"见到 successful"为准(白名单式): mihomo 失败输出是小写 level=fatal/Parse config error,
     按大写 FATAL 拦截曾永远不命中,坏配置畅通放行导致引擎起不来(真机事故 2026-09-02) */
  if (!/successful/i.test(out)) {
    const bad = (out.split('\n').filter(l => /fatal|error/i.test(l))[0] || '').slice(0, 100);
    HS_LAST_ERR = '配置校验未通过:' + (bad || '详见运行日志'); toast('❌ ' + HS_LAST_ERR, 'red');
    opLog('配置校验失败:' + (bad || out.slice(0, 80)));
    return false;
  }
  return true;
}

/* ================= 引擎(无感启停+透明接管) ================= */
/* start.sh 结构(注释不落盘,知识在此): ①直删自愈哨兵——curl 面板 get_custom_head,200 且无
   __customs_loaded 标记=用户已商店直删,自动完整卸载(清规则/摘自启/停引擎/删目录);面板未就绪
   (重试3次)跳过防误删。②运行日志 256KB 硬上限 shell 层兜底(面板挂掉时 JS 清理执行不了)。
   ③接管挂载兜底——JS 不在场的开机自启场景,等 ctrl 端口就绪(最多20s,就绪前挂=黑洞窗口)后
   fw.sh apply;fw_apply 首行自带 fw_clean,与 JS 侧双挂幂等;整段后台不阻塞返回 */
function genStartSh() {
  /* F14: 传 secret——start.sh 探活需鉴权头(与 config.yaml 同源无新增泄露面);start.sh 权限收紧 700 */
  return generateStartScript(C, { V, DIR, LOGF, BOOT_SH, secret: C.secret });
}
/* ---- fw.sh 生成(透明接管;注释不落盘,知识在此) ----
   结构:fw_clean 完全对称删除(三种挂法/双栈/ip rule+table 100/ipset 拆集合) → fw_apply 先 clean 再建。
   要点:①v4 TCP=nat REDIRECT,v4/v6 UDP=mangle TPROXY 主路径(xt_TPROXY 不可用优雅降级 MARK→TUN);
   ②排除链放行 RFC1918/保留段/用户 CIDR,但 DNS 链(HS_DNS)不参与私网豁免——终端常拿网关当
   DNS 服务器,放行=绕过 mihomo 落 dnsmasq 明文转发运营商(DNS 泄露);③国内直通 chnroute→
   ipset(hs_cn/hs_cn6) 内核态 RETURN;④白名单 MAC 门控(ipset hs_wmac,ipset 模块缺失降级
   iptables -m mac 逐条);⑤DNS53 经 mangle 放行到内核 dns 端口(fake-ip 域名零解析)。 */
/* EasyTier 共存: 读 ET 1.5.0 输出的 state.json(tun/网段/打洞端口),供 genFwSh 生成防火墙排除 */
let ET_CACHE = null;
let ET_DEG_WARNED = false; /* v2.9.58: state.json 降级抽取的 console.warn 会话只提示一次(原每次刷新刷屏=用户困扰) */
let ET_ERR = '';
let ET_ERR_LOGGED = ''; /* v2.7.21: 同一错误只记一次,成功复位(用户日志实锄 9 连刷) */
let HS_ET_SIG = ''; /* 审查 P1-1: ET 组网签名——上次 applyFw 消费时的快照,变化即重应用(仅 coexistAuto) */
/* ET 组网签名: cidrs/v6/p2p_ports 排序拼接(与 fw 消费面同源字段);空/未安装=空串 */
function etSig() {
  if (!C.coexistAuto || !ET_CACHE || !ET_CACHE.active) return '';
  return (ET_CACHE.cidrs || []).slice().sort().join(',') + '|' + (ET_CACHE.cidrs6 || []).slice().sort().join(',')
    + '|' + (ET_CACHE.p2p_ports || []).slice().sort((a, b) => a - b).join(',')
    + '|' + (ET_CACHE.infra_ips || []).slice().sort().join(','); /* v2.7.21: 外联端点变化也触发 fw 更新 */
}
/* 审查 P1-1: ET peer/网段变化跟随——applyFw 时记录签名,collectStatus 尾部比对,
   变化即 reapplyFw(fw 排除面同步);与 syncLineRules 同防抖形态,失败下次采集重试 */
async function syncEtRules() {
  if (HS_UPGRADING) return;
  if (!C.coexistAuto || !ST.running) return; /* 引擎未接管时无需 fw 同步 */
  try {
    await readEtState(); /* 刷新 ET_CACHE(含 state.json+监听口补采) */
    const sig = etSig();
    if (!sig || sig === HS_ET_SIG) return;
    if (!HS_ET_SIG && !ET_CACHE) return; /* ET 未安装/未活跃: 首次空基线不动作 */
    const prev = HS_ET_SIG; HS_ET_SIG = sig;
    await reapplyFw(); /* fw 排除面同步(含 fw 重生成+挂载) */
    await opLog('ET组网变化,已自动更新排除规则');
  } catch (e) { /* 静默重试: 下次 collectStatus 再比 */ }
}
async function readEtState() {
  ET_CACHE = null; ET_ERR = '';
  if (!C.coexistAuto) return;
  const parseOnce = async () => {
    /* 与 readFile 同款 base64 通道(项目内已验证可靠);直接 cat 的原始输出经面板传输可能被改写 */
    const r = await run('base64 < /data/plugins/easytier/state.json 2>/dev/null', 5000);
    if (!r) { ET_ERR = 'run 无返回'; return false }
    if (r.success === false) { ET_ERR = '面板执行失败:' + String(r.content || '').slice(0, 40); return false }
    const txt = b64d(String(r.content || '').replace(/\s+/g, ''));
    if (!txt) { ET_ERR = 'base64 解码为空, 原始:' + String(r.content || '').slice(0, 40); return false }
    try {
      const j = JSON.parse(txt.trim());
      if (!(j && j.version === 1)) { ET_ERR = 'state.json 版本/内容不符:' + String(r.content || '').slice(0, 40); return false }
      ET_CACHE = j;
      return true;
    } catch (e) {
      /* v2.7.21 降级抽取: ET 事件驱动覆写非原子(文档明示),撞上写入瞬间会读到半文件;
         正则抽取前部完整字段——active/cidrs/p2p_ports 在文件前部,大概率可救回 */
      /* v2.9.58: ①降级对象补 tun/config_server/updated 抽取——对端文件持续非法 JSON 时
         「更新于/TUN 网卡/防火墙 ETTUN·ETCS 兜底」仍完整可用(实锢:ET 插件 infra_endpoints
         joiner 少引号致两端点起文件恒非法,降级态丢 updated=「更新于 ?」恒显) ②warn 会话降噪一次 */
      const rxBool = k => { const m = new RegExp('"' + k + '"\\s*:\\s*(true|false)').exec(txt); return m ? m[1] === 'true' : null };
      const rxArr = k => { const m = new RegExp('"' + k + '"\\s*:\\s*\\[([^\\]]*)\\]').exec(txt); return m ? m[1].split(',').map(s => s.replace(/["'\s]/g, '')).filter(Boolean) : null };
      const rxStr = k => { const m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(txt); return m ? m[1] : '' };
      const act = rxBool('active');
      if (act === null) { ET_ERR = '异常:' + String((e && e.message) || e).slice(0, 60); return false }
      ET_CACHE = { version: 1, active: act, cidrs: rxArr('cidrs') || [], p2p_ports: rxArr('p2p_ports') || [], infra_endpoints: rxArr('infra_endpoints') || [], tun: rxStr('tun'), config_server: rxStr('config_server'), updated: rxStr('updated'), degraded: true };
      if (!ET_DEG_WARNED) { ET_DEG_WARNED = true; console.warn('[小海关] ET state.json 解析失败,降级抽取(active=' + act + ')——若每次刷新都出现,多为 ET 插件 state.json 写入格式异常(本会话仅提示一次)') }
      return 'deg'; /* v2.9.58: 降级≠成功,外层等 350ms 净读重试一次(瞬态半文件可救回净数据) */
    }
  };
  let ok = await parseOnce();
  if (ok === 'deg') { await wait(350); if (await parseOnce() === true) ok = true } /* 净读成功覆盖降级;仍降级则保留(显示与防火墙兜底字段已齐) */
  if (!ok || !ET_CACHE) return;
  const j = ET_CACHE;
  /* v1.8.5 安全: state.json 内容零信任——cidrs 逐条过 CIDR 白名单(v4 与 v6 分桶),
     p2p_ports 强制 1..65535 整数;这些值会拼进 root 执行的 fw.sh,未过滤=命令注入面(2026-09-13 审查 P1) */
  const rawC = Array.isArray(j.cidrs) ? j.cidrs : [];
  ET_CACHE.cidrs = rawC.filter(c => typeof c === 'string' && okCidr(c.trim()));
  ET_CACHE.cidrs6 = rawC.filter(c => typeof c === 'string' && okV6(c.trim()));
  ET_CACHE.p2p_ports = (Array.isArray(j.p2p_ports) ? j.p2p_ports : [])
    .map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 65535);
  /* v2.7.21 新字段消费(字段探测式,旧版 ET 无此字段=空数组): infra_endpoints=内核当前
     真实外联端点 IP:port(配置服务器/moon/对端)——提取 IP 进直连排除面,保 ET 打洞不被代理干扰 */
  ET_CACHE.infra_ips = Array.from(new Set((Array.isArray(j.infra_endpoints) ? j.infra_endpoints : [])
    .map(e => String(e || '').split(':')[0])
    .filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)))).slice(0, 16);
  /* 监听口从 ET 配置实时补采(listeners 的 :PORT): 排除用=监听口+打洞口并集,源/目标双向 */
  try {
    const lr = await run("grep -hoE ':[0-9]+' /data/plugins/easytier/configs/*.toml 2>/dev/null | tr -d : | sort -un", 5000);
    (lr.content || '').split(/\s+/).forEach(p => { const n = parseInt(p); if (n > 0 && ET_CACHE.p2p_ports.indexOf(n) < 0) ET_CACHE.p2p_ports.push(n) });
  } catch (e) { }
}
function genFwSh() {
  const P = C.ports;
  const ips = C.s1 === 'white' ? C.devices.filter(d => d.proxy).map(d => d.ip) : [];
  const allMode = C.s1 === 'all';
  /* 方案A: 线路→专属链同源清单(与 genConfigYaml 线路组块同条件同序:id/name 校验+重名跳过);
     设备身份=MAC——每线路 MAC 集 hs_wl_<id> → 线路链 → 线路 listener 端口(与 listeners 段同派生式) */
  const LN_FW = [];
  {
    const seenFwLn = {};
    (C.lines || []).forEach(L => {
      if (!L || !L.id || !L.name || !/^[A-Za-z0-9_-]{1,16}$/.test(L.id)) return;
      const nm = String(L.name);
      if (seenFwLn[nm]) return; seenFwLn[nm] = 1;
      const i = LN_FW.length;
      const macs = (C.devices || []).filter(d => d.line === L.id && d.proxy !== false)
        .map(d => String(d.mac || '').trim().toLowerCase()).filter(m => okMac(m));
      LN_FW.push({ id: L.id, macs, lr: P.redir + 1000 + 2 * i, lt: P.tproxy + 1000 + 2 * i });
    });
  }
  const sh = [
    '#!/bin/sh',
    '#gen:v' + V,
    'D=' + DIR,
    'TUN=' + C.tunName,
    'REDIR=' + P.redir,
    'TPROXYPORT=' + P.tproxy,
    'DNSPORT=' + P.dns,
    'TABLE=100',
    'MARK=0x1',
    'RTMARK=6666',
    'ALLMODE=' + (allMode ? '1' : '0'),
    'S2=' + (C.s2 ? '1' : '0'),
    'CNBP=' + ((C.cnBypass !== false) ? '1' : '0'),
    'CIP=' + P.ctrl,
    'CLAN=' + (C.ctrlLan ? '1' : '0'),
    'ETNETS="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.cidrs) ? ET_CACHE.cidrs.join(' ') : '') + '"',
    'ETNETS6="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.cidrs6) ? ET_CACHE.cidrs6.join(' ') : '') + '"',
    'ETPORTS="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.p2p_ports) ? ET_CACHE.p2p_ports.join(' ') : '') + '"',
    'ETIPS="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.infra_ips) ? ET_CACHE.infra_ips.join(' ') : '') + '"', /* v2.7.21: ET 真实外联端点 IP 直连放行 */
    'ETTUN="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.tun) ? ET_CACHE.tun : '') + '"', /* v2.7.28: tun 接口维度兑底(网段未刷新时不漏) */
    'ETCS="' + ((ET_CACHE && ET_CACHE.active && ET_CACHE.config_server) ? (String(ET_CACHE.config_server).replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0]) : '') + '"', /* v2.7.28: 配置服务器域名(fw 内动态解析为 IP;去掉协议与端口) */
    'IPS="' + ips.filter(ip => okCidr(ip) || okV6(ip)).join(' ') + '"', /* 消费端复滤与 WMACS/EXCIDRS 齐平(v2.0.8 纵深防御;上游 collectDevices/sanitizeConf 已校验,合法值恒通过零行为变化) */
    'WMACS="' + C.devices.filter(d => d.proxy && okMac(d.mac)).map(d => String(d.mac).trim().toLowerCase()).join(' ') + '"',
    'EXCIDRS="' + ((C.exclude || []).filter(x => x && x.m === 'cidr' && okCidr(x.v)).map(x => String(x.v).trim()).join(' ')) + '"',
    /* F04: 用户强制清单 CIDR 形态——fw 层前置直送引擎,防 hs_cn RETURN 提前放行致引擎内 IP-CIDR 强制规则永不命中;
       域名形态强制经 fake-IP 天然不被 hs_cn 命中,不进 fw 层 */
    'FCIDRS="' + ((C.force || []).filter(x => x && x.m === 'cidr' && okCidr(x.v)).map(x => String(x.v).trim()).join(' ')) + '"',
    '',
    '# 并发锁:start.sh 后台探活 apply 与 JS 侧 apply 可能竞态(实锤:链规则重复两套),flock 串行化',
    'exec 9>/tmp/.hs_fw.lock',
    'flock -n 9 || { echo "WARN: fw 并发调用,本次跳过(另一实例处理中)"; exit 0; }',
    '',
    'fw_clean() {',
    '  while iptables -t nat -D PREROUTING -i br-lan -j HS_LAN 2>/dev/null; do :; done',
    '  while iptables -t nat -D PREROUTING -i br-lan -j HS_DNS 2>/dev/null; do :; done',
    '  while iptables -t nat -D PREROUTING -j HS_LAN 2>/dev/null; do :; done', /* 紧修兼容: 同旹清旧版无接口限定残留(升级过渡) */
    '  while iptables -t nat -D PREROUTING -j HS_DNS 2>/dev/null; do :; done',
      '  while iptables -t mangle -D PREROUTING -i br-lan -j HS_UDP 2>/dev/null; do :; done',
      '  while iptables -t mangle -D PREROUTING -j HS_UDP 2>/dev/null; do :; done',
    '  while iptables -t nat -D OUTPUT -j HS_OUT 2>/dev/null; do :; done',
    /* v1.8.4 规格无关清扫: 上面的 while 只删得掉"当前参数"生成的规则,历史代次(旧 WMACS/旧模式)的
       mac/ipset 跳转匹配不上而残留 → -X 失败 → 每次应用刷"清理未净 WARN"(2026-09-13 审计 P2)。
       全表搜 -j HS_ 逐条 -D(${R#-A } 去掉 -A 前缀即删除规格),不再依赖当前配置参数 */
    '  for T in nat mangle; do',
    '    for IPT in iptables ip6tables; do',
    '      $IPT -t $T -S 2>/dev/null | grep -F -- "-j HS_" | while read -r R; do',
    '        $IPT -t $T -D ${R#-A } 2>/dev/null',
    '      done',
    '    done',
    '  done',
    '  for c in HS_LAN HS_DNS HS_OUT; do iptables -t nat -F $c 2>/dev/null; iptables -t nat -X $c 2>/dev/null; done',
    '  iptables -t mangle -F HS_UDP 2>/dev/null; iptables -t mangle -X HS_UDP 2>/dev/null',
    '  ip rule del fwmark $MARK lookup $TABLE 2>/dev/null',
    '  ip route flush table $TABLE 2>/dev/null',
  '  while ip6tables -t nat -D PREROUTING -i br-lan -j HS_V6_LAN 2>/dev/null; do :; done',
  '  while ip6tables -t nat -D PREROUTING -i br-lan -j HS_V6_DNS 2>/dev/null; do :; done',
  '  while ip6tables -t nat -D PREROUTING -j HS_V6_LAN 2>/dev/null; do :; done', /* 紧修兼容: 同旹清旧版无接口限定残留 */
  '  while ip6tables -t nat -D PREROUTING -j HS_V6_DNS 2>/dev/null; do :; done',
  '  while ip6tables -t nat -D PREROUTING -m set --match-set hs_wmac src -j HS_V6_LAN 2>/dev/null; do :; done',
  '  while ip6tables -t nat -D PREROUTING -m set --match-set hs_wmac src -j HS_V6_DNS 2>/dev/null; do :; done',
  '  while iptables -t nat -D PREROUTING -m set --match-set hs_wmac src -j HS_LAN 2>/dev/null; do :; done',
  '  while iptables -t nat -D PREROUTING -m set --match-set hs_wmac src -j HS_DNS 2>/dev/null; do :; done',
  '  while iptables -t mangle -D PREROUTING -m set --match-set hs_wmac src -j HS_UDP 2>/dev/null; do :; done',
  '  for MAC in $WMACS; do',
  '    while iptables -t nat -D PREROUTING -m mac --mac-source $MAC -j HS_DNS 2>/dev/null; do :; done',
  '    while iptables -t nat -D PREROUTING -m mac --mac-source $MAC -j HS_LAN 2>/dev/null; do :; done',
  '    while iptables -t mangle -D PREROUTING -m mac --mac-source $MAC -j HS_UDP 2>/dev/null; do :; done',
  '    while ip6tables -t nat -D PREROUTING -m mac --mac-source $MAC -j HS_V6_LAN 2>/dev/null; do :; done',
  '    while ip6tables -t nat -D PREROUTING -m mac --mac-source $MAC -j HS_V6_DNS 2>/dev/null; do :; done',
  '  done',
  '  while ip6tables -t mangle -D PREROUTING -i br-lan -j HS_V6_UDP 2>/dev/null; do :; done',
  '  while ip6tables -t mangle -D PREROUTING -j HS_V6_UDP 2>/dev/null; do :; done',
    '  while ip6tables -t mangle -D PREROUTING -m set --match-set hs_wmac src -j HS_V6_UDP 2>/dev/null; do :; done',
    '  for MAC in $WMACS; do',
    '    while ip6tables -t mangle -D PREROUTING -m mac --mac-source $MAC -j HS_V6_UDP 2>/dev/null; do :; done',
    '  done',
    '  ip6tables -t mangle -F HS_V6_UDP 2>/dev/null; ip6tables -t mangle -X HS_V6_UDP 2>/dev/null',
    '  ip -6 rule del fwmark $MARK table $TABLE 2>/dev/null',
    '  ip -6 route flush table $TABLE 2>/dev/null',
    '  while iptables -D INPUT -m mark --mark $MARK -j ACCEPT 2>/dev/null; do :; done',
    '  while ip6tables -D INPUT -m mark --mark $MARK -j ACCEPT 2>/dev/null; do :; done',
    '  for c in HS_V6_LAN HS_V6_DNS; do ip6tables -t nat -F $c 2>/dev/null; ip6tables -t nat -X $c 2>/dev/null; done',
  '  ipset destroy hs_cn 2>/dev/null',
  '  ipset destroy hs_cn6 2>/dev/null',
  '  ipset destroy hs_wmac 2>/dev/null',
    /* 方案A热修: 孤儿清理——枚举现存 hs_wl_ 前缀集合与 HS_LAN_/HS_UDP_ 前缀链,与当前线路清单(WL_KEEP)比对,
       销毁已删线路残留(复核实测:删线后旧集合/链残留 12 条→死端口黑洞);apply 前的 fw_clean 也经此,重 apply 自带收敛 */
    '  WL_KEEP="' + LN_FW.map(w => w.id).join(' ') + '"',
    '  for S in $(ipset list -n 2>/dev/null | grep "^hs_wl_"); do',
    '    case " $WL_KEEP " in *" ${S#hs_wl_} "*) ;; *)',
    '      while iptables -t nat -D PREROUTING -m set --match-set $S src -j HS_DNS 2>/dev/null; do :; done',
    '      while iptables -t nat -D PREROUTING -m set --match-set $S src -j HS_LAN_${S#hs_wl_} 2>/dev/null; do :; done',
    '      while iptables -t mangle -D PREROUTING -m set --match-set $S src -j HS_UDP_${S#hs_wl_} 2>/dev/null; do :; done',
    '      iptables -t nat -F HS_LAN_${S#hs_wl_} 2>/dev/null; iptables -t nat -X HS_LAN_${S#hs_wl_} 2>/dev/null',
    '      iptables -t mangle -F HS_UDP_${S#hs_wl_} 2>/dev/null; iptables -t mangle -X HS_UDP_${S#hs_wl_} 2>/dev/null',
    '      ipset destroy $S 2>/dev/null',
    '      ;; esac',
    '  done',
    /* 方案A: 线路链/集合清理对称 */
    ...LN_FW.flatMap(w => [
      '  while iptables -t nat -D PREROUTING -m set --match-set hs_wl_' + w.id + ' src -j HS_LAN_' + w.id + ' 2>/dev/null; do :; done',
      '  while iptables -t nat -D PREROUTING -m set --match-set hs_wl_' + w.id + ' src -j HS_DNS 2>/dev/null; do :; done',
      '  while iptables -t mangle -D PREROUTING -m set --match-set hs_wl_' + w.id + ' src -j HS_UDP_' + w.id + ' 2>/dev/null; do :; done',
      '  iptables -t nat -F HS_LAN_' + w.id + ' 2>/dev/null; iptables -t nat -X HS_LAN_' + w.id + ' 2>/dev/null',
      '  iptables -t mangle -F HS_UDP_' + w.id + ' 2>/dev/null; iptables -t mangle -X HS_UDP_' + w.id + ' 2>/dev/null',
      '  ipset destroy hs_wl_' + w.id + ' 2>/dev/null',
    ]),
  '  rm -f $D/.tpmode 2>/dev/null',
  '  echo cleaned',
  '  iptables -t nat -nL HS_LAN >/dev/null 2>&1 && echo "WARN: HS_LAN 清理未净(残留规则风险)"',
  '  iptables -t mangle -nL HS_UDP >/dev/null 2>&1 && echo "WARN: HS_UDP 清理未净(残留规则风险)"',
  '  ip6tables -t mangle -nL HS_V6_UDP >/dev/null 2>&1 && echo "WARN: HS_V6_UDP 清理未净"',
    '}',
    '',
    'fw_apply() {',
    '  fw_clean',
    '  echo 1 > /proc/sys/net/ipv4/ip_forward',
    '  iptables -t nat -N HS_LAN 2>/dev/null; iptables -t nat -F HS_LAN 2>/dev/null',
    '  iptables -t nat -N HS_DNS 2>/dev/null; iptables -t nat -F HS_DNS 2>/dev/null',
    '  iptables -t mangle -N HS_UDP 2>/dev/null; iptables -t mangle -F HS_UDP 2>/dev/null',
    '  ip6tables -t nat -N HS_V6_LAN 2>/dev/null; ip6tables -t nat -F HS_V6_LAN 2>/dev/null',
    '  ip6tables -t nat -N HS_V6_DNS 2>/dev/null; ip6tables -t nat -F HS_V6_DNS 2>/dev/null',
    '  for NET in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/4 240.0.0.0/4 255.255.255.255/32; do',
    '    iptables -t nat -A HS_LAN -d $NET -j RETURN',
    '    iptables -t mangle -A HS_UDP -d $NET -j RETURN',
    '  done',
    '  for NET in $EXCIDRS; do',
    '    iptables -t nat -A HS_LAN -d $NET -j RETURN',
    '    iptables -t mangle -A HS_UDP -d $NET -j RETURN',
    '  done',
    '  # 局域网访问控制接口放行: 开启时 LAN 设备访问 ctrl 端口不被 REDIRECT 劫持(否则 API 请求进 redir 黑洞)',
    '  [ "$CLAN" = "1" ] && iptables -t nat -A HS_LAN -p tcp --dport $CIP -j RETURN',
    '  if [ "$CNBP" = "1" ] && [ -s $D/chnroute.txt ]; then',
    '    ipset create hs_cn hash:net family inet hashsize 2048 maxelem 65536 -exist 2>/dev/null',
    '    ipset flush hs_cn 2>/dev/null',
    /* v1.8.5: 收紧数据校验——ipset restore 遇非法条目即中途中止,其后全部网段进不了集合(国内直通静默退化);
       非法值(掩码越界)必须过滤掉(2026-09-13 审查 P2) */
    "    awk '{n=split($1,a,\"/\"); if (n==2 && a[2]<=32 && a[1] ~ /^[0-9.]+$/) print \"add hs_cn \" $1 \" -exist\"}' $D/chnroute.txt > /tmp/.hs_ip4 2>/dev/null",
    '    ipset restore < /tmp/.hs_ip4 2>/dev/null',
    '    rm -f /tmp/.hs_ip4',
    "    CN4N=$(ipset list hs_cn 2>/dev/null | grep -c '^[0-9]')",
    '    [ "$CN4N" -lt 100 ] && echo "WARN: hs_cn 灌入异常($CN4N 条)"',
    '    modprobe xt_set 2>/dev/null',
    '    iptables -t nat -I HS_LAN 1 -m set --match-set hs_cn dst -j RETURN',
    '    iptables -t mangle -I HS_UDP 1 -m set --match-set hs_cn dst -j RETURN',
    /* F04: 强制 CIDR 前置直送(后插压顶=序在 hs_cn RETURN 之上);TCP nat 直 REDIRECT;UDP 在 TPROXY_MODE 判定后补插 */
    '    for NET in $FCIDRS; do iptables -t nat -I HS_LAN 1 -d $NET -p tcp -j REDIRECT --to-ports $REDIR; done',
    '    iptables -t nat -S HS_LAN 2>/dev/null | grep -q "match-set hs_cn" || echo "WARN: v4国内直通规则未挂载"',
    '  fi',
    '  if [ "$CNBP" = "1" ]; then',
    /* v1.8.4 国内 v6 快车道数据兜底: chnroute6.txt 缺失时用内置三网大段(电信/联通/移动+CERNET),
       此前无文件=v6 放行分支永不执行,国内 v6 全量 REDIRECT 进引擎(弱 CPU 上国内站慢/微信图片转圈根因,2026-09-13 审计 P0) */
    '    if [ -s $D/chnroute6.txt ]; then',
    "      CN6=$(awk '{n=split($1,a,\"/\"); if (n==2 && a[2]<=128 && a[1] ~ /^[0-9a-fA-F:]+$/) print $1}' $D/chnroute6.txt 2>/dev/null)",
    '    else',
    '      CN6="240e::/20 2408:8000::/20 2409:8000::/20 2001:250::/32"',
    '      echo "INFO: v6国内表缺失,内置三网大段兜底(设置→分流→国内直通 可下载/上传完整表)"',
    '    fi',
    /* v1.8.9 重构: 先建集合并灌条目 → 真插 -m set 规则 → 验证 → 失败降级内置大段。
       此前以 `ip6tables -m set -h`(仅用户态帮助)为判据:内核缺 xt_set 时 -h 照样成功、实际 -I 失败被吞,
       v6 国内直通静默失效(2026-10-01 用户设备实证: ipset 3443 条但 HS_V6_LAN 内 hs_cn6 规则 0 条)。
       降级不用全表逐条(3443 条线性匹配会拖垮弱 CPU),用内置大段 4 条≈95% 覆盖 */
    '    ipset create hs_cn6 hash:net family inet6 hashsize 128 maxelem 8192 -exist 2>/dev/null',
    '    ipset flush hs_cn6 2>/dev/null',
    '      for NET6 in $CN6; do echo "add hs_cn6 $NET6 -exist"; done > /tmp/.hs_ip6 2>/dev/null',
    '      ipset restore < /tmp/.hs_ip6 2>/dev/null',
    '      rm -f /tmp/.hs_ip6',
    '      modprobe xt_set 2>/dev/null',
    '      ip6tables -t nat -I HS_V6_LAN 1 -m set --match-set hs_cn6 dst -j RETURN 2>/dev/null',
    '      if ip6tables -t nat -S HS_V6_LAN 2>/dev/null | grep -q "match-set hs_cn6"; then',
    "        CN6N=$(ipset list hs_cn6 2>/dev/null | grep -c '^[0-9a-f]')",
    '        [ "$CN6N" -lt 4 ] && echo "WARN: hs_cn6 灌入异常($CN6N 条)"',
    '      else',
    '        for NET in 240e::/20 2408:8000::/20 2409:8000::/20 2001:250::/32; do',
    '          ip6tables -t nat -I HS_V6_LAN 1 -d $NET -j RETURN 2>/dev/null',
    '        done',
    '        echo "WARN: ip6tables 不支持 ipset 匹配,v6 国内直通降级为内置三网大段(约95%覆盖)"',
    '      fi',
    '  fi',
    '  iptables -t mangle -I HS_UDP 1 -s 198.18.0.0/15 -j RETURN',
    '  for NET in $ETNETS; do',
    '    iptables -t nat -I HS_LAN 1 -d $NET -j RETURN',
    '    iptables -t mangle -I HS_UDP 1 -d $NET -j RETURN',
    '  done',
    '  for IP in $ETIPS; do',
    '    iptables -t nat -I HS_LAN 1 -d $IP -j RETURN',
    '    iptables -t mangle -I HS_UDP 1 -d $IP -j RETURN',
    '  done',
    '  if [ -n "$ETTUN" ]; then', /* v2.7.29: 仅 -i 可用(PREROUTING 无 -o——v2.7.28 静默失败教训): 隧道回程流量 */
    '    iptables -t mangle -I HS_UDP 1 -i $ETTUN -j RETURN 2>/dev/null',
    '  fi',
    '  if [ -z "$ETIPS" ] && [ -n "$ETCS" ]; then', /* v2.7.29: infra_endpoints 可用时已含配置服务器真实 IP,域名解析自动让位(去重) */
    '    for H in $ETCS; do',
    '      CIP=$(nslookup $H 127.0.0.1 2>/dev/null | awk "/^Address/{print \\$3}" | tail -1)',
    '      case "$CIP" in *.*.*.*) iptables -t nat -I HS_LAN 1 -d $CIP -j RETURN; iptables -t mangle -I HS_UDP 1 -d $CIP -j RETURN ;; esac',
    '    done',
    '  fi',
    '  for PT in $ETPORTS; do',
    '    iptables -t mangle -I HS_UDP 1 -p udp --dport $PT -j RETURN',
    '    iptables -t nat -I HS_LAN 1 -p tcp --dport $PT -j RETURN',
    '    iptables -t mangle -I HS_UDP 1 -p udp --sport $PT -j RETURN',
    '    iptables -t nat -I HS_LAN 1 -p tcp --sport $PT -j RETURN',
    '  done',
    '  iptables -t mangle -I HS_UDP 1 -p udp --dport 53 -j RETURN',
    '  iptables -t nat -A HS_DNS -p udp --dport 53 -j REDIRECT --to-ports $DNSPORT',
    '  iptables -t nat -A HS_DNS -p tcp --dport 53 -j REDIRECT --to-ports $DNSPORT',
    '  iptables -t nat -A HS_LAN -p tcp -j REDIRECT --to-ports $REDIR',
    '  modprobe xt_TPROXY 2>/dev/null',
    '  TP6=0',
    '  TPROXY_MODE=0',
    '  if iptables -t mangle -A HS_UDP -p udp -j TPROXY --on-port $TPROXYPORT --tproxy-mark $MARK 2>/dev/null; then',
    '    TPROXY_MODE=1',
    '  else',
    '    iptables -t mangle -A HS_UDP -p udp -j MARK --set-mark $MARK',
    '    echo "WARN: xt_TPROXY 不可用,UDP 走 TUN 降级(游戏/QUIC 可能异常)"',
    '  fi',
    /* F04: UDP 侧强制 CIDR 直送(与链尾同形态),插后重排 198.18 源 RETURN 到顶
       (防引擎 fake-IP 源回流被 FC 规则抓回引擎=回环) */
    '  for NET in $FCIDRS; do',
    '    if [ "$TPROXY_MODE" = "1" ]; then iptables -t mangle -I HS_UDP 1 -d $NET -p udp -j TPROXY --on-port $TPROXYPORT --tproxy-mark $MARK 2>/dev/null;',
    '    else iptables -t mangle -I HS_UDP 1 -d $NET -p udp -j MARK --set-mark $MARK; fi',
    '  done',
    '  if [ -n "$FCIDRS" ]; then',
    '    while iptables -t mangle -D HS_UDP -s 198.18.0.0/15 -j RETURN 2>/dev/null; do :; done',
    '    iptables -t mangle -I HS_UDP 1 -s 198.18.0.0/15 -j RETURN',
    '  fi',
    '  if [ "$ALLMODE" = "1" ]; then',
    /* v1.8.5: 先插 LAN 再插 DNS(-I 1 每次插到最顶)→ PREROUTING 最终顺序 DNS→LAN;此前相反,
       LAN 链末尾的 tcp catch-all 会把 TCP:53 抢走,导致 TCP DNS 劫持分支不可达(2026-09-13 审查 P2) */
    '    iptables -t nat -I PREROUTING 1 -i br-lan -j HS_LAN',
    '    iptables -t nat -I PREROUTING 1 -i br-lan -j HS_DNS',
    '    iptables -t mangle -I PREROUTING 1 -i br-lan -j HS_UDP', /* 紧修: 全接管接口限定——WAN 入站(同设备 Lucky 端口转发/反代/STUN)不再被劫持 */
    '  elif [ -n "$WMACS" ]; then',
    '    if ipset create hs_wmac hash:mac -exist 2>/dev/null && ipset flush hs_wmac 2>/dev/null; then',
    '      for MAC in $WMACS; do ipset add hs_wmac $MAC -exist 2>/dev/null; done',
    '      iptables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_LAN',
    '      iptables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_DNS',
    '      iptables -t mangle -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_UDP',
    '    elif iptables -m mac -h >/dev/null 2>&1; then',
    '      echo "WARN: ipset 不可用,v4 白名单降级 -m mac 逐条(规则数=MAC数×3)"',
    '      for MAC in $WMACS; do',
    '        iptables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_LAN',
    '        iptables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_DNS',
    '        iptables -t mangle -I PREROUTING 1 -m mac --mac-source $MAC -j HS_UDP',
    '      done',
    '    else',
    '      echo "ERR: 白名单门控不可用(ipset 与 -m mac 均缺失),本次未挂接管"',
    '    fi',
    '  fi',
    /* 方案A: 线路分派链——hs_wl_<id>(MAC 集)→线路链→线路 listener;链内无 hs_cn RETURN
       (国内流量须进引擎由 RULE-SET,china_ip 判 DIRECT——F03 序);挂载 -I 1 压主链之上,
       DNS 链后插在顶(与主链同口径 DNS→LAN) */
    ...LN_FW.flatMap(w => [
      '  ipset create hs_wl_' + w.id + ' hash:mac -exist 2>/dev/null && ipset flush hs_wl_' + w.id + ' 2>/dev/null',
      '  for M in ' + (w.macs.length ? w.macs.join(' ') : '') + '; do ipset add hs_wl_' + w.id + ' $M -exist 2>/dev/null; done',
      '  iptables -t nat -N HS_LAN_' + w.id + ' 2>/dev/null; iptables -t nat -F HS_LAN_' + w.id + ' 2>/dev/null',
      '  iptables -t mangle -N HS_UDP_' + w.id + ' 2>/dev/null; iptables -t mangle -F HS_UDP_' + w.id + ' 2>/dev/null',
      '  for NET in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/4 240.0.0.0/4 255.255.255.255/32; do',
      '    iptables -t nat -A HS_LAN_' + w.id + ' -d $NET -j RETURN',
      '    iptables -t mangle -A HS_UDP_' + w.id + ' -d $NET -j RETURN',
      '  done',
      '  for NET in $ETNETS $ETIPS $EXCIDRS; do',
      '    iptables -t nat -I HS_LAN_' + w.id + ' 1 -d $NET -j RETURN',
      '    iptables -t mangle -I HS_UDP_' + w.id + ' 1 -d $NET -j RETURN',
      '  done',
      '  iptables -t nat -A HS_LAN_' + w.id + ' -p tcp -j REDIRECT --to-ports ' + w.lr,
      '  iptables -t mangle -I HS_UDP_' + w.id + ' 1 -p udp --dport 53 -j RETURN',
      '  if [ "$TPROXY_MODE" = "1" ]; then iptables -t mangle -A HS_UDP_' + w.id + ' -p udp -j TPROXY --on-port ' + w.lt + ' --tproxy-mark $MARK 2>/dev/null; else iptables -t mangle -A HS_UDP_' + w.id + ' -p udp -j MARK --set-mark $MARK; fi',
      '  iptables -t nat -I PREROUTING 1 -m set --match-set hs_wl_' + w.id + ' src -j HS_LAN_' + w.id,
      '  iptables -t nat -I PREROUTING 1 -m set --match-set hs_wl_' + w.id + ' src -j HS_DNS',
      '  iptables -t mangle -I PREROUTING 1 -m set --match-set hs_wl_' + w.id + ' src -j HS_UDP_' + w.id,
    ]),
    '  ip rule add fwmark $MARK table $TABLE 2>/dev/null',
    '  if [ "$TPROXY_MODE" = "1" ]; then',
    '    ip route add local 0.0.0.0/0 dev lo table $TABLE 2>/dev/null',
    '  else',
    '    ip route add default dev $TUN table $TABLE 2>/dev/null',
    '  fi',
    '  if [ "$S2" = "1" ]; then',
    '    iptables -t nat -N HS_OUT 2>/dev/null; iptables -t nat -F HS_OUT 2>/dev/null',
    '    iptables -t nat -A HS_OUT -m mark --mark $RTMARK -j RETURN',
    '    iptables -t nat -A HS_OUT -d 127.0.0.0/8 -j RETURN',
    '    iptables -t nat -A HS_OUT -d 224.0.0.0/4 -j RETURN',
    '    iptables -t nat -A HS_OUT -d 192.168.0.0/16 -j RETURN',
    '    iptables -t nat -A HS_OUT -d 10.0.0.0/8 -j RETURN',
    '    iptables -t nat -A HS_OUT -d 172.16.0.0/12 -j RETURN',
    '    for NET in $ETNETS; do iptables -t nat -I HS_OUT 1 -d $NET -j RETURN; done',
    '    for IP in $ETIPS; do iptables -t nat -I HS_OUT 1 -d $IP -j RETURN; done',
    '    if [ -n "$ETTUN" ]; then iptables -t nat -I HS_OUT 1 -o $ETTUN -j RETURN 2>/dev/null; fi',
    '    if [ -z "$ETIPS" ] && [ -n "$ETCS" ]; then',
    '      for H in $ETCS; do',
    '        CIP=$(nslookup $H 127.0.0.1 2>/dev/null | awk "/^Address/{print \\$3}" | tail -1)',
    '        case "$CIP" in *.*.*.*) iptables -t nat -I HS_OUT 1 -d $CIP -j RETURN ;; esac',
    '      done',
    '    fi',
    '    for NET in $ETNETS6; do ip6tables -t nat -I HS_V6_LAN 1 -d $NET -j RETURN 2>/dev/null; done',
    '    for PT in $ETPORTS; do iptables -t nat -I HS_OUT 1 -p tcp --dport $PT -j RETURN; done',
    '    iptables -t nat -A HS_OUT -p tcp -j REDIRECT --to-ports $REDIR',
    '    iptables -t nat -I OUTPUT 1 -j HS_OUT',
    '  fi',
    '  ip6tables -t nat -N HS_V6_DNS 2>/dev/null; ip6tables -t nat -F HS_V6_DNS 2>/dev/null',
    /* v1.9.0 关键修复: 此处原有 -F HS_V6_LAN 会把 CN6 段(1225 建链、1271 挂载)已插的
       hs_cn6 RETURN 规则整链清空——用户设备实证 ipset 3443 条/挂载规则 0 条(2026-10-01)。
       链在 1225 已建,此处只兜底补建,绝不清空 */
    '  ip6tables -t nat -N HS_V6_LAN 2>/dev/null;',
    '  for NET in ::1/128 fe80::/10 fdfe:dcba:9876::/48; do',
    '    ip6tables -t nat -A HS_V6_LAN -d $NET -j RETURN',
    '  done',
    '  LAN6_PREFIX=$(ip -6 route show dev br-lan 2>/dev/null | grep "/" | grep -v default | head -1 | awk "{print \\$1}")',
    '  case "$LAN6_PREFIX" in */*) ip6tables -t nat -A HS_V6_LAN -d $LAN6_PREFIX -j RETURN 2>/dev/null ;; esac',
    '  ip6tables -t nat -A HS_V6_DNS -p udp --dport 53 -j REDIRECT --to-ports $DNSPORT',
    '  ip6tables -t nat -A HS_V6_DNS -p tcp --dport 53 -j REDIRECT --to-ports $DNSPORT',
    '  ip6tables -t nat -A HS_V6_LAN -p tcp -j REDIRECT --to-ports $REDIR',
    '  if [ "$ALLMODE" = "1" ]; then',
    '    ip6tables -t nat -I PREROUTING 1 -i br-lan -j HS_V6_LAN',
    '    ip6tables -t nat -I PREROUTING 1 -i br-lan -j HS_V6_DNS', /* 紧修: v6 全接管同款接口限定 */
    '  elif [ -n "$WMACS" ]; then',
    '    if ip6tables -m set -h >/dev/null 2>&1 && ipset list hs_wmac >/dev/null 2>&1; then',
    '      ip6tables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_V6_LAN',
    '      ip6tables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_V6_DNS',
    '    elif ip6tables -m mac -h >/dev/null 2>&1; then',
    '      for MAC in $WMACS; do',
    '        ip6tables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_V6_LAN',
    '        ip6tables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_V6_DNS',
    '      done',
    '    else',
    "      echo \"ERR: v6白名单门控不可用(ipset与-m mac均缺失),本次未挂v6接管\"", /* 审查P2-8: 与 v4 同场景对齐(此前静默) */
    '    fi',
    '  fi',
    '  ip6tables -t mangle -N HS_V6_UDP 2>/dev/null; ip6tables -t mangle -F HS_V6_UDP 2>/dev/null',
    '  for NET6 in ::1/128 fe80::/10 fdfe:dcba:9876::/48; do',
    '    ip6tables -t mangle -A HS_V6_UDP -d $NET6 -j RETURN',
    '  done',
    '  case "$LAN6_PREFIX" in */*) ip6tables -t mangle -A HS_V6_UDP -d $LAN6_PREFIX -j RETURN 2>/dev/null ;; esac',
    /* v1.8.9 同款重构: 真插+验证,失败降级内置大段(UDP 同样受益) */
    '  if [ "$CNBP" = "1" ]; then',
    '    ip6tables -t mangle -I HS_V6_UDP 1 -m set --match-set hs_cn6 dst -j RETURN 2>/dev/null',
    '    ip6tables -t mangle -S HS_V6_UDP 2>/dev/null | grep -q "match-set hs_cn6" || for NET in 240e::/20 2408:8000::/20 2409:8000::/20 2001:250::/32; do ip6tables -t mangle -I HS_V6_UDP 1 -d $NET -j RETURN 2>/dev/null; done',
    '  fi',
    '  ip6tables -t mangle -I HS_V6_UDP 1 -p udp --dport 53 -j RETURN',
    '  if ip6tables -t mangle -A HS_V6_UDP -p udp -j TPROXY --on-port $TPROXYPORT --tproxy-mark $MARK 2>/dev/null; then',
    '    TP6=1',
    '    if [ "$ALLMODE" = "1" ]; then',
    '      ip6tables -t mangle -I PREROUTING 1 -i br-lan -j HS_V6_UDP', /* 紧修: 同上 */
    '    elif [ -n "$WMACS" ]; then',
    '      if ip6tables -m set -h >/dev/null 2>&1 && ipset list hs_wmac >/dev/null 2>&1; then',
    '        ip6tables -t mangle -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_V6_UDP',
    '      elif ip6tables -m mac -h >/dev/null 2>&1; then',
    '        for MAC in $WMACS; do ip6tables -t mangle -I PREROUTING 1 -m mac --mac-source $MAC -j HS_V6_UDP; done',
    '      fi',
    '    fi',
    '    ip -6 rule add fwmark $MARK table $TABLE 2>/dev/null',
    '    ip -6 route add local ::/0 dev lo table $TABLE 2>/dev/null',
    '  else',
    '    ip6tables -t mangle -F HS_V6_UDP 2>/dev/null; ip6tables -t mangle -X HS_V6_UDP 2>/dev/null',
    '  fi',
    '  iptables -C INPUT -m mark --mark $MARK -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -m mark --mark $MARK -j ACCEPT',
  '  ip6tables -C INPUT -m mark --mark $MARK -j ACCEPT 2>/dev/null || ip6tables -I INPUT 1 -m mark --mark $MARK -j ACCEPT',
  /* ⑧ 落 UDP 接管降级标记(.tpmode): TPM=v4 TPROXY TPM6=v6 TPROXY,fw_clean 清除,诊断 status 读回判定 */
  '  echo "TPM=$TPROXY_MODE TPM6=$TP6" > $D/.tpmode 2>/dev/null',
  '  echo applied',
    '}',
    '',
    'case "$1" in',
    '  apply) fw_apply ;;',
    '  clean) fw_clean ;;',
    '  status) iptables -t nat -S HS_LAN 2>/dev/null | head -5; ip6tables -t nat -S HS_V6_LAN 2>/dev/null | head -3; echo CN4=$(ipset list hs_cn 2>/dev/null | grep -c "^[0-9]"); echo CN6=$(ipset list hs_cn6 2>/dev/null | grep -c "^[0-9a-f]"); echo TPM=$(cat $D/.tpmode 2>/dev/null || echo none) ;;',
    'esac'
  ].join('\n') + '\n';
  return sh;
}
/* v2.1.5: 磁盘治理——设备 /data 分区小,装齐内核+geo+路由表后所剩无几,写满后一切静默失败
   (真机实证: 剩余 0.0MB 时升级烙印写不进=复核失败自动回滚,配置/订阅/下载全部无声丢) */
async function hsDiskKB() {
  /* v2.1.6: 口径修正——超长设备名(如 /dev/block/bootdevice/by-name/userdata)会让 BusyBox df 换行,
     数据行少一列,按固定 $4 取值会拿到 Use%(如"9%"→9KB),满盘误报剩 0.0MB 且预检误拦启动(真机实证);
     改按挂载点匹配行取 $(NF-2)=Available,换行/不换行两种形态都正确 */
  const fr = await run('df -k /data /overlay 2>/dev/null | awk \'$NF=="/data" || $NF=="/overlay" {print $(NF-2)}\'', 5000);
  /* <1MB 的读数物理不可能(内核+geo 装不下的分区跑不起本插件),视为解析残渣丢弃——双保险,防再遇未知 df 形态误拦启动 */
  const nums = (fr.content || '').split('\n').map(l => parseInt(l, 10)).filter(n => !isNaN(n) && n >= 1024);
  return nums.length ? Math.max.apply(null, nums) : 0; /* 与诊断⑦同口径:/data 与 /overlay 同 mount 时取其一不双计 */
}
async function hsCleanJunk() {
  /* 清插件目录可再生的临时产物:下载残留(.dl/.dl.gz)、解压中间件(mihomo.tmp)、轮询哨兵(四任务 .exit/.pid)、写盘备份(.bak) */
  await run('cd ' + shq(DIR) + ' 2>/dev/null && rm -f *.dl *.dl.gz mihomo.tmp .dl.exit .pf.exit .geo.exit .chn.exit .dl.pid .pf.pid .geo.pid .chn.pid fw.sh.bak start.sh.bak config.yaml.bak conf.json.bak 2>/dev/null', 8000);
  return await hsDiskKB();
}
async function applyFw() {
  await readEtState();
  HS_ET_SIG = etSig(); /* 审查 P1-1: 记录本次 applyFw 消费的 ET 快照签名,供 syncEtRules 比对 */
  const w = await writeFile(FW, genFwSh());
  if (!w) { toast('防火墙脚本写入失败', 'red'); return false }
  const r = await run('chmod 755 ' + shq(FW) + '; sh ' + shq(FW) + ' apply 2>&1; echo "---RULES---"; iptables -t nat -S PREROUTING 2>/dev/null | grep HS_ | head -6; iptables -t nat -S HS_LAN 2>/dev/null | head -8', 15000);
  console.log('[小海关] applyFw 结果:', r.content);
  const fwOut = (r.content || '').split('---RULES---')[0];
  /* F13: 致命/非致命分级——命令执行错误(工具缺失/内核拒权/链操作失败/ERR 级挂载失败)即接管未生效,
     必须 return false 让调用方与用户感知(引擎在跑但流量未接管);纯 WARN/INFO 降级提示保留记录不中止(降级=尽力而为仍挂了规则) */
  const fatal = fwOut.match(/No chain|Bad argument|iptables: error|ip6tables:|not found|Permission denied|Operation not permitted|ERR:/i);
  if (fatal) {
    const line = (fwOut.split('\n').find(l => new RegExp(fatal[0], 'i').test(l)) || '').slice(0, 120);
    toast('❌ 规则挂载失败: ' + line, 'red');
    await opLog('fw应用致命失败(接管未生效): ' + line);
    return false;
  }
  /* v1.8.9: WARN/INFO 行完整保留——此前 50 字符截断把"v6国内直通规则未挂载"等关键告警藏在日志外(用户设备实证) */
  else {
    const warns = fwOut.trim().split('\n').filter(l => /WARN|INFO/.test(l)).join(' | ');
    await opLog('fw应用: ' + (warns ? warns.slice(0, 200) : fwOut.trim().slice(0, 50)));
  }
  return true;
}
/* F11: 下载任务自有 curl 清理——按本任务 pid 文件杀自己启动的 curl(TERM+有界复查),绝不遍历 pidof curl 误伤无关下载;
   exit 文件已写入=上次下载已自然结束,pid 可能已被系统复用→跳过 kill 只清 pid 文件;pid 非数字/0/1 一律不杀 */
const killOwnDl = (pidF, exitF) => 'P=$(cat ' + shq(pidF) + ' 2>/dev/null || echo 0); case "$P" in *[!0-9]*|"") P=0;; esac; '
  + 'if [ "$P" -gt 1 ] 2>/dev/null && [ ! -s ' + shq(exitF) + ' ]; then kill "$P" 2>/dev/null; sleep 1; kill -0 "$P" 2>/dev/null && kill "$P" 2>/dev/null; sleep 1; fi; rm -f ' + shq(pidF);
/* ---- 无感启停 ---- */
/* F15: 引擎自有实例枚举/杀除——pidof mihomo 逐个 readlink /proc/PID/exe 核验等于本插件
   二进制路径(生产固定路径)才计入;同名他装进程(异路径 exe)不枚举不杀(F01 buildReadinessCommand
   同款判定推广);杀除后由调用方复查退出(与 F11 下载自有 PID 同纪律) */
const ownEnginePids = () => 'PIDS=""; for P in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$P/exe 2>/dev/null)" = ' + shq(BIN) + ' ] && PIDS="$PIDS $P"; done; echo $PIDS';
const killOwnEngines = (sig) => 'for P in $(pidof mihomo 2>/dev/null); do [ "$(readlink /proc/$P/exe 2>/dev/null)" = ' + shq(BIN) + ' ] && kill ' + (sig || '') + ' $P 2>/dev/null; done';
/* 启动自检: 缺失数据自动补齐(带进度弹窗); 节点源缺失则引导用户添加 */
async function preflightDl(name, url, dst, minSz, txt, cdnUrl) {
  /* v1.8.8: cdnUrl 存在时作为第一源(CDN直连,国内可达),实现 ipv6 数据源"优先直连下载" */
  const cdnSeq = Array.isArray(cdnUrl) ? cdnUrl.map(u => ({ name: 'CDN直连', url: u, px: '' }))
    : (cdnUrl ? [{ name: 'CDN直连', url: cdnUrl, px: '' }] : []);
  const seq = cdnSeq.concat(dlSeq(url));
  for (let si = 0; si < seq.length; si++) {
    const src = seq[si];
    txt('⬇ ' + name + ' · 源' + (si + 1) + '/' + seq.length + '(' + src.name + ')…');
    const tmpF = dst + '.dl';
    await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.pf.exit') + ' ' + shq(DIR + '/.pf.pid') + '; nohup sh -c \'curl -sL --connect-timeout 8 -m 180 ' + (src.px ? '-x ' + shq(src.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(src.url) + ' 2>/dev/null & echo $! > ' + shq(DIR + '/.pf.pid') + '; wait $!; echo $? > ' + shq(DIR + '/.pf.exit') + '\' >/dev/null 2>&1 &', 5000); /* F11: 记录自有 curl PID($!+wait),清理只杀自有 */
    let lastSz = -1, stag = 0, done = false;
    for (let pi = 0; pi < 130; pi++) {
      await wait(1500);
      const ex = ct(await run('cat ' + shq(DIR + '/.pf.exit') + ' 2>/dev/null', 3000)).trim();
      if (ex !== '') { done = ex === '0'; break }
      const sz = pInt(await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000));
      /* v1.8.8: 停滞阈值 10→6,空挂快速失败(同 chnInstall) */
      if (sz === lastSz) { stag++; if (stag >= 6) { await run(killOwnDl(DIR + '/.pf.pid', DIR + '/.pf.exit'), 8000); break } } else { stag = 0; lastSz = sz }
      txt('⬇ ' + name + ' · ' + (sz / 1048576).toFixed(2) + ' MB(' + src.name + ')');
    }
    await run('rm -f ' + shq(DIR + '/.pf.exit') + ' ' + shq(DIR + '/.pf.pid'), 3000);
    /* v1.8.5: 补最终尺寸复测——curl 在首个 1.5s 轮询前结束则 lastSz=-1,会误判失败并删掉下好的文件
       (china6 这类小文件高发);与 chnInstall 的事后测口径对齐(2026-09-13 审查 P2) */
    const finSz = done ? pInt(await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000)) : 0;
    if (done && (finSz >= minSz || lastSz >= minSz)) { await run('mv ' + shq(tmpF) + ' ' + shq(dst), 8000); return true }
    await run('rm -f ' + shq(tmpF), 3000);
  }
  return false;
}
async function bootPreflight() {
  /* v1.8.5: 先补读手动节点——此前 HS_MANUAL 在 bootPreflight 之后才 refresh,
     纯手动节点用户刷新页面后直接启动会误报"未添加订阅或手动节点"(2026-09-13 审查 P2) */
  if (!HS_MANUAL_LOADED) await refreshManual();
  await refreshSubRaw(); /* v2.7.25: 引擎启动前订阅原文就绪(融合模式依赖,幂等) */
  /* 节点源: 订阅或手动节点二缺一 */
  const hasNodeSrc = (C.activeSub >= 0 && C.subs[C.activeSub]) || HS_MANUAL.length > 0;
  if (!hasNodeSrc) {
    hsOpenSimple('缺少节点数据', '<div class="hs-hint">未添加订阅或手动节点,引擎启动后无可用出口。<br>建议先添加订阅(粘贴订阅链接即可)。</div>'
      + '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn hs-pri" id="hs_pf_go">去添加订阅</button><button class="btn" id="hs_pf_no">仍要启动</button></div>');
    return await new Promise(res => {
      let done = false;
      const fin = v => { if (done) return; done = true; mHide('hs_modal_simple'); res(v) };
      $('#hs_pf_go').onclick = () => { fin(false); openMgr('sub') };
      $('#hs_pf_no').onclick = () => fin(true);
      /* v1.8.5: ✕/蒙层关闭必须兜底 resolve——此前只认两个按钮,点 ✕ 会让 engineStart 永久挂起、
         opBusy 永久锁死(所有操作只弹"操作进行中"),需刷新页面才恢复(2026-09-13 审查 P1) */
      const mEl = $('#hs_modal_simple');
      if (mEl) {
        const x = mEl.querySelector('.hs-mx'); if (x) x.addEventListener('click', () => fin(false));
        mEl.addEventListener('click', e => { if (e.target === mEl) fin(false) });
      }
    });
  }
  const tasks = [];
  if (!ST.geoSiteT) tasks.push(['GeoSite', GEO_BASE + 'geosite.dat', DIR + '/geosite.dat', 524288]);
  if (!ST.geoIpT) tasks.push(['GeoIP', GEO_BASE + 'geoip.metadb', DIR + '/geoip.metadb', 2097152]);
  if (C.cnBypass !== false && ST.chn < 5000) tasks.push(['中国IP段', CHN_BASE + 'china.txt', DIR + '/chnroute.txt', 50000]);
  if (C.cnBypass !== false && !(ST.chn6 >= 20)) tasks.push(['中国IPv6段', CHN_BASE + 'china6.txt', DIR + '/chnroute6.txt', 20000,
    'https://cdn.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt']);
  if (!tasks.length) return true;
  /* v1.8.4: 升级重启(HS_UPGRADING)期间自检转静默——启动自检弹窗复用 hs_modal_simple,
     会顶掉升级进度窗并在完成时把它关掉,用户失去升级成败展示(2026-09-13 harness 实证);
   静默=下载照跑,UI 不动,升级窗由 doUpgradeRestart 全程接管 */
  const pfSilent = !!HS_UPGRADING;
  if (!pfSilent) hsOpenSimple('🚀 启动自检', '<div class="hs-hint" style="margin-bottom:4px">检测到缺失数据,自动下载中(失败不阻塞,可稍后重试)…</div><div class="hs-prog-ind"></div><div class="hs-hint" id="hs_pf_txt" style="margin-top:4px">准备中…</div>');
  const txt = t => { if (pfSilent) return; const e = $('#hs_pf_txt'); if (e) e.textContent = t };
  const failed = [];
  for (const tk of tasks) {
    const okd = await preflightDl(tk[0], tk[1], tk[2], tk[3], txt, tk[4]);
    if (!okd) failed.push(tk[0]); else await opLog('启动自检:' + tk[0] + ' 下载完成');
  }
  await collectStatus();
  if (!pfSilent) mHide('hs_modal_simple');
  if (!pfSilent) {
    if (failed.length) toast('⚠️ ' + failed.join('/') + ' 下载失败,已用降级配置启动(设置→地理数据/分流 可重试)', 'pink');
    else toast('✅ 启动数据自检完成', 'green');
  }
  return true;
}
/* P0-7②: chnroute 同源 CIDR 规则集生成(GeoLite2 ASN 注册国误判根治;与防火墙 hs_cn 同源数据,两处行为一致) */
async function ensureChinaIpRules() {
  if (!(ST.chn > 0)) return true;
  /* F16: 双栈同源——v4 CIDR 与 v6 CIDR 同文件合并(behavior:ipcidr 官方支持混合载荷:
     wiki.metacubex.one rule-providers ipcidr 每行一个 CIDR,内核 IpCidrTrie v4/v6 通吃,
     IP-CIDR6 仅 IP-CIDR 别名);v6 文件缺失时 0 条 v6=v4-only 现状不劣化;
     国内 v6 目标进引擎后命中国内表 DIRECT,不再落入代理兜底(此前只靠防火墙 hs_cn6 提前 RETURN) */
  const r = await run('mkdir -p ' + DIR + '/rules; cat ' + DIR + '/chnroute6.txt 2>/dev/null | awk \'{if ($1 ~ /^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+\\//) print $1; else if ($1 ~ /^[0-9a-fA-F:]+\\/[0-9]+$/) print $1}\' ' + DIR + '/chnroute.txt - 2>/dev/null > ' + DIR + '/rules/china_ip.txt && wc -l < ' + DIR + '/rules/china_ip.txt', 8000); /* v6 缺失时 cat 空输入,awk 双源 stdin 拼接,退出码稳定 0 */
  const n = parseInt(ct(r)) || 0;
  if (n < 5000) { await opLog('china_ip 规则集生成异常: ' + n + ' 条(chnroute 文件问题?)'); return false }
  return true;
}
async function engineStart(restore) {
  /* 升级感知: 进入时引擎可能是旧组件在跑(init 升级对账已标记),本次启动全量重生成三件套=完成升级,
     成功后按"升级完成"而非"普通启动"反馈,并复核指纹确认三件套真的换新(停止态启动同样覆盖) */
  const wasUpgrade = !!(ST.upgradePending && ST.upgradePending.length);
  if (!ST.bin) { detectArch().then(() => openInstallGuide()); return false }
  /* F12: restore 恢复模式——三件套已由调用方从升级备份恢复到盘上,跳过磁盘预检/数据补齐/配置
     重新生成与 start.sh 重写(任何一步都会用当前代码重新生成,覆盖刚恢复的备份内容),
     直接以盘上三件套启动+探活+烙印复核;正常启动路径零改动 */
  if (!restore) {
  /* v2.1.5: 磁盘预检——满盘时三件套/配置写入全部静默失败(真机 0.0MB 实证),先清临时冗余,仍不足则明确报错不进入启动 */
  let freeKB = await hsDiskKB();
  if (freeKB > 0 && freeKB < 5120) {
    freeKB = await hsCleanJunk();
    if (freeKB > 0 && freeKB < 5120) {
      HS_LAST_ERR = '存储空间不足(剩 ' + (freeKB / 1024).toFixed(1) + 'MB)'; toast('❌ ' + HS_LAST_ERR + ',配置无法落盘——请清理:诊断页查看磁盘,卸载不用的插件/清日志后重试', 'red', 5000);
      await opLog('启动中止:磁盘剩余 ' + (freeKB / 1024).toFixed(1) + 'MB(清理临时文件后仍不足)');
      return false;
    }
    await opLog('磁盘紧张,已自动清理下载残留等临时文件(现剩 ' + (freeKB / 1024).toFixed(1) + 'MB)');
  }
  if (!(await bootPreflight())) return false;
  await ensureChinaIpRules();
  await refreshManual();
  /* 生成/验证配置 */
  if (!(await writeConfigAndValidate())) return false;
  const w = await writeFile(START, genStartSh());
  if (!w) { HS_LAST_ERR = '启动脚本写入失败(磁盘空间/权限?)'; toast('启动脚本写入失败', 'red'); return false }
  } else {
    await opLog('恢复模式启动:直接使用已恢复的三件套(不重新生成)');
  }
  await run('chmod 700 ' + shq(START) + '; sh ' + shq(START), 8000); /* F14: start.sh 内嵌 secret,权限 755→700(与 BOOT_SH 同档,root 执行不受影响) */
  /* 端口探活(最多 8 秒) */
  let ready = false;
  for (let i = 0; i < 8 && !ready; i++) {
    await wait(1000);
    await collectStatus();
    /* 控制接口鉴权通过且对应进程确实监听所需端口后才允许挂载。 */
    ready = !!(ST.listen.mixed && ST.listen.redir && ST.listen.dns);
  }
  if (!ST.running) {
    HS_LAST_ERR = '引擎启动失败' + (C.logEnabled ? '(详见运行日志)' : '(可在 日志页签 开启日志后重试)'); toast('启动失败' + (C.logEnabled ? ',请查看日志' : ':可在 日志页签 开启日志后重试'), 'red');
    /* 启动失败急救: 无条件清规则+杀自有引擎实例——引擎不在场时任何残留 HS_* 规则都是黑洞(1.6.7 not found 事故实证);
       F15: 杀除经 readlink 所有权核验,只杀本插件二进制实例,同名他装进程不动 */
    await run('sh ' + shq(FW) + ' clean 2>/dev/null; ' + killOwnEngines(''), 8000).catch(() => { });
    await opLog('启动失败急救: 已清全部接管规则+停残留引擎进程(恢复直连)');
    return false;
  }
  /* 端口就绪后才挂规则(无黑洞窗口)——v1.8.5: ready 此前是死变量(只控循环),进程在但端口未监听
     照样挂规则=全量 REDIRECT 到无人监听端口(网页全打不开);此处补硬门槛(2026-09-13 审查 P1) */
  if (!ready) {
    await run('sh ' + shq(FW) + ' clean 2>/dev/null', 8000).catch(() => { });
    HS_LAST_ERR = '引擎端口未就绪(混合/透明/DNS 端口未监听,可能被占用),已清规则避免断网;可重试或跑诊断';
    toast('❌ ' + HS_LAST_ERR, 'red');
    await opLog('启动中止: 端口未就绪,已清规则(防 REDIRECT 黑洞)');
    return false;
  }
  if (restore) {
    /* F12: 恢复模式不 applyFw(其内部 genFwSh 会重生成覆盖刚恢复的备份 fw.sh)——
       规则挂载由恢复的 start.sh/fw.sh 自带口径执行(与开机自启同源,备份版本的挂载逻辑) */
    await opLog('引擎恢复启动(按备份三件套,规则口径同备份)');
  } else if (C.s1 !== 'off' || C.s2) {
    /* F13: 消费 applyFw 成败——引擎已就绪不中止启动(规则失败≠引擎失败,中止反而触发急救杀引擎),
       但文案如实区分,用户可重试/跑诊断 */
    const fwOk = await applyFw();
    await opLog(fwOk ? '引擎启动+规则挂载(模式:' + C.s1 + ',S2:' + (C.s2 ? 'on' : 'off') + ')' : '引擎已启动,但规则挂载失败——流量未接管,可重试或跑诊断');
  } else {
    /* v2.1.5: 无接管启动也落盘新版 fw.sh(只写不执行)——升级复核要求三件烙印齐,
       此前不写=无接管用户升级必失败(F=0 S/Y 齐)→自动回滚→对账再报→死循环(真机 v2.1.4 实证) */
    if (wasUpgrade) {
      const wfw = await writeFile(FW, genFwSh());
      if (!wfw) { HS_LAST_ERR = '防火墙脚本写盘失败(磁盘空间?)'; toast('⚠️ ' + HS_LAST_ERR + ',请先清理存储(诊断页可查看磁盘状态)', 'red'); await opLog('升级中止:fw.sh 写盘失败(磁盘空间?)') }
    }
    await opLog('引擎启动(无接管)');
  }
  ST.upgradePending = []; /* 本次启动已全量重生成三件套,升级对账归零 */
  if (restore) {
    /* F12: 恢复复核——三件套烙印互相一致(=同一备份版本)才算恢复完整,不要求等于当前 V
       (恢复的本就是旧版);复核不齐返回 false,调用方保留备份可重试 */
    const ck = await run(
      'F=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(FW) + ' 2>/dev/null | cut -dv -f2); S=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(START) + ' 2>/dev/null | cut -dv -f2); Y=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(CFG) + ' 2>/dev/null | cut -dv -f2); echo "F=${F:-0} S=${S:-0} Y=${Y:-0}"', 8000);
    const mm = (ck.content || '').match(/F=([\d.]*)\s+S=([\d.]*)\s+Y=([\d.]*)/) || [];
    if (mm[1] && mm[1] === mm[2] && mm[2] === mm[3]) {
      toast('✅ 已按备份恢复并启动(组件 v' + mm[1] + ')', 'green');
      await opLog('恢复成功:三件套烙印一致 v' + mm[1] + '(未重新生成)');
    } else {
      HS_LAST_ERR = '恢复复核未齐(F/S/Y=' + (mm[1] || '?') + '/' + (mm[2] || '?') + '/' + (mm[3] || '?') + ')';
      toast('⚠️ 引擎已启动,但' + HS_LAST_ERR + '(备份保留,可重试)', 'pink');
      await opLog('恢复复核未齐:' + (ck.content || '').trim().slice(0, 40));
      return false;
    }
  } else if (wasUpgrade) {
    /* 复核版本烙印: 三件套写盘成功≠内容正确,升级链路最后一道确认(一条 shell);
       与 upgradeAudit 同款读法,三处烙印都 = 当前 V 才算升级到位 */
    const ck = await run(
      'F=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(FW) + ' 2>/dev/null | cut -dv -f2); S=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(START) + ' 2>/dev/null | cut -dv -f2); Y=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(CFG) + ' 2>/dev/null | cut -dv -f2); echo "F=${F:-0} S=${S:-0} Y=${Y:-0}"', 8000);
    const mm = (ck.content || '').match(/F=([\d.]*)\s+S=([\d.]*)\s+Y=([\d.]*)/) || [];
    if (mm[1] === V && mm[2] === V && mm[3] === V) { HS_UPG_OK = true; toast('✅ 升级完成:接管组件已更新至 ' + V, 'green'); await opLog('升级完成:三件套烙印复核 v' + V) }
    else { HS_LAST_ERR = '三件套烙印复核未齐(F/S/Y=' + (mm[1] || '?') + '/' + (mm[2] || '?') + '/' + (mm[3] || '?') + ')'; toast('⚠️ 引擎已启动,但' + HS_LAST_ERR + ',建议再点一次重启', 'pink'); await opLog('升级复核未齐:' + ck.content.trim().slice(0, 40)) }
  } else {
    toast('引擎已启动,端口就绪后规则已挂载', 'green');
  }
  return true;
}
async function fwClean() {
  /* 先把最新版 fw.sh 写到磁盘(确保 clean 逻辑最新),再执行其 clean 函数 */
  await writeFile(FW, genFwSh());
  const r = await run('chmod 755 ' + shq(FW) + '; sh ' + shq(FW) + ' clean 2>&1; '
    + 'echo "---VERIFY---"; '
    + 'iptables -t nat -S 2>/dev/null | grep "HS_" | grep -vc "^-N"; '
    + 'iptables -t mangle -S 2>/dev/null | grep -c "HS_"; '
    + 'iptables -t nat -S PREROUTING 2>/dev/null | grep -c "HS_"; '
    + 'ip6tables -t nat -S 2>/dev/null | grep "HS_" | grep -vc "^-N"; '
    + 'ip6tables -t mangle -S 2>/dev/null | grep -c "HS_"', 15000);
  /* v1.8.5: 解析 VERIFY 计数定 residue(此前硬置 false,清理失败也当干净)——含 PREROUTING 跳转残留在内 */
  const tail = String((r && r.content) || '').split('---VERIFY---')[1] || '';
  const nums = tail.split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
  ST.residue = nums.some(n => n > 0);
}
async function engineStop() {
  /* 无感停止: 先摘规则(新流量回直连) → 停进程 */
  await run('sh ' + shq(FW) + ' clean 2>&1', 12000);
  /* F15: 只停本插件实例(readlink 所有权核验),同名他装进程不动 */
  const pids = (await run(ownEnginePids(), 5000)).content.trim();
  if (pids) {
    await run(killOwnEngines(''), 5000);
    await wait(600);
    const p2 = (await run(ownEnginePids(), 5000)).content.trim();
    if (p2) {
      await run(killOwnEngines('-9'), 5000);
      /* F15: 有界等待退出——未等退出就采集会误报"停止失败"(toast 与进程真正退出联动) */
      let gi = 0;
      while (gi++ < 10 && (await run(ownEnginePids(), 3000)).content.trim()) await wait(500);
    }
  }
  /* 定点清 conntrack(有工具时) */
  await run('which conntrack >/dev/null 2>&1 && conntrack -D --dport ' + C.ports.redir + ' 2>/dev/null; echo ok', 5000);
  await collectStatus(); await checkResidue();
  const ok = !ST.running;
  toast(ok ? '已停止:规则已摘除,进程退出,终端回直连' : '停止失败,请重试或诊断', ok ? 'green' : 'red');
  if (ok) await opLog('引擎停止(规则已清)');
  return ok;
}
async function engineRestart(restore) {
  const a = await engineStop(); const b = await engineStart(restore);
  return a && b;
}
/* 白名单变更 → 增量应用规则 */
async function reapplyFw() {
  if (HS_UPGRADING) return; /* 升级中 applyFw/fwClean 由编排器自管,外部重应用会并发 */
  /* start.sh 的接管烙印(HS_TAKEOVER)依赖 s1/s2,任何配置变化都先重写,
     保证开机自启的挂载口径与当前配置一致(s1=off 烙 0,下次开机不挂) */
  await writeFile(START, genStartSh());
  if (!ST.running) return; /* 未运行时不挂 */
  /* 切到全关: 摘除在挂规则——历史缺陷(2026-09-03 审查发现,自 v1.0.0 起如此):
     此处直接 return 导致切「关」后旧规则仍挂着,被接管设备继续走代理,
     与提示文案"其他设备零感知"矛盾;诊断 rt-fw 的修复语义(off→fwClean)一直是对的,与其对齐 */
  if (C.s1 === 'off' && !C.s2) { await fwClean(); return }
  await applyFw();
}

/* 自启(ZWRT 文档 §6.2): BOOT_SH 为多插件共享文件——只 grep -qF 整行判存追加,绝不整文件重写;
   删行统一 sed 自定义定界符 \|KEY|d 形态(KEY 无 | 字符零转义),彻底取代旧 / 分隔形态
   (v1.8.5/v1.8.6/v1.8.7 三层转义事故链的根治方案,genStartSh 哨兵段同款已生产验证) */
const bootRmLine = () => '[ -f ' + shq(BOOT_SH) + ' ] && sed -i \'\\|' + BOOT_KEY + '|d\' ' + shq(BOOT_SH);
async function bootEnable() {
  /* 可写探针(.hs_wtest 名保留:harness 断言与 stub 罐头锚点;目录换 /data/plugins) */
  const t = await run('mkdir -p /data/plugins && touch /data/plugins/.hs_wtest && rm -f /data/plugins/.hs_wtest && echo OK', 5000);
  if ((t.content || '').trim() !== 'OK') { toast('/data/plugins 不可写,无法设置自启', 'red'); return false }
  const L = bootLine();
  const w = await run('[ -f ' + shq(BOOT_SH) + ' ] || printf \'#!/bin/sh\\n\' > ' + shq(BOOT_SH) + '; '
    + 'grep -qF ' + shq(L) + ' ' + shq(BOOT_SH) + ' || printf \'%s\\n\' ' + shq(L) + ' >> ' + shq(BOOT_SH) + '; '
    + 'chmod 700 ' + shq(BOOT_SH), 5000);
  if (!w.success) { toast('自启写入失败(磁盘?)', 'red'); return false } /* 成败只判 API 级 success(内容尾哨在测试罐头下恒假会误报) */
  await opLog('自启已开启');
  return true;
}
async function bootDisable() {
  await run(bootRmLine(), 5000);
  await opLog('自启已关闭');
  return true;
}
/* v2.0.7 删除 1.x 旧版盲挂行检测(双指纹计数函数/启动链静默校正/诊断 st-boot 项三处):
   旧盲挂行系 1.x 旧平台写入旧共用 boot 文件的形态,ZWRT 的 BOOT_SH
   (/data/plugins/ufi_tools_boot.sh)系新路径,1.x 从未在本平台运行——检测恒空转,属旧平台兼容残留 */

/* ================= 样式(全 hs- 前缀,杜绝与邻居插件互染) ================= */
function injectCss() {
  if ($('#hs-style')) return;
  const st = document.createElement('style');
  st.id = 'hs-style';
  st.textContent =
    /* 单按钮入口运行态: 运行中用面板原生激活底色(仅背景,文字/边框保持原生;未激活不写任何样式);
       异常态红色警示;fallback 供面板未定义变量时兜底 */
    '.hs-btn-on{background-color:var(--dark-btn-color-active,rgba(255,255,255,.22))!important}'
    + '.hs-btn-abn{color:#e57373!important;border:1px solid rgba(229,115,115,.55)!important;background:rgba(229,115,115,.12)!important;font-weight:600}'
    + '.hs-btn-upg{color:#ffb74d!important;border:1px solid rgba(255,183,77,.6)!important;background:rgba(255,183,77,.12)!important;font-weight:600}'
    + '.hs-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;background:var(--dark-bgi-color,rgba(0,0,0,.61));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.16);border-radius:14px;width:min(92vw,580px);max-height:86vh;max-height:86dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 10px rgba(0,0,0,.5)}'
  + '.hs-modal.big{width:min(92vw,680px)}'
  + '@media(min-width:1025px){.hs-modal.big{width:min(52vw,780px);max-height:80vh;max-height:80dvh}}'
  + '@media(min-width:481px) and (max-width:1024px){.hs-modal.big{width:88vw;max-height:84vh;max-height:84dvh}}'
  + '@media(max-width:480px){'
  + '.hs-modal,.hs-modal.big{width:96vw}'
  + '}'
  + '.hs-mh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1);flex:none}'
  + '.hs-mh .t{font-weight:700;font-size:.9rem;color:var(--dark-title-color,skyblue)}'
  + '.hs-mx{background:none;border:0;color:#b3bdcb;font-size:1.05rem;cursor:pointer;padding:2px 6px}'
  + '.hs-mb{padding:10px 16px 0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1;min-height:0;display:flex;flex-direction:column}' /* v2.9.54: overflow:hidden→纵向可滚——内容超高时不再压缩/裁死子项(配合 .hs-row flex 不收缩,行内容永不溢出行盒) */
  + '@media(max-width:480px){.hs-mb{padding:10px 0 0}.hs-pvcols{flex-direction:column}}' /* v2.9.54: 移回基定义之后救活 v2.9.6 移动端 0 边距决策(此前被同优先级后定义覆盖失效);预览两列窄屏纵排 */
  + '.hs-pgscroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:14px}'
  + '.hs-pghead{flex:none;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}'
  + '.hs-mb.hs-node-mode{display:flex;flex-direction:column;overflow:hidden;padding:10px 16px 0}'
  + '.hs-node-head{flex:none;background:var(--dark-card-bg,rgba(0,0,0,.24));border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:10px 12px 8px;margin-bottom:10px}'
  + '.hs-node-list{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 0 14px}'
  + '.hs-tabs{display:flex;gap:2px;padding:8px 12px 0;flex:none;overflow-x:auto}'
  + '.hs-tabs button{background:transparent;border:0;border-bottom:2px solid transparent;color:#b3bdcb;padding:8px 13px;font-size:.82rem;cursor:pointer;white-space:nowrap}'
  + '.hs-tabs button.on{color:var(--dark-title-color,skyblue);border-bottom-color:var(--dark-title-color,skyblue);font-weight:600}'
  + '.hs-warn{background:rgba(229,115,115,.12);border:1px solid rgba(229,115,115,.35);color:#ffb3b3;border-radius:10px;padding:8px 10px;font-size:.76rem;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
  + '.hs-li{font-size:.78rem;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,.06)}'
  + '.hs-row{display:flex;align-items:center;gap:12px;min-height:42px;padding:8px 2px;border-bottom:1px dashed rgba(255,255,255,.06);flex-wrap:wrap;flex:none}' /* v2.9.54: flex 不收缩——.hs-row 带 min-height:42px 显式值会顶掉 auto 内容下限,弹窗体空间不足时行被压缩、内容溢出行盒压进邻行(移动端过滤弹窗叠压根因) */
  + '.hs-row:last-child{border-bottom:0}'
  + '.hs-row .hs-sl{flex:1;min-width:0}'
  + '.hs-row .hs-st{font-size:.8rem}'
  + '.hs-sd{font-size:.66rem;color:#b3bdcb;margin-top:2px;line-height:1.5}'
  + '.hs-row .hs-sc{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:60%}'
  + '.hs-sec{background:var(--dark-card-bg,rgba(0,0,0,.24));border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:2px 12px 10px;margin-bottom:8px;line-height:1.45}'
  + '.hs-sec h4{margin:0;padding:8px 2px 6px;font-size:.7rem;color:var(--dark-title-color,skyblue);letter-spacing:.1em;font-weight:600}'
  + '.hs-vin{width:68px;text-align:right;background:transparent;border:1px solid transparent;border-radius:8px;color:#bcd2ff;font-size:.8rem;padding:3px 6px;font-family:inherit}'
  + '.hs-vin:focus{background:rgba(0,0,0,.35);border-color:#7fc9f2;color:#fff;outline:none}'
  + '.hs-vin.bad{color:#ff9d9d;border-color:rgba(229,115,115,.5)}'
  + '.hs-fold{margin:6px 0;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.07);overflow:hidden}'
  + '.hs-fold summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:44px;padding:9px 12px;cursor:pointer;font-size:.78rem;user-select:none}'
  + '.hs-fold summary:hover{background:rgba(255,255,255,.06)}'
  + '.hs-fold summary::-webkit-details-marker{display:none}'
  + '.hs-fold summary .hs-chev{flex:none;color:#7fc9f2;font-size:.95rem;transition:transform .2s;display:inline-block}'
  + '.hs-fold[open] summary .hs-chev{transform:rotate(90deg)}'
  + '.hs-fold .hs-top{display:none}.hs-fold[open] .hs-top{display:inline}.hs-fold[open] .hs-tcl{display:none}'
  + '.hs-seg{display:flex;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.09);border-radius:8px;overflow:hidden}'
  + '.hs-seg button{flex:1 0 auto;background:transparent;border:0;color:#b3bdcb;padding:5px 8px;font-size:.7rem;cursor:pointer;white-space:nowrap;min-width:0}'
  + '.hs-seg button.on{background:var(--dark-btn-color-active,rgba(1,138,216,.66));color:#fff}'
  + '.hs-sw{position:relative;display:inline-block;width:46px;height:26px;flex:none}'
  + '.hs-sw input{opacity:0;width:0;height:0}'
  + '.hs-sw span{position:absolute;inset:0;background:#333a49;border-radius:26px;transition:.2s;cursor:pointer}'
  + '.hs-sw span:before{content:"";position:absolute;width:20px;height:20px;border-radius:50%;background:#aab3c5;top:3px;left:3px;transition:.2s}'
  + '.hs-sw input:checked+span{background:var(--dark-btn-color-active,rgba(1,138,216,.66))}'
  + '.hs-sw input:checked+span:before{transform:translateX(20px);background:#fff}'
  + '.hs-sw input:disabled+span{opacity:.4;cursor:not-allowed}'
  + '.hs-actions{display:flex;gap:8px;justify-content:flex-end;padding:10px 2px 0;flex-wrap:wrap}'
  + '.hs-hint{font-size:.72rem;color:#b3bdcb}'
  + '.hs-pre{background:#1c1f26;color:#e8eaf0;border-radius:10px;padding:10px;font-size:.64rem;white-space:pre-wrap;word-break:break-all;max-height:44vh;overflow:auto;margin:0;font-family:Menlo,Consolas,monospace}'
  + '.hs-dg{background:var(--dark-card-bg,rgba(0,0,0,.24));border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:9px;overflow:hidden}'
  + '.hs-dgh{display:flex;justify-content:space-between;padding:9px 12px;font-size:.8rem;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)}'
  + '.hs-dgi{padding:8px 12px;border-bottom:1px dashed rgba(255,255,255,.05);font-size:.76rem}'
  + '.hs-dgi:last-child{border-bottom:0}'
  + '.hs-tag{display:inline-block;border-radius:6px;padding:1px 7px;font-size:.66rem;border:1px solid;white-space:nowrap}'
  + '.hs-tag.y{color:#8fe39a;border-color:#3c6b41;background:rgba(102,187,106,.1)}'
  + '.hs-tag.o{color:#ffcf8f;border-color:#8a6430;background:rgba(255,183,77,.1)}'
  + '.hs-btnrow{display:flex;gap:8px;padding:10px 0 0;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,.1);margin-top:6px}'
  + '.hs-btnrow button{flex:1;min-width:72px}'
  + '.hs-pri{background:var(--dark-btn-color-active,rgba(1,138,216,.66))!important;border-color:transparent!important}'
  + '.hs-dgr{background:#7a2f34!important;border-color:#a3484e!important;color:#ffd9d9!important}'
  + '.hs-go{background:rgba(46,125,67,.78)!important;border-color:#4caf50!important;color:#d6f5dd!important}'
  + 'button.hs-sm{padding:4px 10px;font-size:.72rem;border-radius:7px}'
  /* v2.2.0 按钮体系补全(用户反馈"看不出是按钮"):hs-act=行间动作按钮(徽标与小文字按钮升级位,亮框+微底,一眼可点);
     hs-btn-fill/main/xs/right=收编高频内联布局覆盖,按钮样式集中一处维护 */
  + '.hs-act{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:8px;border:1px solid rgba(127,201,242,.55);background:rgba(127,201,242,.10);color:#7fc9f2;font-size:.68rem;font-weight:600;cursor:pointer;transition:background .15s;vertical-align:1px}'
  + '.hs-act:hover{background:rgba(127,201,242,.22)}'
  + '.hs-act:active{transform:scale(.97)}'
  + '.hs-act.warn{border-color:rgba(255,183,77,.6);background:rgba(255,183,77,.10);color:#ffb74d}'
  + '.hs-act.warn:hover{background:rgba(255,183,77,.2)}'
  + '.hs-btn-fill{flex:1}'
  + '.hs-btn-main{flex:1;padding:8px}'
  + '.hs-btn-xs{padding:2px 8px;font-size:.68rem}'
  + '.hs-btn-right{margin-left:auto}'
  + '.hs-devrow{display:flex;align-items:center;gap:10px;background:var(--dark-card-bg,rgba(0,0,0,.24));border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:10px 12px;margin-bottom:8px}'
  /* v2.9.23 河流分岔·泳道定稿(ZCode v02 一比一重做): 独立风格自包含,不依赖面板样式——横版泳道SVG+检索/窄屏端点水轨+行内折叠 */
  + '.hs-rv{position:relative}'
  + '.hs-rv,.hs-rv *{box-sizing:border-box}'
  + '.hs-rv svg{width:100%;height:auto;display:block}'
  + '.hs-rv .mainflow{stroke-dasharray:7 11;animation:hsRvDashF .95s linear infinite}' /* v2.9.39: 提速+急缓节奏(真水流感) */
  + '@keyframes hsRvDashF{0%{stroke-dashoffset:0}42%{stroke-dashoffset:-11}100%{stroke-dashoffset:-18}}'
  + '.hs-rv .branch{stroke-dasharray:4 8;animation:hsRvDashB 1.4s linear infinite;transition:stroke-width .3s}'
  + '@keyframes hsRvDashB{0%{stroke-dashoffset:0}45%{stroke-dashoffset:-7}100%{stroke-dashoffset:-12}}'
  + '.hs-rv .branch.hot{stroke-width:3.2;animation-duration:.55s}'
  + '.hs-rv .jn{cursor:pointer;transition:opacity .35s}'
  + '.hs-rv .jn .hit{fill:transparent}'
  + '.hs-rv .jn:hover .nd{filter:brightness(1.35)}'
  + '.hs-rv .jn.on .nd{stroke-width:3.5}'
  + '.hs-rv .jn.on .tagp{filter:brightness(1.45)}'
  + '.hs-rv .jn.dim{opacity:.38}'
  + '.hs-rv .jn.found .nd{animation:hsRvFoundP 1s ease-in-out 3}'
  + '@keyframes hsRvFoundP{50%{filter:brightness(1.9)}}'
  + '.hs-rvs{display:flex;gap:7px;padding:9px 2px 0}'
  + '.hs-rvs input{flex:1;min-width:0;font-family:inherit;font-size:11.5px;color:#e8eaf0;background:rgba(255,255,255,.05);border:1px solid rgba(127,201,242,.16);border-radius:10px;padding:7px 11px;outline:none;transition:border-color .2s}'
  + '.hs-rvs input:focus{border-color:rgba(127,201,242,.55)}'
  + '.hs-rvs .hs-rvgo{font-family:inherit;font-size:11.5px;padding:0 12px;border-radius:10px;cursor:pointer;border:1px solid rgba(127,201,242,.45);background:rgba(127,201,242,.14);color:#7fc9f2}'
  + '.hs-rvs .hs-rvgo:hover{filter:brightness(1.15)}'
  + '.hs-rvnote{font-size:11px;color:#8ba0bd;padding:5px 2px 0;line-height:1.6}'
  + '.hs-rvnote.ok{color:#e8eaf0}'
  + '.hs-rvh{display:none;padding:4px 2px 2px}' /* v2.9.25: 释放横 padding(真机反馈拥挤) */
  + '.hs-rvv{display:none;padding:2px 0 4px}' /* v2.9.34: 去 padding(真机反馈小屏拥挤) */
  + '.hs-rv[data-mode=h] .hs-rvh{display:block}'
  + '.hs-rv[data-mode=v] .hs-rvv{display:block}'
  + '.hs-rvlk{position:relative;height:28px;display:none}'
  + '.hs-rvlk.on{display:block}'
  + '.hs-rv[data-mode=v] .hs-rvlk{display:none!important}'
  + '.hs-rvlk .lkline{position:absolute;top:-24px;bottom:-1px;width:2px;border-radius:2px;background:repeating-linear-gradient(180deg,currentColor 0 6px,transparent 6px 12px);animation:hsRvDashDN .8s linear infinite}'
  + '@keyframes hsRvDashDN{to{background-position:0 12px}}'
  + '.hs-rvlk .lkdot{position:absolute;width:7px;height:7px;margin-left:-2.5px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor;animation:hsRvDropt 1.15s cubic-bezier(.45,.05,.55,.95) infinite;opacity:0}'
  + '@keyframes hsRvDropt{0%{top:-15px;opacity:0}12%{opacity:1}88%{opacity:1}100%{top:23px;opacity:0}}'
  + '.hs-rvdt{display:none;position:relative;padding:14px;transform-origin:var(--ox,50%) 0;background:rgba(19,28,48,.55);border:1px solid rgba(255,255,255,.07);border-radius:12px;margin-bottom:10px}'
  + '.hs-rvdt.show{display:block;animation:hsRvPour .5s cubic-bezier(.22,.9,.28,1) both /* v2.9.51: 展开回调丝滑档(真机反馈像卡顿),长动画保留给折叠/水流 */}' /* v2.9.49: 再放缓——人不是脚本 */ /* v2.9.39: 放缓(真机反馈太快没感觉) */
  + '@keyframes hsRvPour{from{opacity:0;transform:translateY(-16px) scale(.965)}to{opacity:1;transform:none}}'
  + '.hs-rvdt .hs-rvnotch{position:absolute;top:-2px;width:18px;height:4px;border-radius:2px;display:none}'
  + '.hs-rvdt .hs-rvnotch.on{display:block}'
  + '.hs-rv[data-mode=v] .hs-rvnotch{display:none!important}'
  + '.hs-rvdt .hs-rvx{position:absolute;top:9px;right:10px;z-index:5;background:none;border:0;color:#8ba0bd;font-size:16px;cursor:pointer;padding:6px;font-family:inherit;line-height:1}'
  + '.hs-rvdt .hs-rvx:hover{color:#e8eaf0}'
  + '.hs-rv .d-head{display:flex;gap:9px;align-items:center;padding-right:28px}'
  + '.hs-rv .d-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;border:1px solid;flex:0 0 auto}'
  + '.hs-rv .d-t{flex:1;min-width:0}'
  + '.hs-rv .d-t em{font-style:normal;font-size:10px;color:#8ba0bd;display:block}'
  + '.hs-rv .d-t h3{font-size:13px;color:#e8eaf0;margin:0;font-weight:700}'
  + '.hs-rv .fchip{margin-left:auto;font-size:10.5px;padding:2px 9px;border-radius:999px;border:1px solid;white-space:nowrap;flex:none}'
  + '.hs-rv .fchip.direct{color:#8fe39a;border-color:rgba(102,187,106,.45);background:rgba(102,187,106,.1)}'
  + '.hs-rv .fchip.direct2{color:#9ccc65;border-color:rgba(156,204,101,.45);background:rgba(156,204,101,.1)}'
  + '.hs-rv .fchip.proxy{color:#ffcc80;border-color:rgba(255,183,77,.45);background:rgba(255,183,77,.1)}'
  + '.hs-rv .fchip.rule{color:#7fc9f2;border-color:rgba(127,201,242,.45);background:rgba(127,201,242,.1)}'
  + '.hs-rv .d-desc{margin:10px 0;font-size:11.5px;color:#b9c8dd;line-height:1.75}'
  + '.hs-rv .d-rows{display:grid;gap:5px;margin-bottom:10px}'
  + '.hs-rv .d-row{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;padding:6px 10px;background:rgba(255,255,255,.035);border-radius:8px}'
  + '.hs-rv .d-row span{color:#8ba0bd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'
  + '.hs-rv .d-row b{font-weight:600;text-align:right;color:#e8eaf0}'
  + '.hs-rv .d-acts{display:flex;gap:8px;flex-wrap:wrap}'
  + '.hs-rv .d-acts:empty{display:none}'
  + '.hs-rv .hs-rv-vd{font-size:11px;padding:1px 8px;border-radius:999px;margin:0 1px;font-weight:700;white-space:nowrap}' /* v2.9.36: 判向醒目胶囊 */
  + '.hs-rv .hs-rv-vd.vd-d{color:#8fe39a;background:rgba(102,187,106,.16);border:1px solid rgba(102,187,106,.45)}'
  + '.hs-rv .hs-rv-vd.vd-p{color:#ffcc80;background:rgba(255,183,77,.16);border:1px solid rgba(255,183,77,.45)}'
  + '.hs-rv .hs-rv-vd.vd-r{color:#ff8a80;background:rgba(255,120,100,.16);border:1px solid rgba(255,120,100,.45)}'
  + '.hs-rv .hitbanner{display:flex;gap:8px;align-items:center;font-size:11px;padding:7px 10px;border-radius:10px;border:1px solid;margin-bottom:11px;line-height:1.5;flex-wrap:wrap}'
  + '.hs-rvdt.show .d-head,.hs-rv .vitem.open .d-head{animation:hsRvRowin .34s cubic-bezier(.2,.8,.25,1) both}'
  + '.hs-rvdt.show .d-desc,.hs-rv .vitem.open .d-desc{animation:hsRvRowin .34s cubic-bezier(.2,.8,.25,1) both;animation-delay:.06s}'
  + '.hs-rvdt.show .d-row,.hs-rv .vitem.open .d-row{animation:hsRvRowin .34s cubic-bezier(.2,.8,.25,1) both}'
  + '.hs-rvdt.show .d-rows .d-row:nth-child(1),.hs-rv .vitem.open .d-rows .d-row:nth-child(1){animation-delay:.12s}'
  + '.hs-rvdt.show .d-rows .d-row:nth-child(2),.hs-rv .vitem.open .d-rows .d-row:nth-child(2){animation-delay:.19s}'
  + '.hs-rvdt.show .d-rows .d-row:nth-child(3),.hs-rv .vitem.open .d-rows .d-row:nth-child(3){animation-delay:.19s}'
  + '.hs-rvdt.show .d-rows .d-row:nth-child(4),.hs-rv .vitem.open .d-rows .d-row:nth-child(4){animation-delay:.26s}' /* v2.9.39: 第4行延迟补齐 */
  + '.hs-rvdt.show .d-acts,.hs-rv .vitem.open .d-acts{animation:hsRvRowin .34s cubic-bezier(.2,.8,.25,1) both;animation-delay:.32s}'
  + '@keyframes hsRvRowin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
  + '@keyframes hsRvLiveIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
  + '.hs-rvv .railwrap{position:relative;padding:2px 0}'
  + '.hs-rvv .rail{position:absolute;left:16.5px;top:17px;bottom:17px;width:3px;border-radius:2px;background:repeating-linear-gradient(180deg,rgba(127,201,242,.75) 0 7px,transparent 7px 16px);animation:hsRvRail .95s linear infinite;box-shadow:0 0 5px rgba(127,201,242,.3)}' /* v2.9.36: 3px+辉光=粗细层次 */
  + '.hs-rvv .railfill{position:absolute;left:16px;top:17px;width:4px;height:0;border-radius:2px;background:linear-gradient(180deg,rgba(127,201,242,.95),rgba(127,201,242,.5));box-shadow:0 0 8px rgba(127,201,242,.45);transition:height 1.1s cubic-bezier(.25,.9,.3,1);z-index:0}' /* v2.9.36: 竖版水流填充(选中行) */
  + '.hs-rvv .raildot{position:absolute;left:14.5px;width:7px;height:7px;border-radius:50%;background:#7fc9f2;box-shadow:0 0 8px rgba(127,201,242,.9);animation:hsRvRailDrop 2.6s linear infinite;opacity:0;z-index:1}' /* v2.9.27: 竖版水流粒子(对齐 PC 光珠) */
  + '.hs-rvv .raildot.r2{animation-delay:1.3s}'
  + '@keyframes hsRvRailDrop{0%{top:17px;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:calc(100% - 24px);opacity:0}}'
  + '@keyframes hsRvRail{0%{background-position:0 0}40%{background-position:0 10px}100%{background-position:0 16px}}'
  + '.hs-rvv .vcap{display:flex;align-items:center;gap:8px;min-height:34px}'
  + '.hs-rvv .vdot{flex:0 0 auto;width:11px;height:11px;margin-left:12.5px;border-radius:50%;position:relative;z-index:1}'
  + '.hs-rvv .vdot.src{background:#7fc9f2;box-shadow:0 0 9px rgba(127,201,242,.85);animation:hsRvSrcP 2.4s ease-in-out infinite}'
  + '@keyframes hsRvSrcP{0%,100%{box-shadow:0 0 6px rgba(127,201,242,.55)}50%{box-shadow:0 0 14px rgba(127,201,242,1)}}'
  + '.hs-rvv .vdot.end{background:#141822;border:2px solid #7fc9f2}'
  + '.hs-rvv .vlab{font-size:10px;color:#8ba0bd;line-height:1.5}'
  + '.hs-rvv .vlab b{color:#e8eaf0;font-size:11px;font-weight:600}'
  + '.hs-rvv .vlaneh{display:flex;align-items:center;gap:8px;margin:7px 2px 5px;font-size:9.5px;white-space:nowrap}'
  + '.hs-rvv .vlaneh.g{color:#8fe39a}'
  + '.hs-rvv .vlaneh.b{color:#7fc9f2}'
  + '.hs-rvv .vlaneh:before,.hs-rvv .vlaneh:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.14),transparent)}'
  + '.hs-rvv .vitem{position:relative}'
  + '.hs-rvv .vitem.open .vrow{background:rgba(255,255,255,.06);box-shadow:inset 2px 0 0 var(--c,#7fc9f2)}'
  + '.hs-rvv .vrow{position:relative;display:flex;align-items:center;gap:9px;padding:9px 6px 9px 2px;margin:2px 0;background:none;border:0;color:#e8eaf0;font-family:inherit;cursor:pointer;width:100%;border-radius:10px;text-align:left;transition:background .25s,box-shadow .25s}'
  + '.hs-rvv .vrow .dot{flex:0 0 auto;width:22px;height:22px;margin-left:5px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;background:#1a2130;border:2px solid var(--c,#7fc9f2);color:var(--c,#7fc9f2);position:relative;z-index:1;transition:box-shadow .3s}'
  + '.hs-rvv .vitem.open .vrow .dot{box-shadow:0 0 0 4px rgba(255,255,255,.05),0 0 12px var(--c,#7fc9f2)}'
  + '.hs-rvv .vrow .vmain{flex:1;min-width:0}'
  + '.hs-rvv .vrow .nm{font-size:12.5px;font-weight:600;display:flex;gap:6px;align-items:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.hs-rvv .vrow .ct{font-size:10.5px;color:#8ba0bd;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
  + '.hs-rvv .vrow .fchip{font-size:9.5px;padding:2px 7px}' /* v2.9.25: 竖版行内胶囊缩号 */
  + '.hs-rvv .chev{flex:0 0 auto;color:#8ba0bd;font-size:12px;transition:transform .3s}'
  + '.hs-rvv .vitem.open .chev{transform:rotate(90deg);color:#e8eaf0}'
  + '.hs-rvv .vpanel{max-height:0;overflow:hidden;transition:max-height 1.35s cubic-bezier(.3,.8,.3,1)}'
  + '.hs-rvv .vpanel-in{padding:6px 6px 12px 36px}'
  + '.hs-rvv .vpanel-in .d-row{flex-wrap:wrap;row-gap:2px}'
  + '.hs-rvv .vpanel-in .d-row span{white-space:normal}'
  + '.hs-rvv .vpanel-in .d-head{padding-right:0}'
  + '.hs-rvv .vpanel-in .d-t h3{font-size:12.5px}'
  + '@media(prefers-reduced-motion:reduce){.hs-rv *,.hs-rv *:before,.hs-rv *:after{animation:none!important;transition:none!important}}'
  /* v2.7.0 订阅卡片占位注释保留 */
  /* v2.7.0 订阅卡片(卡片化改版): 左色条区分激活/备用,流量条+到期徽章+操作行 */
  + '.hs-subcard{position:relative;background:rgba(19,28,48,.55);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px 14px 12px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.3)}'
  + '.hs-subcard.active{border-color:rgba(127,201,242,.4)}'
  + '.hs-subcard.active:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:#7fc9f2;border-radius:0 3px 3px 0}'
  + '.hs-subcard.standby{opacity:.9}'
  + '.hs-scbar{height:7px;background:rgba(0,0,0,.45);border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,.08);margin:6px 0 2px}'
  + '.hs-scfill{height:100%;border-radius:5px;background:linear-gradient(90deg,#2f6ae0,#7fc9f2)}'
  + '.hs-scfill.hot{background:linear-gradient(90deg,#c96a2f,#ffb74d)}'
  + '.hs-devrow.off{opacity:.55}'
  + '.hs-nrow{display:flex;align-items:center;padding:9px 10px;cursor:pointer;border-bottom:1px dashed rgba(255,255,255,.06);font-size:.8rem}'
  + '@keyframes hs-pulse{0%,100%{opacity:.5}50%{opacity:1}}'
  + '#hs_dg_arc{animation:hs-pulse 1.6s ease-in-out infinite;transition:stroke-dashoffset .6s ease}'
  + '.hs-npill{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:5px 10px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.3);color:#c8d2e0;font-size:.72rem;cursor:pointer;user-select:none;-webkit-user-select:none;transition:border-color .15s,background .15s}'
  + '.hs-npill:active{background:rgba(127,201,242,.1)}'
  + '.hs-npill.on{border-color:#7fc9f2;background:rgba(127,201,242,.16);color:#dff1fc}'
  + '.hs-npill .hs-nchk{flex:none;width:12px;color:#66bb6a;font-weight:700}'
  + '.hs-npill .hs-nfst{flex:none;padding:1px 7px;font-size:.62rem;border-radius:9px}'
  + '.hs-nrow:hover{background:rgba(255,255,255,.04)}'
  + '.hs-nrow.cur{border-color:#7fc9f2;background:rgba(79,140,255,.1)}'
  + '.hs-dot{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block;margin-right:4px}'
  + '.hs-dot.g{background:#66bb6a}.hs-dot.r{background:#e57373}.hs-dot.y{background:#ffb74d}.hs-dot.o{background:#5b6270}'
  + '.hs-prog-bar{height:10px;background:rgba(0,0,0,.4);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.1);margin:8px 0}'
  + '.hs-prog-ind{height:6px;background:rgba(0,0,0,.4);border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,.1);position:relative;margin:6px 0 2px}'
  + '.hs-prog-ind::after{content:"";position:absolute;top:0;bottom:0;width:30%;border-radius:6px;background:linear-gradient(90deg,transparent,#7fc9f2,transparent);animation:hsflow 1.1s ease-in-out infinite}'
  + '@keyframes hsflow{0%{left:-32%}100%{left:102%}}'
  + '.hs-prog-fill{height:100%;background:linear-gradient(90deg,#2f6ae0,#7fc9f2);border-radius:6px;transition:width .5s;width:0}'
  + '.hs-prog-steps{display:flex;justify-content:space-between;font-size:.64rem;color:#b3bdcb;margin:6px 0}'
  + '.hs-prog-steps .on{color:#7fc9f2;font-weight:bold}'
  + '.hs-prog-steps .done{color:#66bb6a}'
  + '.hs-cpr{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:3px 0;font-size:.78rem;flex-wrap:wrap}'
  + '.hs-entry{display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}'
  + '.hs-entry:active{background:rgba(255,255,255,.06)}'
  + '.hs-entry:last-child{border-bottom:none}';
  document.head.appendChild(st);
}

/* ================= 弹窗通用 ================= */
/* 弹窗显隐(文档 §4.1: 模态框复用面板 showModal('#id')/closeModal('#id') 控显隐;
   §3 全局函数先检测存在性,不可用时明确提示)——薄包装统一走面板 API,
   不再自切 style.display(旧直改形态系 shim 时代残留,ZWRT 分支废止) */
function mShow(id) {
  const m = $('#' + id);
  if (!m) { console.error('[小海关] 弹窗不存在:', id); return }
  if (typeof showModal === 'function') { showModal('#' + id); return }
  console.error('[小海关] 面板 showModal 不可用:', id);
  toast('面板弹窗接口不可用,无法打开窗口', 'red');
}
function mHide(id) {
  if (typeof closeModal === 'function') { closeModal('#' + id); }
  else { const m = $('#' + id); if (m) m.style.display = 'none'; console.error('[小海关] 面板 closeModal 不可用:', id); }
  /* 升级蒙层生命周期挂死在 simple 弹窗上:任何路径(✕/稍后/倒计时/进度窗)关闭即清——
     此前 ✕ 走 hsClose 只 mHide 不清蒙层,蒙层残留=全页锁死(2026-09-03 用户复现) */
  if (id === 'hs_modal_simple') rmUpgMask() }
function confirmBox(o) {
  return new Promise(res => {
    hsCfRes = res;
    const t = $('#hs_modal_cf_title'); if (!t) { console.error('[小海关] 确认框标题元素缺失'); res(false); return } t.textContent = o.title || '确认';
    t.style.color = o.danger ? '#ffb3b3' : '';
    $('#hs_cf_body').innerHTML = o.html || '';
    const ok = $('#hs_cf_ok'); ok.textContent = o.okText || '确定';
    ok.className = 'btn ' + (o.danger ? 'hs-dgr' : 'hs-pri');
    $('#hs_cf_no').textContent = o.cancelText || '取消';
    mShow('hs_modal_cf');
    if (o.countdown > 0) {
      clearInterval(hsConfirmTimer); /* 竞态防护: 新弹窗先清旧倒计时 */
      let n = o.countdown; ok.disabled = true; ok.textContent = (o.okText || '确定') + '(' + n + ')';
      hsConfirmTimer = setInterval(() => { n--; if (n <= 0) { clearInterval(hsConfirmTimer); hsConfirmTimer = null; ok.disabled = false; ok.textContent = o.okText || '确定' } else ok.textContent = (o.okText || '确定') + '(' + n + ')' }, 1000);
    }
  });
}
let hsCfRes = null;
let hsConfirmTimer = null; /* 审查P2-5: 倒计时竞态防护——入口/resolve 双向清理 */

/* ================= 常驻卡 ================= */
function renderCard() {
  const box = $('#hs_card');
  const abn = !ST.running && ST.residue;
  let st, sub;
  if (ST.running) {
    /* F01-R-007.A: 引擎进程在跑但 readiness 未就绪(采集成功但端口/鉴权未过)必须可读呈现,
       不得只显示●运行中;口径与 engineStart 硬门槛一致(mixed/redir/dns+ctrl),已就绪时保持原展示不变 */
    const miss = [];
    if (!ST.listen.mixed) miss.push('混合');
    if (!ST.listen.redir) miss.push('透明');
    if (!ST.listen.dns) miss.push('DNS');
    if (!ST.listen.ctrl) miss.push('控制');
    st = '<span style="color:#66bb6a">● 运行中</span>' + (C.ver ? ' v' + esc(C.ver) : '')
      + ((ST.upgradePending && ST.upgradePending.length) ? ' <span id="hs_upg_badge" class="hs-act warn" title="点击查看更新内容并升级">⬆️ 待升级 · 查看</span>' : '')
      + ((ST.downgraded && !(ST.upgradePending && ST.upgradePending.length)) ? ' <span class="hs-act warn" title="已回滚到旧版组件运行,新版本插件发布前不再提示升级">⬇️ 降级运行 ' + esc(C.upgBackup ? C.upgBackup.from : '?') + '</span>' : '');
    sub = '终端代理:' + s1Txt() + ' · 本机:' + (C.s2 ? '开' : '关');
    if (miss.length) {
      st = '<span style="color:#e57373">● 运行中·端口未就绪</span>' + (C.ver ? ' v' + esc(C.ver) : '');
      sub = '端口未就绪(' + miss.join('/') + '),代理当前不可用;请刷新状态或跑诊断排查';
    }
  } else if (abn) {
    st = '<span style="color:#e57373">● 异常:规则残留</span>';
    sub = '被接管设备可能断网,请还原或重启';
  } else {
    st = '<span style="color:#b3bdcb">● 已停止</span>';
    sub = ST.bin ? '引擎未运行,所有终端直连' : '内核未安装,请进 设置→安装与更新';
  }
  const mode = C.cardMode || 'full';
  let inner = '';
  if (mode === 'btn') {
    /* 纯按钮模式: 对齐 UFI-Tools 原生功能按钮网格(图标+名称,竖排多列自适应) */
    /* 小小猫入口方式: 面板原生 .btn 类的纯文字按钮(短标签“小海关”),挂在面板功能按钮区域 */
    inner = '';
  } else if (mode === 'simple') {
    inner = '<div style="padding:6px 0">'
    + '<div style="display:flex;align-items:flex-start;gap:8px">'
    + '<div style="flex:1;min-width:0;font-size:.78rem">' + st + ' <span style=\"font-size:.6rem;color:#b3bdcb\">小海关 v' + V + '</span><br><span style="font-size:.68rem;opacity:.75">' + esc(sub) + '</span></div>'
    + '</div>'
    + '</div>';
    /* 简洁模式下整块可点直达配置 */
    box.innerHTML = '<div style="cursor:pointer" id="hs_simple_zone">' + inner + '</div>';
    const sz = $('#hs_simple_zone'); if (sz) sz.onclick = () => { if (HS_UPGRADING) { upgShow('run'); return } openMgr('ov') };
    /* 徽标点击弹升级窗(整块可点开配置的优先级之下:徽标 stopPropagation 独占点击) */
    const bg = $('#hs_upg_badge');
    if (bg) bg.onclick = e => { e.stopPropagation(); showUpgradeCard() };
    return;
  } else {
    /* 完整模式: 折叠卡(状态+多按钮);v1.8.0 按钮重排=停止|分流|节点|日志(条件),配置/设备入口并入面板页签 */
    inner = '<div class="collapse" id="hs_collapse" data-name="' + (C._cardOpen ? 'open' : 'close') + '" style="' + (C._cardOpen ? '' : 'height:0;overflow:hidden') + '">'
    + '<div class="collapse_box">'
    + '<div id="hs_status" title="点击打开小海关面板" style="font-size:.72rem;padding:4px 8px;opacity:.9;cursor:pointer">' + st + '<br><span style="font-size:.66rem">' + esc(sub) + ' <span style="opacity:.7">› 详情</span></span></div>'
    + (abn ? '<div class="hs-warn" style="margin:4px 8px">⚠️ ' + esc(sub) + ' <button class="btn hs-sm hs-dgr" id="hs_restore">停止并还原</button></div>' : '')
    + '<div id="hs_actions" style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 8px 8px">'
    + (ST.running ? '<button class="btn hs-dgr" id="hs_btn_stop">停止</button>' : '<button class="btn hs-go" id="hs_btn_start">启动</button>')
    + '<button class="btn" id="hs_btn_split">分流</button>'
    + '<button class="btn" id="hs_btn_node">节点</button>'
    + (C.logEnabled ? '<button class="btn" id="hs_btn_log">日志</button>' : '')
    + '</div>'
    + '</div></div>';
  }
  const title = mode === 'simple'
    ? ''
    : '<div class="title" style="margin:6px 0"><strong>🛡️ 小海关</strong> <span style="font-size:.62rem;color:#b3bdcb;font-weight:400">v' + V + '</span>'
      + (mode === 'full' ? '<div style="display:inline-block" id="hs_collapse_btn"></div>' : '')
      + '</div>';
  box.innerHTML = title + inner;

  if (mode === 'btn') {
    /* 清理上次创建的入口按钮(重复粘贴防叠加) */
    const prev = document.getElementById('hs_btn_open');
    if (prev && prev.remove) prev.remove();
    /* 小小猫入口: 面板原生 .btn 类按钮,挂载到面板功能列表(ZWRT 文档 §4.1 锚点表),找不到则留在自身卡片区 */
    const ob = document.createElement('button');
    ob.type = 'button'; ob.id = 'hs_btn_open';
    /* 运行状态(v2.2.1 改 ET 组网同款圆点语言,用户定调:绿点表运行优于三角箭头):
       运行=绿●+原生激活底色;停止=灰●;待升级=橙●;异常(规则残留)=红●。innerHTML 为自产串无注入面 */
    const upg = !!(ST.upgradePending && ST.upgradePending.length);
    ob.innerHTML = abn ? '<span style="color:#e57373">●</span> 小海关' : upg ? '<span style="color:#ffb74d">●</span> 小海关' : (ST.running ? '<span style="color:#66bb6a">●</span> 小海关' : '<span style="opacity:.55">●</span> 小海关');
    ob.className = 'btn' + (abn ? ' hs-btn-abn' : upg ? ' hs-btn-upg' : (ST.running ? ' hs-btn-on' : ''));
    ob.title = abn ? '异常:规则残留' : upg ? '待升级,点击查看更新内容' : (ST.running ? '运行中' : '已停止');
    ob.onclick = HS_UPGRADING ? () => upgShow('run') : upg ? () => showUpgradeCard() : () => openMgr('ov');
    /* ZWRT 两级锚点(文档 §4.1「功能列表内的按钮」): 优先功能列表 .collapse_box,退化宿主容器 */
    const target = document.querySelector('.functions-container .collapse_box') || document.querySelector('.functions-container');
    if (target && target.appendChild) { target.appendChild(ob); box.style.display = 'none'; }
    else box.appendChild(ob);
    return;
  }
  if (mode === 'simple') return;
  /* 完整模式: 面板原生折叠 + 按钮绑定 */
  try { if (typeof collapseGen === 'function') collapseGen('#hs_collapse_btn', '#hs_collapse', 'hs_collapse_state') } catch (e) { console.warn('[小海关] collapseGen:', e) }
  const bind = (id, fn) => { const b = $('#' + id); if (b) { b.onclick = fn } else if (id !== 'hs_btn_start' && id !== 'hs_btn_stop') console.warn('[小海关] 按钮未找到:', id) }; /* v2.7.18: 启/停按钮至斥渲染,引擎运行时无启动钮=正常态,静默(用户实锤控制台刷屏) */
  const upgBadge = $('#hs_upg_badge'); if (upgBadge) upgBadge.onclick = () => showUpgradeCard(); /* 无待升级时徽标不存在,静默 */
  const gate = fn => () => { if (HS_UPGRADING) { upgShow('run'); return } fn() };
  /* 状态行整行可点开面板(配置按钮已并入面板页签) */
  const stl = $('#hs_status'); if (stl) stl.onclick = gate(() => { openMgr('ov') });
  /* 卡片直操启停(口径同状态页底栏:接管中停止先确认) */
  bind('hs_btn_stop', async () => {
    if (C.s1 !== 'off' || C.s2) {
      const ok = await confirmBox({ title: '停止代理引擎', html: '<div class="hs-hint">停止引擎将先摘除接管规则(新流量立即回直连),再平滑停止进程;接管终端的旧连接自动自愈,未接管终端不受影响。</div>', okText: '停止', danger: true });
      if (!ok) return;
    }
    await op(null, async () => { await engineStop() }, null, '停止中…'); renderMgrFoot(); renderCard();
    if (ST.upgradePending && ST.upgradePending.length) toast('已停止;检测到旧版组件仍在盘上,下次「启动」将自动完成升级', 'pink');
  });
  bind('hs_btn_start', async () => {
    await op(null, async () => { await engineStart() }, null, '启动中…'); renderMgrFoot(); renderCard();
    if ($('#hs_modal_mgr').style.display !== 'none') renderPane();
  });
  bind('hs_btn_split', gate(() => { openMgr('split') }));
  bind('hs_btn_node', gate(() => { openMgr('node') }));
  /* 日志按钮按开关显隐(渲染时已按 C.logEnabled 决定是否输出);卡片「刷新」按钮 v1.7.9 移除(用户:没什么用——状态本来事件驱动) */
  bind('hs_btn_log', gate(() => { openMgr('log') }));
  const rs = $('#hs_restore');
  if (rs) rs.onclick = async () => { await op(rs, async () => { await fwClean() }, '✅ 已停止并还原') };
}

function buildModals() {
  if ($('#hs_modal_mgr')) return;
  /* 文档 §4.1 形态: .mask 根节点(id 挂根,showModal/closeModal 按 #id 定位)包 .modal;
     .modal 复用面板视觉,.hs-modal 只承担布局尺寸约束(width/max-height/flex 列/内部滚动),
     同名属性由后加载的插件样式覆盖,视觉与自有形态零变化 */
  const mk = (id, title, big, inner) =>
    '<div class="mask" id="' + id + '" style="display:none;top:0;left:0;right:0;bottom:0;"><div class="modal hs-modal' + (big ? ' big' : '') + '">'
    + '<div class="hs-mh"><span class="t" id="' + id + '_title">' + title + '</span><button class="hs-mx" data-hs-close="' + id + '">✕</button></div>'
    + inner + '</div></div>';
  const body = (id) => '<div class="hs-mb" id="' + id + '"></div>';
  const foot = (btns) => '<div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;border-top:1px solid rgba(255,255,255,.1);flex:none">' + btns + '</div>';
  const wrap = document.createElement('div');
  wrap.innerHTML =
    mk('hs_modal_mgr', '🛡️ 小海关 v' + V, true,
      '<div class="hs-tabs" id="hs_mgr_tabs">'
      + '<button data-t="ov" class="on">状态</button><button data-t="split">分流</button><button data-t="node">节点</button><button data-t="sub">订阅</button><button data-t="set">设置</button><button data-t="log">日志</button>'
      + '</div>' + body('hs_mgr_pane')
      + '<div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 16px;border-top:1px solid rgba(255,255,255,.1);flex:none;flex-wrap:wrap" id="hs_mgr_foot"></div>')
  + mk('hs_modal_diag', '🔧 一键诊断', true, body('hs_diag_pane'))
  + mk('hs_modal_cf', '', false,
      body('hs_cf_body')
      + foot('<button class="btn" id="hs_cf_no">取消</button><button class="btn hs-pri" id="hs_cf_ok">确定</button>'))
  + mk('hs_modal_param', '⚙️ 参数修复', false,
      body('hs_param_body')
      + foot('<button class="btn" id="hs_pm_cancel">取消</button><button class="btn hs-pri" id="hs_pm_go">修复</button>'));
  wrap.innerHTML += '<div class="mask" id="hs_modal_simple" style="display:none;top:0;left:0;right:0;bottom:0;z-index:110"><div class="modal hs-modal"><div class="hs-mh"><span class="t" id="hs_modal_simple_title"></span><button class="hs-mx" data-hs-close="hs_modal_simple">✕</button></div><div class="hs-mb" id="hs_modal_simple_body"></div></div></div>';
  document.body.appendChild(wrap);
  /* 关闭与遮罩点击 */
  $$('.hs-mx,[data-hs-close]').forEach(b => b.onclick = () => { const id = b.dataset.hsClose; hsClose(id) });
  $$('#hs_modal_mgr,#hs_modal_diag,#hs_modal_cf,#hs_modal_param,#hs_modal_simple').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) hsClose(m.id) });
  });
  $('#hs_cf_ok').onclick = () => { clearInterval(hsConfirmTimer); hsConfirmTimer = null; mHide('hs_modal_cf'); if (hsCfRes) hsCfRes(true); hsCfRes = null };
  $('#hs_cf_no').onclick = () => { clearInterval(hsConfirmTimer); hsConfirmTimer = null; mHide('hs_modal_cf'); if (hsCfRes) hsCfRes(false); hsCfRes = null };
  $('#hs_pm_cancel').onclick = () => { mHide('hs_modal_param'); if (hsPmRes) hsPmRes(null); hsPmRes = null };
}
let hsPmRes = null;
function hsClose(id) {
  if (id === 'hs_modal_mgr') { closeMgr(); return }
  /* v1.8.5: ✕/蒙层关闭 = 取消,必须 resolve——否则调用方 await 永久悬挂(确认类操作静默失效,2026-09-13 审查 P1) */
  if (id === 'hs_modal_cf') { mHide(id); if (hsCfRes) { const r = hsCfRes; hsCfRes = null; r(false) } return }
  if (id === 'hs_modal_param') { mHide(id); if (hsPmRes) { const r = hsPmRes; hsPmRes = null; r(null) } return }
  mHide(id);
}
async function closeMgr() {
  if (!(await guardLeaveSet())) return;
  mHide('hs_modal_mgr'); stopLogTimer();
}
const lanIP = () => (typeof UFI_DATA !== 'undefined' && UFI_DATA && UFI_DATA.lan_ipaddr) ? UFI_DATA.lan_ipaddr : '192.168.0.1';

/* ================= 设备区(v1.8.0 并入「分流」页;openDev 保留为兼容入口) ================= */
async function openDev() { openMgr('split') }
let hsDevBusy = false; /* v1.8.5: in-flight 守卫(renderAll 链会连发,弱 CPU 上并发采集互相覆盖)(审查 P3) */
async function refreshDevPane() {
  if (hsDevBusy) return;
  hsDevBusy = true;
  try { await refreshDevPaneInner() } finally { hsDevBusy = false }
}
async function refreshDevPaneInner() {
  /* 双容器: 一级「设备」页(遗留,现已并入分流)写主窗格;分流页嵌入模式写 #hs_dev_pane(紧凑控件行,不带终端代理三段——分流页顶部已有) */
  const embed = hsTab !== 'dev';
  const pane = embed ? $('#hs_dev_pane') : $('#hs_mgr_pane');
  if (!pane) return;
  pane.innerHTML = '<div style="text-align:center;padding:14px;color:#b3bdcb;font-size:.76rem">📡 采集设备中…</div>';
  await collectDevices();
  const hd = '<div class="hs-pghead">'
  + '<div class="hs-seg" style="flex:1">'
  + '<button data-v="all" class="' + (C.s1 === 'all' ? 'on' : '') + '">全部终端</button>'
  + '<button data-v="white" class="' + (C.s1 === 'white' ? 'on' : '') + '">仅勾选的设备</button>'
  + '<button data-v="off" class="' + (C.s1 === 'off' ? 'on' : '') + '">关</button></div>'
  + '<button class="btn hs-sm" id="hs_line_mgr">🛤️ 线路(' + (C.lines || []).length + ')</button>'
  + '<button class="btn hs-sm" id="hs_dev_rf">⟳ 刷新</button>'
  + '</div>';
  const embedCtrl = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
  + '<span class="hs-hint" style="flex:1;font-size:.66rem">' + (C.s1 === 'white' ? '白名单模式:勾选的设备走代理' : C.s1 === 'all' ? '全部终端走代理' : '全部直连(上方「终端代理」可开)') + '</span>'
  + '<button class="btn hs-sm" id="hs_line_mgr">🛤️ 线路(' + (C.lines || []).length + ')</button>'
  + '<button class="btn hs-sm" id="hs_dev_rf">⟳</button>'
  + '</div>';
  let h = '';
  if (!C.devices.length) h += '<div class="hs-hint">暂未发现在线设备,请确认终端已连接</div>';
  C.devices.forEach((d, i) => {
    const lineOpts = ['<option value="">跟随全局</option>']
      .concat((C.lines || []).map(L => '<option value="' + esc(L.id) + '"' + (d.line === L.id ? ' selected' : '') + '>' + esc(L.name) + '</option>'))
      .join('');
    const pri = isPrivacyMac(d.mac);
    const priBadge = pri ? ' <span title="隐私MAC:可能轮换,白名单勾选可能失效,建议关闭设备私有Wi-Fi地址" style="font-size:.72rem;color:#ffcc80">🔒</span>' : '';
    h += '<div class="hs-devrow' + (d.online === false ? ' off' : '') + '">'
    + '<div style="flex:1;min-width:0">'
    + '<div class="hs-dev-name" data-rn="' + i + '" style="font-size:.82rem;font-weight:600;cursor:pointer">' + esc(d.name) + priBadge + ' <span style="opacity:.5;font-size:.64rem">✏️</span></div>'
    + '<div style="font-size:.7rem;color:#b3bdcb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(d.ip) + ' · ' + esc(d.host || d.mac) + '</div>'
    + '</div>'
    + '<select data-line="' + i + '" style="flex:none;max-width:96px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:6px;color:#e8eaf0;padding:3px 4px;font-size:.7rem">' + lineOpts + '</select>'
    + '<label class="hs-sw"><input type="checkbox" data-dev="' + i + '" ' + (d.proxy ? 'checked' : '') + '><span></span></label>'
    + '<button class="btn hs-sm hs-dgr hs-btn-xs" data-devdel="' + i + '" title="移除设备(移除后不再自动发现,可在底部已忽略中恢复)" style="flex:none;padding:2px 6px;min-width:28px">✕</button>'
    + '</div>';
  });
  const rmN = (Array.isArray(C.removedMacs) ? C.removedMacs : []).length;
  if (rmN) h += '<div class="hs-hint" style="margin-top:4px;text-align:right"><span class="hs-act" id="hs_rm_mgr" style="font-size:.62rem">🚫 已忽略 ' + rmN + ' 台设备 · 管理</span></div>';
  h += '<div class="hs-hint" style="margin-top:6px">💡 名字与白名单按 MAC 记忆,IP 变了也跟着设备走;清空保存=恢复默认名;Esc=取消<br>⚠️ 手机请关闭私有Wi-Fi地址后用真实MAC勾选——隐私MAC会轮换,换一次白名单就失效一次</div>'
  + ((C.lines || []).length ? '<div class="hs-hint">🛤️ 线路给设备指定独立出口(在「🛤️ 线路」里定义);未指定=与全局一致。<br>💡 建议给指定线路的设备绑定固定 IP(路由器/面板 DHCP 静态租约),否则设备换 IP 后线路会短暂跟随失效(自动纠正,期间走全局线路)。<br>⚠️ 手机 IPv6 隐私地址定时轮换,轮换瞬间该设备的 v6 直连流量会短暂走全局线路(自动跟随,不影响使用;追求精确可关闭设备的随机 v6 地址)。</div>' : '<div class="hs-hint">🛤️ 需要不同设备走不同出口?点上方「🛤️ 线路」定义线路后,每台设备可单独指定。</div>');
  if (hsTab === 'dev') pane.innerHTML = hd + '<div class="hs-pgscroll">' + h + '</div>';
  else pane.innerHTML = embedCtrl + h;
  pane.querySelectorAll('.hs-seg button').forEach(b => b.onclick = async () => {
    if (b.dataset.v === 'all') {
      const ok = await confirmBox({ title: '全部终端走代理', html: '<div class="hs-hint">所有连接本机的终端(含之后新接入的设备)流量都将走代理,不再限于白名单。可随时切回。</div>', okText: '切换' });
      if (!ok) return;
    }
    /* 设备页快捷三段与设置页同口径: 切换后必须 reapplyFw(含切「关」摘规则)——
       此前漏调导致设备页切换只在重启引擎后才生效(2026-09-03 审查发现) */
    await op(b, async () => { C.s1 = b.dataset.v; await saveConf(); await reapplyFw(); await opLog('终端代理→' + b.dataset.v) }, '✅ 终端代理: ' + ({ off: '关', all: '全部终端', white: '白名单' })[b.dataset.v] + '(增量规则,其他设备零感知)');
    refreshDevPane();
  });
  pane.querySelectorAll('[data-dev]').forEach(cb => cb.onchange = async () => {
    const d = C.devices[+cb.dataset.dev];
    const ok = await op(null, async () => { d.proxy = cb.checked; await saveConf(); await reapplyFw(); await opLog('白名单' + (cb.checked ? '添加' : '移除') + ': ' + d.name + '(' + d.ip + ')') },
      '✅ ' + d.name + (cb.checked ? ' 已加入白名单' : ' 已移出白名单'));
    if (!ok) cb.checked = !cb.checked;
  });
  pane.querySelectorAll('[data-devdel]').forEach(btn => btn.onclick = async () => {
    const d = C.devices[+btn.dataset.devdel]; if (!d) return;
    const ok = await confirmBox({ title: '移除设备', html: '<div class="hs-hint">' + (d.proxy ? '<b style="color:#ffb3b3">该设备在白名单中——移除将同时取消其代理接管</b><br>' : '') + '将移除该设备并停止自动发现(其 MAC 进入忽略名单,不再因 ARP/DHCP 残留重新出现);白名单勾选与线路设置同步清除。误移可在设备页底部「已忽略设备」中恢复。</div><div style="margin-top:6px;font-size:.76rem">设备：' + esc(d.name || d.mac) + '<br>MAC：' + esc(d.mac || '—') + '</div>', okText: '移除', danger: true });
    if (!ok) return;
    const done = await op(btn, async () => {
      const idx = C.devices.indexOf(d);
      if (idx >= 0) C.devices.splice(idx, 1);
      const macU = String(d.mac || '').toUpperCase();
      if (macU && !C.removedMacs.some(x => x.mac === macU)) { C.removedMacs.push({ mac: macU, name: String(d.name || '').slice(0, 24), time: nowStr().slice(0, 16) }); if (C.removedMacs.length > 50) C.removedMacs.shift() } /* v2.7.0: 黑名单防 ARP/DHCP 残留复活(真机实测);v2.7.9 存名字 */
      await saveConf();
      await reapplyFw();
      await opLog('移除设备:' + (d.name || d.mac || d.ip || '未知') + '(加入忽略名单)');
    }, '✅ 已移除并停止自动发现');
    if (done) refreshDevPane();
  });
  pane.querySelectorAll('[data-rn]').forEach(el => el.onclick = () => {
    const d = C.devices[+el.dataset.rn];
    el.innerHTML = '<input value="' + esc(d.name) + '" style="width:100%;background:rgba(0,0,0,.35);border:1px solid #7fc9f2;border-radius:6px;color:#e8eaf0;font-size:.8rem;padding:2px 6px">';
    const inp = el.querySelector('input'); inp.focus(); inp.select();
    const save = async () => {
      const v = inp.value.trim();
      const defName = d.host || ('设备_' + d.ip.split('.').pop());
      if (v) { if (v !== d.name) { d.name = v; await saveConf(); toast('已改名:' + v, 'green') } }
      else if (d.name !== defName) { d.name = defName; await saveConf(); toast('已恢复默认名:' + defName, 'green') }
      refreshDevPane()
    };
    let done = false;
    inp.onblur = () => { if (!done) save() };
    inp.onkeydown = e => {
      if (e.key === 'Enter') { done = true; save() }
      if (e.key === 'Escape') { done = true; refreshDevPane() }
    };
  });
  pane.querySelectorAll('[data-line]').forEach(sl => sl.onchange = async () => {
    const d = C.devices[+sl.dataset.line];
    const okr = await op(null, async () => {
      d.line = sl.value;
      await saveConf();
      await opLog('设备「' + d.name + '」线路→' + (d.line ? ((C.lines.filter(x => x.id === d.line)[0] || {}).name || d.line) : '跟随全局'));
      if (await saveConfReload(null)) { HS_LINE_SIG = lineSig(); await reapplyFw(); } /* 方案A热修: 热重载后同步重应用 fw——设备换线路即换 hs_wl_ 集合成员,不重应用则 fw 层静默失配(新增线路无链/删线残留旧链);reapplyFw 对未运行引擎安全(只重写烙印后 return) */
    }, '✅ 线路已' + (sl.value ? '指定' : '恢复跟随全局') + (ST.running ? '' : '(引擎未运行,下次启动生效)'));
    if (!okr) sl.value = d.line || ''; /* op 忙/失败时回滚下拉显示,防显示与数据不一致 */
  });
  const lmb = pane.querySelector('#hs_line_mgr'); if (lmb) lmb.onclick = () => openLineDlg();
  $('#hs_dev_rf').onclick = refreshDevPane; /* v2.9.2: 绑定曾错位在 openRemovedDlg 尾部(设备区渲染后从不执行=按钮死,用户实锤) */
  const rmm = pane.querySelector('#hs_rm_mgr'); if (rmm) rmm.onclick = openRemovedDlg;
}
/* v2.7.0 已忽略设备管理: 列出移除黑名单(v2.7.9 显示设备名+MAC 双行,可辨认),逐台可恢复 */
function openRemovedDlg() {
  const list = (Array.isArray(C.removedMacs) ? C.removedMacs : []).slice();
  let h = '<div class="hs-hint" style="margin-bottom:8px">以下设备已移除且不再自动发现;点「恢复」可重新纳入(设备需重新连上后才会出现在列表)</div>';
  if (!list.length) h += '<div class="hs-hint" style="padding:12px;text-align:center">无已忽略设备</div>';
  list.forEach((m, i) => {
    const it = typeof m === 'string' ? { mac: m, name: '', time: '' } : m;
    h += '<div class="hs-li" style="align-items:center;padding:6px 0"><div style="flex:1;min-width:0">'
    + '<div style="font-size:.8rem;font-weight:600">' + esc(it.name || '未命名设备') + '</div>'
    + '<div class="hs-hint" style="font-size:.66rem;font-family:monospace">' + esc(it.mac) + (it.time ? ' · ' + esc(it.time) + ' 忽略' : '') + '</div>'
    + '</div>'
    + '<button class="btn hs-sm" data-rmres="' + i + '">恢复</button></div>';
  });
  h += '<div class="hs-actions"><button class="btn" id="hs_rm_close">关闭</button></div>';
  hsOpenSimple('🚫 已忽略设备', h);
  const cl = document.getElementById('hs_rm_close'); if (cl) cl.onclick = () => hsClose('hs_modal_simple');
  document.querySelectorAll('[data-rmres]').forEach(b => b.onclick = async () => {
    const i = +b.dataset.rmres;
    const it = typeof list[i] === 'string' ? { mac: list[i], name: '' } : list[i];
    C.removedMacs.splice(i, 1);
    await saveConf();
    await opLog('恢复已忽略设备:' + (it.name || it.mac));
    toast('✅ 已恢复「' + (it.name || it.mac) + '」,设备重新连上后将自动出现在列表', 'green');
    openRemovedDlg(); refreshDevPane();
  });
}
/* ================= 分设备线路管理弹窗 ================= */
let LINE_NODES = null; /* 节点选项缓存(打开弹窗时懒加载) */
async function openLineDlg() {
  try {
  LINE_NODES = null;
  hsOpenSimple('🛤️ 线路管理',
    /* 内容整体可滚(多线路一屏放不下);节点列表自身另有滚动——指针/手指在哪层就滚哪层(嵌套滚动原生行为) */
    '<div class="hs-pgscroll" style="padding:12px 14px">'
    + (C.policySrc === 'direct' ? '<div style="margin-bottom:8px;padding:6px 10px;border:1px solid rgba(255,183,77,.4);border-radius:8px;font-size:.68rem;color:var(--warn,#ffb74d)">⚠️ 当前为订阅直通模式:分设备线路不生效(流量按订阅自己的分组与规则走),以下配置仅在切回「自建/合并」后生效</div>' : '')
    + '<div id="hs_line_body"><div class="hs-hint">读取中…</div></div>'
    + '<div class="hs-hint" style="margin-top:8px">💡 线路=独立出口策略,在设备列表给每台设备指定;强制/排除规则始终优先于线路。节点池=勾选若干节点后按池内策略使用。<br>建议给指定线路的设备绑定固定 IP(DHCP 静态租约);手机 IPv6 隐私地址轮换瞬间会短暂走全局线路(自动跟随,不影响使用)。</div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;flex:none;padding:10px 14px;border-top:1px solid rgba(255,255,255,.1)"><button class="btn" id="hs_line_add">➕ 新增线路</button><button class="btn hs-pri" id="hs_line_save">保存并生效</button></div>');
  const draft = JSON.parse(JSON.stringify(C.lines || [])).map(L => {
    if (!Array.isArray(L.nodes)) L.nodes = (typeof L.node === 'string' && L.node) ? [L.node] : [];
    if (!L.pick) L.pick = 'auto';
    L._open = false; L._q = '';
    return L;
  });
  /* 节点选项懒加载(引擎运行才有);组跟随实际主组(直通=订阅组,曾写死🚀节点选择致直通下节点池空);
     过滤: 信息节点/子组名/GLOBAL/DIRECT 等非可选节点项 */
  if (ST.running) {
    const d = await apiGet('/proxies');
    const mg = hsMainGroup(), grp = d && d.proxies && d.proxies[mg];
    if (grp && grp.all) {
      const grpNames = new Set(Object.keys(d.proxies || {}).filter(k => d.proxies[k] && /Selector|URLTest|Fallback|LoadBalance/i.test(d.proxies[k].type || '')));
      const IP = HS_INFO_PAT;
      LINE_NODES = grp.all.filter(n => !IP.test(n) && !grpNames.has(n) && n !== 'DIRECT' && n !== 'REJECT' && n !== 'GLOBAL' && n !== 'PASS' && n !== 'COMPATIBLE');
    }
  }
  const body = $('#hs_line_body'); if (!body) return;
  const MODES = [['auto', '自动选优'], ['balance', '负载均衡'], ['fallback', '故障转移'], ['node', '节点池']];
  const PICKS = [['auto', '池内优选'], ['balance', '池内均衡'], ['fallback', '池内转移'], ['manual', '手动指定']];
  const inpCss = 'background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:6px 10px;font-size:.76rem';
  const headTxt = L => {
    const ns = L.nodes;
    if (!ns.length) return '请至少勾选 1 个节点';
    if (ns.length === 1) return '锁定:' + esc(ns[0]);
    if (L.pick === 'manual') return '锁定首选:' + esc(ns.indexOf(L.node) >= 0 ? L.node : ns[0]) + '(共' + ns.length + ')';
    return '候选池 ' + ns.length + ' 节点';
  };
  /* 节点勾选列表(搜索框输入时仅重建此容器,保持输入焦点;滚动位置由调用方保留);
     流式胶囊布局: 点整个节点名即切换选中(无独立复选框),宽度自适应多列平铺/窄屏自动单列 */
  const nodeListHtml = i => {
    const L = draft[i];
    const list = (LINE_NODES || []).filter(n => !L._q || n.toLowerCase().indexOf(L._q.toLowerCase()) >= 0);
    return list.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' + list.map(n => {
      const on = L.nodes.indexOf(n) >= 0;
      const isFst = L.pick === 'manual' && on && L.node === n;
      return '<span data-lnk="' + i + '" data-n="' + esc(n) + '" class="hs-npill' + (on ? ' on' : '') + '">'
      + '<span class="hs-nchk">' + (on ? '✓' : '') + '</span>'
      + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(n) + '</span>'
      + (L.pick === 'manual' && on ? '<button class="btn hs-sm hs-nfst" data-lnf="' + i + '" data-n="' + esc(n) + '"' + (isFst ? ' style="color:#7fc9f2"' : '') + '>' + (isFst ? '★' : '设首选') + '</button>' : '')
      + '</span>';
    }).join('') + '</div>' : '<div class="hs-hint" style="padding:8px 10px">' + (LINE_NODES ? '无匹配节点' : '节点列表不可用(需引擎运行后打开)') + '</div>';
  };
  const bindList = i => {
    const box = body.querySelector('#hs_lnl_' + i); if (!box) return;
    /* 点整个胶囊(节点名)即切换选中: 就地换样式不重建列表,不丢滚动位置 */
    box.querySelectorAll('[data-lnk]').forEach(pill => pill.onclick = e => {
      if (e.target && e.target.closest && e.target.closest('[data-lnf]')) return; /* 首选按钮单独处理 */
      const L = draft[i];
      const n = pill.dataset.n;
      const idx = L.nodes.indexOf(n);
      const on = idx < 0;
      if (on) L.nodes.push(n);
      else { L.nodes.splice(idx, 1); if (L.node === n) L.node = '' }
      pill.classList.toggle('on', on);
      const chk = pill.querySelector('.hs-nchk'); if (chk) chk.textContent = on ? '✓' : '';
      const hc = body.querySelector('[data-lhead="' + i + '"]'); if (hc) hc.textContent = headTxt(L);
      if (L.pick === 'manual') reRenderList(i); /* manual 需刷首选按钮显隐 */
    });
    box.querySelectorAll('[data-lnf]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const L = draft[i]; L.node = b.dataset.n;
      const hc = body.querySelector('[data-lhead="' + i + '"]'); if (hc) hc.textContent = headTxt(L);
      reRenderList(i);
    });
  };
  const reRenderList = i => {
    const box = body.querySelector('#hs_lnl_' + i); if (!box) return;
    const st = box.scrollTop;
    box.innerHTML = nodeListHtml(i); bindList(i);
    box.scrollTop = st;
  };
  const render = () => {
    let h = '';
    if (!draft.length) h = '<div class="hs-hint">暂无线路——新增一条,然后在设备列表下拉里给每台设备指定。</div>';
    draft.forEach((L, i) => {
      h += '<div class="hs-sec" style="margin-bottom:10px;padding:10px">'
      + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'
      + '<input data-ln="' + i + '" value="' + esc(L.name) + '" placeholder="线路名(如 香港)" style="flex:1;min-width:0;' + inpCss + '">'
      + '<button class="btn hs-sm hs-dgr" data-ldel="' + i + '">删除</button>'
      + '</div>'
      + '<div class="hs-seg" data-lm="' + i + '">' + MODES.map(m => '<button data-m="' + m[0] + '" class="' + (L.mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>').join('') + '</div>';
      if (L.mode === 'node') {
        h += '<div style="margin-top:8px"><div class="hs-hint" style="margin:0 0 4px">池内策略</div>'
        + '<div class="hs-seg" data-lp="' + i + '">' + PICKS.map(p => '<button data-p="' + p[0] + '" class="' + (L.pick === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div></div>'
        + '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
        + '<button class="btn hs-sm" data-lnsw="' + i + '">' + (L._open ? '▾' : '▸') + ' 节点列表</button>'
        + '<span class="hs-hint" data-lhead="' + i + '">' + headTxt(L) + '</span>'
        + '</div>';
        if (L._open) {
          h += '<input data-lq="' + i + '" value="' + esc(L._q) + '" placeholder="🔍 搜索节点名…" style="width:100%;box-sizing:border-box;margin-top:6px;' + inpCss + '">'
          + '<div id="hs_lnl_' + i + '" style="max-height:200px;overflow-y:auto;margin-top:6px;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 10px">' + nodeListHtml(i) + '</div>';
        }
      }
      h += '</div>';
    });
    if (LINE_NODES === null && ST.running) h += '<div class="hs-hint" style="margin-top:2px">⚠️ 节点列表读取失败,节点池暂不能勾选(其他模式不受影响)</div>';
    if (!ST.running) h += '<div class="hs-hint" style="margin-top:2px">引擎未运行:节点池需引擎启动后再来勾选,其余模式可直接保存</div>';
    body.innerHTML = h;
    body.querySelectorAll('[data-ln]').forEach(inp => inp.oninput = () => { draft[+inp.dataset.ln].name = inp.value });
    body.querySelectorAll('[data-lm]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      const i = +seg.dataset.lm; draft[i].mode = b.dataset.m; render();
    }));
    body.querySelectorAll('[data-lp]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => {
      const i = +seg.dataset.lp; draft[i].pick = b.dataset.p; render();
    }));
    body.querySelectorAll('[data-lnsw]').forEach(b => b.onclick = () => { const i = +b.dataset.lnsw; draft[i]._open = !draft[i]._open; render() });
    body.querySelectorAll('[data-lq]').forEach(inp => inp.oninput = () => {
      const i = +inp.dataset.lq; draft[i]._q = inp.value;
      reRenderList(i); /* 只重建列表容器,输入框不动 */
    });
    body.querySelectorAll('[data-ldel]').forEach(b => b.onclick = () => { draft.splice(+b.dataset.ldel, 1); render() });
    draft.forEach((L, i) => { if (L._open) bindList(i) });
  };
  render();
  $('#hs_line_add').onclick = () => {
    if (draft.length >= 6) { toast('线路最多 6 条', 'red'); return }
    draft.push({ id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '线路' + (draft.length + 1), mode: 'auto', pick: 'auto', node: '', nodes: [] }); render()
  };
  $('#hs_line_save').onclick = async () => {
    const btn = $('#hs_line_save'); btn.disabled = true; btn.textContent = '保存中…';
    const fail = msg => { toast(msg, 'red'); btn.disabled = false; btn.textContent = '保存并生效' };
    /* 校验: 名称非空、去重; 节点池至少 1 个节点 */
    for (const L of draft) {
      L.name = String(L.name || '').trim();
      if (!L.name) { fail('线路名不能为空'); return }
      if (L.name.length > 12) L.name = L.name.slice(0, 12);
      if (L.mode === 'node' && !L.nodes.length) { fail('「' + L.name + '」节点池为空,请勾选至少 1 个节点'); return }
    }
    const names = draft.map(L => L.name);
    if (new Set(names).size !== names.length) { fail('线路名不能重复'); return }
    const removedIds = (C.lines || []).filter(oldL => !draft.some(L => L.id === oldL.id)).map(L => L.id);
    C.lines = draft.map(L => ({ id: L.id, name: L.name, mode: L.mode, pick: L.pick, node: String(L.node || ''), nodes: L.nodes.slice(0, 30) }));
    if (removedIds.length) C.devices.forEach(d => { if (removedIds.indexOf(d.line) >= 0) d.line = '' });
    await saveConf();
    await opLog('线路管理:保存 ' + C.lines.length + ' 条' + (removedIds.length ? ',删除 ' + removedIds.length + ' 条(相关设备恢复跟随全局)' : ''));
    if (await saveConfReload(null)) { HS_LINE_SIG = lineSig(); await reapplyFw(); } /* 方案A热修: 同设备换线路——线路增删改后 fw 层集合/链同步重建(含孤儿清理),不重应用则新增线路无 hs_wl_<newid>/删线残留 hs_wl_<oldid> 死端口黑洞 */
    /* 锁定类线路: 运行时显式切换组选择(store-selected 会记忆,但首次/default 不可靠);编码名失败回退原样名 */
    for (const L of C.lines) {
      const def = lineDefOf(L);
      if (L.mode === 'node' && def && ST.running) {
        let ok = await apiPut('/proxies/' + encodeURIComponent(lineGName(L.name)), { name: def });
        if (!ok) ok = await apiPut('/proxies/' + lineGName(L.name), { name: def });
        if (!ok) await opLog('线路「' + L.name + '」锁定未即时生效(下次引擎重启由 default 恢复)');
      }
    }
    toast('✅ 线路已保存并生效', 'green');
    mHide('hs_modal_simple'); refreshDevPane();
  };
  } catch (e) { toast('线路弹窗异常:' + esc(String((e && e.message) || e).slice(0, 60)), 'red'); console.error('[小海关] openLineDlg:', e) }
}

/* ================= 节点弹窗(9090 API) ================= */
async function apiGet(path) {
  const r = await run('curl -s -m 10 -H "Authorization: Bearer ' + C.secret + '" ' + shq('http://127.0.0.1:' + C.ports.ctrl + path), 15000);
  if (!r.success || !r.content) return null;
  try { return JSON.parse(r.content) } catch (e) { return null }
}
async function apiPut(path, body) {
  /* -w 追加末行 HTTP 状态码:此前只看 curl 是否跑完,404(名字编码问题)会被当成功 */
  const r = await run('curl -s -m 4 -X PUT -H "Authorization: Bearer ' + C.secret + '" -H "Content-Type: application/json" -w "\\n%{http_code}" -d ' + shq(JSON.stringify(body)) + ' ' + shq('http://127.0.0.1:' + C.ports.ctrl + path), 6000);
  if (!r.success) return false;
  const m = (r.content || '').match(/(\d{3})\s*$/);
  return !!m && (m[1] === '200' || m[1] === '204');
}
let hsCurGroup = '';
const HS_DELAY = {}; const HS_UDP_NODE = {}; let hsUdpRun = false;
/* 组测速: mihomo v1.19.4+ 起 /proxies/{name} 端点只查静态代理表(tunnel.Proxies()),
   不含订阅节点(必 404 Resource not found);订阅节点测速必须走 /group/{组名}/delay——
   引擎内部并发测全组,一次返回 {节点名:延迟} 映射,结果缺项=不可用(小小猫同款方案) */
async function groupDelay(u) {
  const q = '/group/' + encodeURIComponent(hsCurGroup) + '/delay?timeout=5000&url=' + encodeURIComponent((u || 'https://www.gstatic.com/generate_204'));
  const r = await run('curl -s -m 25 -H "Authorization: Bearer ' + C.secret + '" ' + shq('http://127.0.0.1:' + C.ports.ctrl + q), 30000);
  try { const j = JSON.parse(r.content); if (j && typeof j === 'object' && !j.message) return j } catch (e) {}
  console.log('[小海关] 组测速失败:', (r.content || '').slice(0, 120));
  return null;
}
/* 把组测速结果刷到节点行: map 有值>0 = 延迟;map 有但<=0 或缺项 = 超时;map=null 整体失败不动 */
let hsGrpTestAt = 0;
function applyDelayMap(map, allNodes) {
  const pane = $('#hs_mgr_pane'); if (!pane) return;
  (allNodes || (map ? Object.keys(map) : [])).forEach(n => {
    const row = pane.querySelector('[data-node="' + CSS.escape(n) + '"]'); if (!row) return;
    const el = row.querySelector('.hs-lat'), dot = row.querySelector('.hs-dot'); if (!el) return;
    const d = map ? map[n] : undefined;
    if (d > 0) {
      HS_DELAY[n] = d;
      el.textContent = d + 'ms'; el.style.color = latClr(d);
      if (dot) { dot.className = 'hs-dot ' + (d < 150 ? 'g' : d < 400 ? 'y' : 'r'); dot.style.marginRight = '8px' }
    } else if (map) {
      HS_DELAY[n] = -1;
      el.textContent = '超时'; el.style.color = '#e57373';
      if (dot) { dot.className = 'hs-dot r'; dot.style.marginRight = '8px' }
    }
  });
}
async function switchMode(mode) {
  C.mode = mode; C.pausedAuto = false; await saveConf();
  if (!ST.running) { toast('模式已保存,下次启动生效', 'green'); return }
  const yaml = genConfigYaml();
  if (yaml === null) { toast('⚠️ 订阅解析失败,模式仅保存,未热重载(旧配置保留)', 'red'); return }
  /* F13: 写盘失败不发起热重载(同 syncLineRules)——模式已保存,下次启动按新模式生成;也不平滑重启(重启也生成不了盘上配置) */
  if (!(await writeFile(CFG, yaml))) { toast('❌ 配置写盘失败,模式已保存但未热重载(旧配置保留)', 'red'); await opLog('模式切换:写盘失败,跳过热重载(' + mode + ')'); return }
  const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
  if (ok) {
    toast('模式热重载:' + ({ auto: '自动选优', balance: '负载均衡', fallback: '故障转移', manual: '手动' })[mode], 'green');
    await opLog('模式热切换:' + mode);
  } else {
    toast('热重载失败,平滑重启中', 'green');
    await applyWithTxn('模式:' + mode);
  }
}
async function getConnectionStats() {
  if (!ST.running) return null;
  const d = await apiGet('/connections');
  if (!d) return null;
  const bySrc = {}; const grp = {}; const act = [];
  /* v4/v6 → MAC 归并: v4 直配设备表 ip;v6 经邻居表换 MAC 再配(同一设备 v4/v6 合并为一行) */
  const macOf = src => (/\./.test(src) ? (ST.arp4 || {})[src] : (ST.neigh6 || {})[src]) || '';
  const devKeyOf = src => {
    if (src === '127.0.0.1') return 'localhost';
    const byIp = (C.devices || []).find(x => x.ip === src);
    if (byIp) return byIp.mac || byIp.ip;
    return macOf(src) || src;
  };
  (d.connections || []).forEach(c => {
    const m = c.metadata || {};
    const src = m.sourceIP || '?';
    bySrc[src] = (bySrc[src] || 0) + 1;
    const up = c.upload || 0, dl = c.download || 0;
    const row = {
      host: m.host || m.sniffHost || m.destinationIP || '?',
      port: m.destinationPort,
      rule: (c.rule || '') + (c.rulePayload ? ',' + c.rulePayload : ''),
      chain: (c.chains && c.chains[0]) || '?',
      up: up, dl: dl
    };
    if (up + dl > 0) {
      act.push(row);
      const gk = devKeyOf(src);
      if (!grp[gk]) grp[gk] = { srcs: [], conns: [], up: 0, dl: 0 };
      if (grp[gk].srcs.indexOf(src) < 0) grp[gk].srcs.push(src);
      grp[gk].conns.push(row); grp[gk].up += up; grp[gk].dl += dl;
    }
  });
  act.sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
  const byDev = Object.keys(grp).map(k => {
    const g = grp[k];
    const src0 = g.srcs[0];
    let icon = '📱', name = src0 + '(未入库)', mac = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(k) ? k : '';
    if (k === 'localhost') { icon = '🖥️'; name = '设备本机' }
    else {
      const dv = (C.devices || []).find(x => x.mac && x.mac.toUpperCase() === k.toUpperCase()) || (C.devices || []).find(x => x.ip === src0);
      if (dv) { icon = dv.proxy ? devIconOf(dv.name, dv.host) : '📵'; name = dv.name || dv.mac || src0; mac = dv.mac || mac }
      else icon = devIconOf(name, '');
    }
    g.conns.sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
    /* v2.2.1: 同目标(host)聚合——网关层隧道场景(终端自带代理客户端时)一台设备可产生几十条同目标连接,
       逐条展示既占满 8 行又让用户"看不出是什么"(真机实证:87/88 条全是机场入口域名);聚合后 ×N 计数 */
    const agg = {};
    g.conns.forEach(r => { const k = r.host; if (!agg[k]) agg[k] = { host: r.host, rule: r.rule, chain: r.chain, up: 0, dl: 0, n: 0 }; agg[k].up += r.up; agg[k].dl += r.dl; agg[k].n++ });
    const aggArr = Object.keys(agg).map(k => agg[k]).sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
    return { src: src0, icon: icon, name: name, mac: mac, up: g.up, dl: g.dl, conns: aggArr.slice(0, 8), total: g.conns.length };
  }).sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
  /* 未入库的 v6 源: ping 一次让内核邻居表学习到它的 MAC(隐私扩展无法从地址反推),
     不阻塞当前渲染,下次 collectStatus 后自动归并到设备行 */
  byDev.forEach(dv => {
    if (dv.name.indexOf('(未入库)') > 0 && dv.src && dv.src.indexOf(':') > 0) {
      run('(ping -6 -c 1 -W 1 ' + shq(dv.src) + ' 2>/dev/null || ping6 -c 1 -w 1 ' + shq(dv.src) + ' 2>/dev/null) >/dev/null 2>&1; ip -6 neigh show ' + shq(dv.src) + ' 2>/dev/null | grep lladdr', 5000).then(() => {});
    }
  });
  return { total: (d.connections || []).length, bySrc: bySrc, top: act.slice(0, 15), byDev: byDev };
}
const fmtB = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : n >= 1024 ? (n / 1024).toFixed(0) + 'KB' : n + 'B';
/* 移动端适配: 从完整节点名提取地区摘要(两行式连接行第二行用) */
const CHAIN_REGIONS = ['日本', '香港', '新加坡', '美国', '台湾', '韩国', '英国', '德国', '泰国', '越南', '菲律宾', '马来西亚', '印度', '土耳其', '阿根廷', '巴西', '加拿大', '澳大利亚', '俄罗斯', '法国', '荷兰', '意大利', '西班牙', '阿联酋'];
function chainToShort(chain) {
  const c = String(chain || '').trim();
  if (!c || c === 'DIRECT') return { label: '直连', more: '' };
  if (/剩余流量|到期|过期|官网|套餐|重置|流量[:：]|EXP/i.test(c)) return { label: 'ℹ️', more: '信息节点' };
  /* 提取国旗 emoji(Unicode 区域指示符对) */
  const flag = (c.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/) || [''])[0];
  /* 提取地区名 */
  let region = '';
  for (const r of CHAIN_REGIONS) { if (c.includes(r)) { region = r; break } }
  if (!region) {
    /* 未匹配关键词: 取第一个|前的文字截取前4字 */
    const seg = c.split('|')[0].trim();
    region = seg.length > 4 ? seg.slice(0, 4) : seg;
  }
  return { label: region + flag, more: c.split('|')[0].trim() };
}
async function refreshNodePane() {
  try {
  const pane = $('#hs_mgr_pane');
  if (hsTab !== 'node' || !pane) return;
  if (!ST.running) {
    pane.classList.remove('hs-node-mode');
    pane.innerHTML = '<div style="text-align:center;padding:30px 10px"><div style="font-size:1.7rem">🌐</div>'
    + '<div style="font-weight:700;margin:8px 0 4px">引擎未运行</div>'
    + '<div class="hs-hint">节点管理需要引擎运行后经控制接口读取;<br>四智能模式(自动选优/负载均衡/故障转移/手动)由订阅自动生成,点击即可切换。</div></div>';
    return;
  }
  pane.innerHTML = '<div class="hs-hint">读取节点中…</div>';
  const data = await apiGet('/proxies');
  if (!data || !data.proxies) {
    pane.classList.remove('hs-node-mode');
    pane.innerHTML = '<div style="text-align:center;padding:30px 10px"><div style="font-size:1.7rem">🔌</div>'
    + '<div style="font-weight:700;margin:8px 0 4px">控制接口不可达</div>'
    + '<div class="hs-hint">引擎在运行但 9090 接口无响应——通常是 config.yaml 异常。<br>可先在 设置→安装 更新内核并启动,重启引擎后此处自动可用。</div></div>';
    return;
  }
  /* 过滤 GLOBAL(mihomo 内置全局模式组) */
  const groups = Object.keys(data.proxies).filter(k => k !== 'GLOBAL' && ['Selector', 'URLTest', 'Fallback', 'LoadBalance'].indexOf(data.proxies[k].type) >= 0);
  if (!groups.length) { pane.classList.remove('hs-node-mode'); pane.innerHTML = '<div class="hs-hint" style="padding:20px;text-align:center">未发现策略组(请在订阅页添加)</div>'; return }
  if (!hsCurGroup || groups.indexOf(hsCurGroup) < 0) hsCurGroup = groups[0];
  const g = data.proxies[hsCurGroup];
  const settable = g.type === 'Selector';
  const INFO_PAT = HS_INFO_PAT;
  const realNodes = (g.all || []).filter(n => !INFO_PAT.test(n));
  const infoNodes = (g.all || []).filter(n => INFO_PAT.test(n));

  const MODE_NAME = { auto: '自动', balance: '均衡', fallback: '转移', manual: '手动' };
  const MODE_DESC = { auto: '自动挂最低延迟节点', balance: '流量分摊多节点', fallback: '按序用可用节点', manual: '人工点选' };
  let h = '';
  /* === 头部固定块: 模式切换 + 策略组 + 订阅信息(不随列表滚动) === */
  h += '<div class="hs-node-head">';
  /* 模式切换(第一行) */
  if (C.policySrc === 'direct') h += '<div class="hs-hint" style="margin-bottom:6px">🧭 <b style="color:#ffb74d">订阅直通中</b>:以下分组来自订阅,规则由订阅接管(小海关防火墙门控/国内直通照常);可在 设置→策略来源 切换</div>'
  else if (C.policySrc === 'merge') h += '<div class="hs-hint" style="margin-bottom:6px">🧭 <b style="color:#8fe39a">合并模式</b>:🚀/♻️/⚖️/🪜 为本地调度组(订阅节点为候选),其余为订阅分类组;规则冲突以本地为准</div>'
    /* v1.8.5: 合并模式的调度由本地四模式组承担,补回模式切换入口(此前 only self 分支才有)(审查 P2) */
    + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">'
    + '<div class="hs-seg" style="gap:3px">'
    + Object.keys(MODE_NAME).map(m => '<button data-mode="' + m + '" class="' + (C.mode === m ? 'on' : '') + '" style="padding:4px 10px;font-size:.72rem">' + MODE_NAME[m] + '</button>').join('')
    + '</div><span class="hs-hint" style="font-size:.66rem">' + MODE_DESC[C.mode] + '</span></div>'
  + '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
  + '<button id="hs_node_test" style="padding:4px 12px;font-size:.72rem;flex:none">⚡ 测全部</button>'
  + '<button id="hs_node_udp" style="padding:4px 12px;font-size:.72rem;flex:none">🛰️ 测UDP</button>'
  + '<button id="hs_node_rf" style="padding:4px 12px;font-size:.72rem;flex:none">⟳ 刷新</button>'
  + '</div>';
  else h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
  + '<div class="hs-seg" style="gap:3px">'
  + Object.keys(MODE_NAME).map(m => '<button data-mode="' + m + '" class="' + (C.mode === m ? 'on' : '') + '" style="padding:4px 10px;font-size:.72rem">' + MODE_NAME[m] + '</button>').join('')
  + '</div>'
  + '<span class="hs-hint" style="font-size:.66rem;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + MODE_DESC[C.mode] + '</span>'
  + '<button id="hs_node_test" style="padding:4px 12px;font-size:.72rem;flex:none">⚡ 测全部</button>'
  + '<button id="hs_node_udp" style="padding:4px 12px;font-size:.72rem;flex:none">🛰️ 测UDP</button>'
  + '<button id="hs_node_rf" style="padding:4px 12px;font-size:.72rem;flex:none">⟳ 刷新</button>'
  + '</div>';
  /* 策略组(第二行,有多个组才显示) */
  if (groups.length > 1) {
    h += '<div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:4px;padding-bottom:2px">'
    + groups.map(gn => '<button data-g="' + esc(gn) + '" style="flex:none;white-space:nowrap;padding:3px 10px;font-size:.7rem;' + (gn === hsCurGroup ? 'background:var(--dark-btn-color-active,rgba(1,138,216,.66));color:#fff;border-radius:6px;border:1px solid transparent' : '') + '">' + esc(gn) + '</button>').join('')
    + '</div>';
  }
  h += '</div>';
  /* v2.2.0: 页顶引导句——胶囊可点语义不立住,用户不知道"点胶囊=切换节点" */
  h += '<div class="hs-hint" style="margin-top:4px;font-size:.66rem">👇 点节点胶囊即切换(亮框✓=当前选中);测速后按延迟选最快的用</div>';
  /* 订阅来源行(头部第三行): 本页节点来自当前生效订阅(多订阅不合并,切换订阅=重新生效配置) */
  const sb = C.subs[C.activeSub];
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;font-size:.68rem;margin-top:2px;color:#b3bdcb">'
  + '<span>📄 <b style="color:#e8eaf0">' + esc(sb ? sb.name : '未启用订阅') + '</b>' + (sb && sb.time ? ' · 更新 ' + esc(sb.time.slice(5)) : '') + '</span>'
  + '<button class="btn hs-xs" id="hs_node_submgr" style="flex:none">管理订阅 ›</button>';
  /* v2.7.0: 订阅流量/到期信息不再在节点页显示(归订阅界面每卡独立显示;
     融合后"显示哪个订阅的"有歧义,用户产品决策);info 节点本身仍被隐藏不逃逸到节点列表 */
  h += '</div>';
  /* === 节点列表(独立滚动块,不带动头部) === */
  pane.classList.add('hs-node-mode');
  h += '<div class="hs-node-list">';
  h += '<div class="hs-sec" style="margin-bottom:0"><h4 style="padding:2px 2px 6px">' + esc(g.now || '—') + ' · ' + realNodes.length + '节点' + (settable ? ' · 点击切换' : ' · 自动组') + '</h4>';
  realNodes.forEach(name => {
    const pr = data.proxies[name] || {};
    let last = HS_DELAY[name] !== undefined ? (HS_DELAY[name] > 0 ? HS_DELAY[name] : 0) : ((pr.history && pr.history.length) ? pr.history[pr.history.length - 1].delay : 0);
    const cls = !last ? 'o' : (last < 150 ? 'g' : (last < 400 ? 'y' : 'r'));
    h += '<div class="hs-nrow' + (name === g.now ? ' cur' : '') + '" data-node="' + esc(name) + '">'
    + '<span class="hs-dot ' + cls + '" style="margin-right:8px"></span>'
    + '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</span>'
    + (name === g.now ? '<span style="color:#7fc9f2;font-size:.62rem;border:1px solid #7fc9f2;border-radius:4px;padding:0 4px;flex:none;margin-right:4px">当前</span>' : '')
    + '<button class="hs-lat-btn" data-test="' + esc(name) + '" style="padding:2px 8px;font-size:.66rem;flex:none;margin-right:4px">测</button>'
    + '<span class="hs-lat" style="color:' + (cls === 'g' ? '#66bb6a' : cls === 'y' ? '#ffb74d' : cls === 'r' ? '#e57373' : '#5b6270') + ';font-size:.7rem;flex:none;min-width:40px;text-align:right">' + (last ? last + 'ms' : '—') + '</span>'
    + (hsUdpRun && HS_UDP_NODE[name] !== undefined ? (HS_UDP_NODE[name] > 0 ? '<span class="hs-udp" style="color:#66bb6a;font-size:.66rem;flex:none;min-width:22px;text-align:right" title="UDP 实测通过(tunnels 真实转发往返)">U✓</span>' : '<span class="hs-udp" style="color:#e57373;font-size:.66rem;flex:none;min-width:22px;text-align:right" title="UDP 实测不通(该节点不转发UDP)">U✗</span>') : ((pr && pr.udp) ? '<span class="hs-udp" style="color:#7fc9f2;font-size:.66rem;flex:none;min-width:22px;text-align:right;opacity:.65" title="订阅声明支持UDP(未实测)——点上方🛰️测UDP做真实实测">U</span>' : '<span class="hs-udp" style="flex:none;min-width:0"></span>'))
    + '</div>';
  });
  h += '</div></div>';
  pane.innerHTML = h;
  const smgr = pane.querySelector('#hs_node_submgr'); if (smgr) smgr.onclick = () => openMgr('sub'); /* v1.8.0:订阅管理下沉「更多」,节点页留直达入口 */
  pane.querySelectorAll('[data-mode]').forEach(b => b.onclick = async () => { if (b.dataset.mode !== C.mode) { await switchMode(b.dataset.mode); await wait(800) } refreshNodePane() });
  pane.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { hsCurGroup = b.dataset.g; hsUdpRun = false; refreshNodePane() });
  pane.querySelectorAll('.hs-lat-btn').forEach(btn => btn.onclick = async (ev) => {
    ev.stopPropagation();
    const n = btn.dataset.test;
    btn.disabled = true; btn.textContent = '…';
    /* 单节点端点对新版 mihomo 不可用(订阅节点404),借组测速取结果,顺带刷新全组 */
    const map = await groupDelay();
    applyDelayMap(map, realNodes);
    const el = pane.querySelector('[data-node="' + CSS.escape(n) + '"] .hs-lat');
    if (el && !map) { el.textContent = '测速失败'; el.style.color = '#e57373' }
    btn.disabled = false; btn.textContent = '测';
  });
  pane.querySelectorAll('[data-node]').forEach(r => r.onclick = async () => {
    if (r.dataset.node === g.now && settable) return;
    /* 直选节点: 从任意子组点击节点 → 切到🚀主组指定该节点(手动模式)——测试者快速换节点用 */
    let target = hsCurGroup;
    if (C.policySrc === 'direct') { toast('订阅直通模式:请在订阅组内直接切换(select 组点选即生效)', 'pink'); return }
    if (!settable) {
      target = '🚀 节点选择';
      C.mode = 'manual'; C.pausedAuto = true; await saveConf();
      const yml = genConfigYaml();
      if (yml === null) { toast('⚠️ 订阅解析失败,跳过配置兜底重写(旧配置保留)', 'red') }
      else { await writeFile(CFG, yml); await apiPut('/configs?force=true', { path: '', payload: yml }); }
      await wait(500);
    }
    let ok = await apiPut('/proxies/' + encodeURIComponent(target), { name: r.dataset.node });
    if (!ok) ok = await apiPut('/proxies/' + target, { name: r.dataset.node });
    toast(ok ? (settable ? '✅ 已切换到 ' : '✅ 已直选 ') + r.dataset.node : '切换失败', ok ? 'green' : 'red');
    if (ok) await opLog('节点' + (settable ? '切换' : '直选') + ': ' + target + ' → ' + r.dataset.node);
    refreshNodePane();
  });
  const tst = $('#hs_node_test');
  tst.onclick = async () => {
    if (tst.disabled) return;
    tst.disabled = true; tst.textContent = '⏳ 测速中';
    realNodes.forEach(n => {
      const row = pane.querySelector('[data-node="' + CSS.escape(n) + '"]');
      const el = row ? row.querySelector('.hs-lat') : null;
      if (el) { el.textContent = '…'; el.style.color = '#b3bdcb'; el.title = '' }
    });
    const map = await groupDelay();
    applyDelayMap(map, realNodes);
    tst.disabled = false; tst.textContent = '⚡ 测全部';
    toast(map ? '✅ 组测速完成(' + realNodes.length + ' 节点,引擎并发)' : '❌ 组测速失败(详见控制台)', map ? 'green' : 'red');
  };
  $('#hs_node_rf').onclick = refreshNodePane;
  /* v2.7.0 🛰️测UDP 重写: 旧版 groupDelay('udp://8.8.8.8:53') 从未生效(引擎仅认 http/https,
     源码实证)恒报全组 U✗ 误导;改为 tunnels 临时隧道对当前选中节点做真实 UDP 往返实测
     (注入→DNS 探测→恢复,内存热重载不动盘上配置),结果写 HS_UDP_NODE 胶囊实时更新 */
  const udpBtn = $('#hs_node_udp');
  if (udpBtn) udpBtn.onclick = async () => {
    if (udpBtn.disabled) return;
    const cur = g.now || realNodes[0];
    if (!cur) { toast('无节点可测', 'pink'); return }
    udpBtn.disabled = true; udpBtn.textContent = '⏳ 实测中…';
    const r = await probeUdpViaTunnel(cur);
    if (r.why) toast('❌ ' + r.why, 'red');
    else {
      HS_UDP_NODE[cur] = r.ok ? 1 : 0; hsUdpRun = true;
      const el = pane.querySelector('[data-node="' + CSS.escape(cur) + '"] .hs-udp');
      if (el) {
        el.textContent = r.ok ? 'U✓' : 'U✗';
        el.style.color = r.ok ? '#66bb6a' : '#e57373';
        el.style.minWidth = '22px'; el.style.textAlign = 'right';
        el.removeAttribute('title');
      }
      toast(r.ok ? '✅ 「' + cur + '」UDP 实测通过(DNS 经隧道真实往返)' : '❌ 「' + cur + '」UDP 不通(该节点不转发游戏类 UDP)', r.ok ? 'green' : 'red', 4500);
      await opLog('UDP实测(tunnels)「' + cur + '」: ' + (r.ok ? '通过' : '不通'));
    }
    udpBtn.disabled = false; udpBtn.textContent = '🛰️ 测UDP';
  };
  /* 打开节点页静默触发一次组测速(60s 冷却防频繁刷新),延迟数字自动浮现 */
  if (Date.now() - hsGrpTestAt > 60000) {
    hsGrpTestAt = Date.now();
    groupDelay().then(m => { if (m) applyDelayMap(m, realNodes) });
  }
  } catch (e) {
    console.error('[小海关] 节点页错误:', e);
    const _p = $('#hs_mgr_pane');
    if (_p) { _p.classList.remove('hs-node-mode'); _p.innerHTML = '<div style="padding:20px;text-align:center;color:#e57373;font-size:.8rem">节点页加载失败:' + esc(e.message || e) + '</div>' }
  }
}

/* ================= 配置弹窗(五页签) ================= */
let hsTab = 'ov';
let HS_OV_RF_AT = 0; /* v1.8.5: 总览刷新冷却时间戳(模块级,防重渲染击穿) */
/* v1.8.1(真机反馈):二级页下钻多一次点击,订阅/设置/日志恢复顶部页签直达;设备保持并入分流,「更多」退役 */
const HS_TABS = ['ov', 'split', 'node', 'sub', 'set', 'log'];
function openMgr(t) { hsTab = (HS_TABS.indexOf(t) >= 0) ? t : 'ov';
  if (hsTab === 'log' && !C.logEnabled) hsLogTab = 'op'; /* v2.0.3: 运行日志关闭时打开日志页直接看操作日志 */
  mShow('hs_modal_mgr'); renderMgrTabs(); renderPane(); renderMgrFoot(); maybePopUpgradeCard() }
function renderMgrTabs() {
  $$('#hs_mgr_tabs button[data-t]').forEach(b => {
    b.classList.toggle('on', b.dataset.t === hsTab);
    b.onclick = async () => { if (!(await guardLeaveSet())) return; if (hsTab === 'log') stopLogTimer(); hsTab = b.dataset.t; renderMgrTabs(); renderPane(); renderMgrFoot() };
  });
}
async function renderPane() {
  const p = $('#hs_mgr_pane');
  const fnMap = { ov: paneOv, sub: paneSub, split: paneSplit, set: paneSet, log: paneLog };
  if (hsTab === 'node') { await refreshNodePane(); return }
  if (hsTab === 'dev') { await refreshDevPane(); return }
  p.classList.remove('hs-node-mode');
  const html = await fnMap[hsTab]();
  /* 含 pghead 的页面拆分: 头固定在外、余下进滚动区 */
  const hi = html.indexOf('<div class="hs-pghead"');
  const hj = hi >= 0 ? html.indexOf('</div>', hi) + 6 : -1;
  if (hi === 0 && hj > 0) {
    p.innerHTML = html.slice(0, hj) + '<div class="hs-pgscroll">' + html.slice(hj) + '</div>';
  } else {
    p.innerHTML = '<div class="hs-pgscroll">' + html + '</div>';
  }
  bindPane(hsTab, p);
  /* 分流页尾部的「接入设备」区:独立渲染函数填充(设备采集是异步,不阻塞规则区首屏) */
  if (hsTab === 'split') refreshDevPane();
}
function s1Txt() {
  const n = C.devices.filter(d => d.proxy).length;
  return { off: '关', all: '全部终端', white: '白名单(' + n + ' 台)' }[C.s1] || '关';
}
function proxyModeTxt() {
  if (!ST.running) return ST.residue ? '⚠️ 异常:规则残留待还原' : '未接管 · 全部直连';
  return ({ off: '未接管 · 全部直连', all: '透明接管 · 全部终端', white: '透明接管 · 白名单(' + C.devices.filter(d => d.proxy).length + ' 台)' })[C.s1]
    + (C.s2 ? ' · 本机走代理' : '') + ' · 手动口 ' + C.ports.mixed;
}
/* v2.7.24 总览页接入设备区独立渲染: ⟳局部刷新只换本区容器,不整页重渲染(用户定调);
   空态返回空串(引擎停/无连接时容器置空) */
function ovDevSecHtml(cs) {
  if (!(ST.running && cs && cs.byDev && cs.byDev.length)) return '';
  return '<div class="hs-sec"><h4>接入设备 <span class="hs-hint">按流量排序 · 点击展开活动连接</span><span class="hs-act" id="hs_dev_rf" style="margin-left:auto" title="重新采集设备与活动连接(仅刷新本区)">⟳</span></h4>'
    + cs.byDev.map((dv, i) =>
        '<div style="margin-bottom:6px">'
        + '<div class="hs-dev-hd" data-dev="' + i + '" style="display:flex;gap:6px;align-items:baseline;cursor:pointer;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:6px 10px">'
        + '<span style="flex:none">' + dv.icon + '</span>'
        + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.8rem">' + esc(dv.name) + (isPrivacyMac(dv.mac) ? ' <span title="隐私MAC:可能轮换,白名单勾选可能失效,建议关闭设备私有Wi-Fi地址" style="font-size:.72rem;color:#ffcc80">🔒</span>' : '') + '</span>'
        + '<span class="hs-hint" style="flex:none">' + dv.total + '条</span>'
        + '<span class="hs-hint" style="flex:none;min-width:78px;text-align:right">↓' + fmtB(dv.dl) + ' ↑' + fmtB(dv.up) + '</span>'
        + '<span style="flex:none;font-size:.7rem;color:#b3bdcb;transition:transform .2s">▸</span>'
        + '</div>'
        + '<div class="hs-dev-cons" style="display:none;padding:4px 4px 2px 10px">'
        + '<div class="hs-hint" style="padding:2px 6px 4px;font-size:.64rem">目标=网关实际去向;终端若自带代理客户端,这里只能看到其隧道目标(如机场入口域名),真实访问的网站在它的内层</div>'
        + dv.conns.map((t, ci) => {
          const short = chainToShort(t.chain);
          const inForce = (C.force || []).some(x => x && x.v === t.host);
          const inExcl = (C.exclude || []).some(x => x && x.v === t.host);
          const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(t.host) || t.host.includes(':');
          return '<div class="hs-li" style="padding:4px 6px">'
          + '<div data-connmore="' + ci + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.72rem;cursor:pointer">' + esc(t.host) + (t.n > 1 ? ' <span class="hs-hint">×' + t.n + '条</span>' : '') + '</div>'
          + '<div data-connmore="' + ci + '" style="display:flex;align-items:center;gap:6px;margin-top:2px;cursor:pointer">'
          + '<span style="flex:none;font-size:.66rem;color:' + (t.chain === 'DIRECT' ? '#66bb6a' : '#7fc9f2') + '">' + esc(short.label) + '</span>'
          + '<span class="hs-hint" style="flex:1;font-size:.64rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + short.more + '</span>'
          + '<span class="hs-hint" style="flex:none;font-size:.66rem">' + fmtB(t.dl) + '</span>'
          + '<span style="flex:none;font-size:.6rem;color:#b3bdcb;transition:transform .15s">▸</span>'
          + '</div>'
          + '<div data-connfull="' + ci + '" style="display:none;padding:4px 6px;margin-top:3px;background:rgba(79,140,255,.06);border-left:2px solid rgba(79,140,255,.3);border-radius:0 6px 6px 0;font-size:.66rem">'
          + '<div class="hs-hint">节点: ' + esc(t.chain || '—') + '</div>'
          + '<div class="hs-hint">规则: ' + esc(t.rule || '—') + '</div>'
          + '<div class="hs-hint">↑' + fmtB(t.up) + ' ↓' + fmtB(t.dl) + '</div>'
          + '<div style="display:flex;gap:6px;margin-top:6px">'
          + '<button class="btn hs-sm hs-act" data-connforce="' + ci + '" data-host="' + esc(t.host) + '" data-isip="' + isIP + '"' + (inForce ? ' disabled' : '') + '>' + (inForce ? '✅ 已设置' : '🛫 走代理') + '</button>'
          + '<button class="btn hs-sm hs-act" style="border-color:rgba(102,187,106,.55);background:rgba(102,187,106,.10);color:#8fe39a" data-connexcl="' + ci + '" data-host="' + esc(t.host) + '" data-isip="' + isIP + '"' + (inExcl ? ' disabled' : '') + '>' + (inExcl ? '✅ 已设置' : '⚡ 走直连') + '</button>'
          + '</div>'
          + '</div></div>';
        }).join('')
        + '</div></div>').join('')
      + '</div>';
}
/* 设备区事件绑定(可重入: 整页渲染后与⟳局部刷新后各调一次) */
function bindOvDev(scope) {
  scope.querySelectorAll('.hs-dev-hd').forEach(hd => hd.onclick = () => {
    const cons = hd.parentElement && hd.parentElement.querySelector('.hs-dev-cons');
    const chev = hd.querySelector(':scope > span:last-child'); /* v2.8.4: 直接子级箭头——隐私徽章是名字span内嵌span,此前误选到徽章不旋转 */
    if (!cons) return;
    const open = cons.style.display !== 'none';
    cons.style.display = open ? 'none' : 'block';
    if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
  });
  scope.querySelectorAll('[data-connmore]').forEach(el => el.onclick = (e) => {
    if (e.target.closest('button')) return;
    const full = el.parentElement.querySelector('[data-connfull]');
    const chev = el.querySelector(':scope > span:last-child');
    if (!full) return;
    const open = full.style.display !== 'none';
    full.style.display = open ? 'none' : 'block';
    if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
  });
  const connQuickAdd = async (btn, list, label) => {
    if (btn.disabled) return;
    const host = btn.dataset.host || '';
    const isIP = btn.dataset.isip === 'true';
    const entry = isIP
      ? { m: 'cidr', v: host.includes(':') ? host + '/128' : host + '/32' }
      : { m: 'suffix', v: host };
    C[list] = C[list] || [];
    if (C[list].some(x => x && x.v === entry.v)) { toast('已设为' + label + ': ' + host, 'green'); return }
    C[list].push(entry);
    await saveConf();
    if (ST.running) { await applyWithTxn(label + '「' + host + '」'); }
    else { toast('已设为' + label + ': ' + host + '(引擎未运行,下次启动生效)', 'green'); return }
    toast('已设为' + label + ': ' + host, 'green');
    btn.textContent = '✅ 已设置'; btn.disabled = true;
  };
  scope.querySelectorAll('[data-connforce]').forEach(b => b.onclick = () => connQuickAdd(b, 'force', '走代理'));
  scope.querySelectorAll('[data-connexcl]').forEach(b => b.onclick = () => connQuickAdd(b, 'exclude', '走直连'));
}
/* ---- 总览 ---- */
async function paneOv() {
  let cs = null;
  if (ST.running) cs = await getConnectionStats();
  return '<div class="hs-pghead"><button class="btn hs-sm" id="hs_ov_rf">⟳ 刷新</button><span class="hs-hint" style="font-size:.64rem">更新于 ' + (HS_LAST_RF || '—') + '</span></div>'
  + ((ST.upgradePending && ST.upgradePending.length)
    ? '<div style="margin:0 2px 8px;padding:8px 12px;border:1px solid #ffb74d;border-radius:10px;background:rgba(255,183,77,.08)">'
      + '<div style="font-size:.78rem;color:#ffb74d;font-weight:600">⬆️ 待升级: ' + esc(ST.upgradePending.join('/')) + ' → ' + V + '</div>'
      + '<div class="hs-hint" style="margin-top:2px">盘上接管组件为旧版(' + esc(ST.upgradeFrom || '?') + '),新版能力需重启引擎生效——一次重启即完成(几秒,期间接管短暂中断)</div>'
      + '<div style="margin-top:6px"><button class="btn hs-sm hs-pri" id="hs_upg_view">查看更新并升级</button></div></div>'
    : '')
  + ((C.upgBackup && !C.upgBackup.rolledBack)
    ? '<div style="margin:0 2px 8px;padding:6px 12px;border:1px dashed rgba(255,255,255,.18);border-radius:10px">'
      + '<div style="font-size:.72rem;display:flex;align-items:center;gap:6px">📦 升级备份: ' + esc(C.upgBackup.from) + ' 组件(' + esc(C.upgBackup.time || '') + ',3 天后自动清理)<button class="btn hs-sm hs-btn-xs hs-btn-right" id="hs_bak_clean">清理</button></div>'
      + '<div style="margin-top:4px"><button class="btn hs-sm hs-dgr" id="hs_upg_rollback">↩️ 回滚到 ' + esc(C.upgBackup.from) + '</button></div></div>'
    : '')
  + '<div class="hs-sec"><h4>当前状态</h4>'
  + '<div class="hs-li">' + (ST.running ? '<span style="color:#66bb6a">● 运行中</span>' + (C.ver ? ' · v' + esc(C.ver) : '') + (ST.rss ? ' · 内存 ' + (ST.rss / 1024).toFixed(0) + ' MB' : '') + (ST.conn ? ' · 连接 ' + ST.conn + ' 条' : '') + (ST.kb ? ' · ' + (ST.kb / 1024).toFixed(1) + 'MB 目录' : '') : (ST.residue ? '<span style="color:#e57373">● 异常:规则残留</span>' : '<span style="color:#b3bdcb">● 已停止</span>')) + '</div>'
  + '<div class="hs-li">代理方式:' + esc(proxyModeTxt()) + '</div>'
  + '<div class="hs-li">节点模式:' + (ST.running ? esc(({ auto: '♻️ 自动选优', balance: '⚖️ 负载均衡', fallback: '🪜 故障转移', manual: '✋ 手动锁定' })[C.mode] || '—') + (C.pausedAuto ? '(已暂停→手动)' : '') : '—') + '</div>'
  + '</div>'
  + '<div id="hs_ov_dev">' + ovDevSecHtml(cs) + '</div>'
  + '<div class="hs-sec"><h4>开关</h4>'
  + '<div class="hs-row"><div class="hs-sl"><div class="hs-st">终端代理</div><div class="hs-sd">连上这台设备的手机电脑,勾选的自动走代理</div></div>'
  + '<div class="hs-sc"><div class="hs-seg" id="hs_seg_s1">'
  + '<button data-v="off" class="' + (C.s1 === 'off' ? 'on' : '') + '">关</button>'
  + '<button data-v="all" class="' + (C.s1 === 'all' ? 'on' : '') + '">全部</button>'
  + '<button data-v="white" class="' + (C.s1 === 'white' ? 'on' : '') + '">白名单</button>'
  + '</div></div></div>'
  + '<div class="hs-row"><div class="hs-sl"><div class="hs-st">本机代理 <button class="hs-act' + (C.s2Keep ? '' : ' warn') + '" id="hs_s2keep">' + (C.s2Keep ? '⏱ ' + C.s2Keep + '分钟' : '⚠ 常开') + '</button></div><div class="hs-sd">' + (C.s2Keep ? '设备自身流量走代理,开启后 ' + C.s2Keep + ' 分钟自动关闭(保面板)' : '设备自身流量走代理;⚠ 一直开启:面板出站将耦合进引擎,引擎异常会波及面板') + '</div></div>'
  + '<div class="hs-sc"><label class="hs-sw"><input type="checkbox" id="hs_sw_s2" ' + (C.s2 ? 'checked' : '') + '><span></span></label></div></div>'
  + '</div>'
  + '<div class="hs-sec"><h4>手动代理参数 <span class="hs-hint">终端手动配置用,HTTP/SOCKS5 自动识别</span></h4>'
  + (ST.running
    ? '<div class="hs-cpr"><span><b>' + esc(lanIP() + ':' + C.ports.mixed) + '</b> <span class="hs-hint">一行式</span></span><button class="btn hs-sm" data-copy="' + esc(lanIP() + ':' + C.ports.mixed) + '">复制</button></div>'
    + '<div class="hs-cpr"><span>服务器 <b>' + esc(lanIP()) + '</b></span><button class="btn hs-sm" data-copy="' + esc(lanIP()) + '">复制</button></div>'
    + '<div class="hs-cpr"><span>端口 <b>' + C.ports.mixed + '</b></span><button class="btn hs-sm" data-copy="' + C.ports.mixed + '">复制</button></div>'
    : '<div class="hs-hint">引擎未运行,启动后此处显示可复制参数</div>')
  + '</div>'
  /* v2.1.9: 状态页尾部新手引导条(用户反馈:标题行孤立图标不自达意)——原生 btn 样式,文字自明 */
  + '<div style="margin:10px 2px 2px;padding:10px 12px;border:1px dashed rgba(127,201,242,.28);border-radius:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
  + '<span style="font-size:.72rem;color:#b3bdcb">❓ 第一次使用小海关?</span>'
  + '<button class="btn hs-sm" id="hs_ov_guide" style="margin-left:auto">📖 图文使用说明</button>'
  + '</div>';
}
/* ---- 订阅 ---- */
/* ===== 手动节点(providers/manual.yaml,type:file 接入同一组链) ===== */
const b64u = t => { try { return decodeURIComponent(escape(atob(String(t).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(t).length + 3) % 4)))) } catch (e) { return '' } };
/* 解析单个分享链接(ss/vmess/trojan) → mihomo 节点对象;null=不支持 */
function parseNodeUri(raw) {
  const uri = raw.trim();
  try {
    if (/^vmess:\/\//i.test(uri)) {
      const j = JSON.parse(b64u(uri.slice(8)));
      if (!j.add || !j.id) return null;
      const n = { name: j.ps || (j.add + ':' + j.port), type: 'vmess', server: j.add, port: +j.port, uuid: j.id, alterId: +(j.aid || 0), cipher: j.scy || 'auto', udp: true };
      if (j.tls === 'tls') { n.tls = true; if (j.sni || j.host) n.servername = j.sni || j.host }
      if (j.net && j.net !== 'tcp') {
        n.network = j.net;
        if (j.net === 'ws') { n['ws-opts'] = { path: j.path || '/' }; if (j.host) n['ws-opts'].headers = { Host: j.host } }
        else if (j.path) { n[j.net + '-opts'] = { path: j.path } }
      }
      return n;
    }
    if (/^ss:\/\//i.test(uri)) {
      let body = uri.slice(5), name = '';
      const hi = body.indexOf('#'); if (hi >= 0) { name = decodeURIComponent(body.slice(hi + 1)); body = body.slice(0, hi) }
      let methpass, hostport;
      const at = body.lastIndexOf('@');
      if (at >= 0) { methpass = b64u(body.slice(0, at)); hostport = body.slice(at + 1) }
      else { methpass = b64u(body); hostport = '' }
      const mp = (methpass || '').split(':'); const hp = hostport.split(':');
      if (mp.length < 2 || hp.length < 2) return null;
      return { name: name || (hp[0] + ':' + hp[1]), type: 'ss', server: hp[0], port: +hp[1], cipher: mp[0], password: mp.slice(1).join(':'), udp: true };
    }
    if (/^trojan:\/\//i.test(uri)) {
      const u = new URL(uri);
      if (!u.hostname || !u.port) return null;
      const n = { name: decodeURIComponent(u.hash.slice(1)) || (u.hostname + ':' + u.port), type: 'trojan', server: u.hostname, port: +u.port, password: decodeURIComponent(u.username || ''), udp: true };
      const sni = u.searchParams.get('sni'); if (sni) n.sni = sni;
      if (u.searchParams.get('allowInsecure') === '1') n['skip-cert-verify'] = true;
      return n;
    }
  } catch (e) { return null }
  return null;
}
/* 节点对象 → YAML 段(2 空格缩进位) */
function nodeToYaml(n) {
  const L = [];
  L.push('  - name: ' + yamlEsc(n.name));
  L.push('    type: ' + n.type);
  /* I04: server 同样经 yamlEsc——此前裸拼,VMess add 字段含换行即破坏 YAML 结构(注入面与 name 齐平) */
  L.push('    server: ' + yamlEsc(n.server));
  L.push('    port: ' + n.port);
  ['cipher', 'password', 'uuid', 'alterId', 'tls', 'servername', 'sni', 'network', 'skip-cert-verify', 'udp'].forEach(k => {
    if (n[k] === undefined) return;
    L.push('    ' + k + ': ' + (typeof n[k] === 'number' || typeof n[k] === 'boolean' ? n[k] : yamlEsc(n[k])));
  });
  if (n['ws-opts']) {
    L.push('    ws-opts:');
    L.push('      path: ' + yamlEsc(n['ws-opts'].path || '/'));
    if (n['ws-opts'].headers) { L.push('      headers:'); L.push('        Host: ' + yamlEsc(n['ws-opts'].headers.Host)) }
  }
  return L.join('\n');
}
/* 刷新手动节点缓存(文件存在性+节点名) */
async function refreshManual() {
  HS_MANUAL = [];
  const txt = await readFile(DIR + '/providers/manual.yaml');
  if (!txt) return;
  txt.split('\n').forEach(l => {
    /* v1.8.5: 先试转义引号形式(yamlEsc 产出 name: "a\"b"),再退普通形式——此前带转义引号的节点名不计入 */
    let m = l.match(/^\s*-\s*name:\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) { HS_MANUAL.push(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')); return }
    m = l.match(/^\s*-\s*name:\s*"?([^"\n]+)"?\s*$/); if (m) HS_MANUAL.push(m[1]);
  });
}
/* 保存手动节点: 混合 URI(逐行 ss/vmess/trojan) 与 YAML proxies: 片段 */
async function saveManual(text) {
  const txt = String(text || '').trim();
  if (!txt) { /* 清空 */
    await run('rm -f ' + shq(DIR + '/providers/manual.yaml'), 5000);
    HS_MANUAL = []; await saveConfReload('\u624b\u52a8\u8282\u70b9\u5df2\u6e05\u7a7a'); return true;
  }
  let yamlBody = '', okN = 0; const errs = [];
  if (/^proxies:/i.test(txt)) {
    yamlBody = txt.replace(/^proxies:\s*\n?/i, '');
    okN = (yamlBody.match(/^\s*-\s*(name|\{)/gm) || []).length;
    if (!okN) { toast('YAML \u7247\u6bb5\u91cc\u6ca1\u6709\u8282\u70b9\u5b9a\u4e49', 'red'); return false }
  } else {
    const nodes = [];
    txt.split(/[\n\r]+/).forEach((ln, idx) => {
      const t = ln.trim(); if (!t || t.startsWith('#')) return;
      if (/^(ss|vmess|trojan):\/\//i.test(t)) {
        const n = parseNodeUri(t);
        if (n) { nodes.push(n); okN++ } else errs.push('\u7b2c' + (idx + 1) + '\u884c\u4e0d\u652f\u6301/\u89e3\u6790\u5931\u8d25');
      } else errs.push('\u7b2c' + (idx + 1) + '\u884c\u975e\u8282\u70b9\u94fe\u63a5');
    });
    if (!nodes.length) { toast('\u6ca1\u6709\u53ef\u7528\u8282\u70b9:' + (errs[0] || ''), 'red'); return false }
    yamlBody = nodes.map(nodeToYaml).join('\n');
  }
  await run('mkdir -p ' + shq(DIR + '/providers'), 5000);
  const w = await writeFile(DIR + '/providers/manual.yaml', 'proxies:\n' + yamlBody + '\n');
  if (!w) { toast('\u5199\u5165\u5931\u8d25', 'red'); return false }
  await refreshManual();
  await opLog('\u624b\u52a8\u8282\u70b9\u4fdd\u5b58(' + okN + ' \u4e2a)' + (errs.length ? ',' + errs.length + '\u884c\u8df3\u8fc7' : ''));
  await saveConfReload('\u2705 \u624b\u52a8\u8282\u70b9\u5df2\u4fdd\u5b58(' + okN + ' \u4e2a)' + (errs.length ? ',' + errs.slice(0, 2).join(';') : ''));
  return true;
}
/* \u4fdd\u5b58\u540e\u91cd\u5efa config \u5e76\u70ed\u91cd\u8f7d(\u5f15\u64ce\u8fd0\u884c\u65f6) */
async function saveConfReload(msg) {
  if (msg) toast(msg, 'green');
  if (ST.running) {
    await refreshSubRaw(); /* v2.7.0: 融合预热(幂等,缓存命中零开销)——防各链路直达此处时原文缓存缺失 */
    const yaml = genConfigYaml();
    if (yaml === null) { toast('⚠️ 订阅解析失败,未热重载(旧配置保留)', 'red'); await opLog('保存后热重载:订阅解析失败,跳过(旧配置保留)'); return false }
    await writeFile(CFG, yaml);
    const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
    if (!ok) { toast('热重载失败,重启引擎后生效', 'pink'); opLog('热重载失败(引擎运行中,重启后生效)'); return false }
    return true;
  } else if (msg) toast('引擎未运行,下次启动生效', 'pink');
  return false;
}
/* 添加节点弹窗(纯添加,无管理功能) */
/* openAddNodeDlg 已删除(v2.7.11): 与手动节点弹窗功能重复,合并单入口「🔧 自建节点」 */
/* 自建节点管理弹窗(添加+编辑+清空一体) */
function openManualDlg() {
  try {
  console.log('[小海关] 打开手动节点弹窗, 当前节点数:', HS_MANUAL.length);
  const list = HS_MANUAL.length
    ? '<div class="hs-hint" style="margin-bottom:6px">当前 ' + HS_MANUAL.length + ' 个: ' + HS_MANUAL.slice(0, 8).map(esc).join(' / ') + (HS_MANUAL.length > 8 ? ' …' : '') + '</div>'
    : '<div class="hs-hint" style="margin-bottom:6px">当前无手动节点</div>';
  hsOpenSimple('🔧 自建节点',
    list
    + '<textarea id="hs_manual_ta" placeholder="每行一个节点链接(ss:// vmess:// trojan://)；\n或粘贴 YAML 片段(proxies: 开头,适用全协议)\n保存后自动并入节点组" style="width:100%;height:34vh;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:8px;font-size:.72rem;font-family:Menlo,Consolas,monospace;resize:vertical;box-sizing:border-box"></textarea>'
    + '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn hs-pri" id="hs_manual_save">保存并生效</button><button class="btn hs-dgr" id="hs_manual_clear">清空全部</button></div>');
  $('#hs_manual_save').onclick = async () => {
    const btn = $('#hs_manual_save'); btn.disabled = true; btn.textContent = '保存中…';
    const ok = await saveManual($('#hs_manual_ta').value);
    if (ok) { mHide('hs_modal_simple'); renderPane() } else { btn.disabled = false; btn.textContent = '保存并生效' }
  };
  $('#hs_manual_clear').onclick = async () => {
    const okc = await confirmBox({ title: '清空手动节点', html: '<div class="hs-hint">删除全部手动节点(manual.yaml),订阅节点不受影响。</div>', okText: '清空', danger: true });
    if (!okc) return;
    await saveManual(''); mHide('hs_modal_simple'); renderPane();
  };
  } catch (e) { toast('手动节点弹窗异常:' + esc(String((e && e.message) || e).slice(0, 60)), 'red'); console.error('[小海关] openManualDlg:', e) }
}
/* 订阅信息(余量/到期,从 provider 文件的 info 节点名解析;异步刷新后重绘) */
/* 流量展示(v2.7.13): 所有档位统一两位小数去尾零,仅数值过大才换算单位(用户定调) */
function humanGB(gb) {
  if (!gb || gb <= 0 || !isFinite(gb)) return '';
  const fmt = v => { const s = v.toFixed(2); return s.replace(/\.?0+$/, '') };
  if (gb >= 1024) return fmt(gb / 1024) + ' TB';
  if (gb >= 1) return fmt(gb) + ' GB';
  return fmt(gb * 1024) + ' MB';
}
async function refreshSubInfo() {
  /* v2.7.0: 全订阅信息(Clash Verge 式订阅卡流量/到期)——每个订阅独立解析显示在订阅界面,
   节点页不再展示(融合后"显示哪个订阅的"有歧义,用户产品决策);
   解析源=各订阅 provider 文件 info 节点(grep 局部行,防大文件全量回传截断),
   激活订阅另走 /proxies 兜底(引擎明文节点名);输出 =Si= 分段标记 */
  if (!C.subs.length) { HS_SUBINFO_ALL = undefined; return }
  let cmd = '';
  C.subs.forEach((sb, i) => {
    if (!sb || !sb.url) return;
    const F = shq(DIR + '/providers/sub' + i + '.yaml');
    cmd += 'echo =S' + i + '=; '
      + "grep -aoE .{0,8}(\u5269\u4f59\u6d41\u91cf|\u6d41\u91cf[:：]|%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F).{0,44} " + F + " 2>/dev/null | head -3; "
      + "grep -aoE .{0,8}(\u5957\u9910\u5230\u671f|\u5230\u671f\u65f6\u95f4|\u957f\u671f|\u6c38\u4e45|%E5%A5%97%E9%A4%90%E5%88%B0%E6%9C%9F).{0,44} " + F + " 2>/dev/null | head -3; "
      + 'echo =N' + i + "=$(grep -cE '^ *- *\\{? *name:' " + F + ' 2>/dev/null); ';
  });
  const parseFlow = s => { const m = /([0-9.]+)\s*(TB|GB|MB|KB)/i.exec(String(s || '')); if (!m) return null; const v = parseFloat(m[1]); if (isNaN(v)) return null; const u = m[2].toUpperCase(); return { gb: u === 'TB' ? v * 1024 : u === 'GB' ? v : u === 'MB' ? v / 1024 : v / 1048576, raw: v + ' ' + u } };
  const out = {};
  if (cmd) {
    const gr = await run(cmd, 15000);
    let cur = -1;
    String(gr.content || '').split('\n').forEach(l => {
      const mk = /^=S(\d+)=$/.exec(l.trim());
      if (mk) { cur = +mk[1]; out[cur] = { left: '', expire: '', usedGB: 0, totalGB: 0, days: null, forever: false, nodes: null }; return }
      const nk = /^=N(\d+)=(\d+)$/.exec(l.trim());
      if (nk) { if (out[+nk[1]]) out[+nk[1]].nodes = +nk[2]; return }
      if (cur < 0) return;
      let txt = l;
      try { const dec = decodeURIComponent(txt); if (dec !== txt) txt = dec + '\n' + txt } catch (e) { }
      const e0 = out[cur] || (out[cur] = { left: '', expire: '', usedGB: 0, totalGB: 0, days: null, forever: false });
      const m1 = txt.match(/剩余流量[：:]\s*([0-9.]+\s*[TGGM]?B?)/);
      const m2 = txt.match(/(?:套餐到期|到期时间|expire)[：:]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
      /* 流量: 9550GB / 10000GB 或 流量：9550 GB|10000 GB(已用/总量形态) */
      const m3 = txt.match(/流量[：:]\s*([0-9.]+\s*[TGGM]?B)\s*[/|]\s*([0-9.]+\s*[TGGM]?B)/);
      if (/长期|永久/.test(txt)) e0.forever = true;
      if (m1 && !e0.left) { const pf = parseFlow(m1[1]); e0.left = pf ? pf.raw : m1[1]; if (pf) { e0.leftGB = pf.gb } }
      if (m3) { const pu = parseFlow(m3[1]); const pt = parseFlow(m3[2]); if (pu) { e0.usedGB = pu.gb; e0.usedTxt = pu.raw } if (pt) { e0.totalGB = pt.gb; e0.totalTxt = pt.raw } }
      if (m2 && !e0.expire) {
        e0.expire = m2[1];
        const ts = new Date(m2[1] + 'T23:59:59');
        if (!isNaN(ts)) e0.days = Math.ceil((ts - Date.now()) / 86400000);
      }
    });
  }
  /* 激活订阅 /proxies 兜底(引擎明文节点名,文件里 grep 不到时) */
  if (ST.running && C.activeSub >= 0 && C.subs[C.activeSub] && out[C.activeSub] && !out[C.activeSub].left && !out[C.activeSub].expire) {
    const d = await apiGet('/proxies');
    if (d && d.proxies) {
      for (const k of Object.keys(d.proxies)) {
        if (/剩余流量|套餐到期|到期时间|流量[:：]/.test(k)) {
          const m1 = k.match(/剩余流量[：:]\s*([0-9.]+\s*[TGGM]?B)/);
          const m2 = k.match(/(?:套餐到期|到期时间|expire)[：:]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
          const m3 = k.match(/流量[：:]\s*([0-9.]+\s*[TGGM]?B)\s*[/|]\s*([0-9.]+\s*[TGGM]?B)/);
          const cur0 = out[C.activeSub] || (out[C.activeSub] = { left: '', expire: '', usedGB: 0, totalGB: 0, days: null, forever: false });
          if (m1 && !cur0.left) { const pf = parseFlow(m1[1]); cur0.left = pf ? pf.raw : m1[1]; if (pf) cur0.leftGB = pf.gb }
          if (m3) { const pu = parseFlow(m3[1]); const pt = parseFlow(m3[2]); if (pu) { cur0.usedGB = pu.gb; cur0.usedTxt = pu.raw } if (pt) { cur0.totalGB = pt.gb; cur0.totalTxt = pt.raw } }
          if (m2 && !cur0.expire) { cur0.expire = m2[1]; const ts = new Date(m2[1] + 'T23:59:59'); if (!isNaN(ts)) cur0.days = Math.ceil((ts - Date.now()) / 86400000) }
          if (/长期|永久/.test(k)) cur0.forever = true;
          if (m1 || m2 || m3) break;
        }
      }
    }
  }
  Object.keys(out).forEach(i => { const e = out[i]; if (!e.left && !e.expire && !e.totalGB && !e.forever) delete out[i] }); /* 无任何信息订阅不存 */
  HS_SUBINFO_ALL = out;
}

/* 订阅时龄(小时);time 格式 YYYY-MM-DD HH:mm */
function subAgeH(t) {
  if (!t) return -1;
  const p = t.split(/[- :]/).map(Number);
  if (p.length < 5 || p.some(isNaN)) return -1;
  return Math.floor((Date.now() - new Date(p[0], p[1] - 1, p[2], p[3], p[4]).getTime()) / 36e5);
}
/* 是否有自定义过滤规则(非全默认)——订阅卡「⚙已过滤」徽章显示条件(v2.7.0) */
function subFilterCustom(f) {
  const n = normSubFilter(f);
  return !n.autoInfo || !n.autoTransit || n.kws.length > 0 || Object.keys(n.regions).some(k => n.regions[k] === false);
}
function paneSub() {
  /* v2.7.17 布局定稿: pghead 置首(拆出滚动区——卡片多时可滚) + 融合开关上移顶部;
     融合开时语义切换: 全部订阅生效,激活卡=「⭐规则基准」(提供分流规则),不再是「唯一使用中」 */
  const fuseOn = C.subFusion && C.policySrc === 'merge';
  let h = '<div class="hs-pghead">'
  + '<button class="btn hs-sm hs-pri" id="hs_sub_newbtn">＋ 添加订阅</button>'
  + '<button class="btn hs-sm" id="hs_sub_manual" title="自己填的服务器节点(区别于订阅拉取),支持链接粘贴与YAML片段">🔧 自建节点(' + HS_MANUAL.length + ')</button>'
  + '<span style="flex:1"></span>'
  + '<span style="display:inline-flex;align-items:center;gap:6px;font-size:.72rem;color:' + (fuseOn ? '#8fe39a' : '#b3bdcb') + '" title="开启后(合并模式)全部订阅节点合并进池,加[订阅名]前缀;分流规则跟基准订阅走">🔀 融合'
  + '<label class="hs-sw"><input type="checkbox" id="hs_sub_fusion" ' + (C.subFusion ? 'checked' : '') + (C.policySrc !== 'merge' ? ' disabled' : '') + '><span></span></label></span>'
  + '</div>'
  + '<div class="hs-hint" style="margin:0 0 8px;font-size:.66rem">' + (fuseOn
    ? '✅ 融合中——全部订阅节点已合并生效;⭐基准订阅提供分流规则(点卡片「设为规则基准」可切换)'
    : (C.policySrc !== 'merge' ? '融合仅「合并」策略可用(当前:' + ({ self: '自建', merge: '合并', direct: '直通' })[C.policySrc] + ');同一时间仅一个订阅生效' : '同一时间仅一个订阅生效;开启🔀融合后全部订阅节点合并')) + '</div>';
if (!C.subs.length && !HS_SUB_NEW) h += '<div class="hs-hint" style="margin-bottom:8px">暂无订阅,点下方「＋ 添加订阅」创建</div>';
  /* v2.7.8 新建卡: 在列表顶部插入(替代底部常驻表单,用户定调) */
  if (HS_SUB_NEW) h += subEditCardHtml(-1, null);
  C.subs.forEach((sb, i) => {
    if (i === HS_SUB_EDIT) { h += subEditCardHtml(i, sb); return } /* v2.7.8 就地编辑: 卡片直接变编辑态(不再跳到底部表单) */
    const age = subAgeH(sb.time);
    const stale = age > 24;
    /* v2.7.4 元信息双源合成: subscription-userinfo 头(精确字节/时间戳,Verge 同源)优先,
       订阅 info 节点文本(HS_SUBINFO_ALL)兑底;统一换算成卡片渲染字段 left/total/used GB+days+forever */
    const ui = sb.ui && (sb.ui.total > 0 || sb.ui.expire || sb.ui.forever) ? sb.ui : null; /* v2.7.15: 流量或到期任一有值即用 ui(头+文本补抓双源) */
    const fi = HS_SUBINFO_ALL && HS_SUBINFO_ALL[i] ? HS_SUBINFO_ALL[i] : null;
    const info = ui
      ? { leftGB: Math.max(0, (ui.total - ui.up - ui.dl)) / 1073741824, totalGB: ui.total / 1073741824, usedGB: (ui.up + ui.dl) / 1073741824, left: '', expire: ui.expire ? new Date(ui.expire * 1000).toISOString().slice(0, 10) : '', days: ui.expire ? Math.ceil((ui.expire * 1000 - Date.now()) / 86400000) : null, forever: !!ui.forever, nodes: sb.nodes || (fi ? fi.nodes : null), viaHdr: true }
      : fi;
    /* 流量条数据: 已用/总量优先;只有剩余时用 总量-剩余 估算已用(仅剩余+无总量不画条) */
    let fillPct = 0, flowTxt = '';
    if (info && info.totalGB > 0) {
      const usedGB = info.usedGB > 0 ? info.usedGB : (info.leftGB > 0 ? Math.max(0, info.totalGB - info.leftGB) : 0);
      fillPct = Math.min(100, Math.round(usedGB / info.totalGB * 100));
      /* v2.7.16 定稿: 进度条下一行三数并排(已用/剩余/总量),剩余不再单独占位 */
      flowTxt = '已用 ' + humanGB(usedGB) + ' · 剩余 ' + humanGB(Math.max(0, info.totalGB - usedGB)) + ' · 总量 ' + humanGB(info.totalGB);
    } else if (info && info.left) {
      flowTxt = '剩余 ' + esc(info.left);
    }
    const hot = fillPct >= 90;
    /* 到期展示: 还剩N天(大字)+日期(小字);≤7天红 ≤30天蓝;长期绿徽章;无则不显示 */
    /* 到期展示(v2.7.5 用户定稿): 右上角——长期有效绿徽章/日期+剩余天数;≤7天红 */
    let expireHtml = '';
    if (info && info.forever && !info.expire) expireHtml = '<span style="flex:none;font-size:.68rem;color:#8fe39a;border:1px solid rgba(102,187,106,.45);border-radius:6px;padding:2px 9px">长期有效</span>';
    else if (info && info.expire) {
      const d = info.days;
      const col = d == null ? '#b3bdcb' : d <= 7 ? '#e57373' : d <= 30 ? '#7fc9f2' : '#b3bdcb';
      const dTxt = d == null ? esc(info.expire) : d <= 0 ? '已到期' : esc(info.expire) + ' · 还剩' + (d >= 30 ? Math.round(d / 7) + '周' : d + '天');
      expireHtml = '<span style="flex:none;font-size:.68rem;color:' + col + ';border:1px solid ' + (d != null && d <= 7 ? 'rgba(229,115,115,.5)' : 'rgba(255,255,255,.18)') + ';border-radius:6px;padding:2px 9px">' + dTxt + '</span>';
    }
    /* v2.7.0 卡片化(原型评审定稿): 左色条激活态/流量条/到期徽章/操作行 */
    /* v2.7.3 PC 宽视图重排(用户二轮 UI 反馈): 名称不截断(PC 宽度足够)、字号整体放大、
       已过滤降级到 meta 行小字(不再抢头部)、按钮全带文字、间距舒适化 */
    h += '<div class="hs-subcard ' + (i === C.activeSub ? 'active' : 'standby') + '"' + (i === C.activeSub ? ' style="background:rgba(127,201,242,.04)"' : '') + '>'
    + '<div style="display:flex;align-items:center;gap:8px">'
    + '<span class="hs-dot ' + (i === C.activeSub ? 'g' : 'o') + '" style="flex:none;width:10px;height:10px"></span>'
    + '<span style="font-size:1rem;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sb.name) + '</span>'
    + (i === C.activeSub ? '<span style="flex:none;font-size:.68rem;color:' + (fuseOn ? '#ffb74d' : '#7fc9f2') + ';border:1px solid ' + (fuseOn ? 'rgba(255,183,77,.5)' : 'rgba(127,201,242,.5)') + ';border-radius:6px;padding:2px 9px">' + (fuseOn ? '规则基准' : '使用中') + '</span>' : '')
    + (fuseOn ? '<span style="flex:none;font-size:.68rem;color:#8fe39a;border:1px solid rgba(102,187,106,.45);border-radius:6px;padding:2px 9px">融合中</span>' : '')
    + expireHtml
    + (hot ? '<span style="flex:none;font-size:.68rem;color:#ffb74d;border:1px solid rgba(255,183,77,.45);border-radius:6px;padding:2px 9px">流量将尽</span>' : '')
    + '</div>'
    + '<div class="hs-hint" style="font-size:.7rem;margin:5px 0 3px">' + esc(sb.url.replace(/^(https?:\/\/[^\/]+).*$/, '$1/***')) + '</div>'
    + (fillPct > 0 || flowTxt
      ? '<div class="hs-scbar">' + (fillPct > 0 ? '<div class="hs-scfill' + (hot ? ' hot' : '') + '" style="width:' + fillPct + '%"></div>' : '') + '</div>'
        + '<div style="font-size:.72rem;color:' + (hot ? '#ffb74d' : '#b3bdcb') + ';margin-top:3px">' + flowTxt + '</div>'
      : '')
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:baseline;font-size:.74rem;color:#b3bdcb;margin-top:8px">'
    + '<span>' + (sb.nodes || (info && info.nodes != null && info.nodes > 0 ? info.nodes : 0) || '…') + ' 节点</span>'
    + (subFilterCustom(sb.filter) ? '<span style="opacity:.75">已过滤</span>' : '')
    + '<span>' + esc(sb.time || '') + (stale ? ' <span style="color:' + (age > 72 ? '#e57373' : '#ffb74d') + '">' + (age >= 48 ? Math.floor(age / 24) + '天' : age + 'h') + '未更新</span>' : '') + '</span>'
    + (info && (info.left || info.expire) ? '<span style="opacity:.6;font-size:.64rem">流量/到期为上次更新快照</span>' : '')
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
    + (i === C.activeSub ? '' : '<button class="btn hs-sm ' + (fuseOn ? '' : 'hs-pri') + '" data-subuse="' + i + '" title="' + (fuseOn ? '切换分流规则来源(策略组/分类规则跟它走,节点池不变)' : '切换当前生效订阅') + '">' + (fuseOn ? '设为基准' : '启用') + '</button>')
    + '<button class="btn hs-sm" data-subupd="' + i + '">更新</button>'
    + '<button class="btn hs-sm" data-subflt="' + i + '" title="过滤垃圾节点(信息/中转/关键词/地区)">过滤</button>'
    + '<button class="btn hs-sm" data-subedit="' + i + '">编辑</button>'
    + '<button class="btn hs-sm hs-dgr" data-subdel="' + i + '">删除</button>'
    + '</div></div>';
  });
  /* v2.7.0 多订阅融合开关: 仅合并模式有效(自建无订阅策略/直通单订阅整体生效);开启后全部订阅
     订阅节点合并进池,引擎 override.additional-prefix 加[订阅名]前缀防撞名(v1.19.32 真机 -t 实证) */
  /* v2.7.17: 融合开关已上移 pghead(此底部卡移除);底部仅留概念说明 */
  /* 编辑态表单(v2.7.8 卡片化): 新建/编辑共用一张卡(名称+链接+保存/取消),替代底部常驻表单 */
  h += '<div class="hs-hint" style="margin-top:10px;text-align:center">订阅=从链接批量拉取节点;自建节点=自己填服务器(弹窗内粘贴添加/清空)</div>';
  return h;
}
/* v2.7.8 订阅编辑卡片(新建 i=-1/编辑 i>=0): 名称+链接内嵌卡片就地编辑 */
function subEditCardHtml(i, sb) {
  const isNew = i < 0;
  return '<div class="hs-subcard active" style="border-color:rgba(127,201,242,.4)">'
  + '<div style="font-size:.8rem;font-weight:700;color:#7fc9f2;margin-bottom:8px">' + (isNew ? '新建订阅' : '编辑「' + esc(sb.name) + '」') + '</div>'
  + '<input id="hs_sub_name" placeholder="订阅名称(如:我的机场)" value="' + (sb ? esc(sb.name) : '') + '" style="width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(127,201,242,.35);border-radius:8px;color:#e8eaf0;padding:8px 10px;font-size:.8rem;margin-bottom:7px">'
  + '<input id="hs_sub_url" placeholder="订阅链接 https://..." value="' + (sb ? esc(sb.url) : '') + '" style="width:100%;background:rgba(0,0,0,.35);border:1px solid rgba(127,201,242,.35);border-radius:8px;color:#e8eaf0;padding:8px 10px;font-size:.8rem">'
  + '<div class="hs-hint" style="font-size:.64rem;margin:6px 0 8px">' + (isNew ? '保存后自动下载并生效' : '名称随时可改;链接有变化时保存会重新下载,失败保留原链接') + '</div>'
  + '<div style="display:flex;gap:8px">'
  + '<button class="btn hs-pri" id="hs_sub_add" style="flex:1;padding:8px">' + (isNew ? '保存并下载' : '保存修改') + '</button>'
  + '<button class="btn" id="hs_sub_cancel" style="padding:8px 14px">取消</button>'
  + '</div></div>';
}
/* 订阅节点过滤弹窗(v2.7.0): 规则快照→实时预览→保存热重载;数据源=设备上订阅缓存文件
   (激活订阅用 HS_SUB_RAW 内存缓存,非激活读 providers/subN.yaml);打开一次加载,之后纯前端重算 */
async function openSubFilterDlg(i) {
  const sb = C.subs[i]; if (!sb) return;
  const f = normSubFilter(sb.filter);
  let names = [];
  try {
    const raw = (i === C.activeSub && HS_SUB_RAW) ? HS_SUB_RAW : await readFile(DIR + '/providers/sub' + i + '.yaml');
    names = extractNodeNames(raw);
  } catch (e) { /* 文件读不到→空列表,弹窗提示 */ }
  /* 首次打开: 把订阅里检测到的地区填入 regions(默认勾选保留;已有值不覆盖) */
  const rc = {};
  let otherN = 0;
  names.forEach(n => { const r = subRegionOf(n); if (r) rc[r] = (rc[r] || 0) + 1; else otherN++ });
  Object.keys(rc).forEach(r => { if (f.regions[r] === undefined) f.regions[r] = true });
  if (f.regions['其他'] === undefined) f.regions['其他'] = true; /* v2.7.0: 未识别地区归「其他」,可勾掉排除(用户产品决策) */
  const renderDlg = () => {
    /* v2.7.20 滚动位置保持: 点胶囊切去留后整弹窗重建会丢滚动位置(用户失去目标);
      重建前存两栏 scrollTop,渲染后恢复 */
    const oldL = document.getElementById('hs_pv_left'); const sl = oldL ? oldL.scrollTop : 0;
    const oldR = document.getElementById('hs_pv_right'); const sr = oldR ? oldR.scrollTop : 0;
    let regChips = '';
    Object.keys(rc).sort((a, b) => rc[b] - rc[a]).forEach(r => {
      regChips += '<span class="hs-tag' + (f.regions[r] ? ' y' : '') + '" data-sfr="' + esc(r) + '" style="cursor:pointer;margin:2px">' + (f.regions[r] ? '✓' : '✕') + ' ' + esc(r) + '(' + rc[r] + ')</span>';
    });
    if (otherN) regChips += '<span class="hs-tag' + (f.regions['其他'] ? ' y' : '') + '" data-sfr="其他" style="cursor:pointer;margin:2px">' + (f.regions['其他'] ? '✓' : '✕') + ' 🌐其他(' + otherN + ')</span>';
    let kwHtml = f.kws.map((k, j) => '<span class="hs-tag o" style="margin:2px">' + esc(k) + ' <span data-sfk="' + j + '" style="cursor:pointer;color:#ffb3b3">×</span></span>').join('') || '<span class="hs-hint">无关键词</span>';
    hsOpenSimple('⚙ 节点过滤 · ' + sb.name, ''
    + '<div class="hs-row"><div class="hs-sl"><div class="hs-st">自动识别信息节点</div><div class="hs-sd">过滤「剩余流量/到期/官网/套餐/重置」类信息节点与 ---/【地区】分隔符</div></div><div class="hs-sc"><label class="hs-sw"><input type="checkbox" id="hs_sf_info" ' + (f.autoInfo ? 'checked' : '') + '><span></span></label></div></div>'
    + '<div class="hs-row"><div class="hs-sl"><div class="hs-st">过滤国内中转节点</div><div class="hs-sd">过滤名字含「中转/国内」的节点</div></div><div class="hs-sc"><label class="hs-sw"><input type="checkbox" id="hs_sf_transit" ' + (f.autoTransit ? 'checked' : '') + '><span></span></label></div></div>'
    + '<div class="hs-row" style="align-items:flex-start"><div class="hs-sl"><div class="hs-st">关键词排除</div><div class="hs-sd">节点名包含任一关键词即排除</div><div style="margin-top:6px">' + kwHtml + '</div>'
    + '<input id="hs_sf_kwin" placeholder="输入关键词回车添加" style="width:100%;margin-top:6px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:6px 10px;font-size:.72rem"></div></div>'
    + '<div class="hs-row" style="align-items:flex-start"><div class="hs-sl"><div class="hs-st">地区保留 <span class="hs-hint">(✓=保留 · 点切换;不勾的地区被排除;🌐其他=未识别地区(如广州/自定义命名),勾掉即全部排除)</span></div><div style="margin-top:6px">' + (regChips || '<span class="hs-hint">本订阅未检测到常见地区命名</span>') + '</div></div></div>'
    + '<div id="hs_sf_pv"></div>'
    + '<div class="hs-actions"><button class="btn" id="hs_sf_def">恢复默认</button><button class="btn" id="hs_sf_close">取消</button><button class="btn hs-pri" id="hs_sf_save">保存并生效</button></div>'
    + (names.length ? '' : '<div class="hs-warn" style="margin-top:8px">⚠️ 未读到订阅缓存(节点列表为空)——规则仍可设置,订阅下载后生效</div>'));
    const pv = previewSubFilter(names, f);
    const pvEl = $('#hs_sf_pv');
    /* v2.7.1 预览对齐原型: 统计徽章头 + 左右双栏对比(过滤前|过滤后,各滚动列表,
       被排除项红色✕在左栏,保留项在右栏)——替换单栏折叠(用户实测吐槽与原型差异巨大) */
    if (pvEl) {
      const dropped = pv.total - pv.kept.length;
      const keptSet = {}; pv.kept.forEach(n => { keptSet[n] = 1 });
      /* v2.7.7 胶囊可点切换去留: 手动覆盖层 keep/drop——点排除区胶囊=手动保留(移右),
       * 点保留区胶囊=手动排除(移左),已覆盖态(★)再点=撤销回规则判定;标题重命名「排除/保留」 */
      const li = (n, ok) => {
        const ov = pv.over[n];
        return '<span data-flip="' + esc(n) + '" title="' + (ov ? '★手动指定——点击撤销回规则判定' : ok ? '点击→排除该节点' : '点击→保留该节点') + '" style="display:inline-block;font-size:.72rem;padding:3px 9px;margin:2px;border-radius:12px;cursor:pointer;border:1px solid ' + (ok ? 'rgba(102,187,106,.35)' : 'rgba(229,115,115,.45)') + (ov ? ';box-shadow:0 0 0 1px ' + (ov === '+' ? 'rgba(143,227,154,.5)' : 'rgba(255,179,179,.5)') : '') + ';background:' + (ok ? 'rgba(102,187,106,.07)' : 'rgba(229,115,115,.08)') + ';color:' + (ok ? '#c8d2e0' : '#e57373') + ';max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle">' + (ov ? '<span style="margin-right:3px">★</span>' : (ok ? '<span style="color:#8fe39a;margin-right:3px">✓</span>' : '<span style="margin-right:3px">✕</span>')) + esc(n) + '</span>';
      };
      pvEl.innerHTML = ''
      + '<div style="margin:10px 0 8px;display:flex;align-items:center;gap:7px;flex-wrap:wrap">'
      + '<span style="font-size:.85rem;font-weight:700">实时预览</span>'
      + '<span class="hs-hint" style="font-size:.64rem">点节点可手动调整去留(★=手动指定,再点撤销)</span>'
      + '<span class="hs-tag ' + (dropped ? 'o' : 'y') + '" style="font-size:.72rem">' + names.length + ' → ' + pv.kept.length + '</span>'
      + (pv.info ? '<span class="hs-tag gr" style="font-size:.72rem">信息-' + pv.info + '</span>' : '')
      + (pv.sep ? '<span class="hs-tag gr" style="font-size:.72rem">分隔符-' + pv.sep + '</span>' : '')
      + (pv.transit ? '<span class="hs-tag gr" style="font-size:.72rem">中转-' + pv.transit + '</span>' : '')
      + (pv.kw ? '<span class="hs-tag gr" style="font-size:.72rem">关键词-' + pv.kw + '</span>' : '')
      + (pv.region ? '<span class="hs-tag gr" style="font-size:.72rem">地区-' + pv.region + '</span>' : '')
      + (pv.drop ? '<span class="hs-tag o" style="font-size:.72rem">手动排除-' + pv.drop + '</span>' : '')
      + ((f.keep && f.keep.length) ? '<span class="hs-tag y" style="font-size:.72rem">手动保留-' + f.keep.length + '</span>' : '')
      + (!dropped ? '<span class="hs-tag y" style="font-size:.72rem">无过滤</span>' : '')
      + '</div>'
      + '<div class="hs-pvcols" style="display:flex;gap:8px">' /* v2.9.54: 窄屏纵排(≤480px,见 .hs-pvcols 媒体规则)——两列并排在 375px 下胶囊省略号过重 */
      + '<div style="flex:1;min-width:0;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px;background:rgba(0,0,0,.22)">'
      + '<div style="font-size:.76rem;font-weight:700;color:#e57373;margin-bottom:5px">✕ 排除 <b style="color:#e8eaf0">' + (names.length - pv.kept.length) + '</b> <span class="hs-hint" style="font-size:.66rem">/ 全部 ' + names.length + '</span></div>'
      + '<div id="hs_pv_left" style="max-height:180px;overflow-y:auto;line-height:1.9">' + names.map(n => li(n, !!keptSet[n])).join('') + '</div></div>'
      + '<div style="flex:1;min-width:0;border:1px solid rgba(102,187,106,.4);border-radius:10px;padding:8px 10px;background:rgba(102,187,106,.07)">'
      + '<div style="font-size:.76rem;font-weight:700;color:#8fe39a;margin-bottom:5px">✓ 保留 <b style="color:#e8eaf0">' + pv.kept.length + '</b> <span class="hs-hint" style="font-size:.66rem;font-weight:400">/ 全部 ' + names.length + '</span></div>'
      + '<div id="hs_pv_right" style="max-height:180px;overflow-y:auto;line-height:1.9">' + pv.kept.map(n => li(n, true)).join('') + '</div></div>'
      + '</div>';
    }
    const infoEl = $('#hs_sf_info'); if (infoEl) infoEl.onchange = function () { f.autoInfo = this.checked; renderDlg() };
    const pvLEl = document.getElementById('hs_pv_left'); if (pvLEl) pvLEl.scrollTop = sl; /* 恢复滚动位置 */
    const pvREl = document.getElementById('hs_pv_right'); if (pvREl) pvREl.scrollTop = sr;
    const trEl = $('#hs_sf_transit'); if (trEl) trEl.onchange = function () { f.autoTransit = this.checked; renderDlg() };
    document.querySelectorAll('[data-sfk]').forEach(x => x.onclick = () => { f.kws.splice(+x.dataset.sfk, 1); renderDlg() });
    const kwEl = $('#hs_sf_kwin'); if (kwEl) kwEl.onkeydown = e => { if (e.key === 'Enter' && kwEl.value.trim()) { f.kws.push(kwEl.value.trim().slice(0, 30)); renderDlg() } };
    document.querySelectorAll('[data-sfr]').forEach(c => c.onclick = () => { f.regions[c.dataset.sfr] = !f.regions[c.dataset.sfr]; renderDlg() });
    /* v2.7.7 预览胶囊切换: 规则排除→点=手动保留;规则保留→点=手动排除;已覆盖(★)→点=撤销回规则 */
    document.querySelectorAll('[data-flip]').forEach(el => el.onclick = () => {
      const n = el.dataset.flip;
      const ov = pv.over[n];
      const keepArr = f.keep = Array.isArray(f.keep) ? f.keep : [];
      const dropArr = f.drop = Array.isArray(f.drop) ? f.drop : [];
      const isKept = pv.kept.indexOf(n) >= 0; /* 块外不可见 keptSet(if 块内 const),用闭包 pv 判定(v2.7.10 修复 ReferenceError) */
      if (ov === '+') { const x = keepArr.indexOf(n); if (x >= 0) keepArr.splice(x, 1) }
      else if (ov === '-') { const x = dropArr.indexOf(n); if (x >= 0) dropArr.splice(x, 1) }
      else if (isKept) { if (dropArr.indexOf(n) < 0) dropArr.push(n) }
      else { if (keepArr.indexOf(n) < 0) keepArr.push(n) }
      renderDlg();
    });
    $('#hs_sf_def').onclick = () => { const keep = Object.keys(f.regions); f.autoInfo = true; f.autoTransit = true; f.kws = []; keep.forEach(r => f.regions[r] = true); renderDlg() };
    $('#hs_sf_close').onclick = () => hsClose('hs_modal_simple');
    $('#hs_sf_save').onclick = async () => {
      const chk = previewSubFilter(names, f);
      if (names.length && chk.kept.length === 0) { toast('⚠️ 全部节点被过滤——至少保留一个节点才能保存', 'red'); return }
      sb.filter = normSubFilter(f);
      await saveConf();
      hsClose('hs_modal_simple');
      renderPane();
      if (subEffective(i) && ST.running) { await saveConfReload('✅ 过滤已保存并热重载') }
      else toast('✅ 过滤已保存' + (subEffective(i) ? '(下次启动生效)' : '(该订阅未激活,启用时生效)'), 'green');
      await opLog('订阅「' + sb.name + '」过滤规则保存:排除' + (chk.total - chk.kept.length) + '个节点');
    };
  };
  renderDlg();
}
/* ---- 分流 ---- */
function bootDesc(d) {
  const a = d ? d.autostart : C.autostart, m = d ? d.bootMode : C.bootMode;
  if (!a) return '当前:开机自启已关闭 · 设备重启后插件完全不运行,需手动启动';
  return m === 'keep'
    ? '当前:恢复上次 · 开机后原样恢复关机前的开关状态(白名单/本机/节点模式),断电重启不丢'
    : '当前:只起引擎 · 开机后仅启动引擎不接管流量,全部直连,到面板再手动开闸,最稳妥';
}
async function etCheck() {
  const a = await run('[ -x /data/plugins/easytier/easytier-core ] && echo 1', 5000);
  if ((a.content || '').trim() !== '1') return 'noinstall';
  /* v2.7.27 修复: cat 直读经面板传输会被截断(用户实锢: state.json 1KB 37网段时
     JSON.parse 必挂→误报「状态文件异常」),改用 base64 通道+与 readEtState 同款容错 */
  const b = await run('base64 < /data/plugins/easytier/state.json 2>/dev/null', 5000);
  const txt = b64d(String(b.content || '').replace(/\s+/g, '')).trim();
  if (!txt) return 'nostate';
  try {
    const j = JSON.parse(txt);
    if (!j || j.version !== 1 || typeof j.active !== 'boolean') return 'badstate';
    if (j.active && !(Array.isArray(j.cidrs) && j.cidrs.length)) return 'badstate';
    return 'ok';
  } catch (e) {
    /* 半文件降级(与 readEtState 同源逻辑): active+cidrs 在文件前部,大概率可救 */
    const mAct = /"active"\s*:\s*(true|false)/.exec(txt);
    const mCid = /"cidrs"\s*:\s*\[([^\]]*)\]/.exec(txt);
    if (mAct && mAct[1] === 'true' && mCid && mCid[1].replace(/["\s]/g, '')) return 'ok';
    return 'badstate';
  }
}
/* 查看订阅全部节点(9090 provider API,含延迟) */

/* ===== v2.9.30 卡内活控件挂载(真机反馈: 详情卡按钮应触发真实交互,弃锚点跳转) ===== */
async function riverLiveExit() { /* v2.9.43: 兜底出口实测——MATCH 规则经组链解析到当前选中节点+延迟(用户实锢: 只显示"节点选择"不知道流量去哪)
   v2.9.53: 根修断链——订阅节点多为 proxy-provider 引入,不在 /proxies 字典(实测 11 键全为组/内置,now 指向的节点查无此键),
   旧 while 在 P[now] 处即断,链永远只剩组名(真机复现:胶囊恒"兜底 🚀 节点选择");现断链时把 now 终点补入链,
   并到 /providers/proxies 找该节点拿延迟/存活 */
  const px = await apiGet('/proxies');
  if (!px || !px.proxies) return null;
  const P = px.proxies;
  const entry = hsMainGroup();
  const chain = []; let cur = entry, d = 0;
  while (P[cur] && d < 6) { chain.push(cur); if (!P[cur].now) break; cur = P[cur].now; d++ }
  if (!P[cur] && chain.length && cur) chain.push(cur); /* v2.9.53: now 终点(provider 节点不在字典)补入链 */
  let fp = P[cur] || null, delay = fp && fp.history && fp.history.length ? fp.history[fp.history.length - 1].delay : 0, alive = !!(fp && fp.alive !== false);
  if (!fp) { /* provider 节点: 到 /providers/proxies 按名找延迟/存活 */
    try {
      const pv = await apiGet('/providers/proxies');
      const all = (pv && pv.providers) ? Object.keys(pv.providers).map(k => pv.providers[k]) : [];
      for (const pr of all) {
        const hit = (pr.proxies || {})[cur] || (Array.isArray(pr.proxies) ? pr.proxies.find(x => x && x.name === cur) : null);
        if (hit) { fp = hit; delay = hit.history && hit.history.length ? hit.history[hit.history.length - 1].delay : 0; alive = hit.alive !== false; break }
      }
    } catch (e) { }
  }
  const final = cur;
  return { chain: chain.join(' → ') + (delay ? ' (' + delay + 'ms)' : ''), finalTxt: final + (delay ? ' · ' + delay + 'ms' : '') + (alive ? '' : ' ·未测活'), final: final, alive: alive };
}
riverMountLive._edit = null; riverMountLive._tgt = null; riverMountLive._zone = null; /* v2.9.44: 编辑态/回填目标/输入区开闭记忆 */
function riverMountLive(kind, el) {
  const MN = { suffix: '后缀', prefix: '前缀', exact: '精确' };
  const wrap = (inner) => { el.innerHTML = '<div style="border-top:1px dashed rgba(255,255,255,.08);padding-top:8px;animation:hsRvLiveIn 1s cubic-bezier(.2,.8,.25,1) both">' + inner + '</div>' }; /* v2.9.49: 编辑/回填/增删重渲染渐入(生硬→柔和) */
  const row = (a, b, c) => '<div class="hs-row" style="min-height:36px;padding:5px 2px"><div class="hs-sl"><div class="hs-st">' + a + '</div>' + (b ? '<div class="hs-sd">' + b + '</div>' : '') + '</div><div class="hs-sc">' + c + '</div></div>';
  const seg = (id, def) => '<div class="hs-seg" id="' + id + '">' + ['suffix', 'prefix', 'exact'].map(x => '<button data-m="' + x + '" class="' + (x === def ? 'on' : '') + '">' + MN[x] + '</button>').join('') + '</div>';
  if (kind === 'cn') {
    wrap(
      row('启用直通', '中国 IP 在防火墙层直接转发,不进引擎', '<label class="hs-sw"><input type="checkbox" id="hs_rv_chn_sw" ' + (C.cnBypass !== false ? 'checked' : '') + '><span></span></label>')
      + row('路由表', ST.chn >= 5000 ? '<span style="color:#66bb6a">已就绪</span> · v4 ' + ST.chn + ' 条' + ((ST.chn6 || 0) >= 20 ? ' · v6 ' + ST.chn6 + ' 条' : '') : '未安装', '<button class="btn hs-sm" id="hs_rv_chn_dl">' + (ST.chn >= 5000 ? '更新' : '在线下载') + '</button>')
      + row('手动上传', '在线下载失败时用', '<button class="btn hs-sm" id="hs_rv_chn_up">上传</button>')
      + '<div id="hs_rv_chn_prog"></div>');
    const sw = el.querySelector('#hs_rv_chn_sw');
    if (sw) sw.onchange = e => { op(null, async () => { C.cnBypass = e.target.checked; await saveConf(); if (ST.running) await reapplyFw() }, '✅ 国内直通已' + (e.target.checked ? '开启' : '关闭'), '应用直通规则中…') };
    const dl = el.querySelector('#hs_rv_chn_dl'); if (dl) dl.onclick = () => chnInstall(dl);
    const up = el.querySelector('#hs_rv_chn_up'); if (up) up.onclick = () => chnUpload();
    return;
  }
  if (kind === 'et') {
    const etf = document.getElementById('hs_et_fold');
    wrap(row('ET组网 路由表', '查看将被防火墙排除的网段与端口', '<button class="btn hs-sm hs-pri" id="hs_rv_et_open">展开查看</button>'));
    const b = el.querySelector('#hs_rv_et_open');
    if (b) b.onclick = () => { if (etf) { etf.open = true; etf.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } };
    return;
  }
  if (kind === 'ex' || kind === 'fc') {
    /* v2.9.44: 用户定稿设计——浏览态条目正常显示+徽标;编辑态只加 ✎/✕ 小按钮,笔=回填到输入框修改后「更新」;输入框常驻(添加是编辑的一部分) */
    const D = setDraft(); const arr = kind === 'ex' ? D.exclude : D.force;
    const pre = kind === 'ex' ? 'ex' : 'fc';
    const editing = riverMountLive._edit === kind;
    const tgt = (riverMountLive._tgt === null || riverMountLive._tgt === undefined) ? null : riverMountLive._tgt; /* v2.9.45: 修索引0被 ||null 吞(第一条回填失效) */
    const items = arr.map((x, i) => '<div class="hs-row" style="min-height:32px;padding:3px 2px"><div class="hs-sl"><div class="hs-st">' + esc(x.v) + ' <span class="hs-sd" style="display:inline;font-size:.68rem;color:#7a8aa5">· ' + (MN[x.m] || (x.m === 'cidr' ? 'IP 网段' : '')) + '</span></div></div><div class="hs-sc" style="gap:4px">' /* v2.9.45: 匹配方式贴域名后纯文本,不再像可点胶囊 */
      + (editing ? '<button class="btn hs-sm" data-rvl-edit="' + i + '" style="padding:2px 7px" title="回填到输入框修改">✎</button><button class="btn hs-sm" data-rvl-del="' + i + '" style="padding:2px 7px;color:#ff8a80;border-color:rgba(255,120,100,.4)" title="删除">✕</button>' : '')
      + '</div></div>').join('') || '<div class="hs-sd" style="padding:2px 0">暂无条目</div>';
    const zoneOpen = editing || (riverMountLive._zone === kind);
    wrap(
      (arr.length ? '<div class="hs-hint" style="margin-bottom:2px">' + arr.length + ' 条' + (editing ? ' · 编辑中' : '') + '</div>' : '')
      + items
      + '<div class="hs-rv-addzone" id="hs_rv_' + pre + '_zone" style="max-height:' + (zoneOpen ? '200px' : '0') + ';overflow:hidden;transition:max-height 1.1s cubic-bezier(.25,.9,.3,1.1),opacity .8s;opacity:' + (zoneOpen ? '1' : '0') + '">'
      + '<div class="hs-row" style="min-height:36px;padding:6px 2px 2px"><div class="hs-sl"><input id="hs_rv_' + pre + '_in" value="' + (tgt !== null && arr[tgt] ? esc(arr[tgt].v) : '') + '" placeholder="' + (kind === 'ex' ? '域名或 IP/网段,如 corp.cn' : '域名或 IP,如 openai.com') + '" style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:5px 8px;font-size:.76rem;width:100%"></div></div>'
      + '<div style="display:flex;gap:6px;align-items:center;padding:4px 2px">' + seg('hs_rv_' + pre + '_mode', tgt !== null && arr[tgt] ? arr[tgt].m : 'suffix') + '<button class="btn hs-sm hs-pri" id="hs_rv_' + pre + '_ok">' + (tgt !== null ? '更新' : '加入') + '</button></div></div>'
      + '<div style="display:flex;gap:6px;margin-top:8px;align-items:center">' + (editing ? '' : '<button class="btn hs-sm" id="hs_rv_' + pre + '_addbtn" style="border-style:dashed">＋ 添加</button>') /* v2.9.48: 编辑态输入框已常驻展示,添加按钮隐藏防误触收起(真机反馈会连带折叠编辑按钮) */ + (arr.length ? '<button class="btn hs-sm ' + (editing ? 'hs-pri' : '') + '" id="hs_rv_' + pre + '_editbtn" style="' + (editing ? 'width:100%' : 'margin-left:auto') + '">' + (editing ? '✓ 完成' : '✎ 编辑') + '</button>' : '') + '</div>');
    const zone = el.querySelector('#hs_rv_' + pre + '_zone');
    const panel = el.closest && el.closest('.vpanel');
    const addBtn = el.querySelector('#hs_rv_' + pre + '_addbtn');
    /* v2.9.50: 遮挡复发根因——双 rAF 采到的是 1.1s 过渡的中间值。改确定性计算: 面板高=当前内容高+开着的输入区内容高+余量,与过渡时刻无关 */
    const repanel = () => {
      if (!panel) return;
      const zoneOpen2 = zone.style.opacity === '1';
      const zh2 = zoneOpen2 ? zone.scrollHeight + 12 : 0;
      panel.style.maxHeight = (panel.scrollHeight + zh2 + 44) + 'px';
    };
    const openZone = (open) => {
      zone.style.maxHeight = open ? Math.max(120, zone.scrollHeight + 8) + 'px' : '0';
      zone.style.opacity = open ? '1' : '0';
      addBtn.textContent = open ? '✕ 收起' : '＋ 添加';
      riverMountLive._zone = open ? kind : null;
      repanel();
      if (open) { const ip = el.querySelector('#hs_rv_' + pre + '_in'); if (ip) ip.focus() }
    };
    if (addBtn) addBtn.onclick = () => { if (riverMountLive._tgt !== null) { riverMountLive._tgt = null; riverMountLive(kind, el); openZone(true) } else openZone(zone.style.opacity !== '1') }; /* 编辑态按钮已隐藏,此路径仅浏览态 */
    const eb = el.querySelector('#hs_rv_' + pre + '_editbtn');
    if (eb) eb.onclick = () => { riverMountLive._edit = editing ? null : kind; riverMountLive._tgt = null; riverMountLive._zone = riverMountLive._edit ? kind : null; riverMountLive(kind, el); riverSyncDirty(); repanel() };
    const segEl = el.querySelector('#hs_rv_' + pre + '_mode');
    if (segEl) segEl.querySelectorAll('button').forEach(mb => mb.onclick = () => { segEl.querySelectorAll('button').forEach(x => x.classList.remove('on')); mb.classList.add('on') });
    const ok = el.querySelector('#hs_rv_' + pre + '_ok');
    if (ok) ok.onclick = () => {
      const inp = el.querySelector('#hs_rv_' + pre + '_in'); const v = inp.value.trim();
      if (!v) { toast('请输入内容', 'red'); return }
      const on = segEl.querySelector('.on'); let mm = on ? on.dataset.m : 'suffix';
      if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(v)) mm = 'cidr';
      if (riverMountLive._tgt !== null) {
        const o0 = arr[riverMountLive._tgt] || {};
        if (o0.v === v && o0.m === mm) { toast('内容没变,未做修改', 'pink'); return } /* v2.9.47: 无变更守卫(真机反馈: 回填后直接点更新也报已更新) */
        arr[riverMountLive._tgt] = { v: v, m: mm }; toast('已更新(顶部「保存」后生效)', 'green'); riverMountLive._tgt = null
      }
      else { arr.push({ v: v, m: mm }); toast('已加入草稿,顶部「保存」后生效', 'green') }
      riverMountLive(kind, el); renderRiverInPane(); riverSyncDirty(); repanel();
    };
    const inp2 = el.querySelector('#hs_rv_' + pre + '_in');
    if (inp2) inp2.onkeydown = e => { if (e.key === 'Enter') ok.click() };
    el.querySelectorAll('[data-rvl-edit]').forEach(b3 => b3.onclick = () => { riverMountLive._tgt = +b3.dataset.rvlEdit; riverMountLive._zone = kind; riverMountLive(kind, el); repanel(); const ip2 = el.querySelector('#hs_rv_' + pre + '_in'); if (ip2) ip2.focus() });
    el.querySelectorAll('[data-rvl-del]').forEach(b2 => b2.onclick = () => { arr.splice(+b2.dataset.rvlDel, 1); if (riverMountLive._tgt === +b2.dataset.rvlDel) riverMountLive._tgt = null; else if (riverMountLive._tgt !== null && riverMountLive._tgt > +b2.dataset.rvlDel) riverMountLive._tgt--; riverMountLive(kind, el); renderRiverInPane(); riverSyncDirty(); repanel() });
    return;
  }
}
function riverSyncDirty() { /* v2.9.41: 卡内增删后刷新顶部脏标与保存/放弃启停(与 syncBar 同口径) */
  const dh = document.getElementById('hs_sp_dirty');
  const sv = document.getElementById('hs_sp_save'); const dc = document.getElementById('hs_sp_discard');
  const n2 = setDiff().n;
  if (dh) dh.textContent = n2 === 0 ? '' : ('● ' + n2 + ' 处修改未保存(保存只检查修改项)');
  if (sv) sv.disabled = n2 === 0; if (dc) dc.disabled = n2 === 0;
}
function renderRiverInPane() { /* v2.9.30: 草稿变动后局部重绘河流(不整页 renderPane,保住打开的卡片) */
  if (hsTab !== 'split') return;
  riverLiveExit().then(function (ex2) { riverRender({ C: C, ST: ST, ET: ET_CACHE, EX: (SET_DRAFT && SET_DRAFT.exclude) || C.exclude || [], FC: (SET_DRAFT && SET_DRAFT.force) || C.force || [], game: HS_GAME_DOMAINS, esc: esc, toast: toast, run: run, apiGet: apiGet, act: riverAct, restStats: riverRestStats, deepRest: riverDeepRest, mountLive: riverMountLive, exitLive: ex2 }); }).catch(function () { });
}
/* ===== v2.9.29 第⑤层深判:IP查china_ip精确判定/域名演算显式规则+兜底链(真机反馈: 落到其余流量后不知直连还是代理) ===== */
function riverV6InBig(ip, cidr) {
  const parts = String(cidr).split('/'); const net = parts[0]; const pl = +parts[1] || 128;
  const toBig = (s) => { const seg = s.split('::'); const h0 = seg[0] ? seg[0].split(':') : []; const t0 = seg.length > 1 && seg[1] ? seg[1].split(':') : [];
    const g = h0.concat(Array(Math.max(8 - h0.length - t0.length, 0)).fill('0')).concat(t0);
    if (g.length !== 8) return null; let v = 0n;
    for (const x of g) { if (!/^[0-9a-f]{1,4}$/.test(x)) return null; v = (v << 16n) + BigInt(parseInt(x, 16)) } return v };
  const a = toBig(ip), b = toBig(net); if (a === null || b === null) return false;
  if (pl <= 0) return true; return (a >> BigInt(128 - pl)) === (b >> BigInt(128 - pl));
}
async function riverDeepRest(q, isIp) {
  if (!ST.running) return { verdict: 'direct', why: '引擎未运行/未接管——当前流量不经小海关,全部直连' }; /* v2.9.37: 接管态守卫(关态下一切直连,防假"走代理") */
  const px = await apiGet('/proxies'); const rs = await apiGet('/rules');
  if (!px || !px.proxies) return null;
  const P = px.proxies;
  const resolve = (nm) => { let c = nm, d = 0; while (P[c] && P[c].now && d < 6) { c = P[c].now; d++ } return c };
  const chainOf = (nm) => { const a = []; let c = nm, d = 0; while (P[c] && d < 6) { a.push(c); if (!P[c].now) break; c = P[c].now; d++ }
    const fp = P[c]; const dl = fp && fp.history && fp.history.length ? fp.history[fp.history.length - 1].delay : 0;
    return { fin: c, chain: a.join(' → ') + (dl ? ' (' + dl + 'ms)' : '') } };
  const label = (f) => f === 'DIRECT' ? '直连' : (f === 'REJECT' ? '拦截' : '走代理');
  if (isIp) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(q)) {
      const r = await run('ipset test hs_cn ' + q + ' >/dev/null 2>&1; echo RC=$?', 4000); /* v2.9.31: ipset test 结果走 stderr,以退出码判定(真机实锢 2>/dev/null 吞输出) */
      if (r && /RC=0/.test(r.content || '')) return { verdict: 'direct', node: 'cn', why: '国内 IP 命中 china_ip 段(防火墙直接放行,不进小海关) → 直连' };
    } else {
      const gs = q.split(':').filter(Boolean); const pats = [];
      for (let k = Math.min(4, gs.length); k >= 1; k--) pats.push(gs.slice(0, k).join(':'));
      const r = await run("grep -m8 -E \"" + pats.join('|') + "\" " + DIR + "/rules/china_ip.txt 2>/dev/null", 5000);
      const lines = ((r && r.content) || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const L of lines) { const seg2 = L.split('/'); const pl = seg2[1] || '128'; if (riverV6InBig(q, seg2[0] + '/' + pl)) return { verdict: 'direct', node: 'cn', why: '国内 IPv6 命中 china_ip 段 ' + L + '(防火墙直接放行,不进小海关) → 直连' } }
    }
    const m = rs && rs.rules ? rs.rules.find(x => x.type === 'Match') : null;
    if (m) { const c = chainOf(m.proxy || ''); return { verdict: c.fin === 'DIRECT' ? 'direct' : 'proxy', why: '未命中任何国内段 → MATCH 兜底 ' + c.chain + ' → ' + label(c.fin) } }
    return null;
  }
  let exotic = false; /* v2.9.37: 订阅高级规则(正则/逻辑/子规则)本地无法演算——遇之不再冒充确定答案 */
  if (rs && rs.rules) {
    for (const r of rs.rules) {
      if (r.type === 'GeoSite' || r.type === 'GeoIP' || r.type === 'Match') break;
      if (['DomainRegex', 'SubRules', 'AND', 'OR', 'NOT'].indexOf(r.type) >= 0) { exotic = true; break }
      const pl = (r.payload || '').toLowerCase(); if (!pl || !r.proxy) continue;
      let hit = false;
      if (r.type === 'Domain' && pl === q) hit = true;
      else if (r.type === 'DomainSuffix' && (q === pl || q.endsWith('.' + pl))) hit = true;
      else if (r.type === 'DomainKeyword' && q.indexOf(pl) >= 0) hit = true;
      if (hit) { const c = chainOf(r.proxy); return { verdict: c.fin === 'DIRECT' ? 'direct' : (c.fin === 'REJECT' ? 'reject' : 'proxy'), why: '命中订阅规则 ' + r.type + ',' + pl + ' → ' + c.chain + ' → ' + label(c.fin) } }
    }
  }
  if (exotic) { const mEx = rs.rules.find(x => x.type === 'Match'); const cEx = mEx ? chainOf(mEx.proxy || '') : null; return { verdict: 'dual', why: '订阅含高级规则(正则/逻辑),本地无法完全演算——简单规则未命中,后续由引擎判定(未命中直连规则则兜底' + (cEx ? ' ' + cEx.chain : '') + ')' } }
  /* v2.9.31 fake-ip oracle(真机验证: baidu→真实国内IP, google→198.18.x): 引擎 fake-ip-filter 与 geosite:cn 同源——
     nslookup 引擎 DNS 返回真实 IP=命中国内域名通道(直连);返回 198.18/198.19 fake IP=未命中任何直连规则(→MATCH 兜底代理) */
  if (ST.running && C.ports && C.ports.dns) {
    try {
      const nr = await run('nslookup ' + shq(q) + ' 127.0.0.1:' + C.ports.dns + ' 2>&1 | grep -i address | grep -v 127.0.0.1', 6000);
      /* v2.9.33: 双栈解析——收集全部 A/AAAA 地址,按 C.v6Dns 决定判据族(v6 开=流量优先走 v6,判 v6;关=判 v4),单 v4 判定在 v6 开启时会误判 */
      const txtO = (nr && nr.content) || '';
      const allAddrs = [];
      const reA = /((?:\d{1,3}\.){3}\d{1,3})/g; let mm;
      while ((mm = reA.exec(txtO)) !== null) if (!/^198\.1[89]\./.test(mm[1])) allAddrs.push({ f: 'v4', a: mm[1] });
      const re6 = /([0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7})/gi;
      while ((mm = re6.exec(txtO)) !== null) { const a6 = mm[1].toLowerCase(); if (a6 !== '::1' && !a6.startsWith('fc') && !a6.startsWith('fd')) { if (!allAddrs.some(x => x.a === a6)) allAddrs.push({ f: 'v6', a: a6 }) } }
      const fakes = [];
      if (/198\.1[89]\.[\d.]+/.test(txtO)) fakes.push('v4');
      if (/(?:^|\s)(fc|fd)[0-9a-f]{0,3}:/i.test(txtO)) fakes.push('v6');
      const m2b = rs && rs.rules ? rs.rules.find(x => x.type === 'Match') : null;
      const cb = m2b ? chainOf(m2b.proxy || '') : null;
      const prefF = C.v6Dns ? 'v6' : 'v4';
      /* v2.9.35: 判据族跟随开关显式过滤——v6 关时即使引擎吐出 AAAA 也不采信(防异常误判);v6 开优先 v6,域名无 AAAA 回落 v4(流量实际也走 v4) */
      const usable = C.v6Dns ? allAddrs : allAddrs.filter(x => x.f === 'v4');
      const pref = usable.find(x => x.f === prefF) || usable[0];
      /* 判定: 偏好族拿到 fake(198.18/19 或 fc/fd) → 未命中直连通道 → 兜底代理;偏好族真实地址 → 命中国内域名通道 → 直连(v4 再 china_ip 双确认,v6 查 china_ip v6 段) */
      const fakeOfPref = fakes.includes(prefF) || (pref && ((pref.f === 'v4' && false) || false));
      const resolvedFake = (() => {
        if (fakes.length >= 2) return true; /* 双栈都 fake 或解析被 fake 池接管 */
        if (!pref) return fakes.length > 0; /* 没有真实地址,只有 fake */
        return false;
      })();
      if (resolvedFake) return { verdict: 'proxy', why: 'DNS 引擎判定: 未命中国内域名库(fake-ip' + (C.v6Dns ? ',v6 优先' : '') + ') → MATCH 兜底' + (cb ? ' ' + cb.chain : '') + ' → 走代理' };
      if (pref) {
        const ip = pref.a;
        if (pref.f === 'v4') {
          const t = await run('ipset test hs_cn ' + ip + ' >/dev/null 2>&1; echo RC=$?', 4000);
          const cn = t && /RC=0/.test(t.content || '');
          if (cn) return { verdict: 'direct', node: 'cn', why: '国内域名命中 geosite:cn · 解析国内 IP ' + ip + '(china_ip 双确认) → 直连' };
          if (/^(time\.|ntp\.|\d+\.)|[\.-]stun[\.-]|\.(lan|local)$/i.test(q)) return { verdict: 'dual', why: '该域名命中 fake-ip 通用模式(时间/STUN/内网)返回真实 IP,不属国内域名库——由引擎规则决定(通常走兜底)' };
          return { verdict: 'direct', node: 'cn', why: '国内域名命中 geosite:cn(小海关内直接放行) · 解析 ' + ip + ' → 直连' };
        }
        const gs = ip.split(':').filter(Boolean).slice(0, 4); const pats = []; for (let k = gs.length; k >= 1; k--) pats.push(gs.slice(0, k).join(':'));
        const g = await run('grep -m8 -E "' + pats.join('|') + '" ' + DIR + '/rules/china_ip.txt 2>/dev/null', 5000);
        const v6cn = ((g && g.content) || '').split('\n').map(s => s.trim()).filter(Boolean).some(L => riverV6InBig(ip, (L.split('/')[0]) + '/' + (L.split('/')[1] || '128')));
        if (v6cn) return { verdict: 'direct', node: 'cn', why: '国内域名命中 geosite:cn · 解析国内 IPv6 ' + ip + '(china_ip v6 段确认) → 直连(v6 优先栈)' };
        if (/^(time\.|ntp\.|\d+\.)|[\.-]stun[\.-]|\.(lan|local)$/i.test(q)) return { verdict: 'dual', why: '该域名命中 fake-ip 通用模式(时间/STUN/内网),不属国内域名库——由引擎规则决定' };
        return { verdict: 'direct', node: 'cn', why: '国内域名命中 geosite:cn(小海关内直接放行) · 解析 IPv6 ' + ip + ' → 直连(v6 优先栈)' };
      }
    } catch (e) { }
  }
  const m2 = rs && rs.rules ? rs.rules.find(x => x.type === 'Match') : null;
  const geo = rs && rs.rules ? rs.rules.find(x => x.type === 'GeoSite') : null;
  const geoDir = geo && resolve(geo.proxy || '') === 'DIRECT';
  const c2 = m2 ? chainOf(m2.proxy || '') : null;
  return { verdict: 'dual', why: '引擎未运行无法实测:' + (geoDir ? '国内域名(geosite:cn)→直连; 海外域名' : '该域名') + '→MATCH 兜底' + (c2 ? ' ' + c2.chain + ' → ' + label(c2.fin) : '') };
}
/* ===== v2.9.28 其余流量节点:订阅规则判向实测(引擎 /rules+/proxies,事件驱动) ===== */
async function riverRestStats() {
  const rs = await apiGet('/rules'); const px = await apiGet('/proxies');
  if (!rs || !rs.rules || !px || !px.proxies) return null;
  const P = px.proxies;
  const resolve = (name) => { let cur = name, d = 0; while (P[cur] && P[cur].now && d < 6) { cur = P[cur].now; d++ } return cur };
  let direct = 0, proxy = 0, reject = 0, matchChain = '';
  for (const r of rs.rules) {
    const tgt = r.proxy || '';
    if (r.type === 'Match') {
      const chain = []; let cur = tgt, d = 0;
      while (P[cur] && d < 6) { chain.push(cur); if (!P[cur].now) break; cur = P[cur].now; d++ }
      const fp = P[cur];
      const delay = fp && fp.history && fp.history.length ? fp.history[fp.history.length - 1].delay : 0;
      matchChain = chain.join(' → ') + (delay ? ' (' + delay + 'ms)' : '');
      continue;
    }
    const fin = resolve(tgt);
    if (fin === 'DIRECT') direct++;
    else if (fin === 'REJECT' || fin === 'REJECT-DROP' || fin === 'PASS') reject++;
    else proxy++;
  }
  return { total: rs.rules.length, direct: direct, proxy: proxy, reject: reject, matchChain: matchChain };
}
/* ===== v2.9.23 河流分岔(泳道定稿)整体迁入 src/分流河流.js;此处仅留详情动作适配 ===== */
function riverAct(a) {
  riverClose();
  if (a === 'rv-upd-ip') { openMgr('set'); toast('到 设置→分流 更新路由表', 'green') }
  else if (a === 'rv-et-fold') { const f = document.getElementById('hs_et_fold'); if (f) { f.open = true; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) } else openMgr('split') }
  else if (a === 'rv-fc-add' || a === 'rv-fc-edit') { const inp = document.getElementById('hs_fc_in'); if (inp) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); inp.focus() } else openMgr('split') }
  else if (a === 'rv-ex-add' || a === 'rv-ex-edit') { const inp = document.getElementById('hs_ex_in'); if (inp) { inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); inp.focus() } else openMgr('split') }
  else if (a === 'rv-policy') { openMgr('set'); toast('到 设置→策略来源 查看', 'green') }
  else if (a === 'rv-node') { openMgr('node'); toast('在节点页选择出口', 'green') } /* v2.9.30 */
}
function paneSplit() {
  const D = SET_DRAFT;
  const EX = D ? D.exclude : C.exclude, FC = D ? D.force : C.force;
  const R = (t, d, c) => '<div class="hs-row"><div class="hs-sl"><div class="hs-st">' + t + '</div>' + (d ? '<div class="hs-sd">' + d + '</div>' : '') + '</div><div class="hs-sc">' + c + '</div></div>';
  const MN = { suffix: '后缀匹配', prefix: '前缀匹配', exact: '精确匹配', cidr: 'IP 网段' };
  let exRows = '', fcRows = '';
  EX.forEach((x, i) => { exRows += R(esc(x.v), (MN[x.m] || '') + ' · 不走代理', '<button class="btn hs-sm" data-rmex="' + i + '">删除</button>') });
  FC.forEach((x, i) => { fcRows += R(esc(x.v), (MN[x.m] || '') + ' · 强制走代理', '<button class="btn hs-sm" data-rmfc="' + i + '">删除</button>') });
  const MODESEG = (id) => '<div class="hs-seg" id="' + id + '"><button data-m="suffix" class="on">后缀</button><button data-m="prefix">前缀</button><button data-m="exact">精确</button></div>';
  const ADD = (inp, mode, btn, ph) => '<div class="hs-row"><div class="hs-sl"><input id="' + inp + '" placeholder="' + ph + '" style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:5px 8px;font-size:.76rem;width:100%"></div><div class="hs-sc">' + MODESEG(mode) + '<button class="btn hs-sm" id="' + btn + '">添加</button></div></div>';
  /* v2.9.7: 分流展示改河流分岔组件(ZCode v02 定稿)——数据快照,渲染由 renderRiver 在绑定后执行 */
  const pv = riverMarkup(); /* v2.9.23 泳道定稿(模块渲染) */
  const curMode = C.s1;
  const quick = '<div class="hs-sec"><h4>终端代理 <span class="hs-hint">哪些设备走代理</span></h4>'
  + '<div class="hs-seg" id="hs_quick_s1" style="margin:4px 0">'
  + '<button data-v="off" class="' + (curMode === 'off' ? 'on' : '') + '">全部直连</button>'
  + '<button data-v="white" class="' + (curMode === 'white' ? 'on' : '') + '">白名单</button>'
  + '<button data-v="all" class="' + (curMode === 'all' ? 'on' : '') + '">全部代理</button>'
  + '</div>'
  + '<div class="hs-sd">' + ({ off: '所有终端直连,不走代理', white: '仅白名单设备走代理(' + C.devices.filter(d => d.proxy).length + '台)', all: '所有终端走代理(含新接入设备)' })[curMode] + '</div>'
  + '</div>';
  const saveBar = '<div class="hs-pghead"><span class="hs-hint" style="flex:1" id="hs_sp_dirty"></span><button class="btn hs-sm" id="hs_sp_discard">放弃</button><button class="btn hs-sm hs-pri" id="hs_sp_save">保存</button></div>';
  return saveBar + quick + '<div class="hs-hint" style="margin:0 2px 6px">本页与设置共用「保存」;预览为已生效配置;域名走 DIRECT 规则,网段走防火墙层排除</div>'
  + '<div class="hs-sec"><h4>当前生效分流 <span class="hs-hint">哪段流量没进小海关、哪段进了引擎 · 点岔口或搜索定位</span></h4>' + pv + '</div>'
  + '<div class="hs-sec"><h4>自动兼容</h4>'
  + R('自动兼容 ET组网', '默认关闭,仅同装 ET组网(EasyTier)插件时需要;开启时校验 ET 在位且其状态文件输出已打开', '<label class="hs-sw"><input type="checkbox" id="hs_set_cox" ' + ((D ? D.coexistAuto : C.coexistAuto) ? 'checked' : '') + '><span></span></label>')
  + ((D ? D.coexistAuto : C.coexistAuto)
    ? '<details class="hs-fold" id="hs_et_fold" style="margin:2px 0 8px"><summary style="padding:8px 12px;cursor:pointer;font-size:.76rem">📄 ET组网 路由表 <span class="hs-hint">展开查看将被防火墙排除的网段与端口</span></summary><div id="hs_et_body" style="padding:2px 12px 10px"><div class="hs-hint">读取中…</div></div></details>'
    : '')
  + '</div>'
  + '<div class="hs-sec"><h4>国内直通 <span class="hs-hint">中国 IP 内核态放行不进代理,微信/QQ 等提速</span></h4>'
  + R('启用直通', '中国 IP 在防火墙层直接转发;需路由表;国内域名同时返回真实 IP 配合', '<label class="hs-sw"><input type="checkbox" id="hs_chn_sw" ' + (C.cnBypass !== false ? 'checked' : '') + '><span></span></label>')
  + R('IPv6 响应（实验）', '默认关闭:DNS 不回 AAAA 记录,终端全走 v4。开启后 IPv6 DNS 恢复响应(域名可解析出 v6 地址,v6 可通);代价:v6 流量进入引擎处理,CPU 占用上升,设备可能变慢', '<label class="hs-sw"><input type="checkbox" id="hs_sw_v6dns" ' + (C.v6Dns ? 'checked' : '') + '><span></span></label>')
  + R('路由表', ST.chn >= 5000 ? '<span style="color:#66bb6a">已就绪</span> · v4 ' + ST.chn + ' 条'
      + ((ST.chn6 || 0) >= 20 ? ' · <span style="color:#66bb6a">v6 ' + ST.chn6 + ' 条</span>' : ' · <span style="color:#ffb74d">v6 缺失(内置三网大段兜底,建议补全)</span>')
      : '未安装(仅 mihomo 内部分流)', '<button class="btn hs-sm" id="hs_chn_dl">' + (ST.chn >= 5000 ? '重新下载' : '在线下载') + '</button>')
  + R('手动上传', '在线下载失败时,电脑下载 china.txt 后上传', '<button class="btn hs-sm" id="hs_chn_up">上传</button>')
  + '<div id="hs_chn_prog"></div>'
  + '</div>'
  + '<div class="hs-sec"><h4>地理数据 <span class="hs-hint">mihomo 分流规则的中国名单;与上方直通互补:直通在内核层,这在进程层</span></h4>'
  + R('GeoIP', geoFileDesc(ST.geoIpT, 'GeoIP', '中国 IPv4+IPv6 段'), '<button class="btn hs-sm" id="hs_geo_ip">' + (ST.geoIpT ? '更新' : '安装') + '</button>')
  + R('GeoSite', geoFileDesc(ST.geoSiteT, 'GeoSite', '域名分类库'), '<button class="btn hs-sm" id="hs_geo_site">' + (ST.geoSiteT ? '更新' : '安装') + '</button>')
  + '</div>'
  + '<div class="hs-sec"><h4>排除清单 <span class="hs-hint">不走代理直连</span></h4>' + (exRows || '<div class="hs-sd" style="padding:2px 0">暂无条目</div>') + ADD('hs_ex_in', 'hs_ex_mode', 'hs_ex_add', '域名或 IP/网段,如 corp.cn 或 10.0.0.0/8') + '</div>'
  + '<div class="hs-sec"><h4>强制代理清单 <span class="hs-hint">必须走代理,置顶优先</span></h4>' + (fcRows || '<div class="hs-sd" style="padding:2px 0">暂无条目</div>') + ADD('hs_fc_in', 'hs_fc_mode', 'hs_fc_add', '域名或 IP,如 openai.com') + '</div>'
  /* v1.8.0: 设备页并入分流页(原「设备」页签退役);独立渲染函数异步填充,不阻塞规则区首屏 */
  + '<div class="hs-sec"><h4>📱 接入设备 <span class="hs-hint">勾选=走代理 · 下拉=独立线路</span></h4>'
  + '<div id="hs_dev_pane"><div class="hs-hint">📡 采集设备中…</div></div></div>';
}
/* ---- 设置(草稿体系) ---- */
let SET_DRAFT = null;
function setDraft() {
  if (!SET_DRAFT) SET_DRAFT = {
    ports: Object.assign({}, C.ports), tun: C.tunName, iv: C.iv, lowMem: C.lowMem,
    autostart: C.autostart, bootMode: C.bootMode, coexistAuto: C.coexistAuto, ctrlLan: C.ctrlLan, policySrc: C.policySrc,
    exclude: (C.exclude || []).map(x => Object.assign({}, x)), force: (C.force || []).map(x => Object.assign({}, x))
  };
  return SET_DRAFT;
}
function listDiff(a, b) { let n = 0; if (a.length !== b.length) n += Math.abs(a.length - b.length); const bl = b.map(x => x.v + '|' + x.m); a.forEach(x => { if (bl.indexOf(x.v + '|' + x.m) < 0) n++ }); return n }
function setDiff() {
  if (!SET_DRAFT) return { n: 0, ports: [], tun: false, restart: false, rules: false };
  const d = SET_DRAFT;
  const ports = Object.keys(C.ports).filter(k => d.ports[k] !== C.ports[k]);
  const tun = d.tun !== C.tunName;
  const rulesN = listDiff(C.exclude || [], d.exclude) + listDiff(C.force || [], d.force);
  const others = (d.iv !== C.iv ? 1 : 0) + (d.lowMem !== C.lowMem ? 1 : 0) + (d.autostart !== C.autostart ? 1 : 0) + (d.bootMode !== C.bootMode ? 1 : 0) + (d.coexistAuto !== C.coexistAuto ? 1 : 0) + (d.ctrlLan !== C.ctrlLan ? 1 : 0) + (d.policySrc !== C.policySrc ? 1 : 0) + rulesN;
  return { n: ports.length + (tun ? 1 : 0) + others, ports: ports, tun: tun, restart: ports.length > 0 || tun || d.lowMem !== C.lowMem || d.ctrlLan !== C.ctrlLan || d.policySrc !== C.policySrc, rules: rulesN > 0 };
}
async function setCheck() { /* 差量:只查修改项;占用以实时监听为准,自己端口除外 */
  const errs = []; if (!SET_DRAFT) return errs;
  const d = SET_DRAFT;
  const r = await run("netstat -tln 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un", 6000);
  const listeners = (r.content || '').split(/\s+/).map(Number).filter(Boolean);
  const nm = { mixed: '混合', redir: '透明', tproxy: 'UDP', dns: 'DNS', ctrl: '控制' };
  setDiff().ports.forEach(k => {
    const v = d.ports[k];
    if (!/^\d+$/.test(String(v)) || +v < 1 || +v > 65535) { errs.push(nm[k] + '端口须为 1-65535 的整数'); return }
    if (listeners.indexOf(+v) >= 0 && C.ports[k] !== +v) { errs.push(nm[k] + '端口 ' + v + ' 已被其他进程监听'); return }
    const dup = Object.keys(d.ports).filter(k2 => k2 !== k && +d.ports[k2] === +v);
    if (dup.length) errs.push(nm[k] + '端口 ' + v + ' 与' + nm[dup[0]] + '端口重复');
  });
  if (d.tun !== C.tunName) {
    const t = await run('ip link show ' + shq(d.tun) + ' 2>/dev/null | wc -l', 5000);
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/.test(d.tun)) errs.push('网卡名须以字母开头,仅含字母/数字/-/_');
    else if ((t.content || '').trim() !== '0') errs.push('网卡名与现有网卡重名(' + d.tun + ')');
  }
  return errs;
}
async function trySetSave() {
  if (!SET_DRAFT) return true;
  const errs = await setCheck();
  if (errs.length) { toast('❌ 无法保存:' + errs[0] + (errs.length > 1 ? '(共 ' + errs.length + ' 项)' : ''), 'red'); return false }
  const d = SET_DRAFT; const df = setDiff();
  /* 赋值前采集旧值(详细变更日志: 什么从X改成Y) */
  const oldP = Object.assign({}, C.ports), oldT = C.tunName, oldIv = C.iv, oldLm = C.lowMem, oldBm = C.bootMode, oldCox = C.coexistAuto, oldAuto = C.autostart, oldCL = C.ctrlLan, oldPS = C.policySrc;
  const lstKey = x => x.m + ':' + x.v;
  const oldEx = (C.exclude || []).map(lstKey), oldFc = (C.force || []).map(lstKey);
  Object.assign(C.ports, d.ports); C.tunName = d.tun; C.iv = d.iv; /* v1.8.5: 此前误写 C.tun(死字段),虚拟网卡名改动永不生效 */ C.lowMem = d.lowMem; C.bootMode = d.bootMode; C.coexistAuto = d.coexistAuto; C.ctrlLan = d.ctrlLan; C.policySrc = d.policySrc;
  C.exclude = d.exclude; C.force = d.force;
  const autoChanged = d.autostart !== C.autostart; C.autostart = d.autostart;
  SET_DRAFT = null;
  const chg = [];
  Object.keys(d.ports).forEach(k => { if (String(d.ports[k]) !== String(oldP[k])) chg.push(k + '端口 ' + oldP[k] + '→' + d.ports[k]) });
  if (d.tun !== oldT) chg.push('网卡 ' + oldT + '→' + d.tun);
  if (d.iv !== oldIv) chg.push('测速间隔 ' + oldIv + '→' + d.iv);
  if (d.lowMem !== oldLm) chg.push('低内存 ' + oldLm + '→' + d.lowMem);
  if (d.autostart !== oldAuto) chg.push('开机自启 ' + oldAuto + '→' + d.autostart);
  if (d.bootMode !== oldBm) chg.push('启动模式 ' + oldBm + '→' + d.bootMode);
  if (d.coexistAuto !== oldCox) chg.push('ET兼容 ' + oldCox + '→' + d.coexistAuto);
  if (d.ctrlLan !== oldCL) chg.push('控制接口局域网 ' + (oldCL ? '开' : '关') + '→' + (d.ctrlLan ? '开' : '关'));
  if (d.policySrc !== oldPS) { chg.push('策略来源 ' + psTxt(oldPS) + '→' + psTxt(d.policySrc)); if (C.policySrc !== 'self') await refreshSubRaw(); }
  const newEx = (d.exclude || []).map(lstKey), newFc = (d.force || []).map(lstKey);
  oldEx.forEach(x => { if (newEx.indexOf(x) < 0) chg.push('排除-删 ' + x) });
  newEx.forEach(x => { if (oldEx.indexOf(x) < 0) chg.push('排除-增 ' + x) });
  oldFc.forEach(x => { if (newFc.indexOf(x) < 0) chg.push('强制直连-删 ' + x) });
  newFc.forEach(x => { if (oldFc.indexOf(x) < 0) chg.push('强制直连-增 ' + x) });
  await saveConf(); await opLog('设置保存: ' + (chg.join('; ') || '无实际变化'));
  if (autoChanged || d.bootMode !== oldBm) { if (C.autostart) await bootEnable(); else await bootDisable() }
  renderPane();
  /* 分流规则(排除/强制)改动需重写 config 并热重载——此前只存 JSON 不重载,规则从未进引擎 */
  if (df.rules && ST.running && !df.restart) {
    const yaml = genConfigYaml();
    if (yaml === null) { toast('⚠️ 订阅解析失败,分流改动未热重载(已保存,旧配置保留)', 'red'); return }
    await writeFile(CFG, yaml);
    const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
    if (ok) toast('✅ 分流规则已热重载生效', 'green');
    else { toast('热重载失败,平滑重启中', 'green'); await applyWithTxn('分流规则') }
  }
  if (df.restart) await askApplyNow('设置修改(' + df.n + ' 项)');
  else if (!df.rules) toast('✅ 检查通过,已保存并生效', 'green');
  return true;
}
async function guardLeaveSet() {
  if ((hsTab !== 'set' && hsTab !== 'split') || !SET_DRAFT || setDiff().n === 0) return true;
  const ok = await confirmBox({
    title: '未保存的修改', html: '<div class="hs-hint">设置有 ' + setDiff().n + ' 处修改未保存。<br>「保存」=只检查修改项并保存后离开;「放弃」=丢弃修改离开。</div>',
    okText: '保存', cancelText: '放弃'
  });
  if (ok) return await trySetSave();
  SET_DRAFT = null; toast('已放弃修改', 'green'); return true;
}
async function askApplyNow(what) {
  if (!ST.running) { toast('已保存,下次启动时生效(启动含健康验证与自动回退)', 'green'); return }
  const ok = await confirmBox({
    title: '配置已修改', html: '<div class="hs-hint">' + esc(what) + ' 需重启引擎才生效,现在平滑重启吗?<br>正式版流程:快照→应用→健康验证→失败自动回退。</div>',
    okText: '立即重启'
  });
  if (ok) { await applyWithTxn(what); C._pending = false; renderMgrFoot(); renderAll() }
  else { C && (C._pending = true); toast('已保存,稍后点底部「重启」生效', 'green'); renderMgrFoot() }
}
function geoFileDesc(ts, name, missDesc) {
  if (!ts) return '<span style="color:#e57373">' + name + ' · 未安装(' + missDesc + ')</span>';
  const d = new Date(ts * 1000);
  const dt = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const h = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (h <= 24) return '<span style="color:#66bb6a">' + name + ' 今日已更新</span> ' + dt;
  const days = Math.floor(h / 24);
  return '<span style="color:#66bb6a">' + name + ' 已装 ' + dt + '</span> <span style="color:#ffb74d">距今' + (days >= 1 ? days + ' 天' : h + ' 小时') + ',官方每日构建,建议更新</span>';
}
const GEO_FILES = {
  'hs_geo_ip': { file: 'geoip.metadb', name: 'GeoIP', min: 2097152, desc: '中国 IPv4+IPv6 段' },
  'hs_geo_site': { file: 'geosite.dat', name: 'GeoSite', min: 524288, desc: '域名分类' }
};
const GEO_BASE = 'https://github.com/MetaCubeX/meta-rules-dat/releases/latest/download/';
let hsGeoBusy = false;
async function geoInstall(key, btn) {
  const g = GEO_FILES[key]; if (!g) return;
  if (hsGeoBusy) { toast('地理数据处理中…', 'green'); return }
  hsGeoBusy = true;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = '准备…';
  const tmpF = DIR + '/.' + g.file + '.tmp';
  let ok = false;
  const gseq = dlSeq(GEO_BASE + g.file);
  for (let si = 0; si < gseq.length && !ok; si++) {
    btn.textContent = gseq[si].name + '下载中';
    await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.geo.exit') + ' ' + shq(DIR + '/.geo.pid') + '; nohup sh -c \'curl -sL --connect-timeout 8 ' + (gseq[si].px ? '-x ' + shq(gseq[si].px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(gseq[si].url) + ' 2>/dev/null & echo $! > ' + shq(DIR + '/.geo.pid') + '; wait $!; echo $? > ' + shq(DIR + '/.geo.exit') + '\' >/dev/null 2>&1 &', 5000); /* F11: 记录自有 curl PID($!+wait),清理只杀自有 */
    let lastSz = -1, stag = 0;
    for (let t = 0; t < 60; t++) {
      await wait(1500);
      const ex = await run('cat ' + shq(DIR + '/.geo.exit') + ' 2>/dev/null', 3000);
      if ((ex.content || '').trim() !== '') { if ((ex.content || '').trim() === '0') ok = true; break }
      const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
      const sz = pInt(szR);
      if (sz === lastSz) { stag++; if (stag >= 8) { await run(killOwnDl(DIR + '/.geo.pid', DIR + '/.geo.exit'), 8000); break } }
      else { stag = 0; lastSz = sz }
      if (t % 3 === 0) btn.textContent = (sz / 1048576).toFixed(1) + 'MB';
    }
  }
  await run(killOwnDl(DIR + '/.geo.pid', DIR + '/.geo.exit') + '; rm -f ' + shq(DIR + '/.geo.exit'), 8000); /* F11: 先杀自有(exit 已写则跳过,防 PID 复用误杀),再清 exit 哨兵 */
  if (!ok) {
    const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
    if ((pInt(szR)) > g.min) ok = true;
    else await run('rm -f ' + shq(tmpF), 3000);
  }
  if (!ok) {
    btn.disabled = false; btn.textContent = old; hsGeoBusy = false;
    toast('❌ ' + g.name + ' 下载失败(所有源);稍后再试', 'red'); return;
  }
  btn.textContent = '安装中';
  await run('mv ' + shq(tmpF) + ' ' + shq(DIR + '/' + g.file), 8000);
  await collectStatus();
  await opLog(g.name + ' 安装完成');
  btn.disabled = false; btn.textContent = old; hsGeoBusy = false;
  toast('✅ ' + g.name + ' 已安装(引擎运行中热重载生效)', 'green');
  renderPane();
}
/* ================= 国内直通路由表(china IP 段) ================= */
const CHN_BASE = 'https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/';
const CHN_FILES = [
  { url: 'china.txt', file: 'chnroute.txt', minLines: 5000, name: '中国 IPv4 段' },
  /* v1.8.8: cdn=国内可达直连源,排在 GitHub raw 直连之前——raw 在设备上空挂(0字节)是已知事实,
     cdn 让"直连优先"真能成(2026-10-01 用户指令:ipv6数据源优先尝试直连下载) */
  { url: 'china6.txt', file: 'chnroute6.txt', minLines: 20, name: '中国 IPv6 段',
    cdn: ['https://cdn.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt',
          'https://testingcf.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt',
          'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt'] }
];
let hsChnBusy = false;
async function chnInstall(btn) {
  if (hsChnBusy) { toast('路由表处理中…', 'green'); return }
  hsChnBusy = true;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = '下载中';
  let progEl = $('#hs_chn_prog');
  const prog = txt => { progEl = progEl || $('#hs_chn_prog'); if (progEl) progEl.innerHTML = '<div class="hs-prog-ind"></div><div class="hs-hint" style="margin-top:2px">' + txt + '</div>' };
  const progEnd = (txt, good) => { progEl = progEl || $('#hs_chn_prog'); if (progEl) progEl.innerHTML = txt ? '<div class="hs-hint" style="margin-top:2px;color:' + (good ? '#66bb6a' : '#e57373') + '">' + txt + '</div>' : '' };
  let allOk = true;
  for (const cf of CHN_FILES) {
    const tmpF = DIR + '/.' + cf.file + '.tmp';
    const dst = DIR + '/' + cf.file;
    const cur = await run('wc -l < ' + shq(dst) + ' 2>/dev/null', 3000);
    if ((pInt(cur)) >= cf.minLines) continue; /* 已装跳过 */
    let ok = false;
    /* v1.8.8: cdn 直连源优先(仅 ipv6 数据源配置了 cdn),其后保持 直连raw→本地代理→GH镜像 原序列 */
    const cdnSeq = Array.isArray(cf.cdn) ? cf.cdn.map(u => ({ name: 'CDN直连', url: u, px: '' }))
      : (cf.cdn ? [{ name: 'CDN直连', url: cf.cdn, px: '' }] : []);
    const cseq = cdnSeq.concat(dlSeq(CHN_BASE + cf.url));
    for (let si = 0; si < cseq.length && !ok; si++) {
      const srcName = cseq[si].name;
      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.chn.exit') + ' ' + shq(DIR + '/.chn.pid') + '; nohup sh -c \'curl -sL --connect-timeout 8 -m 60 ' + (cseq[si].px ? '-x ' + shq(cseq[si].px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(cseq[si].url) + ' 2>/dev/null & echo $! > ' + shq(DIR + '/.chn.pid') + '; wait $!; echo $? > ' + shq(DIR + '/.chn.exit') + '\' >/dev/null 2>&1 &', 5000); /* F11: 记录自有 curl PID($!+wait),清理只杀自有 */
      let lastSz = -1, stag = 0;
      for (let t = 0; t < 45; t++) {
        await wait(1000);
        const ex = await run('cat ' + shq(DIR + '/.chn.exit') + ' 2>/dev/null', 3000);
        if ((ex.content || '').trim() !== '') { if ((ex.content || '').trim() === '0') ok = true; break }
        const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
        const sz = pInt(szR);
        prog('⬇ ' + cf.name + ' · 源' + (si + 1) + '/' + cseq.length + ' ' + esc(srcName) + ' · ' + (sz / 1024).toFixed(1) + 'KB');
        /* v1.8.8: 停滞阈值 10→6(≈9 秒无字节即换源)——raw.githubusercontent 空挂每次白等 15-25s;
           误杀慢源由"下一源重试+最终 wc -l 复测"兜底 */
        if (sz === lastSz) { stag++; if (stag >= 6) { await run(killOwnDl(DIR + '/.chn.pid', DIR + '/.chn.exit'), 8000); break } }
        else { stag = 0; lastSz = sz }
      }
      if (!ok) {
        const lc = await run('wc -l < ' + shq(tmpF) + ' 2>/dev/null', 5000);
        if ((pInt(lc)) >= cf.minLines) ok = true;
      }
      await run('rm -f ' + shq(DIR + '/.chn.exit') + ' ' + shq(DIR + '/.chn.pid'), 3000);
      if (!ok) await run('rm -f ' + shq(tmpF), 3000);
    }
    /* v1.8.4: v4 失败不再 break——此前顺序中断导致 china6 永远没机会尝试(审计 P0 伴生) */
    if (!ok) { allOk = false; progEnd('❌ ' + cf.name + ' 全部源失败(继续尝试其余表)——可点「上传」手动导入', false); continue }
    await run('mv ' + shq(tmpF) + ' ' + shq(dst), 5000);
    progEnd('✅ ' + cf.name + ' 已下载', true);
  }
  await run(killOwnDl(DIR + '/.chn.pid', DIR + '/.chn.exit') + '; rm -f ' + shq(DIR + '/.chn.exit'), 8000); /* F11: 先杀自有(exit 已写则跳过,防 PID 复用误杀),再清 exit 哨兵 */
  await collectStatus();
  hsChnBusy = false; btn.disabled = false; btn.textContent = old;
  if (ST.chn >= CHN_FILES[0].minLines || (ST.chn6 || 0) >= 20) {
    await opLog('国内直通路由表安装 v4:' + ST.chn + ' / v6:' + (ST.chn6 || 0) + ' 条');
    toast('✅ 路由表已就绪(v4 ' + ST.chn + ' / v6 ' + (ST.chn6 || 0) + ' 条)' + (ST.running ? ',重应用规则中…' : ''), 'green');
    if (ST.running) await reapplyFw();
    renderPane();
  } else if (!allOk) {
    toast('❌ 下载失败,可点「上传」手动导入', 'red');
  }
}
function chnUpload() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.txt';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    toast('上传中:' + f.name + '(' + Math.round(f.size / 1024) + 'KB,经 upload_file 直传)…', 'green');
    try {
      const up = await hsUploadByApi(f, DIR); /* 落盘路径以响应为准(文件名 basename 由服务端定) */
      /* 上传的文件名不确定,按内容归位: 含 : 的行是 v6 */
      const r = await run('F=' + shq(up.path) + '; V4=$(grep -cE "^[0-9.]+/" "$F" 2>/dev/null); V6=$(grep -cE "^[0-9a-fA-F:]+:" "$F" 2>/dev/null); '
        + 'if [ "$V4" -ge 5000 ]; then mv "$F" ' + shq(DIR + '/chnroute.txt') + '; elif [ "$V6" -ge 20 ]; then mv "$F" ' + shq(DIR + '/chnroute6.txt') + '; fi; '
        + 'echo v4=$V4 v6=$V6', 10000);
      await collectStatus();
      /* v1.8.5: 判定改为 v4/v6 双计数(shell 回显),此前只看 ST.chn——只传 v6 表时会误报"导入失败"
         且不重应用(2026-09-13 审查 P2) */
      const m4 = (ct(r) || '').match(/v4=(\d+)\s+v6=(\d+)/) || [];
      const shellOk = (parseInt(m4[1] || '0', 10) >= 5000) || (parseInt(m4[2] || '0', 10) >= 20);
      const okAny = shellOk || ((ST.chn || 0) >= 5000) || ((ST.chn6 || 0) >= 20);
      if (okAny) {
        toast('✅ 路由表已导入(v4 ' + (ST.chn || 0) + ' / v6 ' + (ST.chn6 || 0) + ' 条)', 'green');
        if (ST.running) await reapplyFw();
      } else {
        toast('导入失败:文件应为中国IP段列表(每行一个 CIDR),已丢弃', 'red');
        await run('rm -f ' + shq(up.path) + ' 2>/dev/null', 4000);
      }
      renderPane();
    } catch (e) { toast('上传异常:' + e, 'red') }
  };
  inp.click();
}

function paneSet() {
  const D = SET_DRAFT;
  const DP = D ? D.ports : C.ports;
  const R = (t, d, c) => '<div class="hs-row"><div class="hs-sl"><div class="hs-st">' + t + '</div>' + (d ? '<div class="hs-sd">' + d + '</div>' : '') + '</div><div class="hs-sc">' + c + '</div></div>';
  let h = '<div class="hs-pghead"><span class="hs-hint" style="flex:1" id="hs_set_dirty"></span><button class="btn hs-sm" id="hs_port_reset" title="草稿填入默认端口">默认</button><button class="btn hs-sm" id="hs_set_discard">放弃</button><button class="btn hs-sm hs-pri" id="hs_set_save">保存</button></div>'
  + '<div class="hs-hint" style="margin:0 2px 6px">本页为草稿编辑,点「保存」统一生效;只检查修改项,不过不许存</div>'

  + '<div class="hs-sec"><h4>帮助</h4>'
  + R('使用说明', '在线图文引导:5 步上手 / 日常使用 / 常见问题(浏览器新页打开)', '<button class="btn hs-sm" id="hs_set_guide">打开 ›</button>')
  + '</div>'
  + '<div class="hs-sec"><h4>安装与更新</h4>'
  + R('内核版本', 'mihomo stable · ' + esc(hsArch === 'unknown' ? '点击下方安装' : 'linux-' + hsArch), ST.bin ? '<span style="font-size:.8rem;color:#bcd2ff">v' + esc(C.ver || '已安装') + '</span>' : '<span class="hs-hint">未安装</span>')
  + (ST.bin ? '<div class="hs-actions"><button class="btn hs-sm" id="hs_chk_up">检查更新</button><button class="btn hs-sm" id="hs_up_core">上传新版</button></div>' : '<div class="hs-actions"><button class="btn hs-sm hs-pri" id="hs_install_guide">安装内核</button></div>')
  + '<div class="hs-sd" style="padding:6px 2px 0">下载策略:直连优先→引擎运行时走本地代理→加速源兜底(自动,无需选择)</div>'
  + '</div>'
  + '<div class="hs-sec"><h4>配置备份</h4>'
  + R('导出配置', '下载 json 到本地(开关/白名单/订阅/端口/清单)', '<button class="btn hs-sm" id="hs_conf_exp">导出</button>')
  + R('导入配置', '选择之前导出的 json,覆盖当前配置', '<button class="btn hs-sm" id="hs_conf_imp">导入</button>')
  + '</div>'
  + '<div class="hs-sec"><h4>外部卡片 <span class="hs-hint">面板首页的展示形式</span></h4>'
  + R('卡片模式', '完整=折叠卡+状态+多按钮;简洁=仅状态两行(点击进入);单按钮=与 UFI-Tools 功能按钮同风格', '<div class="hs-seg" id="hs_seg_card">'
  + '<button data-v="full" class="' + ((C.cardMode || 'full') === 'full' ? 'on' : '') + '">完整</button>'
  + '<button data-v="simple" class="' + (C.cardMode === 'simple' ? 'on' : '') + '">简洁</button>'
  + '<button data-v="btn" class="' + (C.cardMode === 'btn' ? 'on' : '') + '">单按钮</button>'
  + '</div>')
  + '</div>'
  + '<div class="hs-sec"><h4>高级</h4>'
  + R('混合代理端口', '终端手动配置代理用(总览可复制)', '<input class="hs-vin" data-port="mixed" value="' + DP.mixed + '">')
  + '<details class="hs-fold"><summary><span>内部端口 <span class="hs-hint">· 插件自用,通常无需修改</span></span><span class="hs-hint" style="display:flex;align-items:center;gap:4px"><span class="hs-tcl">点击展开</span><span class="hs-top">点击收起</span><span class="hs-chev">▸</span></span></summary><div style="padding:0 4px">'
  + R('透明代理', '引擎接管终端流量的内部入口', '<input class="hs-vin" data-port="redir" value="' + DP.redir + '">')
  + R('DNS', '引擎域名解析服务', '<input class="hs-vin" data-port="dns" value="' + DP.dns + '">')
  + R('控制', '面板与引擎通信,仅监听本机', '<input class="hs-vin" data-port="ctrl" value="' + DP.ctrl + '">')
  + '</div></details>'
  + R('虚拟网卡名', 'TUN 网卡标识,冲突时诊断提示', '<input class="hs-vin" id="hs_set_tun" value="' + esc(D ? D.tun : C.tunName) + '" style="width:84px">')
  + R('测速间隔', '自动选优的测速周期', '<div class="hs-seg" id="hs_seg_iv">' + [120, 300, 600].map(v => '<button data-v="' + v + '" class="' + (((D ? D.iv : C.iv) + '') === ('' + v) ? 'on' : '') + '">' + v + 's</button>').join('') + '</div>')
  + R('低内存模式', '内存更紧张时启用(限制48M;默认128M软限)', '<label class="hs-sw"><input type="checkbox" id="hs_set_lowmem" ' + ((D ? D.lowMem : C.lowMem) ? 'checked' : '') + '><span></span></label>')
  + R('开机自启', '写入 ' + BOOT_SH, '<label class="hs-sw"><input type="checkbox" id="hs_set_auto" ' + ((D ? D.autostart : C.autostart) ? 'checked' : '') + '><span></span></label>')
  + R('控制接口开放局域网', '关闭=仅本机 127.0.0.1 访问(默认);开启=0.0.0.0,局域网设备可用 API 面板(如 Clash 面板/dash)管理节点', '<label class="hs-sw"><input type="checkbox" id="hs_set_ctrlLan" ' + ((D ? D.ctrlLan : C.ctrlLan) ? 'checked' : '') + '><span></span></label>')
  + ((D ? D.ctrlLan : C.ctrlLan) ? '<div style="margin:2px 2px 6px;padding:6px 10px;border:1px solid rgba(229,115,115,.4);border-radius:8px;font-size:.68rem;color:#e57373">⚠️ 开启后同一局域网内任意设备都可尝试访问控制接口,接口密钥是唯一防线——请确认密钥强度,不用时及时关闭</div>' : '')
  + R('策略来源', '自建=小海关四模式调度+分设备线路;合并=订阅节点与分类组接入本地调度,规则冲突以本地为准(推荐);直通=订阅策略整体生效,小海关垫国内直通兜底。切换需重启引擎', '<div class="hs-seg" id="hs_seg_policy">'
  + ['self', 'merge', 'direct'].map(v => '<button data-v="' + v + '" class="' + ((D ? D.policySrc : C.policySrc) === v ? 'on' : '') + '">' + PS_TXT[v] + '</button>').join('')
  + '</div>')
  + ((D ? D.policySrc : C.policySrc) === 'merge'
    ? '<div style="margin:2px 2px 6px;padding:6px 10px;border:1px solid rgba(102,187,106,.4);border-radius:8px;font-size:.68rem;color:#8fe39a">✅ 合并模式:四模式调度/分设备线路全部生效;订阅节点进候选池,订阅分类组(流媒体/AI 等)原样保留;规则冲突以本地为准,重复自动去重;兜底 MATCH 指向本地主组</div>'
    : (D ? D.policySrc : C.policySrc) === 'direct'
    ? '<div style="margin:2px 2px 6px;padding:6px 10px;border:1px solid rgba(255,183,77,.4);border-radius:8px;font-size:.68rem;color:var(--warn,#ffb74d)">⚠️ 直通模式:四模式调度/分设备线路/节点直选不生效(由订阅自己的组接管);强制清单与出海例外折中注入订阅第一个手动组;国内直通兜底已垫在订阅规则前</div>'
    : '')+
    R('开机行为', bootDesc(D), '<div class="hs-seg" id="hs_seg_boot">'
  + '<button data-v="keep" style="font-size:.64rem" class="' + ((D ? D.bootMode : C.bootMode) === 'keep' ? 'on' : '') + '"' + ((D ? D.autostart : C.autostart) ? '' : ' disabled') + '>恢复上次</button>'
  + '<button data-v="core" style="font-size:.64rem" class="' + ((D ? D.bootMode : C.bootMode) === 'core' ? 'on' : '') + '"' + ((D ? D.autostart : C.autostart) ? '' : ' disabled') + '>只起引擎</button></div>')
  + '</div>'
  + '<div class="hs-sec" style="border-color:rgba(229,115,115,.35)"><h4 style="color:#e57373">危险区</h4>'
  + R('卸载小海关', '停止引擎、清除防火墙规则/自启;可选拆数据目录与配置备份(三连击防误触)', '<button class="btn hs-sm hs-dgr" id="hs_set_un">卸载</button>')
  + '</div>';
  return h;
}
/* ---- 日志页签 ---- */
let hsLogTab = 'run', hsLogTimer = null;
/* v2.0.3: 打开日志页的默认页签——运行日志关闭时直接落在操作日志(有内容可看),开着则运行日志 */
function stopLogTimer() { if (hsLogTimer) { clearInterval(hsLogTimer); hsLogTimer = null } }
function paneLog() {
  /* v2.0.3: 关闭态不再整页短路——运行日志 tab 显示开启引导,操作日志 tab 照常可看(审计常开);
     此前开关一关连操作日志页签都不渲染,常开记录被埋没(2026-10-01 用户反馈) */
  if (!C.logEnabled && hsLogTab === 'run') {
    return '<div style="text-align:center;padding:24px 10px"><div style="font-size:1.7rem">📄</div>'
    + '<div style="font-weight:700;margin:8px 0 4px">运行日志已关闭(操作日志始终记录)</div>'
    + '<div class="hs-hint">此开关仅控制引擎运行日志(stdout)落盘;安装/订阅/规则等操作审计不受影响——切到「操作日志」页签查看。<br>排查问题时临时开启,用完可再关。</div>'
    + '<div style="margin-top:16px"><button class="btn hs-pri" id="hs_log_enable" style="padding:8px 26px">开启运行日志</button></div></div>'
    + '<div style="display:flex;gap:6px;justify-content:center;margin-top:6px"><button class="btn hs-sm" data-logtab="op">查看操作日志 ›</button></div>';
  }
  let lv = '';
  ['silent', 'info', 'warning', 'debug'].forEach(l => { lv += '<button data-v="' + l + '" class="' + (C.logLevel === l ? 'on' : '') + '">' + l + '</button>' });
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">'
  + '<span style="font-size:.78rem">启用日志</span><label class="hs-sw"><input type="checkbox" id="hs_log_en" checked><span></span></label>'
  + '<span style="font-size:.78rem;margin-left:10px">级别</span><div class="hs-seg" id="hs_seg_lvl">' + lv + '</div>'
  + '<span class="hs-hint" style="flex:1;text-align:right">级别改动写配置,重启引擎生效</span></div>'
  + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">'
  + '<div class="hs-seg" id="hs_log_tabs" style="flex:1;min-width:150px"><button data-f="run" class="' + (hsLogTab === 'run' ? 'on' : '') + '">运行日志</button><button data-f="op" class="' + (hsLogTab === 'op' ? 'on' : '') + '">操作日志</button></div>'
  + '<button class="btn hs-sm" id="hs_log_exp">导出</button><button class="btn hs-sm" id="hs_log_clr">清空</button></div>'
  + '<pre class="hs-pre" id="hs_log_pre">加载中…</pre><div class="hs-hint" style="margin-top:6px" id="hs_log_hint"></div>';
}
async function renderLogBody() {
  const pre = $('#hs_log_pre'); if (!pre) return;
  const f = hsLogTab === 'run' ? LOGF : OPLOG;
  /* 安全读取: 超256KB只取尾部100KB(51MB全量base64致面板崩溃实测) */
  const r = await run('SZ=$(wc -c < ' + shq(f) + ' 2>/dev/null || echo 0); echo "=SZ=$SZ"; if [ "$SZ" -gt 262144 ]; then echo "=BIG"; tail -c 102400 ' + shq(f) + ' 2>/dev/null; else tail -n 120 ' + shq(f) + ' 2>/dev/null; fi', 8000);
  const lines = (r.content || '').split('\n');
  const szM = (lines[0] || '').match(/^=SZ=(\d+)/);
  const sz = szM ? parseInt(szM[1]) : 0;
  const isBig = (lines[1] || '') === '=BIG';
  const body = lines.slice(isBig ? 2 : 1).join('\n').trim();
  const warnBig = isBig ? '[\u26a0\ufe0f \u65e5\u5fd7' + (sz/1048576).toFixed(1) + 'MB,\u4ec5\u663e\u793a\u5c3e\u90e8100KB]\n\n' : '';
  pre.textContent = warnBig + (body || '(暂无)');
  pre.scrollTo({ top: 99999 });
  const hint = $('#hs_log_hint');
  if (hint) hint.textContent = hsLogTab === 'run' ? '引擎输出(1.5s 自动刷新,重启引擎后完全生效)' : '插件操作审计(append-only,256KB 轮转)';
}
/* ================= 残留检测 ================= */
async function checkResidue() {
  /* v1.8.5: 扩 v6(此前只查 v4——v6 规则残留=引擎不在场仍把 v6 REDIRECT 到 :7892 的黑洞,
     卡片却显示"已停止(正常)",init 自愈也不触发)(2026-09-13 审查 P2) */
  const r = await run('iptables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N";'
    + ' iptables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N";'
    + ' ip rule show 2>/dev/null | grep -c "lookup 100";'
    + ' ip6tables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N";'
    + ' ip6tables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N";'
    + ' ip -6 rule show 2>/dev/null | grep -c "lookup 100"', 8000);
  const nums = (r.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
  ST.residue = nums.some(n => n > 0);
  return ST.residue;
}
/* 升级对账(2026-09-03,UDP 修复配套): 从低版本升级上来,盘上三件套(fw.sh/start.sh/config.yaml)
   可能还是旧版生成的。v1.4.7 起生成时烙 #gen:vX.Y.Z,此处语义化比对;更早版本生成的文件无烙印=恒判旧。
   只引导重启不自动代劳: ①自动重启=打开面板即断流数秒;②只换 fw 不换 yaml 更危险——
   TPROXY 规则把 UDP 打到 7893,旧架构 mihomo 未监听该端口,先挂规则=UDP 黑洞。
   引擎未跑时不查: 下次启动 engineStart 自然全量重生成三件套,无升级动作需要 */
async function upgradeAudit() {
  if (!ST.running) return;
  /* 版本烙印比对(2026-09-03 增强): 三件套生成时烙 #gen:vX.Y.Z,此处读出与当前 V 语义化比对;
     v1.4.7 前生成的文件无烙印(读空)→天然判旧,向后兼容旧指纹逻辑。
     「运行规则缺失」不在此判——规则丢失归诊断 rt-fw 项管 */
  const r = await run(
    'F=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(FW) + ' 2>/dev/null | cut -dv -f2); echo F=${F:-0}'
    + '; S=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(START) + ' 2>/dev/null | cut -dv -f2); echo S=${S:-0}'
    + '; Y=$(grep -m1 -o "#gen:v[0-9.]*" ' + shq(CFG) + ' 2>/dev/null | cut -dv -f2); echo Y=${Y:-0}', 8000);
  const m = (r.content || '').match(/F=([\d.]*)\s+S=([\d.]*)\s+Y=([\d.]*)/) || [];
  if (!m.length) return;
  const cmp = v => !v ? -1 : verCmp(v, V); /* 无烙印=旧版生成,恒待升级 */
  const old = [];
  if (cmp(m[3]) < 0) old.push('内核配置' + (m[3] ? ' v' + m[3] : '(旧架构)'));
  if (cmp(m[1]) < 0) old.push('防火墙脚本' + (m[1] ? ' v' + m[1] : '(旧版)'));
  if (cmp(m[2]) < 0) old.push('启动脚本' + (m[2] ? ' v' + m[2] : '(旧版,自启不挂规则)'));
  /* 盘上最低烙印(=用户"正在运行"的版本),无任何烙印取 1.4.4 作 changelog 展示下限 */
  /* 无烙印与回退值 '0' 都不算(shell ${F:-0} 把缺烙印读成 0,2026-09-03 实测标题曾显示 0→x),全无取 1.4.4 作展示下限 */
  const gens = [m[1], m[2], m[3]].filter(v => v && v !== '0').sort(verCmp);
  ST.upgradeFrom = gens.length ? gens[0] : '1.4.4';
  /* 降级运行(已回滚): 插件版本未超过回滚时的版本 → 静默不催升级(用户已行使决定权);
     发布了新版本(V > rolledFrom)→ 恢复升级提示(新版本可能已修复导致回滚的问题),弹卡注明 */
  if (old.length && C.upgBackup && C.upgBackup.rolledBack && verCmp(V, C.upgBackup.rolledFrom || '9.9.9') <= 0) {
    ST.upgradePending = []; ST.downgraded = true;
    await opLog('降级运行(' + ST.upgradeFrom + '),已回滚且无更新版本,静默');
    return;
  }
  ST.downgraded = !!(C.upgBackup && C.upgBackup.rolledBack);
  /* 备份 3 天自动清理(升级成功正常运行窗口期过后;回滚过的备份已即时清,此处兜底;静默不通知) */
  if (C.upgBackup && !C.upgBackup.rolledBack) {
    const bt = new Date(String(C.upgBackup.time || '').replace(' ', 'T'));
    if (!isNaN(bt) && Date.now() - bt.getTime() > 3 * 86400000) {
      await run('rm -rf ' + shq(UBAK), 5000);
      C.upgBackup = null; await saveConf();
      await opLog('升级备份已超 3 天,自动清理');
    }
  }
  ST.upgradePending = old; /* 齐备时置空数组,诊断凭 undefined 区分"未检测"与"已检测";诊断页同源展示 */
  if (!old.length) return;
  /* v2.8.10: 通俗化提示(用户定调)——升级入口=卡片「⬆️待升级」徽标/配置页升级卡,非重启引擎 */
  const msg = '小海关已更新到 v' + V + ',点击卡片「⬆️ 待升级」完成升级';
  if (typeof createToast === 'function') createToast('⬆️ ' + msg, 'pink', 9000);
  else console.log('[小海关] ' + msg);
  await opLog('升级对账:' + old.join(',') + '(→v' + V + '),待升级(卡片徽标入口)');
}
/* 升级弹卡: 打开配置页时若待升级弹一次(每页面会话一次),列更新内容+一键升级 */
let HS_UPG_POPPED = false;
function upgradeCardHtml() {
  const from = ST.upgradeFrom || '1.4.4';
  const entries = Object.keys(CHANGELOG).filter(k => verCmp(k, from) > 0)
    .sort((a, b) => verCmp(b, a)).map(k => '<li style="margin:3px 0"><b>' + k + '</b> ' + esc(CHANGELOG[k]) + '</li>').join('');
  const rolledNote = (C.upgBackup && C.upgBackup.rolledBack) ? '<div class="hs-hint" style="margin-bottom:6px;color:#ffb74d">⚠️ 你此前回滚过(' + esc(C.upgBackup.rolledFrom || '?') + ' 之后),新版本可能已修复当时的问题。</div>' : '';
  return rolledNote + (entries
    ? '<ul style="margin:4px 0 8px;padding-left:18px;font-size:.72rem;line-height:1.5">' + entries + '</ul>'
    : '<div class="hs-hint" style="margin:6px 0">问题修复与体验改进</div>')
    /* 打开配置按钮: 徽标/单按钮入口弹卡时给用户进入配置的通路(否则单按钮模式点稍后=无法再进配置);
       mgr 顶层自动弹出时隐藏——已身在配置面板 */
    + '<div style="display:flex;gap:8px"><button class="btn hs-pri" id="hs_upg_go" style="flex:1.4">⬆️ 立即升级</button>'
    + (!window.__hsMgrOpen ? '<button class="btn" id="hs_upg_cfg">打开配置</button>' : '')
    + '<button class="btn" id="hs_upg_no">稍后再说</button></div>';
}
function maybePopUpgradeCard() {
  if (HS_UPG_POPPED || !(ST.upgradePending && ST.upgradePending.length)) return;
  HS_UPG_POPPED = true;
  showUpgradeCard();
}
/* 统一升级弹窗(三种卡片形态+配置页自动弹 全复用): 更新日志+一键升级;
   弹卡期间加全屏遮罩冻结背后操作(此前 simple 弹窗无遮罩,mgr 的按钮全都可点=困惑源) */
function showUpgradeCard() {
  if (!(ST.upgradePending && ST.upgradePending.length)) return;
  HS_UPG_POPPED = true; /* 手动弹过也算已提醒,本会话内 openMgr 不再自动弹(防徽标→稍后→开配置又被弹) */
  window.__hsMgrOpen = !!(document.getElementById('hs_modal_mgr') && document.getElementById('hs_modal_mgr').style.display !== 'none');
  let mask = document.getElementById('hs_upg_mask');
  if (!mask) {
    mask = document.createElement('div');
    mask.id = 'hs_upg_mask';
    mask.style.cssText = 'position:fixed;inset:0;z-index:108;background:rgba(0,0,0,.45)';
    mask.onclick = () => mHide('hs_modal_simple'); /* 点蒙层=关闭(升级不中断) */
    document.body.appendChild(mask);
  }
  hsOpenSimple('⬆️ 小海关待升级 (' + (ST.upgradeFrom || '?') + ' → ' + V + ')', upgradeCardHtml());
  $('#hs_upg_go').onclick = async () => {
    if (!ST.running) { mHide('hs_modal_simple'); rmUpgMask(); toast('引擎未运行,直接点「启动」即可用上新版组件', 'green'); return }
    /* v2.1.11: 不先 mHide——进度窗与升级卡同用 hs_modal_simple,同 tick 先关后开会被面板关窗收尾压制
       (v2.1.4 在安装引导处修过同型 bug,此处漏修=真机"点升级后界面一闪就过去",升级全程后台隐形);
       doUpgradeRestart→upgShow('run') 直接换内容+显窗,遮罩已在位不重复建 */
    await doUpgradeRestart(document.getElementById('hs_mf_restart'));
  };
  const cfgBtn = $('#hs_upg_cfg');
  if (cfgBtn) cfgBtn.onclick = () => { mHide('hs_modal_simple'); rmUpgMask(); openMgr('ov') };
  $('#hs_upg_no').onclick = () => { mHide('hs_modal_simple'); rmUpgMask() };
}
function rmUpgMask() { const m = document.getElementById('hs_upg_mask'); if (m && m.remove) m.remove() }
/* ================= 升级编排(进度弹窗/备份/回滚/降级标记) ================= */
const UBAK = DIR + '/upgrade_backup';
/* 升级进度弹窗内容(阶段化;关闭弹窗不阻断升级,仅失去交互动画) */
function upgProgHtml(stage, extra) {
  if (stage === 'run') return '<div style="text-align:center;padding:6px 0">'
    + '<div class="hs-prog-ind"></div>'
    + '<div style="font-size:.8rem;margin-top:8px">升级中…</div>'
    + '<div class="hs-hint" style="margin-top:4px">' + (extra || '备份组件 → 重生成三件套 → 重启引擎 → 验证(约 5-15 秒,期间接管短暂中断)') + '</div>'
    + '<div class="hs-hint" style="margin-top:8px;opacity:.7">关闭本窗口不会中断升级,完成后将以通知告知</div></div>';
  if (stage === 'ok') return '<div style="text-align:center;padding:6px 0">'
    + '<div style="font-size:1.6rem">✅</div>'
    + '<div style="font-size:.84rem;margin-top:4px">升级成功(' + extra.from + ' → ' + V + ')</div>'
    + '<div class="hs-hint" style="margin-top:4px" id="hs_upg_cd">3 秒后自动关闭</div>'
    + '<button class="btn hs-sm" id="hs_upg_close" style="margin-top:8px">立即关闭</button></div>';
  /* 失败: 保留窗口+原因+回滚 */
  return '<div style="padding:6px 0">'
    + '<div style="font-size:1.6rem;text-align:center">❌</div>'
    + '<div style="font-size:.84rem;text-align:center;margin-top:2px;color:#e57373">升级失败</div>'
    + '<div class="hs-hint" style="margin-top:8px;border:1px solid rgba(229,115,115,.35);border-radius:8px;padding:8px">原因:' + esc(extra || '未知(可开启日志后重试)') + '</div>'
    + '<div class="hs-hint" style="margin-top:6px">引擎可能处于停止或异常状态;可回滚到升级前组件(' + (C.upgBackup ? C.upgBackup.from : '?') + ')或重试</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn hs-dgr" id="hs_upg_rb">↩️ 回滚到 ' + (C.upgBackup ? C.upgBackup.from : '上一版') + '</button><button class="btn" id="hs_upg_retry">重试升级</button><button class="btn" id="hs_upg_close">关闭</button></div></div>';
}
function upgShow(stage, extra) {
  let mask = document.getElementById('hs_upg_mask');
  if (!mask) { mask = document.createElement('div'); mask.id = 'hs_upg_mask'; mask.style.cssText = 'position:fixed;inset:0;z-index:108;background:rgba(0,0,0,.45)'; mask.onclick = () => mHide('hs_modal_simple'); document.body.appendChild(mask) }
  hsOpenSimple(stage === 'ok' ? '✅ 升级完成' : stage === 'fail' ? '❌ 升级失败' : '⬆️ 正在升级', upgProgHtml(stage, extra));
  document.getElementById('hs_upg_close') && (document.getElementById('hs_upg_close').onclick = () => { mHide('hs_modal_simple'); rmUpgMask() });
}
function upgCardClosed() { const m = document.getElementById('hs_modal_simple'); return !m || m.style.display === 'none' }
/* 升级重启统一入口(底栏按钮/弹卡按钮/徽标入口共用)。
   弹窗保持打开转进度态;用户关闭仅失去动画,升级不中断;成功 3s 倒计时关窗,失败保留+原因+回滚 */
async function doUpgradeRestart(btn) {
  if (HS_UPGRADING) { upgShow('run'); return }
  HS_UPGRADING = true; HS_LAST_ERR = '';
  const from = ST.upgradeFrom || '?';
  try {
    /* 备份三件套(覆盖式单份;不备份内核/geo 等大文件——设备存储小)。
       同源复用: 备份在且源版本一致 → 不重新备份——失败重试时盘上可能是半新半旧
       (新 yaml 已落盘但引擎未起),重新备份会污染回滚基准;跨版本(真连续升级)才覆盖 */
    const sameSrc = C.upgBackup && !C.upgBackup.rolledBack && C.upgBackup.from === from;
    if (!sameSrc) {
      const bk = await run('mkdir -p ' + shq(UBAK) + ' && cp ' + shq(FW) + ' ' + shq(START) + ' ' + shq(CFG) + ' ' + shq(UBAK) + '/ 2>/dev/null; ls ' + shq(UBAK) + ' 2>/dev/null | wc -l', 8000);
      const bkOk = parseInt((bk.content || '').trim()) >= 3;
      C.upgBackup = bkOk ? { from: from, time: nowStr(), rolledBack: false } : null;
      await saveConf();
    }
    upgShow('run');
    HS_UPG_OK = false;
    try { await engineRestart() } catch (e) { HS_LAST_ERR = '执行异常:' + e }
    C._pending = false;
    if (HS_UPG_OK && !HS_LAST_ERR) {
      await opLog('升级成功(' + from + '→' + V + '),备份保留至 ' + (C.upgBackup ? C.upgBackup.time : '?'));
      /* 升级态即时清:状态页横幅/底栏⬆️高亮/卡片徽标都是渲染时快照,升级完成后必须重渲染
         (无后台轮询纪律下不刷=用户看着"升级成功了还提示待升级",2026-09-13 真机实锤) */
      renderPane(); renderMgrFoot(); renderCard();
      if (upgCardClosed()) { toast('✅ 升级完成:接管组件 ' + from + ' → ' + V, 'green') }
      else {
        upgShow('ok', { from: from });
        let n = 3;
        const iv = setInterval(() => {
          n--; const cd = document.getElementById('hs_upg_cd');
          if (upgCardClosed() || n <= 0) { clearInterval(iv); mHide('hs_modal_simple'); rmUpgMask() }
          else if (cd) cd.textContent = n + ' 秒后自动关闭';
        }, 1000);
      }
    } else {
      await opLog('升级失败:' + (HS_LAST_ERR || '引擎未就绪') + ',开始自动回滚');
      mHide('hs_modal_simple'); rmUpgMask();
      if (C.upgBackup && !C.upgBackup.rolledBack) {
        const cp = await run('cp ' + shq(UBAK) + '/fw.sh ' + shq(FW) + ' && cp ' + shq(UBAK) + '/start.sh ' + shq(START) + ' && cp ' + shq(UBAK) + '/config.yaml ' + shq(CFG) + ' 2>&1; echo R=$?', 8000);
        if (/R=0/.test(cp.content || '')) {
          const rbFrom = C.upgBackup.from;
          C.upgBackup.rolledBack = true; C.upgBackup.rolledFrom = V;
          await saveConf();
          /* F12: 恢复模式启动(跳过重生成,不覆盖刚恢复的三件套);验证成功后才清备份(失败保留可重试) */
          const rbOk = await engineRestart(true);
          if (rbOk) await run('rm -rf ' + shq(UBAK), 5000);
          ST.upgradePending = []; ST.upgradeFrom = rbFrom;
          toast(rbOk ? '升级失败已自动回滚到 v' + rbFrom + '(如需重试请重启引擎)' : '升级失败,备份文件已恢复但引擎未就绪(备份保留,可再点重启)', rbOk ? 'orange' : 'red');
          await opLog(rbOk ? '升级失败自动回滚到 ' + rbFrom : '自动回滚未通过恢复复核,备份保留:' + (HS_LAST_ERR || '引擎未就绪'));
          renderPane(); renderMgrFoot(); renderCard(); /* 回滚后同样即时刷新 */
        } else {
          toast('升级失败且回滚异常,请手动重启引擎', 'red');
          await opLog('升级失败且自动回滚异常: ' + (cp.content || '').slice(0, 80));
        }
      } else {
        toast('升级失败(无备份可回滚): ' + (HS_LAST_ERR || '引擎未就绪'), 'red');
      }
    }
  } finally {
    HS_UPGRADING = false;
    renderMgrFoot(); renderCard();
  }
}
/* 回滚: 恢复升级前三件套并重启;标记降级运行(rolledBack+rolledFrom),
   之后 audit 静默不再催升级,直到插件版本 > rolledFrom(新版发布)才恢复提示 */
async function rollbackUpgrade() {
  const okc = await confirmBox({ title: '回滚到 ' + (C.upgBackup ? C.upgBackup.from : '上一版本'), danger: true, okText: '回滚',
    html: '<div class="hs-hint">将恢复升级前的接管组件(防火墙/启动脚本/内核配置)并重启引擎。<br>回滚后插件处于<b>降级运行</b>状态:不再提示升级,直到新版本插件发布;新版本可能已修复导致回滚的问题。</div>' });
  if (!okc) return;
  await op(null, async () => {
    const cp = await run('cp ' + shq(UBAK) + '/fw.sh ' + shq(FW) + ' && cp ' + shq(UBAK) + '/start.sh ' + shq(START) + ' && cp ' + shq(UBAK) + '/config.yaml ' + shq(CFG) + ' 2>&1; echo R=$?', 8000);
    /* F12: 原正则字面量内含 0x08 退格字节(模式实为 R\b=0\b),真实输出 R=0 恒不匹配——
       恢复成功被误判失败提前 return(核验 R01 红灯);本行重写清除隐形字节 */
    HS_UPGRADING = true; /* F12: 恢复期间与升级同防——syncLineRules 线路热重载/外部 reapplyFw
       并发在此窗口会 genConfigYaml 重写 CFG,覆盖刚恢复的备份(collectStatus 探活必经它) */
    try {
    if (!/R=0/.test(cp.content || '')) { toast('备份恢复失败(文件缺失?)', 'red'); return }
    C.upgBackup.rolledBack = true; C.upgBackup.rolledFrom = V;
    await saveConf();
    /* F12: 恢复模式启动(不重新生成三件套);验证成功后才清备份 */
    const rbOk = await engineRestart(true);
    if (rbOk) await run('rm -rf ' + shq(UBAK), 5000); /* 已恢复且复核通过,备份即清(单份不留) */
    ST.upgradePending = []; ST.upgradeFrom = C.upgBackup.from;
    await opLog(rbOk ? '已回滚到 ' + C.upgBackup.from + ',降级运行(新版本插件发布前不再提示升级)' : '回滚文件已恢复但引擎未就绪(备份保留,可重试):' + (HS_LAST_ERR || ''));
    } finally { HS_UPGRADING = false }
  }, null, '回滚中…');
  renderMgrFoot(); renderCard();
}
/* ================= 页签事件绑定 ================= */
function bindPane(tab, p) {
  const etf = p.querySelector('#hs_et_fold');
  /* 双保险: 初始读取一次 + 每次展开折叠区重新读取填充(展开瞬间 DOM 稳定,不受页面重渲染影响) */
  const fillEt = () => readEtState().then(() => {
    const b = $('#hs_et_body'); if (!b) return;
    if (!ET_CACHE) {
      b.innerHTML = '<div class="hs-hint">未读取到 ET组网 状态' + (ET_ERR ? '<br>原因: ' + esc(ET_ERR) : '(检查 ET 的「状态文件输出」是否开启)') + '</div>';
      if (ET_ERR && ET_ERR !== ET_ERR_LOGGED) { opLog('ET路由表读取失败: ' + ET_ERR); ET_ERR_LOGGED = ET_ERR } /* v2.7.21: 同错误只记一次 */
      else if (!ET_ERR) ET_ERR_LOGGED = '';
      return
    }
    const j = ET_CACHE;
    b.innerHTML =
      '<div class="hs-li">' + (j.active ? '<span style="color:#66bb6a">● 组网运行中</span>' : '<span style="color:#b3bdcb">● 组网未运行</span>') + ' · 更新于 ' + esc(j.updated || '?') + '</div>'
      + (j.tun ? '<div class="hs-li">TUN 网卡: <b>' + esc(j.tun) + '</b></div>' : '')
      + '<div class="hs-li">网段 ' + ((j.cidrs || []).length) + ' 条(防火墙层排除,不进代理):</div>'
      + '<div style="padding:2px 0 4px 12px;display:flex;flex-wrap:wrap;gap:6px">' + ((j.cidrs || []).map(c => '<span class="hs-hint hs-badge">' + esc(c) + '</span>').join('') || '<span class="hs-hint">无</span>') + '</div>'
      + '<div class="hs-li">打洞端口 ' + ((j.p2p_ports || []).length) + ' 个(UDP/TCP 排除):</div>'
      + '<div style="padding:2px 0 0 12px;display:flex;flex-wrap:wrap;gap:6px">' + ((j.p2p_ports || []).map(c => '<span class="hs-hint hs-badge">' + esc(c) + '</span>').join('') || '<span class="hs-hint">无</span>') + '</div>';
  }).catch(err => { const b = $('#hs_et_body'); if (b) b.innerHTML = '<div class="hs-hint">catch: ' + esc(String((err && err.message) || err).slice(0, 80)) + '</div>'; opLog('ET路由表异常: ' + String((err && err.message) || err).slice(0, 80)) });
  if (etf) { fillEt(); etf.ontoggle = () => { if (etf.open) fillEt() } }


  const syncBar = () => {
    const barId = tab === 'set' ? '#hs_set_bar' : '#hs_sp_bar';
    const bar = p.querySelector(barId) || p; /* 容器已融入 pghead,向上兼容 */
    const n = setDiff().n;
    const sv = bar.querySelector(tab === 'set' ? '#hs_set_save' : '#hs_sp_save');
    const dc = bar.querySelector(tab === 'set' ? '#hs_set_discard' : '#hs_sp_discard');
    if (sv) sv.disabled = n === 0; if (dc) dc.disabled = n === 0;
    const dh = p.querySelector(tab === 'set' ? '#hs_set_dirty' : '#hs_sp_dirty');
    if (dh) dh.textContent = n === 0 ? '' : ('● ' + n + ' 处修改未保存(保存只检查修改项)');
  };
  /* 排除/强制清单在分流页与设置页都渲染(同 id)——绑定放公共区,任意页签都尝试,元素在就绑 */
    p.querySelectorAll('[data-rmex]').forEach(b => b.onclick = () => { setDraft().exclude.splice(+b.dataset.rmex, 1); renderPane() });
    p.querySelectorAll('[data-rmfc]').forEach(b => b.onclick = () => { setDraft().force.splice(+b.dataset.rmfc, 1); renderPane() });
    [['hs_ex_in', 'hs_ex_mode', 'hs_ex_add', 'exclude'], ['hs_fc_in', 'hs_fc_mode', 'hs_fc_add', 'force']].forEach(cf => {
      const seg = p.querySelector('#' + cf[1]);
      if (seg) seg.querySelectorAll('button').forEach(mb => mb.onclick = () => { seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); mb.classList.add('on') });
      const ab = p.querySelector('#' + cf[2]); if (ab) ab.onclick = () => {
        const v = p.querySelector('#' + cf[0]).value.trim();
        if (!v) { toast('请输入内容', 'red'); return }
        const on = p.querySelector('#' + cf[1] + ' .on');
        let m = on ? on.dataset.m : 'suffix';
        if (/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(v)) m = 'cidr';
        setDraft()[cf[3]].push({ v: v, m: m });
        toast('已加入草稿(保存后生效)', 'green'); renderPane();
      };
    });

  if (tab === 'ov') {
    /* v2.7.24: 设备区渲染/绑定已归一 ovDevSecHtml+bindOvDev,⟳局部刷新 */
    /* v2.7.6 修复: 升级备份「清理」按钮绑定误挂在 set 分支(按钮渲染在总览页)→ 从来点不响应;
     归位到 ov 分支(用户实锤从未生效) */
    const bc0 = p.querySelector('#hs_bak_clean');
    if (bc0) bc0.onclick = async () => {
      const okc = await confirmBox({ title: '清理升级备份', danger: true, okText: '清理', html: '<div class="hs-hint">删除 ' + esc(C.upgBackup ? C.upgBackup.from : '') + ' 的组件备份?清理后将无法回滚到该版本。</div>' });
      if (!okc) return;
      await op(null, async () => { await run('rm -rf ' + shq(UBAK), 5000); C.upgBackup = null; await saveConf(); toast('升级备份已清理', 'green'); await opLog('手动清理升级备份'); renderPane(); }, null, '清理中…');
    };
    p.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyTo(b.dataset.copy));
    /* v2.7.24: 设备区绑定归一 bindOvDev(局部刷新后可重挂);⟳局部刷新——只重采+重渲染
       #hs_ov_dev 容器,不整页 renderPane(用户定调:别动页签其他区域) */
    bindOvDev(p);
    const odrf = p.querySelector('#hs_dev_rf');
    if (odrf) odrf.onclick = async () => {
      odrf.disabled = true; odrf.textContent = '⟳…';
      await collectStatus();
      const cs = await getConnectionStats();
      const box = $('#hs_ov_dev');
      if (box) { box.innerHTML = ovDevSecHtml(cs); bindOvDev(box); }
      toast('设备与活动连接已刷新(仅本区)', 'green');
    };
    p.querySelectorAll('#hs_seg_s1 button').forEach(b => b.onclick = async () => {
      if (!ST.running) { toast('请先启动引擎(底部操作栏)', 'red'); return }
      if (b.dataset.v === C.s1) return;
      if (b.dataset.v === 'all') {
        const ok = await confirmBox({ title: '全部终端走代理', html: '<div class="hs-hint">所有连接本机的终端(含之后新接入的设备)流量都将走代理,不再限于白名单。可随时切回。</div>', okText: '切换' });
        if (!ok) return;
      }
      await op(b, async () => { C.s1 = b.dataset.v; await saveConf(); await reapplyFw(); await opLog('终端代理→' + b.dataset.v) },
        '✅ 终端代理:' + ({ off: '关', all: '全部终端', white: '白名单' })[b.dataset.v] + '(增量规则,其他设备零感知)');
    });
    const s2 = p.querySelector('#hs_sw_s2');
    s2.onchange = async e => {
      if (e.target.checked) {
        const html = (+C.s2Keep > 0)
          ? '<div class="hs-hint">设备自身的出网流量将走代理;若节点全部故障,设备访问外网会受影响(局域网内访问面板不受影响)。<br>⏱ 按「' + C.s2Keep + ' 分钟」限时策略,' + C.s2Keep + ' 分钟后自动关闭(面板优先)。</div>'
          : '<div class="hs-hint">设备自身的出网流量将走代理;若节点全部故障,设备访问外网会受影响。<br>⚠ <b>当前为一直开启</b>:面板自身出站也将耦合进引擎,引擎异常会波及面板——建议点旁边的「⚠ 常开」改为限时。</div>';
        const ok = await confirmBox({ title: '开启本机代理', html: html, okText: '开启' });
        if (!ok) { e.target.checked = false; return }
      }
      await op(null, async () => {
        C.s2 = e.target.checked; await saveConf(); await reapplyFw();
        if (C.s2) await armS2Timer(); else await killS2Timer();
      }, '✅ 本机代理已' + (e.target.checked ? '开启' + ((+C.s2Keep > 0) ? '(⏱ ' + C.s2Keep + ' 分钟后自动关闭)' : '(⚠ 一直开启)') : '关闭') + '(OUTPUT 接管已生效)');
    };
    const kb = p.querySelector('#hs_s2keep');
    if (kb) kb.onclick = () => openS2KeepDlg();
    const rf = p.querySelector('#hs_ov_rf');
    const uvb = p.querySelector('#hs_upg_view');
    if (uvb) uvb.onclick = () => showUpgradeCard();
    const rbk = p.querySelector('#hs_upg_rollback');
    if (rbk) rbk.onclick = () => rollbackUpgrade();
    const ovGuide = p.querySelector('#hs_ov_guide'); /* v2.1.9 状态页引导条 */
    if (ovGuide) ovGuide.onclick = () => window.open(GUIDE_URL, '_blank', 'noopener');
    rf.onclick = async () => {
      /* v1.8.5: 冷却用模块级时间戳——renderPane 会重建按钮,DOM dataset 标记随之丢失,
         3 秒冷却形同虚设可连点触发并发 collectStatus(2026-09-13 审查 P3) */
      if (Date.now() - HS_OV_RF_AT < 3000) { toast('刷新冷却中(3 秒)', 'pink'); return }
      HS_OV_RF_AT = Date.now(); let n = 3; rf.textContent = '刷新(' + n + ')'; rf.disabled = true;
      await collectStatus(); await checkResidue(); renderCard(); renderPane();
      toast('已刷新', 'green');
      const iv = setInterval(() => { n--; const b = $('#hs_ov_rf'); if (n <= 0) { clearInterval(iv); if (b) { b.disabled = false; b.textContent = '刷新' } } else if (b) b.textContent = '刷新(' + n + ')' }, 1000);
    };
  }
  if (tab === 'sub') {
    const mb = p.querySelector('#hs_sub_manual'); if (mb) mb.onclick = () => openManualDlg();
    /* v2.7.11: 「添加节点」与「手动节点」两弹窗功能重复(用户分不清)——合并单入口「自建节点」,openAddNodeDlg 入口移除 */
    /* 注意: 标志必须用模块级变量,不能挂在 HS_MANUAL 上——refreshManual 会整体替换数组,挂在数组上的属性会随旧数组丢失,曾导致无限重渲染循环(页面按钮/输入全失灵) */
    if (!HS_MANUAL_LOADED) { HS_MANUAL_LOADED = true; refreshManual().then(() => { if (hsTab === 'sub') renderPane() }).catch(() => { HS_MANUAL_LOADED = false }) }
    if (C.subs.length && HS_SUBINFO_ALL === undefined) refreshSubInfo().then(() => { if (HS_SUBINFO_ALL && hsTab === 'sub') renderPane() });
    p.querySelectorAll('[data-subupd]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.subupd, sb = C.subs[i];
      const oldT = b.textContent;
      b.disabled = true; b.textContent = '下载中…';
      const dl = await downloadSub(i);
      b.disabled = false; b.textContent = oldT;
      if (!dl) { toast('❌ 「' + sb.name + '」下载失败(检查网络/URL)', 'red'); return }
      if (subEffective(i) && ST.running) {
        await applyWithTxn('更新订阅「' + sb.name + '」'); /* v2.7.0: 融合下非激活订阅也是生效节点池,同样热重载(审查问题3) */
      } else {
        toast('✅ 「' + sb.name + '」已下载,切换使用时生效', 'green');
      }
      renderPane();
    });
    p.querySelectorAll('[data-subuse]').forEach(b => b.onclick = async () => {
      await op(b, async () => {
        C.activeSub = +b.dataset.subuse; await saveConf();
        const dl = await downloadSub(+b.dataset.subuse);
        if (!dl) { toast('⚠️ 已切换但节点下载失败(沿用缓存配置),可稍后点「更新」重试', 'pink'); return } /* v1.8.5: 此前失败仍报成功 */
        if (ST.running) await applyWithTxn('订阅切换');
      }, '✅ 订阅已切换并生效');
    });
    p.querySelectorAll('[data-subedit]').forEach(b => b.onclick = () => { HS_SUB_EDIT = +b.dataset.subedit; renderPane() });
    /* v2.7.0: 节点过滤弹窗 + 多订阅融合开关 */
    p.querySelectorAll('[data-subflt]').forEach(b => b.onclick = () => openSubFilterDlg(+b.dataset.subflt));
    const fusEl = p.querySelector('#hs_sub_fusion');
    if (fusEl) fusEl.onchange = async () => {
      const on = fusEl.checked;
      await op(null, async () => {
        C.subFusion = on; await saveConf();
        if (ST.running) {
          await refreshSubRaw(); /* 融合预热:genConfigYaml 同步函数读不了文件,先预载全部订阅原文 */
          const ok = await saveConfReload(); if (!ok) throw new Error('热重载失败')
        }
        await opLog('多订阅节点融合' + (on ? '开启' : '关闭'));
      }, '✅ 融合已' + (on ? '开启:全部订阅节点合并进池(带订阅前缀)' : '关闭:仅激活订阅生效'));
      renderPane();
    };
    const sCancel = p.querySelector('#hs_sub_cancel'); if (sCancel) sCancel.onclick = () => { HS_SUB_EDIT = -1; HS_SUB_NEW = false; renderPane() };
    /* v2.7.10 补绑定(上批 edit 整批回滚丢失): ＋添加订阅→顶部插入新建卡 */
    const newBtn = p.querySelector('#hs_sub_newbtn'); if (newBtn) newBtn.onclick = () => { HS_SUB_NEW = true; HS_SUB_EDIT = -1; renderPane(); setTimeout(() => { const inp = p.querySelector('#hs_sub_name'); if (inp) inp.focus() }, 60) };
    p.querySelectorAll('[data-subdel]').forEach(b => b.onclick = async () => {
      const sb = C.subs[+b.dataset.subdel];
      const ok = await confirmBox({ title: '删除订阅', html: '<div class="hs-hint">确定删除「' + esc(sb.name) + '」?</div>', okText: '删除', danger: true });
      if (!ok) return;
      const i = +b.dataset.subdel;
      if (HS_SUB_EDIT === i) HS_SUB_EDIT = -1; else if (HS_SUB_EDIT > i) HS_SUB_EDIT--;
      C.subs.splice(i, 1);
      if (C.activeSub === i) C.activeSub = C.subs.length ? 0 : -1;
      else if (C.activeSub > i) C.activeSub--;
      HS_SUB_RAW = ''; HS_SUB_RAW_KEY = '';
      if (C.policySrc !== 'self') await refreshSubRaw();
      await saveConf(); toast('已删除', 'green'); renderPane();
      if (ST.running && C.policySrc !== 'self') await applyWithTxn('订阅删除(策略重合成)');
    });
    const ab = p.querySelector('#hs_sub_add'); if (ab) ab.onclick = async () => {
      const n = p.querySelector('#hs_sub_name').value.trim(), u = p.querySelector('#hs_sub_url').value.trim();
      if (!n || !u) { toast('请填写名称和订阅链接', 'red'); return }
      /* 审查P2-3: 订阅 URL 协议白名单——file:// 等可读本地文件,明确拒绝 */
      if (!/^https?:\/\//.test(u)) { toast('订阅链接必须以 http:// 或 https:// 开头', 'red'); return }
      /* 编辑态:链接未变只改名;变了则先落新值试下载,失败回滚保旧链接 */
      if (HS_SUB_EDIT >= 0 && C.subs[HS_SUB_EDIT]) {
        const i = HS_SUB_EDIT, sb = C.subs[i];
        if (u === sb.url) {
          sb.name = n; await saveConf(); HS_SUB_EDIT = -1;
          toast('✅ 已保存修改(链接未变,无需重新下载)', 'green'); renderPane(); return;
        }
        await op(ab, async () => {
          const oldUrl = sb.url, oldName = sb.name;
          sb.name = n; sb.url = u;
          const dl = await downloadSub(i);
          if (!dl) { sb.url = oldUrl; sb.name = oldName; await saveConf(); throw new Error('新链接下载失败,已保留原链接(检查 URL/网络)') }
          HS_SUB_EDIT = -1;
          if (i === C.activeSub && ST.running) await applyWithTxn('订阅编辑「' + n + '」');
        });
        return; /* op 自带 renderAll */
      }
      await op(p.querySelector('#hs_sub_add'), async () => {
        C.subs.push({ name: n, url: u, time: nowStr().slice(0, 16) });
        if (C.activeSub < 0) C.activeSub = C.subs.length - 1;
        await saveConf();
        const dlok = await downloadSub(C.activeSub);
        if (dlok && ST.running) await applyWithTxn('添加订阅');
        HS_SUB_NEW = false; /* v2.7.10 补(上批回滚丢): 新建卡保存后关闭 */
      }, '✅ 订阅已添加并生效');
      renderPane();
    };
  }
  if (tab === 'split') {
    const qseg = p.querySelector('#hs_quick_s1');
    if (qseg) qseg.querySelectorAll('button').forEach(b => b.onclick = async () => {
      if (b.dataset.v === C.s1) return;
      if (b.dataset.v === 'all') {
        const okAll = await confirmBox({ title: '全部终端走代理', html: '<div class="hs-hint">所有连接本机的终端(含之后新接入的设备)流量都将走代理。可随时切回。</div>', okText: '切换' });
        if (!okAll) return;
      }
      await op(b, async () => { C.s1 = b.dataset.v; await saveConf(); await reapplyFw(); await opLog('终端代理→' + b.dataset.v) },
        '✅ 已切换:' + ({ off: '全部直连', white: '白名单', all: '全部代理' })[b.dataset.v] + '(规则即时生效)');
      renderPane();
    });
    const gi = p.querySelector('#hs_geo_ip'); if (gi) gi.onclick = () => geoInstall('hs_geo_ip', gi);
    const gs = p.querySelector('#hs_geo_site'); if (gs) gs.onclick = () => geoInstall('hs_geo_site', gs);
    const chnDl = p.querySelector('#hs_chn_dl'); if (chnDl) chnDl.onclick = () => chnInstall(chnDl);
    const chnUp = p.querySelector('#hs_chn_up'); if (chnUp) chnUp.onclick = chnUpload;
    const chnSw = p.querySelector('#hs_chn_sw'); if (chnSw) chnSw.onchange = e => {
      op(null, async () => { C.cnBypass = e.target.checked; await saveConf(); if (ST.running) await reapplyFw() }, '✅ 国内直通已' + (e.target.checked ? '开启' : '关闭'), '应用直通规则中…');
    };
    /* v2.8.2: IPv6 响应实验开关——开启前警告(v6 流量入引擎,CPU 代价);取消则回滚开关 */
    const v6sw = p.querySelector('#hs_sw_v6dns'); if (v6sw) v6sw.onchange = async e => { /* v2.9.56: async+await+pr 声明(auditor 实锤:pr 未声明严格模式抛 ReferenceError+okc 未 await 恒 truthy,开关自 v2.8.2 起 100% 失效) */
      const on = e.target.checked;
      let pr = true;
      if (on) pr = await confirmBox({ title: '开启 IPv6 响应', danger: true, okText: '仍要开启', html: '<div class="hs-hint">开启后 DNS 将回 AAAA 记录,IPv6 可通。<br>⚠ v6 流量会进入引擎处理,设备 CPU 占用可能明显上升;若日常无需 IPv6,建议保持关闭。</div>' });
      if (!pr) { e.target.checked = !on; return }
      op(null, async () => {
        C.v6Dns = on; await saveConf();
        if (ST.running) { const okr = await saveConfReload(); if (!okr) throw new Error('热重载失败') }
      }, on ? '✅ IPv6 响应已开启' : 'IPv6 响应已关闭(v4 模式)');
    };
    /* 分流页草稿保存栏 */
    const spsv = p.querySelector('#hs_sp_save'); if (spsv) spsv.onclick = async () => { await trySetSave() };
    const spdc = p.querySelector('#hs_sp_discard'); if (spdc) spdc.onclick = () => { SET_DRAFT = null; toast('已放弃全部修改', 'green'); renderPane() };
    /* v2.2.1: 设备区手动刷新(用户定调:不实时,手动/切页刷新)——活动连接数据随 paneSplit 整页采集,走 renderPane 同路径 */
    const rvCtx = { C: C, ST: ST, ET: ET_CACHE, EX: (SET_DRAFT && SET_DRAFT.exclude) || C.exclude || [], FC: (SET_DRAFT && SET_DRAFT.force) || C.force || [], game: HS_GAME_DOMAINS, esc: esc, toast: toast, run: run, apiGet: apiGet, act: riverAct, restStats: riverRestStats, deepRest: riverDeepRest, mountLive: riverMountLive, exitLive: null }; /* v2.9.43: 兜底全链异步补 */
    if (ST.running) riverLiveExit().then(function (ex2) { rvCtx.exitLive = ex2; if (hsTab === 'split') riverRender(rvCtx) }).catch(function () { }); /* 链就绪后局部重绘 */
    const rvState = riverRender(rvCtx); /* v2.9.23 泳道定稿(模块渲染;容器ResizeObserver自适应,旧resize钩子废弃) */
    if (C.coexistAuto && !(rvState && rvState.etActive)) {
      /* v2.9.24: ET 缓存未就绪——读取完成后补刷一次(用户正在搜索输入时不打扰) */
      readEtState().then(() => {
        if (hsTab !== 'split') return;
        const qi = document.getElementById('hs_rv_q');
        if (qi && qi.value) return;
        rvCtx.ET = ET_CACHE;
        riverRender(rvCtx);
      }).catch(() => { });
    }
    const drf = p.querySelector('#hs_dev_rf');
    if (drf) drf.onclick = async () => { drf.style.opacity = '.5'; await refreshDevPane(); toast('设备已刷新(仅本区)', 'green'); drf.style.opacity = '1' }; /* v2.9.1: 局部刷新,不整页 */
    /* v2.1.10 修复:「自动兼容 EasyTier」开关渲染在分流页(paneSplit),绑定此前误放 set 分支——
       set 页无此元素被空守卫静默跳过,onchange 永不挂上:开关只动 UI、草稿不更新(无法保存)、
       etCheck 三级自检永不触发(用户真机实测"打开后无法保存,也没有自我检查")。绑定归位到 split 分支 */
    const cox = p.querySelector('#hs_set_cox');
    if (cox) cox.onchange = async e => { /* 条件渲染行:未装 ET 时元素不存在,空守卫防 TypeError(2026-09-03 harness 实测) */
      if (e.target.checked) {
        const row = e.target.closest('.hs-row');
        const oldT = row ? row.querySelector('.hs-st').textContent : null;
        if (row) row.querySelector('.hs-st').textContent = '校验中…';
        e.target.disabled = true;
        await wait(500);
        const r = await etCheck();
        e.target.disabled = false;
        if (row && oldT != null) row.querySelector('.hs-st').textContent = oldT;
        e.target.checked = false;
        if (r === 'noinstall') {
          const pr = confirmBox({ title: '未检测到 ET组网 插件', html: '<div class="hs-hint">未同装两者时无需此功能,开关保持关闭即可。<br>若你确认已安装 ET组网,请检查其是否完整安装(内核文件在位)后重试。</div>', okText: '知道了', cancelText: '关闭' });
          await pr; syncBar(); return
        }
        if (r === 'nostate') {
          const pr = confirmBox({
            title: '需先在 ET组网 开启状态输出',
            html: '<div class="hs-hint">按以下步骤操作后,再回来开启本开关:</div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>①</span><span>打开 ET组网 插件,进入 设置</span></div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>②</span><span>找到并开启开关:<b>「状态文件输出」</b><div class="hs-hint">供第三方代理读取自动排除组网流量</div></span></div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>③</span><span>回到小海关 分流页,再打开「自动兼容 ET组网」</span></div>'
            + '<div style="margin-top:8px;text-align:left"><button class="btn hs-sm" id="hs_cox_copy">复制开关名</button></div>',
            okText: '知道了', cancelText: '关闭'
          });
          const cb = $('#hs_cox_copy');
          if (cb) cb.onclick = ev => { ev.stopPropagation(); copyTo('状态文件输出(供第三方代理读取自动排除组网流量)') };
          await pr; syncBar(); return
        }
        if (r === 'badstate') {
          const pr = confirmBox({ title: 'ET组网 状态文件异常', html: '<div class="hs-hint">文件存在但读不到有效路由(网段/端口)。<br>请到 ET组网 插件重新开关一次「状态文件输出」后再试。</div>', okText: '知道了', cancelText: '关闭' });
          await pr; syncBar(); return
        }
        e.target.checked = true; setDraft().coexistAuto = true;
        await readEtState();
        if (ET_CACHE && ET_CACHE.active === false) toast('✅ 校验通过;注 ET组网 当前未运行,组网启动后重启引擎即可生效', 'pink');
        else toast('✅ 校验通过:已读取 ET 路由(' + ((ET_CACHE && ET_CACHE.cidrs) || []).length + ' 网段/' + ((ET_CACHE && ET_CACHE.p2p_ports) || []).length + ' 端口),保存后生效', 'green');
      } else { setDraft().coexistAuto = false }
      syncBar();
    };

  }
  if (tab === 'set') {
    /* 卸载(v1.8.1 自「更多」页迁入;三连击防误触口径不变) */
    const un = p.querySelector('#hs_set_un');
    if (un) { let uClicks = 0, uTimer = null;
      un.onclick = () => {
        uClicks++;
        if (uClicks >= 3) { clearTimeout(uTimer); uClicks = 0; un.textContent = '卸载'; doUninstall(); return }
        un.textContent = '再点 ' + (3 - uClicks) + ' 次';
        toast('防误触:连续点击 3 次进入卸载,2.5 秒未续点自动复位', 'pink');
        clearTimeout(uTimer);
        uTimer = setTimeout(() => { uClicks = 0; un.textContent = '卸载' }, 2500);
      };
    }
    const cl = p.querySelector('#hs_set_ctrlLan');
    if (cl) cl.onchange = e => { setDraft().ctrlLan = e.target.checked; renderPane() };
    const psSeg = p.querySelector('#hs_seg_policy');
    if (psSeg) psSeg.querySelectorAll('button').forEach(b => b.onclick = () => { setDraft().policySrc = b.dataset.v; renderPane() });
    syncBar();



    const ce = p.querySelector('#hs_conf_exp'); if (ce) ce.onclick = exportConf;
    const ci = p.querySelector('#hs_conf_imp'); if (ci) ci.onclick = importConf;
    const igb = p.querySelector('#hs_install_guide'); if (igb) igb.onclick = () => { detectArch().then(() => openInstallGuide()) };
    const setGuide = p.querySelector('#hs_set_guide'); /* v2.1.9 设置页帮助入口 */
    if (setGuide) setGuide.onclick = () => window.open(GUIDE_URL, '_blank', 'noopener');
    const cu = p.querySelector('#hs_chk_up');
    if (cu) cu.onclick = async () => {
      await detectArch();
      const info = await fetchLatestInfo();
      if (info.tag && C.ver && info.tag.slice(1) === C.ver) { toast('已是最新: v' + C.ver, 'green'); return }
      if (info.tag) {
        const okc = await confirmBox({ title: '发现新版本', html: '<div class="hs-hint">当前 v' + esc(C.ver || '?') + ' → 最新 <b>' + esc(info.tag) + '</b><br>直接替换不保留旧版。</div>', okText: '在线更新' });
        if (okc) { onlineInstall() }
      } else { toast('无法获取版本(GitHub 不通);可手动下载后上传', 'red') }
    };
    const uc2 = p.querySelector('#hs_up_core'); if (uc2) uc2.onclick = uploadCore;
    const bc = p.querySelector('#hs_bak_clean'); if (bc) bc.onclick = null; /* v2.7.6: 绑定已归位 ov 分支(按钮只渲染在总览页),此处残留置空防误绑 */
    p.querySelectorAll('[data-port]').forEach(inp => {
      const k = inp.dataset.port;
      inp.oninput = () => {
        const d = setDraft(); d.ports[k] = inp.value.trim();
        const v = +inp.value;
        const bad = !/^\d+$/.test(inp.value) || v < 1 || v > 65535;
        inp.className = 'hs-vin' + (bad ? ' bad' : '');
        syncBar();
      };
    });
    p.querySelector('#hs_set_tun').oninput = e => {
      const d = setDraft(); d.tun = e.target.value.trim();
      e.target.className = 'hs-vin' + (!/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/.test(d.tun) ? ' bad' : '');
      syncBar();
    };
    p.querySelectorAll('#hs_seg_iv button').forEach(b => b.onclick = () => {
      setDraft().iv = +b.dataset.v;
      p.querySelectorAll('#hs_seg_iv button').forEach(x => x.classList.toggle('on', x === b));
      syncBar();
    });
    p.querySelector('#hs_set_lowmem').onchange = e => { setDraft().lowMem = e.target.checked; syncBar() };
    p.querySelector('#hs_set_auto').onchange = e => { setDraft().autostart = e.target.checked; syncBar() };
    p.querySelectorAll('#hs_seg_boot button').forEach(b => b.onclick = () => {
      setDraft().bootMode = b.dataset.v;
      p.querySelectorAll('#hs_seg_boot button').forEach(x => x.classList.toggle('on', x === b));
      const d = setDraft(); const a = d.autostart, m = d.bootMode;
      const bd = p.querySelector('.hs-row .hs-sd');
      syncBar();
    });
    p.querySelectorAll('#hs_seg_card button').forEach(b => b.onclick = async () => {
      p.querySelectorAll('#hs_seg_card button').forEach(x => x.classList.toggle('on', x === b));
      C.cardMode = b.dataset.v;
      await saveConf(); renderCard();
      toast('✅ 卡片模式已切换: ' + ({ full: '完整', simple: '简洁', btn: '单按钮' })[C.cardMode] + '，建议刷新页面使外部卡片正确重渲染', 'green');
    });
    const pr = p.querySelector('#hs_port_reset'); if (pr) pr.onclick = () => { setDraft().ports = { mixed: 7890, redir: 7892, dns: 1053, ctrl: 9090 }; toast('已填入默认端口(草稿,需保存)', 'green'); renderPane() };
    const svb = p.querySelector('#hs_set_save'); if (svb) svb.onclick = async () => { await trySetSave() };
    const dcb = p.querySelector('#hs_set_discard'); if (dcb) dcb.onclick = () => { SET_DRAFT = null; toast('已放弃全部修改,恢复为当前生效值', 'green'); renderPane() };
    syncBar();
  }
  if (tab === 'log') { bindPaneLog(p) }
}
function bindPaneLog(p) {
  p.querySelectorAll('[data-logtab]').forEach(b => b.onclick = () => { hsLogTab = b.dataset.logtab; stopLogTimer(); renderPane() });
  const en = p.querySelector('#hs_log_enable');
  if (en) {
    en.onclick = async () => {
      C.logEnabled = true; await saveConf();
      toast('日志开关已开启', 'green');
      await askApplyNow('日志开关');
      renderPane(); renderCard(); /* 卡片日志按钮显隐联动 */
    };
    return;
  }
  p.querySelector('#hs_log_en').onchange = async e => {
    if (!e.target.checked) {
      C.logEnabled = false; await saveConf();
      toast('日志已关闭:引擎运行日志→/dev/null(操作审计日志仍保留)', 'green');
      renderPane(); renderCard(); await askApplyNow('日志开关');
    }
  };
  p.querySelectorAll('#hs_seg_lvl button').forEach(b => b.onclick = async () => {
    C.logLevel = b.dataset.v; await saveConf();
    /* debug 10分钟限时(setTimeout零后台,到点API热切回info不重启;51MB实测事故) */
    if (C.logLevel === 'debug' && C.logEnabled) {
      clearTimeout(HS_DEBUG_TIMER);
      HS_DEBUG_TIMER = setTimeout(async () => {
        if (C.logLevel !== 'debug') return; /* v1.8.5: 用户中途改级别后不再被 10 分钟定时器覆盖 */
        C.logLevel = 'info'; await saveConf();
        const yml = genConfigYaml();
        if (yml !== null) { await writeFile(CFG, yml); await apiPut('/configs?force=true', { path: '', payload: yml }); }
        toast('debug日志已自动切回info(限时10分钟)', 'green'); await opLog('debug限时到点,热切回info');
      }, 600000);
    }
    toast('日志级别:' + C.logLevel + '(写入配置,重启生效)', 'green'); renderPane();
  });
  p.querySelectorAll('#hs_log_tabs button').forEach(b => b.onclick = () => { hsLogTab = b.dataset.f; renderPane() });
  p.querySelector('#hs_log_exp').onclick = async () => {
    const f = hsLogTab === 'run' ? LOGF : OPLOG;
    const r = await run('cat ' + shq(f) + ' 2>/dev/null', 12000);
    dl('小海关-' + (hsLogTab === 'op' ? '操作日志' : '运行日志') + '-' + stampStr() + '.log', ct(r) || '(空)');
  };
  p.querySelector('#hs_log_clr').onclick = async () => {
    await run(': > ' + shq(hsLogTab === 'run' ? LOGF : OPLOG), 5000);
    renderLogBody(); toast('日志已清空', 'green');
  };
  renderLogBody();
  stopLogTimer();
  hsLogTimer = setInterval(() => { if (hsTab === 'log' && $('#hs_modal_mgr') && $('#hs_modal_mgr').style.display !== 'none' && hsLogTab === 'run') renderLogBody() }, 1500);
}
/* ================= 内核安装(引导页+在线下载+上传) ================= */
const GH_OWNER = 'MetaCubeX';
const GH_REPO = 'mihomo';
/* 用户 Gitee 镜像仓(资产命名无 mihomo- 前缀,防封);最新发行版默认从这里下载 */
const GITEE_OWNER = 'shiyi0210';
const GITEE_REPO = 'customs-kernel';
const GITEE_BASE = 'https://gitee.com/' + GITEE_OWNER + '/' + GITEE_REPO;
/* 统一下载策略: 直连优先 → 引擎运行时走本地代理(自给自足) → 镜像兜底。按用户指令只保留 gh-proxy.com */
const GH_PROXY = ['https://gh-proxy.com/'];
function dlSeq(ghUrl) {
  const seq = [{ name: '直连', url: ghUrl, px: '' }];
  if (ST.running) seq.push({ name: '本地代理', url: ghUrl, px: 'http://127.0.0.1:' + C.ports.mixed });
  GH_PROXY.forEach(p => seq.push({ name: p.slice(8, -1), url: p + ghUrl, px: '' }));
  return seq;
}
let hsArch = 'unknown';
async function detectArch() {
  if (hsArch !== 'unknown') return hsArch;
  const r = await run('uname -m', 5000);
  const m = ct(r);
  hsArch = (m === 'aarch64' || m === 'arm64') ? 'arm64' : (m === 'x86_64' || m === 'amd64') ? 'amd64' : (m === 'armv7l') ? 'armv7' : m || 'unknown';
  return hsArch;
}
async function fetchLatestInfo() {
  /* v2.1.2 版本查询四级: GitHub API 直连 → 本地代理(引擎运行时) → Gitee API(用户镜像仓,国内直连最稳) → jsDelivr data API;
     返回 url 优先给 Gitee 资产直链(资产命名无 mihomo- 前缀),无则退 GitHub 版本化资产名(不带版本号的 fallback 实测 404) */
  const api = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/releases/latest';
  const want = 'mihomo-linux-' + hsArch + '-';
  const tryApi = async (u, px) => {
    const r = await run('curl -sL -m 12 ' + (px ? '-x ' + shq(px) + ' ' : '') + shq(u) + ' 2>/dev/null', 16000);
    try {
      const j = JSON.parse((r.content || '').trim());
      const tag = j.tag_name || '';
      if (!tag) return null;
      const gz = want + tag + '.gz';
      const asset = (j.assets || []).find(a => a.name === gz);
      return { tag: tag, url: asset ? asset.browser_download_url : ('https://github.com/' + GH_OWNER + '/' + GH_REPO + '/releases/download/' + tag + '/' + gz) };
    } catch (e) { return null }
  };
  let info = await tryApi(api, '');
  if (!info && ST.running) info = await tryApi(api, 'http://127.0.0.1:' + C.ports.mixed);
  if (!info) {
    /* Gitee 兜底:用户镜像仓,国内直连 */
    try {
      const jr = await run('curl -sL -m 12 ' + shq('https://gitee.com/api/v5/repos/' + GITEE_OWNER + '/' + GITEE_REPO + '/releases/latest') + ' 2>/dev/null', 16000);
      const j = JSON.parse((jr.content || '').trim());
      const tag = j.tag_name || '';
      if (tag) {
        const gz = (j.assets || []).find(a => a.name === hsArch + '-' + tag + '.gz');
        info = { tag: tag, url: gz ? gz.browser_download_url : (GITEE_BASE + '/releases/download/' + tag + '/' + hsArch + '-' + tag + '.gz') };
      }
    } catch (e) { }
  }
  if (!info) {
    const ju = 'https://data.jsdelivr.com/v1/packages/gh/' + GH_OWNER + '/' + GH_REPO;
    const jr = await run('curl -sL -m 12 ' + shq(ju) + ' 2>/dev/null', 16000);
    try {
      const j = JSON.parse((jr.content || '').trim());
      const tag = ((j.versions || [])[0]) || '';
      if (tag) info = { tag: tag, url: 'https://github.com/' + GH_OWNER + '/' + GH_REPO + '/releases/download/' + tag + '/mihomo-linux-' + hsArch + '-' + tag + '.gz' };
    } catch (e) { }
  }
  return info || { tag: '', url: '' };
}
/* ================= v2.9.0 场景4: 首次安装引导(5 步向导) =================
   触发: init 检测零配置(无内核/无订阅/无设备);每步实时检测完成度,
   全部完成自动关闭并提示"可以上网了";可随时点右上✕跳过(下次刷新不再弹——
   用户完成任一步或手动关弣即写标记) */
let HS_FRG = null;
function firstRunDone() { try { localStorage.setItem('hs_frg_done', '1') } catch (e) { } }
async function openFirstRunGuide() {
  HS_FRG = { step: 0 };
  await collectStatus();
  renderFRG();
}
async function frgCheck() {
  /* 各步完成度检测(实时) */
  await collectStatus();
  await readEtState().catch(() => { });
  const s1 = !!ST.bin; /* ①内核 */
  const s2 = (C.subs || []).length > 0 || HS_MANUAL.length > 0; /* ②订阅/自建节点 */
  const s3 = ST.running; /* ③引擎 */
  const s4 = C.s1 === 'all' || (C.devices || []).some(d => d.proxy); /* ④接管配置 */
  let s5 = false;
  if (ST.running) { const cs = await getConnectionStats(); s5 = !!(cs && cs.total > 0) } /* ⑤有流量=上网了 */
  return [s1, s2, s3, s4, s5];
}
function renderFRG() {
  if (!HS_FRG) return;
  frgCheck().then(st => {
    const steps = [
      ['① 安装内核', '下载 mihomo 引擎(约 20MB)', st[0]],
      ['② 添加订阅', '粘贴机场订阅链接,或用自建节点', st[1]],
      ['③ 启动引擎', '一键启动,等待就绪', st[2]],
      ['④ 选择设备', '勾选要走代理的设备(或切全部终端)', st[3]],
      ['⑤ 验证联网', '设备产生流量,代理生效', st[4]]
    ];
    const allDone = st.every(Boolean);
    if (allDone) { firstRunDone(); toast('🎉 全部完成!接入设备已可以上网', 'green', 5000); HS_FRG = null; renderPane(); return }
    const cur = st.findIndex(x => !x);
    let h = '<div class="hs-hint" style="margin-bottom:10px">按步骤完成配置,完成后自动进入下一步;点 ✕ 可跳过(不会再次弹出)</div>';
    steps.forEach((sp, i) => {
      const ic = sp[2] ? '✅' : (i === cur ? '◐' : '⚪');
      const hl = i === cur ? 'color:#7fc9f2;font-weight:700' : (sp[2] ? 'color:#8fe39a' : '');
      h += '<div class="hs-li" style="align-items:center"><span style="flex:none;font-size:1rem;margin-right:8px">' + ic + '</span><div style="flex:1"><div style="font-size:.78rem;' + hl + '">' + sp[0] + '</div><div class="hs-hint" style="font-size:.64rem">' + sp[1] + '</div></div>'
      + (i === cur ? '<button class="btn hs-sm hs-pri" id="hs_frg_go">前往</button>' : '') + '</div>';
    });
    hsOpenSimple('🚀 新手引导', h);
    const go = document.getElementById('hs_frg_go');
    if (go) go.onclick = () => {
      firstRunDone(); /* 用户主动前往即不再弹 */
      HS_FRG = null; hsClose('hs_modal_simple');
      if (cur === 0) { detectArch().then(() => openInstallGuide()) }
      else openMgr(cur === 1 ? 'sub' : cur === 3 ? 'split' : 'ov');
    };
    /* 5 秒后自动复查(引导打开期间) */
    if (HS_FRG) setTimeout(() => {
      const box = document.getElementById('hs_modal_simple');
      if (HS_FRG && box && box.style.display !== 'none') renderFRG();
      else if (HS_FRG) { HS_FRG = null; firstRunDone(); } /* v2.9.56: 弹窗已被✕关闭→终结引导并落标记(auditor: 5 秒复活循环+「不会再弹」承诺落空) */
    }, 5000);
  });
}
function openInstallGuide(afterFail) {
  /* v2.1.4: 安装进行中不覆盖进度窗内容(hsOpenSimple 换 innerHTML 会毁掉进度 DOM,下载流程变全盲);
     失败回跳 afterFail 例外——彼时流程已走完,仅 finally 未及复位 busy */
  if (hsInstBusy && !afterFail && $('#hs_prog_text')) { mShow('hs_modal_simple'); toast('安装进行中——已切回进度窗口', 'green'); return }
  const arch = hsArch;
  const fname = 'mihomo-linux-' + arch + '-v_X.Y.Z_.gz';
  const ghPage = 'https://github.com/MetaCubeX/mihomo/releases';
  const direct = 'https://github.com/MetaCubeX/mihomo/releases/latest';
  const html =
  '<div style="text-align:center;padding:6px 0 2px">'
  + '<div style="font-size:.76rem;color:#b3bdcb;margin-bottom:12px">设备架构:<b style="color:#7fc9f2">' + esc(arch) + '</b> · 需要文件:<b style="color:#bcd2ff">' + fname + '</b></div>'
  + '<div style="display:flex;flex-direction:column;gap:8px">'
  + (afterFail ? '<div style="margin-bottom:10px;padding:8px 10px;border:1px solid rgba(229,115,115,.45);border-radius:10px;font-size:.68rem;color:#ffb3b3;background:rgba(229,115,115,.07)">⚠️ 在线下载全部失败(国内网络限制)。推荐下面两种方式:<br>① 📤 上传:电脑下载 .gz 文件后直接上传(最可靠)<br>② 🔗 自定义国内源:填一个你自己能访问到的下载直链(自有服务器/OSS)</div>' : '')
  + '<button class="btn hs-pri" id="hs_ig_online" style="padding:10px">⚡ 在线下载(自动选源:自定义源→直连→代理→镜像)</button>'
  + '<div style="margin:6px 0"><input class="inp" id="hs_ig_mirror" placeholder="自定义国内源(完整 .gz 直链,可选;保存后在线下载将最先尝试)" value="' + esc(C.kernelMirror || '') + '" style="width:100%;font-size:.7rem"></div>'
  + '<button class="btn" id="hs_ig_open" style="padding:10px">🌐 打开发布页(浏览器下载)</button>'
  + '<div style="display:flex;gap:8px">'
  + '<button class="btn hs-sm" id="hs_ig_copy" style="flex:1;padding:8px">复制发布页链接</button>'
  + '<button class="btn hs-sm" id="hs_ig_copyf" style="flex:1;padding:8px">复制文件名</button>'
  + '</div>'
  + '<button class="btn ' + (afterFail ? 'hs-pri' : '') + '" id="hs_ig_upload" style="padding:10px' + (afterFail ? ';border-width:2px' : '') + '">📤 上传已下载的 .gz 文件' + (afterFail ? '(失败后推荐)' : '') + '</button>'
  + '<button class="btn" id="hs_ig_manual" style="padding:10px">📖 手动下载安装指南(在线失败看这里)</button>'
  + '</div>'
  + '<div class="hs-hint" style="margin-top:12px;text-align:left">方式① 在线下载:设备自动从镜像源下载(推荐,无需电脑)<br>方式② 浏览器下载:点「打开发布页」跳转 GitHub(可能需代理),找到Latest版 Assets 里文件名含 <b>linux-' + esc(arch) + '</b> 的 .gz 下载,回来点「上传」<br>方式③ 复制链接到任意浏览器打开</div>'
  + '</div>';
  hsOpenSimple('安装内核', html);
  const mirInp = $('#hs_ig_mirror');
  if (mirInp) mirInp.onchange = async () => {
    const v = (mirInp.value || '').trim();
    if (v && !/^https?:\/\//i.test(v)) { toast('自定义源须为 http(s) 完整直链', 'red'); mirInp.value = C.kernelMirror || ''; return }
    C.kernelMirror = v; await saveConf();
    toast(v ? '✅ 自定义源已保存,在线下载将最先尝试' : '已清空自定义源', 'green');
    await opLog('自定义内核源' + (v ? '设置: ' + v.slice(0, 60) : '清空'));
  };
  /* v2.1.4: 不先 mHide——进度窗与引导页同用 hs_modal_simple,同 tick 先 closeModal 再 showModal 会被面板关窗收尾压制
     (真机复现:点在线下载后无进度窗,安装全程后台隐形,再点只弹"安装中"无下文);hsOpenSimple 直接换内容+显窗 */
  $('#hs_ig_online').onclick = () => { onlineInstall(document.getElementById('hs_ig_online')) };
  $('#hs_ig_open').onclick = () => { window.open(direct, '_blank'); toast('已打开发布页(浏览器需能访问 GitHub)', 'green') };
  $('#hs_ig_copy').onclick = () => copyTo(ghPage);
  $('#hs_ig_copyf').onclick = () => copyTo(fname.replace('v_X.Y.Z_', '(最新版本号)'));
  $('#hs_ig_upload').onclick = () => { mHide('hs_modal_simple'); uploadCore() };
  $('#hs_ig_manual').onclick = () => openManualDlGuide(arch, fname);
}
/* v2.1.1: 手动下载安装指南(精简版)——在哪下、传过来、上传,三件事说完 */
function openManualDlGuide(arch, fname) {
  const html =
  '<div class="hs-pgscroll" style="padding:12px 14px;font-size:.76rem;line-height:1.9">'
  + '<div style="font-weight:700;color:#7fc9f2;margin-bottom:6px">下载</div>'
  + '打开 <span style="word-break:break-all">github.com/MetaCubeX/mihomo/releases</span>(打不开就在前面加 ghproxy.net/),'
  + '在 Latest 版 Assets 里下载文件名含 <b style="color:#7fc9f2">linux-' + esc(arch) + '</b> 的 .gz 文件。'
  + '<div style="font-weight:700;color:#7fc9f2;margin:8px 0 6px">上传</div>'
  + '把下载的 .gz 传到这台设备所在的手机/电脑上,点下方按钮上传即可。'
  + '<div style="display:flex;gap:8px;margin-top:12px">'
  + '<button class="btn hs-sm hs-pri" id="hs_mg_upload">📤 上传内核文件</button>'
  + '</div>'
  + '</div>';
  hsOpenSimple('手动下载安装指南', html);
  $('#hs_mg_upload').onclick = () => { mHide('hs_modal_simple'); uploadCore() };
}
function hsOpenSimple(title, html) {
  const t = $('#hs_modal_simple_title'); if (t) t.textContent = title;
  const b = $('#hs_modal_simple_body'); if (b) b.innerHTML = html;
  mShow('hs_modal_simple');
}
let hsInstBusy = false;
async function onlineInstall(btn) {
  if (hsInstBusy) {
    /* v2.1.4: 安装中再点=切回进度窗,不再只 toast(真机反馈"提示安装中就没后续");进度 DOM 已被换掉则提示后台进行 */
    if ($('#hs_prog_text')) { mShow('hs_modal_simple'); toast('安装进行中——已切回进度窗口', 'green') }
    else toast('内核仍在后台安装中,请稍候(完成会有提示)', 'green');
    return
  }
  hsInstBusy = true;
  /* 进度弹窗 */
  const progHtml =
    '<div id="hs_prog_wrap" style="padding:8px 4px">'
    + '<div class="hs-prog-steps" id="hs_prog_steps">'
    + '<span id="hs_ps1" class="on">① 连接源</span><span id="hs_ps2">② 下载</span><span id="hs_ps3">③ 安装</span><span id="hs_ps4">④ 完成</span>'
    + '</div>'
    + '<div class="hs-prog-bar"><div class="hs-prog-fill" id="hs_prog_fill"></div></div>'
    + '<div id="hs_prog_text" style="font-size:.72rem;color:#b3bdcb;text-align:center;min-height:1.4em">准备中…</div>'
    + '<div style="text-align:center;margin-top:10px"><button class="btn hs-sm" id="hs_prog_cancel">取消</button></div>'
    + '</div>';
  hsOpenSimple('安装内核', progHtml);
  let cancelled = false;
  $('#hs_prog_cancel').onclick = () => { cancelled = true; toast('正在取消…', 'green') };
  const setFill = (pct) => { const f = $('#hs_prog_fill'); if (f) f.style.width = Math.max(0, Math.min(100, pct)) + '%' };
  const setTxt = (t) => { const e = $('#hs_prog_text'); if (e) e.innerHTML = t };
  const setStep = (n) => {
    for (let k = 1; k <= 4; k++) {
      const e = $('#hs_ps' + k); if (!e) continue;
      e.className = k < n ? 'done' : (k === n ? 'on' : '');
      if (k < n && !e.textContent.startsWith('✓')) e.textContent = e.textContent.replace(/^✓\s*/, '');
      if (k < n) e.textContent = '✓' + e.textContent.slice(1);
    }
  };
  try {
    setTxt('识别设备架构…');
    await detectArch();
    if (hsArch === 'unknown') throw new Error('无法识别架构:' + hsArch);
    /* v2.1.5: 下载预检——gz 约 15MB+解压 15MB,满盘设备直接报错并自动清一轮临时文件,不再下到一半静默死 */
    let dKB = await hsDiskKB();
    if (dKB > 0 && dKB < 46080) {
      dKB = await hsCleanJunk();
      if (dKB > 0 && dKB < 46080) throw new Error('存储空间不足(剩 ' + (dKB / 1024).toFixed(1) + 'MB,需约 45MB)——请清理设备存储后重试,或改用上传安装');
    }
    setTxt('查询最新版本…');
    const info = await fetchLatestInfo();
    let dlUrl = info.url;
    /* v2.0.2: 旧不带版本号的 fallback 资产名实测 404,删除;查不到版本时仅靠自定义源/镜像源的 latest 跳转 */
    const ver = info.tag || 'latest';
    /* 不做 Content-Length 预检(设备 GitHub 连接脆弱,HEAD 请求会耗尽连接导致下载停滞);按 ~15MB 估算 */
    const totalSz = 15 * 1048576;
    /* v2.1.2 内核源序列(用户指令重排): ①网盘直链(用户提供的国内直连) → ②Gitee 镜像仓直连(最新tag) → ③GitHub 直连 → ④本地代理(引擎运行时) → ⑤gh-proxy.com 镜像兜底(唯一镜像,ghfast/ghproxy 移除) */
    const tag = info.tag || '';
    const giteeUrl = tag ? (GITEE_BASE + '/releases/download/' + tag + '/' + hsArch + '-' + tag + '.gz') : '';
    const srcSeq = (C.kernelMirror ? [{ name: '自定义源', url: C.kernelMirror, px: '' }] : [])
      .concat([{ name: '网盘直链', url: 'https://ufitools.ikuns.top/f/DRXCufRODGnCSv5kece_wFXK/mihomo-linux-' + hsArch + '-' + (tag || 'latest') + '.gz', px: '' }])
      .concat(giteeUrl ? [{ name: 'Gitee直连', url: giteeUrl, px: '' }] : [])
      .concat(dlUrl ? dlSeq(dlUrl) : []);
    console.log('[小海关] 下载源序列:', srcSeq.map(t => t.name).join(' → '));
    const tmpF = DIR + '/mihomo.dl.gz';
    let ok = false;
    for (let mo = 0; mo < srcSeq.length && !ok && !cancelled; mo++) {
      const t = srcSeq[mo];
      setStep(1);
      console.log('[小海关] 下载源(' + t.name + '):', t.url, t.px || '');
      setTxt('连接源 ' + (mo + 1) + '/' + srcSeq.length + ': ' + esc(t.name) + (info.tag ? ' · v' + esc(info.tag.slice(1)) : ''));
      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.dl.exit') + ' ' + shq(DIR + '/.dl.pid') + '; nohup sh -c \'curl -sLf --connect-timeout 8 ' + (t.px ? '-x ' + shq(t.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(t.url) + ' 2>/dev/null & echo $! > ' + shq(DIR + '/.dl.pid') + '; wait $!; echo $? > ' + shq(DIR + '/.dl.exit') + '\' >/dev/null 2>&1 &', 5000); /* F10: 加 -f——HTTP 4xx/5xx 时 curl exit 22(非0)且不落盘错误页,按 exit 切源;否则 404 大页会 exit 0 被当成功; F11: 记录自有 curl PID($!+wait),清理只杀自有 */
      setStep(2);
      let lastSz = -1, stagnant = 0;
      for (let pi = 0; pi < 120 && !cancelled; pi++) { /* pi=轮询序号; 勿命名 t——会遮蔽外层源对象 t,致进度文案 [undefined](2026-09-02 实测) */
        await wait(1500);
        const ex = await run('cat ' + shq(DIR + '/.dl.exit') + ' 2>/dev/null', 3000);
        const exitCode = (ex.content || '').trim();
      if (exitCode !== '') {
          /* F10: 完成判定=退出码 + 最终尺寸复测(同 preflightDl 先例)——不再依赖轮询期 lastSz 快照,
             修复快速完成(首轮 1.5s 内 exit 0 但 lastSz 仍 -1)被误判失败并耗尽全部源的缺陷 */
          const finR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
          const finSz = pInt(finR);
          console.log('[小海关] 源', t.name, 'exit:', exitCode, 'finSz:', finSz, 'ok:', exitCode === '0' && finSz > 1024);
          if (exitCode === '0' && finSz > 1024) { ok = true; if (totalSz > 0) setFill(100) }
          else if (exitCode !== '0') { setTxt(esc(t.name) + ' 失败(exit ' + exitCode + '),换下一个源…') }
          else { setTxt(esc(t.name) + ' 下载不完整(' + finSz + 'B),换下一个源…') }
          break;
        }
        const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
        const sz = pInt(szR);
        if (sz === lastSz) { stagnant++; if (stagnant >= 10) { await run(killOwnDl(DIR + '/.dl.pid', DIR + '/.dl.exit'), 8000); setTxt('下载停滞,切换下一个源…'); break } }
        else { stagnant = 0; lastSz = sz }
        if (totalSz > 0) {
          const pct = Math.round(sz / totalSz * 100);
          setFill(pct);
          setTxt('[' + esc(t.name) + '] ' + (sz / 1048576).toFixed(1) + '/' + (totalSz / 1048576).toFixed(1) + 'MB ' + pct + '%');
        } else {
          setFill(Math.min(90, sz / 300000)); /* 无总大小时按~3MB估算 */
          setTxt('下载中 ' + (sz / 1048576).toFixed(1) + ' MB…');
        }
      }
      if (cancelled) break;
      setFill(0);
    }
    await run(killOwnDl(DIR + '/.dl.pid', DIR + '/.dl.exit'), 8000); /* F11: 先杀自有(exit 已写则跳过,防 PID 复用误杀),再清 exit 哨兵 */
    await run('rm -f ' + shq(DIR + '/.dl.exit'), 3000);
    if (cancelled) {
      await run('rm -f ' + shq(tmpF), 3000);
      mHide('hs_modal_simple'); toast('已取消安装', 'green'); return;
    }
    if (!ok) {
      await run('rm -f ' + shq(tmpF), 3000);
      setStep(2); setFill(0);
      setTxt('<span style="color:#e57373">❌ 所有在线源下载失败(国内网络限制的常见情况)</span>');
      toast('在线下载失败——推荐:电脑下载 .gz 后「上传」,或在安装页配置「自定义国内源」', 'red', 5000);
      await opLog('内核在线下载失败(全部源);已回到安装引导,推荐上传/自定义源');
      await wait(1500);
      openInstallGuide(true); return; /* v2.1.4: 不先 mHide——同一弹窗换内容即回引导页,先关后开有关窗收尾压制风险 */
    }
    /* 安装阶段 */
    setStep(3); setFill(0); setTxt('解压与安装…');
    const r = await run('cd ' + shq(DIR) + ' && gzip -dc mihomo.dl.gz > mihomo.tmp && chmod 755 mihomo.tmp && ./mihomo.tmp -v 2>&1 | head -n1 && mv mihomo.tmp mihomo && rm -f mihomo.dl.gz', 20000);
    const m = (r.content || '').match(/v?(\d+\.\d+\.\d+)/);
    await run('rm -f ' + shq(tmpF), 3000);
    await collectStatus();
    if (m) { C.ver = m[1]; await saveConf(); await opLog('内核在线安装 v' + C.ver) }
    if (!ST.bin) throw new Error('安装失败:文件可能不是有效内核');
    setStep(4); setFill(100);
    setTxt('<span style="color:#66bb6a">✅ 安装成功 v' + esc(C.ver || '?') + ',可启动引擎</span>');
    /* v2.1.4: 进度窗可能已被关闭/内容被换(✕ 关闭不中断=后台装完),元素不存在时跳过——
       此前裸取 .textContent 在 headless 完成时必 TypeError,吞掉成功 toast 与界面刷新 */
    const pcb = $('#hs_prog_cancel'); if (pcb) { pcb.textContent = '关闭'; pcb.onclick = () => { mHide('hs_modal_simple'); renderAll() } }
    toast('✅ 内核已安装 v' + (C.ver || '?'), 'green');
    renderCard(); renderMgrFoot();
    if (!$('#hs_modal_mgr').style.display || $('#hs_modal_mgr').style.display !== 'none') renderPane();
  } catch (e) {
    setTxt('<span style="color:#e57373">❌ ' + esc(e.message || e) + '</span>');
    const cb = $('#hs_prog_cancel'); if (cb) { cb.textContent = '关闭'; cb.onclick = () => mHide('hs_modal_simple') }
  } finally {
    hsInstBusy = false;
  }
}

/* ================= 配置事务(快照→验证→回退) ================= */
async function healthCheck() {
  await collectStatus();
  if (!ST.running) return { ok: false, reason: '进程未运行' };
  /* v1.8.5: 同探活口径(real 信号),此前读 LM/LR/LD 占位=恒真,端口检查是空操作 */
  if (!ST.listen.mixed) return { ok: false, reason: '混合端口未监听(或引擎未完全启动)' };
  if (!ST.listen.redir) return { ok: false, reason: '透明端口未监听' };
  if (!ST.listen.dns) return { ok: false, reason: 'DNS端口未监听' };
  const api = await run('curl -s -m 3 -H "Authorization: Bearer ' + C.secret + '" http://127.0.0.1:' + C.ports.ctrl + '/version 2>/dev/null', 6000);
  if (!((api.content || '').trim().startsWith('{'))) return { ok: false, reason: '控制接口无响应' };
  return { ok: true };
}
async function applyWithTxn(what) {
  const hasOld = (await run('[ -f ' + shq(CFG) + ' ] && echo 1', 3000)).content.trim() === '1';
  if (hasOld) await run('cp ' + shq(CFG) + ' ' + shq(CFG + '.last_good') + ' 2>/dev/null', 3000);
  if (!(await writeConfigAndValidate())) {
    if (hasOld) await run('cp ' + shq(CFG + '.last_good') + ' ' + shq(CFG), 3000);
    return false;
  }
  await engineStop();
  if (!(await engineStart())) {
    if (hasOld) {
      await run('cp ' + shq(CFG + '.last_good') + ' ' + shq(CFG), 3000);
      await engineStart();
      toast('新配置启动失败,已回退上一份可用配置', 'red');
      await opLog('TXN回退:启动失败(' + what + ')');
    }
    return false;
  }
  await wait(2000);
  let h = { ok: false, reason: '超时' };
  for (let i = 0; i < 5 && !h.ok; i++) { h = await healthCheck(); if (!h.ok) await wait(2500) }
  if (!h.ok) {
    if (hasOld) {
      await engineStop();
      await run('cp ' + shq(CFG + '.last_good') + ' ' + shq(CFG), 3000);
      await engineStart();
    }
    toast('健康验证失败(' + h.reason + '),已回退,改动已撤销', 'red');
    await opLog('TXN回退:验证失败(' + h.reason + ')(' + what + ')');
    return false;
  }
  toast('健康验证通过,新配置已生效', 'green');
  await opLog('TXN成功:' + what);
  return true;
}

/* ================= 配置导出/导入 ================= */
async function exportConf() {
  const txt = await readFile(CJ);
  let data = txt;
  /* 审查P2-7: 盘上 conf.json 损坏时回退内存配置(此前裸 parse 失败→导出无响应) */
  try { JSON.parse(txt || 'null') } catch (e) { data = JSON.stringify(C, null, 2); console.error('[小海关] conf.json 解析失败,导出回退内存配置:', e.message) }
  /* 审查P2-4: 导出脱敏引擎密钥——secret 置空,导入后 sanitizeConf/genSecret 自动重新生成 */
  const conf = JSON.parse(data);
  if (conf && typeof conf === 'object' && 'secret' in conf) conf.secret = '';
  const payload = JSON.stringify({ _app: 'xiaohaiguan', _ver: '0.1', exported: nowStr(), conf }, null, 2);
  dl('customs-配置导出-' + stampStr() + '.json', payload);
  toast('已导出(已脱敏引擎密钥,导入后将自动重新生成)', 'green');
  await opLog('配置已导出(secret 已脱敏)');
}
function importConf() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const txt = await f.text();
      const j = JSON.parse(txt);
      if (!j._app || j._app !== 'xiaohaiguan') { toast('不是小海关的配置文件', 'red'); return }
      const nc = j.conf;
      if (!nc || typeof nc !== 'object') { toast('配置内容无效', 'red'); return }
      /* 安全净化: 白名单 MAC 与 CIDR 排除会进 root 执行的防火墙脚本,导入数据一律先过白名单正则,非法条目直接丢弃 */
      if (Array.isArray(nc.devices)) nc.devices = nc.devices.filter(d => d && typeof d === 'object' && okMac(d.mac));
      /* 线路净化: 字段白名单+去重+设备引用存在性(组名会进 YAML,恶意值须拦) */
      if (Array.isArray(nc.lines)) {
        const seenId = {}, seenNm = {};
        nc.lines = nc.lines.filter(L => L && typeof L === 'object' && /^[A-Za-z0-9_-]{1,16}$/.test(String(L.id)) && !seenId[L.id]
          && typeof L.name === 'string' && L.name.trim() && L.name.length <= 12 && !seenNm[L.name.trim()]
          && ['auto', 'balance', 'fallback', 'node'].indexOf(L.mode) >= 0
          && (typeof L.node !== 'string' || L.node.length <= 64)
          && ['auto', 'balance', 'fallback', 'manual'].indexOf(L.pick || 'auto') >= 0
          && (L.nodes === undefined || (Array.isArray(L.nodes) && L.nodes.every(n => typeof n === 'string' && n.length <= 64))));
        nc.lines.forEach(L => { seenId[L.id] = 1; seenNm[L.name.trim()] = 1 });
        nc.lines = nc.lines.map(L => ({ id: L.id, name: String(L.name).trim(), mode: L.mode, pick: L.pick || 'auto', node: String(L.node || ''), nodes: (Array.isArray(L.nodes) ? L.nodes : []).slice(0, 30) }));
      } else nc.lines = [];
      const lineIds = {}; (nc.lines || []).forEach(L => { lineIds[L.id] = 1 });
      if (Array.isArray(nc.devices)) nc.devices.forEach(d => { if (d.line && !lineIds[d.line]) d.line = '' });
      if (Array.isArray(nc.exclude)) nc.exclude = nc.exclude.filter(x => x && typeof x.v === 'string' && (x.m !== 'cidr' || okCidr(x.v)));
      if (Array.isArray(nc.force)) nc.force = nc.force.filter(x => x && typeof x.v === 'string' && (x.m !== 'cidr' || okCidr(x.v)));
      const okc = await confirmBox({
        title: '导入配置',
        html: '<div class="hs-hint">来源:导出于 ' + esc(j.exported || '?') + '<br>包含:开关/白名单(' + ((nc.devices || []).length) + '台)/订阅(' + ((nc.subs || []).length) + '条)/端口/分流清单等<br><b>将完全覆盖当前配置</b>(引擎运行中会询问重启)</div>',
        okText: '导入'
      });
      if (!okc) return;
      C = Object.assign({}, DEF, nc);
      C.ports = Object.assign({}, PORT_DEF, nc.ports || {});
      sanitizeConf(); /* v1.8.5: 导入配置的 ports/tunName/secret/ip 同口径过滤 */
      await saveConf();
      await collectStatus();
      toast('✅ 配置已导入', 'green');
      await opLog('配置导入(覆盖)');
      renderAll();
      if (ST.running) await askApplyNow('配置导入');
    } catch (e) { toast('导入失败:' + e, 'red') }
  };
  inp.click();
}

/* ================= 内核上传安装(真实) ================= */
function uploadCore() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.gz,.zip';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    toast('上传中:' + f.name + '(' + Math.round(f.size / 1024) + 'KB,经 upload_file 直传)…', 'green');
    try {
      const up = await hsUploadByApi(f, DIR); /* 落盘路径以响应为准;fetch 无上传进度事件,LAN 直传秒级(原 25% 递进进度 toast 取消,保留本条不定态提示) */
      const r = await run('cd ' + shq(DIR) + ' && F=' + shq(up.path) + '; case "$F" in *.gz) gzip -dc "$F" > mihomo.tmp && mv mihomo.tmp mihomo;; *.zip) unzip -o "$F" >/dev/null 2>&1; [ -f mihomo ] || find . -type f -name mihomo | head -n1 | xargs -I{} mv {} mihomo;; esac; chmod 755 mihomo; rm -f "$F"; ./mihomo -v 2>&1 | head -n1', 25000);
      const m = (r.content || '').match(/v?(\d+\.\d+\.\d+)/);
      if (m) { C.ver = m[1]; await saveConf(); await opLog('内核上传安装 v' + C.ver) }
      await collectStatus();
      toast(ST.bin ? ('✅ 内核已安装' + (C.ver ? ' v' + C.ver : '')) : '安装失败:请确认压缩包内是 mihomo 可执行文件(arm64)', ST.bin ? 'green' : 'red');
      renderPane(); renderCard(); renderMgrFoot();
    } catch (e) { toast('上传异常:' + e, 'red') }
  };
  inp.click();
}
/* ================= 底部固定操作栏 ================= */
function renderMgrFoot() {
  const f = $('#hs_mgr_foot'); if (!f) return;
  /* 操作栏只在「状态」页显示(原型定稿:其余页签无底栏;卸载入口移入「更多」页三连击) */
  /* 显式 flex:style.display='' 会连内联 display:flex 一并清除,操作栏退化 block=按钮挤左下无间距(2026-09-13 真机实锤) */
  f.style.display = (hsTab === 'ov') ? 'flex' : 'none';
  const pend = C._pending && ST.running;
  const upg = !!(ST.upgradePending && ST.upgradePending.length); /* 待升级: 重启按钮高亮并明确是升级动作 */
  f.innerHTML =
    (ST.running ? '<button class="btn hs-dgr" id="hs_mf_stop">停止</button>' : '<button class="btn hs-go" id="hs_mf_start">启动</button>')
  + '<button class="btn' + ((pend || upg) ? ' hs-pri' : '') + '" id="hs_mf_restart"' + (ST.running ? '' : ' disabled') + '>' + (upg ? '⬆️ 升级' : '重启') + '</button>'
  + '<button class="btn hs-pri" id="hs_mf_diag">诊断</button>';
  const st = $('#hs_mf_stop');
  if (st) st.onclick = async () => {
    if (C.s1 !== 'off' || C.s2) {
      const ok = await confirmBox({ title: '停止代理引擎', html: '<div class="hs-hint">停止引擎将先摘除接管规则(新流量立即回直连),再平滑停止进程;接管终端的旧连接自动自愈,未接管终端不受影响。</div>', okText: '停止', danger: true });
      if (!ok) return;
    }
    await op(st, async () => { await engineStop() }, null, '停止中…'); renderMgrFoot(); renderCard();
    if (ST.upgradePending && ST.upgradePending.length) toast('已停止;检测到旧版组件仍在盘上,下次「启动」将自动完成升级', 'pink');
  };
  const sd = $('#hs_mf_start');
  if (sd) sd.onclick = async () => { await op(sd, async () => { await engineStart() }, null, '启动中…'); renderMgrFoot(); renderCard() };
  $('#hs_mf_restart').onclick = async () => {
    if (!ST.running) { toast('引擎未运行,无法重启', 'red'); return }
    const isUpg = !!(ST.upgradePending && ST.upgradePending.length);
    if (isUpg) await doUpgradeRestart();
    else await op($('#hs_mf_restart'), async () => { await engineRestart(); C._pending = false }, '✅ 平滑重启完成', '重启中…');
    renderMgrFoot();
  };
  $('#hs_mf_diag').onclick = openDiag;
}
async function doUninstall() {
  if (HS_UPGRADING) { toast('⬆️ 升级进行中,请等待完成后再卸载', 'pink'); return }
  /* v2.9.0 场景3: 备份引导前置为独立一步(用户可选备份/不备份,再进卸载确认) */
  /* v2.9.56: confirmBox 三路=OK true/取消✕ false——备份步改双按钮语义:
     [导出备份并继续]=true / [不备份,直接卸载]=经二段确认 / ✕ 或取消=终止卸载 */
  const bak = await confirmBox({
    title: '📦 卸载前备份', okText: '📦 导出备份并继续', cancelText: '❌ 取消卸载',
    html: '<div class="hs-hint">建议先导出配置备份(订阅/白名单/线路/分流清单/端口)——重装时导入即可恢复全部设置。</div><div class="hs-hint" style="margin-top:6px">取消或点 ✕ = 不卸载</div>'
  });
  if (!bak) { toast('已取消卸载', 'green'); return }
  await exportConf();
  const ok = await confirmBox({
    title: '卸载 小海关', danger: true, okText: '卸载', countdown: 0,
    html: '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" checked id="hs_un_core"><span><b>停止进程,删除内核与规则/自启</b><div class="hs-hint">mihomo 二进制 + HS_* 链 + boot.sh 自启行</div></span></div>'
    + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" id="hs_un_all" checked><span><b>删除全部数据目录</b><div class="hs-hint">内核/配置/订阅/日志,零残留</div></span></div>'
    + '<div class="hs-hint" style="margin-top:8px">卸载后执行残留检测,确保网络完全还原</div>'
  });
  if (!ok) return;
  const delAll = $('#hs_un_all') && $('#hs_un_all').checked;
  toast('卸载执行中…', 'green');
  await engineStop();
  await fwClean();
  await bootDisable();
  if (delAll) {
    await run('rm -rf ' + shq(DIR), 12000);
    C = Object.assign({}, DEF, { ports: Object.assign({}, PORT_DEF), devices: [], subs: [], exclude: [], force: [] });
    C.ports = Object.assign({}, PORT_DEF);
  } else {
    /* 保留数据模式: 删引擎与三件套生成物(含各自的 .bak 快照与 .last_good 回滚件,
       属可再生废弃物);geo/chnroute/订阅缓存/手动节点留给重装复用 */
    await run('rm -f ' + shq(BIN) + ' ' + shq(START) + ' ' + shq(FW) + ' ' + shq(CFG)
      + ' ' + shq(START) + '.bak ' + shq(FW) + '.bak ' + shq(CFG) + '.bak ' + shq(CFG) + '.last_good', 10000);
  }
  ST.upgradePending = []; ST.upgradeFrom = undefined; /* 卸载即无升级语境,防底栏高亮/弹卡残留(2026-09-03 审查) */
  await collectStatus(); await checkResidue();
  const rd = await run('ls ' + shq(DIR) + ' 2>/dev/null | wc -l; iptables -t nat -S 2>/dev/null | grep -c HS_; (grep -cF ' + shq(BOOT_KEY) + ' ' + shq(BOOT_SH) + ' 2>/dev/null || echo 0)'
    + '; for F in ' + shq(BIN) + ' ' + shq(START) + ' ' + shq(FW) + ' ' + shq(CFG) + '; do [ -f "$F" ] && echo X; done', 8000);
  const rl = (rd.content || '').split(/\s+/).map(Number).filter(x => !isNaN(x));
  /* 目录校验分口径: 全删=目录应空;保留数据=只要求四件套已删(目录非空是预期,此前误报"有残留:目录") */
  const cleanDir = delAll ? (rl[0] || 0) === 0 : !(rd.content || '').includes('X');
  const cleanRule = (rl[1] || 0) === 0, cleanBoot = (rl[2] || 0) === 0;
  const allClean = cleanDir && cleanRule && cleanBoot;
  const okMsg = allClean ? (delAll ? '✅ 卸载完成,零残留(目录/规则/自启 全清)' : '✅ 卸载完成,规则/自启已清,数据已保留(重装可复用)') : '⚠️ 有残留:' + (cleanDir ? '' : (delAll ? ' 目录' : ' 引擎/脚本')) + (cleanRule ? '' : ' 规则') + (cleanBoot ? '' : ' 自启') + ',建议跑诊断';
  toast(okMsg, allClean ? 'green' : 'red');
  renderCard(); renderMgrFoot(); renderPane();
}
/* ================= 一键诊断(真实基础版) ================= */
const DG_STEPS = ['采集进程与端口', '连通性测试', 'ET组网 兼容', '防火墙与残留', '资源占用', '线路与订阅', '汇总'];
let HS_DIAG = { state: 'idle', items: [], t: '' };
function openDiag() { if (HS_UPGRADING) { toast('⬆️ 升级进行中,请等待完成后再诊断', 'pink'); return } HS_DIAG = { state: 'idle', items: [], t: '' }; mShow('hs_modal_diag'); renderDiag() }
async function runDiag() {
  if (HS_UPGRADING) { toast('⬆️ 升级进行中,请稍候', 'pink'); return }
  HS_DIAG.state = 'run';
  /* 每步 700ms 让过程可感知(此前 360ms 有的一闪而过),弧线 transition 平滑走环 */
  for (let i = 0; i < DG_STEPS.length; i++) { HS_DIAG.step = i; renderDiag(); await wait(700) }
  await collectStatus(); await checkResidue();
  HS_DIAG.items = await buildDiagItems();
  HS_DIAG.state = 'done'; HS_DIAG.t = nowStr();
  renderDiag();
  const bad = HS_DIAG.items.filter(i => i.lv !== 'ok' && !i.fixed).length;
  toast(bad ? '诊断完成:发现 ' + bad + ' 项待处理' : '诊断完成:未发现问题 ✅', bad ? 'green' : 'green');
}
async function buildDiagItems() {
  const items = [];
  const ok = (g, t, d) => items.push({ g, lv: 'ok', t, d });
  const warn = (g, t, d, fix) => items.push({ g, lv: 'warn', t, d, fix, fixed: false });
  const dim = ST.running ? 'run' : 'stop';
  if (dim === 'run') {
    ok('进程与端口', 'mihomo 进程运行中' + (C.ver ? ' · v' + C.ver : ''), 'pid ' + ST.pid);
    const miss = ['mixed', 'redir', 'dns', 'ctrl'].filter(k => !ST.listen[k.toUpperCase().slice(0, 2)] && !ST.listen[k]);
    const lk = { mixed: '混合', redir: '透明', tproxy: 'UDP', dns: 'DNS', ctrl: '控制' };
    const missN = Object.keys(C.ports).filter(k => !ST.listen[k]);
    if (missN.length) warn('进程与端口', '端口未监听:' + missN.map(k => lk[k] + '(' + C.ports[k] + ')').join('、'), '引擎运行但部分端口未就绪,对应能力不可用', { id: 'rt-port', kind: 'confirm', act: '平滑重启引擎(若持续失败请查日志或换端口)' });
    else ok('进程与端口', '四端口监听正常', Object.keys(C.ports).map(k => lk[k] + ' ' + C.ports[k]).join(' / '));
    const cv = await run('curl -s -m 3 -H "Authorization: Bearer ' + C.secret + '" http://127.0.0.1:' + C.ports.ctrl + '/version', 6000);
    if (cv.success && cv.content.trim().charAt(0) === '{') ok('控制接口', '9090 可达', (cv.content || '').slice(0, 60));
    else warn('控制接口', '9090 无响应', 'secret 不匹配或配置异常;节点页签依赖此接口', { kind: 'manual', act: '手动:重启引擎;持续失败请开启运行日志后复现,再到 日志页签 查看输出' });
    /* 节点 UDP 能力(游戏/QUIC 关键): 流量证据优先,:53 探测兜底——失败≠必然无UDP(封53惯例) */
    const udpOk = await probeNodeUdp();
    if (udpOk === true) ok('节点 UDP', '出口节点 UDP 可用(有经节点回流的 UDP 流量实证)', '游戏/QUIC 可正常走代理');
    else if (udpOk === false) warn('节点 UDP', '节点 UDP 未能确认可用', '可能是机场封 UDP:53(常见)或节点不支持 UDP;游戏联机/语音若异常,请更换支持 UDP 转发的节点', { kind: 'manual', act: '手动:游戏异常时更换支持 UDP 转发的节点' });
    else ok('节点 UDP', '暂无流量证据(未判定)', '正常现象——近期无游戏/QUIC 流量即无证据;想确认单个节点:节点页「🛰️ 测UDP」做真实实测');
    const ex = await run('curl -s -m 6 -x http://127.0.0.1:' + C.ports.mixed + ' -o /dev/null -w "%{http_code} %{time_total}" https://www.gstatic.com/generate_204', 10000);
    const em = (ex.content || '').trim().split(/\s+/);
    if (em[0] === '204') ok('代理出口', '经代理访问外网成功', '耗时 ' + em[1] + 's');
    else warn('代理出口', '经代理访问外网失败', '可能无订阅/节点不可用(返回 ' + (em[0] || '?') + ');请检查订阅是否已添加');
    /* ① 国内直通体检扩 v6: 5 段计数(v4 ipset/挂载+v6 ipset/挂载+xt_set 可用);v6 判定与 fw gen
       兜底链路对应(cnn[2]>0&&cnn[3]>0 挂载 ok,cnn[4]===0 走逐段 RETURN 降级不告警,全 0 且 xt_set 在=未灌入 warn) */
    const cn = await run('ipset list hs_cn 2>/dev/null | grep -c "/"; iptables -t nat -S HS_LAN 2>/dev/null | grep -c "match-set hs_cn"; ipset list hs_cn6 2>/dev/null | grep -c "/"; ip6tables -t nat -S HS_V6_LAN 2>/dev/null | grep -c "match-set hs_cn6"; ip6tables -m set -h >/dev/null 2>&1 && echo 1 || echo 0', 8000);
    const cnn = (cn.content || '').split(/\s+/).map(Number);
    const file6 = (ST.chn6 || 0) >= 20; /* chnroute6.txt 完整表已装口径(与 :1468 下载任务一致) */
    if (cnn[0] > 0 && cnn[1] > 0) ok('国内直通', 'ipset ' + cnn[0] + ' 条已挂载', '中国 IP 内核态放行,不进 mihomo'
      + (C.cnBypass !== false && cnn[2] > 0 && cnn[3] > 0 ? '；v6: hs_cn6 ' + cnn[2] + ' 条已挂载' + (file6 ? '' : '(内置三网大段兜底；完整表未装，可到 设置→分流→国内直通 补全)') : '')
      + (C.cnBypass !== false && cnn[4] === 0 ? '；内核缺 xt_set，v6 直通走逐段 RETURN 降级' : ''));
    else if (C.cnBypass !== false) warn('国内直通', ST.chn >= 5000 ? '路由表已装但规则未挂(未接管?)' : '路由表未安装,直通未生效', '国内流量仍经 mihomo 分流', { kind: 'manual', act: '手动:到 分流→国内直通加速 下载路由表' });
    else ok('国内直通', '已关闭(用户设置)', '国内流量经 mihomo 内部分流');
    if (C.cnBypass !== false && cnn[2] === 0 && cnn[3] === 0 && cnn[4] > 0) warn('国内直通', 'v6 国内直通未生效(hs_cn6 未灌入/未挂载)', '国内 v6 流量全量进引擎分流，弱 CPU 上国内站变慢(微信图片转圈同因)', { kind: 'manual', act: '手动：设置→分流→国内直通 下载/上传 v6 完整表后重应用规则' });
  } else {
    /* ② 规则残留扩 v6 口径: 前 6 段与 checkResidue 逐字一致(v4 nat/mangle+v4/v6 rule 表 100+v6 nat/mangle),第 7 段 tun link=孤儿网卡(nn[6]);
       两处口径为文本级复制,静态断言以计数 ≥2 锁『两处都在』(未来抽公共函数需同步改断言) */
    const rn = await run('iptables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N"; iptables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N"; ip rule show 2>/dev/null | grep -c "lookup 100"; ip6tables -t nat -S 2>/dev/null | grep HS_ | grep -vc "^-N"; ip6tables -t mangle -S 2>/dev/null | grep HS_ | grep -vc "^-N"; ip -6 rule show 2>/dev/null | grep -c "lookup 100"; ip link show ' + shq(C.tunName) + ' 2>/dev/null | wc -l', 8000);
    const nn = (rn.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x)); /* v1.8.5: 保留 0 值防下标漂移 */
    if (nn[0] > 0 || nn[1] > 0 || nn[2] > 0 || nn[3] > 0 || nn[4] > 0 || nn[5] > 0) warn('规则残留', 'HS_* 链或策略路由表 100 残留(v4/v6)', '对直连的影响:终端 DNS 解析失败(HS_DNS 残留→53 转发无人监听),命中流量(含国内)被转发到已停止的代理端口→断网;v6 残留同样把流量送进已停止的代理端口(黑洞);请清理后再用网络', { id: 'st-chain', kind: 'auto', act: '清空 HS_* 链与表 100(fwClean)' });
    else ok('规则残留', '防火墙与路由干净', '无 HS_* 链,无表 100 残留,国内直连不受影响');
    if (nn[6] > 0) warn('孤儿网卡', 'tun 网卡 ' + C.tunName + ' 存在(进程已停)', '残留 tun 可能干扰路由判定', { id: 'st-tun', kind: 'auto', act: '删除孤儿 tun 网卡' });
    else ok('孤儿网卡', '无孤儿 tun 网卡', '');
    const lr = await run("netstat -tln 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un", 6000);
    const listeners = (lr.content || '').split(/\s+/).map(Number).filter(Boolean);
    const lk = { mixed: '混合', redir: '透明', tproxy: 'UDP', dns: 'DNS', ctrl: '控制' };
    const bad = Object.keys(C.ports).filter(k => listeners.indexOf(C.ports[k]) >= 0);
    if (bad.length) warn('端口可用性', '端口被占用:' + bad.map(k => lk[k] + ' ' + C.ports[k]).join('、'), '下次启动将冲突', { id: 'st-ports', kind: 'param', act: '参数修复:换用可用端口', keys: bad });
    else ok('端口可用性', '四端口均空闲', Object.keys(C.ports).map(k => C.ports[k]).join('/'));
  }
  const et = await etCheck();
  if (et !== 'noinstall') {
    if (C.coexistAuto && et === 'ok') ok('ET组网 兼容', '自动兼容已开启,状态文件可读', '将自动排除 ET 网段与打洞端口(规则已生效)');
    else if (et === 'badstate') warn('ET组网 兼容', '状态文件存在但内容异常', '按预期版本读不到有效路由;请在 ET 插件重新开关一次状态文件输出', null);
    else if (et === 'nostate') warn('ET组网 兼容', 'ET 在位但其「状态文件输出」未开启', '开启自动兼容前需先在 ET 打开输出开关;或忽略', null);
    else if (!C.coexistAuto) warn('ET组网 兼容', '检测到 EasyTier,自动兼容未开启(默认关闭)', '仅两插件同跑时需要;不开启则组网流量可能被劫持', { id: 'rt-coex', kind: 'confirm', act: '校验 ET 后开启自动兼容' });
  }
  /* 面板优先原则(2026-09-02 用户定调): UFI 面板是所有插件能力的单点,资源紧张时先保面板 */
  const fr = await run("free 2>/dev/null | awk '/Mem:/{print \$NF}'", 5000);
  const availKB = parseInt((fr.content || '').trim()) || 0;
  if (availKB && availKB < 102400) warn('资源', '系统可用内存仅 ' + (availKB / 1024).toFixed(0) + 'MB,可能拖垮面板甚至触发系统杀进程', '设备上 UFI 面板/基带/组网与引擎共存,内存见底时面板最先受害', { kind: 'manual', act: '手动:到 设置 开启「低内存模式」;仍紧张则考虑少开其他插件或减少订阅节点量' });
  else if (availKB) ok('资源', '系统可用内存 ' + (availKB / 1024).toFixed(0) + 'MB(面板运行有保障)', '');
  /* ⑦ 磁盘剩余: v2.1.6 口径修正——超长设备名会让 BusyBox df 把行折成两行,数据行按 $4 取到的是 Use%("9%"→9KB),
     真机曾误报"剩余 0.0MB"(实际 /data 尚余 1.6G);改按挂载点匹配行取 $(NF-2)=Available,折行/不折行都对;
     两处都取不到(dv 全 0)不出项不误报(fail-safe);行异常时非数字被 filter 滤掉,同走不出项 */
  const dr = await run('df -k /data /overlay 2>/dev/null | awk \'$NF=="/data" || $NF=="/overlay" {print $(NF-2)}\'', 5000);
  const dv = (dr.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x) && x >= 1024); /* <1MB 物理不可能=解析残渣(漏报优于误报) */
  const diskKB = (dv[0] || 0) > 0 ? dv[0] : (dv[1] || 0);
  if (diskKB > 0 && diskKB < 20480) warn('资源', '磁盘剩余仅 ' + (diskKB / 1024).toFixed(1) + 'MB(<20MB)', '存储将满：配置/订阅/路由表写入与下载会静默失败，日志轮转与面板数据也受影响(下载/启动时会自动清临时文件，满盘仍需手动清理)', { kind: 'manual', act: '手动：设置→日志 清空运行日志；订阅页删除不用的订阅；总览 清理升级备份；必要时卸载不用的其他插件释放存储' });
  else if (diskKB > 0) ok('资源', '磁盘剩余 ' + (diskKB / 1024).toFixed(1) + 'MB', '写入/下载有空间保障');
  /* ④ 地理数据完整性: 存在性(=GI/=GS 时间戳,0=缺失)+尺寸双信号合并(单看时间戳会漏 0 字节文件),
     阈值与 GEO_FILES/bootPreflight 同口径;尺寸是启发式非哈希,≥阈值半截文件漏报由 mihomo -t 等兜底 */
  const gr = await run('wc -c < ' + shq(DIR + '/geoip.metadb') + ' 2>/dev/null; wc -c < ' + shq(DIR + '/geosite.dat') + ' 2>/dev/null', 5000);
  const gn = (gr.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x));
  const gip = gn[0] || 0, gsi = gn[1] || 0;
  const geoBad = [];
  if (!ST.geoIpT || gip < 2097152) geoBad.push('GeoIP' + (ST.geoIpT ? '(仅 ' + (gip / 1048576).toFixed(1) + 'MB，完整库≥2MB)' : '(未安装)'));
  if (!ST.geoSiteT || gsi < 524288) geoBad.push('GeoSite' + (ST.geoSiteT ? '(仅 ' + (gsi / 1024).toFixed(0) + 'KB，完整库≥512KB)' : '(未安装)'));
  if (geoBad.length) warn('地理数据', geoBad.join('、'), 'GEOIP,CN/GEOSITE,CN 规则缺位——分流精度退化；RULE-SET china_ip 兜底不受影响（chnroute 独立供给）', { kind: 'manual', act: '手动：设置→地理数据 点对应「安装/更新」；或下次启动引擎时启动自检自动补齐' });
  else ok('地理数据', 'GeoIP ' + (gip / 1048576).toFixed(1) + 'MB · GeoSite ' + (gsi / 1048576).toFixed(1) + 'MB', '完整性校验通过(尺寸≥最低阈值)');
  if (ST.running && ST.pid) {
    const mr = await run('grep VmRSS /proc/' + ST.pid + '/status 2>/dev/null', 5000);
    const mb = parseInt((mr.content || '').replace(/.*?(\d+)\skB/, '$1')) || 0;
    if (mb > 153600) warn('资源', '内存 ' + (mb / 1024).toFixed(0) + 'MB,偏高', '建议开启低内存模式或平滑重启', { id: 'rt-mem', kind: 'confirm', act: '平滑重启引擎' });
    else ok('资源', '内存 ' + (mb / 1024).toFixed(0) + 'MB' + (ST.kb ? ' · 目录 ' + (ST.kb / 1024).toFixed(1) + 'MB' : '') + (C.lowMem ? ' · 已限堆' : ' · 建议开低内存模式保面板'), '');
  } else {
    ok('数据占用', ST.kb ? '目录 ' + (ST.kb / 1024).toFixed(1) + 'MB' : '目录为空或未创建', '不保留旧版内核');
    /* 停止态日志残留: 排查完毕即清理(下次启动的 start.sh 兜底只拦 ≥256KB) */
    if ((ST.rlog || 0) > 1024) warn('日志', '运行日志残留 ' + Math.round((ST.rlog || 0) / 1024) + 'KB(引擎已停止)', '排查完毕建议清理;需保留请先到日志页签导出', { id: 'log-trunc', kind: 'auto', act: '清空运行日志' });
    else ok('日志', '无运行日志残留', '');
    /* 启动预检: 用当前插件配置现场生成 yaml 走 mihomo -t——回答"现在点启动能不能成" */
    if (ST.bin) {
      const tmp = DIR + '/.cfgtest.yaml';
      const gy = genConfigYaml();
      const w = gy === null ? false : await writeFile(tmp, gy); /* F05: 解析失败返回 null→预检不写盘 */
      if (w) {
        const t = await run(shq(BIN) + ' -t -d ' + shq(DIR) + ' -f ' + shq(tmp) + ' 2>&1 | tail -3; rm -f ' + shq(tmp), 15000);
        const out = (t.content || '').trim();
        if (/successful/i.test(out)) ok('启动预检', '当前配置可正常启动引擎', '端口/线路/节点池等配置均通过校验');
        else warn('启动预检', '当前配置无法通过引擎校验,点启动会失败', (out.split('\n').filter(l => /fatal|error/i.test(l))[0] || out.slice(0, 90)), { kind: 'manual', act: '手动:按上方错误调整对应设置/线路后重试' });
      }
    }
  }
  /* 升级备份检查: 存在未回滚备份 → 信息项+可选清理(弹交互让用户勾选确认,绝不主动删) */
  if (C.upgBackup && !C.upgBackup.rolledBack) {
    ok('升级备份', '留有 ' + esc(C.upgBackup.from) + ' 组件备份(' + esc(C.upgBackup.time || '') + ')', '升级成功正常运行 3 天后自动清理;期间可到 总览 回滚', { id: 'upg-bak', kind: 'confirm', act: '清理升级备份(需确认)' });
  } else if (C.upgBackup && C.upgBackup.rolledBack) {
    warn('降级运行', '已回滚到 ' + esc(C.upgBackup.from || '?') + ' 组件', '插件新版本(' + (C.upgBackup.rolledFrom || '?') + ' 之后)发布前不再提示升级;如需恢复最新组件,升级到更新的插件版本即可', { kind: 'manual', act: '手动:升级到更新版本的插件(高于 ' + esc(C.upgBackup.rolledFrom || '?') + ')后正常升级' });
  }
  /* 完整接管检查 */
  /* v2.8.11: 待升级检查提升到 dim/run 门槛之外——盘上三件套 vs 插件版本是静态比对,
     与引擎是否运行/诊断深度无关(用户实锤: 引擎停止/快速诊断时诊断不出待升级) */
  if (ST.upgradePending === undefined) await upgradeAudit(); /* 诊断独立可跑,不依赖 init 曾执行 */
  if (ST.upgradePending && ST.upgradePending.length) {
    warn('待升级', '小海关已更新到新版(v' + V + '),待完成升级', '点击插件卡片的「⬆️ 待升级」或到配置页打开升级卡,一键完成', { id: 'rt-upg', kind: 'confirm', act: '打开升级卡' });
  } else if (ST.running && dim === 'run') {
    ok('接管架构', 'TPROXY v3 组件齐备(fw/start/yaml 指纹核对通过)', '');
  }
  if (ST.running && dim === 'run') {
    const fr = await run('sh ' + shq(FW) + ' status 2>&1', 8000);
    const fwOut = (fr.content || '').trim();
    if (C.s1 !== 'off' || C.s2) {
      if (fwOut.indexOf('HS_') >= 0) ok('透明接管', '防火墙规则已挂载', fwOut.split('\n')[0] || '');
      else warn('透明接管', '开关已开但规则未挂载', '可能被手动清除;修复将重新挂载', { id: 'rt-fw', kind: 'confirm', act: '重新应用防火墙规则' });
      if (C.s1 === 'white') {
        /* v3: 白名单已改 MAC 跳转——核对 PREROUTING 集合跳转存在 + ipset 内 MAC 数 = 白名单设备数 */
        const wc = await run('iptables -t nat -S PREROUTING 2>/dev/null | grep -c "match-set hs_wmac"; ipset list hs_wmac 2>/dev/null | grep -c "^[0-9a-fA-F][0-9a-fA-F]:"', 5000);
        const exp = C.devices.filter(d => d.proxy).length;
        const nums = (wc.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x)); /* v1.8.5: 同上 */
        if (exp > 0 && (nums[0] || 0) >= 1 && (nums[1] || 0) >= exp) ok('防火墙一致性', '白名单 ' + exp + ' 台设备 MAC 跳转核对通过(ipset ' + nums[1] + ' MAC)', '');
        else if (exp > 0) warn('防火墙一致性', 'MAC 跳转未完整(跳转 ' + (nums[0] || 0) + '/ipset ' + (nums[1] || 0) + ' MAC,期望 ' + exp + ' 台)', '白名单设备的代理可能未接管;重新应用规则或重启引擎', { id: 'rt-fw', kind: 'confirm', act: '重新应用防火墙规则' });
        /* 白名单 MAC 健康: 隐私MAC(本地管理位)有轮换失效风险;勾选了但当前不在线的MAC要提醒核对
           (无法自动修复——不知道用户想让哪台在线设备进白名单,只能引导;2026-09-03 游戏UDP排障实测事故) */
        const onlineMacs = {};
        Object.keys(ST.arp4 || {}).forEach(ip => { onlineMacs[String(ST.arp4[ip]).toLowerCase()] = 1 });
        Object.keys(ST.neigh6 || {}).forEach(v6 => { onlineMacs[String(ST.neigh6[v6]).toLowerCase()] = 1 });
        const proxied = C.devices.filter(d => d.proxy && d.mac);
        const privacyMacs = proxied.filter(d => isPrivacyMac(d.mac));
        const ghostMacs = proxied.filter(d => !onlineMacs[String(d.mac).trim().toLowerCase()]);
        const onlineTotal = Object.keys(onlineMacs).length;
        if (privacyMacs.length) warn('白名单MAC健康', privacyMacs.length + ' 台白名单设备使用隐私/随机 MAC(' + privacyMacs.map(d => esc(d.name)).join('、') + ')', '本地管理地址(第2位为2/6/A/E)会随设备轮换,轮换后白名单自动失效且无提示——手机建议到 Wi-Fi 设置关闭私有Wi-Fi地址,用真实硬件 MAC 重新勾选', { kind: 'manual', act: '手动:设备关闭私有Wi-Fi地址后,到 设备页 用真实MAC重新勾选' });
        if (ghostMacs.length && onlineTotal) warn('白名单MAC健康', ghostMacs.length + ' 台白名单设备当前不在线(' + ghostMacs.map(d => esc(d.name)).join('、') + ')', '可能只是设备离线;也可能 MAC 已轮换(白名单实际空转,接管范围内无设备)——若游戏/代理突然全失效,优先到这里核对', { kind: 'manual', act: '手动:到 设备页 刷新,确认目标设备在列并已勾选' });
        if (proxied.length && !ghostMacs.length && !privacyMacs.length) ok('白名单MAC健康', proxied.length + ' 台白名单设备 MAC 全部在线且为真实硬件地址', '');
      }
    } else if (fwOut.indexOf('HS_') >= 0) {
      warn('透明接管', '开关全关但有残留规则', '', { id: 'rt-fw', kind: 'auto', act: '清除残留规则' });
    } else {
      ok('透明接管', '未接管,规则为空(正常)', '');
    }
    /* ⑧ TUN 降级态体检: fw.sh apply 落 .tpmode 降级标记(fw_clean 清除),status 读回判定。
       自包门控(s1=off 且未开 s2 时 UDP 本就不接管,整组不出现;此时 status 可能回陈旧 TPM=1,不可裸读) */
    if (C.s1 !== 'off' || C.s2) { const tm = fwOut.match(/TPM=(\d) TPM6=(\d)/);
      if (!tm) ok('UDP 接管', '降级标记不可读(旧版 fw.sh)', '重启引擎生成新版 fw.sh 后此检查生效');
      else if (tm[1] === '1') ok('UDP 接管', 'UDP TPROXY 正常(v4' + (tm[2] === '1' ? '+v6' : ',v6 未接管') + ')', '游戏/QUIC 走内核 TPROXY，低延迟不换 NAT 类型');
      else warn('UDP 接管', 'xt_TPROXY 不可用，UDP 走 TUN 降级' + (tm[2] === '0' ? '(v6 UDP 未接管)' : ''), 'TUN 兜底接管 UDP，但游戏联机可能受影响（延迟升高、NAT 类型变差、QUIC 握手变慢）；内核补上 xt_TPROXY 后重启引擎自动恢复', { kind: 'manual', act: '手动：此为内核模块缺失，面板无法自动安装；升级带 xt_TPROXY 的固件后重启引擎即可' });
    }
    /* ⑤ 数据对账: chnroute 行数(e) vs ipset 实际条数(a),fw 灌入失败可见化。容差 3 条=awk 过滤非法行/
       hash:net 去重重复行的合法差异,不告警。双重门控: cnBypass 关=无对账对象;s1=off 且未开 s2 时
       fw_apply 三处触发全带接管门控(实测),ipset 已被 fw_clean destroy 而 status 回 CN4=0,裸对账恒误报且修复不收敛 */
    if (C.cnBypass !== false && (C.s1 !== 'off' || C.s2)) {
      const m4 = fwOut.match(/CN4=(\d+)/), m6 = fwOut.match(/CN6=(\d+)/);
      const a4 = m4 ? +m4[1] : -1, a6 = m6 ? +m6[1] : -1;
      const e4 = ST.chn || 0, e6 = ST.chn6 || 0;
      const mism = [];
      if (e4 > 0 && a4 >= 0 && (a4 === 0 || a4 < e4 - 3)) mism.push('v4:ipset ' + a4 + ' 条 < chnroute.txt ' + e4 + ' 行');
      if (e6 >= 20 && a6 >= 0 && (a6 === 0 || a6 < e6 - 3)) mism.push('v6:ipset ' + a6 + ' 条 < chnroute6.txt ' + e6 + ' 行');
      if (mism.length) warn('国内直通对账', 'ipset 灌入条数与路由表对不上(' + mism.join(';') + ')', 'fw 灌入曾中断——命中这些网段的国内流量退回 mihomo 分流（弱 CPU 变慢）', { id: 'rt-cnrec', kind: 'confirm', act: '重新应用防火墙规则(重灌 ipset)；重灌后仍差=路由表文件含非法/重复行，请到 设置→分流 重新下载/上传' });
      else if (a4 >= 0) ok('国内直通对账', '对账一致(v4 ' + a4 + '/' + e4 + ' 行' + (e6 >= 20 ? ',v6 ' + a6 + '/' + e6 + ' 行' : '') + ')', (a4 !== e4 ? '少量行被过滤(容差内)。' : '') + (e6 < 20 ? 'v6 表未装，内核态用内置三网大段兜底(对账跳过)' : ''));
      /* a4<0: 旧版 fw.sh 无 CN4 输出,不出项(旧组件由「接管架构」项管) */
    }
    const cf = await readFile(CFG);
    if (cf) {
      const fb = cf.match(/MATCH,(.+)/);
      if (fb && fb[1].trim() === 'DIRECT') warn('IP泄露风险', '规则兜底 MATCH→DIRECT', '未匹配境外流量直连出网', { id: 'rt-fb', kind: 'confirm', act: '兜底改为🚀节点选择(境外走代理)' });
      else if (fb) ok('IP泄露风险', '兜底:' + fb[1].trim(), '');
    }
    const v6 = await run('ip6tables -t nat -S HS_V6_LAN 2>/dev/null | grep -c REDIRECT; ip -6 route show default 2>/dev/null | wc -l', 5000);
    const v6n = (v6.content || '').split(/\s+/).map(x => parseInt(x, 10)).filter(x => !isNaN(x)); /* v1.8.5: 同上 */
    if ((v6n[1] || 0) > 0 && (v6n[0] || 0) === 0) warn('IP泄露风险', 'IPv6 有默认路由但 v6 接管规则未挂载', '终端可 v6 直连绕过代理', { id: 'rt-v6', kind: 'confirm', act: '重新应用防火墙(含v6接管)' });
    else if ((v6n[1] || 0) > 0 && (v6n[0] || 0) > 0) ok('IP泄露风险', 'IPv6 已接管(HS_V6_LAN REDIRECT 规则就绪)', '');
    const cs = await getConnectionStats();
    if (cs) ok('连接', '活跃 ' + cs.total + ' 条', Object.keys(cs.bySrc).map(k => k + ':' + cs.bySrc[k]).join(' ').slice(0, 80));
    /* ===== v2.9.0 场景2增强: 功能全景缺口检查 ===== */
    /* 过滤规则生效验证: 配了过滤→盘上 config.yaml 应含 exclude-filter */
    const hasFilterCfg = (C.subs || []).some(s => s && s.filter && (s.filter.kws || []).length);
    if (hasFilterCfg) {
      const cfgTxt = await readFile(CFG);
      if (cfgTxt && cfgTxt.indexOf('exclude-filter') < 0) warn('订阅过滤', '已配置过滤规则但引擎配置中未生效', '过滤未写入 config.yaml;重写配置并热重载', { id: 'rt-line', kind: 'confirm', act: '重写配置并热重载' });
      else if (cfgTxt) ok('订阅过滤', '过滤规则已写入引擎配置', '');
    }
    /* 融合矛盾(运行态): 融合开但非合并模式 */
    if (C.subFusion && C.policySrc !== 'merge') warn('配置矛盾', '融合开关已开但策略来源=' + ({ self: '自建', direct: '直通' })[C.policySrc] + ',融合未生效', '融合仅在合并模式下生效;切换策略来源或关融合开关', { kind: 'manual', act: '手动:设置→策略来源 切换到合并' });
    /* 线路锁定节点失配: 线路点名的节点在当前节点池中已不存在 */
    if ((C.lines || []).length && cs) {
      const deadLines = [];
      (C.lines || []).forEach(L => {
        if (L && L.mode === 'node' && Array.isArray(L.nodes) && L.nodes.length) {
          const alive = L.nodes.filter(n => cs.bySrc && Object.keys(ST.arp4 || {}).length >= 0); /* 占位——用组节点验证成本高,降级为计数提示 */
          if (!L.nodes.length) deadLines.push(L.name);
        }
      });
      /* 简化: 检查线路组在引擎中存在(名字带线路前缀)——引擎组列表校验 */
      const lg = await apiGet('/proxies');
      if (lg && lg.proxies) {
        const grpNames = Object.keys(lg.proxies);
        const missLn = (C.lines || []).filter(L => L && L.name && !grpNames.some(g => g.indexOf(L.name) >= 0) && grpNames.indexOf('🛤 ' + L.name) < 0);
        if (missLn.length) warn('分设备线路', missLn.length + ' 条线路组未在引擎中(' + missLn.map(L => esc(L.name)).join('、') + ')', '订阅更新后节点失配或配置未同步;重写配置并热重载', { id: 'rt-line', kind: 'confirm', act: '重写配置并热重载' });
      }
    }
    /* 国内直通表时效: chnroute 文件超过 90 天未更新 */
    if (C.cnBypass !== false && ST.chn > 0) {
      const chnAge = await run('echo $(( ($(date +%s) - $(stat -c%Y ' + shq(DIR + '/chnroute.txt') + ' 2>/dev/null || echo 0)) / 86400 ))', 5000);
      const ageD = parseInt((chnAge.content || '0').trim(), 10) || 0;
      if (ageD > 90) warn('国内直通表', '路由表已 ' + ageD + ' 天未更新', '新网段可能未收录(新国内站误走代理);到 设置→分流 重新下载', { kind: 'manual', act: '手动:设置→分流 更新路由表' });
      else ok('国内直通表', '路由表 ' + ageD + ' 天前更新(' + ST.chn + ' 条)', '');
    }
    /* ET五维在位: ET活跃时验证排除规则已挂载
       v2.2.2 判据修正: 旧判据 grep 字面量 "ETNETS|etzll|$ETIPS" 恒 0(iptables -S 回显的是 shell 变量展开后的
       真实网段/端口,变量名不可能出现在规则里)→ET 活跃时必误报"排除规则未挂载"(真机 WebSSH 实证:实际 HS_LAN
       7 条/HS_UDP 3 条 ET 排除在位)。改判 ET_CACHE 真实网段与打洞端口是否出现在规则文本中 */
    if (C.coexistAuto && ET_CACHE && ET_CACHE.active) {
      const rr = await run('iptables -t nat -S HS_LAN 2>/dev/null; iptables -t mangle -S HS_UDP 2>/dev/null', 8000);
      const rl = rr.content || '';
      const cN = (ET_CACHE.cidrs || []).filter(c => rl.indexOf('-d ' + c + ' ') >= 0).length;
      const pN = (ET_CACHE.p2p_ports || []).filter(p => rl.indexOf(' ' + p + ' ') >= 0).length;
      if (!cN && !pN) warn('ET组网共存', 'ET 运行中但排除规则未挂载', 'ET 流量可能被代理干扰;重新应用防火墙', { id: 'rt-fw', kind: 'confirm', act: '重新应用防火墙规则' });
      else ok('ET组网共存', '排除规则在位(' + cN + ' 网段/' + pN + ' 打洞端口)', '');
    }
    /* IPv6 响应开启(运行态提示) */
    if (C.v6Dns) warn('IPv6 响应', '实验开关已开启(运行中)', 'v6 流量正进入引擎处理;如 CPU 占用高或变慢,到 设置→分流 关闭', { kind: 'manual', act: '手动:设置→分流→IPv6 响应 关闭' });
    /* 订阅时效: 超过 7 天未更新 */
    const staleSubs = (C.subs || []).filter(s => {
      if (!s || !s.time) return false;
      const t = new Date(String(s.time).replace(' ', 'T'));
      return !isNaN(t) && (Date.now() - t.getTime()) > 7 * 86400000;
    });
    if (staleSubs.length) warn('订阅时效', staleSubs.length + ' 个订阅超 7 天未更新(' + staleSubs.map(s => esc(s.name)).join('、') + ')', '节点信息可能过时;到 订阅页 点⟳更新', { kind: 'manual', act: '手动:订阅页 更新' });
  /* === 日志健康(运行态) === */
  if (C.logEnabled) {
    if ((C.logLevel || 'info') === 'debug') warn('日志', '日志级别为 debug,输出量极大', '弱 CPU 设备上 debug 级持续消耗 CPU 与存储(曾单日写至 6MB),排查完请改回 info 或关闭', { kind: 'manual', act: '手动:设置→日志级别 改回 info(或关闭日志)' });
    else ok('日志', '日志记录已开启(' + (C.logLevel || 'info') + ' 级)', '仅排查期使用,完毕后建议关闭');
  } else ok('日志', '日志记录已关闭(silent)', '需要排查时再到设置开启');
  const lgSz = ST.rlog || 0;
  if (lgSz >= 262144) warn('日志', '严重:运行日志已达 ' + Math.round(lgSz / 1024) + 'KB(≥256KB 上限)', '自动清理即将/已经触发;如需保留完整现场请立即到 日志页签 导出', { id: 'log-trunc', kind: 'auto', act: '立即清空运行日志' });
  else if (lgSz >= 204800) warn('日志', '运行日志已达 ' + Math.round(lgSz / 1024) + 'KB(≥200KB)', '接近上限,建议导出后清理', { id: 'log-trunc', kind: 'auto', act: '立即清空运行日志' });
  else if (lgSz > 1024) ok('日志', '运行日志 ' + Math.round(lgSz / 1024) + 'KB', '容量健康');

    /* === 分设备线路 === */
    const assigned = C.devices.filter(d => d.line);
    if (assigned.length || (C.lines || []).length) {
      const rulesR = await apiGet('/rules');
      const srcN = rulesR && rulesR.rules ? rulesR.rules.filter(r => r.type === 'SrcIPCIDR').length : -1;
      if (srcN < 0) warn('分设备线路', '规则接口不可读', '无法确认线路规则是否加载', { kind: 'manual', act: '手动:确认引擎已完全启动后点「复诊」' });
      else if (assigned.length && srcN === 0) warn('分设备线路', assigned.length + ' 台设备已指定线路,但引擎无线路规则', '配置未同步进引擎', { id: 'rt-line', kind: 'confirm', act: '重写配置并热重载(同步线路规则与线路组)' });
      else ok('分设备线路', '线路规则已加载 ' + srcN + ' 条', assigned.length ? assigned.length + ' 台设备已指定线路' : '暂无设备指定线路');
      const pxR = await apiGet('/proxies');
      if (pxR && pxR.proxies) {
        (C.lines || []).forEach(L => {
          if (!L || !L.name) return;
          const g = pxR.proxies['🛤️ ' + L.name];
          if (!g) warn('分设备线路', '线路组「' + L.name + '」不在引擎中', '配置未同步或线路名变更', { id: 'rt-line', kind: 'confirm', act: '重写配置并热重载(同步线路组)' });
          else if (L.mode === 'node' && Array.isArray(L.nodes) && L.nodes.length > 1) {
            const pool = pxR.proxies['🛤️ ' + L.name + '·池'];
            const poolN = pool && pool.all ? pool.all.length : -1;
            if (poolN === 0) warn('分设备线路', '候选池「' + L.name + '」筛出 0 节点', '订阅节点名可能已变化', { kind: 'manual', act: '手动:到 设备→🛤️线路 重新勾选该线路的节点' });
            else ok('分设备线路', '候选池「' + L.name + '」' + poolN + ' 节点', pool && pool.now ? '当前:' + pool.now : '');
          }
        });
      }
    }
    const badRef = C.devices.filter(d => d.line && !(C.lines || []).some(L => L && L.id === d.line));
    if (badRef.length) warn('分设备线路', badRef.length + ' 台设备的线路指派已失效(线路被删除)', '相关设备正走全局线路', { id: 'cfg-lineref', kind: 'auto', act: '清理失效指派(恢复跟随全局)' });
    /* === DNS 劫持链 === */
    const dnsCh = await run('iptables -t nat -S HS_DNS 2>/dev/null | grep -c REDIRECT; iptables -t nat -S HS_DNS 2>/dev/null | grep -c RETURN; iptables -t nat -L HS_DNS -v -n 2>/dev/null | awk \'$0 ~ /dpt:53/ {s+=$1} END {print s+0}\'', 8000);
    const dn = (dnsCh.content || '').split(/\s+/).map(Number);
    if ((dn[0] || 0) >= 2 && (dn[1] || 0) === 0) ok('DNS 劫持', '53 端口全量劫持(UDP+TCP),无私网放行', '已拦截终端 DNS 查询 ' + (dn[2] || 0) + ' 次');
    else if ((dn[1] || 0) > 0) warn('DNS 劫持', 'DNS 链存在目的放行(' + (dn[1] || 0) + ' 条 RETURN)', '旧版规则残留:终端查询网关会绕过 mihomo 明文转发运营商', { id: 'st-dns', kind: 'confirm', act: '重新应用防火墙规则(恢复全量劫持)' });
    else warn('DNS 劫持', 'DNS 劫持链未挂载(' + (dn[0] || 0) + ' 条 REDIRECT)', '终端 DNS 不经 mihomo,fake-ip 失效', { id: 'st-dns', kind: 'confirm', act: '重新应用防火墙规则' });
    const connsR = await apiGet('/connections');
    if (connsR && connsR.connections) {
      const fiN = connsR.connections.filter(c => (((c.metadata || {}).destinationIP) || '').indexOf('198.18.') === 0).length;
      if (fiN > 0) ok('DNS 劫持', 'fake-ip 生效(' + fiN + ' 条域名流量走代理路径)', '');
      else ok('DNS 劫持', 'fake-ip 暂无活跃连接(正常,国内域名走真实 IP 直通)', '');
    }
    /* === 订阅与手动节点 === */
    const pvR = await apiGet('/providers/proxies');
    if (pvR && pvR.providers) {
      if (C.activeSub >= 0) {
        const sub = pvR.providers['sub' + C.activeSub];
        const n = sub && Array.isArray(sub.proxies) ? sub.proxies.length : 0;
        if (n > 0) ok('订阅与节点', '当前订阅 provider 正常(' + n + ' 节点)', String(sub.updatedAt || '').slice(0, 19));
        else warn('订阅与节点', '当前订阅 0 节点', '订阅文件异常或未下载', { kind: 'manual', act: '手动:到 订阅页 更新订阅(或检查订阅链接)' });
      }
      if (HS_MANUAL.length) {
        const man = pvR.providers.manual;
        const mn = man && Array.isArray(man.proxies) ? man.proxies.length : 0;
        if (mn > 0) ok('订阅与节点', '手动节点 provider 正常(' + mn + ' 节点)', '');
        else warn('订阅与节点', '手动节点文件存在但引擎加载 0 节点', 'manual.yaml 格式异常', { kind: 'manual', act: '手动:到 订阅页→手动节点 重新粘贴并保存' });
      }
    }
    /* ⑥ rule-providers 加载核对: 9090 /providers/rules 是引擎真实加载状态的唯一事实源。
       条件: chnroute 有数据或非自建策略(否则无 china_ip/订阅 provider 可核对) */
    if (ST.chn > 0 || C.policySrc !== 'self') {
      const prR = await apiGet('/providers/rules');
      if (!prR || !prR.providers) warn('规则集加载', '9090 /providers/rules 不可读', '无法确认规则集真实加载状态', { kind: 'manual', act: '手动：确认引擎已完全启动后点「复诊」' });
      else {
        if (ST.chn > 0) {
          const pv = prR.providers.china_ip;
          const rc = pv ? (typeof pv.ruleCount === 'number' ? pv.ruleCount : 0) : -1;
          if (rc < 0) warn('规则集加载', 'china_ip 规则集未加载', '配置注入了 RULE-SET,china_ip 但引擎无此 provider——rules/china_ip.txt 生成失败或路径不对，国内直通兜底失效（ensureChinaIpRules 失败不阻塞启动，此处兜住可见性）', { id: 'rt-prov', kind: 'confirm', act: '重写配置并热重载(重新生成规则集)' });
          else if (rc === 0) warn('规则集加载', 'china_ip 规则集已加载但 0 条', '规则文件为空——到 设置→分流 重新下载/上传路由表后重应用规则', { kind: 'manual', act: '手动：设置→分流→国内直通 重新下载路由表' });
          else ok('规则集加载', 'china_ip 规则集已加载(' + rc + ' 条)', 'chnroute 同源，内核直通与引擎分流两侧数据一致');
        }
        if ((C.policySrc === 'direct' || C.policySrc === 'merge') && HS_SUB_RAW) {
          /* 防御式取块: 节点仓库型订阅(缺 proxies/rules 段)extractSubBlocks 返回无 blocks 键,
             直取 .blocks['rule-providers'] 会 TypeError 且 runDiag 裸调 buildDiagItems 无 try/catch=诊断卡 run 态锁死 */
          const sb = extractSubBlocks(HS_SUB_RAW);
          const rpLines = (sb && sb.blocks && sb.blocks['rule-providers']) || [];
          const exp = rpLines.map(l => (l.match(/^\s{2}([A-Za-z0-9_-]+):/) || [])[1]).filter(n => n && n !== 'china_ip');
          const miss = [...new Set(exp)].filter(n => !prR.providers[n]);
          if (miss.length) warn('规则集加载', '订阅规则集未加载: ' + miss.join('、'), '订阅自带 rule-providers 在合成时丢失(缩进/解析问题)，相关分流规则失效', { id: 'rt-prov', kind: 'confirm', act: '重写配置并热重载(重新合成订阅规则)' });
          else if (exp.length) ok('规则集加载', '订阅规则集已加载(' + new Set(exp).size + ' 个)', '');
          /* rpLines 为空=订阅无自定义 rule-providers,仅少查(方向安全),不出项 */
        }
      }
    }
  } else {
    /* ===== 场景1: 引擎未运行·静态体检(v2.9.0 重构——此前仅一条"停止正常",用户定调补齐) ===== */
    ok('透明接管', '引擎停止,无接管(正常)', '');
    /* 内核文件: 在位性与大小合理性 */
    if (ST.bin) {
      const kb = await run('du -sk ' + shq(DIR + '/mihomo') + ' 2>/dev/null | awk \'{print $1}\'', 5000);
      const sz = parseInt((kb.content || '0').trim(), 10) || 0;
      if (sz > 15000) ok('内核文件', 'mihomo 在位(' + (sz / 1024).toFixed(1) + 'MB)', '可正常启动');
      else warn('内核文件', '内核文件异常(仅 ' + (sz / 1024).toFixed(1) + 'MB,应 ≥15MB)', '文件损坏/下载中断;请到 设置→安装 重新下载或上传', { kind: 'manual', act: '手动:设置→安装 重新安装内核' });
    } else {
      warn('内核文件', '未安装 mihomo 内核', '无法启动引擎;到 设置→安装 完成安装(在线下载或上传)', { kind: 'manual', act: '手动:设置→安装 内核' });
    }
    /* 防火墙残留: 引擎停了但规则还在=黑洞风险 */
    if (ST.residue) {
      warn('防火墙残留', '引擎已停止但有接管规则残留', '残留规则会把流量指向已停止的引擎→黑洞;立即清理', { id: 'rt-fwclean', kind: 'confirm', act: '清除残留规则' });
    } else ok('防火墙残留', '无残留规则(正常)', '');
    /* 端口占用预检: 计划端口被其他进程占用会在启动时失败 */
    const po = await run("netstat -tlnp 2>/dev/null | awk '$4 ~ /:' + C.ports.mixed + '$|:' + C.ports.ctrl + '$|:' + C.ports.dns + '$/ && !/mihomo/ {print $4}' | head -4", 5000);
    const poLines = (po.content || '').trim();
    if (poLines) warn('端口预检', '计划端口被其他进程占用: ' + poLines.replace(/\n/g, ' '), '启动可能失败;确认占用进程或到 设置→端口 改端口', { kind: 'manual', act: '手动:排查占用进程或改端口' });
    else ok('端口预检', '计划端口无占用(' + C.ports.mixed + '/' + C.ports.ctrl + '/' + C.ports.dns + ')', '');
    /* 订阅缓存有效性: 配置了订阅但缓存文件缺失/为空 */
    const subCfg = C.subs.filter(s => s && s.url);
    if (subCfg.length) {
      const missing = [];
      for (let si = 0; si < subCfg.length; si++) {
        const fc = await run('wc -c < ' + shq(DIR + '/providers/sub' + C.subs.indexOf(subCfg[si]) + '.yaml') + ' 2>/dev/null || echo 0', 4000);
        if ((parseInt((fc.content || '0').trim(), 10) || 0) < 100) missing.push(subCfg[si].name);
      }
      if (missing.length) warn('订阅缓存', + missing.length + ' 个订阅缓存缺失/为空(' + missing.map(esc).join('、') + ')', '启动时引擎会自动重新拉取;拉取失败则无可用节点', { kind: 'manual', act: '手动:到 订阅页 点⟳更新重建缓存' });
      else ok('订阅缓存', + subCfg.length + ' 个订阅缓存就绪', '');
    }
    /* 配置矛盾: 融合开关开但策略来源非合并 */
    if (C.subFusion && C.policySrc !== 'merge') warn('配置矛盾', '融合开关已开但策略来源=' + ({ self: '自建', direct: '直通' })[C.policySrc], '融合仅在「合并」模式下生效;到 设置→策略来源 切换或关闭融合开关', { kind: 'manual', act: '手动:设置→策略来源 切换到合并' });
    /* 白名单空勾检: white 模式但无勾选设备 */
    if (C.s1 === 'white' && !C.devices.filter(d => d.proxy).length) warn('白名单空转', '终端代理=白名单模式但未勾选任何设备', '无设备会被接管;到 分流页→接入设备 勾选', { kind: 'manual', act: '手动:分流页 勾选设备' });
    /* IPv6 响应开启提示(实验) */
    if (C.v6Dns) warn('IPv6 响应', '实验开关已开启', 'v6 流量进入引擎处理,CPU 占用上升;如无 IPv6 需求建议关闭', { kind: 'manual', act: '手动:设置→分流→IPv6 响应 关闭' });
    /* 设备忽略名单规模 */
    const rmN = (Array.isArray(C.removedMacs) ? C.removedMacs : []).length;
    if (rmN >= 10) warn('设备忽略名单', rmN + ' 台设备在忽略名单', '数量较多;若有谈忘设备到 分流页→已忽略 恢复', { kind: 'manual', act: '手动:分流页 底部已忽略管理' });
  }
  /* === 开机自启(两态) === */
  if (ST.boot) ok('开机自启', '已启用 · ' + (C.bootMode === 'keep' ? '恢复上次(重启后原样恢复开关状态)' : '只起引擎(重启后需到面板手动开闸)'), '');
  else ok('开机自启', '未启用', '设备重启后插件不运行;需要开机可用请在 设置→开机自启 开启');
  return items;
}
function renderDiag() {
  const box = $('#hs_diag_pane');
  if (!box) return;
  if (HS_DIAG.state === 'idle') {
    box.innerHTML = '<div class="hs-pgscroll"><div style="text-align:center;padding:26px 10px"><div style="font-size:2rem">🔧</div>'
    + '<div style="font-weight:700;margin:6px 0 2px">一键诊断</div>'
    + '<div class="hs-hint">全程只读;运行态查进程/端口/出口/兼容/资源<br>停止态查规则残留/孤儿网卡/端口占用</div>'
    + '<button class="btn hs-pri" id="hs_dg_go" style="margin-top:16px;padding:10px 34px">开始诊断</button></div></div>';
    $('#hs_dg_go').onclick = runDiag; return;
  }
  if (HS_DIAG.state === 'run') {
    /* 环形进度: 环中百分比+当前检查项, 下方按通过/进行中/待检列出;
       骨架只建一次、后续仅更新属性——弧线 CSS transition 平滑走环, 脉冲呼吸全程在线 */
    const i = HS_DIAG.step || 0, N = DG_STEPS.length;
    const R = 126, CIRC = (2 * Math.PI * R).toFixed(1);
    const off = (CIRC * (1 - i / N)).toFixed(1);
    const rows = DG_STEPS.map((s, j) => {
      const icon = j < i ? '<span style="color:#66bb6a">✅</span>' : j === i ? '<span style="color:#7fc9f2">🔄</span>' : '<span style="opacity:.35">◌</span>';
      const st = j < i ? 'color:#c8d2e0' : j === i ? 'color:#7fc9f2;font-weight:700' : 'color:#b3bdcb;opacity:.55';
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.74rem;' + st + '">' + icon + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s) + '</span>' + (j === i ? '<span style="font-size:.64rem;opacity:.75;flex:none">检查中…</span>' : '') + '</div>';
    }).join('');
    if (!box.querySelector('#hs_dg_ring')) {
      box.innerHTML = '<div class="hs-pgscroll" style="display:flex;flex-direction:column;align-items:center;padding:18px 14px">'
      + '<div style="position:relative;width:100%;max-width:280px;aspect-ratio:1;flex:none">' /* 移动端响应式: 宽度自适应+正方形,SVG 同步缩放 */
      + '<svg id="hs_dg_ring" width="100%" height="auto" viewBox="0 0 312 312" style="display:block;width:100%;height:auto;transform:rotate(-90deg)">'
      + '<circle cx="156" cy="156" r="' + R + '" fill="none" stroke="#151924" stroke-width="27"/>'
      + '<circle id="hs_dg_arc" cx="156" cy="156" r="' + R + '" fill="none" stroke="#7fc9f2" stroke-width="27" stroke-linecap="round"/>'
      + '</svg>'
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 34px">'
      + '<div id="hs_dg_pct" style="font-size:2.8rem;font-weight:700"></div>'
      + '<div id="hs_dg_step" class="hs-hint" style="font-size:.8rem;max-width:220px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>'
      + '</div></div>'
      + '<div id="hs_dg_rows" style="width:100%;max-width:280px;margin-top:16px"></div></div>';
    }
    const arc = box.querySelector('#hs_dg_arc');
    arc.setAttribute('stroke-dasharray', CIRC);
    arc.setAttribute('stroke-dashoffset', off);
    box.querySelector('#hs_dg_pct').textContent = Math.round(i / N * 100) + '%';
    box.querySelector('#hs_dg_step').textContent = (DG_STEPS[i] || '汇总') + (i >= N - 1 ? '(正在汇总检测结果…)' : '');
    box.querySelector('#hs_dg_rows').innerHTML = rows;
    return;
  }
  const groups = [...new Set(HS_DIAG.items.map(it => it.g))];
  const fixable = HS_DIAG.items.filter(it => it.fix && !it.fixed && !diagIgnored(it));
  const tag = f => f.kind === 'auto' ? '<span class="hs-tag y">可修复</span>' : f.kind === 'confirm' ? '<span class="hs-tag o">需确认</span>' : f.kind === 'manual' ? '<span class="hs-tag o">需手动</span>' : '<span class="hs-tag y">参数</span>';
  const igN = (C.diagIgnore || []).length;
  let h = '<div class="hs-hint" style="margin-bottom:8px">状态:' + (ST.running ? '🟢 运行中' : '⚪ 已停止') + ' · ' + esc(HS_DIAG.t) + ' · 只读' + (igN ? ' · 已忽略 ' + igN + ' 项' : '') + '</div>';
  groups.forEach(g => {
    const its = HS_DIAG.items.filter(it => it.g === g);
    const bad = its.filter(it => it.lv !== 'ok' && !it.fixed && !diagIgnored(it)).length;
    h += '<div class="hs-dg"><div class="hs-dgh"><span>' + esc(g) + '</span><span>' + (bad ? '⚠️ ' + bad : '✅') + '</span></div>';
    its.forEach(it => {
      const ig = diagIgnored(it);
      const gi = HS_DIAG.items.indexOf(it);
      h += '<div class="hs-dgi"' + (ig ? ' style="opacity:.55"' : '') + '><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span>' + (it.fixed ? '✅' : it.lv === 'ok' ? '✅' : ig ? '🔕' : '⚠️') + '</span><span>' + esc(it.t) + (it.fixed ? '(已修复)' : '') + '</span>' + (it.fix && !it.fixed ? tag(it.fix) : '') + (ig ? '<span data-ig="' + gi + '" class="hs-hint" style="cursor:pointer;flex:none;text-decoration:underline dotted">已忽略·点此取消</span>' : '') + '</div>'
      + (it.d ? '<div style="color:#b3bdcb;font-size:.7rem;margin-top:3px;padding-left:21px">' + esc(it.d) + '</div>' : '')
      + (it.fix && !it.fixed && !ig ? '<div data-dfx="' + gi + '" style="margin:5px 0 0 21px;background:rgba(79,140,255,.08);border-left:3px solid #7fc9f2;border-radius:0 8px 8px 0;padding:6px 9px;font-size:.72rem;color:#bcd2ff;cursor:pointer">💡 ' + esc(it.fix.act) + ' <span class="hs-hint">点击查看说明</span></div>' : '')
      + '</div>';
    });
    h += '</div>';
  });
  /* 报告进独立滚动区(修复"内容显示不全且无法滚动"),操作按钮钉在滚动区外 */
  box.innerHTML = '<div class="hs-pgscroll">' + h + '</div>'
  + '<div class="hs-btnrow" style="flex:none;margin-top:0;padding:10px 16px">'
  + '<button class="btn hs-pri" id="hs_dg_fix"' + (fixable.length ? '' : ' disabled') + '>修复' + (fixable.length ? '(' + fixable.length + ')' : '') + '</button>'
  + '<button class="btn" id="hs_dg_re">复诊</button>'
  + '<button class="btn" id="hs_dg_exp">导出</button>'
  + '<button class="btn" id="hs_dg_cl">关闭</button></div>';
  $('#hs_dg_re').onclick = runDiag;
  $('#hs_dg_cl').onclick = () => mHide('hs_modal_diag');
  $('#hs_dg_exp').onclick = () => {
    let t = '小海关 诊断报告\n时间: ' + HS_DIAG.t + '\n状态: ' + (ST.running ? '运行态' : '停止态') + (igN ? '\n已忽略: ' + igN + ' 项(不计入提示)' : '') + '\n\n';
    HS_DIAG.items.forEach(i => { t += '[' + (i.lv === 'ok' ? 'OK' : diagIgnored(i) ? '忽略' : '!!') + '] ' + i.g + ' / ' + i.t + '\n' + (i.d ? '    ' + i.d + '\n' : '') });
    dl('小海关-诊断报告-' + stampStr() + '.log', t);
  };
  $('#hs_dg_fix').onclick = doRepair;
  /* v2.2.2: 单项修复说明弹窗(用户定调:不是引导修复,是讲清影响;取舍项可忽略) + 报告内取消忽略 */
  box.querySelectorAll('[data-dfx]').forEach(el => el.onclick = () => { const it = HS_DIAG.items[+el.dataset.dfx]; if (it) diagItemDlg(it) });
  box.querySelectorAll('[data-ig]').forEach(el => el.onclick = async () => {
    const it = HS_DIAG.items[+el.dataset.ig]; if (!it) return;
    C.diagIgnore = (C.diagIgnore || []).filter(x => x !== diagKey(it)); await saveConf();
    renderDiag(); toast('已取消忽略:' + esc(it.t), 'green');
  });
}
/* v2.2.2: 诊断忽略键(优先 fix.id,无 id 用 分组|条目名;跨次检测稳定)与忽略判定 */
const diagKey = it => (it.fix && it.fix.id) ? it.fix.id : (it.g + '|' + it.t);
const diagIgnored = it => (C.diagIgnore || []).indexOf(diagKey(it)) >= 0;
async function doRepair() {
  /* 一键修复只收可自动执行的项(auto/confirm/param);manual=引导用户手动操作,不进队列;忽略项不计入 */
  const pend = HS_DIAG.items.filter(it => it.fix && !it.fixed && !diagIgnored(it) && it.fix.kind !== 'manual');
  if (!pend.length) { toast('无可修复项', 'green'); return }
  let cl = '';
  pend.forEach(it => { cl += '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><span>' + (it.fix.kind === 'auto' ? '<span class="hs-tag y">自动</span>' : it.fix.kind === 'confirm' ? '<span class="hs-tag o">确认</span>' : '<span class="hs-tag y">参数</span>') + '</span><span>' + esc(it.t) + '<div class="hs-hint">' + esc(it.fix.act) + '</div></span></div>' });
  const okc = await confirmBox({ title: '一键修复(' + pend.length + ' 项)', html: cl + '<div class="hs-hint" style="margin-top:8px">修复完成后自动复诊</div>', okText: '执行' });
  if (!okc) return;
  const paramItem = pend.find(it => it.fix.kind === 'param');
  let pvals = null;
  if (paramItem) { pvals = await paramEditor(paramItem.fix.keys); if (!pvals) return }
  for (const it of pend) await applyFix(it);
  if (pvals) { Object.assign(C.ports, pvals); await saveConf(); toast('端口参数已保存:' + Object.keys(pvals).map(k => pvals[k]).join('/'), 'green') }
  toast('修复完成,2 秒后自动复诊…', 'green');
  await wait(2000);
  /* 用户已关闭诊断弹窗则不再打扰 */
  const dm = $('#hs_modal_diag');
  if (!dm || dm.style.display === 'none') return;
  await runDiag();
}
/* v2.2.2: 单项修复执行体(批量 doRepair 与单项说明弹窗共用);true=已执行 */
async function applyFix(it) {
  try {
    if (it.fix.id === 'st-chain') await fwClean();
    else if (it.fix.id === 'st-tun') await run('ip link del ' + shq(C.tunName) + ' 2>/dev/null', 5000);
    else if (it.fix.id === 'st-ports') { /* 参数页处理 */ }
    else if (it.fix.id === 'rt-mem' || it.fix.id === 'rt-port') await engineRestart();
    else if (it.fix.id === 'rt-upg') { showUpgradeCard(); toast('已打开升级卡,点击「立即升级」完成', 'green') } /* v2.8.11: 待升级修复动作=打开升级卡(非重启引擎) */
    else if (it.fix.id === 'rt-reboot') await engineRestart();
    else if (it.fix.id === 'upg-bak') {
      const okd = await confirmBox({ title: '清理升级备份', danger: true, okText: '清理',
        html: '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" checked id="hs_bak_del"><span>删除 ' + esc(C.upgBackup ? C.upgBackup.from : '') + ' 组件备份目录<br><span class="hs-hint">清理后不可回滚到该版本;不影响当前运行</span></span></div>' });
      if (okd && $('#hs_bak_del') && $('#hs_bak_del').checked) {
        await run('rm -rf ' + shq(UBAK), 5000);
        C.upgBackup = null; await saveConf();
        toast('✅ 升级备份已清理', 'green');
      }
    }
    else if (it.fix.id === 'rt-fw') { if (C.s1 === 'off' && !C.s2) { await fwClean() } else { await applyFw() } }
    /* ⑤ 重灌 ipset(门控下 off 态分支不可达,保留为与 rt-fw 结构一致) */
    else if (it.fix.id === 'rt-cnrec') { if (C.s1 === 'off' && !C.s2) { await fwClean() } else { await applyFw() } }
    else if (it.fix.id === 'rt-fb') await applyWithTxn('兜底改代理');
    /* v1.8.5 修: 此前动作是 ip6tables -I FORWARD -j DROP——无差别掐断终端全部 v6 转发
       (含国内 v6 快车道),且 fw_clean 不摘、卸载不清,只能重启设备恢复(2026-09-13 审查 P0)。
       改为与文案一致的"重建防火墙":清规则→按当前配置重应用(未运行则保持清理态) */
    else if (it.fix.id === 'rt-v6') { await fwClean(); await reapplyFw(); }
    else if (it.fix.id === 'rt-line') { const yaml = genConfigYaml(); if (yaml === null) toast('订阅解析失败,跳过重写(旧配置保留)', 'red'); else { await writeFile(CFG, yaml); const okp = await apiPut('/configs?force=true', { path: '', payload: yaml }); if (!okp) toast('线路配置热重载失败,建议重启引擎', 'red'); } }
    /* ⑥ 重写配置并热重载(规则集重新生成/合成;apiPut 404 等以 toast 提示,复诊兜底) */
    else if (it.fix.id === 'rt-prov') { const yaml = genConfigYaml(); if (yaml === null) toast('订阅解析失败,跳过重写(旧配置保留)', 'red'); else { await writeFile(CFG, yaml); const okp = await apiPut('/configs?force=true', { path: '', payload: yaml }); if (!okp) toast('规则集热重载失败，建议重启引擎', 'red'); } }
    else if (it.fix.id === 'st-dns') await reapplyFw();
    else if (it.fix.id === 'log-trunc') { await run(': > ' + shq(LOGF) + ' 2>/dev/null', 5000); ST.rlog = 0 }
    else if (it.fix.id === 'cfg-lineref') { C.devices.forEach(d => { if (d.line && !(C.lines || []).some(L => L && L.id === d.line)) d.line = '' }); await saveConf(); }
    else if (it.fix.id === 'rt-coex') {
      const r = await etCheck();
      if (r === 'ok') { C.coexistAuto = true; await saveConf() }
      else { toast('校验未通过(' + ({ noinstall: '未装 ET', nostate: 'ET 输出未开', badstate: 'ET 状态文件异常' })[r] + '),该项跳过', 'red'); it.skip = true; return false }
    }
    it.fixed = true;
    return true;
  } catch (err) {
    it.fixed = false;
    toast('「' + it.t + '」修复失败:' + esc(String((err && err.message) || err).slice(0, 50)), 'red');
    await opLog('修复失败[' + it.fix.id + ']:' + String((err && err.message) || err).slice(0, 80));
    return false;
  }
}
/* v2.2.2: 单项说明弹窗(用户定调:点击修复项不是引导修复,是讲清影响与取舍——
   有些项不是必须修的,例如 IPv6 响应开启略增 CPU 负担但用户可能正需要;
   因此给「忽略此项」出口,忽略后不计警示,报告列表可随时取消) */
async function diagItemDlg(it) {
  const kd = { auto: '可自动修复,无副作用', confirm: '可自动执行,但会改变当前网络行为——先看清影响再决定', param: '需填写参数后执行', manual: '无自动修复——这是"要不要"的取舍项,不是故障' };
  hsOpenSimple(it.t,
    '<div style="padding:4px 2px">'
    + '<div class="hs-hint">分组:' + esc(it.g) + ' · 当前:' + (it.lv === 'ok' ? '✅ 正常' : '⚠️ 有提示') + '</div>'
    + (it.d ? '<div style="margin:8px 0;font-size:.76rem;line-height:1.6">' + esc(it.d) + '</div>' : '')
    + (it.fix ? '<div style="margin:8px 0;padding:8px 10px;border-left:3px solid #7fc9f2;background:rgba(79,140,255,.08);border-radius:0 8px 8px 0;font-size:.74rem;color:#bcd2ff"><b>' + kd[it.fix.kind] + '</b><br>动作:' + esc(it.fix.act) + '</div>' : '')
    + '<div class="hs-hint" style="margin-top:6px">有些提示不是必须处理(例如 IPv6 响应开启会略增 CPU 负担,但你可能正需要它)。不需要就选「忽略此项」,后续检测不再计入,报告列表里可随时取消忽略。</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
    + (it.fix && it.fix.kind !== 'manual' && !it.fixed ? '<button class="btn hs-pri" id="hs_df_go" style="flex:1.2">立即修复</button>' : '')
    + (it.lv !== 'ok' ? '<button class="btn" id="hs_df_ig" style="flex:1">忽略此项</button>' : '')
    + '<button class="btn" id="hs_df_no" style="flex:1">关闭</button></div></div>');
  const no = $('#hs_df_no'); if (no) no.onclick = () => mHide('hs_modal_simple');
  const ig = $('#hs_df_ig');
  if (ig) ig.onclick = async () => {
    const k = diagKey(it);
    if ((C.diagIgnore || []).indexOf(k) < 0) { C.diagIgnore = (C.diagIgnore || []).concat([k]); await saveConf() }
    mHide('hs_modal_simple'); renderDiag();
    toast('已忽略「' + it.t + '」:后续检测不再计入,报告列表可取消', 'green');
  };
  const go = $('#hs_df_go');
  if (go) go.onclick = async () => {
    go.disabled = true; go.textContent = '修复中…';
    const okf = await applyFix(it);
    mHide('hs_modal_simple');
    renderDiag();
    if (okf) toast('已执行修复,建议复诊确认', 'green');
  };
}
async function paramEditor(keys) {
  const lk = { mixed: '混合', redir: '透明', tproxy: 'UDP', dns: 'DNS', ctrl: '控制' };
  const lr = await run("netstat -tln 2>/dev/null | awk '{print $4}' | grep -oE '[0-9]+$' | sort -un", 6000);
  const listeners = (lr.content || '').split(/\s+/).map(Number).filter(Boolean);
  return new Promise(res => {
    hsPmRes = res;
    let h = '<div class="hs-hint" style="margin-bottom:10px">以下端口被占用,已生成推荐值,可修改;点「修复」逐项校验(空闲/合法/不重复)后写入。</div>';
    keys.forEach(k => {
      let rec = C.ports[k] + 1;
      while (listeners.indexOf(rec) >= 0 || Object.values(C.ports).indexOf(rec) >= 0) rec++;
      h += '<div class="hs-row"><div class="hs-sl"><div class="hs-st">' + lk[k] + '端口</div><div class="hs-sd">当前 ' + C.ports[k] + ' 被占用</div></div>'
      + '<div class="hs-sc"><input class="hs-vin" data-pk="' + k + '" value="' + rec + '" style="width:80px;text-align:center"><span class="hs-hint">推荐 ' + rec + '</span></div></div>';
    });
    $('#hs_param_body').innerHTML = h;
    mShow('hs_modal_param');
    const chk = () => {
      const vals = {}; let allOk = true;
      $$('#hs_param_body [data-pk]').forEach(inp => {
        const k = inp.dataset.pk, v = +inp.value; vals[k] = v;
        const bad = !/^\d+$/.test(inp.value) || v < 1 || v > 65535 || listeners.indexOf(v) >= 0 || Object.values(vals).filter(x => x === v).length > 1;
        inp.style.borderColor = bad ? 'rgba(229,115,115,.6)' : 'rgba(102,187,106,.5)';
        if (bad) allOk = false;
      });
      return allOk ? vals : null;
    };
    $$('#hs_param_body input').forEach(i => i.oninput = chk);
    $('#hs_pm_go').onclick = () => { const r = chk(); if (!r) { toast('存在无效参数,请修正红框项', 'red'); return } mHide('hs_modal_param'); if (hsPmRes) hsPmRes(r); hsPmRes = null };
  });
}
/* ================= 总渲染与初始化 ================= */
function renderAll() {
  renderCard();
  renderMgrFoot();
  const _mm = $('#hs_modal_mgr'); if (_mm && _mm.style.display !== 'none') renderPane();
}
async function init() {
  try {
  console.log('[小海关] init 开始');
  injectCss(); buildModals();
  console.log('[小海关] 弹窗已创建');
  /* ZWRT(文档 §3): UFI_DATA 字段不保证存在(lanIP() 已自带判空+默认兜底),就绪等待改锚点 waitFor */
  const host = await waitFor('.functions-container', 10000);
  const card = document.createElement('div');
  card.id = 'hs_card'; card.style.cssText = 'flex-shrink:0;width:100%;margin-top:10px;';
  if (host) host.insertAdjacentElement('afterend', card); else document.body.appendChild(card);
  await loadConf();
  await collectStatus();
  /* v2.9.0 场景4: 首次安装引导——零配置(无内核/无订阅/无运行记录)时弹 5 步向导 */
  if (!ST.bin && !(C.subs || []).length && !ST.running && !(C.devices || []).length) {
    console.log('[小海关] 检测到首次安装,打开新手引导');
    openFirstRunGuide();
  }
  await checkResidue();
  /* 升级对账: 低版本升级上来,盘上三件套(fw.sh/start.sh/config.yaml)可能还是旧版生成的 */
  await upgradeAudit();
  /* 自愈(保守版): 引擎未运行但有 HS_ 规则 → 二次确认后才清理(防 pidof 误判导致规则被误删) */
  if (!ST.running && ST.residue) {
    await wait(1500); /* 等 1.5s 后复查,排除启动瞬间 pidof 暂时为空的情况 */
    await collectStatus();
    if (!ST.running && ST.residue) {
      console.log('[小海关] 二次确认:引擎确实未运行,清理孤儿规则');
      await fwClean();
      await checkResidue();
      /* 审查 P1-2: 自愈可见化——用户打开面板时应看到已自动清理(此前仅 console,孤儿黑洞期间用户无感知) */
      toast(!ST.residue ? '检测到孤儿接管规则(引擎已退出),已自动清理——网络恢复直连' : '孤儿规则清理未净,请跑诊断页修复', !ST.residue ? 'green' : 'red');
      await opLog(!ST.residue ? 'init 自愈: 检测并清理孤儿接管规则(引擎未运行但规则残留)' : 'init 自愈: 孤儿规则清理未净(诊断页可修复)');
    }
  }
  renderCard();
  console.log('[小海关] init 完成');
  } catch (e) {
    console.error('[小海关] init 异常:', e);
    /* F01-R-007.B: 初始化失败必须在卡片渲染可读错误(可重试),不再只写 console;
       card 元素在 loadConf 前已创建,此处可安全渲染;esc+截断,不含 secret/命令原文 */
    try {
      const box = document.getElementById('hs_card');
      if (box) {
        const msg = esc(String((e && e.message) || e || '未知错误').slice(0, 120));
        box.innerHTML = ''
          + '<div class="title" style="margin:6px 0"><strong>🛡️ 小海关</strong> <span style="font-size:.62rem;color:#b3bdcb;font-weight:400">v' + V + '</span></div>'
          + '<div class="hs-warn" style="margin:4px 8px" title="' + msg + '">⚠️ 初始化失败: ' + msg
          + ' <button class="btn hs-sm" id="hs_init_retry" type="button">刷新重试</button></div>';
        const rb = document.getElementById('hs_init_retry');
        if (rb) rb.onclick = () => location.reload();
      }
    } catch (e2) { console.error('[小海关] 初始化错误卡片渲染失败:', e2) }
  }
}
init();
})()
