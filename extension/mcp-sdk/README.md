# universal-mcp-sdk

跨 Agent 的 MCP Server 开发套件。一次实现，多端接入。

**已实测接通：**

- **Claude Code** / **Cursor** — stdio 传输
- **Mavis** — streamable-http 传输
- **OpenAI / ChatGPT** — remote MCP（streamable-http，需公网 HTTPS `/mcp` 或 Secure MCP Tunnel）
- **任何 HTTP-based AI Agent** — streamable-http 传输

> OpenAI Responses API 与 ChatGPT Apps 侧接入时，`server_url` 必须是外部可访问的 HTTPS `/mcp` 端点；本机 `127.0.0.1` 只适合本地客户端或通过 Secure MCP Tunnel / ngrok / Cloudflare Tunnel 暴露。

---

## 安装

```bash
npm install universal-mcp-sdk
# 或直接复制本目录到你的项目
```

---

## 快速开始

```js
const { createServer, tool, textContent } = require('universal-mcp-sdk');

const server = createServer({
    name: 'my-first-mcp',
    version: '1.0.0',
    tools: [
        tool('hello', '打招呼', { name: { type: 'string' } },
            async ({ name }) => textContent(`Hello, ${name}!`)),
        tool('add', '两数相加', { a: { type: 'number' }, b: { type: 'number' } },
            async ({ a, b }) => textContent(String(a + b))),
    ],
    resources: [
        {
            uri: 'hello://greeting',
            name: 'Default Greeting',
            description: '默认问候语',
            mimeType: 'text/plain',
            read: async () => 'Hello World',
        },
    ],
});

server.start();
```

直接 `node your-server.js` 启动时，SDK 会自动检测运行环境：
- **TTY 终端**（交互式启动）→ stdio 模式
- **非 TTY / 后台服务**（默认）→ HTTP 模式，监听 `http://127.0.0.1:8080/mcp`

需要强制指定模式时：

```bash
node your-server.js --stdio          # 强制 stdio（Claude Code / Cursor 子进程）
node your-server.js --http           # 强制 HTTP
node your-server.js --http --port 9000  # HTTP + 指定端口
```

---

## 完整示例

```js
const {
    createServer,
    tool,
    command,
    staticResource,
    dynamicResource,
    textContent,
    errorContent,
    imageContentFromFile,
} = require('universal-mcp-sdk');

const server = createServer({
    name: 'my-mcp-server',
    version: '2.0.0',
    tools: [
        tool('scene_query_node', '查询场景节点',
            { uuid: { type: 'string' } },
            async ({ uuid }) => {
                const data = await queryNode(uuid);
                return textContent(JSON.stringify(data, null, 2));
            }
        ),
        tool('preview_screenshot', '截图预览页面',
            { path: { type: 'string' } },
            async ({ path }) => {
                const absPath = await captureScreenshot(path);
                return textContent(absPath);
            }
        ),
        command('preview_refresh', '刷新预览', async () => {
            await doRefresh();
            return textContent('ok');
        }),
    ],
    resources: [
        staticResource('project://info', 'Project Info',
            JSON.stringify({ name: 'MyGame', version: '1.0.0' })
        ),
        dynamicResource('scene://tree', 'Current Scene Tree', '当前场景节点树',
            async () => await querySceneTree()
        ),
    ],
});

server.start();
```

---

## 启动模式

| 模式 | 命令 | 适用场景 |
|------|------|---------|
| stdio | `node your-server.js --stdio` | Claude Code / Cursor（子进程） |
| http | `node your-server.js --http --port 8080` | Mavis / OpenAI / HTTP Agent（常驻服务），--port 真正生效 |
| auto | `node your-server.js` | 自动检测：TTY → stdio，否则 → HTTP |

---

## 接入协议（Wire Protocol）

任何客户端 / Agent 接入本 SDK 起的 server，都走 **MCP over JSON-RPC 2.0**，协议版本 `2024-11-05`。stdio 与 streamable-http 两种通道的**消息体格式完全一致**，区别只在传输方式。

### 握手顺序

```
client                                  server
  │── initialize ───────────────────────▶│  必须最先调，换取 protocolVersion / capabilities / serverInfo
  │◀──────────────────────── result ─────│
  │── notifications/initialized ────────▶│  (可选) 通知，无 id、无响应
  │── tools/list ───────────────────────▶│  枚举工具
  │◀──────────────────────── result ─────│
  │── tools/call {name, arguments} ─────▶│  调用工具
  │◀──────────────────────── result ─────│
```

