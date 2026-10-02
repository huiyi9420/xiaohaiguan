# 参与共建小海关

感谢关注！小海关的目标是让随身 WiFi 成为好用的代理网关，任何规模的贡献都有价值。

## 提交前

1. `node --check 插件开发/小海关/插件.js` 通过
2. `cd 插件开发/小海关/harness && npm install && node test_all.js` 七套全绿
3. 若改动影响用户可见行为：bump `const V` 修订号 + 同步 `CHANGELOG.md`（版本块）与 `使用说明.md`（变更表行）

## 约定

- 面向用户的文案/注释/提交信息均用中文
- 提交信息格式 `type: 描述`（feat/fix/ui/ux/docs/chore）
- 平台硬性规范（违反会被商店拒审或搞崩系统）：
  - 纯 `<script>` IIFE，零 `KANO_*` 标记、零旧包裹注释行
  - shell 一律 fetch 直连 `/api/run_shell`（common_headers + `credentials:'same-origin'`），不依赖/覆盖页面 `runShellWithRoot`
  - BusyBox 兼容：`pidof`+`kill`+复查 `-9`；禁 `pkill`/`timeout`/`ps -ef`
  - 数据只写 `/data/plugins/customs/`；自启只写 `/data/plugins/ufi_tools_boot.sh`（grep -qF 追加 / sed 唯一标识删除）；严禁碰 `/etc/rc.local` 与 `/data/ufi-tools/`
  - `/tmp` 是 tmpfs：只允许即用即删的小临时文件，禁止写日志
- JS 模板字符串内嵌 shell：`${var}` 写成 `\${`
- `innerHTML` 前一律过 `esc()`；设备/网络数据优先 `textContent`

## 好的第一步

- 补充诊断项（诊断页每个条目 = 现象 + 原因 + 建议）
- 分流规则/国内直通对账的边界场景
- 文档与使用说明的改进（尤其新用户视角）
- 回归测试用例补充（harness/tests/ 下每套一个主题）

## 报告问题

请附「一键诊断」导出的报告（可脱敏设备名/MAC），说明：插件版本、固件、做了什么操作、期望 vs 实际。
