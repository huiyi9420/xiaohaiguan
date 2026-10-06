const { chromium } = require('playwright-core');
const { STUB_URL, EXE, SRC: SRC_PATH, SOURCE_TEXT: SRC } = require('../util');
const BUNDLE = require('fs').readFileSync(SRC_PATH, 'utf8');
let fails = 0;
const t = (n, ok) => { console.log((ok ? '✅' : '❌') + ' ' + n); if (!ok) fails++; };

/* ========== 1. 静态断言(修复点必须在位) ========== */
t('rt-v6 修复动作已改为 fwClean+reapplyFw', SRC.includes("it.fix.id === 'rt-v6') { await fwClean(); await reapplyFw(); }"));
t('无 FORWARD DROP 可执行调用(注释提及不算)', !SRC.includes("run('ip6tables -I FORWARD -j DROP"));
t('boot 行不再 sleep 2 盲挂', !SRC.includes("' && sleep 2 && sh ' + FW + ' apply"));
t('boot 行保留单路径自启', SRC.includes("[ -f ' + START + ' ] && sh ' + START + ' # plugins/customs'"));
t('start.sh 单实例守卫(v2.9.x 文案无空格)', SRC.includes('already running:$HS_P'));
t('ETNETS6 分桶存在', SRC.includes("ETNETS6="));
t('sanitizeConf 定义与两处调用', SRC.includes('function sanitizeConf()') && (SRC.match(/sanitizeConf\(\);/g) || []).length >= 2);
t('readEtState 过滤 cidrs/ports', SRC.includes('ET_CACHE.cidrs6 = rawC.filter') && SRC.includes('n >= 1 && n <= 65535'));
t('preflightDl 最终尺寸复测', SRC.includes('const finSz = done ? pInt('));
t('createFixedToast 按文档签名', SRC.includes("createFixedToast('hs_dup_warn'"));
t('debug 定时器级别校验', SRC.includes("if (C.logLevel !== 'debug') return;"));
t('合并订阅解析归一(v2.9.x 管线:规范缩进2空格+重序列化)', SRC.includes('规范缩进(2 空格)') && SRC.includes('重序列化'));
t('direct 直通消费重序列化产物(v2.9.x 管线化)', SRC.includes('重序列化'));
t('探测 in-flight 守卫', SRC.includes('if (HS_UDP_BUSY) return HS_UDP_OK;'));
t('设备采集 in-flight 守卫', SRC.includes('hsDevBusy = true;'));
t('总览刷新冷却时间戳', SRC.includes('HS_OV_RF_AT = Date.now()'));
t('残留检测含 v6 口径', SRC.includes("ip6tables -t nat -S 2>/dev/null | grep HS_ | grep -vc") && SRC.includes("ip -6 rule show 2>/dev/null | grep -c"));
t('fwClean 解析 VERIFY', SRC.includes("split('---VERIFY---')[1]"));
t('ipset awk 掩码收紧', SRC.includes("a[2]<=32") && SRC.includes("a[2]<=128"));
t('bootPreflight 前移 refreshManual', SRC.includes('if (!HS_MANUAL_LOADED) await refreshManual();'));
t('device online 标记保留', SRC.includes('online: false });'));

/* ========== 1b. ZWRT 1.0.0 平台适配静态断言(源码适配完成前失败属预期,全套门禁由主流程统一跑) ========== */
t('ZWRT: 零 KANO_PLUGIN/KANO_META 残留(KANO_baseURL 为 ZWRT 平台全局,豁免)', !SRC.includes('KANO_PLUGIN') && !SRC.includes('KANO_META'));
t('ZWRT: 无旧包裹标记 //<script> 与 //</script', !SRC.includes('//<script>') && !SRC.includes('//</script'));
t("ZWRT: BOOT_SH 迁移 /data/plugins/ufi_tools_boot.sh", /const BOOT_SH\s*=\s*'\/data\/plugins\/ufi_tools_boot\.sh'/.test(SRC));
t('ZWRT: 全源码 /sdcard 出现 0 次', (SRC.match(/\/sdcard/g) || []).length === 0);
t('ZWRT: 源码无 window.runShellWithRoot 引用(§5.1 不得依赖页面全局,v1.6.7 原生优先分支已删)', !/window\s*\.\s*runShellWithRoot/.test(SRC) && SRC.includes('const run = (cmd, t) => hsRunShell(cmd, t);'));
const _beS = SRC.indexOf('async function bootEnable'), _beE = SRC.indexOf('async function bootDisable');
const _bootEnable = (_beS >= 0 && _beE > _beS) ? SRC.slice(_beS, _beE) : '';
t('ZWRT: bootEnable 为 grep -qF 去重+chmod 700(不再 sed 重写)', _bootEnable.includes('grep -qF') && _bootEnable.includes('chmod 700') && !_bootEnable.includes('sed '));
t('ZWRT: 旧 run 通道上传 hsUploadByRun 已移除,改 fetch upload_file', !SRC.includes('hsUploadByRun') && SRC.includes("base + '/upload_file'"));
t("ZWRT: F1 优先级陷阱负门禁(无 '/api' + '/upload_file' bug 形态)", !SRC.includes("'/api' + '/upload_file'"));
t("ZWRT: 挂载等 DOM 锚点就绪 waitFor('.functions-container'", SRC.includes("waitFor('.functions-container'"));