### 方法表

| method | params | 响应 | 备注 |
|--------|--------|------|------|
| `initialize` | — | `{protocolVersion, capabilities, serverInfo}` | 握手，必须第一个调 |
| `notifications/initialized`（亦接受 `initialized`） | — | 无 | 通知，无 id 不回包 |
| `ping` | — | `{}` | 心跳 |
| `tools/list` | — | `{tools:[{name, description, inputSchema}]}` | 列工具 |
| `tools/call` | `{name, arguments}` | `{content:[…]}` | 调工具 |
| `resources/list` | — | `{resources:[{uri, name, description, mimeType}]}` | 列资源 |
| `resources/read` | `{uri}` | `{contents:[{type, text, mimeType}]}` | 读资源 |
| 自定义 method | 任意 | 由 `customHandlers` 返回 | 见 `createServer` 的 `customHandlers` |

> 调用任何业务方法前**必须先 `initialize`**；未知 method 一律返回 `-32601`。

### 消息格式

```jsonc
// 请求（带 id，要响应）
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hello","arguments":{"name":"world"}}}
// 通知（无 id，不响应）
{"jsonrpc":"2.0","method":"notifications/initialized"}
// 成功响应
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Hello, world!"}]}}
```

### 错误处理（分两层，接入方必须分清）

**① 协议级错误** —— 返回标准 JSON-RPC `error` 字段：

| code | 触发条件 |
|------|---------|
| `-32700` | body 不是合法 JSON（Parse error） |
| `-32600` | 不是合法 JSON-RPC 2.0（缺 `jsonrpc:"2.0"` / `method` 非字符串 / HTTP 用了非 POST 方法） |
| `-32601` | method 不存在 |
| `-32603` | 服务器内部异常 |

**② 工具执行错误** —— `tools/call` / `resources/read` 中 handler 抛异常、或 tool/resource 不存在时，**不返回协议 `error`**，而是返回**成功响应**，错误信息塞进 content、文本以 `[Error]` 开头：

```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"[Error] [hello] Error: something broke"}]}}
```

> 判断工具调用是否成功，看 `result.content[].text` 是否以 `[Error]` 开头——本实现用**文本前缀**标识工具错误，未使用 MCP 可选的 `isError` 字段。

### content block 类型

handler 返回值会被包成 content block 数组，可用类型：

| type | 结构 | 辅助函数 |
|------|------|---------|
| text | `{type:'text', text, mimeType?}` | `textContent(text, mimeType?)` |
| image | `{type:'image', data(base64), mimeType, width?, height?}` | `imageContent()` / `imageContentFromFile(path)` |
| audio | `{type:'audio', data(base64), mimeType}` | `audioContent()` |

handler 直接返回 string / object 时，SDK 自动包成 text（见下方 API 参考）。

### 两种传输通道

**stdio** —— 被 Agent 当子进程拉起（Claude Code / Cursor）：
- 每行一条 JSON-RPC 消息，`\n` 分隔 → 消息体必须是**单行 compact JSON**，中间不能有换行
- client 写 `stdin`，server 响应写 `stdout`（每条以 `\n` 结尾）；通知无响应
- `stderr` 仅用于日志，**不混 JSON-RPC**

**streamable-http** —— 常驻服务（Mavis / 任何 HTTP Agent）：

| 端点 | 方法 | 作用 |
|------|------|------|
| `/mcp` | `POST` | 主通道：body = JSON-RPC 请求，回 `200 application/json`；通知 → `204` 无 body |
| `/mcp` | `GET` | 返回 server 信息 + 端点说明（**注意：握手 `initialize` 走 POST，不是这个 GET**） |
| `/` | `GET` | 健康检查 `{status:"ok"}` |

- 所有端点开 **CORS**（`Access-Control-Allow-Origin: *`），浏览器 / 跨域客户端可直连，`OPTIONS` 预检回 `204`
- **无 session、无 SSE**：每个 POST 是独立的请求 / 响应，接入方不需要维护 session id

---

## 注册到不同 Agent

