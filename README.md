# Cocos MCP

面向 Codex、Claude Code 和其他 stdio MCP 客户端的全局 Cocos Creator
router、离线 Prefab CLI 与项目接入工具。

项目侧编辑器扩展独立维护在
[`cocos-mcp-extension`](https://gitee.com/Fu_Rao/cocos-mcp-extension)。

## 组成

- `router/`：发现并聚合本机所有活跃 Cocos Creator 编辑器实例
- `cli/`：无需启动编辑器的 Prefab / Anim 查询与修改工具
- `skills/`：Codex 与 Claude 共用的项目绑定和操作规则
- `scripts/connect-project.js`：为 Cocos 项目添加扩展
- `scripts/setup-claude.js`：把当前仓库的 router 注册到 Claude 用户配置

## 安装

```bash
git clone https://gitee.com/Fu_Rao/cocos-mcp.git
cd cocos-mcp
npm link
```

安装后提供：

```text
cocos-mcp-router
cocos-mcp-cli
cocos-mcp-connect
cocos-mcp-setup-claude
```

### Codex

仓库包含标准 `.codex-plugin/plugin.json` 与 `.mcp.json`。通过 Codex
插件目录安装后，router 从插件根目录启动，不依赖仓库所在绝对路径。

### Claude Code

```bash
cocos-mcp-setup-claude
```

脚本运行时解析当前安装位置，只把本机绝对路径写入 Claude 用户配置，不会修改仓库文件。

## 接入 Cocos 项目

推荐使用 Git submodule：

```bash
cocos-mcp-connect /path/to/cocos-project
```

等价命令：

```bash
git submodule add \
  https://gitee.com/Fu_Rao/cocos-mcp-extension.git \
  extensions/cc-3-8-x-mcp
```

也可以从扩展仓库 Release 下载 ZIP，解压到项目的
`extensions/cc-3-8-x-mcp`。

项目扩展启动后会把运行时 `projectPath`、PID 和 HTTP endpoint 写入
`~/.cocos-mcp/editors/`。这些都是本机临时数据，不进入 Git；因此用户可以把客户端仓库
和 Cocos 项目放在任意位置。

## 常用命令

```bash
# 查看 Prefab 节点树
cocos-mcp-cli query /absolute/path/to/file.prefab --selector tree

# 预演批量修改
cocos-mcp-cli batch /absolute/path/to/file.prefab ops.json --dry-run

# 查看当前 router 入口
cocos-mcp-router
```

## 开发验证

```bash
npm test
```

涉及真实 Prefab 的集成测试不会提交项目资产。开发者可将自己的只读测试
Prefab 放到 `cli/test/fixtures/HomeUI.prefab` 后运行 `npm run test:fixture`。

## 许可证

Apache-2.0