/* ========== 2. 动态: 恶意配置注入面 ========== */
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const p = await browser.newPage();
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await p.goto(STUB_URL);
  await p.evaluate(() => {
    localStorage.setItem('hs_run', '1');
    localStorage.setItem('hs_ov', JSON.stringify({
      ports: { mixed: '7890; touch /tmp/HS_INJECT', redir: 99999, dns: 'abc' },
      tunName: 'hs0; touch /tmp/HS_INJECT2',
      secret: 'x"; touch /tmp/HS_INJECT3; echo "',
      devices: [ { mac: 'aa:bb:cc:dd:ee:03', ip: '1.1.1.1"; touch /tmp/HS_INJECT4; echo "', name: 'evil', proxy: true, line: '' } ]
    }));
  });
  await p.reload();
  await p.addScriptTag({ content: BUNDLE });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.querySelector('#hs_status').click(); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const b = document.querySelector('#hs_mf_restart'); if (b) b.click(); });
  let fw = '', cfg = '';
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(2000); fw = await p.evaluate(() => window.__fwTxt || ''); cfg = await p.evaluate(() => window.__lastCfg || ''); if (fw && cfg) break; }
  t('截获 fw.sh/config.yaml', fw.length > 3000 && cfg.length > 500);
  t('端口注入被拦(无 HS_INJECT)', !fw.includes('HS_INJECT') && !cfg.includes('HS_INJECT'));
  t('TUN 名注入被拦', !fw.includes('HS_INJECT2') && /TUN=hs0\b/.test(fw));
  t('端口非法值回落默认(fw 内 7890/7892/1053 合法数值)', /REDIR=7892\b/.test(fw) && !/REDIR=\d+\./.test(fw));
  t('secret 注入被拦(重新生成 hs_ 前缀)', !cfg.includes('HS_INJECT3') && /secret: "hs_[a-z0-9]+"/.test(cfg));
  const devRows = await p.evaluate(() => 0);
  await browser.close();

  /* ========== 3. 动态: 离网设备保留(合并式采集) ========== */
  const b2 = await chromium.launch({ executablePath: EXE });
  const p2 = await b2.newPage({ viewport: { width: 430, height: 900 } });
  await p2.goto(STUB_URL);
  await p2.evaluate(() => {
    localStorage.setItem('hs_run', '1');
    localStorage.setItem('hs_ov', JSON.stringify({ devices: [
      { mac: 'aa:bb:cc:dd:ee:01', ip: '192.168.0.10', name: 'iPhone15Pro', proxy: true, line: '' },
      { mac: 'aa:bb:cc:dd:ee:20', ip: '192.168.0.99', name: '离网旧机', proxy: true, line: '' } ] }));
  });
  await p2.reload();
  await p2.addScriptTag({ content: BUNDLE });
  await p2.waitForTimeout(2500);
  await p2.evaluate(() => { document.querySelector('#hs_status').click(); });
  await p2.waitForTimeout(600);
  await p2.click('#hs_mgr_tabs button[data-t="split"]');
  await p2.waitForTimeout(1500);
  const rows = await p2.evaluate(() => ({ n: document.querySelectorAll('#hs_dev_pane .hs-devrow').length, off: document.querySelectorAll('#hs_dev_pane .hs-devrow.off').length }));
  t('离网设备保留在列表(2 在线 + 1 离线 = 3 行)', rows.n === 3);
  t('离网设备置灰(online:false)', rows.off === 1);
  await b2.close();

  console.log('----');
  console.log(fails ? (fails + ' 项失败') : 'ALL CLEAN');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
