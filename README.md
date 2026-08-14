# Cocos MCP Gateway

面向 Codex、Claude Code 和其他 stdio MCP 客户端的全局 Cocos Creator MCP
Gateway。它是系统中唯一的 MCP Server，负责多项目发现、工具聚合、路由、编辑器
生命周期和离线 Prefab CLI。

第一次使用请先阅读：[安装与使用指南](docs/getting-started.md)。

每个 Cocos Creator 3.8.x 项目只安装轻量 `cc-3-8-x-mcp`。扩展通过私有本机
`/bridge` 把 `Editor.Message` 能力交给 Gateway，不再运行项目级 MCP Server，
也不再依赖 `universal-mcp-sdk`。

## 目录

- `runtime/`：全局 MCP Gateway 与离线 `cocos-mcp-cli`
- `extension/`：供新 Cocos 项目安装的 Editor Bridge 扩展快照（不含 `mcp-sdk`）
- `scripts/connect-project.js`：把扩展接入新项目，不覆盖已有扩展
- `scripts/sync-runtime.js`：从扩展源码同步 Gateway runtime、CLI 和扩展快照
- `skills/`：Codex 与 Claude 共用的项目绑定和操作规则

## 常用命令

```bash
# 安装全局命令
npm link

# 接入新 Cocos 项目
cocos-mcp-connect /path/to/cocos-project

# 离线查询 Prefab
cocos-mcp-cli query /absolute/path/to/file.prefab --selector tree

# 从扩展源码更新共享快照
node scripts/sync-runtime.js /path/to/cc-3-8-x-mcp
```

## 客户端入口

Codex 通过本仓库的个人插件清单加载 `.mcp.json`。Claude Code 和其他 MCP
客户端可运行：

```bash
cocos-mcp-setup-claude
```

该命令会同时注册用户级 stdio MCP，并把仓库中的 `cocos-mcp-control` 安装到
Claude Code 的个人 Skill 目录。后续再次运行只更新由 Gateway 管理的副本；如果
用户已经维护了同名自定义 Skill，安装器会保留它并给出提示，不会覆盖。

各 Cocos Creator 3.8.x 项目只负责运行 `extensions/cc-3-8-x-mcp`，并向
`~/.cocos-mcp/editors/` 注册自己的 `projectPath`、Bridge 版本、loopback endpoint
和进程级随机鉴权 token。客户端永远只连接 Gateway，不能直接连接 `/bridge`。

不同开发者可以把全局仓和 Cocos 项目放在任意目录；安装时由 npm/客户端配置解析
本机实际路径，项目代码和构建流程始终只依赖项目内扩展。

## 0.3 新架构

```text
Codex / Claude Code / 其他 MCP 客户端
                  │ MCP over stdio
                  ▼
        全局 cocos-mcp-gateway
                  │ 私有 loopback /bridge + Bearer token
          ┌───────┴────────┐
          ▼                ▼
  Creator 3.8.x A   Creator 3.8.x B
   cc-3-8-x-mcp      cc-3-8-x-mcp
```

- Gateway 对客户端使用 MCP `2025-06-18`，项目扩展不再解析 MCP。
- Gateway 在 `initialize` 响应中返回跨客户端 `instructions`，统一项目路径绑定、
  Bridge 私有边界、Prefab 安全修改和编辑器生命周期约束。
- Gateway 每 15 秒发现活跃编辑器，统一聚合、加前缀并路由 tools/resources；
  编辑器变化时发送 `notifications/tools/list_changed`。
- 注册目录权限为 `0700`，带 token 的实例记录原子写入并限制为 `0600`。
- Gateway 只接受 `transport=editor-bridge`、Gateway API v2、Bridge API v1 和
  `http://loopback:<port>/bridge`。
- Editor Bridge 拒绝浏览器 Origin，只接受 JSON，请求体上限为 4 MiB，且每次启动
  都生成新的 32 字节随机 bearer token。
- 探活、普通 tool 和 Cocos 长操作默认分别使用 8 秒、60 秒和 180 秒超时。

## 升级前后对比

| 对比项 | 旧架构 | 0.3 新架构 | 实际收益 |
|---|---|---|---|
| MCP Server | 每个 Cocos 项目扩展各运行一套 | 只有全局 Gateway 运行 MCP Server | 客户端只维护一个稳定入口 |
| 项目扩展职责 | 同时处理 MCP、HTTP、Editor.Message | 只提供 Editor Bridge 与离线 CLI | 代码边界更清楚，编辑器侧更轻 |
| 共享依赖 | 每个项目携带 `universal-mcp-sdk` 子库 | SDK 已从运行链路移除 | 不再需要初始化、同步或排查嵌套子库 |
| 多项目发现 | Gateway 仍需与每个项目级 MCP Server 握手 | Gateway 直接发现并探测私有 Bridge | 少一层重复协议，聚合链路更直接 |
| 本机安全 | 项目 MCP endpoint 容易被当作客户端入口 | Bridge 仅限 loopback、随机 token、严格协议版本 | 降低误接入和本机跨进程误调用风险 |
| 生命周期 | endpoint 随项目和编辑器进程变化 | 编辑器自动注册，Gateway 统一处理启动、重启与等待就绪 | 多开和项目切换更稳定 |
| 版本演进 | MCP 能力与 Creator 扩展版本耦合 | Gateway API 与 Bridge API 独立版本化 | 后续可为其他 Creator 系列提供独立扩展并复用 Gateway |

## 这次升级带来的好处

1. **配置更简单**：Codex、Claude Code 等客户端只注册一次 Gateway，不再保存任何项目临时端口。
2. **项目更干净**：`cc-3-8-x-mcp` 保留 Creator 3.8.x 编辑器能力和 offline CLI，移除 `universal-mcp-sdk` 及其子库维护成本。
3. **多项目体验更统一**：工具继续使用 `<shortName>__<tool>` 隔离，Gateway 统一处理重名、重复实例和动态工具列表。
4. **故障边界更明确**：MCP 握手或客户端兼容问题查 Gateway；Cocos API 或场景/资源问题查 Editor Bridge。
5. **安全边界更严格**：Bridge 不是公开 MCP endpoint，也不会把 token 暴露到 tool 列表或诊断信息中。

## 不兼容升级说明

0.3 不兼容旧项目的 `/mcp` Server，也不保留旧协议 fallback。升级时需要：

1. 将所有 Cocos Creator 3.8.x 项目统一升级到新版 `cc-3-8-x-mcp`。
2. 删除客户端里直连某个项目 `/mcp` endpoint 的配置，只保留全局 Gateway。
3. 将旧的 `router_list_editors` 调用改为 `gateway_list_editors`。
4. 更新 Gateway 或 Codex plugin 后开启新会话，让客户端重新获取完整 tools 列表。

当前 `cc-3-8-x-mcp` 严格限制为 Cocos Creator `>=3.8.0 <3.9.0`。其他 Creator
系列应提供独立扩展包，共用同一套 Bridge 协议，而不是放宽该扩展的版本范围。

## 相关项目

- [cc-3-8-x-mcp](https://github.com/HappyLifeOk/cc-3-8-x-mcp)
