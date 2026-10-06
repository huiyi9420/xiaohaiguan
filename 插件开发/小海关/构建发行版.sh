#!/bin/sh
# 模块源码合并、压缩并生成标准 <script> TXT；--check 只生成本地核验产物。
# 发版前同步版本号、CHANGELOG.md 与 使用说明.md；哈希只打印到终端。
set -eu
cd "$(dirname "$0")"
case "${1-}" in
  '') MODE=--release ;;
  --check) MODE=--check ;;
  *) echo '用法：sh 构建发行版.sh [--check]' >&2; exit 1 ;;
esac
[ "$#" -le 1 ] || { echo '构建失败：参数过多' >&2; exit 1; }
[ -d node_modules/esbuild ] && [ -d node_modules/terser ] && [ -d node_modules/acorn ] || {
  echo '构建失败：请先在小海关目录执行 npm ci --ignore-scripts' >&2
  exit 1
}
node 构建.mjs "$MODE"
