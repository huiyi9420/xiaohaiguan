const { chromium } = require('playwright-core');
const { STUB_URL, EXE, SRC: PLUGIN_PATH } = require('../util');
const PLUGIN = require('fs').readFileSync(PLUGIN_PATH, 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const p = await browser.newPage({ viewport: { width: 430, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await p.goto(STUB_URL);
  await p.evaluate(() => { localStorage.setItem('hs_ov', JSON.stringify({ useSubConf: true })); localStorage.setItem('hs_run','0'); }); /* 旧字段:顺带验证 policySrc 迁移 */
  await p.reload();
  await p.addScriptTag({ content: PLUGIN });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const b = document.querySelector('#hs_btn_start'); if (b) b.click(); });
  let cfg = 'NOT_CAPTURED';
  for (let i = 0; i < 30; i++) { await p.waitForTimeout(2000); cfg = await p.evaluate(() => window.__lastCfg || ''); if (cfg) break; }
  const lines = cfg.split('\n');
  const idx = n => lines.findIndex(l => l.includes(n));
  const t = (n, ok) => console.log((ok ? '✅' : '❌') + ' ' + n);
  t('截获 config.yaml(直通,旧字段迁移成功)', cfg.length > 1000);
  t('订阅直通段存在', cfg.includes('订阅策略直通'));
  t('注入 GEOSITE,CN,DIRECT', cfg.includes('GEOSITE,CN,DIRECT'));
  t('注入 RULE-SET,china_ip,DIRECT', cfg.includes('RULE-SET,china_ip,DIRECT'));
  t('注入 china_ip rule-provider', /china_ip:\n    type: file/.test(cfg));
  t('排除清单最先', idx('example-corp.cn,DIRECT') < idx('services.googleapis.cn'));
  t('出海例外先于 GEOSITE,CN', idx('igamecj.com') >= 0 && idx('igamecj.com') < idx('GEOSITE,CN,DIRECT'));
  t('兜底直连先于订阅 GEOIP', idx('GEOSITE,CN,DIRECT') < idx('GEOIP,CN,DIRECT'));
  t('订阅 MATCH 最后兜底', idx('MATCH,良心云') > idx('GEOSITE,CN,DIRECT'));
  await browser.close();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
