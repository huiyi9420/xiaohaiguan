/* v2.7.0 订阅节点过滤+多订阅融合 单元测试(Node 直跑,无浏览器依赖)
 * 运行: node tests/subfilter_test.js
 * 覆盖: 信息节点识别/中转排除/关键词/地区保留(无地区标识保留)/全滤光计数/
 *       正则生成(JS 预览与引擎 exclude-filter 同源)/normSubFilter 归一 */
import { buildSubExclude, buildSubInclude, previewSubFilter, normSubFilter, subRegionOf, extractNodeNames } from '../../src/订阅解析.js';

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('✅ ' + name) }
  else { fail++; console.log('❌ ' + name) }
}

/* ---- 样本数据(还原真实机场垃圾形态) ---- */
const NAMES = [
  '剩余流量：9.55 TB', '---', '到期时间：2026-10-28', '官网：dg.gg.com', '套餐到期：2026-11-01',
  '【香港】', '重置流量：每月 1 日', '流量: 9550GB/10000GB',
  '🇭🇰 香港 IEPL 01', '🇭🇰 香港·中转 02', '🇭🇰 香港 实验 05',
  '🇯🇵 日本 BGP 01', '🇯🇵 日本·中转 04',
  '🇸🇬 新加坡 BGP 01', '🇺🇸 美国 BGP 01', '🇰🇷 韩国 国内 02',
  '自建专线-Alpha', 'MY-HOME-NODE'
];

/* 1. normSubFilter 归一 */
const nf = normSubFilter(null);
t('归一: null→默认(info/transit 开,无关键词)', nf.autoInfo === true && nf.autoTransit === true && nf.kws.length === 0);
const nf2 = normSubFilter({ autoInfo: false, kws: ['a', ' ', 123, 'b'], regions: { '香港': false } });
t('归一: 非法关键词滤除+类型容忍', nf2.autoInfo === false && nf2.kws.length === 2 && nf2.regions['香港'] === false);

/* 2. v2.7.0 地区「其他」: 未识别节点(广州/自定义)归其他,勾掉即排除(用户产品决策) */
const others = ['广州移动 01', '自建专线-Alpha', 'MY-HOME-NODE', '🇭🇰 香港 BGP 03', '🇯🇵 日本 06'];
const fOther = normSubFilter({ autoInfo: false, autoTransit: false, kws: [], regions: { '香港': true, '日本': true, '其他': false } });
const pvOther = previewSubFilter(others, fOther);
t('其他: 未识别全排除(广州/自建/MY-HOME)', pvOther.region === 3 && pvOther.kept.length === 2, JSON.stringify(pvOther));
t('其他: 识别地区勾选保留(香港03/日本06)', pvOther.kept.includes('🇭🇰 香港 BGP 03') && pvOther.kept.includes('🇯🇵 日本 06'));
const inc1 = buildSubInclude(fOther);
t('include: 其他勾掉时生成地区白名单正则', inc1.includes('香港') && inc1.includes('日本') && /^\^/.test(inc1));
const fOtherKeep = normSubFilter({ autoInfo: false, autoTransit: false, kws: [], regions: { '香港': true, '日本': true, '其他': true } });
t('include: 其他勾选时无白名单(未识别保留)', buildSubInclude(fOtherKeep) === '');
const fAllOff = normSubFilter({ autoInfo: false, autoTransit: false, kws: [], regions: { '香港': false, '其他': false } });
t('其他: 已知全勾掉+其他勾掉=全滤(守卫拦截场景)', previewSubFilter(others, fAllOff).kept.length === 0);
const jsMis = others.filter(n => {
  const pvOne = previewSubFilter([n], fOther); const jsKept = pvOne.kept.length === 1;
  const exS = buildSubExclude(fOther); const exRe = exS ? new RegExp(exS) : null; /* 空串不建正则(空正则恒匹配是测试陷阱) */
  const inRe = new RegExp(inc1);
  const engineKept = !(exRe && exRe.test(n)) && inRe.test(n);
  return jsKept !== engineKept;
});
t('一致性: 其他模式下 JS 分类与引擎 exclude+include 同判 5/5', jsMis.length === 0);

