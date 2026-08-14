# Cocos MCP Gateway 安装与使用

这份文档面向第一次使用 `cocos-mcp-gateway` 的开发者。完整接入包括三部分：

- `cocos-mcp-gateway`：Codex、Claude Code 等 AI 客户端连接的唯一 MCP Server。
- `cocos-mcp-control`：随客户端接入安装的 Skill，告诉 AI 如何选择项目、调用工具和完成修改后的刷新验证。
- `cc-3-8-x-mcp`：安装在 Cocos Creator 3.8.x 项目内的轻量 Editor Bridge。

不建议只复制 Skill。单独的 Skill 只有操作规则，没有 Gateway 和 Cocos 编辑器工具。

## 准备环境

- Node.js 18 或更高版本。
- Codex 或 Claude Code。
- Cocos Creator 3.8.x 项目。
- Git。

## 1. 安装 Gateway 和命令行工具

GitHub：

```bash
npm install -g git+https://github.com/HappyLifeOk/cocos-mcp-gateway.git
```

国内网络也可以使用 Gitee：

```bash
npm install -g git+https://gitee.com/Fu_Rao/cocos-mcp-gateway.git
```

安装后会得到以下命令：

- `cocos-mcp-gateway`：启动全局 MCP Gateway。
- `cocos-mcp-connect`：把 Editor Bridge 接入 Cocos Creator 3.8.x 项目。
- `cocos-mcp-cli`：离线查询或修改 Prefab、Animation。
- `cocos-mcp-setup-claude`：为 Claude Code 注册 MCP 并安装 Skill。

如果终端提示找不到命令，请重新打开终端，并确认 npm 的全局 bin 目录已经加入 `PATH`。

## 2. 接入 AI 客户端

只需要选择自己使用的平台，不需要同时安装 Codex 和 Claude Code。

### Codex

先把仓库添加为 Codex Marketplace：

```bash
codex plugin marketplace add HappyLifeOk/cocos-mcp-gateway --ref main
```

然后安装插件：

```bash
codex plugin add cocos-mcp@happylifeok-cocos
```

也可以在 Codex 中输入 `/plugins`，切换到 `HappyLifeOk Cocos Tools`，选择
`Cocos MCP Gateway` 安装。

插件会同时提供：

- `cocos` MCP Server。
- `cocos-mcp-control` Skill。

安装或升级后请新建一个 Codex 任务，让新任务重新加载 Skill 和 MCP 工具。

### Claude Code

执行：

```bash
cocos-mcp-setup-claude
```

该命令会自动：

1. 注册用户级 `cocos` MCP Server。
2. 把 `cocos-mcp-control` 安装到 Claude Code 的个人 Skill 目录。
3. 保留用户自己维护的同名 Skill，不会直接覆盖。

完成后重新打开 Claude Code，或者开始一个新会话。

可以运行下面的命令确认 MCP 已注册：

```bash
claude mcp list
```

## 3. 接入 Cocos Creator 项目

如果项目里已经有新版 `extensions/cc-3-8-x-mcp`，跳过这一步。

项目还没有扩展时执行：

```bash
cocos-mcp-connect "/你的/Cocos项目绝对路径"
```

Windows 示例：

```powershell
cocos-mcp-connect "D:\Projects\MyCocosGame"
```

命令只会接入 Cocos Creator 3.8.x 项目，不会覆盖已经存在的
`cc-3-8-x-mcp`。完成后打开或重启该项目的 Cocos Creator，等待扩展注册到
Gateway。

## 4. 开始使用

在 Cocos 项目目录中打开 Codex 或 Claude Code，然后直接用自然语言描述任务，例如：

```text
连接当前 Cocos 项目，检查编辑器是否在线。
```

```text
查询 assets/resources/ui/Home.prefab 的节点树。
```

```text
把 Home.prefab 里的 StartButton 向下移动 20 像素，刷新资源并验证预览。
```

```text
启动当前项目对应版本的 Cocos Creator，并等待编辑器就绪。
```

Codex 通常会根据任务自动启用 `cocos-mcp-control`。需要明确指定时，可以在提示词中写：

```text
使用 $cocos-mcp-control 连接并检查当前 Cocos 项目。
```

Skill 会要求 AI 先按当前工作区的绝对 `projectPath` 匹配编辑器，再选择对应工具，
避免多个项目同时打开时操作错项目。

## 5. 验证是否接入成功

向 Codex 或 Claude Code 发送：

```text
列出当前活跃的 Cocos 编辑器，并指出哪个实例与当前工作区匹配。
```

正常情况下应该看到当前项目的：

- 绝对 `projectPath`。
- Editor Bridge 在线状态。
- 带项目前缀的场景、资源和预览工具。

如果没有发现项目：

1. 确认 Cocos Creator 已经打开该项目。
2. 确认项目存在 `extensions/cc-3-8-x-mcp`。
3. 重启 Cocos Creator，等待扩展完成启动。
4. 新建 AI 会话后再次检查。

## 6. 更新

先重新安装最新版 Gateway：

```bash
npm install -g git+https://github.com/HappyLifeOk/cocos-mcp-gateway.git
```

Codex 用户继续执行：

```bash
codex plugin marketplace upgrade happylifeok-cocos
codex plugin add cocos-mcp@happylifeok-cocos
```

Claude Code 用户继续执行：

```bash
cocos-mcp-setup-claude
```

更新完成后重新打开客户端或新建会话。

## 常见问题

### 是否需要单独安装 Skill？

不需要。Codex 安装 `cocos-mcp` 插件时会带上 Skill；Claude Code 运行
`cocos-mcp-setup-claude` 时会自动复制 Skill。

### Codex 和 Claude Code 使用的是不同的 Gateway 吗？

不是。两者连接同一套 `cocos-mcp-gateway`，区别只在客户端的注册和 Skill 安装方式。

### 可以把项目扩展的 `/bridge` 地址直接注册成 MCP 吗？

不可以。`/bridge` 是项目扩展与 Gateway 之间的本机私有协议，AI 客户端只能连接
Gateway。

### 修改 Prefab 后为什么编辑器里没有变化？

离线写盘不会自动触发 Cocos 导入。让 AI 按 Skill 流程执行资源重导，并根据项目情况
刷新预览。

## 相关链接

- [cocos-mcp-gateway](https://github.com/HappyLifeOk/cocos-mcp-gateway)
- [cc-3-8-x-mcp](https://github.com/HappyLifeOk/cc-3-8-x-mcp)
- [OpenAI：Build skills](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI：Plugins](https://learn.chatgpt.com/docs/plugins)
