const { chromium } = require('playwright-core');
const { STUB_URL, EXE, SRC: PLUGIN_PATH } = require('../util');
const PLUGIN = require('fs').readFileSync(PLUGIN_PATH, 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const p = await browser.newPage({ viewport: { width: 392, height: 800 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await p.goto(STUB_URL);
  await p.evaluate(() => { localStorage.setItem('hs_run','1'); });
  await p.reload();
  await p.addScriptTag({ content: PLUGIN });
  await p.waitForTimeout(3000);
  await p.evaluate(() => { document.querySelector('#hs_status').click(); });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const b = document.querySelector('#hs_mf_restart'); if (b) b.click(); });
  let fw = 'NOT_CAPTURED';
  for (let i = 0; i < 40; i++) {  /* china6 下载自检可能耗时数十秒,轮询等 fw 落盘 */
    await p.waitForTimeout(2000);
    fw = await p.evaluate(() => window.__fwTxt || 'NOT_CAPTURED');
    if (fw !== 'NOT_CAPTURED') break;
  }
  require('fs').writeFileSync('/tmp/gen_fw.sh', fw);
  const t = (n, ok) => console.log((ok ? '✅' : '❌') + ' ' + n);
  t('截获 fw.sh', fw.length > 3000);
  t('内置三网大段兜底(240e/2408:8000/2409:8000)', fw.includes('240e::/20') && fw.includes('2408:8000::/20') && fw.includes('2409:8000::/20'));
  t('缺失告警(INFO 提示可补全)', fw.includes('v6国内表缺失'));
  t('hs_cn6 仍按 ipset 建(大段走同一条快车道)', fw.includes('ipset create hs_cn6') && fw.includes('for NET6 in $CN6'));
  t('v6 restore 行数校验', fw.includes('hs_cn6 灌入异常'));
  t('v4 restore 行数校验', fw.includes('hs_cn 灌入异常'));
  t('clean 规格无关清扫(grep -j HS_)', fw.includes('grep -F -- "-j HS_"') && fw.includes('${R#-A }'));
  /* v1.9.0 顺序回归断言: hs_cn6 挂载(-I -m set)之后不得再出现 -F HS_V6_LAN
     (1.8.9 及之前:fw_apply 后段二次 -N+-F 把 1271 行挂上的规则整链清空,用户设备实证 ipset 3443 条/规则 0 条) */
  const flCnt = (fw.match(/-F HS_V6_LAN/g) || []).length;
  const idxM = fw.indexOf('-I HS_V6_LAN 1 -m set');
  const idxF = fw.lastIndexOf('-F HS_V6_LAN');
  t('v6 挂载后无迟到清空(-F 顺序回归)', flCnt === 1 && idxM > -1 && idxF < idxM);
  const q = await p.evaluate(() => (window.__runQ || []).join('\n'));
  t('启动自检尝试下载 china6.txt', q.includes('china6.txt'));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
