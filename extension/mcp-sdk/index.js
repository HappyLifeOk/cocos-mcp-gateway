'use strict';

/**
 * index.js — MCP SDK 入口
 *
 * 使用方式：
 *   const { createServer } = require('universal-mcp-sdk');
 *   const server = createServer({ name: 'my-mcp', version: '1.0.0', tools: [...], resources: [...] });
 *   server.start();
 */

const { createDispatcher } = require('./protocol/dispatcher');
const { createStdioTransport } = require('./transport/stdio');
const { createHttpTransport } = require('./transport/streamable-http');
const { createHttpTransport: createHttpTransportAlias } = require('./transport/streamable-http');
const { tool, command, tools } = require('./tool');
const { defineResource, staticResource, dynamicResource, resources } = require('./resource');
const { textContent, errorContent, imageContent, audioContent, imageContentFromFile, textLinesContent } = require('./protocol/content');

// ── 启动模式检测 ─────────────────────────────────────────────────
function detectMode() {
    const argv = process.argv;

    if (argv.includes('--stdio')) return 'stdio';
    if (argv.includes('--http')) return 'http';
    if (argv.includes('-s')) return 'stdio';

    // 自动检测：TTY 可用则 stdio（交互式），否则 HTTP（后台服务）
    if (process.stdin.isTTY) return 'stdio';

    // stdio 环境（有管道输入）或明确指定了 command
    // Claude Code / Cursor 启动时 stdin 不是 TTY 但有父进程
    // 如果是 pipe（stdin 可以读且非 TTY），走 stdio
    if (!process.stdout.isTTY && !process.stdin.isTTY) {
        // 非 TTY 环境，尝试检测是否在 pipe 模式
        // Claude Code / Cursor 会通过环境变量或命令行参数传递
        if (process.env.MCP_STDIO || process.env.CLAUDE_CODE || process.env.MCP_MODE === 'stdio') {
            return 'stdio';
        }
    }

    // 默认：HTTP（多 Agent 通用，最灵活）
    return 'http';
}

// ── 端口检测（避免冲突）─────────────────────────────────────────
function findAvailablePort(startPort = 8080, maxRetries = 20) {
    return new Promise((resolve) => {
        const net = require('net');
        let port = startPort;
        let retries = 0;

        function tryPort() {
            const sock = net.createConnection({ port, host: '127.0.0.1' });
            sock.on('connect', () => {
                sock.destroy();
                if (retries < maxRetries) {
                    port++;
                    retries++;
                    tryPort();
                } else {
                    resolve(startPort + 100);
                }
            });
            sock.on('error', () => {
                sock.destroy();
                resolve(port);
            });
        }
        tryPort();
    });
}

