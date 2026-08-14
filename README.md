# Cocos MCP

面向 Codex、Claude Code 和其他 stdio MCP 客户端的全局 Cocos Creator
router、离线 Prefab CLI 与项目扩展快照。

项目仍按原模式保留完整的 `extensions/cc-3-8-x-mcp`；全局仓只额外提供
Codex/Claude 的统一入口和可同步快照，不参与项目构建。

## 目录

- `runtime/`：全局 router 与离线 `cocos-mcp-cli`
- `extension/`：供新 Cocos 项目安装的编辑器扩展快照
- `scripts/connect-project.js`：把扩展接入新项目，不覆盖已有扩展
- `scripts/sync-runtime.js`：从扩展源码同步 router、CLI 和项目扩展快照
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

各 Cocos 项目只负责运行 `extensions/cc-3-8-x-mcp` 编辑器扩展，并向
`~/.cocos-mcp/editors/` 注册自己的 `projectPath`、版本、协议、loopback endpoint
和进程级随机鉴权 token。项目扩展是编辑器能力的源码真源；全局插件只负责
Codex 注册、实例发现、路由和同步快照。

不同开发者可以把全局仓和 Cocos 项目放在任意目录；安装时由 npm/客户端配置解析
本机实际路径，项目代码和构建流程始终只依赖项目内扩展。

## 0.2 网关升级

- Codex 侧 router 使用 MCP `2025-06-18`，连接旧项目扩展时可回退 `2025-03-26`。
- 注册记录目录收紧为 `0700`，带 token 的实例记录原子写入并收紧为 `0600`。
- router 只接受 `http://loopback:<port>/mcp`，向项目扩展转发 bearer token、协议头和可选 routing headers。
- 探活、普通 tool、资源读取和 Cocos 长操作使用分级超时。
- 项目 HTTP server 默认拒绝浏览器 Origin，限制 JSON body，并校验协议版本。

更新顺序允许滚动进行：先同步并重载某个项目扩展，再更新全局 router；新 router
可以同时连接 2.1.0 项目扩展和未升级的旧实例。
