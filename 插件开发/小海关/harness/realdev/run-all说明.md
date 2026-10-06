# 小海关真机测试套件（realdev）执行说明

> 面向 root 的 Ego 浏览器操作手册。部署修复后插件到真机（U60Pro 随身 WiFi，面板
> `http://192.168.0.1:2333`，Mac 经设备 WiFi 连面板）后，按本文顺序执行。

## 运行方式（重要）

本套件在 **ego-browser 运行时**执行（提供 `taskSpace`/`page` 全局，页面内有
`common_headers` 签名头），**不是**普通 `node`。两种启动方式任选：

```sh
# 方式一：直接跑文件（推荐，import.meta.url 指向文件，产物路径自动解析）
ego-browser nodejs 插件开发/小海关/harness/realdev/phase1-readonly.mjs

# 方式二：heredoc 喂脚本（沙箱环境 heredoc 失效时用 -e）
ego-browser nodejs <<'EOF'
<粘贴 phase 脚本全文>
EOF
```

已登录管理页（root 会话）是 `/api/run_shell` 可用前提——请先在 Ego 浏览器里登录
`http://192.168.0.1:2333` 再执行。同一任务全程复用**同一个 TaskSpace**（首次运行会
打印 `spaceId`；后续运行用 `--space <spaceId>` 续跑同一页面与登录态）。

### 通用参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--confirm`（或 `HS_CONFIRM=1`） | 关 | phase2/3 有状态改变，必须显式确认 |
| `--interval <n>`（如 `300s`/`5m`） | `5m` | phase4 采样间隔 |
| `--duration <n>`（如 `1h`/`24h`） | `24h` | phase4 总时长 |
| `--panel <url>` | `http://192.168.0.1:2333` | 面板地址 |
| `--space <id或名>` | `小海关真机套件` | TaskSpace 复用 |
| `--label <l>` | `p1` | 页面标签 |

## 执行顺序与预期时长

| 阶段 | 文件 | 命令 | 是否改设备 | 预期时长 |
|---|---|---|---|---|
| 1 只读验证 | `phase1-readonly.mjs` | 直接跑 | **否（严格只读）** | 1–2 分钟 |
| 2 功能抽测 | `phase2-functional.mjs` | 默认 dry-run；`--confirm` 实跑 | 轻量（走一次出网流量） | 1–2 分钟 |
| 3 接管演练 | `phase3-drill.mjs` | 默认 dry-run；`--confirm` 实跑 | **是（摘除/重挂防火墙）** | 1–2 分钟 |
| 4 采样器 | `phase4-sampler.mjs` | 直接跑 | 否（只读采样） | 默认 24h，可 `--duration 5m` 试跑 |

## 断线预期点

- **phase3 是唯一预期闪断点**：`fw.sh clean`（摘除接管，通常恢复直连）与
  `fw.sh apply`（重挂接管）都会动设备防火墙，面板 HTTP 连接可能短暂中断。
- 基础座自动应对：`shellViaPanel` 每条命令失败最多重试 5 次（指数退避 1s/2s/4s/8s/16s），
  每次失败记 `network-flap`；`ensurePage` 页面失活时 goto 重连。phase3 报告会统计
  **断线次数（flapped）** 与 **恢复时间（recoveryMs 最大值）**。
- phase1/2/4 正常不应断线；若断线，日志里会有 `network-flap`/`reconnect-fail` 条目。

## 断线重跑（幂等）

- 所有阶段把进度写 `harness/artifacts/realdev-state.json`，每步完成即落盘
  （`phase/step/status/timestamp/lastError`）。
- 中途断线直接重跑同一命令即可：已完成的步会 `SKIP`，从未完成步续跑，不重复执行。

## 产物

| 文件 | 内容 |
|---|---|
| `harness/artifacts/realdev-state.json` | 阶段/步骤进度（断线续跑依据） |
| `harness/artifacts/realdev-log-<stamp>.ndjson` | 所有命令输出（脱敏：Bearer/长随机串/IP） |
| `harness/artifacts/真机阶段1-<stamp>.json` | 阶段1 报告（pass/fail/flapped） |
| `harness/artifacts/真机阶段2-<stamp>.json` | 阶段2 报告 |
| `harness/artifacts/真机阶段3-<stamp>.json` | 阶段3 报告（含断线次数/恢复时间） |
| `harness/artifacts/realdev-samples-<stamp>.ndjson` | 阶段4 采样明细 |
| `harness/artifacts/真机阶段4汇总-<stamp>.json` | 阶段4 汇总（min/max/avg/trend） |

## 回滚指引

测试后若需回到旧插件：

1. 手头保留的**旧插件 TXT**（商店发行版）即为回滚源。
2. 打开面板 → 插件商店 → **重装旧版**（商店覆盖写入）。
3. 若 phase3 之后发现接管异常：先 `sh /data/plugins/customs/fw.sh clean`（或面板「停止并还原」）
   摘除规则恢复直连，再重装旧版。
4. 重装后重跑 phase1 确认回到旧版基线。

## 阶段1 只读纪律说明（必须遵守）

- phase1 **不重载页面**：页面重载会触发插件 `init()` 的 `upgradeAudit`（超 3 天备份
  清理会 `rm -rf UBAK`+写 config.json）与「引擎未运行且规则残留」时的 `fwClean` 自愈，
  均属**设备写操作**，违反只读纪律。
- 因此 phase1 的「页面 console 错误捕获」退化为 **DOM 错误态检测**（初始化失败卡片 /
  重复加载警告 / 端口未就绪）+ **CDP Runtime/Log 事件**（仅捕获本阶段执行期间的页面错误），
  **不覆盖 init 时刻的历史 console**——如需 init 时刻 console，请在 phase2（允许改状态）里
  手动 `page.reload()` 后观察，或在报告中标注此项为「待人工确认」。