// ── 配置生成 ────────────────────────────────────────────────────
function generateMcpJson(serverPath, port) {
    return {
        mcpServers: {
            [serverPath.replace(/.*\//g, '').replace(/\.js$/, '')]: {
                command: 'node',
                args: [serverPath, '--stdio'],
                env: {},
            },
        },
    };
}

function generateMavisEntry(name, port) {
    return {
        [name]: {
            url: `http://127.0.0.1:${port}/mcp`,
            type: 'streamable-http',
            env: {},
            enabled: true,
            description: `MCP Server: ${name}`,
        },
    };
}

function generateOpenAIResponsesTool(name, serverUrl, options) {
    options = options || {};
    return {
        type: 'mcp',
        server_label: options.serverLabel || name,
        server_description: options.serverDescription || `MCP Server: ${name}`,
        server_url: serverUrl,
        require_approval: options.requireApproval || 'always',
    };
}

// ── createServer 主函数 ─────────────────────────────────────────
function createServer(options) {
    options = options || {};
    const name = options.name || 'mcp-sdk-server';
    const version = options.version || '1.0.0';
    const tools = options.tools || [];
    const resources = options.resources || [];
    const customHandlers = options.customHandlers || {};

    // 初始化 dispatcher
    const dispatcher = createDispatcher({
        name,
        version,
        protocolVersion: options.protocolVersion,
        tools,
        resources,
        customHandlers,
    });

    // 启动后的引用
    let stdioTransport = null;
    let httpTransport = null;

    // ── start() ──────────────────────────────────────────────────
    async function start(mode) {
        const actualMode = mode || detectMode();
        console.log(`[mcp-sdk] Starting in ${actualMode} mode...`);

        if (actualMode === 'stdio') {
            stdioTransport = createStdioTransport(dispatcher);
            stdioTransport.start();
            console.log(`[mcp-sdk] stdio transport started (ready for Claude Code / Cursor)`);
        } else {
            // 解析 --port 命令行参数，优先级：--port argv > options.port > 自动探测
            let startPort = options.port || 8080;
            const portArgIdx = process.argv.indexOf('--port');
            if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
                const parsed = parseInt(process.argv[portArgIdx + 1], 10);
                if (!isNaN(parsed)) startPort = parsed;
            }
            const port = await findAvailablePort(startPort);
            httpTransport = createHttpTransport(dispatcher, {
                port,
                host: options.host || '127.0.0.1',
                path: options.path || '/mcp',
                protocolVersion: options.protocolVersion,
                allowedOrigins: options.allowedOrigins,
            });
            httpTransport.start();
        }
    }

    // ── stop() ──────────────────────────────────────────────────
    function stop() {
        if (httpTransport) {
            httpTransport.stop();
            httpTransport = null;
        }
    }

    // ── addTool() — 运行时动态注册 tool ─────────────────────────
    function addTool(toolDef) {
        if (tools.find(t => t.name === toolDef.name)) {
            console.warn(`[mcp-sdk] Tool "${toolDef.name}" already registered, skipping.`);
            return;
        }
        tools.push(toolDef);
    }

    // ── addResource() — 运行时动态注册 resource ─────────────────
    function addResource(resourceDef) {
        if (resources.find(r => r.uri === resourceDef.uri)) {
            console.warn(`[mcp-sdk] Resource "${resourceDef.uri}" already registered, skipping.`);
            return;
        }
        resources.push(resourceDef);
    }

    // ── config 生成工具（供使用方复制粘贴）────────────────────────
    function printConfig() {
        const port = options.port || 8080;
        const entry = generateMcpJson(options.entryPoint || process.argv[1] || 'mcp-server.js', port);
        const mavisEntry = generateMavisEntry(name, port);
        const localMcpUrl = `http://127.0.0.1:${port}/mcp`;
        const openAIEntry = generateOpenAIResponsesTool(name, localMcpUrl);

        console.log('\n=== MCP Server Config ===\n');
        console.log('// Claude Code / Cursor (mcp.json)');
        console.log(JSON.stringify(entry, null, 2));
        console.log('\n// Mavis (~/.mavis/mcp/mcp.json)');
        console.log(JSON.stringify(mavisEntry, null, 2));
        console.log('\n// OpenAI Responses API (replace server_url with a public HTTPS /mcp URL or tunnel URL)');
        console.log(JSON.stringify(openAIEntry, null, 2));
        console.log('');
    }

    return {
        start,
        stop,
        addTool,
        addResource,
        dispatcher,   // 暴露，供高级用法
        tools,
        resources,
        printConfig,
        generateMcpJson,
        generateMavisEntry,
        generateOpenAIResponsesTool,
    };
}

module.exports = {
    createServer,
    // 工具定义辅助
    tool,
    command,
    tools,
    defineTool: tool,
    // 资源定义辅助
    defineResource,
    staticResource,
    dynamicResource,
    resources,
    // content 工具
    textContent,
    errorContent,
    imageContent,
    audioContent,
    imageContentFromFile,
    textLinesContent,
    // transport（供高级用法）
    createStdioTransport,
    createHttpTransport: createHttpTransportAlias,
    generateOpenAIResponsesTool,
    // 内部协议（供高级用法）
    createDispatcher,
};
