# 小海关 (XiaoHaiGuan)

**UFI-TOOLS-ZWRT 面板的 Mihomo 可控代理插件** —— 一台随身 WiFi，全设备智能分流。

> 把随身 WiFi 变成家用路由器级别的代理网关：连上它 WiFi 的手机、电脑、平板**无需安装任何 App**，流量自动按规则分流——该走代理的走代理，该直连的直连。

[![Version](https://img.shields.io/badge/version-2.2.1-blue)](插件开发/小海关/CHANGELOG.md)
[![Platform](https://img.shields.io/badge/platform-UFI__TOOLS__ZWRT%201.0.0-orange)]()
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ 特性

- **零客户端接管** —— 透明代理（TPROXY v4/v6），连 WiFi 即生效，终端零配置
- **订阅管理** —— Clash 订阅一键导入，节点测速（HTTP 延迟 + UDP 可达性三态检测）
- **分设备线路** —— 每台设备可独立指定节点/线路，游戏机走低延迟、手机走日常
- **策略三态** —— 自建调度 / 合并模式（订阅节点+本地规则，国内直通兜底）/ 订阅直通
- **国内直通** —— chnroute IP 段内核态放行（ipset），国内流量不进代理引擎，速度零损耗
- **一键诊断** —— 14+ 项体检（进程/端口/接管链/DNS/泄露风险/资源），带修复建议
- **安全升级** —— 三件套版本烙印对账 + 升级失败自动回滚 + 配置事务（快照→验证→回退）
- **操作审计** —— 安装/订阅/规则操作日志常开，256KB 轮转

## 🚀 快速开始

1. 在 UFI-TOOLS-ZWRT 面板的插件商店安装小海关（或手动粘贴 `上架插件/小海关插件.txt` 内容到自定义头部）
2. 打开插件 → 点「📖 图文使用说明」跟随五步引导（安装内核 → 填订阅 → 启动 → 开接管 → 诊断）
3. 详见 [使用说明](插件开发/小海关/使用说明.md)

## 🧩 内核下载源

插件内置多级内核下载链（默认顺序，均可通过「自定义国内源」覆盖）：

```
自定义源(用户自填) → 网盘直链 → Gitee 镜像仓 → GitHub 直连 → 本地代理(引擎运行时) → gh-proxy.com
```

- Gitee 镜像仓: [shiyi0210/customs-kernel](https://gitee.com/shiyi0210/customs-kernel)（资产命名无 `mihomo-` 前缀，防封设计）
- 欢迎社区自建镜像：修改 `插件.js` 顶部 `GITEE_OWNER / GITEE_REPO / GH_PROXY` 常量即可

## 🗂 仓库结构

```
插件开发/小海关/
├── 插件.js          # 插件源码（单文件，纯 <script> IIFE，无构建依赖）
├── 使用说明.md      # 面向使用者的完整文档（含各版本变更记录）
├── CHANGELOG.md     # 版本索引（版本号 / commit / 一句话主题）
├── 构建发行版.sh    # 源码 → terser 压缩混淆 → 发行版（含商店审查门禁）
└── harness/         # 无头回归测试（playwright-core + 面板 stub，7 套测试）
```

## 🛠 开发

```sh
# 语法校验
node --check 插件开发/小海关/插件.js

# 构建发行版（依赖 node + npx terser）
sh 插件开发/小海关/构建发行版.sh

# 无头回归测试（首次先 cd harness && npm install）
cd 插件开发/小海关/harness && node test_all.js
```

### 参与共建

欢迎 PR！从小事开始：诊断项补充、分流规则优化、文档改进、UI 打磨、新机型适配问题反馈。

- 提交前请跑通 `harness` 七套测试
- 改版本号（`const V`）必须同步 `CHANGELOG.md` 与 `使用说明.md`
- 遵守 ZWRT 平台插件规范：纯 `<script>` IIFE、零 KANO 标记、shell 走 `/api/run_shell`、BusyBox 兼容（`pidof`+`kill`，禁 `pkill`/`timeout`）
- 平台踩坑记录见 [插件开发/ZWRT平台坑位实录.md](插件开发/ZWRT平台坑位实录.md)

## 📜 License

[MIT](LICENSE)
