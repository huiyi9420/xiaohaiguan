'use strict';
/* ============================================================================
 * 小海关 · 可控 Clash(Mihomo 内核) 插件 for UFI-TOOLS-ZWRT 面板
 * 平台: UFI-TOOLS-ZWRT(1.0.0) · 依据《(1.0.0)插件开发文档》(docs/(1.0.0)插件开发文档.md)适配
 *   本文件为纯 JS 源码,node --check 可整文件直查(不再需要剥首尾行);发行版的 <script> 包裹
 *   由构建脚本组装,源码与构建产物均不得携带旧包裹标记与旧平台私有字符串(商店 hard-rule 拒审)
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
const V = '2.2.1';
/* 在线使用说明(新用户入门引导页,2026-10-02 上线) */
const GUIDE_URL = 'https://artificial-lavender-zhzg63cn.edgeone.dev/';
/* 版本变更摘要(升级弹卡展示用,新版本在此顶部加一行;只记用户可感知的要点,不追全量) */
const CHANGELOG = {
  '2.2.1': '接入设备·活动连接展示重做+单按钮运行态改圆点:①真机实证 88 条连接 87 条同目标(终端自带代理客户端的隧道),同目标聚合为一行×N条计数 ②机场信息节点(剩余流量/到期类节点名)识别为「ℹ️ 信息节点」 ③展开区加网关视角说明 ④设备区⟳手动刷新(手动/切页,不实时) ⑤单按钮模式运行态改 ET 组网同款圆点——绿●运行/灰●停止/橙●待升级/红●异常(替代三角箭头)',
  '2.2.0': '按钮可点性统一(用户反馈"有些地方根本看不出来是个按钮"):①状态页「本机代理 ⏱ N分钟」从无边框小文字标签升级为亮框动作按钮(⚠常开时橙警示款) ②状态行「待升级/降级运行」徽标升级为带「查看」提示的可点按钮 ③节点页顶加引导句(点胶囊=切换节点,选中亮框✓) ④按钮内联样式收编为命名类(hs-act 动作档/hs-btn-xs 小号/hs-btn-right 右对齐等),今后调样式只改一处',
  '2.1.11': '修复插件升级进度窗一闪而过(真机反馈:点升级后界面一闪就过去,升级全程后台隐形)——升级卡「立即升级」处理器先关弹窗再进升级编排,进度窗与升级卡同容器,同 tick 先关后开被面板关窗收尾压制(v2.1.4 在安装引导处修过同型 bug,此处漏修);现直接换内容进进度态,引擎未运行分支保留先关(无后续开窗不冲突)',
  '2.1.10': '修复「自动兼容 EasyTier」开关完全失灵(真机反馈:打开后无法保存,也没有自我检查)——开关渲染在分流页,事件绑定却误放在设置页分支,设置页无此元素被空守卫静默跳过:onchange 永不挂上,开关只动 UI 不进草稿、etCheck 三级自检(未装ET/未开状态输出/状态异常)永不触发;绑定归位到分流页分支',
  '2.1.9': '使用说明入口重设计(用户反馈:标题行孤立图标不自达意):撤下标题栏📖图标,改为两处文字入口——①状态页尾部引导条「❓ 第一次使用小海关? 📖 图文使用说明」(新手第一屏) ②设置页新增「帮助」区「使用说明·打开›」(正式入口);按钮全部复用面板原生样式',
  '2.1.8': '新增「📖 使用说明」入口:管理面板标题行常驻(全部页签可见),点击打开在线新手引导页——5 步上手/日常三件事/小白词典,第一次用小海关照着走即可',
  '2.1.7': '发布前审查加固(文档 §4.1/§8 对齐):弹窗宽度统一收到 92vw 上限,手机/平板断点去掉固定高度改 max-height 自适应(小窗不再撑满全屏);升级弹卡历史文案去除旧平台词汇字样(产物零残留,KANO_baseURL 系平台正式全局名保留)',
  '2.1.6': '修复磁盘检测误报(真机 WebSSH 实证:诊断报"剩 0.0MB"实为 1.6G 可用)——超长设备名让 BusyBox df 折行,按固定列取值拿到的是使用率("9%"→9KB);改按挂载点匹配取倒数第三列,并丢弃 <1MB 的荒谬读数;v2.1.5 新增的启动/下载预检同口径修正(否则该形态设备会被误判"存储不足"而拒绝启动)',
  '2.1.5': '修复升级死循环与磁盘满静默失败(真机日志实证):①无接管模式升级必失败回滚——启动不写防火墙脚本但复核强求三件烙印齐(F=0 S/Y 齐→自动回滚→对账再报→循环),现无接管升级也落盘新版脚本 ②磁盘治理:内核下载/引擎启动前预检剩余空间并自动清理下载残留等临时文件,不足则明确报错(满盘此前一切写入静默失败,是"用一段时间就不正常"的主因)',
  '2.1.4': '修复在线下载安装全程隐形(真机复现:点在线下载后无进度窗,再点只提示安装中无下文):①引导→下载不再同弹窗先关后开(面板关窗收尾会压制紧随的显窗) ②安装中再点入口=切回进度窗而非只弹提示 ③安装中打开引导页不再覆盖进度窗内容(毁进度DOM=流程全盲) ④后台装完时进度窗按钮加判空(此前必 TypeError,吞掉成功提示与界面刷新)',
  '2.1.3': '修复 v2.1.2 在线安装内核必崩:Gitee 常量定义在补丁错写仓库事故中遗漏(onlineInstall 读未定义变量 ReferenceError),补定义 shiyi0210/customs-kernel 三常量;镜像清单修剪兑现——GH_PROXY 仅留 gh-proxy.com(ghfast/ghproxy 实际仍在清单,与本版提交信息不符)',
  '2.1.2': '内核下载链国内可用性重排(用户提供双源):①网盘直链 ufitools.ikuns.top 置顶 ②Gitee 镜像仓 gitee.com/shiyi0210/customs-kernel 直连(资产无 mihomo- 前缀防封,按 linux-架构-<tag>.gz 对接) ③GitHub 直连 ④本地代理 ⑤镜像仅留 gh-proxy.com;版本查询四级兜底:GitHub API→本地代理→Gitee API→jsDelivr',
  '2.1.1': '手动下载指南精简(用户反馈:去掉画蛇添足)——只说三件事:在哪下载(github releases+镜像前缀)、找 linux-架构 的 .gz、传过来点上传;删除电脑/微信/AirDrop 等多余步骤说明与文件名变体讲解',
  '2.1.0': '安装引导新增「📖 手动下载安装指南」——四步图文(电脑下载→传手机→面板上传→启动)带用户自助解决在线下载失败:含 GitHub 官方/镜像地址、arm64 文件名示例与选择规则(避开 v1/v2/v3 变体)、文件名不限说明、自定义国内源与加速前缀提示;一键复制文件名/直达上传',
  '2.0.9': '纵深防御:内核安装进度文案的下载源名统一过 esc(innerHTML 通道三处齐平,补齐遗漏两处——当前源名全为常量不可利用,纯防未来演化)',
  '2.0.8': '纵深防御:fw.sh 生成的 IPS 设备白名单补消费端过滤(与 WMACS/EXCIDRS 同款齐平)——上游采集/保存双段校验下合法值恒通过,零行为变化,防未来新增设备来源时成注入薄弱点',
  '2.0.7': '旧平台残留清除:删除 1.x 旧版盲挂行检测(启动链静默校正+诊断体检项+一键重写三处)——旧盲挂行系 1.x 写入旧共用 boot 文件的形态,ZWRT 新路径下 1.x 从未运行,检测恒空转;启动与诊断各省一次 shell 往返,自启功能(手动开关/单路径写入)不变',
  '2.0.6': '审计修正:配置写入加尺寸闸门——超 64KB(合并/直通模式 config.yaml 内嵌大订阅)不再 base64 拼 shell(文档禁大文件走该通道),改 upload_file 直传插件目录+mv 原子归位,快照/字节校验同款;小文本通道不变',
  '2.0.5': '审计修正:弹窗显隐统一走面板 showModal/closeModal(文档 §4.1 指定 API,mShow/mHide 改为其薄包装并按 §3 检测存在性),内层弹窗补 .modal 面板类(mask 包 modal 文档形态;自有 .hs-modal 只承担布局约束,视觉零变化)',
  '2.0.4': '审计修正:shell 通道恒定直连 /api/run_shell(文档 §2/§5.1 明令独立插件不得依赖页面根shell函数)——删除 v1.6.7「动态优先原生」旧平台分支与 shim 时代策略注释,401 提示改按文档 §8 口径(确认已登录管理页面);上传与 run_shell 两处 fetch 补显式 credentials:same-origin 与文档示例形态对齐',
  '2.0.3': '操作日志与运行日志解耦(用户反馈:装完插件没开日志开关,安装内核全程无记录):操作日志改为默认常开(审计语义,256KB 轮转控制体量)——安装内核/订阅变更/规则增删始终在案;日志开关只控制引擎运行日志(stdout);关闭态日志页不再整页短路,操作日志页签照常可看(打开日志页智能默认落到操作日志)',
  '2.0.2': '内核下载链国内可用性重做(用户反馈下载失败):①新增「自定义国内源」——安装页输入自有服务器/OSS 的完整 .gz 直链,在线下载最先尝试(真直连);②版本查询三级兜底(GitHub API→本地代理→jsDelivr data API 国内可达),修复旧 fallback 资产名不带版本号必 404 的问题;③下载源序列重排并明示:自定义源→GitHub直连→本地代理→镜像兜底;④在线全失败后回到安装页,红框引导「上传(最可靠)」与「自定义源」,上传按钮高亮;上传通道走 upload_file 直传(500MB 上限)本就支持内核',
  '2.0.1': '复审修正:hsRunShell 兜底通道由 XHR 静态复制头改为 fetch(经页面签名包装)——ZWRT kano-sign 按请求计算签名,静态头直发 /run_shell 必 401;401 显式提示走原生通道;AbortController 超时;SHA256SUMS 校验链补录 v2.0.0',
  '2.0.0': '平台适配大版本:UFI-TOOLS-ZWRT 1.0.0 面板(业务逻辑与 1.9.1 零改动,仅动平台接口层)——①纯 JS 源码去旧包裹标记;②shell 通道就绪 ZWRT 化(不再覆盖页面原生实现,挂载等 DOM 锚点就绪);③开机自启迁移 /data/plugins/ufi_tools_boot.sh(判存追加+chmod 700,删行改定界符形态);④上传改 /api/upload_file 直传(弃 base64 分块通道);⑤旧面板私有接口自查零使用。2.x 线仅限 ZWRT,商店先移除旧版再写入',
  '1.9.1': '采集解析正则修([A-Z]+→[A-Z0-9]+):带数字字段名(CHN6/N4/N6)自 v1.8.4 起被静默跳过——ST.chn6 恒 0 致体检误报"完整表未装"+每次启动重复下载 v6 表;ST.neigh6 恒空致分设备线路 v6 自动跟随失效;设备 A/B/C 实测定位',
  '1.9.0': '高危修复:v6 国内直通挂载被后段二次 -F HS_V6_LAN 整链清空(历史"链创建提前"修复与后段重建叠加的顺序回归)——ipset 3443 条灌入成功但挂载规则 0 条,国内 v6 全量 REDIRECT 进引擎(国内站慢真根因);去掉后段 -F 只保留兜底补建;fw_test 增加挂载顺序回归断言',
  '1.8.9': '①china6 数据源加 testingcf/fastly 两个国内可达 jsdelivr 变体域;②v6 国内直通挂载重构(用户设备实证:ipset 3443 条但挂载规则 0 条)——废弃 -m set -h 用户态判据,改为真插规则+验证+失败降级内置三网大段(mangle 同款);③fw 应用日志 WARN/INFO 不再被 50 字符截断吞掉',
  '1.8.8': 'ipv6 数据源下载优先直连:china6.txt 前置 jsdelivr CDN 直连源(国内可达,GitHub raw 空挂让"直连优先"名存实亡的问题根治),下载停滞阈值 10→6(空挂 9 秒快速换源,误杀由下一源重试+最终行数复测兜底);仅 ipv6 数据源,v4 表不动',
  '1.8.7': '复审修正(高危):bootDisable 的 sed 删行转义在 v1.8.6 被改坏——BusyBox 实测关闭自启会把共用 boot 文件里所有含 plugins 的行(含其他插件自启行)替换成垃圾行;bootEnable 同款遗留形态一并修正(v1.8.6 起 bootSanitize 每次启动成功都会重写自启行,该缺陷会复发);docker busybox 三层转义链实测验证',
  '1.8.6': '诊断增强八项：国内直通补v6(hs_cn6条数/内置兜底提示)；体检规则残留扩v6口径；自启行旧版盲挂检测+一键重写+启动静默校正；地理数据完整性；ipset灌入对账(带容差)；rule-providers加载核对(9090)；磁盘剩余空间<20MB告警；TUN降级态明示(fw.sh .tpmode标记)',
  '1.8.5': '子代理全量bug审查修复批:①诊断rt-v6"修复"由 ip6tables FORWARD DROP(掐断全部终端v6且无清理路径)改为重建防火墙;②配置通道白名单收口(sanitizeConf:ports/tunName/secret/设备IP;ET state.json 内容过滤+v4/v6分桶,封堵拼进root脚本的注入面);③弹窗resolver兜底(缺节点弹窗/确认框/参数框的✕与蒙层关闭不再悬挂,修opBusy锁死);④engineStart端口未就绪硬门槛(修REDIRECT黑洞);⑤开机盲挂移除(sleep 2 快照)+start.sh单实例守卫;⑥DNS链排到LAN之前(救活TCP:53劫持);⑦残留检测扩v6+fwClean解析VERIFY;⑧合并模式rule-providers缩进按实际归一(修2空格订阅掉顶层键)+direct去重放宽缩进;⑨设备列表合并式采集(离网设备白名单不丢);⑩设置"虚拟网卡名"写对字段(此前写死字段永不生效);⑪preflightDl补最终尺寸复测(修快速下载被误删);⑫诊断数字下标保留(修filter(Boolean)漂移误判);⑬createFixedToast按文档签名;⑭debug限时定时器加级别校验;⑮chnUpload双计数判定+未命中清理;⑭订阅启用失败不再误报成功;⑮探测/设备采集in-flight守卫;⑯手动节点读名兼容转义引号;⑰合并模式节点页补四模式切换;⑱ipset灌入awk收紧+DEF数组浅拷贝',
  '1.8.4': '国内 v6 快车道落地(审计 P0):fw 内置三网大段兜底(缺 chnroute6.txt 即生效)+启动自检自动补下载 china6.txt+手动下载不再因 v4 失败中断;fw_clean 规格无关清扫(根治清理未净 WARN);合并模式私网/免流段 DIRECT→REJECT 快速失败(治 TikTok 免流池超时);ipset 灌入行数校验',
  '1.8.3': '升级体验修复:①升级成功/回滚后状态页横幅与底栏⬆️高亮即时消失(渲染快照未刷新,升级完成即重渲染面板/卡片);②操作栏按钮挤左下修复(style.display 空串清掉内联 flex)',
  '1.8.2': '策略来源三态化(自建/合并/直通):新增合并模式——订阅节点/分类组接入本地四模式调度,规则本地优先+去重,分设备线路在合并模式生效;直通模式注入国内直通兜底(修微信收发慢:订阅规则对国内流量兜底不全,GEOIP 库误判腾讯段);旧 useSubConf 自动迁移',
  '1.8.1': '真机反馈修订:订阅/设置/日志恢复顶部页签直达(六页签横滑,不再经「更多」二次下钻);「更多」页退役,卸载入口迁入设置页危险区(三连击不变);设备仍并入分流页',
  '1.8.0': 'UI 整体重构:七页签并四页签(状态/分流/节点/更多);设备页并入分流页;订阅/设置/日志下沉「更多」二级页(返回行交互);卡片按钮重排=停止|分流|节点|日志(条件),状态行可点开面板;操作栏仅状态页显示,卸载移入「更多」三连击;节点页新增订阅管理直达入口',
  '1.7.2': '修复直通回退断链(v1.7.1 守卫位置错误:providers 在订阅判定前被跳过,回退自建时组引用 sub0 不存在致校验 fatal)',
  '1.7.1': '订阅直通三处修复:孤儿provider不再拼入/节点页测试按钮不丢/缓存刷新补await',
  '1.7.0': '新增「使用订阅自带策略」:订阅分组与分流整体生效(默认关),小海关退基础设施层;订阅无规则自动回退',
  '1.6.15': '修复上传必 401:上传改走 run 通道分块落盘(upload_file 接口面板鉴权头 XHR 带不上)',
  '1.6.14': '节点直选:从任意子组点击节点即切换出口(自动切🚀主组+手动模式),测试者快速换节点',
  '1.6.13': '升级失败自动回滚(无需手动)+成功后手动清理备份按钮',
  '1.6.12': '日志安全: 读取超256KB只取尾部100KB+醒目提示(51MB致面板崩溃实测);debug级别10分钟自动限时;修复v1.6.11转义bug',
    '1.6.11': '日志安全三招: 读取截尾/debug限时/零后台轮询',
    '1.6.10': '启动失败自动急救: 无条件清规则+杀残留引擎(三层保活防线齐备:退出钩子+探活守卫+启动急救)',
    '1.6.9': 'GOMEMLIMIT后缀M→MiB(Go运行时格式要求,fatal error实测修复)',
    '1.6.8': '退出钩子绝对路径修复(/mihomo not found)+探活失败不apply守卫(防黑洞断网)',
    '1.6.7': 'run动态优先原生(401根治,XHR无法设置鉴权头被浏览器拦截,v1.3.2方案废止)',
    '1.6.6': 'XHR固定绑定hsRunShell(修复旧平台页面覆盖根shell函数致AbortError)',
    '1.6.5': 'Phase1批次一二: fw幂等(flock+链F保底)/退出钩子/GOMEMLIMIT默认128M/v4白名单MAC降级/TPROXY降级WARN/出海例外表11域名/china_ip规则集替换GeoIP/INPUT放行mark包'
};
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
let HS_MANUAL = []; let HS_MANUAL_LOADED = false; let HS_SUBINFO = undefined; let HS_LAST_RF = '';
let HS_DEBUG_TIMER = null;
let HS_SUB_RAW = ''; /* 活动订阅原文缓存(genConfigYaml 同步函数读不了文件;loadConf/downloadSub/切订阅三处刷新) */
let HS_SUB_RAW_KEY = ''; /* 缓存对应的订阅下标,防串 */
let HS_SUB_EDIT = -1; /* 订阅表单编辑态:-1=添加模式,>=0=正在编辑 C.subs[i](改名/换链接);删除订阅时须同步修正此下标 */
const PORT_DEF = { mixed: 7890, redir: 7892, tproxy: 7893, dns: 1053, ctrl: 9090 };

