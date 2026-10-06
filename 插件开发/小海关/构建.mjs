import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { minify } from 'terser';
import { parse } from 'acorn';

const root = fileURLToPath(new URL('./', import.meta.url));
function validateScript(code, label) {
  parse(code, { ecmaVersion: 2020, sourceType: 'script' });
  if (/KANO_(?:PLUGIN|META)|^\/\/<script>|\/\/<\/script/im.test(code)) throw new Error(label + '含禁止的旧平台标记');
  if (/<\/script\b/i.test(code)) throw new Error(label + '含提前关闭script标签的内容');
}

export async function buildPlugin(debug) {
  const source = await fs.readFile(path.join(root, '插件.js'), 'utf8');
  const version = source.match(/^const V = '(\d+\.\d+\.\d+)';/m)?.[1];
  if (!version) throw new Error('构建失败：入口缺少三段式版本号');
  const result = await build({
    absWorkingDir: root, entryPoints: ['插件.js'], bundle: true,
    format: 'iife', platform: 'browser', target: 'es2020',
    charset: 'utf8', legalComments: 'none', banner: { js: '"use strict";' },
    outfile: '.build/插件.js', write: false, metafile: true,
    logLevel: 'silent'
  });
  if (result.warnings.length) throw new Error('构建警告：' + result.warnings.map(w => w.text).join('；'));
  if (result.outputFiles.length !== 1) throw new Error('构建失败：只能生成一个脚本');
  const output = Object.values(result.metafile.outputs);
  if (output.length !== 1 || output[0].imports.length) throw new Error('构建失败：产物存在外部模块依赖');
  const code = result.outputFiles[0].text;
  validateScript(code, '合并脚本');
  const compressed = await minify(code, { compress: { passes: 2 }, mangle: true, ecma: 2020 });
  if (!compressed.code) throw new Error('压缩失败：输出为空');
  validateScript(compressed.code, '压缩脚本');
  /* v2.9.59 控制台纪律: beta 构建注入 window.__HS_DEBUG__ 开关(调试日志 dbg 通道仅在 beta 产物输出);
     发行口径(--check/--release)不注入,且门禁扫描产物零 console.log——违者构建失败,机械保证发行版不拉屎 */
  const body = (debug ? 'window.__HS_DEBUG__=!0;\n' : '') + compressed.code;
  if (!debug && /console\.log\s*\(/.test(body)) throw new Error('构建失败：发行口径产物含 console.log 调试输出——请改用 dbg( 或 console.warn/error(报错类)');
  const txt = '<script>\n// 小海关 v' + version
    + ' — UFI-TOOLS-ZWRT 面板的 Mihomo 可控代理插件(透明接管/订阅/分设备线路/白名单门控)\n'
    + body + '\n</script>\n';
  return { code, minified: body, txt, version, debug: !!debug, metafile: result.metafile };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  if (!['--check', '--release', '--beta'].includes(mode) || process.argv.length !== 3) throw new Error('用法：node 构建.mjs --check|--release|--beta\n  --check   本地核验(发行口径,零调试输出,只写 .build)\n  --release 官方上架件(发行口径,零调试输出,写 上架插件/小海关插件.txt)\n  --beta    beta 产物(调试口径,注入 __HS_DEBUG__ 调试日志开,写 上架插件/小海关插件-<版本>beta.txt)');
  const result = await buildPlugin(mode === '--beta');
  const buildDir = path.join(root, '.build');
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(path.join(buildDir, '插件.js'), result.code);
  await fs.writeFile(path.join(buildDir, '小海关插件.txt'), result.txt);
  let destination;
  if (mode === '--release') {
    destination = path.resolve(root, '../../上架插件/小海关插件.txt');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, result.txt);
  } else if (mode === '--beta') {
    destination = path.resolve(root, '../../上架插件/小海关插件-' + result.version + 'beta.txt');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, result.txt);
  } else {
    destination = path.join(buildDir, '小海关插件.txt');
  }
  console.log('构建通过：v' + result.version + (result.debug ? '(beta 调试口径)' : '(发行口径·零调试输出)') + '，单文件、标准script包裹、无外部模块依赖');
  console.log('产物：' + destination);
  console.log('大小：' + Buffer.byteLength(result.txt) + ' 字节');
  console.log('SHA256：' + createHash('sha256').update(result.txt).digest('hex'));
}
