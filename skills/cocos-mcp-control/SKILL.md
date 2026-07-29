---
name: cocos-mcp-control
description: 连接和控制当前工作区对应的 Cocos Creator 项目。处理 Cocos 编辑器启动与状态、场景和 AssetDB 操作、预览刷新、Prefab 或 Anim 查询修改、多项目实例选择，以及 cocos-mcp-cli 使用时触发。
---

# Cocos MCP 控制

## 绑定当前项目

1. 从当前工作目录向上寻找同时包含 `assets/`、`settings/` 和 `package.json` 的项目根。
2. 调用 `router_list_editors`，用规范化后的绝对 `projectPath` 精确匹配当前项目。不要只凭工具前缀或项目名猜实例。
3. 匹配后使用该实例的 `<shortName>__*` 工具。多个项目同时打开时只操作当前项目。
4. 没有匹配实例时，读取项目 `package.json` 的 `creator.version`，调用 `editor_spawn`，显式传绝对 `projectPath` 和版本，再等待就绪。
5. 项目缺少 `extensions/cc-3-8-x-mcp` 时：若用户要求接入项目，运行 `cocos-mcp-connect <项目绝对路径>`；若当前任务未授权安装扩展，则停止并说明缺失。

## 选择入口

- `.prefab`、`.anim` 的结构化查询与修改：优先使用全局 `prefab_query`、`prefab_edit`、`prefab_batch`；路径必须为绝对路径。
- 场景运行态、AssetDB、预览和编辑器状态：使用当前项目带前缀的 MCP 工具。
- 浏览器中的真实交互：先用 MCP 获取预览 URL，再交给可用的浏览器工具。
- 纯文本源码和文档：使用普通文件工具，不走 Prefab CLI。

修改 Prefab 前先查询节点树或字段；批量修改先 dry-run；任一操作失败时不要绕过 CLI 直接改 JSON。

## 修改后的闭环

1. 单个资源修改后调用当前项目的 `asset_reimport`。
2. 多资源或依赖不确定时调用 `asset_refresh`，再调用 `preview_refresh_and_reload`。
3. 尊重项目自己的预览刷新守卫、服务端和测试账号约定。
4. 运行项目要求的类型检查或定向验证，并区分静态验证与真实预览验证。

## 安全边界

- 重启或关闭编辑器前先确认目标 `projectPath`；工具报告存在活跃调试连接时，不传 `force` 绕过。
- `editor_spawn`、`editor_restart`、`editor_wait_ready` 在编辑器未注册时必须显式传绝对项目路径。
- 工具行为、文档与实际不一致时报告插件问题，不在业务项目添加临时 workaround。
- 详细工具分工和失败排查见 [references/operations.md](references/operations.md)。
