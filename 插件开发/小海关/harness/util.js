/* 小海关 harness 公共路径解析:源码/stub/无头浏览器,供 tests/ 各套 require('../util') */
const path = require('path');
const fs = require('fs');
const os = require('os');

/* 插件源码: harness/../插件.js = 插件开发/小海关/插件.js */
const SRC = path.resolve(__dirname, '..', '插件.js');
/* 面板 stub(file URL,路径含中文须经 pathToFileURL 编码) */
const STUB_URL = require('url').pathToFileURL(path.resolve(__dirname, 'stub', 'hs_stub.html')).href;

/* 无头浏览器: 优先 HS_CHROME 环境变量,否则在 playwright 缓存里找 chrome-headless-shell */
function findChrome() {
  if (process.env.HS_CHROME) return process.env.HS_CHROME;
  const root = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  let vers = [];
  try { vers = fs.readdirSync(root).filter(d => /^chromium_headless_shell-/.test(d)).sort().reverse(); } catch (e) { return ''; }
  for (const v of vers) {
    const bin = walkBin(path.join(root, v), 4);
    if (bin) return bin;
  }
  return '';
}
function walkBin(dir, depth) {
  if (depth < 0) return '';
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return ''; }
  for (const e of ents) { if (e.isFile() && e.name === 'chrome-headless-shell') return path.join(dir, e.name); }
  for (const e of ents) { if (e.isDirectory()) { const r = walkBin(path.join(dir, e.name), depth - 1); if (r) return r; } }
  return '';
}

const EXE = findChrome();
if (!EXE) {
  throw new Error('未找到 chrome-headless-shell:请设置环境变量 HS_CHROME 指向可执行文件\n'
    + '(本机参考: ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell)');
}

module.exports = { SRC, STUB_URL, EXE };
