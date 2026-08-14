'use strict';

/**
 * Cocos Editor Bridge
 *
 * 这是 Gateway 与 Cocos 编辑器扩展之间的本机私有 JSON-RPC 协议，不是 MCP Server。
 * MCP 握手、工具聚合和客户端兼容全部由全局 cocos-mcp-gateway 负责。
 */

var http = require('http');
var crypto = require('crypto');

var BRIDGE_API_VERSION = 1;
var DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

function textContent(text) {
    return { type: 'text', text: String(text) };
}

function wrapContent(result) {
    if (result === undefined || result === null) return [textContent('(ok)')];
    if (typeof result === 'string') return [textContent(result)];
    if (Array.isArray(result) && result[0] && result[0].type) return result;
    if (result && result.type && result.text !== undefined) return [result];
    return [textContent(JSON.stringify(result, null, 2))];
}

function normalizeToolResult(result) {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        var out = {};
        if (result.content !== undefined) out.content = result.content;
        if (result.structuredContent !== undefined) out.structuredContent = result.structuredContent;
        if (result._meta !== undefined) out._meta = result._meta;
        if (result.isError !== undefined) out.isError = result.isError;
        if (Object.keys(out).length > 0) {
            if (!out.content) out.content = wrapContent(out.structuredContent || '(ok)');
            return out;
        }
    }
    return { content: wrapContent(result) };
}

function toolSchema(tool) {
    var schema = {
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    };
    if (tool.outputSchema) schema.outputSchema = tool.outputSchema;
    if (tool.annotations) schema.annotations = tool.annotations;
    if (tool._meta) schema._meta = tool._meta;
    return schema;
}

function resourceSchema(resource) {
    return {
        uri: resource.uri,
        name: resource.name || resource.uri,
        description: resource.description || '',
        mimeType: resource.mimeType || 'text/plain',
    };
}

