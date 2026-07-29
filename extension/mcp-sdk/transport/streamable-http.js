'use strict';

/**
 * transport/streamable-http.js
 * Streamable HTTP 传输层
 *
 * MCP 规范定义的 HTTP 传输协议：
 *   - POST /mcp  — 发送 JSON-RPC 请求，接收 JSON-RPC 响应
 *   - GET /mcp  — 初始化握手（发送 initialize 请求）
 *   - GET /  — 健康检查 / 服务器信息
 *
 * 参考：https://modelcontextprotocol.io/specification/basic/transports
 */

const http = require('http');
const url = require('url');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-03-26', '2025-06-18']);

function createHttpTransport(dispatcher, options) {
    options = options || {};
    const port = options.port || 8080;
    const host = options.host || '127.0.0.1';
    const path = options.path || '/mcp';
    const protocolVersion = options.protocolVersion || DEFAULT_PROTOCOL_VERSION;
    const allowedOrigins = options.allowedOrigins || null;

    let server = null;

    function setCommonHeaders(res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', [
            'Authorization',
            'Content-Type',
            'Accept',
            'MCP-Protocol-Version',
            'Mcp-Session-Id',
            'Last-Event-ID',
        ].join(', '));
        res.setHeader('MCP-Protocol-Version', protocolVersion);
    }

    // ── 发送 JSON-RPC 响应的辅助函数 ─────────────────────────────
    function sendJson(res, statusCode, body) {
        const data = JSON.stringify(body);
        setCommonHeaders(res);
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
        });
        res.end(data);
    }

    function sendError(res, statusCode, code, message) {
        sendJson(res, statusCode, {
            jsonrpc: '2.0',
            error: { code, message },
            id: null,
        });
    }

    function sendAccepted(res) {
        setCommonHeaders(res);
        res.writeHead(202);
        res.end();
    }

    function isAllowedOrigin(req) {
        if (!allowedOrigins || allowedOrigins.length === 0) return true;
        const origin = req.headers.origin;
        if (!origin) return true;
        return allowedOrigins.includes(origin);
    }

    function hasCompatibleProtocolHeader(req) {
        const requested = req.headers['mcp-protocol-version'];
        if (!requested) return true;
        return SUPPORTED_PROTOCOL_VERSIONS.has(String(requested));
    }

    function isJsonRpcNotificationOrResponse(message) {
        if (Array.isArray(message)) {
            return message.length > 0 && message.every(isJsonRpcNotificationOrResponse);
        }
        if (!message || message.jsonrpc !== '2.0') return false;
        if (typeof message.method === 'string' && message.id === undefined) return true;
        return typeof message.method !== 'string' && (message.result !== undefined || message.error !== undefined);
    }

    async function dispatchMessage(message) {
        if (Array.isArray(message)) {
            const responses = [];
            for (const item of message) {
                const response = await dispatcher.dispatchAsync(item);
                if (response) responses.push(response);
            }
            return responses.length > 0 ? responses : null;
        }
        return dispatcher.dispatchAsync(message);
    }

    // ── 处理 POST /mcp ───────────────────────────────────────────
    async function handleMcpPost(req, res) {
        setCommonHeaders(res);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (!isAllowedOrigin(req)) {
            sendError(res, 403, -32600, 'Forbidden origin');
            return;
        }

        if (!hasCompatibleProtocolHeader(req)) {
            sendError(res, 400, -32600, 'Unsupported MCP-Protocol-Version');
            return;
        }

        if (req.method !== 'POST') {
            sendError(res, 405, -32600, 'Method not allowed, use POST');
            return;
        }

        // 读取 body
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            let reqJson;
            try {
                reqJson = JSON.parse(body);
            } catch (e) {
                sendError(res, 400, -32700, 'Parse error');
                return;
            }

            try {
                if (isJsonRpcNotificationOrResponse(reqJson)) {
                    sendAccepted(res);
                    return;
                }

                const resJson = await dispatchMessage(reqJson);
                if (resJson) {
                    sendJson(res, 200, resJson);
                } else {
                    sendAccepted(res);
                }
            } catch (err) {
                sendJson(res, 200, {
                    jsonrpc: '2.0',
                    id: reqJson.id || null,
                    error: { code: -32603, message: `Internal error: ${err.message}` },
                });
            }
        });
    }

    // ── 处理 GET /mcp（初始化握手）────────────────────────────────
    function handleMcpGet(req, res) {
        setCommonHeaders(res);

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // 返回服务器信息和可用端点说明
        sendJson(res, 200, {
            name: 'mcp-sdk-http-transport',
            version: '1.0.0',
            protocolVersion,
            endpoints: {
                'POST /mcp': 'Send JSON-RPC 2.0 request, receive JSON-RPC 2.0 response',
                'GET /mcp': 'Server info and endpoint documentation',
                'GET /': 'Health check',
            },
        });
    }

    // ── 启动 HTTP 服务器 ─────────────────────────────────────────
    function start() {
        server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url, true);

            // 路由分发
            if (parsedUrl.pathname === path && req.method === 'POST') {
                handleMcpPost(req, res);
            } else if (parsedUrl.pathname === path && req.method === 'GET') {
                handleMcpGet(req, res);
            } else if (parsedUrl.pathname === '/' && req.method === 'GET') {
                sendJson(res, 200, { status: 'ok', timestamp: Date.now() });
            } else {
                sendError(res, 404, -32600, `Not found: ${req.url}`);
            }
        });

        server.listen(port, host, () => {
            console.log(`[mcp-sdk] HTTP transport listening on http://${host}:${port}${path}`);
        });

        server.on('error', (err) => {
            console.error(`[mcp-sdk] HTTP server error: ${err.message}`);
        });

        return server;
    }

    function stop() {
        if (server) {
            server.close();
            server = null;
        }
    }

    return { start, stop, port, host, path };
}

module.exports = { createHttpTransport };
