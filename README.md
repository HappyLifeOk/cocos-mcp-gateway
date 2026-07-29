# Cocos MCP

面向 Codex、Claude Code 和其他 stdio MCP 客户端的全局 Cocos Creator
router、离线 Prefab CLI 与项目扩展快照。

## 目录

- `runtime/`：全局 router 与离线 `cocos-mcp-cli`
- `extension/`：供新 Cocos 项目安装的编辑器扩展快照
- `scripts/connect-project.js`：把扩展接入新项目，不覆盖已有扩展
- `scripts/sync-runtime.js`：从扩展源码同步 router、CLI 和项目扩展快照
- `skills/`：Codex 与 Claude 共用的项目绑定和操作规则

## 常用命令

```bash
# 接入新 Cocos 项目
cocos-mcp-connect /path/to/cocos-project

# 离线查询 Prefab
cocos-mcp-cli query /absolute/path/to/file.prefab --selector tree

# 从扩展源码更新共享快照
node scripts/sync-runtime.js /path/to/cc-3-8-x-mcp
```

## 客户端入口

Codex 通过本仓库的个人插件清单加载 `.mcp.json`。Claude Code 和其他 MCP
客户端连接：

```bash
node /Users/jeff/Documents/work/cocos-mcp/runtime/router/bin.js
```

各 Cocos 项目只负责运行 `extensions/cc-3-8-x-mcp` 编辑器扩展，并向
`~/.cocos-mcp/editors/` 注册自己的 `projectPath`、版本和 endpoint。