### Claude Code / Cursor

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "my-mcp": {
      "command": "node",
      "args": ["/path/to/your-server.js", "--stdio"]
    }
  }
}
```

### Mavis

在 `~/.mavis/mcp/mcp.json`（或项目 `.mavis/mcp/mcp.json`）添加：

```json
{
  "mcpServers": {
    "my-mcp": {
      "url": "http://127.0.0.1:8080/mcp",
      "type": "streamable-http",
      "env": {},
      "enabled": true,
      "description": "我的 MCP 服务"
    }
  }
}
```

### OpenAI Responses API / ChatGPT

OpenAI 侧使用 remote MCP 时，需要一个公网 HTTPS `/mcp` 地址。本地调试可先用 Secure MCP Tunnel、ngrok 或 Cloudflare Tunnel 把 `http://127.0.0.1:<port>/mcp` 暴露出去。

Responses API 示例：

```js
const OpenAI = require('openai');
const client = new OpenAI();

const resp = await client.responses.create({
    model: 'gpt-5.5',
    tools: [{
        type: 'mcp',
        server_label: 'my_mcp',
        server_description: 'My MCP server',
        server_url: 'https://your-domain.example/mcp',
        require_approval: 'always',
    }],
    input: 'Call a tool from my MCP server.',
});

console.log(resp.output_text);
```

ChatGPT Apps / Connectors 开发者模式里创建 connector 时，`Connector URL` 填同一个公网 HTTPS `/mcp` 地址。

### 其他 HTTP Agent

直接 POST 请求到 `http://127.0.0.1:8080/mcp`：

```bash
# 1) 握手 initialize（走 POST，不是 GET —— GET /mcp 只返回 server 信息）
curl -X POST http://127.0.0.1:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 2) 列工具
curl -X POST http://127.0.0.1:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# 3) 调用 tool
curl -X POST http://127.0.0.1:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"hello","arguments":{"name":"world"}}}'
```

---

## API 参考

### createServer(options)

| 选项 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 服务器名称 |
| `version` | string | 是 | 服务器版本 |
| `tools` | Array | 否 | tool 定义列表 |
| `resources` | Array | 否 | resource 定义列表 |
| `customHandlers` | object | 否 | 自定义 JSON-RPC 方法 |
| `port` | number | 否 | HTTP 模式端口，默认 8080 |
| `entryPoint` | string | 否 | 用于生成配置文件的入口路径 |

### tool(name, description, inputSchema, handler)

- `name`: 工具唯一标识，snake_case
- `description`: AI 靠这个理解工具用途
- `inputSchema`: JSON Schema（定义参数结构）
- `handler`: `async (args) => result`

handler 返回值会自动包装为 MCP content block：

| 返回类型 | 包装方式 |
|---------|---------|
| `string` | `textContent(text)` |
| `object` | `textContent(JSON.stringify(result))` |
| `Array` (content block) | 直接使用 |
| `undefined` / `null` | `textContent('(ok)')` |

### command(name, description, handler)

无参数工具的简写，内部调用 `tool()` 并传入空 `inputSchema`。

### staticResource(uri, name, text, mimeType)

静态文本 resource，每次 read 返回相同内容。

### dynamicResource(uri, name, description, readFn, mimeType)

动态 resource，每次 read 调用 `readFn()` 获取最新内容。

---

## 动态注册

```js
server.addTool({
    name: 'dynamic_tool',
    description: '运行时动态添加的工具',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent('dynamic!'),
});

server.addResource({
    uri: 'dynamic://resource',
    name: 'Dynamic Resource',
    description: '运行时添加',
    mimeType: 'text/plain',
    read: async () => 'fresh data',
});
```

---

## 配置生成

```js
server.printConfig();
```

输出 Claude Code 配置和 Mavis 配置，可直接复制使用。

---

## 文件结构

```
mcp-sdk/
├── index.js                    # 入口，createServer()
├── tool.js                     # tool 定义辅助
├── resource.js                 # resource 定义辅助
├── test-server.js              # 可运行的测试示例服务器
├── protocol/
│   ├── dispatcher.js           # JSON-RPC 2.0 核心分发
│   └── content.js              # content block 封装
├── transport/
│   ├── stdio.js                # Claude Code / Cursor 传输
│   └── streamable-http.js      # Mavis / HTTP Agent 传输
└── README.md
```

---

## License

Apache-2.0 — Copyright 2026 付饶. See [LICENSE](./LICENSE) for details.