function safeTokenEquals(actual, token) {
    var actualBuffer = Buffer.from(String(actual || ''));
    var expectedBuffer = Buffer.from('Bearer ' + token);
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createEditorBridge(options) {
    options = options || {};
    var name = options.name || 'cocos-mcp-editor-bridge';
    var version = options.version || '1.0.0';
    var host = options.host || '127.0.0.1';
    var port = options.port === undefined ? 7523 : options.port;
    var bridgePath = options.path || '/bridge';
    var authToken = options.authToken || '';
    var tools = options.tools || [];
    var resources = options.resources || [];
    var maxBodyBytes = Number.isFinite(options.maxBodyBytes) && options.maxBodyBytes > 0
        ? Math.floor(options.maxBodyBytes)
        : DEFAULT_MAX_BODY_BYTES;
    var server = null;

    function response(id, result) {
        return { jsonrpc: '2.0', id: id, result: result };
    }

    function errorResponse(id, code, message) {
        return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: code, message: message } };
    }

    async function dispatch(message) {
        if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
            return errorResponse(message && message.id, -32600, 'Invalid Request');
        }

        var params = message.params || {};
        switch (message.method) {
            case 'bridge/ping':
                return response(message.id, { bridgeApiVersion: BRIDGE_API_VERSION });
            case 'bridge/describe':
                return response(message.id, {
                    bridgeApiVersion: BRIDGE_API_VERSION,
                    serverInfo: { name: name, version: version },
                    tools: tools.map(toolSchema),
                    resources: resources.map(resourceSchema),
                });
            case 'bridge/invoke': {
                if (!params.name) return errorResponse(message.id, -32602, 'Missing tool name');
                var tool = tools.find(function (item) { return item.name === params.name; });
                if (!tool) {
                    return response(message.id, {
                        content: [textContent('Tool not found: ' + params.name)],
                        isError: true,
                    });
                }
                try {
                    var result = await tool.handler(params.arguments || {});
                    return response(message.id, normalizeToolResult(result));
                } catch (e) {
                    return response(message.id, {
                        content: [textContent('[' + params.name + '] Error: ' + (e.message || e))],
                        isError: true,
                    });
                }
            }
            case 'bridge/read-resource': {
                if (!params.uri) return errorResponse(message.id, -32602, 'Missing resource uri');
                var resource = resources.find(function (item) { return item.uri === params.uri; });
                if (!resource) {
                    return response(message.id, {
                        contents: [textContent('Resource not found: ' + params.uri)],
                    });
                }
                try {
                    var data = await resource.read();
                    var text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                    return response(message.id, {
                        contents: [{
                            type: 'text',
                            text: text,
                            mimeType: resource.mimeType || 'text/plain',
                        }],
                    });
                } catch (e) {
                    return response(message.id, {
                        contents: [textContent('[' + params.uri + '] Error: ' + (e.message || e))],
                    });
                }
            }
            default:
                return errorResponse(message.id, -32601, 'Method not found: ' + message.method);
        }
    }

    function sendJson(res, statusCode, body) {
        var data = JSON.stringify(body);
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Cache-Control': 'no-store',
        });
        res.end(data);
    }

    function handle(req, res) {
        var pathname;
        try { pathname = new URL(req.url, 'http://127.0.0.1').pathname; }
        catch (e) { pathname = ''; }

        if (pathname === '/' && req.method === 'GET') {
            sendJson(res, 200, {
                status: 'ok',
                name: name,
                version: version,
                bridgeApiVersion: BRIDGE_API_VERSION,
            });
            return;
        }
        if (pathname !== bridgePath) {
            sendJson(res, 404, errorResponse(null, -32600, 'Not found'));
            return;
        }
        if (req.headers.origin) {
            sendJson(res, 403, errorResponse(null, -32600, 'Browser Origin is not allowed'));
            return;
        }
        if (!authToken || !safeTokenEquals(req.headers.authorization, authToken)) {
            sendJson(res, 401, errorResponse(null, -32001, 'Unauthorized'));
            return;
        }
        if (req.method !== 'POST') {
            sendJson(res, 405, errorResponse(null, -32600, 'Method not allowed, use POST'));
            return;
        }
        var contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
            sendJson(res, 415, errorResponse(null, -32600, 'Content-Type must be application/json'));
            return;
        }

        var chunks = [];
        var bodyBytes = 0;
        var bodyTooLarge = false;
        req.on('data', function (chunk) {
            bodyBytes += chunk.length;
            if (bodyBytes > maxBodyBytes) {
                bodyTooLarge = true;
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', function () {
            if (bodyTooLarge) {
                sendJson(res, 413, errorResponse(null, -32600, 'Request body exceeds ' + maxBodyBytes + ' bytes'));
                return;
            }
            var message;
            try { message = JSON.parse(Buffer.concat(chunks).toString('utf-8')); }
            catch (e) {
                sendJson(res, 400, errorResponse(null, -32700, 'Parse error'));
                return;
            }
            dispatch(message).then(function (result) {
                sendJson(res, 200, result);
            }).catch(function (e) {
                sendJson(res, 500, errorResponse(message.id, -32603, 'Internal error: ' + (e.message || e)));
            });
        });
    }

    function start() {
        if (server) return Promise.resolve(api);
        return new Promise(function (resolve, reject) {
            var candidate = http.createServer(handle);
            function onError(error) {
                candidate.removeListener('listening', onListening);
                reject(error);
            }
            function onListening() {
                candidate.removeListener('error', onError);
                candidate.on('error', function (error) {
                    console.error('[cocos-mcp-editor-bridge] HTTP server error:', error.message || error);
                });
                server = candidate;
                var address = server.address();
                if (address && typeof address === 'object') port = address.port;
                resolve(api);
            }
            candidate.once('error', onError);
            candidate.once('listening', onListening);
            candidate.listen(port, host);
        });
    }

    function stop() {
        if (!server) return Promise.resolve();
        var closing = server;
        server = null;
        return new Promise(function (resolve) {
            closing.close(function () { resolve(); });
        });
    }

    var api = {
        start: start,
        stop: stop,
        dispatch: dispatch,
        get host() { return host; },
        get port() { return port; },
        path: bridgePath,
        bridgeApiVersion: BRIDGE_API_VERSION,
    };
    return api;
}

module.exports = {
    BRIDGE_API_VERSION: BRIDGE_API_VERSION,
    createEditorBridge: createEditorBridge,
    normalizeToolResult: normalizeToolResult,
};
