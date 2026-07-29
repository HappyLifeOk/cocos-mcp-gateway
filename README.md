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
`~/.cocos-mcp/editors/` 注册自己的 `projectPath`、版本和 endpoint。

不同开发者可以把全局仓和 Cocos 项目放在任意目录；安装时由 npm/客户端配置解析
本机实际路径，项目代码和构建流程始终只依赖项目内扩展。
