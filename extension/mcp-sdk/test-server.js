'use strict';

/**
 * test-server.js — 用 mcp-sdk 写的测试 MCP Server
 * 验证 SDK 能正常工作
 */

const { createServer, tool, command, textContent } = require('./index');

const server = createServer({
    name: 'mcp-sdk-test',
    version: '1.0.0',
    tools: [
        tool('hello', '打招呼', { name: { type: 'string', description: '名字' } },
            async ({ name }) => textContent(`Hello, ${name || 'world'}!`)),

        tool('add', '两数相加', { a: { type: 'number' }, b: { type: 'number' } },
            async ({ a, b }) => textContent(String(a + b))),

        tool('echo', '原样返回输入', {},
            async (args) => textContent(JSON.stringify(args, null, 2))),

        command('ping', '心跳检测', async () => textContent('pong')),

        tool('time', '获取当前时间', {},
            async () => textContent(new Date().toISOString())),
    ],
    resources: [
        {
            uri: 'test://info',
            name: 'Test Server Info',
            description: '测试服务器信息',
            mimeType: 'application/json',
            read: async () => JSON.stringify({
                name: 'mcp-sdk-test',
                version: '1.0.0',
                uptime: process.uptime(),
            }, null, 2),
        },
    ],
});

console.log('Starting test MCP server...');
server.start();