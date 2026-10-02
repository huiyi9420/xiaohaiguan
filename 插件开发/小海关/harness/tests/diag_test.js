/* 体检八项(①-⑧ v1.8.6)验收断言:静态源码锚点 + playwright 四场景行为
   静态段在 v1.8.6 落码前会失败——属预期;全套门禁在实施完成后由主流程统一运行 */
const { chromium } = require('playwright-core');
const { STUB_URL, EXE, SRC: SRC_PATH } = require('../util');
const SRC = require('fs').readFileSync(SRC_PATH, 'utf8');
let fails = 0;
const t = (n, ok) => { console.log((ok ? '✅' : '❌') + ' ' + n); if (!ok) fails++; };
const cnt = re => (SRC.match(re) || []).length;

/* ========== 1. 静态断言(八项实现锚点) ========== */
t("版本 V='2.2.1'", /const V\s*=\s*'2\.2\.1'/.test(SRC));
/* v2.2.1 活动连接展示重做(87条同目标真机实证) */
t('v2.2.1 同目标聚合(agg 对象+×N 计数)', SRC.includes('const agg = {};') && SRC.includes('t.n > 1') && SRC.includes("t.n + '条"));
t('v2.2.1 机场信息节点识别(ℹ️ 替代裸文案)', SRC.includes('ℹ️ 信息节点') && /剩余流量\|到期/.test(SRC));
t('v2.2.1 网关视角说明(隧道外层解释)', SRC.includes('只能看到其隧道目标'));
t('v2.2.1 设备区手动刷新(⟳ 走 renderPane 同路径)', SRC.includes('id="hs_dev_rf"') && SRC.includes("drf.onclick = async () => { drf.style.opacity"));
t('v2.2.1 单按钮运行态改圆点(绿●运行/灰●停止,三角▶已废)', SRC.includes("'<span style=\"color:#66bb6a\">\u25cf</span> \u5c0f\u6d77\u5173'") && !/小海关▶/.test(SRC));
/* v2.2.0 按钮可点性统一 */
t('v2.2.0 hs-act 动作按钮档位(亮框+微底+warn 变体)', SRC.includes('.hs-act{display:inline-flex') && SRC.includes('.hs-act.warn{border-color:rgba(255,183,77,.6)'));
t('v2.2.0 本机代理按钮升级为 hs-act(不再是无边框文字标签)', /id="hs_s2keep"/.test(SRC) && !/hs_s2keep" style="padding:1px 7px/.test(SRC));
t('v2.2.0 待升级徽标升级为可点按钮(hs-act warn+查看)', SRC.includes('id="hs_upg_badge" class="hs-act warn"'));
t('v2.2.0 节点页切换引导句', SRC.includes('点节点胶囊即切换'));
t('v2.2.0 按钮内联样式收编(命名类在位)', SRC.includes('.hs-btn-xs{') && SRC.includes('.hs-btn-right{') && SRC.includes('.hs-btn-fill{'));
/* v2.1.11 升级进度窗一闪而过修复(hs_upg_go 不再先关后开同容器) */
t('v2.1.11 立即升级不再先 mHide(同容器先关后开被面板压制,v2.1.4 同型漏修)', !/\$\('#hs_upg_go'\)\.onclick = async \(\) => \{\s*\n\s*mHide\('hs_modal_simple'\); rmUpgMask\(\);\s*\n\s*if \(!ST\.running\)/.test(SRC));
t('v2.1.11 引擎未运行分支仍先关窗(无后续开窗,安全)', /if \(!ST\.running\) \{ mHide\('hs_modal_simple'\); rmUpgMask\(\); toast/.test(SRC));
/* v2.1.10 「自动兼容 EasyTier」开关绑错分支修复(行序断言:绑定必须在 split 分支内) */
t('v2.1.10 cox 绑定位于 split 分支(在 if(split) 与 if(set) 之间)', (() => {
  const L = SRC.split('\n');
  const iSp = L.findIndex(l => l.includes("if (tab === 'split')"));
  const iSet = L.findIndex(l => l.includes("if (tab === 'set')"));
  const iCox = L.findIndex(l => l.includes("const cox = p.querySelector('#hs_set_cox')"));
  return iSp >= 0 && iSet > iSp && iCox > iSp && iCox < iSet;
})());
t('v2.1.10 cox 自检链完整(etCheck 三分支+通过写草稿)', SRC.includes("await etCheck();") && SRC.includes("setDraft().coexistAuto = true") && SRC.includes('需先在 EasyTier 开启状态输出'));
/* v2.1.9 使用说明入口重设计(状态页引导条+设置页帮助区,撤标题行图标) */
t('v2.1.9 GUIDE_URL 常量(引导页地址)', SRC.includes("const GUIDE_URL = 'https://artificial-lavender-zhzg63cn.edgeone.dev/'"));
t('v2.1.9 状态页引导条(新手第一屏)', SRC.includes('id="hs_ov_guide"') && SRC.includes('第一次使用小海关'));
t('v2.1.9 设置页帮助区(正式入口)', SRC.includes('id="hs_set_guide"') && SRC.includes("R('使用说明'"));
t('v2.1.9 两处入口均带 noopener', (SRC.match(/window\.open\(GUIDE_URL, '_blank', 'noopener'\)/g) || []).length >= 2);
t('v2.1.9 标题行孤立图标已撤(hs_help_link/extraHead 零残留)', !SRC.includes('hs_help_link') && !SRC.includes('extraHead'));
/* v2.1.7 审查加固:弹窗 CSS 文档对齐 + 产物旧词汇清零 */
t('v2.1.7 弹窗宽度 92vw 上限(基础与大窗)', SRC.includes('width:min(92vw,580px)') && SRC.includes('width:min(92vw,680px)'));
t('v2.1.7 无固定高度弹窗(旧 height:80/84/90vh 已删,断点改 max-height)', !/(?<!max-)height:(80|84|90)vh/.test(SRC) && SRC.includes('max-height:84vh') && SRC.includes('max-height:80vh'));
t('v2.1.7 CHANGELOG 文案零旧平台词汇(裸KANO/runShellWithRoot)', !/'[0-9.]+':[^'\n]*(KANO|runShellWithRoot)/.test(SRC));
/* v2.1.6 磁盘检测折行误报修复(真机实证:报 0.0MB 实为 1.6G) */
t('v2.1.6 df 按挂载点取 $(NF-2)(折行设备名形态正确)', SRC.includes('$NF=="/data" || $NF=="/overlay" {print $(NF-2)}'));
t('v2.1.6 荒谬读数滤除(<1MB 物理不可能)', cnt(/n >= 1024\)/) >= 1 && cnt(/x >= 1024\)/) >= 1);
t('v2.1.6 旧口径(tail -n1+固定$4)已删', !SRC.includes("tail -n1 | awk '{print $4}'"));
/* v2.1.5 升级死循环+磁盘满修复(真机:F=0 S/Y 齐→自动回滚循环;诊断磁盘 0.0MB) */
t('v2.1.5 无接管升级补写 fw.sh(只写不执行)', SRC.includes('if (wasUpgrade) {\n      const wfw = await writeFile(FW, genFwSh());'));
t('v2.1.5 磁盘预检函数', SRC.includes('async function hsDiskKB()') && SRC.includes('async function hsCleanJunk()'));
t('v2.1.5 启动预检阈值 5MB', SRC.includes('freeKB < 5120'));
t('v2.1.5 下载预检阈值 45MB', SRC.includes('dKB < 46080'));
t('v2.1.5 清理清单含 .dl/.dl.gz/mihomo.tmp/.bak', SRC.includes('rm -f *.dl *.dl.gz mihomo.tmp .dl.exit .pf.exit fw.sh.bak start.sh.bak config.yaml.bak conf.json.bak'));
/* v2.1.4 在线下载进度窗真机修复(全程隐形/只提示安装中无下文) */
t('v2.1.4 引导→在线下载不再先 mHide 同弹窗(同tick关后开=面板关窗收尾压制)', !/\$\('#hs_ig_online'\)\.onclick = \(\) => \{ mHide\('hs_modal_simple'\); onlineInstall/.test(SRC));
t('v2.1.4 失败回引导页不再先 mHide', !/await wait\(1500\); mHide\('hs_modal_simple'\);\s*\n\s*openInstallGuide\(true\)/.test(SRC));
t('v2.1.4 busy 守卫切回进度窗(不再只 toast)', SRC.includes("安装进行中——已切回进度窗口"));
t('v2.1.4 openInstallGuide 安装中不覆盖进度 DOM', SRC.includes("hsInstBusy && !afterFail && $('#hs_prog_text')"));
t('v2.1.4 完成段进度按钮判空(headless 装完不 TypeError)', SRC.includes("const pcb = $('#hs_prog_cancel'); if (pcb)"));
/* v2.0.3 操作日志解耦 */
t('opLog 常开(无 logEnabled 门控)', SRC.includes('操作日志改为默认常开'));
/* v2.0.2 内核下载链国内可用性 */
t('自定义内核源字段(DEF)', SRC.includes('kernelMirror: \'\''));
t('版本化资产名拼接(网盘/Gitee/GitHub 三处)', SRC.includes("mihomo-linux-' + hsArch + '-' + (tag || 'latest') + '.gz") && SRC.includes("hsArch + '-' + tag + '.gz'"));
t('jsDelivr 版本查询兜底', SRC.includes('data.jsdelivr.com/v1/packages/gh/'));
t('源序列:自定义源置顶', SRC.includes("C.kernelMirror ? [{ name: '自定义源', url: C.kernelMirror, px: '' }] : []"));
t('旧无版本号 fallback 已删(404 资产名,注释提及不算)', !/'latest\/download\/mihomo-linux-/.test(SRC));
t('失败回引导带告警(openInstallGuide(true))', SRC.includes('openInstallGuide(true)'));
t('引导页自定义源输入框', SRC.includes('id="hs_ig_mirror"'));
/* v1.9.1 采集解析正则回归: 字段名含数字(CHN6/N4/N6)必须能匹配 */
t('采集解析正则兼容数字字段名([A-Z0-9])', SRC.includes('l.match(/^=([A-Z0-9]+)=(.*)$/)'));
const __mm = '=CHN6=3443'.match(/^=([A-Z0-9]+)=(.*)$/);
t('解析正则实测 CHN6 行可匹配', !!__mm && __mm[1] === 'CHN6' && __mm[2] === '3443');
/* ⑧ UDP TPROXY 双模: s1/s2 自包门控 + TUN 降级 + .tpmode 痕迹文件 */
t('⑧ .tpmode 落盘(fw.sh 生成段)', SRC.includes('echo "TPM=$TPROXY_MODE TPM6=$TP6" > $D/.tpmode'));
t('⑧ .tpmode 清理', SRC.includes('rm -f $D/.tpmode'));
t('⑧ 门控与 tm 解析同一行前缀(s1=off 时不读罐头 TPM)', SRC.includes("if (C.s1 !== 'off' || C.s2) { const tm = fwOut.match(/TPM=(\\d) TPM6=(\\d)/)"));
t("⑧ TPM=1 才算全量接管", SRC.includes("tm[1] === '1'"));
t("⑧ TPM6=0 判降级", SRC.includes("tm[2] === '0'"));
t("⑧ 无 TPM6='0' 赋值笔误", !SRC.includes("TPM6='0'"));
t('⑧ 无 TPM6=1? 笔误', !SRC.includes('TPM6=1?'));
t('⑧ 状态命令不截断(status 调用行无 head -5)', (() => { const L = SRC.split('\n'); const i = L.findIndex(l => l.includes("shq(FW) + ' status")); return i >= 0 && !L[i].includes('| head -5'); })());
/* ⑤ 国内直通对账 */
t('⑤ fw.sh status 回显 CN4(对账实际值源)', SRC.includes('echo CN4=$(ipset list hs_cn'));
t("⑤ fix 项 rt-cnrec", SRC.includes("id: 'rt-cnrec'"));
t('⑤ rt-cnrec 有 doRepair 分支', SRC.includes("fix.id === 'rt-cnrec'"));
t("⑤ rt-cnrec kind confirm(需用户确认)", /id: 'rt-cnrec', kind: 'confirm'/.test(SRC));
t('⑤ 对账门控(cnBypass×s1×s2)', SRC.includes("C.cnBypass !== false && (C.s1 !== 'off' || C.s2)"));
t('⑤ 对账容差 ±3', SRC.includes('a4 < e4 - 3'));
t('③ boot 单路径自启行未破坏', SRC.includes("[ -f ' + START + ' ] && sh ' + START + ' # plugins/customs'"));
t('③ 1.x 盲挂检测已删(bootLegacyChkCmd/bootSanitize 零残留,v2.0.7 旧平台兼容清除)', !SRC.includes('bootLegacyChkCmd') && !SRC.includes('async function bootSanitize'));
/* ② 旧版盲挂残留(v4/v6 同口径) */
t('② ip -6 rule 计数口径 ≥2 处(checkResidue+诊断同锁)', cnt(/ip -6 rule show 2>\/dev\/null \| grep -c/g) >= 2);
t('② ip6tables nat -S 计数口径 ≥2 处', cnt(/ip6tables -t nat -S 2>\/dev\/null[^\n'"]*?grep -vc/g) >= 2);
t('② 标题含 (v4/v6)', SRC.includes('(v4/v6)'));
/* ① v6 国内直通 */
t('① hs_cn6 体检', SRC.includes('ipset list hs_cn6'));
t('① v6 未生效文案', SRC.includes('v6 国内直通未生效'));
t('① 内置三网大段兜底', SRC.includes('内置三网大段兜底'));
/* ④ 地理数据完整性 */
t('④ 地理数据体检(warn+双阈值+入口指引)', SRC.includes("warn('地理数据'") && SRC.includes('2097152') && SRC.includes('524288') && SRC.includes('设置→地理数据'));
/* ⑥ 规则集 provider */
t('⑥ providers/rules 接口体检', SRC.includes('/providers/rules'));
t("⑥ fix 项 rt-prov", SRC.includes("id: 'rt-prov'"));
t('⑥ rt-prov 有 doRepair 分支', SRC.includes("fix.id === 'rt-prov'"));
t("⑥ rt-prov kind confirm", /id: 'rt-prov', kind: 'confirm'/.test(SRC));
t('⑥ 无 rules 订阅防御取块(不崩)', SRC.includes("sb && sb.blocks && sb.blocks['rule-providers']"));
/* ⑦ 磁盘 */
t('⑦ 磁盘体检(df -k /data,20MB 阈值)', SRC.includes('df -k /data') && SRC.includes('20480'));
/* 三新 fix id 全有 doRepair 分支 */
t('两 fix id(rt-cnrec/rt-prov)全有 doRepair 分支', ['rt-cnrec', 'rt-prov'].every(id => SRC.includes("fix.id === '" + id + "'")));

/* ========== 2. 动态:四场景(playwright) ========== */
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const txt = p => p.evaluate(() => document.body.textContent);
  /* 注入插件(先按场景置 localStorage 再 reload,hs_ov 在 stub 载入时覆写 __conf) */
  const load = async (p, setup) => {
    await p.goto(STUB_URL);
    if (setup) await p.evaluate(setup);
    await p.reload();
    await p.addScriptTag({ content: SRC });
    await p.waitForTimeout(3000);
  };
  /* 进诊断: 卡片状态行 → 状态页操作栏「诊断」→ 开始诊断 → 等报告(#hs_dg_fix 出现=done 态,runDiag 约 5s+) */
  const goDiag = async p => {
    await p.evaluate(() => { document.querySelector('#hs_status').click(); });
    await p.waitForTimeout(800);
    await p.evaluate(() => { const b = document.querySelector('#hs_mf_diag'); if (b) b.click(); });
    await p.waitForTimeout(600);
    await p.evaluate(() => { const b = document.querySelector('#hs_dg_go'); if (b) b.click(); });
    await p.waitForSelector('#hs_dg_fix', { timeout: 60000 });
    await p.waitForTimeout(500);
  };
  /* done 态报告头(含诊断时间戳,复诊后必然变化) */
  const diagHdr = p => p.evaluate(() => { const el = document.querySelector('#hs_diag_pane .hs-pgscroll > .hs-hint'); return el ? el.textContent : ''; });

  /* 场景 A 健康态(默认 stub): 全部 ok 文案在报告里 */
  {
    const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
    p.on('pageerror', e => console.log('PAGEERROR(A):', e.message));
    await load(p);
    await goDiag(p);
    const s = await txt(p);
    t('A 对账一致', s.includes('对账一致'));
    t('A 国内直通组含内置三网大段兜底', s.includes('内置三网大段兜底'));
    t('A v6 hs_cn6 挂载详情(① 追加形态)', s.includes('v6: hs_cn6 4 条已挂载'));
    t('A china_ip 规则集已加载(8600 条)', s.includes('china_ip 规则集已加载(8600 条)'));
    t('A UDP TPROXY 正常(v4+v6)', s.includes('UDP TPROXY 正常(v4+v6)'));
    t('A 1.x 盲挂体检项已移除(报告不再出现旧版痕迹文案)', !s.includes('旧版盲挂'));
    t('A 完整性校验通过', s.includes('完整性校验通过'));
    t('A 磁盘剩余', s.includes('磁盘剩余'));
    await p.close();
  }

  /* 场景 B 故障态 + 一键修复: 六个 stub 故障位全开 → 各 warn 文案 → 确认修复 → 命令落队 → 2s 自动复诊 */
  {
    const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
    p.on('pageerror', e => console.log('PAGEERROR(B):', e.message));
    await load(p, () => {
      localStorage.setItem('hs_ipset_bad', '1');
      localStorage.setItem('hs_tpm', '0');
      localStorage.setItem('hs_df_low', '1');
      localStorage.setItem('hs_rp_bad', '1');
      localStorage.setItem('hs_cnrec', '1');
      localStorage.setItem('hs_geo_small', '1');
    });
    await goDiag(p);
    const s = await txt(p);
    t('B v6 国内直通未生效', s.includes('v6 国内直通未生效'));
    t('B TUN 降级+v6 UDP 未接管+需手动', s.includes('TUN 降级') && s.includes('v6 UDP 未接管') && s.includes('需手动'));
    t('B 磁盘剩余仅 10.0MB(<20MB)+需手动', s.includes('磁盘剩余仅 10.0MB(<20MB)') && s.includes('需手动'));
    t('B 地理数据过小告警(仅+需手动)', s.includes('仅 1.0MB') && s.includes('需手动'));
    t('B china_ip 规则集未加载', s.includes('china_ip 规则集未加载'));
    t('B 对账对不上+需确认', s.includes('对不上') && s.includes('需确认'));
    /* 一键修复: confirmBox 确认 → ③ auto/⑤ confirm 修复命令进队列 */
    const hdr0 = await diagHdr(p);
    await p.evaluate(() => { const b = document.querySelector('#hs_dg_fix'); if (b && !b.disabled) b.click(); });
    await p.waitForSelector('#hs_cf_ok', { timeout: 10000 });
    await p.evaluate(() => { document.querySelector('#hs_cf_ok').click(); });
    let q = '';
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(500);
      q = await p.evaluate(() => (window.__runQ || []).join('\n'));
      if (/fw\.sh'? apply/.test(q) && q.includes('configs?force=true')) break;
    }
    t('⑥ rt-prov 修复热重载(configs?force=true 进队列)', q.includes('configs?force=true'));
    t('⑥ __lastCfg 已重写', (await p.evaluate(() => (window.__lastCfg || '').length)) > 1000);
    t('⑤ fw.sh apply 经确认执行', /fw\.sh'? apply/.test(q));
    /* doRepair 尾部 2s 后自动复诊: 报告头时间戳更新=新报告已渲染 */
    let upd = false;
    for (let i = 0; i < 30; i++) {
      await p.waitForTimeout(1000);
      const h = await diagHdr(p);
      if (h && h !== hdr0 && h.includes('只读')) { upd = true; break; }
    }
    t('B 修复后 2s 自动复诊报告更新', upd);
    await p.close();
  }

  /* 场景 C 门控回归: s1=off(白名单关) → ⑤⑧ 两组整体不出——
     stub status 罐头在 s1=off 下仍回 TPM=1,⑧若漏加自包门控会出「UDP TPROXY 正常」,此处必挂 */
  {
    const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
    p.on('pageerror', e => console.log('PAGEERROR(C):', e.message));
    await load(p, () => {
      localStorage.setItem('hs_ov', JSON.stringify({ s1: 'off' }));
      localStorage.setItem('hs_run', '1');
    });
    await goDiag(p);
    const s = await txt(p);
    t('C s1=off 不出「国内直通对账」组(⑤门控)', !s.includes('国内直通对账'));
    t('C s1=off 不出「UDP 接管」组(⑧门控)', !s.includes('UDP 接管'));
    await p.close();
  }

  /* 场景 D 崩溃回归: 直通模式 + 仅 proxies 无 rules 的订阅 yaml → ⑥ TypeError 不得复现 */
  {
    const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
    let pgerr = 0;
    p.on('pageerror', e => { pgerr++; console.log('PAGEERROR(D):', e.message); });
    await load(p, () => {
      localStorage.setItem('hs_ov', JSON.stringify({ policySrc: 'direct' }));
      localStorage.setItem('hs_sub_norules', '1');
    });
    await goDiag(p);
    const s = await txt(p);
    t('D pageerror 零捕获', pgerr === 0);
    t('D 报告渲染完成(#hs_dg_fix 出现,不卡 run 态)', await p.evaluate(() => !!document.querySelector('#hs_dg_fix')));
    t('D 不出「订阅规则集未加载」(期望键为空属正常跳过)', !s.includes('订阅规则集未加载'));
    await p.close();
  }

  /* 场景 E 停止态残留: hs_run='0' + hs_residue=1(仅 v6 nat 段非零) → 规则残留组走 v6 口径 */
  {
    const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
    p.on('pageerror', e => console.log('PAGEERROR(E):', e.message));
    await load(p, () => {
      localStorage.setItem('hs_run', '0');
      localStorage.setItem('hs_residue', '1');
    });
    await goDiag(p);
    const s = await txt(p);
    t('E 停止态规则残留标题含 (v4/v6)', s.includes('HS_* 链或策略路由表 100 残留(v4/v6)'));
    t('E 详情含 v6 黑洞说明', s.includes('v6 残留同样把流量送进已停止的代理端口'));
    await p.close();
  }

  await browser.close();
  console.log('----');
  console.log(fails ? (fails + ' 项失败') : 'ALL CLEAN');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
