#!/bin/sh
# 模块源码合并、压缩并生成标准 <script> TXT；--check 只生成本地核验产物(发行口径)；--beta 产 beta 调试产物。
# v2.9.59 控制台纪律: 发行/check 口径产物门禁保证零 console.log(调试走 dbg,仅 beta 注入开关输出)。
# 发版前同步版本号、CHANGELOG.md 与 使用说明.md；哈希只打印到终端。
set -eu
cd "$(dirname "$0")"
case "${1-}" in
  '') MODE=--release ;;
  --check) MODE=--check ;;
  --beta) MODE=--beta ;;
  *) echo '用法：sh 构建发行版.sh [--check|--beta]  # 无参=官方上架件(发行口径);--beta=beta 产物(调试日志开,自动命名 版本号beta.txt)' >&2; exit 1 ;;
esac
[ "$#" -le 1 ] || { echo '构建失败：参数过多' >&2; exit 1; }
[ -d node_modules/esbuild ] && [ -d node_modules/terser ] && [ -d node_modules/acorn ] || {
  echo '构建失败：请先在小海关目录执行 npm ci --ignore-scripts' >&2
  exit 1
}
node 构建.mjs "$MODE"