/* ================= 工具 ================= */
const $  = s => document.querySelector(s);
/* 面板接口 XHR 通道: 免疫浏览器/面板对 fetch 的封装掐断(长操作曾报 AbortError: signal is aborted without reason——
   首装场景启动链路被拖长时 fetch 封装超时中止,XHR 不受影响) */
/* v2.0.1: hsXhr 已随 XHR 兜底通道移除而删除(死代码清理,唯一调用方 hsRunShell 已改 fetch) */
const $$ = s => Array.from(document.querySelectorAll(s));
const wait = ms => new Promise(r => setTimeout(r, ms));
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
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shq = t => "'" + String(t).replace(/'/g, "'\\''") + "'";
const toB64 = t => { try { return btoa(unescape(encodeURIComponent(t))) } catch (e) { return '' } };
const b64d = t => { try { return decodeURIComponent(escape(atob(t))) } catch (e) { return '' } };
const p2 = n => String(n).padStart(2, '0');
const ct = r => (r && r.content || '').trim();
const pInt = r => parseInt(ct(r)) || 0;
const latClr = d => d < 150 ? '#66bb6a' : d < 400 ? '#ffb74d' : '#e57373';
/* MAC/CIDR 白名单正则: 这两个值会拼进 root 执行的 fw.sh,导入配置或手改 config.json 可能带非法值,消费端一律先过滤(防 shell 注入) */
const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;
const okMac = t => MAC_RE.test(String(t || '').trim());
const okCidr = t => /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(String(t || '').trim());
const okV6 = t => /^[0-9a-f:]+$/i.test(String(t || '').trim()) && String(t).includes(':');
/* 订阅信息节点过滤(机场在节点列表里塞的公告行,非真实节点): 关键词命中即滤——新增类型持续补充 */
const HS_INFO_PAT = /剩余|到期|流量|重置|官网|套餐|过期|有效|距离|订阅|获取|时间|更新|expire|traffic|reset/i;
/* 分设备线路: 线路组名前缀(YAML 组名)与规则中引用须一致;池内策略类型映射 */
const lineGName = n => '🛤️ ' + n;
const linePoolName = nm => lineGName(nm) + '·池';
/* 线路锁定模式的运行时默认出口(生成侧与保存后 PUT 组切换共用,须保持一致):
   1个节点=直接锁定; 多个+手动指定=锁定首选; 多个+池内策略=指向候选池子组 */
const PS_TXT = { self: '自建', merge: '合并', direct: '直通' };
function psTxt(v) { return PS_TXT[v] || '自建' }
function lineDefOf(L) {
  if (!L || L.mode !== 'node') return '';
  const nodes = (Array.isArray(L.nodes) ? L.nodes : (L.node ? [L.node] : [])).filter(n => typeof n === 'string' && n && n.length <= 64);
  if (!nodes.length) return '';
  if (nodes.length === 1) return nodes[0];
  if (L.pick === 'manual') return (nodes.indexOf(L.node) >= 0 ? L.node : nodes[0]);
  return linePoolName(String(L.name));
}

const nowStr = () => { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) };
const stampStr = () => nowStr().replace(/[-: ]/g, '');

/* Shell 直连通道(文档 §2/§5.1): 独立插件固定直接 POST /api/run_shell,
   不依赖或修改页面的 runShellWithRoot——run 恒定绑定本实现,无任何全局名回退分支
   (v1.3.2/v1.6.7 的「固定绑定/动态优先原生」均为旧平台认知,ZWRT 分支统一废止) */
/* 文件上传(ZWRT 文档 §5.2): POST /api/upload_file,multipart 直传——fetch 请求会再经过页面签名处理,
   面板鉴权头可携带(根治 v1.6.15 XHR 带不上鉴权头的 401);文档明令勿为大文件 Base64 拼接 Shell 命令。
   base 必须先求值再拼接(F1 优先级陷阱: + 优先于 ||,若把回退默认值与后缀拼接写进同一表达式,
   ZWRT 恒定义 KANO_baseURL 时 URL 恒等于 base 本身、丢 /upload_file 后缀)——与 hsRunShell 同款形态 */
async function hsUploadByApi(file, targetDir) {
  const base = (typeof KANO_baseURL !== 'undefined' && KANO_baseURL) ? KANO_baseURL : '/api';
  const form = new FormData();
  form.append('file', file);
  form.append('path', targetDir);
  const headers = { ...(typeof common_headers !== 'undefined' && common_headers ? common_headers : {}) };
  /* multipart boundary 由浏览器生成:复制面板头后双大小写删 Content-Type(ET platform-zwrt v2.0.1 实证,
     文档 §5.2 官方示例即双删,防面板头键大小写差异破坏 boundary) */
  delete headers['Content-Type'];
  delete headers['content-type'];
  const response = await fetch(base + '/upload_file', { method: 'POST', headers, credentials: 'same-origin', body: form });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.result !== 'success') throw new Error(body.error || '上传失败');
  return body; /* 含落盘绝对路径 path/name/size——文件名取 basename 由服务端定,后续一律以 body.path 为准 */
}
const hsRunShell = async (cmd, timeoutMs = 30000) => {
  /* v2.0.1: 改走 fetch——ZWRT 鉴权为 kano-sign 按请求(method+path+kano-t)计算,
     静态复制 common_headers 的 XHR 直发 /run_shell 必然签名失配 401(旧平台认知残留);
     fetch 经页面签名包装(文档 §5.2 同款);失败显式报错,不再静默退化 */
  const base = (typeof KANO_baseURL !== 'undefined' && KANO_baseURL) ? KANO_baseURL : '/api';
  const headers = Object.assign({}, (typeof common_headers !== 'undefined' && common_headers) || {});
  headers['Content-Type'] = 'application/json';
  let res = null;
  try {
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const tm = ctrl ? setTimeout(() => { try { ctrl.abort() } catch (e) { } }, Number(timeoutMs) || 30000) : null;
    const fr = await fetch(base + '/run_shell', { method: 'POST', headers: headers, credentials: 'same-origin', body: JSON.stringify({ cmd: String(cmd), timeout: Number(timeoutMs) || 30000 }), signal: ctrl ? ctrl.signal : undefined });
    if (tm) clearTimeout(tm);
    const txt = await fr.text();
    res = { ok: fr.ok, status: fr.status, text: txt };
  } catch (e) {
    return { success: false, content: 'Shell 请求失败:' + String((e && e.message) || e) };
  }
  if (!res.ok) return { success: false, content: 'HTTP ' + res.status + (res.status === 401 ? '(鉴权失败——请确认插件运行于已登录的管理页面后重试)' : '') };
  try { const d = JSON.parse(res.text); return { success: !!d.success, content: d.content || '' } }
  catch (e) { return { success: false, content: '响应异常:' + res.text.slice(0, 60) } }
};
/* Shell 分发器(文档 §2/§5.1 明令: 独立插件必须直接请求 /api/run_shell,不得依赖或覆盖页面的
   runShellWithRoot):恒定直连 hsRunShell,无页面全局函数分支(v1.6.7「动态优先原生」系旧平台
   referer/host/origin 鉴权头认知,ZWRT 下废止);长操作超时风险由调用侧分步控制(每步 run 独立短超时) */
const run = (cmd, t) => hsRunShell(cmd, t);

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
  coexistAuto: false, exclude: [], force: [], cnBypass: true, cardMode: 'full', upgBackup: null, ctrlLan: false, policySrc: 'self',
  devices: [],            // {ip,mac,name,proxy,line}  line=线路id,空=跟随全局
  lines: [],              // {id,name,mode:auto|balance|fallback|node,node} 分设备线路
  subs: [],               // {name,url,time}
  activeSub: -1,
  ver: '', secret: '', kernelMirror: '' /* 自定义内核直连源(完整 .gz URL,用户自有国内主机/OSS;空=不用) */
};
let C = Object.assign({}, DEF);
C.ports = Object.assign({}, DEF.ports);
/* 订阅原文缓存刷新(genConfigYaml 同步,读文件必须在异步侧完成): useSubConf 开启/订阅更新/切换订阅三时机调用 */
async function refreshSubRaw() {
  const key = String(C.activeSub);
  if (key === HS_SUB_RAW_KEY && HS_SUB_RAW) return;
  HS_SUB_RAW = ''; HS_SUB_RAW_KEY = key;
  if (C.activeSub < 0 || !C.subs[C.activeSub]) return;
  HS_SUB_RAW = await readFile(DIR + '/providers/sub' + C.activeSub + '.yaml');
}
/* 订阅 YAML 块提取(行级): 抓 proxies/proxy-groups/rules/rule-providers 四个 top-level 块原文,
   连 top-level 锚点定义(行首 xxx: &a 形式与游离 &a 行)一并携带防悬空引用;无 rules 视为不完整订阅 */
