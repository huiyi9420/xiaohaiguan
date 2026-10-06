/* 一次性复现: 移动端(375px)节点过滤弹窗控件重叠 —— 只截图+几何测量,不断言 */
const { chromium } = require('playwright-core');
const { STUB_URL, EXE, SRC: PLUGIN_PATH } = require('../util');
const PLUGIN = require('fs').readFileSync(PLUGIN_PATH, 'utf8');

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const p = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(STUB_URL);
  await p.evaluate(() => { localStorage.setItem('hs_run', '1'); localStorage.removeItem('hs_ov'); });
  await p.reload();
  /* readiness 命令罐头(stub 未覆盖 v2.9.x 采集命令,拦截补齐,仅本复现用) */
  await p.evaluate(() => {
    const _f = window.fetch;
    window.fetch = function (u, o) {
      const body = (o && o.body) || '';
      if (String(body).indexOf('netstat') >= 0) {
        const b64 = t => btoa(unescape(encodeURIComponent(t)));
        const out = '=tcp=7890\n=tcp=7892\n=tcp=7893\n=tcp=1053\n=udp=1053\n=udp=7893\n=tcp=9090\n=SOCKETS=1\n=HTTP=200\n=EXIT=0\n';
        return Promise.resolve(new Response(JSON.stringify({ success: true, content: b64(out) }), { headers: { 'Content-Type': 'application/json' } }));
      }
      return _f.apply(this, arguments);
    };
  });
  await p.addScriptTag({ content: PLUGIN });
  await p.waitForTimeout(3000);
  /* 开面板 → 订阅页 */
  await p.click('#hs_status');
  await p.waitForTimeout(800);
  await p.evaluate(() => { const b = [...document.querySelectorAll('#hs_mgr_tabs button')].find(x => x.textContent.includes('订阅')); if (b) b.click(); });
  await p.waitForTimeout(400);
  /* 找 ⚙ 过滤 按钮(可能在编辑弹窗内,先看订阅页有哪些) */
  const flt = await p.$('[data-subflt]');
  if (!flt) {
    /* 订阅条目上的 编辑 按钮先打开编辑弹窗? 直接看页面快照 */
    await p.screenshot({ path: 'harness/artifacts/mob_订阅页.png', fullPage: false });
    console.log('订阅页无 [data-subflt] 按钮,已截订阅页');
    await browser.close(); return;
  }
  await flt.click();
  await p.waitForTimeout(800); /* 等 readFile 预览渲染 */
  await p.screenshot({ path: 'harness/artifacts/mob_过滤弹窗.png', fullPage: false });
  /* 几何测量: 弹窗内关键控件的位置,检测重叠(矩形相交) */
  const geo = await p.evaluate(() => {
    const body = document.getElementById('hs_modal_simple_body');
    const pick = sel => [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect();
      return { sel, txt: (el.textContent || '').slice(0, 18), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const items = [
      ...pick('.hs-mh .t'),
      ...pick('.hs-row'),
      ...pick('#hs_sf_kwin'),
      ...pick('.hs-tag'),
      ...pick('#hs_sf_pv > div:first-child'),
      ...pick('.hs-actions')
    ];
    /* 两两相交检测(容差 1px) */
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1 && !(a.sel === '.hs-tag' && b.sel === '.hs-tag') && !(a.sel === '.hs-row' && b.sel !== '.hs-row') && !(b.sel === '.hs-row' && a.sel !== '.hs-row'))
        overlaps.push(a.sel + '[' + a.txt + '] × ' + b.sel + '[' + b.txt + '] 交叠 ' + Math.round(ox) + 'x' + Math.round(oy));
    }
    const mdl = document.querySelector('.hs-modal').getBoundingClientRect();
    return { modal: { w: Math.round(mdl.width), h: Math.round(mdl.height) }, items, overlaps, bodyScroll: body.scrollHeight + '/' + body.clientHeight };
  });
  console.log(JSON.stringify(geo, null, 1));
  console.log('pageerrors:', errs.length ? errs : '无');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
