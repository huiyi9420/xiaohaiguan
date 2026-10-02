/* 小海关 harness 串行总入口: node test_all.js(或 npm test)
   逐套跑 tests/ 下全部测试,stdio 直通实时输出;任一失败退出码非零 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.join(__dirname, 'tests');
const files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.js')).sort();

/* rebuild_test 截图落盘目录兜底 */
fs.mkdirSync('/tmp/protoshots', { recursive: true });

const failed = [];
for (const f of files) {
  console.log('\n========== ' + f + ' ==========');
  const r = spawnSync(process.execPath, [path.join(TESTS_DIR, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log('\n========== 汇总 ==========');
if (failed.length) {
  console.log(failed.length + ' 套失败: ' + failed.join(', '));
  process.exit(1);
}
console.log('全部通过(' + files.length + ' 套)');