function extractSubBlocks(txt) {
  const want = ['proxies', 'proxy-groups', 'rules', 'rule-providers'];
  const out = {}, anchors = [];
  let cur = null;
  (txt || '').split('\n').forEach(l => {
    const top = /^[A-Za-z_-]+:/.test(l) ? l.split(':')[0] : null;
    if (top) { cur = want.indexOf(top) >= 0 ? top : null; if (cur && !out[cur]) out[cur] = []; if (cur === 'proxies' && /&[A-Za-z0-9_-]+/.test(l) && !/^proxies:/.test(l)) anchors.push(l); return }
    /* 游离锚点定义行(顶层两空格内的 &name: 结构归 anchors 兜底) */
    if (!cur && /^[ \t]{0,4}[A-Za-z0-9_-]+:.*&[A-Za-z0-9_-]+/.test(l)) { anchors.push(l); return }
    if (cur && l.match(/^[ \t]+\S|^\s*#/)) out[cur].push(l);
    else if (l.trim() === '') { if (cur) out[cur].push(l) }
    else cur = null;
  });
  const parts = [];
  if (anchors.length) parts.push('# 订阅锚点定义(供块内引用)\n' + anchors.join('\n'));
  want.forEach(k => { if (out[k] && out[k].some(l => l.trim())) parts.push(k + ':\n' + out[k].join('\n').replace(/\n+$/, '')) });
  /* 完整性: 节点与规则缺一不可(无规则的订阅当节点仓库用更合适) */
  return (out.proxies && out.proxies.some(l => l.trim()) && out.rules && out.rules.some(l => l.trim())) ? { ok: true, yaml: parts.join('\n\n'), blocks: out, anchors: anchors } : { ok: false, why: '订阅缺少节点或规则段' };
}
/* 订阅策略直通下,首个 select 组名(供强制/出海例外表注入 target;订阅组结构千差万别,取不到则放弃注入) */
function firstSelectGroup(txt) {
  let inGroups = false, name = '', isSel = false;
  const lines = (txt || '').split('\n');
  for (const l of lines) {
    if (/^proxy-groups:/.test(l)) { inGroups = true; continue }
    if (inGroups && /^[A-Za-z_-]+:/.test(l)) break;
    if (!inGroups) continue;
    const nm = l.match(/^  {0,2}(- )?(?:name: |"name: "?)'?([^,'"]+)/);
    if (nm && !nm[0].includes('name:')) { }
    const m2 = l.match(/^\s*-?\s*(?:\{\s*)?name:\s*'?([^,'"}]+)/) || l.match(/^\s*-\s*'?([^:'"{}]+)'?\s*$/);
    if (m2 && !l.trim().startsWith('type:') && l.trim() !== '-') {
      name = m2[1].trim(); isSel = null;
      /* flow 单行组(- { name: X, type: select, ... })是机场常见风格: 旧版只认缩进型 type 行,flow 型失明致取不到首个 select 组(强制清单/出海例外注入被跳过) */
      if (l.includes('{')) {
        const tf = l.match(/[{,]\s*type:\s*'?"?([a-z-]+)/);
        if (tf) { if (tf[1] === 'select') return name; name = '' }
        continue;
      }
    }
    const t = l.match(/^\s*type:\s*'?([a-z-]+)/);
    if (t) { if (t[1] === 'select') return name; }
  }
  return '';
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
async function saveConf() { const ok = await writeFile(CJ, JSON.stringify(C, null, 2)); if (!ok) toast('配置保存失败(磁盘?)', 'red'); return ok }

/* ================= 运行态缓存(仅事件触发时刷新) ================= */
let ST = { bin: false, pid: '', boot: false, listen: {}, tun: false, kb: 0, rlog: 0, olog: 0, chn: 0, chn6: 0, arp4: {}, neigh6: {} };
async function collectStatus() {
  const P = C.ports;
  const cmd = 'D=' + shq(DIR) + ';'
    + 'echo =BIN=$([ -x $D/mihomo ] && echo 1);'
    + 'echo =PID=$(pidof mihomo);'
    + 'echo =BOOT=$(grep -cF ' + shq(BOOT_KEY) + ' ' + shq(BOOT_SH) + ' 2>/dev/null);'
    + 'echo =LM=1;'
    + 'echo =LR=1;'
    + 'echo =LD=1;'
    + 'echo =LC=1;'
    + 'echo =TUN=$(ip link show ' + shq(C.tunName) + ' 2>/dev/null | wc -l);'
    + 'echo =KB=$(du -sk $D 2>/dev/null | awk \'{print $1}\');'
    + 'echo =RL=$(wc -c < $D/customs.log 2>/dev/null || echo 0);'
    + 'echo =GI=$([ -f $D/geoip.metadb ] && stat -c%Y $D/geoip.metadb 2>/dev/null || echo 0);'
    + 'echo =GS=$([ -f $D/geosite.dat ] && stat -c%Y $D/geosite.dat 2>/dev/null || echo 0);'
    + 'echo =CHN=$(wc -l < $D/chnroute.txt 2>/dev/null || echo 0);'
    + 'echo =CHN6=$(wc -l < $D/chnroute6.txt 2>/dev/null || echo 0);'
    + 'echo =N4=$(cat /proc/net/arp 2>/dev/null | tail -n +2 | awk \'$4!="00:00:00:00:00:00"{printf "%s~%s ", $1, $4}\');'
    + 'echo =N6=$(ip -6 neigh show 2>/dev/null | grep lladdr | awk "{printf \"%s~%s \", \$1, \$5}");'
    + 'echo =OL=$(wc -c < $D/plugin.log 2>/dev/null || echo 0);'
    + 'echo =S2X=$([ -f $D/.s2expired ] && echo 1);'
  const r = await run(cmd, 12000);
  const o = { bin: false, pid: '', boot: false, listen: {}, tun: false, kb: 0, rlog: 0, olog: 0, chn: 0, arp4: {}, neigh6: {} };
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
    /* 进程在跑: 控制接口实测(成功=全端口就绪,失败=可能未完全启动) */
    const apiTest = await run('curl -s -m 3 -o /dev/null http://127.0.0.1:' + P.ctrl + '/version 2>/dev/null && echo 1 || echo 0', 5000);
    const apiOk = (apiTest.content || '').trim() === '1';
    if (apiOk) { o.listen.mixed = o.listen.redir = o.listen.tproxy = o.listen.dns = o.listen.ctrl = true }
    else { o.listen = {} }
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
  return o;
}
/* 节点 UDP 能力探测: 对主组发 udp DNS 延迟测试,失败=节点不支持 UDP 转发
   (游戏/QUIC 流量送进去就是黑洞)。结果缓存 10 分钟,事件驱动调用。 */
let HS_UDP_OK = null; let HS_UDP_T = 0;
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
  /* 第一证据=真实流量: 经节点出链且下行>0 的 UDP 连接(QUIC 等)——节点封 UDP:53 是机场惯例,
     用 udp://DNS 探测会把"封53但UDP可用"误判成无 UDP,进而误降级 QUIC 破坏境外加速(真机教训) */
  try {
    const cs = await apiGet('/connections');
    const mg = hsMainGroup();
    const ev = cs && cs.connections && cs.connections.some(c => c.network === 'udp' && (c.download || 0) > 0
      && (c.chains || []).some(x => x === mg));
    if (ev) {
      HS_UDP_OK = true;
      /* 此前降级过的放行收回(QUIC 恢复走引擎) */
      run('iptables -t mangle -C HS_UDP -p udp -m multiport --dports 443,8443 -j RETURN 2>/dev/null && iptables -t mangle -D HS_UDP -p udp -m multiport --dports 443,8443 -j RETURN; echo ok', 5000).catch(() => { });
      return HS_UDP_OK
    }
  } catch (e) { }
  /* 无流量证据时才用 :53 探测; 失败只提示不降级(防误伤) */
  const r = await apiGet('/proxies/' + encodeURIComponent(hsMainGroup()) + '/delay?timeout=5000&url=' + encodeURIComponent('udp://8.8.8.8:53'));
  HS_UDP_OK = !!(r && r.delay);
  if (!HS_UDP_OK) await opLog('节点 UDP 探测未通过(可能是封 UDP:53 惯例,非必然无 UDP);QUIC 保持走引擎,游戏异常请换支持 UDP 的节点');
  return HS_UDP_OK;
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
  const lm = {}; (C.lines || []).forEach(L => { if (L && L.id) lm[L.id] = 1 });
  const parts = [];
  C.devices.forEach(d => {
    if (!d.line || !lm[d.line]) return;
    const mac = String(d.mac || '').toUpperCase();
    const ips = [];
    if (okCidr(d.ip)) ips.push(String(d.ip));
    Object.keys(ST.neigh6 || {}).forEach(v6 => { if (String(ST.neigh6[v6]).toUpperCase() === mac && okV6(v6)) ips.push(v6) });
    parts.push(d.line + '|' + mac + '|' + ips.sort().join(','));
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
    await writeFile(CFG, yaml);
    const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
    if (!ok) { HS_LINE_SIG = prev; await opLog('线路地址跟随:热重载失败,下次刷新重试'); return }
    await opLog('设备线路地址变化,已自动跟随(热重载)');
  } finally { HS_LINE_BUSY = false }
}
/* 设备采集(ARP+DHCP 合并,仅在设备弹窗打开/手动刷新时调用) */
async function collectDevices() {
  const r = await run(
    'cat /proc/net/arp 2>/dev/null | tail -n +2 | awk \'$3=="0x2" && $4!="00:00:00:00:00:00" {print $1" "$4}\';'
    + 'cat /tmp/dhcp.leases 2>/dev/null | awk \'{print $3" "$2" "$4}\'', 8000);
  const map = {};
  (r.content || '').split('\n').forEach(l => {
    const a = l.trim().split(/\s+/); if (a.length < 2) return;
    const ip = a[0], mac = a[1];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac)) return;
    if (!map[ip]) map[ip] = { ip: ip, mac: mac, host: '' };
    if (a[2] && a[2] !== '*' && !map[ip].host) map[ip].host = a[2];
  });
  /* 按 MAC 关联(设备身份稳定),IP 变了名字和白名单跟着设备走 */
  const known = {}; C.devices.forEach(d => { if (d.mac) known[d.mac.toUpperCase()] = d });
  const list = Object.keys(map).sort().map(ip => {
    const mac = map[ip].mac.toUpperCase();
    const k = known[mac] || null;
    return { ip: ip, mac: mac, host: map[ip].host, name: k ? k.name : (map[ip].host || ('设备_' + ip.split('.').pop())), proxy: k ? k.proxy : false, line: k ? (k.line || '') : '', online: true };
  });
  /* v1.8.5 修: 此前整体替换 C.devices——离线设备(手机休眠/离网)被剔除,之后任一次保存即永久丢失
     其白名单/昵称/线路;改为合并:扫描到的更新为在线,未扫描到的保留并标 online:false(2026-09-13 审查 P1) */
  const seen = {}; list.forEach(d => { seen[d.mac.toUpperCase()] = 1 });
  C.devices.filter(d => d && d.mac).forEach(d => {
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
  C.lines = Array.isArray(C.lines) ? C.lines.slice() : [];
  C.subs = Array.isArray(C.subs) ? C.subs.slice() : [];
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
/* YAML 双引号串转义: 必须同时转义反斜杠与引号——只转引号时,值内任何 \x (如候选池 filter 的正则转义 \.)都是 YAML 非法转义,mihomo 解析 fatal(真机事故 2026-09-02) */
function yamlEsc(t) { return '"' + String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' }
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
      'health-check': { enable: true, url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true }
    };
  }
  /* 订阅 providers(仅当前生效的) */
  if (C.activeSub >= 0 && C.subs[C.activeSub]) {
    const sub = C.subs[C.activeSub];
    providers['sub' + C.activeSub] = {
      type: 'http', url: sub.url, path: './providers/sub' + C.activeSub + '.yaml',
      interval: 0,
      'health-check': { enable: true, url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true }
    };
  }
  /* 组链(四模式并存, 🚀默认指向当前模式) */
  const useList = Object.keys(providers).length ? Object.keys(providers) : [];
  groups.push({ name: '🚀 节点选择', type: 'select', proxies: ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移', 'DIRECT'].concat(useList.length ? [] : []), use: useList.length ? useList : undefined });
  const defaultIdx = { auto: 0, balance: 1, fallback: 2, manual: 0 }[C.mode] || 0;
  if (useList.length) {
    groups[0].proxies = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移', 'DIRECT'];
    
    /* select 默认选中 */
    const defaultName = ['♻️ 自动选优', '⚖️ 负载均衡', '🪜 故障转移'][defaultIdx];
    groups[0].default = defaultName;
  }
  /* LINE_OK=本次实际生成的线路组名集合: SRC 规则只引用已生成的组——防无节点时组未生成而规则悬空,mihomo 启动 fatal */
  const LINE_OK = {};
  if (useList.length) {
    groups.push({ name: '♻️ 自动选优', type: 'url-test', url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, tolerance: 50, lazy: true, use: useList });
    groups.push({ name: '⚖️ 负载均衡', type: 'load-balance', strategy: 'consistent-hashing', url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true, use: useList });
    groups.push({ name: '🪜 故障转移', type: 'fallback', url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true, use: useList });
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
        const flt = nodes.map(escRe).join('|');
        use = useList.map(src => {
          const key = pid + '_' + src;
          providers[key] = { type: 'file', path: providers[src].path, filter: flt, 'health-check': { enable: true, url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, lazy: true } };
          return key;
        });
        if (nodes.length === 1 || L.pick === 'manual') { def = lineDefOf(L) }
        else {
          /* 池内策略子组: 优选=url-test / 均衡=load-balance / 转移=fallback */
          def = linePoolName(nm); proxies = proxies.concat([def]);
          const st = ({ auto: 'url-test', balance: 'load-balance', fallback: 'fallback' })[L.pick] || 'url-test';
          const sub = { name: def, type: st, url: 'http://www.gstatic.com/generate_204', interval: +C.iv || 300, tolerance: 50, lazy: true, use: use };
          if (st === 'load-balance') sub.strategy = 'consistent-hashing';
          sub._pool = nodes; /* merge 模式静态化候选(自建序列化只输出已知字段,此标记无害) */
          groups.push(sub);
        }
      } else {
        def = ({ auto: '♻️ 自动选优', balance: '⚖️ 负载均衡', fallback: '🪜 故障转移' }[L.mode] || '♻️ 自动选优');
      }
      LINE_OK[nm] = 1;
      const lg = { name: lineGName(nm), type: 'select', proxies: proxies, use: use, default: def };
      if (L.mode === 'node' && nodes.length) lg._cand = nodes; /* merge 模式: 指定节点线路的静态候选 */
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
  /* 分设备线路: 按源地址路由到线路组(优先级已定案=强制/排除之后、国内直通之前;
     v4 取设备当前 IP,v6 取邻居表按 MAC 反查的全部已知地址——隐私扩展轮换由 syncLineRules 自动跟随) */
  (() => {
    const lm = {}; (C.lines || []).forEach(L => { if (L && L.id && L.name) lm[L.id] = String(L.name) });
    C.devices.forEach(d => {
      const nm = lm[d.line]; if (!nm || !LINE_OK[nm]) return;
      const mac = String(d.mac || '').toUpperCase();
      const ips = [];
      if (okCidr(d.ip)) ips.push(String(d.ip));
      Object.keys(ST.neigh6 || {}).forEach(v6 => { if (String(ST.neigh6[v6]).toUpperCase() === mac && okV6(v6)) ips.push(v6) });
      ips.forEach(ip => rules.push('SRC-IP-CIDR,' + ip + (ip.indexOf(':') >= 0 ? '/128' : '/32') + ',' + lineGName(nm)));
    });
  })();
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
  rules.push('MATCH,🚀 节点选择');
  /* YAML 序列化 */
  let y = '# 小海关生成 · ' + nowStr() + '\n#gen:v' + V + '\n';
  y += 'mixed-port: ' + P.mixed + '\n';
  y += 'redir-port: ' + P.redir + '\n';
  y += 'tproxy-port: ' + P.tproxy + '\n';
  y += 'allow-lan: true\n';
  y += 'bind-address: "*"\n';
  y += 'mode: rule\n';
  y += 'log-level: ' + (C.logEnabled ? (C.logLevel || 'info') : 'silent') + '\n';
  y += 'external-controller: ' + (C.ctrlLan ? '0.0.0.0' : '127.0.0.1') + ':' + P.ctrl + '\n';
  y += 'secret: ' + yamlEsc(sec) + '\n';
  y += 'routing-mark: 6666\n';
  y += 'geodata-loader: memconservative\n';
  y += 'geo-auto-update: false\n';
  y += 'store-selected: true\n';
  y += 'store-fake-ip: true\n';
  y += '\n# DNS\n';
  y += 'dns:\n';
  y += '  enable: true\n';
  y += '  listen: 0.0.0.0:' + P.dns + '\n';
  y += '  enhanced-mode: fake-ip\n';
  /* DNS 不回 AAAA: 本机 ip6tables 无 ipset 模块,v6 国内直通无法内核态放行——
     终端若拿 v6 地址会优先 v6 连接→全部涌入 mihomo 用户态(弱 CPU 瓶颈,微信/QQ 图片慢/失败的真因,2026-09-02 实证);
     禁 AAAA 后终端走 v4→chnroute ipset 内核直通;v6 接管链仍保留(处理硬编码 v6 直连流量,防泄露不退让) */
  y += '  ipv6: false\n';
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
      opLog('订阅策略直通失败(' + subBlocks.why + '),本次回退自建调度');
      toast('⚠️ 订阅不含完整策略(缺节点或规则段),已回退自建调度', 'warn');
      subMode = false; /* 回退: 放开自建 groups/rules 序列化守卫 */
    } else {
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
      let yml = subBlocks.yaml;
      /* china_ip 规则集(chnroute 同源): 订阅已有 china_ip 键则不注入(重名 YAML 冲突,订阅自己的同义生效) */
      if (ST.chn > 0 && tgt && !/^[ \t]+china_ip:/m.test(yml)) { /* v1.8.5: 任意缩进都算已存在,防重复键 */
        const CHNP = '  china_ip:\n    type: file\n    behavior: ipcidr\n    format: text\n    path: ' + yamlEsc('./rules/china_ip.txt') + '\n    interval: 0\n';
        const rpM = /^rule-providers:\n/m;
        yml = rpM.test(yml)
          ? yml.replace(rpM, 'rule-providers:\n' + CHNP)   /* 订阅自带 rule-providers: 追加成员(缩进对齐块式) */
          : yml.replace(/(^rules:\n)/m, 'rule-providers:\n' + CHNP + '\n$1'); /* 无则整段新增 */
      }
      /* 规则注入: 订阅 rules: 行后插入本方规则(最前=最高优先);
         注入行缩进必须跟随订阅 rules 列表项的实际缩进——机场生成风格 2/4 空格不一,写死 2 空格遇 4 空格订阅
         即块序列缩进错乱,mihomo -t 报 "did not find expected '-' indicator"(2026-09-12 真机实锤,line 128) */
      const indM = yml.match(/^rules:\n([ \t]*)-/m);
      const inj = inject.length ? inject.map(r => (indM ? indM[1] : '  ') + '- ' + yamlEsc(r)).join('\n') + '\n' : '';
      const merged = yml.replace(/(^rules:\n)/m, '$1' + inj);
      y += '\n# ===== 订阅策略直通(v' + V + '): 以下 proxies/groups/rules 原样来自订阅 =====\n';
      y += merged + '\n';
      return y;
    }
  } else if (mergeMode) {
    /* ===== 合并模式(v1.8.2): 小海关调度/基础设施为骨架 + 订阅节点与分类组接入;
       规则本地优先——强制/排除/分设备线路/出海例外/国内直通在前,订阅分类规则去重追加,MATCH 指本地主组。
       节点来源: 订阅 proxies 段原样顶层化(订阅组原样保留其引用);组链 use 由 provider 改静态节点名(manual 保留 provider);
       组名冲突(订阅组与本地组重名)丢弃订阅组=本地为准;china_ip 数据集冲突时保留本地 chnroute 同源版 ===== */
    subBlocks = extractSubBlocks(HS_SUB_RAW);
    if (!subBlocks.ok) {
      opLog('合并模式合成失败(' + subBlocks.why + '),本次回退自建调度');
      toast('⚠️ 订阅不含完整策略(缺节点或规则段),已回退自建调度', 'warn');
      mergeMode = false; /* 回退自建序列化 */
    } else {
      const B = subBlocks.blocks;
      /* 订阅节点名提取(flow "- { name: X" 与 block "- name: X" 两种形态) */
      const subNodeNames = [];
      (B.proxies || []).forEach(l => {
        const m = l.match(/^\s*-\s*(?:\{\s*)?name:\s*'?([^,'"}]+)/);
        if (m) subNodeNames.push(m[1].trim());
      });
      const nodeSet = new Set(subNodeNames);
      const hasManual = HS_MANUAL.length > 0;
      const manOK = n => hasManual && HS_MANUAL.indexOf(n) >= 0;
      /* 组链静态化: use provider → 订阅节点静态成员(池组/指定线路只收各自候选) */
      groups.forEach(g => {
        if (g._pool) { g.proxies = (g._pool || []).filter(n => nodeSet.has(n) || manOK(n)); g.use = hasManual ? ['manual'] : undefined }
        else if (g._cand) { g.proxies = (g.proxies || []).concat((g._cand || []).filter(n => nodeSet.has(n) || manOK(n))); g.use = hasManual ? ['manual'] : undefined }
        else if (g.use) { g.proxies = (g.proxies || []).concat(subNodeNames); g.use = hasManual ? ['manual'] : undefined }
      });
      /* 订阅组逐条目: 与本地组重名→丢弃(本地为准) */
      const selfGroupNames = new Set(groups.map(g => g.name));
      const grpEnt = []; let curE = null;
      (B['proxy-groups'] || []).forEach(l => {
        if (/^\s*-\s/.test(l)) { if (curE) grpEnt.push(curE); curE = [l] }
        else if (curE) curE.push(l);
      });
      if (curE) grpEnt.push(curE);
      const keptGrp = [];
      grpEnt.forEach(ent => {
        const nm = (ent[0].match(/^\s*-\s*(?:\{\s*)?name:\s*'?([^,'"}]+)/) || [])[1];
        const name = nm && nm.trim();
        if (!name || selfGroupNames.has(name)) return;
        selfGroupNames.add(name);
        /* 缩进归一: 订阅组条目缩进(常见4空格)统一剥到本地组链的2空格,防同序列混缩进 YAML 解析失败 */
        const lead = (ent[0].match(/^\s*/) || [''])[0].length;
        const cut = Math.max(0, lead - 2);
        keptGrp.push(ent.map(l => (l.length >= cut && l.slice(0, cut).trim() === '') ? l.slice(cut) : l).join('\n'));
      });
      /* 订阅规则: 去引号归一,按"类型+匹配值"去重(与本地撞车=本地为准),丢 MATCH,target 存在性校验 */
      const localRules = rules.slice(0, -1); /* 去掉自建 MATCH */
      const keyOf = r => { const pp = r.split(','); return pp[0] + ',' + (pp[1] || '') };
      const seen = new Set(localRules.map(keyOf));
      const okT = new Set(selfGroupNames);
      subNodeNames.forEach(n => okT.add(n)); HS_MANUAL.forEach(n => okT.add(n));
      ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL'].forEach(t => okT.add(t));
      const subRules = []; let dupN = 0, dropN = 0, rwN = 0;
      (B.rules || []).forEach(l => {
        const t = l.trim().replace(/^-\s*/, '').replace(/^['"]|['"]$/g, '').trim();
        if (!t || t.charAt(0) === '#') return;
        const pp = t.split(',');
        if (pp[0] === 'MATCH') return; /* 本地 MATCH 兜底替代(指 🚀 节点选择,调度权在本地) */
        const key = keyOf(t);
        if (seen.has(key)) { dupN++; return }
        let seg = pp.slice(2);
        if (seg.length && /^no-resolve$/i.test((seg[seg.length - 1] || '').trim())) seg = seg.slice(0, -1);
        const target = ((seg[seg.length - 1] || '') + '').trim();
        if (!target || !okT.has(target)) { dropN++; return }
        /* 私网/免流段 DIRECT→REJECT 快速失败(2026-09-13 真机: TikTok API 解析出运营商免流 10.105.x.x,
           订阅 IP-CIDR,10/8,DIRECT 在引擎内拨号必超时拖 30s;内核层私网早已 RETURN,这类 DIRECT 只会超时) */
        if (target === 'DIRECT' && (pp[0] === 'IP-CIDR' || pp[0] === 'IP-CIDR6')
          && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|f[cd]|fe[89ab])/.test(pp[1] || '')) {
          const noRes = /^no-resolve$/i.test((pp[pp.length - 1] || '').trim());
          const base = noRes ? pp.slice(0, -1) : pp;
          base[base.length - 1] = 'REJECT';
          rwN++;
          seen.add(key);
          subRules.push(base.join(','));
          return;
        }
        seen.add(key);
        subRules.push(t);
      });
      console.log('[小海关] 合并模式: 本地规则 ' + localRules.length + ' + 订阅 ' + subRules.length + '(重复略 ' + dupN + ',目标失效略 ' + dropN + ',私网改REJECT ' + rwN + ';订阅组保留 ' + keptGrp.length + ')');
      /* ===== 序列化 ===== */
      y += '\n# ===== 合并模式(v' + V + '): 本地骨架+订阅策略,规则本地优先 =====\n';
      if (subBlocks.anchors && subBlocks.anchors.length) y += subBlocks.anchors.join('\n') + '\n';
      y += 'proxies:\n' + (B.proxies || []).join('\n').replace(/\n+$/, '') + '\n';
      if (hasManual) {
        y += '\n# 手动节点(provider)\nproxy-providers:\n';
        y += '  manual:\n    type: file\n    path: ' + yamlEsc('./providers/manual.yaml') + '\n';
        y += '    health-check:\n      enable: true\n      url: ' + yamlEsc('http://www.gstatic.com/generate_204') + '\n      interval: ' + (+C.iv || 300) + '\n      lazy: true\n';
      }
      /* rule-providers: 本地 china_ip(chnroute 同源) + 订阅自带条目(china_ip 重名剔除=本地为准) */
      const wantChn = ST.chn > 0;
      let subRp = ((B['rule-providers'] || []).join('\n') || '').replace(/\n+$/, '');
      if (subRp && wantChn) subRp = subRp.replace(/^\s{2}china_ip:\n(?:[ \t]{4}.*\n?)*/gm, '').replace(/^\s{2}china_ip:.*\n?/gm, '');
      /* 同缩进归一: 订阅 rule-providers 条目剥到与本地 china_ip 一致的 2 空格 */
      /* v1.8.5 修: 归一目标=2 空格(与本地 china_ip 对齐),按首行实际缩进计算剥除量——
         此前硬编码剥 2:4 空格订阅正好归一,2 空格订阅会被剥成 0 空格掉出 rule-providers 块(2026-09-13 审查 P1) */
      if (subRp) {
        const rpLead = (subRp.match(/^[ \t]*/) || [''])[0].length;
        const rpCut = Math.max(0, rpLead - 2);
        if (rpCut) subRp = subRp.split('\n').map(l => (l.length >= rpCut && l.slice(0, rpCut).trim() === '') ? l.slice(rpCut) : l).join('\n');
      }
      if (wantChn || subRp) {
        y += '\nrule-providers:\n';
        if (wantChn) y += '  china_ip:\n    type: file\n    behavior: ipcidr\n    format: text\n    path: ' + yamlEsc('./rules/china_ip.txt') + '\n    interval: 0\n';
        if (subRp) y += subRp + '\n';
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
        if (g.default) { y += '    default: ' + yamlEsc(g.default) + '\n' }
      });
      keptGrp.forEach(g => { y += '\n' + g + '\n' });
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
      if (g.default) { y += '    default: ' + yamlEsc(g.default) + '\n' }
    });
  }

  y += '\n# 规则\nrules:\n';
  rules.forEach(r => { y += '  - ' + yamlEsc(r) + '\n' });
  return y;
}
async function downloadSub(i) {
  const sub = C.subs[i]; if (!sub) return false;
  const pf = DIR + '/providers/sub' + i + '.yaml';
  await run('mkdir -p ' + shq(DIR + '/providers'), 5000);
  /* UA 必须报 clash 身份: 机场按 UA 分发格式,裸 curl 拿到的是 base64 分享链接(无 proxy-groups/rules,直通判定必回退);自建调度走 mihomo 内核自拉 provider(自带 UA)不受影响 */
  const r = await run('curl -sL -A clash.meta/v1.19.4 --connect-timeout 10 -m 30 -o ' + shq(pf) + ' ' + shq(sub.url) + ' && wc -c < ' + shq(pf), 40000);
  const sz = parseInt(ct(r)) || 0;
  if (sz < 100) { toast('❌ 订阅下载失败(' + sz + 'B,可能 URL 无效或网络不通)', 'red'); return false }
  sub.time = nowStr().slice(0, 16);
  HS_SUBINFO = undefined; HS_SUB_RAW = ''; HS_SUB_RAW_KEY = ''; /* 失效缓存强制重读 */
  await saveConf();
  if (C.policySrc !== 'self') await refreshSubRaw();
  return true;
}
async function writeConfigAndValidate() {
  const yaml = genConfigYaml();
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
  const out = C.logEnabled ? LOGF : '/dev/null';
  /* 接管烙印: 生成时把"是否挂接管"烧进脚本(开机自启时 JS 不在场,规则挂载由 start.sh 兜底;
     s1/s2 切换经 reapplyFw 会连本脚本一起重写,烙印随配置走) */
  const takeover = (C.s1 !== 'off' || C.s2) ? '1' : '0';
  return '#!/bin/sh\n'
    + '#gen:v' + V + '\n'
    + 'D=' + DIR + '\n'
    + '[ -x $D/mihomo ] || exit 1\n'
    /* v1.8.5: 单实例守卫——双启动时第二个实例端口占用退出,其退出钩子(fw.sh clean)会摘掉在跑实例的规则
       =引擎在跑但全直连(2026-09-13 审查 P2) */
    + 'HS_P=$(pidof mihomo 2>/dev/null); [ -n "$HS_P" ] && { echo "already running: $HS_P"; exit 0; }\n'
    + 'HS_HEAD_OK=0\n'
    + 'for HS_I in 1 2 3; do\n'
    + '  HS_CODE=$(curl -s -m 8 -o /tmp/.hs_head -w "%{http_code}" http://127.0.0.1:2333/api/get_custom_head 2>/dev/null)\n'
    + '  [ "$HS_CODE" = "200" ] && { HS_HEAD_OK=1; break; }\n'
    + '  sleep 8\n'
    + 'done\n'
    + 'if [ "$HS_HEAD_OK" = "1" ] && ! grep -q "__customs_loaded" /tmp/.hs_head 2>/dev/null; then\n'
    + '  sh $D/fw.sh clean >/dev/null 2>&1\n'
    + "  sed -i '\\|# plugins/customs|d' " + BOOT_SH + " 2>/dev/null\n"
    + '  for P in $(pidof mihomo); do kill $P 2>/dev/null; done\n'
    + '  sleep 1\n'
    + '  for P in $(pidof mihomo); do kill -9 $P 2>/dev/null; done\n'
    + '  rm -rf $D /tmp/.hs_head\n'
    + '  exit 0\n'
    + 'fi\n'
    + 'rm -f /tmp/.hs_head\n'
    + '[ -f $D/customs.log ] && [ "$(wc -c < $D/customs.log)" -ge 262144 ] && : > $D/customs.log\n'
    + 'export GOMEMLIMIT=' + (C.lowMem ? '48MiB' : '128MiB') + '\n'
    + 'nohup sh -c \'' + DIR + '/mihomo -d ' + DIR + '; sh ' + DIR + '/fw.sh clean >/dev/null 2>&1\' > ' + out + ' 2>&1 &\n'
    + 'HS_TAKEOVER=' + takeover + '\n'
    + '(\n'
    + '  HS_OK=0\n'
    + '  for HS_W in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do\n'
    + '    curl -s -m 2 -o /dev/null http://127.0.0.1:' + C.ports.ctrl + '/version 2>/dev/null && { HS_OK=1; break; }\n'
    + '    sleep 1\n'
    + '  done\n'
    + '  [ "$HS_OK" = "1" ] && [ "$HS_TAKEOVER" = "1" ] && sh $D/fw.sh apply >/dev/null 2>&1\n'
    + '  [ "$HS_OK" = "0" ] && [ "$HS_TAKEOVER" = "1" ] && echo "$(date)\u5f15\u64ce\u672a\u5c31\u7eea,\u8df3\u8fc7\u89c4\u5219\u6302\u8f7d(\u9632\u9ed1\u6d1e)" >> $D/customs.log\n'
    + ') &\n';
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
let ET_ERR = '';
async function readEtState() {
  ET_CACHE = null; ET_ERR = '';
  if (!C.coexistAuto) return;
  try {
    /* 与 readFile 同款 base64 通道(项目内已验证可靠);直接 cat 的原始输出经面板传输可能被改写 */
    const r = await run('base64 < /data/plugins/easytier/state.json 2>/dev/null', 5000);
    if (!r) { ET_ERR = 'run 无返回'; return }
    if (r.success === false) ET_ERR = '面板执行失败:' + String(r.content || '').slice(0, 40);
    const txt = b64d(String(r.content || '').replace(/\s+/g, ''));
    if (!txt) { ET_ERR = 'base64 解码为空, 原始:' + String(r.content || '').slice(0, 40); return }
    const j = JSON.parse(txt.trim());
    if (j && j.version === 1) {
      ET_CACHE = j;
      /* v1.8.5 安全: state.json 内容零信任——cidrs 逐条过 CIDR 白名单(v4 与 v6 分桶),
         p2p_ports 强制 1..65535 整数;这些值会拼进 root 执行的 fw.sh,未过滤=命令注入面(2026-09-13 审查 P1) */
      const rawC = Array.isArray(j.cidrs) ? j.cidrs : [];
      ET_CACHE.cidrs = rawC.filter(c => typeof c === 'string' && okCidr(c.trim()));
      ET_CACHE.cidrs6 = rawC.filter(c => typeof c === 'string' && okV6(c.trim()));
      ET_CACHE.p2p_ports = (Array.isArray(j.p2p_ports) ? j.p2p_ports : [])
        .map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 65535);
      /* 监听口从 ET 配置实时补采(listeners 的 :PORT): 排除用=监听口+打洞口并集,源/目标双向 */
      try {
        const lr = await run("grep -hoE ':[0-9]+' /data/plugins/easytier/configs/*.toml 2>/dev/null | tr -d : | sort -un", 5000);
        (lr.content || '').split(/\s+/).forEach(p => { const n = parseInt(p); if (n > 0 && ET_CACHE.p2p_ports.indexOf(n) < 0) ET_CACHE.p2p_ports.push(n) });
      } catch (e) { }
    }
    else if (!ET_ERR) ET_ERR = 'state.json 版本/内容不符:' + String(r.content || '').slice(0, 40);
  } catch (e) { ET_ERR = '异常:' + String((e && e.message) || e).slice(0, 60) }
}
function genFwSh() {
  const P = C.ports;
  const ips = C.s1 === 'white' ? C.devices.filter(d => d.proxy).map(d => d.ip) : [];
  const allMode = C.s1 === 'all';
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
    'IPS="' + ips.filter(ip => okCidr(ip) || okV6(ip)).join(' ') + '"', /* 消费端复滤与 WMACS/EXCIDRS 齐平(v2.0.8 纵深防御;上游 collectDevices/sanitizeConf 已校验,合法值恒通过零行为变化) */
    'WMACS="' + C.devices.filter(d => d.proxy && okMac(d.mac)).map(d => String(d.mac).trim().toLowerCase()).join(' ') + '"',
    'EXCIDRS="' + ((C.exclude || []).filter(x => x && x.m === 'cidr' && okCidr(x.v)).map(x => String(x.v).trim()).join(' ')) + '"',
    '',
    '# 并发锁:start.sh 后台探活 apply 与 JS 侧 apply 可能竞态(实锤:链规则重复两套),flock 串行化',
    'exec 9>/tmp/.hs_fw.lock',
    'flock -n 9 || { echo "WARN: fw 并发调用,本次跳过(另一实例处理中)"; exit 0; }',
    '',
    'fw_clean() {',
    '  while iptables -t nat -D PREROUTING -j HS_LAN 2>/dev/null; do :; done',
    '  while iptables -t nat -D PREROUTING -j HS_DNS 2>/dev/null; do :; done',
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
  '  while ip6tables -t nat -D PREROUTING -j HS_V6_LAN 2>/dev/null; do :; done',
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
    '  if [ "$ALLMODE" = "1" ]; then',
    /* v1.8.5: 先插 LAN 再插 DNS(-I 1 每次插到最顶)→ PREROUTING 最终顺序 DNS→LAN;此前相反,
       LAN 链末尾的 tcp catch-all 会把 TCP:53 抢走,导致 TCP DNS 劫持分支不可达(2026-09-13 审查 P2) */
    '    iptables -t nat -I PREROUTING 1 -j HS_LAN',
    '    iptables -t nat -I PREROUTING 1 -j HS_DNS',
    '    iptables -t mangle -I PREROUTING 1 -j HS_UDP',
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
    '      echo "WARN: 白名单门控不可用(ipset 与 -m mac 均缺失),本次未挂接管"',
    '    fi',
    '  fi',
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
    '    ip6tables -t nat -I PREROUTING 1 -j HS_V6_LAN',
    '    ip6tables -t nat -I PREROUTING 1 -j HS_V6_DNS',
    '  elif [ -n "$WMACS" ]; then',
    '    if ip6tables -m set -h >/dev/null 2>&1 && ipset list hs_wmac >/dev/null 2>&1; then',
    '      ip6tables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_V6_LAN',
    '      ip6tables -t nat -I PREROUTING 1 -m set --match-set hs_wmac src -j HS_V6_DNS',
    '    elif ip6tables -m mac -h >/dev/null 2>&1; then',
    '      for MAC in $WMACS; do',
    '        ip6tables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_V6_LAN',
    '        ip6tables -t nat -I PREROUTING 1 -m mac --mac-source $MAC -j HS_V6_DNS',
    '      done',
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
    '      ip6tables -t mangle -I PREROUTING 1 -j HS_V6_UDP',
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
  /* 清插件目录可再生的临时产物:下载残留(.dl/.dl.gz)、解压中间件(mihomo.tmp)、轮询哨兵(.dl.exit/.pf.exit)、写盘备份(.bak) */
  await run('cd ' + shq(DIR) + ' 2>/dev/null && rm -f *.dl *.dl.gz mihomo.tmp .dl.exit .pf.exit fw.sh.bak start.sh.bak config.yaml.bak conf.json.bak 2>/dev/null', 8000);
  return await hsDiskKB();
}
async function applyFw() {
  await readEtState();
  const w = await writeFile(FW, genFwSh());
  if (!w) { toast('防火墙脚本写入失败', 'red'); return false }
  const r = await run('chmod 755 ' + shq(FW) + '; sh ' + shq(FW) + ' apply 2>&1; echo "---RULES---"; iptables -t nat -S PREROUTING 2>/dev/null | grep HS_ | head -6; iptables -t nat -S HS_LAN 2>/dev/null | head -8', 15000);
  console.log('[小海关] applyFw 结果:', r.content);
  const fwOut = (r.content || '').split('---RULES---')[0];
  if (/No chain|Bad argument|ip6tables:|iptables: error/i.test(fwOut)) await opLog('fw应用告警: ' + fwOut.trim().slice(0, 200));
  /* v1.8.9: WARN/INFO 行完整保留——此前 50 字符截断把"v6国内直通规则未挂载"等关键告警藏在日志外(用户设备实证) */
  else {
    const warns = fwOut.trim().split('\n').filter(l => /WARN|INFO/.test(l)).join(' | ');
    await opLog('fw应用: ' + (warns ? warns.slice(0, 200) : fwOut.trim().slice(0, 50)));
  }
  return true;
}
/* ---- 无感启停 ---- */
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
    await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.pf.exit') + '; nohup sh -c \'curl -sL --connect-timeout 8 -m 180 ' + (src.px ? '-x ' + shq(src.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(src.url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.pf.exit') + '\' >/dev/null 2>&1 &', 5000);
    let lastSz = -1, stag = 0, done = false;
    for (let pi = 0; pi < 130; pi++) {
      await wait(1500);
      const ex = ct(await run('cat ' + shq(DIR + '/.pf.exit') + ' 2>/dev/null', 3000)).trim();
      if (ex !== '') { done = ex === '0'; break }
      const sz = pInt(await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000));
      /* v1.8.8: 停滞阈值 10→6,空挂快速失败(同 chnInstall) */
      if (sz === lastSz) { stag++; if (stag >= 6) { await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000); break } } else { stag = 0; lastSz = sz }
      txt('⬇ ' + name + ' · ' + (sz / 1048576).toFixed(2) + ' MB(' + src.name + ')');
    }
    await run('rm -f ' + shq(DIR + '/.pf.exit'), 3000);
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
  const r = await run('mkdir -p ' + DIR + '/rules; awk \'{if ($1 ~ /^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+\\//) print $1}\' ' + DIR + '/chnroute.txt > ' + DIR + '/rules/china_ip.txt 2>/dev/null && wc -l < ' + DIR + '/rules/china_ip.txt', 8000);
  const n = parseInt(ct(r)) || 0;
  if (n < 5000) { await opLog('china_ip 规则集生成异常: ' + n + ' 条(chnroute 文件问题?)'); return false }
  return true;
}
async function engineStart() {
  /* 升级感知: 进入时引擎可能是旧组件在跑(init 升级对账已标记),本次启动全量重生成三件套=完成升级,
     成功后按"升级完成"而非"普通启动"反馈,并复核指纹确认三件套真的换新(停止态启动同样覆盖) */
  const wasUpgrade = !!(ST.upgradePending && ST.upgradePending.length);
  if (!ST.bin) { detectArch().then(() => openInstallGuide()); return false }
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
  await run('chmod 755 ' + shq(START) + '; sh ' + shq(START), 8000);
  /* 端口探活(最多 8 秒) */
  let ready = false;
  for (let i = 0; i < 8 && !ready; i++) {
    await wait(1000);
    await collectStatus();
    /* v1.8.5: 改看真实就绪信号——listen.mixed/redir/dns 仅在控制接口 /version 探测成功时置位;
       此前的 LM/LR/LD 是 collectStatus shell 里硬编码的 echo =1 占位(恒真),探活形同虚设(2026-09-13 审查 P1) */
    ready = !!(ST.listen.mixed && ST.listen.redir && ST.listen.dns);
  }
  if (!ST.running) {
    HS_LAST_ERR = '引擎启动失败' + (C.logEnabled ? '(详见运行日志)' : '(可在 日志页签 开启日志后重试)'); toast('启动失败' + (C.logEnabled ? ',请查看日志' : ':可在 日志页签 开启日志后重试'), 'red');
    /* 启动失败急救: 无条件清规则+杀残留引擎——引擎不在场时任何残留 HS_* 规则都是黑洞(1.6.7 not found 事故实证) */
    await run('sh ' + shq(FW) + ' clean 2>/dev/null; for P in $(pidof mihomo); do kill $P 2>/dev/null; done', 8000).catch(() => { });
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
  if (C.s1 !== 'off' || C.s2) {
    await applyFw();
    await opLog('引擎启动+规则挂载(模式:' + C.s1 + ',S2:' + (C.s2 ? 'on' : 'off') + ')');
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
  if (wasUpgrade) {
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
  const pids = (await run('pidof mihomo', 5000)).content.trim();
  if (pids) {
    await run('for P in ' + pids + '; do kill $P; done', 5000);
    await wait(600);
    const p2 = (await run('pidof mihomo', 5000)).content.trim();
    if (p2) await run('for P in ' + p2 + '; do kill -9 $P; done', 5000);
  }
  /* 定点清 conntrack(有工具时) */
  await run('which conntrack >/dev/null 2>&1 && conntrack -D --dport ' + C.ports.redir + ' 2>/dev/null; echo ok', 5000);
  await collectStatus(); await checkResidue();
  const ok = !ST.running;
  toast(ok ? '已停止:规则已摘除,进程退出,终端回直连' : '停止失败,请重试或诊断', ok ? 'green' : 'red');
  if (ok) await opLog('引擎停止(规则已清)');
  return ok;
}
async function engineRestart() {
  const a = await engineStop(); const b = await engineStart();
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
  + '@media(max-width:480px){.hs-modal,.hs-modal.big{width:92vw}}'
  + '.hs-mh{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.1);flex:none}'
  + '.hs-mh .t{font-weight:700;font-size:.9rem;color:var(--dark-title-color,skyblue)}'
  + '.hs-mx{background:none;border:0;color:#9aa3b2;font-size:1.05rem;cursor:pointer;padding:2px 6px}'
  + '.hs-mb{padding:10px 16px 0;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}'
  + '.hs-pgscroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:14px}'
  + '.hs-pghead{flex:none;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}'
  + '.hs-mb.hs-node-mode{display:flex;flex-direction:column;overflow:hidden;padding:10px 16px 0}'
  + '.hs-node-head{flex:none;background:var(--dark-card-bg,rgba(0,0,0,.24));border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:10px 12px 8px;margin-bottom:10px}'
  + '.hs-node-list{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 0 14px}'
  + '.hs-tabs{display:flex;gap:2px;padding:8px 12px 0;flex:none;overflow-x:auto}'
  + '.hs-tabs button{background:transparent;border:0;border-bottom:2px solid transparent;color:#9aa3b2;padding:8px 13px;font-size:.82rem;cursor:pointer;white-space:nowrap}'
  + '.hs-tabs button.on{color:var(--dark-title-color,skyblue);border-bottom-color:var(--dark-title-color,skyblue);font-weight:600}'
  + '.hs-warn{background:rgba(229,115,115,.12);border:1px solid rgba(229,115,115,.35);color:#ffb3b3;border-radius:10px;padding:8px 10px;font-size:.76rem;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
  + '.hs-li{font-size:.78rem;padding:3px 0;border-bottom:1px dashed rgba(255,255,255,.06)}'
  + '.hs-row{display:flex;align-items:center;gap:12px;min-height:42px;padding:8px 2px;border-bottom:1px dashed rgba(255,255,255,.06);flex-wrap:wrap}'
  + '.hs-row:last-child{border-bottom:0}'
  + '.hs-row .hs-sl{flex:1;min-width:0}'
  + '.hs-row .hs-st{font-size:.8rem}'
  + '.hs-sd{font-size:.66rem;color:#9aa3b2;margin-top:2px;line-height:1.5}'
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
  + '.hs-seg button{flex:1 0 auto;background:transparent;border:0;color:#9aa3b2;padding:5px 8px;font-size:.7rem;cursor:pointer;white-space:nowrap;min-width:0}'
  + '.hs-seg button.on{background:var(--dark-btn-color-active,rgba(1,138,216,.66));color:#fff}'
  + '.hs-sw{position:relative;display:inline-block;width:46px;height:26px;flex:none}'
  + '.hs-sw input{opacity:0;width:0;height:0}'
  + '.hs-sw span{position:absolute;inset:0;background:#333a49;border-radius:26px;transition:.2s;cursor:pointer}'
  + '.hs-sw span:before{content:"";position:absolute;width:20px;height:20px;border-radius:50%;background:#aab3c5;top:3px;left:3px;transition:.2s}'
  + '.hs-sw input:checked+span{background:var(--dark-btn-color-active,rgba(1,138,216,.66))}'
  + '.hs-sw input:checked+span:before{transform:translateX(20px);background:#fff}'
  + '.hs-sw input:disabled+span{opacity:.4;cursor:not-allowed}'
  + '.hs-actions{display:flex;gap:8px;justify-content:flex-end;padding:10px 2px 0;flex-wrap:wrap}'
  + '.hs-hint{font-size:.72rem;color:#9aa3b2}'
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
  + '.hs-prog-steps{display:flex;justify-content:space-between;font-size:.64rem;color:#9aa3b2;margin:6px 0}'
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
      let n = o.countdown; ok.disabled = true; ok.textContent = (o.okText || '确定') + '(' + n + ')';
      const iv = setInterval(() => { n--; if (n <= 0) { clearInterval(iv); ok.disabled = false; ok.textContent = o.okText || '确定' } else ok.textContent = (o.okText || '确定') + '(' + n + ')' }, 1000);
    }
  });
}
let hsCfRes = null;

/* ================= 常驻卡 ================= */
function renderCard() {
  const box = $('#hs_card');
  const abn = !ST.running && ST.residue;
  let st, sub;
  if (ST.running) {
    st = '<span style="color:#66bb6a">● 运行中</span>' + (C.ver ? ' v' + esc(C.ver) : '')
      + ((ST.upgradePending && ST.upgradePending.length) ? ' <span id="hs_upg_badge" class="hs-act warn" title="点击查看更新内容并升级">⬆️ 待升级 · 查看</span>' : '')
      + ((ST.downgraded && !(ST.upgradePending && ST.upgradePending.length)) ? ' <span class="hs-act warn" title="已回滚到旧版组件运行,新版本插件发布前不再提示升级">⬇️ 降级运行 ' + esc(C.upgBackup ? C.upgBackup.from : '?') + '</span>' : '');
    sub = '终端代理:' + s1Txt() + ' · 本机:' + (C.s2 ? '开' : '关');
  } else if (abn) {
    st = '<span style="color:#e57373">● 异常:规则残留</span>';
    sub = '被接管设备可能断网,请还原或重启';
  } else {
    st = '<span style="color:#9aa3b2">● 已停止</span>';
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
    + '<div style="flex:1;min-width:0;font-size:.78rem">' + st + ' <span style=\"font-size:.6rem;color:#9aa3b2\">小海关 v' + V + '</span><br><span style="font-size:.68rem;opacity:.75">' + esc(sub) + '</span></div>'
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
    : '<div class="title" style="margin:6px 0"><strong>🛡️ 小海关</strong> <span style="font-size:.62rem;color:#9aa3b2;font-weight:400">v' + V + '</span>'
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
  const bind = (id, fn) => { const b = $('#' + id); if (b) { b.onclick = fn } else console.warn('[小海关] 按钮未找到:', id) };
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
  $('#hs_cf_ok').onclick = () => { mHide('hs_modal_cf'); if (hsCfRes) hsCfRes(true); hsCfRes = null };
  $('#hs_cf_no').onclick = () => { mHide('hs_modal_cf'); if (hsCfRes) hsCfRes(false); hsCfRes = null };
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
  pane.innerHTML = '<div style="text-align:center;padding:14px;color:#9aa3b2;font-size:.76rem">📡 采集设备中…</div>';
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
    h += '<div class="hs-devrow' + (d.online === false ? ' off' : '') + '">'
    + '<div style="flex:1;min-width:0">'
    + '<div class="hs-dev-name" data-rn="' + i + '" style="font-size:.82rem;font-weight:600;cursor:pointer">' + esc(d.name) + ' <span style="opacity:.5;font-size:.64rem">✏️</span></div>'
    + '<div style="font-size:.7rem;color:#9aa3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(d.ip) + ' · ' + esc(d.host || d.mac) + '</div>'
    + '</div>'
    + '<select data-line="' + i + '" style="flex:none;max-width:96px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:6px;color:#e8eaf0;padding:3px 4px;font-size:.7rem">' + lineOpts + '</select>'
    + '<label class="hs-sw"><input type="checkbox" data-dev="' + i + '" ' + (d.proxy ? 'checked' : '') + '><span></span></label>'
    + '</div>';
  });
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
      if (await saveConfReload(null)) HS_LINE_SIG = lineSig(); /* 成功才置,失败留待重试 */
    }, '✅ 线路已' + (sl.value ? '指定' : '恢复跟随全局') + (ST.running ? '' : '(引擎未运行,下次启动生效)'));
    if (!okr) sl.value = d.line || ''; /* op 忙/失败时回滚下拉显示,防显示与数据不一致 */
  });
  const lmb = pane.querySelector('#hs_line_mgr'); if (lmb) lmb.onclick = () => openLineDlg();
  $('#hs_dev_rf').onclick = refreshDevPane;
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
    if (await saveConfReload(null)) HS_LINE_SIG = lineSig(); /* 热重载成功才置签名,失败留给下次 collectStatus 重试 */
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
  const q = '/group/' + encodeURIComponent(hsCurGroup) + '/delay?timeout=5000&url=' + encodeURIComponent((u || 'http://www.gstatic.com/generate_204'));
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
  await writeFile(CFG, yaml);
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
    let icon = '📱', name = src0 + '(未入库)';
    if (k === 'localhost') { icon = '🖥️'; name = '设备本机' }
    else {
      const dv = (C.devices || []).find(x => x.mac && x.mac.toUpperCase() === k.toUpperCase()) || (C.devices || []).find(x => x.ip === src0);
      if (dv) { icon = dv.proxy ? '📱' : '📵'; name = dv.name || dv.mac || src0 }
    }
    g.conns.sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
    /* v2.2.1: 同目标(host)聚合——网关层隧道场景(终端自带代理客户端时)一台设备可产生几十条同目标连接,
       逐条展示既占满 8 行又让用户"看不出是什么"(真机实证:87/88 条全是机场入口域名);聚合后 ×N 计数 */
    const agg = {};
    g.conns.forEach(r => { const k = r.host; if (!agg[k]) agg[k] = { host: r.host, rule: r.rule, chain: r.chain, up: 0, dl: 0, n: 0 }; agg[k].up += r.up; agg[k].dl += r.dl; agg[k].n++ });
    const aggArr = Object.keys(agg).map(k => agg[k]).sort((a, b) => (b.up + b.dl) - (a.up + a.dl));
    return { src: src0, icon: icon, name: name, up: g.up, dl: g.dl, conns: aggArr.slice(0, 8), total: g.conns.length };
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
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;font-size:.68rem;margin-top:2px;color:#9aa3b2">'
  + '<span>📄 <b style="color:#e8eaf0">' + esc(sb ? sb.name : '未启用订阅') + '</b>' + (sb && sb.time ? ' · 更新 ' + esc(sb.time.slice(5)) : '') + '</span>'
  + '<button class="btn hs-xs" id="hs_node_submgr" style="flex:none">管理订阅 ›</button>';
  infoNodes.forEach(n => {
    const parts = n.split(/[:：]/);
    if (parts.length >= 2) h += '<span>' + esc(parts[0].trim()) + ': <b style="color:#7fc9f2">' + esc(parts.slice(1).join(':').trim()) + '</b></span>';
    else h += '<span>' + esc(n) + '</span>';
  });
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
    + (hsUdpRun && HS_UDP_NODE[name] !== undefined ? (HS_UDP_NODE[name] > 0 ? '<span class="hs-udp" style="color:#66bb6a;font-size:.66rem;flex:none;min-width:22px;text-align:right">U✓</span>' : '<span class="hs-udp" style="color:#5b6270;font-size:.66rem;flex:none;min-width:22px;text-align:right">U✗</span>') : '<span class="hs-udp" style="flex:none;min-width:0"></span>')
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
      const yml = genConfigYaml(); await writeFile(CFG, yml);
      await apiPut('/configs?force=true', { path: '', payload: yml });
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
      if (el) { el.textContent = '…'; el.style.color = '#9aa3b2'; el.title = '' }
    });
    const map = await groupDelay();
    applyDelayMap(map, realNodes);
    tst.disabled = false; tst.textContent = '⚡ 测全部';
    toast(map ? '✅ 组测速完成(' + realNodes.length + ' 节点,引擎并发)' : '❌ 组测速失败(详见控制台)', map ? 'green' : 'red');
  };
  $('#hs_node_rf').onclick = refreshNodePane;
  /* 延迟测速诊断: 直连 9090 测两个不同 URL + mihomo/系统资源 + OUTPUT 链,结果替换列表区 */
  const udpBtn = $('#hs_node_udp');
  if (udpBtn) udpBtn.onclick = async () => {
    if (udpBtn.disabled) return;
    udpBtn.disabled = true; udpBtn.textContent = '⏳ 检测中…';
    /* 组端点对全体成员并发发 udp DNS 探测,应答的进 map——未应答=UDP 不通(封53或无UDP) */
    const map = await groupDelay('udp://8.8.8.8:53');
    if (map) {
      realNodes.forEach(n => { HS_UDP_NODE[n] = map[n] || 0 });
      hsUdpRun = true;
      let ok = 0; realNodes.forEach(n => { if (HS_UDP_NODE[n] > 0) ok++ });
      toast('UDP 可用 ' + ok + '/' + realNodes.length + '(U✓=游戏语音可选;U✗可能是封UDP:53惯例)', 'green');
      opLog('节点UDP检测(组' + hsCurGroup + '):可用 ' + ok + '/' + realNodes.length);
      realNodes.forEach(n => {
        const el = pane.querySelector('[data-node="' + CSS.escape(n) + '"] .hs-udp');
        if (el) { const d = HS_UDP_NODE[n]; el.textContent = d > 0 ? 'U✓' : 'U✗'; el.style.color = d > 0 ? '#66bb6a' : '#5b6270'; el.style.minWidth = '22px'; el.style.textAlign = 'right' }
      });
    } else { toast('UDP 检测失败(控制接口无响应)', 'red') }
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
  + '<div class="hs-li">' + (ST.running ? '<span style="color:#66bb6a">● 运行中</span>' + (C.ver ? ' · v' + esc(C.ver) : '') + (ST.kb ? ' · ' + (ST.kb / 1024).toFixed(1) + 'MB 目录' : '') : (ST.residue ? '<span style="color:#e57373">● 异常:规则残留</span>' : '<span style="color:#9aa3b2">● 已停止</span>')) + '</div>'
  + '<div class="hs-li">代理方式:' + esc(proxyModeTxt()) + '</div>'
  + '<div class="hs-li">节点模式:' + (ST.running ? esc(({ auto: '♻️ 自动选优', balance: '⚖️ 负载均衡', fallback: '🪜 故障转移', manual: '✋ 手动锁定' })[C.mode] || '—') + (C.pausedAuto ? '(已暂停→手动)' : '') : '—') + '</div>'
  + '</div>'
  + (ST.running && cs && cs.byDev && cs.byDev.length
    ? '<div class="hs-sec"><h4>接入设备 <span class="hs-hint">按流量排序 · 点击展开活动连接</span><span class="hs-act" id="hs_dev_rf" style="margin-left:auto" title="重新采集设备与活动连接(不做实时刷新,手动或切换页签时更新)">⟳</span></h4>'
      + cs.byDev.map((dv, i) =>
        '<div style="margin-bottom:6px">'
        + '<div class="hs-dev-hd" data-dev="' + i + '" style="display:flex;gap:6px;align-items:baseline;cursor:pointer;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:6px 10px">'
        + '<span style="flex:none">' + dv.icon + '</span>'
        + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.8rem">' + esc(dv.name) + '</span>'
        + '<span class="hs-hint" style="flex:none">' + dv.total + '条</span>'
        + '<span class="hs-hint" style="flex:none;min-width:78px;text-align:right">↓' + fmtB(dv.dl) + ' ↑' + fmtB(dv.up) + '</span>'
        + '<span style="flex:none;font-size:.7rem;color:#9aa3b2;transition:transform .2s">▸</span>'
        + '</div>'
        + '<div class="hs-dev-cons" style="display:none;padding:4px 4px 2px 10px">'
        + '<div class="hs-hint" style="padding:2px 6px 4px;font-size:.64rem">目标=网关实际去向;终端若自带代理客户端,这里只能看到其隧道目标(如机场入口域名),真实访问的网站在它的内层</div>'
        + dv.conns.map(t => '<div class="hs-li" style="display:flex;gap:6px;align-items:baseline;overflow:hidden;padding:5px 6px">'
          + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.host) + (t.n > 1 ? ' <span class="hs-hint">×' + t.n + '条</span>' : '') + '</span>'
          + '<span class="hs-hint" style="flex:none;max-width:36%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.rule || '—') + '</span>'
          + '<span style="flex:none;font-size:.66rem;color:' + (t.chain === 'DIRECT' ? '#66bb6a' : '#7fc9f2') + '">' + (t.chain === 'DIRECT' ? '直连' : /剩余流量|到期|过期|官网|套餐|重置|流量[:：]|EXP/i.test(t.chain || '') ? 'ℹ️ 信息节点' : esc(t.chain)) + '</span>'
          + '<span class="hs-hint" style="flex:none;min-width:64px;text-align:right">↓' + fmtB(t.dl) + ' ↑' + fmtB(t.up) + '</span>'
          + '</div>').join('')
        + '</div></div>').join('')
      + '</div>'
    : '')
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
  + '<span style="font-size:.72rem;color:#9aa3b2">❓ 第一次使用小海关?</span>'
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
  L.push('    server: ' + n.server);
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
    const yaml = genConfigYaml();
    await writeFile(CFG, yaml);
    const ok = await apiPut('/configs?force=true', { path: '', payload: yaml });
    if (!ok) { toast('热重载失败,重启引擎后生效', 'pink'); opLog('热重载失败(引擎运行中,重启后生效)'); return false }
    return true;
  } else if (msg) toast('引擎未运行,下次启动生效', 'pink');
  return false;
}
/* 添加节点弹窗(纯添加,无管理功能) */
function openAddNodeDlg() {
  try {
  hsOpenSimple('➕ 添加节点',
    '<textarea id="hs_manual_ta" placeholder="每行一个节点链接(ss:// vmess:// trojan://)；\n或粘贴 YAML 片段(proxies: 开头,适用全协议)\n保存后自动并入节点组" style="width:100%;height:34vh;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:8px;font-size:.72rem;font-family:Menlo,Consolas,monospace;resize:vertical;box-sizing:border-box"></textarea>'
    + '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn hs-pri" id="hs_manual_save">保存并生效</button></div>');
  $('#hs_manual_save').onclick = async () => {
    const btn = $('#hs_manual_save');
    btn.disabled = true; btn.textContent = '保存中…';
    const ok = await saveManual($('#hs_manual_ta').value);
    if (ok) { mHide('hs_modal_simple'); renderPane() } else { btn.disabled = false; btn.textContent = '保存并生效' }
  };
  } catch (e) { toast('添加节点弹窗异常:' + esc(String((e && e.message) || e).slice(0, 60)), 'red'); console.error('[小海关] openAddNodeDlg:', e) }
}
/* 手动节点管理弹窗 */
function openManualDlg() {
  try {
  console.log('[小海关] 打开手动节点弹窗, 当前节点数:', HS_MANUAL.length);
  const list = HS_MANUAL.length
    ? '<div class="hs-hint" style="margin-bottom:6px">当前 ' + HS_MANUAL.length + ' 个: ' + HS_MANUAL.slice(0, 8).map(esc).join(' / ') + (HS_MANUAL.length > 8 ? ' …' : '') + '</div>'
    : '<div class="hs-hint" style="margin-bottom:6px">当前无手动节点</div>';
  hsOpenSimple('✏️ 手动节点',
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
async function refreshSubInfo() {
  if (C.activeSub < 0 || !C.subs[C.activeSub]) { HS_SUBINFO = undefined; return }
  /* 本地优先: grep 只取 info 行(provider 文件可达数百 KB,readFile 全量 base64 会被面板输出截断;含 URL 编码形态) */
  const F = shq(DIR + '/providers/sub' + C.activeSub + '.yaml');
  const gr = await run("grep -aoE .{0,8}(\u5269\u4f59\u6d41\u91cf|%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F).{0,40} " + F + " 2>/dev/null | head -2; "
    + "grep -aoE .{0,8}(\u5957\u9910\u5230\u671f|%E5%A5%97%E9%A4%90%E5%88%B0%E6%9C%9F).{0,40} " + F + " 2>/dev/null | head -2", 12000);
  if (gr.success && (gr.content || '').trim()) {
    let txt = gr.content;
    try { const dec = decodeURIComponent(txt); if (dec !== txt) txt = dec + '\n' + txt } catch (e) { }
    const m1 = txt.match(/剩余流量[：:]\s*([0-9.]+\s*[TGGM]?B)/);
    const m2 = txt.match(/套餐到期[：:]\s*([^\s"'}]+)/);
    if (m1 || m2) { HS_SUBINFO = { left: m1 ? m1[1] : '', expire: m2 ? m2[1] : '' }; return }
  }
  /* 兜底: 9090 /proxies 明文节点名 */
  if (ST.running) {
    const d = await apiGet('/proxies');
    if (d && d.proxies) {
      for (const k of Object.keys(d.proxies)) {
        if (/剩余流量|套餐到期/.test(k)) {
          const m1 = k.match(/剩余流量[：:]\s*([0-9.]+\s*[TGGM]?B)/);
          const m2 = k.match(/套餐到期[：:]\s*([^\s"']+)/);
          HS_SUBINFO = (m1 || m2) ? { left: m1 ? m1[1] : '', expire: m2 ? m2[1] : '' } : null;
          return;
        }
      }
    }
  }
  HS_SUBINFO = null;
}

/* 订阅时龄(小时);time 格式 YYYY-MM-DD HH:mm */
function subAgeH(t) {
  if (!t) return -1;
  const p = t.split(/[- :]/).map(Number);
  if (p.length < 5 || p.some(isNaN)) return -1;
  return Math.floor((Date.now() - new Date(p[0], p[1] - 1, p[2], p[3], p[4]).getTime()) / 36e5);
}
function paneSub() {
  let h = '<div class="hs-hint" style="margin-bottom:6px">同一时间仅一个订阅生效;添加后自动下载并生成配置</div>';
  h += '<div class="hs-pghead">'
  + '<button class="btn hs-sm hs-pri" id="hs_sub_addnode">➕ 添加节点</button>'
  + '<button class="btn hs-sm" id="hs_sub_manual">✏️ 手动节点(' + HS_MANUAL.length + ')</button>'
  + '</div>';
if (!C.subs.length) h += '<div class="hs-hint">暂无订阅,可从下方添加;</div>';
  C.subs.forEach((sb, i) => {
    const age = subAgeH(sb.time);
    const stale = age > 24;
    let badges = '';
    if (i === C.activeSub && HS_SUBINFO) {
      if (HS_SUBINFO.left) badges += ' <span class="hs-badge" style="color:#66bb6a">⧇ ' + esc(HS_SUBINFO.left) + '</span>';
      if (HS_SUBINFO.expire) badges += ' <span class="hs-badge" style="color:#7fc9f2">⏳ ' + esc(HS_SUBINFO.expire) + '</span>';
    }
    if (stale) badges += ' <span class="hs-badge" style="color:' + (age > 72 ? '#e57373' : '#ffb74d') + '">🕐 ' + (age >= 48 ? Math.floor(age / 24) + '天' : age + 'h') + '未更新</span>';
    h += '<div class="hs-devrow"><div style="flex:1;min-width:0">'
    + '<div style="font-size:.82rem;font-weight:600">' + esc(sb.name) + (i === C.activeSub ? ' <span style="color:#7fc9f2;font-size:.64rem;border:1px solid #7fc9f2;border-radius:5px;padding:0 5px">使用中</span>' : '') + badges + '</div>'
    + '<div style="font-size:.68rem;color:#9aa3b2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(sb.url.replace(/^(https?:\/\/[^\/]+).*$/, '$1/***')) + ' · ' + esc(sb.time || '') + (stale ? ' · 建议更新' : '') + '</div>'
    + '</div>'
    + (i === C.activeSub ? '' : '<button class="btn hs-sm hs-pri" data-subuse="' + i + '">启用</button>')
    + '<button class="btn hs-sm" data-subupd="' + i + '">' + (i === C.activeSub ? '更新' : '更新') + '</button>'
    + '<button class="btn hs-sm" data-subedit="' + i + '">编辑</button>'
    + '<button class="btn hs-sm hs-dgr" data-subdel="' + i + '">删除</button></div>';
  });
  /* 编辑态表单:预填现值,保存时链接有变化才重新下载(订阅过期换链接无需删除重加) */
  const ed = HS_SUB_EDIT >= 0 && C.subs[HS_SUB_EDIT] ? C.subs[HS_SUB_EDIT] : null;
  if (ed) h += '<div class="hs-hint" style="margin-top:10px">正在编辑「' + esc(ed.name) + '」——名称随时可改;链接有变化时保存会重新下载,下载失败则保留原链接</div>';
  h += '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">'
  + '<input id="hs_sub_name" placeholder="订阅名称" value="' + (ed ? esc(ed.name) : '') + '" style="flex:1;min-width:120px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:7px 10px;font-size:.76rem">'
  + '<input id="hs_sub_url" placeholder="订阅链接 https://..." value="' + (ed ? esc(ed.url) : '') + '" style="flex:2;min-width:180px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:8px;color:#e8eaf0;padding:7px 10px;font-size:.76rem">'
  + '<button class="btn hs-pri" id="hs_sub_add">' + (ed ? '保存修改' : '添加') + '</button>'
  + (ed ? '<button class="btn" id="hs_sub_cancel">取消</button>' : '') + '</div>'
  return h;
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
  const b = await run('cat /data/plugins/easytier/state.json 2>/dev/null', 5000);
  const txt = (b.content || '').trim();
  if (!txt) return 'nostate';
  try {
    const j = JSON.parse(txt);
    if (!j || j.version !== 1 || typeof j.active !== 'boolean') return 'badstate';
    if (j.active && !(Array.isArray(j.cidrs) && j.cidrs.length)) return 'badstate';
    return 'ok';
  } catch (e) { return 'badstate' }
}
/* 查看订阅全部节点(9090 provider API,含延迟) */
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
  const CQ = ['①', '②', '③', '④', '⑤']; let pi = 0, pv = '';
  if (C.cnBypass !== false && ST.chn >= 5000) { pi++; pv += '<div class="hs-li">🌎 ' + CQ[pi - 1] + ' 国内直通:' + ST.chn + ' 条中国 IP 段内核态放行,不进代理</div>' }
  if (C.coexistAuto) { pi++; pv += '<div class="hs-li">🛡 ' + CQ[pi - 1] + ' 自动兼容排除:EasyTier 网段+打洞端口(state.json)—— 防火墙层,不进代理</div>' }
  if (FC.length) { pi++; pv += '<div class="hs-li">⬆ ' + CQ[pi - 1] + ' 强制代理(置顶):' + FC.map(x => esc(x.v) + '(' + MN[x.m] + ')').join(' · ') + '</div>' }
  if (EX.length) { pi++; pv += '<div class="hs-li">⬇ ' + CQ[pi - 1] + ' 排除直连:' + EX.map(x => esc(x.v) + '(' + (x.m === 'cidr' ? '防火墙层' : MN[x.m]) + ')').join(' · ') + '</div>' }
  pi++; pv += '<div class="hs-li">📋 ' + CQ[pi - 1] + ' 其余流量:按订阅规则分流,未命中走兜底</div>';
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
  + '<div class="hs-sec"><h4>当前生效分流(优先级从上到下)</h4>' + pv + '</div>'
  + '<div class="hs-sec"><h4>自动兼容</h4>'
  + R('自动兼容 EasyTier', '默认关闭,仅同装 EasyTier 时需要;开启时校验 ET 在位且其状态文件输出已打开', '<label class="hs-sw"><input type="checkbox" id="hs_set_cox" ' + ((D ? D.coexistAuto : C.coexistAuto) ? 'checked' : '') + '><span></span></label>')
  + ((D ? D.coexistAuto : C.coexistAuto)
    ? '<details class="hs-fold" id="hs_et_fold" style="margin:2px 0 8px"><summary style="padding:8px 12px;cursor:pointer;font-size:.76rem">📄 EasyTier 路由表 <span class="hs-hint">展开查看将被防火墙排除的网段与端口</span></summary><div id="hs_et_body" style="padding:2px 12px 10px"><div class="hs-hint">读取中…</div></div></details>'
    : '')
  + '</div>'
  + '<div class="hs-sec"><h4>国内直通 <span class="hs-hint">中国 IP 内核态放行不进代理,微信/QQ 等提速</span></h4>'
  + R('启用直通', '中国 IP 在防火墙层直接转发;需路由表;国内域名同时返回真实 IP 配合', '<label class="hs-sw"><input type="checkbox" id="hs_chn_sw" ' + (C.cnBypass !== false ? 'checked' : '') + '><span></span></label>')
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
  oldFc.forEach(x => { if (newFc.indexOf(x) < 0) chg.push('强制-删 ' + x) });
  newFc.forEach(x => { if (oldFc.indexOf(x) < 0) chg.push('强制-增 ' + x) });
  await saveConf(); await opLog('设置保存: ' + (chg.join('; ') || '无实际变化'));
  if (autoChanged || d.bootMode !== oldBm) { if (C.autostart) await bootEnable(); else await bootDisable() }
  renderPane();
  /* 分流规则(排除/强制)改动需重写 config 并热重载——此前只存 JSON 不重载,规则从未进引擎 */
  if (df.rules && ST.running && !df.restart) {
    const yaml = genConfigYaml();
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
    title: '配置已修改', html: '<div class="hs-hint">' + esc(what) + ' 需重启引擎才生效,现在平滑重启吗?<br><br>正式版流程:快照→应用→健康验证→失败自动回退。</div>',
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
    await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.geo.exit') + '; nohup sh -c \'curl -sL --connect-timeout 8 ' + (gseq[si].px ? '-x ' + shq(gseq[si].px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(gseq[si].url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.geo.exit') + '\' >/dev/null 2>&1 &', 5000);
    let lastSz = -1, stag = 0;
    for (let t = 0; t < 60; t++) {
      await wait(1500);
      const ex = await run('cat ' + shq(DIR + '/.geo.exit') + ' 2>/dev/null', 3000);
      if ((ex.content || '').trim() !== '') { if ((ex.content || '').trim() === '0') ok = true; break }
      const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
      const sz = pInt(szR);
      if (sz === lastSz) { stag++; if (stag >= 8) { await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000); break } }
      else { stag = 0; lastSz = sz }
      if (t % 3 === 0) btn.textContent = (sz / 1048576).toFixed(1) + 'MB';
    }
  }
  await run('rm -f ' + shq(DIR + '/.geo.exit') + '; for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000);
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
      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.chn.exit') + '; nohup sh -c \'curl -sL --connect-timeout 8 -m 60 ' + (cseq[si].px ? '-x ' + shq(cseq[si].px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(cseq[si].url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.chn.exit') + '\' >/dev/null 2>&1 &', 5000);
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
        if (sz === lastSz) { stag++; if (stag >= 6) { await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000); break } }
        else { stag = 0; lastSz = sz }
      }
      if (!ok) {
        const lc = await run('wc -l < ' + shq(tmpF) + ' 2>/dev/null', 5000);
        if ((pInt(lc)) >= cf.minLines) ok = true;
      }
      await run('rm -f ' + shq(DIR + '/.chn.exit'), 3000);
      if (!ok) await run('rm -f ' + shq(tmpF), 3000);
    }
    /* v1.8.4: v4 失败不再 break——此前顺序中断导致 china6 永远没机会尝试(审计 P0 伴生) */
    if (!ok) { allOk = false; progEnd('❌ ' + cf.name + ' 全部源失败(继续尝试其余表)——可点「上传」手动导入', false); continue }
    await run('mv ' + shq(tmpF) + ' ' + shq(dst), 5000);
    progEnd('✅ ' + cf.name + ' 已下载', true);
  }
  await run('rm -f ' + shq(DIR + '/.chn.exit') + '; for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000);
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
  const msg = '检测到旧版接管组件(' + old.join('/') + ' → ' + V + '),请在配置页完成升级';
  if (typeof createToast === 'function') createToast('⚠️ ' + msg, 'pink', 9000);
  else console.log('[小海关] ' + msg);
  await opLog('升级对账:' + old.join(',') + '(→v' + V + '),待重启引擎');
}
/* 升级弹卡: 打开配置页时若待升级弹一次(每页面会话一次),列更新内容+一键升级 */
let HS_UPG_POPPED = false;
function upgradeCardHtml() {
  const from = ST.upgradeFrom || '1.4.4';
  const entries = Object.keys(CHANGELOG).filter(k => verCmp(k, from) > 0)
    .sort((a, b) => verCmp(b, a)).map(k => '<li style="margin:3px 0"><b>' + k + '</b> ' + esc(CHANGELOG[k]) + '</li>').join('');
  const rolledNote = (C.upgBackup && C.upgBackup.rolledBack) ? '<div class="hs-hint" style="margin-bottom:6px;color:#ffb74d">⚠️ 你此前回滚过(' + esc(C.upgBackup.rolledFrom || '?') + ' 之后),新版本可能已修复当时的问题。</div>' : '';
  return rolledNote + '<div class="hs-hint" style="margin-bottom:6px">盘上接管组件为 <b>' + esc(from) + '</b>,当前插件 <b>' + V + '</b>。插件已是新版,但设备上的接管组件(内核配置/防火墙/启动脚本)仍是旧版——重启引擎即完成更新(几秒,期间接管短暂中断)。本次更新内容:</div>'
    + (entries ? '<ul style="margin:4px 0 8px;padding-left:18px;font-size:.72rem;line-height:1.5">' + entries + '</ul>' : '')
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
          await run('rm -rf ' + shq(UBAK), 5000);
          await engineRestart();
          ST.upgradePending = []; ST.upgradeFrom = rbFrom;
          toast('升级失败已自动回滚到 v' + rbFrom + '(如需重试请重启引擎)', 'orange');
          await opLog('升级失败自动回滚到 ' + rbFrom);
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
    if (!/R=0/.test(cp.content || '')) { toast('备份恢复失败(文件缺失?)', 'red'); return }
    C.upgBackup.rolledBack = true; C.upgBackup.rolledFrom = V;
    await saveConf();
    await run('rm -rf ' + shq(UBAK), 5000); /* 已恢复,备份即清(单份不留) */
    await engineRestart();
    ST.upgradePending = []; ST.upgradeFrom = C.upgBackup.from;
    await opLog('已回滚到 ' + C.upgBackup.from + ',降级运行(新版本插件发布前不再提示升级)');
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
      b.innerHTML = '<div class="hs-hint">未读取到 EasyTier 状态' + (ET_ERR ? '<br>原因: ' + esc(ET_ERR) : '(检查 ET 的「状态文件输出」是否开启)') + '</div>';
      if (ET_ERR) opLog('ET路由表读取失败: ' + ET_ERR);
      return
    }
    const j = ET_CACHE;
    b.innerHTML =
      '<div class="hs-li">' + (j.active ? '<span style="color:#66bb6a">● 组网运行中</span>' : '<span style="color:#9aa3b2">● 组网未运行</span>') + ' · 更新于 ' + esc(j.updated || '?') + '</div>'
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
    p.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copyTo(b.dataset.copy));
    /* 接入设备行:点击展开/收起该设备活动连接 */
    p.querySelectorAll('.hs-dev-hd').forEach(hd => hd.onclick = () => {
      const cons = hd.parentElement && hd.parentElement.querySelector('.hs-dev-cons');
      const chev = hd.querySelector('span:last-child');
      if (!cons) return;
      const open = cons.style.display !== 'none';
      cons.style.display = open ? 'none' : 'block';
      if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
    });
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
    const an = p.querySelector('#hs_sub_addnode'); if (an) an.onclick = () => openAddNodeDlg();
    /* 注意: 标志必须用模块级变量,不能挂在 HS_MANUAL 上——refreshManual 会整体替换数组,挂在数组上的属性会随旧数组丢失,曾导致无限重渲染循环(页面按钮/输入全失灵) */
    if (!HS_MANUAL_LOADED) { HS_MANUAL_LOADED = true; refreshManual().then(() => { if (hsTab === 'sub') renderPane() }).catch(() => { HS_MANUAL_LOADED = false }) }
    if (C.activeSub >= 0 && HS_SUBINFO === undefined) refreshSubInfo().then(() => { if (HS_SUBINFO && hsTab === 'sub') renderPane() });
    p.querySelectorAll('[data-subupd]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.subupd, sb = C.subs[i];
      const oldT = b.textContent;
      b.disabled = true; b.textContent = '下载中…';
      const dl = await downloadSub(i);
      b.disabled = false; b.textContent = oldT;
      if (!dl) { toast('❌ 「' + sb.name + '」下载失败(检查网络/URL)', 'red'); return }
      if (i === C.activeSub && ST.running) {
        await applyWithTxn('更新订阅「' + sb.name + '」');
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
    const sCancel = p.querySelector('#hs_sub_cancel'); if (sCancel) sCancel.onclick = () => { HS_SUB_EDIT = -1; renderPane() };
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
    /* 分流页草稿保存栏 */
    const spsv = p.querySelector('#hs_sp_save'); if (spsv) spsv.onclick = async () => { await trySetSave() };
    const spdc = p.querySelector('#hs_sp_discard'); if (spdc) spdc.onclick = () => { SET_DRAFT = null; toast('已放弃全部修改', 'green'); renderPane() };
    /* v2.2.1: 设备区手动刷新(用户定调:不实时,手动/切页刷新)——活动连接数据随 paneSplit 整页采集,走 renderPane 同路径 */
    const drf = p.querySelector('#hs_dev_rf');
    if (drf) drf.onclick = async () => { drf.style.opacity = '.5'; await renderPane(); toast('设备与活动连接已刷新', 'green') };
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
          const pr = confirmBox({ title: '未检测到 EasyTier 插件', html: '<div class="hs-hint">未同装两者时无需此功能,开关保持关闭即可。<br><br>若你确认已安装 EasyTier,请检查其是否完整安装(内核文件在位)后重试。</div>', okText: '知道了', cancelText: '关闭' });
          await pr; syncBar(); return
        }
        if (r === 'nostate') {
          const pr = confirmBox({
            title: '需先在 EasyTier 开启状态输出',
            html: '<div class="hs-hint">按以下步骤操作后,再回来开启本开关:</div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>①</span><span>打开 EasyTier 插件,进入 设置</span></div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>②</span><span>找到并开启开关:<b>「状态文件输出」</b><div class="hs-hint">供第三方代理读取自动排除组网流量</div></span></div>'
            + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem"><span>③</span><span>回到小海关 分流页,再打开「自动兼容 EasyTier」</span></div>'
            + '<div style="margin-top:8px;text-align:left"><button class="btn hs-sm" id="hs_cox_copy">复制开关名</button></div>',
            okText: '知道了', cancelText: '关闭'
          });
          const cb = $('#hs_cox_copy');
          if (cb) cb.onclick = ev => { ev.stopPropagation(); copyTo('状态文件输出(供第三方代理读取自动排除组网流量)') };
          await pr; syncBar(); return
        }
        if (r === 'badstate') {
          const pr = confirmBox({ title: 'EasyTier 状态文件异常', html: '<div class="hs-hint">文件存在但读不到有效路由(网段/端口)。<br>请到 EasyTier 插件重新开关一次「状态文件输出」后再试。</div>', okText: '知道了', cancelText: '关闭' });
          await pr; syncBar(); return
        }
        e.target.checked = true; setDraft().coexistAuto = true;
        await readEtState();
        if (ET_CACHE && ET_CACHE.active === false) toast('✅ 校验通过;注 EasyTier 当前未运行,组网启动后重启引擎即可生效', 'pink');
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
        const okc = await confirmBox({ title: '发现新版本', html: '<div class="hs-hint">当前 v' + esc(C.ver || '?') + ' → 最新 <b>' + esc(info.tag) + '</b><br><br>直接替换不保留旧版。</div>', okText: '在线更新' });
        if (okc) { onlineInstall() }
      } else { toast('无法获取版本(GitHub 不通);可手动下载后上传', 'red') }
    };
    const uc2 = p.querySelector('#hs_up_core'); if (uc2) uc2.onclick = uploadCore;
    const bc = p.querySelector('#hs_bak_clean'); if (bc) bc.onclick = async () => {
      const okc = await confirmBox({ title: '清理升级备份', danger: true, okText: '清理', html: '<div class="hs-hint">删除 ' + esc(C.upgBackup ? C.upgBackup.from : '') + ' 的组件备份?清理后将无法回滚到该版本。</div>' });
      if (!okc) return;
      await op(null, async () => { await run('rm -rf ' + shq(UBAK), 5000); C.upgBackup = null; await saveConf(); toast('升级备份已清理', 'green'); await opLog('手动清理升级备份'); renderPane(); }, null, '清理中…');
    };
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
        const yml = genConfigYaml(); await writeFile(CFG, yml);
        await apiPut('/configs?force=true', { path: '', payload: yml });
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
  + '<div style="font-size:.76rem;color:#9aa3b2;margin-bottom:12px">设备架构:<b style="color:#7fc9f2">' + esc(arch) + '</b> · 需要文件:<b style="color:#bcd2ff">' + fname + '</b></div>'
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
    + '<div id="hs_prog_text" style="font-size:.72rem;color:#9aa3b2;text-align:center;min-height:1.4em">准备中…</div>'
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
      await run('rm -f ' + shq(tmpF) + ' ' + shq(DIR + '/.dl.exit') + '; nohup sh -c \'curl -sL --connect-timeout 8 ' + (t.px ? '-x ' + shq(t.px) + ' ' : '') + '-o ' + shq(tmpF) + ' ' + shq(t.url) + ' 2>/dev/null; echo $? > ' + shq(DIR + '/.dl.exit') + '\' >/dev/null 2>&1 &', 5000);
      setStep(2);
      let lastSz = -1, stagnant = 0;
      for (let pi = 0; pi < 120 && !cancelled; pi++) { /* pi=轮询序号; 勿命名 t——会遮蔽外层源对象 t,致进度文案 [undefined](2026-09-02 实测) */
        await wait(1500);
        const ex = await run('cat ' + shq(DIR + '/.dl.exit') + ' 2>/dev/null', 3000);
        const exitCode = (ex.content || '').trim();
      if (exitCode !== '') {
          console.log('[小海关] 源', t.name, 'exit:', exitCode, 'size:', lastSz, 'ok:', exitCode === '0');
          if (exitCode === '0' && lastSz > 1024) { ok = true }
          else if (exitCode !== '0') { setTxt(esc(t.name) + ' 失败(exit ' + exitCode + '),换下一个源…') }
          break;
        }
        const szR = await run('wc -c < ' + shq(tmpF) + ' 2>/dev/null', 3000);
        const sz = pInt(szR);
        if (sz === lastSz) { stagnant++; if (stagnant >= 10) { await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000); setTxt('下载停滞,切换下一个源…'); break } }
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
    await run('rm -f ' + shq(DIR + '/.dl.exit'), 3000);
    await run('for P in $(pidof curl); do kill $P; done 2>/dev/null', 3000);
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
  const data = txt || JSON.stringify(C, null, 2);
  const payload = JSON.stringify({ _app: 'xiaohaiguan', _ver: '0.1', exported: nowStr(), conf: JSON.parse(data) }, null, 2);
  dl('customs-配置导出-' + stampStr() + '.json', payload);
  await opLog('配置已导出');
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
        html: '<div class="hs-hint">来源:导出于 ' + esc(j.exported || '?') + '<br>包含:开关/白名单(' + ((nc.devices || []).length) + '台)/订阅(' + ((nc.subs || []).length) + '条)/端口/分流清单等<br><br><b>将完全覆盖当前配置</b>(引擎运行中会询问重启)</div>',
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
  const ok = await confirmBox({
    title: '卸载 小海关', danger: true, okText: '卸载', countdown: 0,
    html: '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" checked id="hs_un_core"><span><b>停止进程,删除内核与规则/自启</b><div class="hs-hint">mihomo 二进制 + HS_* 链 + boot.sh 自启行</div></span></div>'
    + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" id="hs_un_all" checked><span><b>删除全部数据目录</b><div class="hs-hint">内核/配置/订阅/日志,零残留</div></span></div>'
    + '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><input type="checkbox" id="hs_un_exp"><span>卸载前导出配置备份<div class="hs-hint">下载 json,重装时导入恢复</div></span></div>'
    + '<div class="hs-hint" style="margin-top:8px">卸载后执行残留检测,确保网络完全还原</div>'
  });
  if (!ok) return;
  const delAll = $('#hs_un_all') && $('#hs_un_all').checked;
  const doExp = $('#hs_un_exp') && $('#hs_un_exp').checked;
  toast('卸载执行中…', 'green');
  if (doExp) await exportConf();
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
const DG_STEPS = ['采集进程与端口', '连通性测试', 'EasyTier 兼容', '防火墙与残留', '资源占用', '线路与订阅', '汇总'];
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
    const ex = await run('curl -s -m 6 -x http://127.0.0.1:' + C.ports.mixed + ' -o /dev/null -w "%{http_code} %{time_total}" http://www.gstatic.com/generate_204', 10000);
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
    if (C.coexistAuto && et === 'ok') ok('EasyTier 兼容', '自动兼容已开启,状态文件可读', '将自动排除 ET 网段与打洞端口(规则已生效)');
    else if (et === 'badstate') warn('EasyTier 兼容', '状态文件存在但内容异常', '按预期版本读不到有效路由;请在 ET 插件重新开关一次状态文件输出', null);
    else if (et === 'nostate') warn('EasyTier 兼容', 'ET 在位但其「状态文件输出」未开启', '开启自动兼容前需先在 ET 打开输出开关;或忽略', null);
    else if (!C.coexistAuto) warn('EasyTier 兼容', '检测到 EasyTier,自动兼容未开启(默认关闭)', '仅两插件同跑时需要;不开启则组网流量可能被劫持', { id: 'rt-coex', kind: 'confirm', act: '校验 ET 后开启自动兼容' });
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
      const w = await writeFile(tmp, genConfigYaml());
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
  if (ST.running && dim === 'run') {
    /* 接管架构指纹(升级对账同源): 低版本升上来的旧组件在此暴露——旧 yaml(TUN 无 tproxy-port)/
       旧 fw.sh(v1.2.0 前)/旧 start.sh(v1.4.5 前自启不挂规则);修复=重启引擎全量重生成三件套 */
    if (ST.upgradePending === undefined) await upgradeAudit(); /* 诊断独立可跑,不依赖 init 曾执行 */
    if (ST.upgradePending && ST.upgradePending.length) {
      warn('接管架构', '旧版接管组件在用: ' + ST.upgradePending.join('/'), '插件已更新但接管组件(fw/start/yaml)仍是旧版,新版能力不生效;重启引擎即完成升级', { id: 'rt-reboot', kind: 'confirm', act: '重启引擎(全量重生成三件套)' });
    } else {
      ok('接管架构', 'TPROXY v3 组件齐备(fw/start/yaml 指纹核对通过)', '');
    }
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
        const privacyMacs = proxied.filter(d => /^[26ae]/i.test(String(d.mac).trim().charAt(1)));
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
    ok('透明接管', '引擎停止,无接管(正常)', '');
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
      const st = j < i ? 'color:#c8d2e0' : j === i ? 'color:#7fc9f2;font-weight:700' : 'color:#9aa3b2;opacity:.55';
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.74rem;' + st + '">' + icon + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s) + '</span>' + (j === i ? '<span style="font-size:.64rem;opacity:.75;flex:none">检查中…</span>' : '') + '</div>';
    }).join('');
    if (!box.querySelector('#hs_dg_ring')) {
      box.innerHTML = '<div class="hs-pgscroll" style="display:flex;flex-direction:column;align-items:center;padding:18px 14px">'
      + '<div style="position:relative;width:312px;height:312px;flex:none;max-width:100%">'
      + '<svg id="hs_dg_ring" width="312" height="312" viewBox="0 0 312 312" style="position:absolute;left:0;top:0;transform:rotate(-90deg)">'
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
  const fixable = HS_DIAG.items.filter(it => it.fix && !it.fixed);
  const tag = f => f.kind === 'auto' ? '<span class="hs-tag y">可修复</span>' : f.kind === 'confirm' ? '<span class="hs-tag o">需确认</span>' : f.kind === 'manual' ? '<span class="hs-tag o">需手动</span>' : '<span class="hs-tag y">参数</span>';
  let h = '<div class="hs-hint" style="margin-bottom:8px">状态:' + (ST.running ? '🟢 运行中' : '⚪ 已停止') + ' · ' + esc(HS_DIAG.t) + ' · 只读</div>';
  groups.forEach(g => {
    const its = HS_DIAG.items.filter(it => it.g === g);
    const bad = its.filter(it => it.lv !== 'ok' && !it.fixed).length;
    h += '<div class="hs-dg"><div class="hs-dgh"><span>' + esc(g) + '</span><span>' + (bad ? '⚠️ ' + bad : '✅') + '</span></div>';
    its.forEach(it => {
      h += '<div class="hs-dgi"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap"><span>' + (it.fixed ? '✅' : it.lv === 'ok' ? '✅' : '⚠️') + '</span><span>' + esc(it.t) + (it.fixed ? '(已修复)' : '') + '</span>' + (it.fix && !it.fixed ? tag(it.fix) : '') + '</div>'
      + (it.d ? '<div style="color:#9aa3b2;font-size:.7rem;margin-top:3px;padding-left:21px">' + esc(it.d) + '</div>' : '')
      + (it.fix && !it.fixed ? '<div style="margin:5px 0 0 21px;background:rgba(79,140,255,.08);border-left:3px solid #7fc9f2;border-radius:0 8px 8px 0;padding:6px 9px;font-size:.72rem;color:#bcd2ff">修复:' + esc(it.fix.act) + '</div>' : '')
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
    let t = '小海关 诊断报告\n时间: ' + HS_DIAG.t + '\n状态: ' + (ST.running ? '运行态' : '停止态') + '\n\n';
    HS_DIAG.items.forEach(i => { t += '[' + (i.lv === 'ok' ? 'OK' : '!!') + '] ' + i.g + ' / ' + i.t + '\n' + (i.d ? '    ' + i.d + '\n' : '') });
    dl('小海关-诊断报告-' + stampStr() + '.log', t);
  };
  $('#hs_dg_fix').onclick = doRepair;
}
async function doRepair() {
  /* 一键修复只收可自动执行的项(auto/confirm/param);manual=引导用户手动操作,不进队列 */
  const pend = HS_DIAG.items.filter(it => it.fix && !it.fixed && it.fix.kind !== 'manual');
  if (!pend.length) { toast('无可修复项', 'green'); return }
  let cl = '';
  pend.forEach(it => { cl += '<div style="display:flex;gap:8px;margin:7px 0;font-size:.76rem;align-items:flex-start"><span>' + (it.fix.kind === 'auto' ? '<span class="hs-tag y">自动</span>' : it.fix.kind === 'confirm' ? '<span class="hs-tag o">确认</span>' : '<span class="hs-tag y">参数</span>') + '</span><span>' + esc(it.t) + '<div class="hs-hint">' + esc(it.fix.act) + '</div></span></div>' });
  const okc = await confirmBox({ title: '一键修复(' + pend.length + ' 项)', html: cl + '<div class="hs-hint" style="margin-top:8px">修复完成后自动复诊</div>', okText: '执行' });
  if (!okc) return;
  const paramItem = pend.find(it => it.fix.kind === 'param');
  let pvals = null;
  if (paramItem) { pvals = await paramEditor(paramItem.fix.keys); if (!pvals) return }
  for (const it of pend) {
    try {
    if (it.fix.id === 'st-chain') await fwClean();
    else if (it.fix.id === 'st-tun') await run('ip link del ' + shq(C.tunName) + ' 2>/dev/null', 5000);
    else if (it.fix.id === 'st-ports') { /* 参数页处理 */ }
    else if (it.fix.id === 'rt-mem' || it.fix.id === 'rt-port') await engineRestart();
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
    else if (it.fix.id === 'rt-line') { const yaml = genConfigYaml(); await writeFile(CFG, yaml); const okp = await apiPut('/configs?force=true', { path: '', payload: yaml }); if (!okp) toast('线路配置热重载失败,建议重启引擎', 'red'); }
    /* ⑥ 重写配置并热重载(规则集重新生成/合成;apiPut 404 等以 toast 提示,复诊兜底) */
    else if (it.fix.id === 'rt-prov') { const yaml = genConfigYaml(); await writeFile(CFG, yaml); const okp = await apiPut('/configs?force=true', { path: '', payload: yaml }); if (!okp) toast('规则集热重载失败，建议重启引擎', 'red'); }
    else if (it.fix.id === 'st-dns') await reapplyFw();
    else if (it.fix.id === 'log-trunc') { await run(': > ' + shq(LOGF) + ' 2>/dev/null', 5000); ST.rlog = 0 }
    else if (it.fix.id === 'cfg-lineref') { C.devices.forEach(d => { if (d.line && !(C.lines || []).some(L => L && L.id === d.line)) d.line = '' }); await saveConf(); }
    else if (it.fix.id === 'rt-coex') {
      const r = await etCheck();
      if (r === 'ok') { C.coexistAuto = true; await saveConf() }
      else { toast('校验未通过(' + ({ noinstall: '未装 ET', nostate: 'ET 输出未开', badstate: 'ET 状态文件异常' })[r] + '),该项跳过', 'red'); it.skip = true; continue }
    }
    it.fixed = true;
    } catch (err) {
      it.fixed = false;
      toast('「' + it.t + '」修复失败:' + esc(String((err && err.message) || err).slice(0, 50)), 'red');
      await opLog('修复失败[' + it.fix.id + ']:' + String((err && err.message) || err).slice(0, 80));
    }
  }
  if (pvals) { Object.assign(C.ports, pvals); await saveConf(); toast('端口参数已保存:' + Object.keys(pvals).map(k => pvals[k]).join('/'), 'green') }
  toast('修复完成,2 秒后自动复诊…', 'green');
  await wait(2000);
  /* 用户已关闭诊断弹窗则不再打扰 */
  const dm = $('#hs_modal_diag');
  if (!dm || dm.style.display === 'none') return;
  await runDiag();
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
    }
  }
  renderCard();
  console.log('[小海关] init 完成');
  } catch (e) { console.error('[小海关] init 异常:', e) }
}
init();
})()
