# Cocos MCP 操作参考

## 工具分工

| 目标 | 入口 |
|---|---|
| 列出活跃编辑器 | `gateway_list_editors` |
| 启动、等待、重启、关闭编辑器 | `editor_spawn` / `editor_wait_ready` / `editor_restart` / `editor_kill` |
| 查询或批量修改 Prefab | `prefab_query` / `prefab_edit` / `prefab_batch` |
| 查询场景运行态节点 | `<shortName>__scene_query_node_tree` / `<shortName>__scene_query_node` |
| 修改运行态属性或执行组件方法 | `<shortName>__scene_set_property` / `<shortName>__scene_execute_component_method` |
| 查询和重导资源 | `<shortName>__asset_query_*` / `<shortName>__asset_reimport` |
| 获取或刷新预览 | `<shortName>__preview_query_url` / `<shortName>__preview_refresh_and_reload` |

## 项目识别

优先用当前工作区的真实绝对路径匹配注册项的 `projectPath`。符号链接路径需先规范化。同名项目或多个 worktree 不能只用 `shortName`。

编辑器未启动时：

1. 确认 Creator 版本为 3.8.x，且项目存在 `extensions/cc-3-8-x-mcp`。缺失时运行 `cocos-mcp-connect <项目绝对路径>`，该命令不会覆盖已有扩展。非 3.8.x 项目停止安装。
2. 从 `package.json` 读取 `creator.version`。
3. 调用 `editor_spawn`，传入绝对 `projectPath` 和 `version`。
4. 启动超时但检测到进程时，用 `editor_wait_ready` 等待，不重复启动。

## 常见失败

- 没有项目注册：编辑器未启动，或项目侧扩展未启用。
- 注册存在但 `/bridge` 不通：等待扩展完成启动；仍失败时由用户决定是否重启扩展或编辑器。不要把 Bridge 当成 MCP endpoint 直接调用。
- offline 修改后界面不变：直接写盘不会自动触发 Cocos 导入，必须重导资源并按项目约定刷新预览。
- 工具前缀变化：重新调用 `gateway_list_editors`，以当前返回的 `shortName` 为准。
- Prefab 修改报结构错误：停止修改，先查询节点、stub 和 override；禁止直接文本编辑 JSON 数组。