/* 2.9 v2.7.8 手动覆盖层(keep/drop): 点胶囊切换去留 */
const fOv = normSubFilter({ autoInfo: true, autoTransit: false, kws: ['实验'], regions: {}, keep: ['官网：dg.gg.com'], drop: ['🇸🇬 新加坡 BGP 01'] });
const pvOv = previewSubFilter(NAMES, fOv);
t('覆盖: 手动保留(keep)救回被规则排除的官网节点', pvOv.over['官网：dg.gg.com'] === '+' && pvOv.kept.includes('官网：dg.gg.com'));
t('覆盖: 手动排除(drop)踢掉规则保留的新加坡', pvOv.over['🇸🇬 新加坡 BGP 01'] === '-' && !pvOv.kept.includes('🇸🇬 新加坡 BGP 01'));
t('覆盖: drop 计数独立分类', pvOv.drop === 1);
t('覆盖: 总数守恒(含drop)', pvOv.total === NAMES.length);
const fOv2 = normSubFilter({ autoInfo: true, autoTransit: false, kws: [], regions: {}, keep: ['剩余流量：9.55 TB'], drop: ['剩余流量：9.55 TB'] });
const pvOv2 = previewSubFilter(NAMES, fOv2);
t('覆盖: drop优先于keep(同在两表从严)', !pvOv2.kept.includes('剩余流量：9.55 TB') && pvOv2.over['剩余流量：9.55 TB'] === '-');
t('正则: drop进引擎exclude(手动排除兼容provider层)', buildSubExclude(fOv).includes('新加坡'));

/* 3. subRegionOf 地区识别 */
t('地区: 香港', subRegionOf('🇭🇰 香港 BGP 03') === '香港');
t('地区: 日本', subRegionOf('🇯🇵 东京 02') === '日本' || subRegionOf('🇯🇵 日本 06') === '日本');
t('地区: 无标识返回空', subRegionOf('自建专线-Alpha') === '');

/* 3. previewSubFilter 分类计数 */
const base = normSubFilter({ autoInfo: true, autoTransit: true, kws: ['实验'], regions: { '香港': true, '日本': true, '新加坡': true, '美国': false } });
const pv = previewSubFilter(NAMES, base);
t('预览: 信息节点计数=6+分隔符2(v2.7.2 拆分)', pv.info === 6 && pv.sep === 2, JSON.stringify(pv));
t('预览: 中转计数=3(香港中转+日本中转+韩国国内)', pv.transit === 3, JSON.stringify(pv));
t('预览: 关键词计数=1(实验05)', pv.kw === 1);
t('预览: 地区排除=1(美国BGP01)', pv.region === 1);
t('预览: 韩国"国内02"归中转不被地区重复计', pv.transit === 3 && NAMES.includes('🇰🇷 韩国 国内 02'));
t('预览: 保留列表含无地区标识节点', pv.kept.includes('🇸🇬 新加坡 BGP 01') && pv.kept.includes('自建专线-Alpha') && pv.kept.includes('MY-HOME-NODE'));
t('预览: 总数守恒', pv.total === NAMES.length && pv.total === pv.kept.length + pv.info + pv.sep + pv.transit + pv.kw + pv.region);

/* 4. 全滤光 */
const killAll = normSubFilter({ autoInfo: true, autoTransit: true, kws: [], regions: {} });
const pvAll = previewSubFilter(['剩余流量：1TB', '到期：明天'], killAll);
t('预览: 全部信息节点被滤光(kept=0)', pvAll.kept.length === 0 && pvAll.info === 2);

/* 5. buildSubExclude 正则生成 */
const ex = buildSubExclude(base);
t('正则: 生成非空且含关键词与地区', ex.length > 0 && ex.includes('实验') && ex.includes('美国'));
t('正则: 全默认(无kws无regions)仅信息+中转', buildSubExclude(normSubFilter({})).includes('剩余流量'));
t('正则: 全关返回空串', buildSubExclude(normSubFilter({ autoInfo: false, autoTransit: false, kws: [], regions: {} })) === '');
t('正则: 关键词元字符转义', buildSubExclude(normSubFilter({ autoInfo: false, autoTransit: false, kws: ['a.b*c'] })).includes('a\\.b\\*c'));

/* 6. 正则一致性: JS 预览判定与 buildSubExclude 生成的引擎正则对同样输入结果一致 */
const exRe = new RegExp(ex);
const misMatch = NAMES.filter(n => {
  const pvOne = previewSubFilter([n], base);
  const jsKept = pvOne.kept.length === 1;
  const reKept = !exRe.test(n);
  return jsKept !== reKept;
});
t('一致性: JS分类判定与总正则 18/18 同判', misMatch.length === 0, '不一致:' + misMatch.join(','));

/* 7. extractNodeNames */
const yamlTxt = 'proxies:\n  - {name: 香港01, type: ss, server: 1.2.3.4, port: 443}\n  - name: 日本02\n    type: vmess\n    server: 5.6.7.8\n    port: 443\nrules:\n  - MATCH,DIRECT\n';
const nm = extractNodeNames(yamlTxt);
t('提取: flow+block 两种 YAML 节点写法', nm.length === 2 && nm[0] === '香港01' && nm[1] === '日本02');
t('提取: 空/坏输入返回空数组', extractNodeNames('') .length === 0 && extractNodeNames('proxies: [broken').length === 0);

console.log('\n========== subfilter: pass=' + pass + ' fail=' + fail + ' ==========');
process.exit(fail ? 1 : 0);
